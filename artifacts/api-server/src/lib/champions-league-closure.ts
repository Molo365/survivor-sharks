import { db } from "@workspace/db";
import { entriesTable, pickemPicksTable, poolsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { fetchGamesForDateChecked, type EspnGame } from "./espn";
import {
  buildChampionsLeagueClosurePlan,
  resolveTerminalChampionsLeagueSlateForPool,
} from "./champions-league-closure-logic";

type PrizeStructure = Array<{ place: number; amount: number }> | null | undefined;

export interface ChampionsLeagueClosureResult {
  closureApplied: boolean;
  winnerCount: number;
}

interface ChampionsLeagueClosureOptions {
  poolId: number;
  pool: {
    isActive: boolean;
    season: number;
    createdAt: Date;
    prizeStructure: PrizeStructure;
    prizeMode: string | null;
    entryFee: number | null;
    prizePot: number | null;
    maxEntries: number | null;
  };
  games: EspnGame[];
  log: {
    info(obj: object, msg: string): void;
    warn(obj: object, msg?: string): void;
  };
}

const CHAMPIONS_LEAGUE_SEASON_CACHE_MS = 60 * 60 * 1000;
const CHAMPIONS_LEAGUE_SEASON_FAILURE_CACHE_MS = 60 * 1000;
const championsLeagueSeasonCache = new Map<
  number,
  { expiresAt: number; games: EspnGame[] | null }
>();

async function fetchChampionsLeagueCalendarYear(calendarYear: number): Promise<EspnGame[] | null> {
  const cached = championsLeagueSeasonCache.get(calendarYear);
  if (cached && cached.expiresAt > Date.now()) return cached.games;

  const games = await fetchGamesForDateChecked(
    "championsleague",
    String(calendarYear),
    2,
    true,
    1000,
  );
  championsLeagueSeasonCache.set(calendarYear, {
    expiresAt: Date.now() + (
      games === null
        ? CHAMPIONS_LEAGUE_SEASON_FAILURE_CACHE_MS
        : CHAMPIONS_LEAGUE_SEASON_CACHE_MS
    ),
    games,
  });
  return games;
}

async function resolveTerminalSlateForPool(
  opts: ChampionsLeagueClosureOptions,
): Promise<ReturnType<typeof resolveTerminalChampionsLeagueSlateForPool>> {
  const suppliedTerminal = resolveTerminalChampionsLeagueSlateForPool(
    opts.games,
    opts.pool,
  );
  if (suppliedTerminal) return suppliedTerminal;

  const calendarYears = [opts.pool.season, opts.pool.season + 1];
  const annualResults = await Promise.all(
    calendarYears.map((year) => fetchChampionsLeagueCalendarYear(year)),
  );
  const historicalGames = annualResults.flatMap((games) => games ?? []);
  const historicalTerminal = resolveTerminalChampionsLeagueSlateForPool(
    historicalGames,
    opts.pool,
  );

  if (!historicalTerminal && annualResults.some((games) => games === null)) {
    opts.log.warn(
      { poolId: opts.poolId, calendarYears },
      "Champions League Pick-Em closure: historical ESPN feed unavailable",
    );
  }

  return historicalTerminal;
}

/**
 * Close a Champions League Pick-Em after its single Final is complete and every
 * pool pick is settled. The active-pool update claims closure inside the same
 * transaction as standings writes, making repeated grading calls idempotent.
 */
export async function applyChampionsLeagueClosure(
  opts: ChampionsLeagueClosureOptions,
): Promise<ChampionsLeagueClosureResult> {
  if (!opts.pool.isActive) {
    return { closureApplied: false, winnerCount: 0 };
  }
  const terminalSlate = await resolveTerminalSlateForPool(opts);
  if (!terminalSlate) {
    return { closureApplied: false, winnerCount: 0 };
  }

  return db.transaction(async (tx) => {
    const [{ pendingCount }] = await tx
      .select({ pendingCount: sql<string>`COUNT(*)` })
      .from(pickemPicksTable)
      .where(
        and(
          eq(pickemPicksTable.poolId, opts.poolId),
          eq(pickemPicksTable.result, "pending"),
        ),
      );

    if (Number(pendingCount) > 0) {
      opts.log.info(
        { poolId: opts.poolId, pendingCount: Number(pendingCount) },
        "Champions League Pick-Em closure: pending picks remain",
      );
      return { closureApplied: false, winnerCount: 0 };
    }

    const [entryExists] = await tx
      .select({ id: entriesTable.id })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, opts.poolId))
      .limit(1);
    if (!entryExists) {
      opts.log.warn(
        { poolId: opts.poolId },
        "Champions League Pick-Em closure: no entries found",
      );
      return { closureApplied: false, winnerCount: 0 };
    }

    const claimed = await tx
      .update(poolsTable)
      .set({ isActive: false, endedAt: new Date() })
      .where(and(eq(poolsTable.id, opts.poolId), eq(poolsTable.isActive, true)))
      .returning({ id: poolsTable.id });

    if (claimed.length === 0) {
      return { closureApplied: false, winnerCount: 0 };
    }

    const [entryRows, scoreRows] = await Promise.all([
      tx
        .select({ userId: entriesTable.userId })
        .from(entriesTable)
        .where(eq(entriesTable.poolId, opts.poolId)),
      tx
        .select({
          userId: pickemPicksTable.userId,
          correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        })
        .from(pickemPicksTable)
        .where(eq(pickemPicksTable.poolId, opts.poolId))
        .groupBy(pickemPicksTable.userId),
    ]);

    const correctByUser = new Map(scoreRows.map((row) => [row.userId, Number(row.correct)]));
    const plan = buildChampionsLeagueClosurePlan(
      entryRows.map((entry) => ({
        userId: entry.userId,
        correct: correctByUser.get(entry.userId) ?? 0,
      })),
      opts.pool,
    );
    const winnerCount = plan[0]?.userIds.length ?? 0;

    await tx
      .update(entriesTable)
      .set({ finalWinner: false, finishPosition: null, prizeAmount: null })
      .where(eq(entriesTable.poolId, opts.poolId));

    for (const group of plan) {
      await tx
        .update(entriesTable)
        .set({
          finalWinner: group.finalWinner,
          finishPosition: group.finishPosition,
          ...(group.prizeAmount !== null ? { prizeAmount: group.prizeAmount } : {}),
        })
        .where(
          and(
            eq(entriesTable.poolId, opts.poolId),
            inArray(entriesTable.userId, group.userIds),
          ),
        );
    }

    opts.log.info(
      {
        poolId: opts.poolId,
        finalGameId: terminalSlate.games[0]!.id,
        winnerCount,
        winnerUserIds: plan[0]?.userIds ?? [],
      },
      "Champions League Pick-Em: Final settled and pool closed",
    );

    return { closureApplied: true, winnerCount };
  });
}