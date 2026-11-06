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
  resolveEntryWeeksCollected,
  type WeeklyPickEmCommissionerPaidFlags,
  type WeeklyPickEmCommissionerLedgerPatch,
} from "./weekly-pickem-commissioner-ledger";

function weeklyEntryDollars(entryFee: number, weekCount: number): number {
  if (entryFee <= 0 || weekCount <= 0) return 0;
  return entryFee * weekCount;
}

export type NflConfidenceWeeklyPeriodWinLine = {
  periodKey: string;
  label: string;
  amount: number;
};

export type NflConfidenceWeeklyBalancePlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  /** Same as entryFeeRemaining (legacy alias for shared UI). */
  entryFeeOwed: number;
  entryFeeTotal: number;
  entryFeeRemaining: number;
  entryWeeksCollected: number;
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
  /**
   * Entry billing periods: recurring = completed reload weeks (startWeek … currentWeek−1);
   * non-recurring = 1 (one buy-in for the contest).
   */
  completedWeekCount: number;
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
  if (pool.isRecurring !== true && pool.isRecurring !== false) return false;
  if (pool.entryFee == null || pool.entryFee <= 0) return false;
  return true;
}

/**
 * Recurring only: completed reload weeks (each owes another entry).
 * startWeek … currentWeek − 1.
 */
export function nflConfidenceWeeklyCompletedWeekCount(pool: {
  startWeek?: number | null;
  currentWeek: number;
}): number {
  const start = pool.startWeek ?? 1;
  return Math.max(0, pool.currentWeek - Math.max(1, start));
}

/**
 * Periods to bill entry for: reload count when recurring; exactly 1 when non-recurring (one-shot contest).
 */
export function nflConfidenceWeeklyEntryBillablePeriods(pool: {
  poolType: string;
  isRecurring?: boolean | null;
  entryFee: number | null;
  startWeek?: number | null;
  currentWeek: number;
}): number {
  if (pool.poolType !== "nfl_confidence_weekly") return 0;
  if (pool.entryFee == null || pool.entryFee <= 0) return 0;
  if (pool.isRecurring === true) {
    return nflConfidenceWeeklyCompletedWeekCount(pool);
  }
  if (pool.isRecurring === false) {
    return 1;
  }
  return 0;
}

/** Last week index (exclusive) for prize aggregation loops. */
function nflConfidenceWeeklyPrizeWeekEndExclusive(pool: typeof poolsTable.$inferSelect): number {
  if (pool.isRecurring === false) {
    if (pool.isActive) return pool.currentWeek;
    return pool.currentWeek + 1;
  }
  return pool.currentWeek;
}

export type NflConfidenceWeeklyPlayerWeeklyLedger = {
  completedWeekCount: number;
  entryFee: number;
  entryWeeksCollected: number;
  entryFeeTotal: number;
  entryFeeRemaining: number;
  weeklyWon: number;
  /** Positive = player owes commissioner; negative = commissioner owes player. */
  outstandingNet: number;
};

async function computeNflConfidenceWeeklyPeriodAggregates(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  startWeek: number,
  weekEndExclusive: number,
  paidFlags: WeeklyPickEmCommissionerPaidFlags,
): Promise<{
  winsByUser: Map<number, NflConfidenceWeeklyPeriodWinLine[]>;
  periods: NflConfidenceWeeklyPeriodSummary[];
}> {
  const winsByUser = new Map<number, NflConfidenceWeeklyPeriodWinLine[]>();
  const periods: NflConfidenceWeeklyPeriodSummary[] = [];

  for (let week = startWeek; week < weekEndExclusive; week++) {
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

  return { winsByUser, periods };
}

/** Read-only mirror of commissioner weekly balance for Profile → Balance. */
export async function getNflConfidenceWeeklyPlayerWeeklyLedger(
  pool: {
    poolType: string;
    isRecurring?: boolean | null;
    entryFee: number | null;
    startWeek?: number | null;
    currentWeek: number;
  },
  poolId: number,
  userId: number,
): Promise<NflConfidenceWeeklyPlayerWeeklyLedger | null> {
  if (!isNflConfidenceWeeklyCommissionerBalancesPool(pool)) return null;

  const [fullPool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!fullPool) return null;

  const paidFlags = await loadWeeklyPickEmCommissionerPaidFlags(poolId);
  const startWeek = fullPool.startWeek ?? 1;
  const entryFee = fullPool.entryFee ?? 0;
  const billablePeriods = nflConfidenceWeeklyEntryBillablePeriods(fullPool);
  const prizeEndExclusive = nflConfidenceWeeklyPrizeWeekEndExclusive(fullPool);

  const { winsByUser } = await computeNflConfidenceWeeklyPeriodAggregates(
    fullPool,
    poolId,
    startWeek,
    prizeEndExclusive,
    paidFlags,
  );

  const periodWins = winsByUser.get(userId) ?? [];
  const weeklyWon = periodWins.reduce((s, w) => s + w.amount, 0);
  const entryWeeksCollected = resolveEntryWeeksCollected(userId, billablePeriods, paidFlags);
  const entryFeeTotal = weeklyEntryDollars(entryFee, billablePeriods);
  const entryFeeRemaining = weeklyEntryDollars(
    entryFee,
    billablePeriods - entryWeeksCollected,
  );

  return {
    completedWeekCount: billablePeriods,
    entryFee,
    entryWeeksCollected,
    entryFeeTotal,
    entryFeeRemaining,
    weeklyWon,
    outstandingNet: entryFeeRemaining - weeklyWon,
  };
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
      const prizeDollars = prize ?? 0;
      if (prizeDollars > 0) out.set(group[0]!.userId, (out.get(group[0]!.userId) ?? 0) + prizeDollars);
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
        const winnerPrizeDollars = winnerPrize ?? 0;
        for (const w of winners) {
          if (winnerPrizeDollars > 0) out.set(w.userId, (out.get(w.userId) ?? 0) + winnerPrizeDollars);
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
          const loserPrizeDollars = loserPrize ?? 0;
          for (const l of losers) {
            if (loserPrizeDollars > 0) out.set(l.userId, (out.get(l.userId) ?? 0) + loserPrizeDollars);
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
        const prizeDollarsSplit = prize ?? 0;
        for (const p of group) {
          if (prizeDollarsSplit > 0) out.set(p.userId, (out.get(p.userId) ?? 0) + prizeDollarsSplit);
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
  const billablePeriods = nflConfidenceWeeklyEntryBillablePeriods(pool);
  const weeklyEntryPerPlayer = weeklyEntryDollars(entryFee, billablePeriods);
  const prizeEndExclusive = nflConfidenceWeeklyPrizeWeekEndExclusive(pool);

  const { winsByUser, periods } = await computeNflConfidenceWeeklyPeriodAggregates(
    pool,
    poolId,
    startWeek,
    prizeEndExclusive,
    paidFlags,
  );

  const players: NflConfidenceWeeklyBalancePlayer[] = members.map((m) => {
    const periodWins = winsByUser.get(m.userId) ?? [];
    const weeklyWon = periodWins.reduce((s, w) => s + w.amount, 0);
    const entryWeeksCollected = resolveEntryWeeksCollected(m.userId, billablePeriods, paidFlags);
    const entryFeeTotal = weeklyEntryPerPlayer;
    const entryFeeRemaining = weeklyEntryDollars(
      entryFee,
      billablePeriods - entryWeeksCollected,
    );
    const totalWon = weeklyWon;
    const netBalance = entryFeeRemaining - totalWon;
    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed: entryFeeRemaining,
      entryFeeTotal,
      entryFeeRemaining,
      entryWeeksCollected,
      weeklyWon,
      totalWon,
      netBalance,
      entryPaid: entryWeeksCollected >= billablePeriods && billablePeriods > 0,
      periodWins,
    };
  });

  const totalEntryExpected = weeklyEntryPerPlayer * members.length;
  const totalWeeklyOwed = players.reduce((s, p) => s + p.weeklyWon, 0);

  return {
    poolId,
    poolName: pool.name,
    entryFee,
    completedWeekCount: billablePeriods,
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
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) throw new Error("Pool not found");
  const maxEntryWeeks = nflConfidenceWeeklyEntryBillablePeriods(pool);
  await applyWeeklyPickEmCommissionerLedgerPatch(poolId, patch, { maxEntryWeeks });
  return buildNflConfidenceWeeklyCommissionerBalanceSheet(pool, poolId);
}
