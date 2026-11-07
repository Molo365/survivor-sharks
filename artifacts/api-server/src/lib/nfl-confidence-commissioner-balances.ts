import { db } from "@workspace/db";
import {
  entriesTable,
  nflConfidenceResultsTable,
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
  applyWeeklyPickEmCommissionerLedgerPatch,
  loadWeeklyPickEmCommissionerPaidFlags,
  resolveEntryWeeksCollected,
  type WeeklyPickEmCommissionerLedgerPatch,
} from "./weekly-pickem-commissioner-ledger";
import type {
  CommissionerBalancePlayer,
  CommissionerBalanceSheet,
  PickemSeasonWeeklyBonusPeriod,
  WeeklyWinLine,
} from "./pickem-season-commissioner-balances";

export type {
  CommissionerBalancePlayer,
  CommissionerBalanceSheet,
  PickemSeasonWeeklyBonusPeriod,
  WeeklyWinLine,
} from "./pickem-season-commissioner-balances";

export function nflConfidenceWeeklyBonusPeriodKey(week: number): string {
  return `nfl-confidence-w${week}`;
}

export function nflConfidenceSeasonPrizePeriodKey(userId: number): string {
  return `nfl-confidence-season-prize-u${userId}`;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function seasonPrizeAmountFromEntry(prizeAmount: string | number | null): number {
  if (prizeAmount == null) return 0;
  const n = roundMoney(Number(prizeAmount));
  return n > 0 ? n : 0;
}

type WeeklyBonusWinBreakdown = {
  thresholdMet: boolean;
  winsByUser: Map<number, { total: number; weeks: WeeklyWinLine[] }>;
  bonusPeriods: Array<{ week: number; totalOwed: number }>;
};

function weeklyBonusOutstandingAmount(
  weeks: WeeklyWinLine[],
  periodPaidKeys: Set<string>,
): number {
  let s = 0;
  for (const w of weeks) {
    if (periodPaidKeys.has(nflConfidenceWeeklyBonusPeriodKey(w.week))) continue;
    s += w.amount;
  }
  return s;
}

export function isNflConfidenceCommissionerBalancesPool(pool: {
  poolType: string;
  entryFee: number | null;
}): boolean {
  if ((pool.poolType as string) !== "nfl_confidence") return false;
  return pool.entryFee != null && pool.entryFee > 0;
}

const NFL_CONFIDENCE_ENTRY_UNITS = 1;

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

  const completedWeekRows = await db
    .select({ week: nflConfidenceResultsTable.week })
    .from(nflConfidenceResultsTable)
    .where(eq(nflConfidenceResultsTable.poolId, poolId));

  const lastResolvableWeek = pool.isActive ? pool.currentWeek - 1 : NFL_TOTAL_WEEKS;

  for (const { week } of completedWeekRows) {
    if (week > lastResolvableWeek || week < 1) continue;

    const pointsRows = await db
      .select({
        userId: pickemPicksTable.userId,
        weeklyPoints: sql<string>`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE(${pickemPicksTable.confidencePoints}::integer, 0) ELSE 0 END), 0)`,
      })
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week)))
      .groupBy(pickemPicksTable.userId);

    if (pointsRows.length === 0) continue;

    const maxPoints = Math.max(...pointsRows.map((r) => Number(r.weeklyPoints)));
    if (maxPoints <= 0) continue;

    const scoreWinners = pointsRows
      .filter((r) => Number(r.weeklyPoints) === maxPoints)
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

export async function buildNflConfidenceCommissionerBalanceSheet(
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
      periodKey: nflConfidenceWeeklyBonusPeriodKey(p.week),
      label: `Week ${p.week}`,
      week: p.week,
      totalOwed: p.totalOwed,
      periodPaid: paidFlags.periodPaidKeys.has(nflConfidenceWeeklyBonusPeriodKey(p.week)),
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
      && paidFlags.periodPaidKeys.has(nflConfidenceSeasonPrizePeriodKey(m.userId));
    const seasonPrizeWon = seasonPrizePaid ? 0 : seasonPrizeAmount;
    const totalWon = weeklyBonusWon + seasonPrizeWon;
    const unitsCollected = resolveEntryWeeksCollected(
      m.userId,
      NFL_CONFIDENCE_ENTRY_UNITS,
      paidFlags,
    );
    const entryPaid = unitsCollected >= NFL_CONFIDENCE_ENTRY_UNITS && entryFee > 0;
    const entryFeeOwed =
      entryFee > 0 ? Math.max(0, entryFee * (NFL_CONFIDENCE_ENTRY_UNITS - unitsCollected)) : 0;
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

export async function patchNflConfidenceCommissionerLedger(
  poolId: number,
  patch: WeeklyPickEmCommissionerLedgerPatch,
  pool: typeof poolsTable.$inferSelect,
): Promise<CommissionerBalanceSheet> {
  if (!isNflConfidenceCommissionerBalancesPool(pool)) {
    throw new Error("Not a paid NFL Confidence season pool");
  }
  await applyWeeklyPickEmCommissionerLedgerPatch(poolId, patch, { maxEntryWeeks: 1 });
  return buildNflConfidenceCommissionerBalanceSheet(pool, poolId);
}

export type NflConfidencePlayerWeeklyLedger = {
  completedWeekCount: number;
  entryFee: number;
  entryWeeksCollected: number;
  entryFeeTotal: number;
  entryFeeRemaining: number;
  weeklyWon: number;
  outstandingNet: number;
};

export async function getNflConfidencePlayerWeeklyLedger(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  userId: number,
): Promise<NflConfidencePlayerWeeklyLedger | null> {
  if (!isNflConfidenceCommissionerBalancesPool(pool)) return null;

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
    && paidFlags.periodPaidKeys.has(nflConfidenceSeasonPrizePeriodKey(userId));
  const seasonPrizeOwed = seasonPrizePaid ? 0 : seasonPrizeAmount;
  const totalWon = weeklyWon + seasonPrizeOwed;

  const entryWeeksCollected = resolveEntryWeeksCollected(
    userId,
    NFL_CONFIDENCE_ENTRY_UNITS,
    paidFlags,
  );
  const entryFeeTotal = entryFee * NFL_CONFIDENCE_ENTRY_UNITS;
  const entryFeeRemaining = Math.max(
    0,
    entryFee * (NFL_CONFIDENCE_ENTRY_UNITS - entryWeeksCollected),
  );

  return {
    completedWeekCount: NFL_CONFIDENCE_ENTRY_UNITS,
    entryFee,
    entryWeeksCollected,
    entryFeeTotal,
    entryFeeRemaining,
    weeklyWon,
    outstandingNet: entryFeeRemaining - totalWon,
  };
}
