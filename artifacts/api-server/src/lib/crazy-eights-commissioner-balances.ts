import { db } from "@workspace/db";
import {
  crazyEightsPeriodResultsTable,
  entriesTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { getNhlWeekBounds } from "./espn";
import {
  type CrazyEightsPeriodPool,
} from "./crazy-eights-periods";
import { getNbaAtsSlateBoundsForPool } from "./nba-ats-period";
import {
  applyWeeklyPickEmCommissionerLedgerPatch,
  loadWeeklyPickEmCommissionerPaidFlags,
  type WeeklyPickEmCommissionerLedgerPatch,
} from "./weekly-pickem-commissioner-ledger";

export type CrazyEightsPeriodWinLine = {
  periodKey: string;
  label: string;
  amount: number;
};

export type CrazyEightsBalancePlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  entryFeeOwed: number;
  weeklyWon: number;
  totalWon: number;
  netBalance: number;
  entryPaid: boolean;
  periodWins: CrazyEightsPeriodWinLine[];
};

export type CrazyEightsPeriodSummary = {
  periodKey: string;
  label: string;
  weekStart: string;
  weekEnd: string;
  totalOwed: number;
  periodPaid: boolean;
};

export type CrazyEightsCommissionerBalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
  /** Completed weekends (each requires another entry fee per player). */
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
  periods: CrazyEightsPeriodSummary[];
  players: Array<CrazyEightsBalancePlayer & { seasonPrizeWon: number }>;
};

export function crazyEightsCommissionerPeriodKey(week: number): string {
  return `c8-week-${week}`;
}

/** Recurring Hit the Ice / Fast Break: each settled week is another entry fee per player. */
export function crazyEightsCompletedWeekCount(currentWeek: number): number {
  return Math.max(0, currentWeek - 1);
}

export function crazyEightsWeeklyEntryTotal(entryFee: number, completedWeekCount: number): number {
  if (entryFee <= 0 || completedWeekCount <= 0) return 0;
  return entryFee * completedWeekCount;
}

export function isCrazyEightsCommissionerBalancesPool(pool: {
  sport: string;
  poolType: string;
  isRecurring?: boolean | null;
  entryFee: number | null;
}): boolean {
  if (pool.isRecurring !== true) return false;
  if (pool.entryFee == null || pool.entryFee <= 0) return false;
  const family =
    pool.poolType === "crazy_8s"
    || (pool.poolType === "fast_break_multiplier" && pool.sport === "nba");
  return family && (pool.sport === "nhl" || pool.sport === "nba");
}

function toPeriodPool(pool: typeof poolsTable.$inferSelect): CrazyEightsPeriodPool {
  return {
    sport: pool.sport as string,
    poolType: pool.poolType as string,
    isRecurring: pool.isRecurring,
    sandboxMode: pool.sandboxMode,
    createdAt: pool.createdAt instanceof Date ? pool.createdAt : new Date(pool.createdAt),
    currentWeek: pool.currentWeek,
    initialPeriodStart: pool.initialPeriodStart,
  };
}

function periodBounds(pool: typeof poolsTable.$inferSelect, weekNumber: number) {
  const periodPool = toPeriodPool(pool);
  if (pool.sport === "nhl") {
    return getNhlWeekBounds(
      periodPool.createdAt,
      weekNumber,
      periodPool.initialPeriodStart,
    );
  }
  return getNbaAtsSlateBoundsForPool(
    {
      sport: periodPool.sport,
      poolType: periodPool.poolType,
      initialPeriodStart: periodPool.initialPeriodStart,
      createdAt: periodPool.createdAt,
      sandboxMode: periodPool.sandboxMode,
      currentWeek: periodPool.currentWeek,
    },
    weekNumber,
  );
}

export async function buildCrazyEightsCommissionerBalanceSheet(
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
  const completedWeekCount = crazyEightsCompletedWeekCount(pool.currentWeek);
  const weeklyEntryPerPlayer = crazyEightsWeeklyEntryTotal(entryFee, completedWeekCount);
  const winsByUser = new Map<number, CrazyEightsPeriodWinLine[]>();
  const periods: CrazyEightsPeriodSummary[] = [];

  for (const row of resultRows) {
    const bounds = periodBounds(pool, row.week);
    const periodKey = crazyEightsCommissionerPeriodKey(row.week);
    const label = `Week ${row.week} · ${bounds.weekLabel}`;
    const weekStart = bounds.days[0]!;
    const weekEnd = bounds.days.at(-1)!;

    let totalOwed = 0;
    for (const group of row.groups) {
      const amount = group.prize ?? 0;
      if (amount <= 0) continue;
      for (const userId of group.userIds) {
        totalOwed += amount;
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
        totalOwed,
        periodPaid: paidFlags.periodPaidKeys.has(periodKey),
      });
    }
  }

  const players: CrazyEightsBalancePlayer[] = members.map((m) => {
    const periodWins = winsByUser.get(m.userId) ?? [];
    const weeklyWon = periodWins.reduce((s, w) => s + w.amount, 0);
    const entryFeeOwed = weeklyEntryPerPlayer;
    const totalWon = weeklyWon;
    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed,
      weeklyWon,
      totalWon,
      netBalance: entryFeeOwed - totalWon,
      entryPaid: paidFlags.entryPaidUserIds.has(m.userId),
      periodWins,
    };
  });

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
      netToCommissioner: totalEntryExpected - totalWeeklyOwed,
    },
    periods,
    players: players.map((p) => ({ ...p, seasonPrizeWon: 0 })),
  };
}

export async function patchCrazyEightsCommissionerLedger(
  poolId: number,
  patch: WeeklyPickEmCommissionerLedgerPatch,
): Promise<CrazyEightsCommissionerBalanceSheet> {
  await applyWeeklyPickEmCommissionerLedgerPatch(poolId, patch);
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) throw new Error("Pool not found");
  return buildCrazyEightsCommissionerBalanceSheet(pool, poolId);
}
