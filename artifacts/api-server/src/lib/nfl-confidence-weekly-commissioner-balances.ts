import { db } from "@workspace/db";
import {
  entriesTable,
  nflConfidenceResultsTable,
  pickemPicksTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { and, count, eq, sql } from "drizzle-orm";
import { calcPrize } from "./prizeCalc";
import { resolveSequentialTiebreaker } from "./tiebreaker";
import {
  applyWeeklyPickEmCommissionerLedgerPatch,
  loadWeeklyPickEmCommissionerPaidFlags,
  type WeeklyPickEmCommissionerLedgerPatch,
} from "./weekly-pickem-commissioner-ledger";

export type NflConfidenceWeeklyPeriodWinLine = {
  periodKey: string;
  label: string;
  amount: number;
};

export type NflConfidenceWeeklyBalancePlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  entryFeeOwed: number;
  weeklyWon: number;
  totalWon: number;
  netBalance: number;
  entryPaid: boolean;
  periodWins: NflConfidenceWeeklyPeriodWinLine[];
};

export type NflConfidenceWeeklyPeriodSummary = {
  periodKey: string;
  label: string;
  nflWeek: number;
  totalOwed: number;
  periodPaid: boolean;
};

export type NflConfidenceWeeklyCommissionerBalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
  memberCount: number;
  weeklyPickEmPayoutModel: null;
  weeklyBonusEnabled: boolean;
  poolIsActive: boolean;
  summary: {
    totalEntryExpected: number;
    totalWeeklyOwed: number;
    totalSeasonOwed: number;
    totalOwedToPlayers: number;
    netToCommissioner: number;
  };
  periods: Omit<NflConfidenceWeeklyPeriodSummary, "nflWeek">[];
  players: Array<NflConfidenceWeeklyBalancePlayer & { seasonPrizeWon: number }>;
};

export function nflConfidenceWeeklyPeriodKey(week: number): string {
  return `nfl-cw-week-${week}`;
}

export function isNflConfidenceWeeklyCommissionerBalancesPool(pool: {
  poolType: string;
  isRecurring?: boolean | null;
  entryFee: number | null;
}): boolean {
  if (pool.poolType !== "nfl_confidence_weekly") return false;
  if (pool.isRecurring !== true) return false;
  if (pool.entryFee == null || pool.entryFee <= 0) return false;
  return true;
}

async function isWeekFullyGraded(poolId: number, week: number): Promise<boolean> {
  const [pending] = await db
    .select({ id: pickemPicksTable.id })
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.week, week),
        eq(pickemPicksTable.result, "pending"),
      ),
    )
    .limit(1);
  if (pending) return false;

  const [{ totalPicks }] = await db
    .select({ totalPicks: count() })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week)));
  return Number(totalPicks) > 0;
}

/** Prize dollars owed per user for one completed NFL week (read-only; no entry writes). */
export async function computeNflConfidenceWeeklyWeekPrizeByUser(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  week: number,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!(await isWeekFullyGraded(poolId, week))) return out;

  const [resultsRow] = await db
    .select({
      actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
      actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
    })
    .from(nflConfidenceResultsTable)
    .where(and(eq(nflConfidenceResultsTable.poolId, poolId), eq(nflConfidenceResultsTable.week, week)))
    .limit(1);

  const actualPassingYards = resultsRow?.actualPassingYards ?? null;
  const actualRushingYards = resultsRow?.actualRushingYards ?? null;

  const scoreRows = await db
    .select({
      userId: pickemPicksTable.userId,
      points: sql<number>`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE(${pickemPicksTable.confidencePoints}::integer, 0) ELSE 0 END), 0)`,
    })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week)))
    .groupBy(pickemPicksTable.userId);

  const entryRows = await db
    .select({
      userId: entriesTable.userId,
      tiebreakerPassingYards: entriesTable.tiebreakerPassingYards,
      tiebreakerRushingYards: entriesTable.tiebreakerRushingYards,
    })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, poolId));

  const scoreMap = new Map(scoreRows.map((r) => [r.userId, Number(r.points)]));
  const players = entryRows.map((e) => ({
    userId: e.userId,
    points: scoreMap.get(e.userId) ?? 0,
    passingGuess: e.tiebreakerPassingYards ?? null,
    rushingGuess: e.tiebreakerRushingYards ?? null,
  }));
  players.sort((a, b) => b.points - a.points);

  const totalEntries = players.length;
  const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
  let positionOffset = 0;
  let i = 0;

  while (i < players.length) {
    let j = i + 1;
    while (j < players.length && players[j].points === players[i].points) j++;
    const group = players.slice(i, j);

    if (group.length === 1) {
      const prize = calcPrize({
        prizeStructure: ps,
        prizeMode: pool.prizeMode,
        entryFee: pool.entryFee,
        prizePot: pool.prizePot,
        totalEntries,
        maxEntries: pool.maxEntries,
        placeIndex: positionOffset,
        coWinners: 1,
      });
      if (prize > 0) out.set(group[0]!.userId, (out.get(group[0]!.userId) ?? 0) + prize);
      positionOffset += 1;
    } else {
      const primaryGuesses = new Map(group.map((p) => [p.userId, p.passingGuess]));
      const secondaryGuesses = new Map(group.map((p) => [p.userId, p.rushingGuess]));
      const winnerIds = resolveSequentialTiebreaker(
        group.map((p) => p.userId),
        primaryGuesses,
        secondaryGuesses,
        actualPassingYards,
        actualRushingYards,
      );

      if (winnerIds !== null) {
        const winners = group.filter((p) => winnerIds.has(p.userId));
        const losers = group.filter((p) => !winnerIds.has(p.userId));
        const winnerPrize = calcPrize({
          prizeStructure: ps,
          prizeMode: pool.prizeMode,
          entryFee: pool.entryFee,
          prizePot: pool.prizePot,
          totalEntries,
          maxEntries: pool.maxEntries,
          placeIndex: positionOffset,
          coWinners: winners.length,
        });
        for (const w of winners) {
          if (winnerPrize > 0) out.set(w.userId, (out.get(w.userId) ?? 0) + winnerPrize);
        }
        positionOffset += 1;
        if (losers.length > 0) {
          const loserPrize = calcPrize({
            prizeStructure: ps,
            prizeMode: pool.prizeMode,
            entryFee: pool.entryFee,
            prizePot: pool.prizePot,
            totalEntries,
            maxEntries: pool.maxEntries,
            placeIndex: positionOffset,
            coWinners: losers.length,
          });
          for (const l of losers) {
            if (loserPrize > 0) out.set(l.userId, (out.get(l.userId) ?? 0) + loserPrize);
          }
          positionOffset += 1;
        }
      } else {
        const prize = calcPrize({
          prizeStructure: ps,
          prizeMode: pool.prizeMode,
          entryFee: pool.entryFee,
          prizePot: pool.prizePot,
          totalEntries,
          maxEntries: pool.maxEntries,
          placeIndex: positionOffset,
          coWinners: group.length,
        });
        for (const p of group) {
          if (prize > 0) out.set(p.userId, (out.get(p.userId) ?? 0) + prize);
        }
        positionOffset += 1;
      }
    }
    i = j;
  }

  return out;
}

export async function buildNflConfidenceWeeklyCommissionerBalanceSheet(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<NflConfidenceWeeklyCommissionerBalanceSheet> {
  const paidFlags = await loadWeeklyPickEmCommissionerPaidFlags(poolId);

  const members = await db
    .select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
    })
    .from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId))
    .orderBy(usersTable.username);

  const entryFee = pool.entryFee ?? 0;
  const startWeek = pool.startWeek ?? 1;
  const winsByUser = new Map<number, NflConfidenceWeeklyPeriodWinLine[]>();
  const periods: NflConfidenceWeeklyPeriodSummary[] = [];

  for (let week = startWeek; week < pool.currentWeek; week++) {
    const prizeMap = await computeNflConfidenceWeeklyWeekPrizeByUser(pool, poolId, week);
    if (prizeMap.size === 0) continue;

    const periodKey = nflConfidenceWeeklyPeriodKey(week);
    const label = `Week ${week}`;
    let totalOwed = 0;
    for (const [userId, amount] of prizeMap) {
      if (amount <= 0) continue;
      totalOwed += amount;
      if (!winsByUser.has(userId)) winsByUser.set(userId, []);
      winsByUser.get(userId)!.push({ periodKey, label, amount });
    }
    if (totalOwed > 0) {
      periods.push({
        periodKey,
        label,
        nflWeek: week,
        totalOwed,
        periodPaid: paidFlags.periodPaidKeys.has(periodKey),
      });
    }
  }

  const players: NflConfidenceWeeklyBalancePlayer[] = members.map((m) => {
    const periodWins = winsByUser.get(m.userId) ?? [];
    const weeklyWon = periodWins.reduce((s, w) => s + w.amount, 0);
    const entryFeeOwed = entryFee;
    const totalWon = weeklyWon;
    const netBalance = entryFeeOwed - totalWon;
    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed,
      weeklyWon,
      totalWon,
      netBalance,
      entryPaid: paidFlags.entryPaidUserIds.has(m.userId),
      periodWins,
    };
  });

  const totalEntryExpected = entryFee * members.length;
  const totalWeeklyOwed = players.reduce((s, p) => s + p.weeklyWon, 0);

  return {
    poolId,
    poolName: pool.name,
    entryFee,
    memberCount: members.length,
    weeklyPickEmPayoutModel: null,
    weeklyBonusEnabled: false,
    poolIsActive: pool.isActive,
    summary: {
      totalEntryExpected,
      totalWeeklyOwed,
      totalSeasonOwed: 0,
      totalOwedToPlayers: totalWeeklyOwed,
      netToCommissioner: totalEntryExpected - totalWeeklyOwed,
    },
    periods: periods.map(({ nflWeek: _n, ...rest }) => rest),
    players: players.map((p) => ({ ...p, seasonPrizeWon: 0 })),
  };
}

export async function patchNflConfidenceWeeklyCommissionerLedger(
  poolId: number,
  patch: WeeklyPickEmCommissionerLedgerPatch,
): Promise<NflConfidenceWeeklyCommissionerBalanceSheet> {
  await applyWeeklyPickEmCommissionerLedgerPatch(poolId, patch);
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) throw new Error("Pool not found");
  return buildNflConfidenceWeeklyCommissionerBalanceSheet(pool, poolId);
}
