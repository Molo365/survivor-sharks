import { db } from "@workspace/db";
import {
  crazyEightsPeriodResultsTable,
  entriesTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { getNbaAtsSlateBoundsForPool } from "./nba-ats-period";
import {
  applyWeeklyPickEmCommissionerLedgerPatch,
  loadWeeklyPickEmCommissionerPaidFlags,
  resolveEntryWeeksCollected,
  type WeeklyPickEmCommissionerLedgerPatch,
} from "./weekly-pickem-commissioner-ledger";
import type {
  CrazyEightsBalancePlayer,
  CrazyEightsCommissionerBalanceSheet,
  CrazyEightsPeriodSummary,
  CrazyEightsPeriodWinLine,
} from "./crazy-eights-commissioner-balances";

export function nbaAtsCommissionerPeriodKey(week: number): string {
  return `nba-ats-week-${week}`;
}

export function nbaAtsOneShotPrizePeriodKey(userId: number): string {
  return `nba-ats-prize-u${userId}`;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function prizeFromEntry(prizeAmount: string | number | null): number {
  if (prizeAmount == null) return 0;
  const n = roundMoney(Number(prizeAmount));
  return n > 0 ? n : 0;
}

function weeklyEntryTotal(entryFee: number, completedWeekCount: number): number {
  if (entryFee <= 0 || completedWeekCount <= 0) return 0;
  return entryFee * completedWeekCount;
}

function outstandingPeriodWins(
  wins: CrazyEightsPeriodWinLine[],
  paidKeys: Set<string>,
): number {
  let s = 0;
  for (const w of wins) {
    if (paidKeys.has(w.periodKey)) continue;
    s += w.amount;
  }
  return s;
}

export function nbaAtsBillableEntryPeriods(pool: {
  poolType: string;
  isRecurring?: boolean | null;
  entryFee: number | null;
  currentWeek: number;
}): number {
  if ((pool.poolType as string) !== "nba_ats") return 0;
  if (pool.entryFee == null || pool.entryFee <= 0) return 0;
  if (pool.isRecurring === true) return Math.max(0, pool.currentWeek - 1);
  if (pool.isRecurring === false) return 1;
  return 0;
}

export function isNbaAtsCommissionerBalancesPool(pool: {
  poolType: string;
  isRecurring?: boolean | null;
  entryFee: number | null;
}): boolean {
  if ((pool.poolType as string) !== "nba_ats") return false;
  if (pool.entryFee == null || pool.entryFee <= 0) return false;
  return pool.isRecurring === true || pool.isRecurring === false;
}

export type NbaAtsPlayerWeeklyLedger = {
  completedWeekCount: number;
  entryFee: number;
  entryWeeksCollected: number;
  entryFeeTotal: number;
  entryFeeRemaining: number;
  weeklyWon: number;
  outstandingNet: number;
};

export async function getNbaAtsPlayerWeeklyLedger(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  userId: number,
): Promise<NbaAtsPlayerWeeklyLedger | null> {
  if (!isNbaAtsCommissionerBalancesPool(pool)) return null;

  const paidFlags = await loadWeeklyPickEmCommissionerPaidFlags(poolId);
  const entryFee = pool.entryFee ?? 0;
  const billable = nbaAtsBillableEntryPeriods(pool);

  let weeklyWon = 0;
  if (pool.isRecurring === true) {
    const resultRows = await db
      .select()
      .from(crazyEightsPeriodResultsTable)
      .where(eq(crazyEightsPeriodResultsTable.poolId, poolId));
    for (const row of resultRows) {
      for (const group of row.groups) {
        if (!group.userIds.includes(userId)) continue;
        const periodKey = nbaAtsCommissionerPeriodKey(row.week);
        if (paidFlags.periodPaidKeys.has(periodKey)) continue;
        weeklyWon += group.prize ?? 0;
      }
    }
  } else {
    const [member] = await db
      .select({ prizeAmount: entriesTable.prizeAmount })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
      .limit(1);
    if (!member) return null;
    const amount = prizeFromEntry(member.prizeAmount);
    const paid = paidFlags.periodPaidKeys.has(nbaAtsOneShotPrizePeriodKey(userId));
    weeklyWon = paid ? 0 : amount;
  }

  const entryWeeksCollected = resolveEntryWeeksCollected(userId, billable, paidFlags);
  const entryFeeTotal = weeklyEntryTotal(entryFee, billable);
  const entryFeeRemaining = weeklyEntryTotal(entryFee, billable - entryWeeksCollected);

  return {
    completedWeekCount: billable,
    entryFee,
    entryWeeksCollected,
    entryFeeTotal,
    entryFeeRemaining,
    weeklyWon,
    outstandingNet: entryFeeRemaining - weeklyWon,
  };
}

async function buildRecurringNbaAtsSheet(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<CrazyEightsCommissionerBalanceSheet> {
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

  const resultRows = await db
    .select()
    .from(crazyEightsPeriodResultsTable)
    .where(eq(crazyEightsPeriodResultsTable.poolId, poolId))
    .orderBy(asc(crazyEightsPeriodResultsTable.week));

  const entryFee = pool.entryFee ?? 0;
  const completedWeekCount = nbaAtsBillableEntryPeriods(pool);
  const weeklyEntryPerPlayer = weeklyEntryTotal(entryFee, completedWeekCount);
  const winsByUser = new Map<number, CrazyEightsPeriodWinLine[]>();
  const periods: CrazyEightsPeriodSummary[] = [];

  for (const row of resultRows) {
    const bounds = getNbaAtsSlateBoundsForPool(pool, row.week);
    const periodKey = nbaAtsCommissionerPeriodKey(row.week);
    const label = `Weekend ${row.week} · ${bounds.weekLabel}`;
    const weekStart = bounds.days[0]!;
    const weekEnd = bounds.days.at(-1)!;

    let totalOwed = 0;
    let totalOutstanding = 0;
    for (const group of row.groups) {
      const amount = group.prize ?? 0;
      if (amount <= 0) continue;
      for (const userId of group.userIds) {
        totalOwed += amount;
        if (!paidFlags.periodPaidKeys.has(periodKey)) {
          totalOutstanding += amount;
        }
        if (!winsByUser.has(userId)) winsByUser.set(userId, []);
        winsByUser.get(userId)!.push({ periodKey, label, amount });
      }
    }

    if (totalOwed > 0) {
      periods.push({
        periodKey,
        label,
        weekStart,
        weekEnd,
        totalOwed: totalOutstanding,
        periodPaid: paidFlags.periodPaidKeys.has(periodKey),
      });
    }
  }

  const players: CrazyEightsBalancePlayer[] = members.map((m) => {
    const periodWins = winsByUser.get(m.userId) ?? [];
    const weeklyWon = outstandingPeriodWins(periodWins, paidFlags.periodPaidKeys);
    const entryWeeksCollected = resolveEntryWeeksCollected(m.userId, completedWeekCount, paidFlags);
    const entryFeeTotal = weeklyEntryPerPlayer;
    const entryFeeRemaining = weeklyEntryTotal(entryFee, completedWeekCount - entryWeeksCollected);
    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed: entryFeeRemaining,
      entryFeeTotal,
      entryFeeRemaining,
      entryWeeksCollected,
      weeklyWon,
      totalWon: weeklyWon,
      netBalance: entryFeeRemaining - weeklyWon,
      entryPaid: entryWeeksCollected >= completedWeekCount && completedWeekCount > 0,
      periodWins,
    };
  });

  const totalEntryCollected = players.reduce(
    (s, p) => s + ((p.entryFeeTotal ?? 0) - (p.entryFeeRemaining ?? 0)),
    0,
  );
  const totalEntryExpected = weeklyEntryPerPlayer * members.length;
  const totalWeeklyOwed = players.reduce((s, p) => s + p.weeklyWon, 0);

  return {
    poolId,
    poolName: pool.name,
    entryFee,
    completedWeekCount,
    memberCount: members.length,
    weeklyPickEmPayoutModel: null,
    weeklyBonusEnabled: false,
    poolIsActive: pool.isActive,
    summary: {
      totalEntryExpected,
      totalWeeklyOwed,
      totalSeasonOwed: 0,
      totalOwedToPlayers: totalWeeklyOwed,
      netToCommissioner: totalEntryCollected - totalWeeklyOwed,
    },
    periods,
    players: players.map((p) => ({ ...p, seasonPrizeWon: 0 })),
  };
}

async function buildOneShotNbaAtsSheet(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<CrazyEightsCommissionerBalanceSheet> {
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
  const completedWeekCount = 1;

  const players: CrazyEightsBalancePlayer[] = members.map((m) => {
    const prizeAmount = prizeFromEntry(m.prizeAmount);
    const prizeKey = nbaAtsOneShotPrizePeriodKey(m.userId);
    const prizePaid = prizeAmount > 0 && paidFlags.periodPaidKeys.has(prizeKey);
    const weeklyWon = prizePaid ? 0 : prizeAmount;
    const entryWeeksCollected = resolveEntryWeeksCollected(m.userId, completedWeekCount, paidFlags);
    const entryFeeTotal = entryFee;
    const entryFeeRemaining = weeklyEntryTotal(entryFee, completedWeekCount - entryWeeksCollected);
    const periodWins: CrazyEightsPeriodWinLine[] =
      prizeAmount > 0
        ? [
            {
              periodKey: prizeKey,
              label: "Weekend contest",
              amount: prizeAmount,
            },
          ]
        : [];

    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed: entryFeeRemaining,
      entryFeeTotal,
      entryFeeRemaining,
      entryWeeksCollected,
      weeklyWon,
      totalWon: weeklyWon,
      netBalance: entryFeeRemaining - weeklyWon,
      entryPaid: entryWeeksCollected >= completedWeekCount,
      periodWins,
    };
  });

  const periods: CrazyEightsPeriodSummary[] = [];
  let poolPrizeOwed = 0;
  for (const p of players) {
    if (p.weeklyWon > 0) poolPrizeOwed += p.weeklyWon;
    if (p.periodWins.length > 0 && p.weeklyWon > 0) {
      const win = p.periodWins[0]!;
      periods.push({
        periodKey: win.periodKey,
        label: win.label,
        weekStart: "",
        weekEnd: "",
        totalOwed: p.weeklyWon,
        periodPaid: paidFlags.periodPaidKeys.has(win.periodKey),
      });
    }
  }

  const totalEntryCollected = players.reduce(
    (s, p) => s + (p.entryFeeTotal - p.entryFeeRemaining),
    0,
  );

  return {
    poolId,
    poolName: pool.name,
    entryFee,
    completedWeekCount,
    memberCount: members.length,
    weeklyPickEmPayoutModel: null,
    weeklyBonusEnabled: false,
    poolIsActive: pool.isActive,
    summary: {
      totalEntryExpected: entryFee * members.length,
      totalWeeklyOwed: poolPrizeOwed,
      totalSeasonOwed: 0,
      totalOwedToPlayers: poolPrizeOwed,
      netToCommissioner: totalEntryCollected - poolPrizeOwed,
    },
    periods,
    players: players.map((p) => ({ ...p, seasonPrizeWon: 0 })),
  };
}

export async function buildNbaAtsCommissionerBalanceSheet(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<CrazyEightsCommissionerBalanceSheet> {
  if (pool.isRecurring === true) {
    return buildRecurringNbaAtsSheet(pool, poolId);
  }
  return buildOneShotNbaAtsSheet(pool, poolId);
}

export async function patchNbaAtsCommissionerLedger(
  poolId: number,
  patch: WeeklyPickEmCommissionerLedgerPatch,
  pool: typeof poolsTable.$inferSelect,
): Promise<CrazyEightsCommissionerBalanceSheet> {
  const maxEntryWeeks = nbaAtsBillableEntryPeriods(pool);
  await applyWeeklyPickEmCommissionerLedgerPatch(poolId, patch, { maxEntryWeeks });
  return buildNbaAtsCommissionerBalanceSheet(pool, poolId);
}
