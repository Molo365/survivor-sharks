import { db } from "@workspace/db";
import { entriesTable, poolsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  loadWeeklyPickEmCommissionerPaidFlags,
  resolveEntryWeeksCollected,
} from "./weekly-pickem-commissioner-ledger";
import type { CommissionerBalancePlayer, CommissionerBalanceSheet } from "./pickem-season-commissioner-balances";

export { type CommissionerBalancePlayer, type CommissionerBalanceSheet };

/** Per-winner survivor season prize payout in `weekly_pick_em_period_paid`. */
export function survivorSeasonPrizePeriodKey(userId: number): string {
  return `survivor-season-prize-u${userId}`;
}

const SURVIVOR_SEASON_ENTRY_UNITS = 1;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function seasonPrizeAmountFromEntry(prizeAmount: string | number | null): number {
  if (prizeAmount == null) return 0;
  const n = roundMoney(Number(prizeAmount));
  return n > 0 ? n : 0;
}

export function isSurvivorSeasonCommissionerBalancesPool(pool: {
  poolType: string;
  entryFee: number | null;
}): boolean {
  const pt = pool.poolType as string;
  if (pt !== "season" && pt !== "mid_season") return false;
  if (pool.entryFee == null || pool.entryFee <= 0) return false;
  return true;
}

export async function buildSurvivorSeasonCommissionerBalanceSheet(
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

  const players: CommissionerBalancePlayer[] = members.map((m) => {
    const seasonPrizeAmount = seasonPrizeAmountFromEntry(m.prizeAmount);
    const seasonPrizePaid =
      seasonPrizeAmount > 0
      && paidFlags.periodPaidKeys.has(survivorSeasonPrizePeriodKey(m.userId));
    const seasonPrizeWon = seasonPrizePaid ? 0 : seasonPrizeAmount;
    const totalWon = seasonPrizeWon;
    const unitsCollected = resolveEntryWeeksCollected(
      m.userId,
      SURVIVOR_SEASON_ENTRY_UNITS,
      paidFlags,
    );
    const entryPaid = unitsCollected >= SURVIVOR_SEASON_ENTRY_UNITS && entryFee > 0;
    const entryFeeOwed =
      entryFee > 0 ? Math.max(0, entryFee * (SURVIVOR_SEASON_ENTRY_UNITS - unitsCollected)) : 0;
    const netBalance = entryFeeOwed - totalWon;

    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed,
      entryPaid,
      weeklyBonusWon: 0,
      seasonPrizeAmount,
      seasonPrizePaid,
      seasonPrizeWon,
      totalWon,
      netBalance,
      weeklyWins: [],
    };
  });

  const totalEntryExpected = entryFee * members.length;
  const totalEntryCollected = players.reduce(
    (s, p) => s + (entryFee > 0 ? entryFee - p.entryFeeOwed : 0),
    0,
  );
  const totalSeasonOwed = players.reduce((s, p) => s + p.seasonPrizeWon, 0);
  const netToCommissioner = totalEntryCollected - totalSeasonOwed;

  return {
    poolId,
    poolName: pool.name,
    entryFee,
    memberCount: members.length,
    weeklyBonusEnabled: false,
    weeklyBonusThresholdMet: false,
    poolIsActive: pool.isActive,
    weeklyBonusPeriods: [],
    summary: {
      totalEntryExpected,
      totalEntryCollected,
      totalWeeklyOwed: 0,
      totalSeasonOwed,
      totalOwedToPlayers: totalSeasonOwed,
      netToCommissioner,
    },
    players,
  };
}

export type SurvivorSeasonPlayerWeeklyLedger = {
  completedWeekCount: number;
  entryFee: number;
  entryWeeksCollected: number;
  entryFeeTotal: number;
  entryFeeRemaining: number;
  weeklyWon: number;
  outstandingNet: number;
};

export async function getSurvivorSeasonPlayerWeeklyLedger(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  userId: number,
): Promise<SurvivorSeasonPlayerWeeklyLedger | null> {
  if (!isSurvivorSeasonCommissionerBalancesPool(pool)) return null;

  const [member] = await db
    .select({ userId: entriesTable.userId, prizeAmount: entriesTable.prizeAmount })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!member) return null;

  const entryFee = pool.entryFee ?? 0;
  const paidFlags = await loadWeeklyPickEmCommissionerPaidFlags(poolId);
  const seasonPrizeAmount = seasonPrizeAmountFromEntry(member.prizeAmount);
  const seasonPrizePaid =
    seasonPrizeAmount > 0
    && paidFlags.periodPaidKeys.has(survivorSeasonPrizePeriodKey(userId));
  const seasonPrizeOwed = seasonPrizePaid ? 0 : seasonPrizeAmount;

  const entryWeeksCollected = resolveEntryWeeksCollected(
    userId,
    SURVIVOR_SEASON_ENTRY_UNITS,
    paidFlags,
  );
  const entryFeeTotal = entryFee * SURVIVOR_SEASON_ENTRY_UNITS;
  const entryFeeRemaining = Math.max(
    0,
    entryFee * (SURVIVOR_SEASON_ENTRY_UNITS - entryWeeksCollected),
  );

  return {
    completedWeekCount: SURVIVOR_SEASON_ENTRY_UNITS,
    entryFee,
    entryWeeksCollected,
    entryFeeTotal,
    entryFeeRemaining,
    weeklyWon: 0,
    outstandingNet: entryFeeRemaining - seasonPrizeOwed,
  };
}
