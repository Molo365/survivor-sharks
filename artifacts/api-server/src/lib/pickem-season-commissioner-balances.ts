import { db } from "@workspace/db";
import {
  entriesTable,
  nflWeeklyTiebreakersTable,
  pickemPicksTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { resolveWeeklyBonusThreshold } from "./pool-start";
import { resolveWeeklyTiebreaker } from "./nfl-weekly-tiebreaker";
import { NFL_TOTAL_WEEKS } from "./pickem-season-closure";
import {
  loadWeeklyPickEmCommissionerPaidFlags,
  resolveEntryWeeksCollected,
} from "./weekly-pickem-commissioner-ledger";

export type WeeklyWinLine = { week: number; amount: number };

/** Stable key for weekly bonus payout ledger rows (shared `weekly_pick_em_period_paid` table). */
export function pickemSeasonWeeklyBonusPeriodKey(week: number): string {
  return `pickem-season-w${week}`;
}

/** Per-winner season (main pool) prize payout in `weekly_pick_em_period_paid`. */
export function pickemSeasonSeasonPrizePeriodKey(userId: number): string {
  return `pickem-season-prize-u${userId}`;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function seasonPrizeAmountFromEntry(prizeAmount: string | number | null): number {
  if (prizeAmount == null) return 0;
  const n = roundMoney(Number(prizeAmount));
  return n > 0 ? n : 0;
}

export type PickemSeasonWeeklyBonusPeriod = {
  periodKey: string;
  label: string;
  week: number;
  totalOwed: number;
  periodPaid: boolean;
};

export type WeeklyBonusWinBreakdown = {
  thresholdMet: boolean;
  winsByUser: Map<number, { total: number; weeks: WeeklyWinLine[] }>;
  /** One row per NFL week with a resolved weekly bonus winner. */
  bonusPeriods: Array<{ week: number; totalOwed: number }>;
};

function weeklyBonusOutstandingAmount(
  weeks: WeeklyWinLine[],
  periodPaidKeys: Set<string>,
): number {
  let s = 0;
  for (const w of weeks) {
    if (periodPaidKeys.has(pickemSeasonWeeklyBonusPeriodKey(w.week))) continue;
    s += w.amount;
  }
  return s;
}

export type CommissionerBalancePlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  /** Season entry still due (0 when commissioner marked collected in DB). */
  entryFeeOwed: number;
  entryPaid: boolean;
  /** Weekly bonus still owed (excludes weeks marked paid out). */
  weeklyBonusWon: number;
  /** Full season main-prize amount from pool closure (0 if none). */
  seasonPrizeAmount: number;
  seasonPrizePaid: boolean;
  /** Season main prize still owed (excludes marked paid out). */
  seasonPrizeWon: number;
  totalWon: number;
  /** Positive = player owes commissioner (entry remaining minus winnings). */
  netBalance: number;
  weeklyWins: WeeklyWinLine[];
};

export type CommissionerBalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
  memberCount: number;
  weeklyBonusEnabled: boolean;
  /** When weekly bonus is on: enrollment threshold for paying weekly prizes. */
  weeklyBonusThresholdMet: boolean;
  poolIsActive: boolean;
  weeklyBonusPeriods: PickemSeasonWeeklyBonusPeriod[];
  summary: {
    totalEntryExpected: number;
    /** Sum of entry fees marked collected (DB). */
    totalEntryCollected: number;
    totalWeeklyOwed: number;
    totalSeasonOwed: number;
    totalOwedToPlayers: number;
    netToCommissioner: number;
  };
  players: CommissionerBalancePlayer[];
};

async function weeklyBonusWinBreakdownForPool(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<WeeklyBonusWinBreakdown> {
  const winsByUser = new Map<number, { total: number; weeks: WeeklyWinLine[] }>();
  const bonusPeriods: Array<{ week: number; totalOwed: number }> = [];

  if (!pool.weeklyBonusEnabled || pool.weeklyBonusAmount == null) {
    return { thresholdMet: false, winsByUser, bonusPeriods };
  }

  const weeklyBonusAmount = Number(pool.weeklyBonusAmount);
  const [{ playerCount }] = await db
    .select({ playerCount: sql<string>`COUNT(*)` })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, poolId));

  const enrolled = Number(playerCount);
  const thresholdMet = resolveWeeklyBonusThreshold({
    poolType: pool.poolType,
    weeklyBonusEnabled: true,
    weeklyBonusMinPlayers: pool.weeklyBonusMinPlayers,
    playerCount: enrolled,
    isResolved: true,
    persistedThreshold: pool.weeklyBonusLockedActive,
  });

  if (!thresholdMet) {
    return { thresholdMet: false, winsByUser, bonusPeriods };
  }

  const weekRows = await db
    .select({ week: pickemPicksTable.week })
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        sql`${pickemPicksTable.result} IN ('correct', 'incorrect')`,
      ),
    )
    .groupBy(pickemPicksTable.week);

  const lastResolvableWeek = pool.isActive ? pool.currentWeek - 1 : NFL_TOTAL_WEEKS;

  for (const { week } of weekRows) {
    if (week > lastResolvableWeek || week < 1) continue;

    const correctByUser = await db
      .select({
        userId: pickemPicksTable.userId,
        correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
      })
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week)))
      .groupBy(pickemPicksTable.userId);

    if (correctByUser.length === 0) continue;

    const maxCorrect = Math.max(...correctByUser.map((r) => Number(r.correct)));
    if (maxCorrect <= 0) continue;

    const scoreWinners = correctByUser
      .filter((r) => Number(r.correct) === maxCorrect)
      .map((r) => ({ userId: r.userId }));

    const weeklyTiebreakerRows =
      scoreWinners.length > 1
        ? await db
            .select({
              userId: nflWeeklyTiebreakersTable.userId,
              guess: nflWeeklyTiebreakersTable.guess,
              actual: nflWeeklyTiebreakersTable.actual,
            })
            .from(nflWeeklyTiebreakersTable)
            .where(
              and(
                eq(nflWeeklyTiebreakersTable.poolId, poolId),
                eq(nflWeeklyTiebreakersTable.week, week),
                inArray(
                  nflWeeklyTiebreakersTable.userId,
                  scoreWinners.map((w) => w.userId),
                ),
              ),
            )
        : [];

    const resolution = resolveWeeklyTiebreaker(scoreWinners, weeklyTiebreakerRows);
    if (resolution.status === "pending" || resolution.winners.length === 0) continue;

    const perWinner = Math.round((weeklyBonusAmount / resolution.winners.length) * 100) / 100;
    if (perWinner <= 0) continue;
    const weekTotal = Math.round(perWinner * resolution.winners.length * 100) / 100;
    bonusPeriods.push({ week, totalOwed: weekTotal });
    for (const winner of resolution.winners) {
      const uid = winner.userId;
      if (!winsByUser.has(uid)) winsByUser.set(uid, { total: 0, weeks: [] });
      const row = winsByUser.get(uid)!;
      row.total += perWinner;
      row.weeks.push({ week, amount: perWinner });
    }
  }

  bonusPeriods.sort((a, b) => a.week - b.week);
  return { thresholdMet: true, winsByUser, bonusPeriods };
}

/** NFL Pick-Em Season: one season buy-in per player (same ledger row semantics as weekly pick-em cap 1). */
const PICKEM_SEASON_ENTRY_UNITS = 1;

export async function buildPickemSeasonCommissionerBalanceSheet(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<CommissionerBalanceSheet> {
  const paidFlags = await loadWeeklyPickEmCommissionerPaidFlags(poolId);

  const members = await db
    .select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      prizeAmount: entriesTable.prizeAmount,
    })
    .from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId))
    .orderBy(usersTable.username);

  const entryFee = pool.entryFee ?? 0;
  const weeklyBreakdown = await weeklyBonusWinBreakdownForPool(pool, poolId);
  const weeklyBonusPeriods: PickemSeasonWeeklyBonusPeriod[] = weeklyBreakdown.bonusPeriods.map(
    (p) => ({
      periodKey: pickemSeasonWeeklyBonusPeriodKey(p.week),
      label: `Week ${p.week}`,
      week: p.week,
      totalOwed: p.totalOwed,
      periodPaid: paidFlags.periodPaidKeys.has(pickemSeasonWeeklyBonusPeriodKey(p.week)),
    }),
  );

  const players: CommissionerBalancePlayer[] = members.map((m) => {
    const weekly = weeklyBreakdown.winsByUser.get(m.userId);
    const weeklyBonusWon = weekly
      ? weeklyBonusOutstandingAmount(weekly.weeks, paidFlags.periodPaidKeys)
      : 0;
    const seasonPrizeAmount = seasonPrizeAmountFromEntry(m.prizeAmount);
    const seasonPrizePaid =
      seasonPrizeAmount > 0
      && paidFlags.periodPaidKeys.has(pickemSeasonSeasonPrizePeriodKey(m.userId));
    const seasonPrizeWon = seasonPrizePaid ? 0 : seasonPrizeAmount;
    const totalWon = weeklyBonusWon + seasonPrizeWon;
    const unitsCollected = resolveEntryWeeksCollected(
      m.userId,
      PICKEM_SEASON_ENTRY_UNITS,
      paidFlags,
    );
    const entryPaid = unitsCollected >= PICKEM_SEASON_ENTRY_UNITS && entryFee > 0;
    const entryFeeOwed =
      entryFee > 0 ? Math.max(0, entryFee * (PICKEM_SEASON_ENTRY_UNITS - unitsCollected)) : 0;
    const netBalance = entryFeeOwed - totalWon;

    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed,
      entryPaid,
      weeklyBonusWon,
      seasonPrizeAmount,
      seasonPrizePaid,
      seasonPrizeWon,
      totalWon,
      netBalance,
      weeklyWins: weekly?.weeks ?? [],
    };
  });

  const totalEntryExpected = entryFee * members.length;
  const totalEntryCollected = players.reduce(
    (s, p) => s + (entryFee > 0 ? entryFee - p.entryFeeOwed : 0),
    0,
  );
  const totalWeeklyOwed = players.reduce((s, p) => s + p.weeklyBonusWon, 0);
  const totalSeasonOwed = players.reduce((s, p) => s + p.seasonPrizeWon, 0);
  const totalOwedToPlayers = totalWeeklyOwed + totalSeasonOwed;
  const netToCommissioner = totalEntryCollected - totalOwedToPlayers;

  return {
    poolId,
    poolName: pool.name,
    entryFee,
    memberCount: members.length,
    weeklyBonusEnabled: pool.weeklyBonusEnabled,
    weeklyBonusThresholdMet: weeklyBreakdown.thresholdMet,
    poolIsActive: pool.isActive,
    weeklyBonusPeriods,
    summary: {
      totalEntryExpected,
      totalEntryCollected,
      totalWeeklyOwed,
      totalSeasonOwed,
      totalOwedToPlayers,
      netToCommissioner,
    },
    players,
  };
}

export type PickemSeasonPlayerWeeklyLedger = {
  completedWeekCount: number;
  entryFee: number;
  entryWeeksCollected: number;
  entryFeeTotal: number;
  entryFeeRemaining: number;
  weeklyWon: number;
  outstandingNet: number;
};

/** Profile balance: NFL pick-em season entry collection vs weekly bonus + season prize. */
export async function getPickemSeasonPlayerWeeklyLedger(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  userId: number,
): Promise<PickemSeasonPlayerWeeklyLedger | null> {
  if ((pool.poolType as string) !== "pickem_season") return null;
  if (pool.entryFee == null || pool.entryFee <= 0) return null;

  const [member] = await db
    .select({ userId: entriesTable.userId, prizeAmount: entriesTable.prizeAmount })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!member) return null;

  const entryFee = pool.entryFee ?? 0;
  const paidFlags = await loadWeeklyPickEmCommissionerPaidFlags(poolId);
  const weeklyBreakdown = await weeklyBonusWinBreakdownForPool(pool, poolId);
  const weekly = weeklyBreakdown.winsByUser.get(userId);
  const weeklyWon = weekly
    ? weeklyBonusOutstandingAmount(weekly.weeks, paidFlags.periodPaidKeys)
    : 0;
  const seasonPrizeAmount = seasonPrizeAmountFromEntry(member.prizeAmount);
  const seasonPrizePaid =
    seasonPrizeAmount > 0
    && paidFlags.periodPaidKeys.has(pickemSeasonSeasonPrizePeriodKey(userId));
  const seasonPrizeOwed = seasonPrizePaid ? 0 : seasonPrizeAmount;
  const totalWon = weeklyWon + seasonPrizeOwed;

  const entryWeeksCollected = resolveEntryWeeksCollected(
    userId,
    PICKEM_SEASON_ENTRY_UNITS,
    paidFlags,
  );
  const entryFeeTotal = entryFee * PICKEM_SEASON_ENTRY_UNITS;
  const entryFeeRemaining = Math.max(
    0,
    entryFee * (PICKEM_SEASON_ENTRY_UNITS - entryWeeksCollected),
  );

  return {
    completedWeekCount: PICKEM_SEASON_ENTRY_UNITS,
    entryFee,
    entryWeeksCollected,
    entryFeeTotal,
    entryFeeRemaining,
    weeklyWon,
    outstandingNet: entryFeeRemaining - totalWon,
  };
}
