import { db } from "@workspace/db";
import { entriesTable, poolsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getTodayEtDate, getNhlWeekBounds } from "./espn";
import { listPickEmPeriodsForPool } from "./pickem-periods";
import {
  computePickEmPeriodPrizeByUser,
  genericWeekBoundsFromCurrentWeek,
  mlbPickEmWeekBounds,
  type PickEmPeriodPrizeTarget,
} from "./pickem-period-prize-engine";
import {
  isWeeklyPickEmPayoutModelPool,
  resolveWeeklyPickEmPayoutModel,
  isWeeklyPickEmCommissionerBalancesPool,
} from "./weekly-pickem-payout-model";
import {
  loadWeeklyPickEmCommissionerPaidFlags,
  resolveEntryWeeksCollected,
} from "./weekly-pickem-commissioner-ledger";
import { weeklyPickEmWeeklyEntryDollars } from "./weekly-pickem-commissioner-balance-math";

export { isWeeklyPickEmCommissionerBalancesPool };

export type WeeklyPeriodWinLine = { periodKey: string; label: string; amount: number };

export type WeeklyPickEmBalancePlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  entryFeeOwed: number;
  /** Period-pot recurring: total entry owed for all completed weeks so far. */
  entryFeeTotal?: number;
  /** Period-pot recurring: still owed after weeks_collected taps. */
  entryFeeRemaining?: number;
  entryWeeksCollected?: number;
  weeklyWon: number;
  seasonPrizeWon: number;
  totalWon: number;
  netBalance: number;
  entryPaid: boolean;
  periodWins: WeeklyPeriodWinLine[];
};

export type WeeklyPickEmPeriodSummary = {
  periodKey: string;
  label: string;
  weekStart: string;
  weekEnd: string;
  totalOwed: number;
  periodPaid: boolean;
};

export type WeeklyPickEmCommissionerBalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
  /**
   * Period-pot recurring only: number of completed entry-billing periods (one entry fee each).
   */
  completedWeekCount?: number;
  memberCount: number;
  weeklyPickEmPayoutModel: "period_pot" | "season_budget" | null;
  weeklyBonusEnabled: boolean;
  poolIsActive: boolean;
  summary: {
    totalEntryExpected: number;
    totalWeeklyOwed: number;
    totalSeasonOwed: number;
    totalOwedToPlayers: number;
    netToCommissioner: number;
  };
  periods: WeeklyPickEmPeriodSummary[];
  players: WeeklyPickEmBalancePlayer[];
};

type PeriodSpec = {
  periodKey: string;
  label: string;
  weekStart: string;
  weekEnd: string;
  target: PickEmPeriodPrizeTarget;
};

async function listCompletedPeriodSpecs(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<PeriodSpec[]> {
  const sport = pool.sport as string;
  const specs: PeriodSpec[] = [];

  if (
    sport === "nhl" &&
    pool.poolType === "pickem" &&
    pool.pickFrequency === "weekly" &&
    pool.isRecurring
  ) {
    for (let w = 1; w < pool.currentWeek; w++) {
      const { days } = getNhlWeekBounds(
        pool.createdAt,
        w,
        pool.sandboxMode ? null : pool.initialPeriodStart,
      );
      specs.push({
        periodKey: `week-${w}`,
        label: `Week ${w}`,
        weekStart: days[0]!,
        weekEnd: days[days.length - 1]!,
        target: { kind: "nhl_week", week: w },
      });
    }
    return specs;
  }

  if (sport === "mlb" && pool.poolType === "pickem" && pool.pickFrequency === "weekly" && pool.isRecurring) {
    for (let w = 1; w < pool.currentWeek; w++) {
      const bounds = mlbPickEmWeekBounds(pool, w);
      specs.push({
        periodKey: bounds.weekStart,
        label: `Week ${w}`,
        weekStart: bounds.weekStart,
        weekEnd: bounds.weekEnd,
        target: { kind: "date_range", weekStart: bounds.weekStart, weekEnd: bounds.weekEnd },
      });
    }
    return specs;
  }

  if (
    (sport === "mls" || sport === "superleague") &&
    pool.poolType === "pickem" &&
    pool.pickFrequency === "weekly" &&
    pool.isRecurring
  ) {
    try {
      const { periods } = await listPickEmPeriodsForPool(poolId, {
        sport: pool.sport,
        poolType: pool.poolType,
        pickFrequency: pool.pickFrequency,
        currentWeek: pool.currentWeek,
        createdAt: pool.createdAt,
        initialPeriodStart: pool.initialPeriodStart,
      });
      for (const p of periods) {
        if (p.status !== "completed") continue;
        specs.push({
          periodKey: p.key,
          label: p.label,
          weekStart: p.weekStart,
          weekEnd: p.weekEnd,
          target: { kind: "date_range", weekStart: p.weekStart, weekEnd: p.weekEnd },
        });
      }
    } catch {
      return [];
    }
    return specs;
  }

  const todayEt = getTodayEtDate();
  if (pool.poolType === "pickem" && pool.pickFrequency === "weekly" && pool.isRecurring) {
    for (let w = 1; w < pool.currentWeek; w++) {
      const bounds = genericWeekBoundsFromCurrentWeek(pool, w, todayEt);
      specs.push({
        periodKey: bounds.weekStart,
        label: `Week ${w}`,
        weekStart: bounds.weekStart,
        weekEnd: bounds.weekEnd,
        target: { kind: "date_range", weekStart: bounds.weekStart, weekEnd: bounds.weekEnd },
      });
    }
  }

  return specs;
}

/** Max entry weeks for commissioner ledger taps (period-pot recurring only). */
export async function weeklyPickEmCommissionerMaxEntryWeeks(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<number | undefined> {
  if (!isWeeklyPickEmCommissionerBalancesPool(pool)) return undefined;
  if (resolveWeeklyPickEmPayoutModel(pool) !== "period_pot") return undefined;
  const specs = await listCompletedPeriodSpecs(pool, poolId);
  return specs.length;
}

export type WeeklyPickEmPlayerWeeklyLedger = {
  completedWeekCount: number;
  entryFee: number;
  entryWeeksCollected: number;
  entryFeeTotal: number;
  entryFeeRemaining: number;
  weeklyWon: number;
  outstandingNet: number;
};

/** Profile /balance: recurring weekly pick-em with period_pot — same math as commissioner sheet. */
export async function getWeeklyPickEmPlayerWeeklyLedger(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  userId: number,
): Promise<WeeklyPickEmPlayerWeeklyLedger | null> {
  if (!isWeeklyPickEmCommissionerBalancesPool(pool)) return null;
  if (resolveWeeklyPickEmPayoutModel(pool) !== "period_pot") return null;

  const [member] = await db
    .select({ userId: entriesTable.userId, prizeAmount: entriesTable.prizeAmount })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!member) return null;

  const paidFlags = await loadWeeklyPickEmCommissionerPaidFlags(poolId);
  const entryFee = pool.entryFee ?? 0;
  const periodSpecs = await listCompletedPeriodSpecs(pool, poolId);
  const completedWeekCount = periodSpecs.length;

  let weeklyWon = 0;
  for (const spec of periodSpecs) {
    const prizeMap = await computePickEmPeriodPrizeByUser(pool, poolId, spec.target);
    const amount = prizeMap?.get(userId) ?? 0;
    if (amount > 0) weeklyWon += amount;
  }

  const seasonPrizeWon =
    member.prizeAmount != null ? Math.round(Number(member.prizeAmount) * 100) / 100 : 0;
  const totalWon = weeklyWon + seasonPrizeWon;

  const entryWeeksCollected = resolveEntryWeeksCollected(userId, completedWeekCount, paidFlags);
  const entryFeeTotal = weeklyPickEmWeeklyEntryDollars(entryFee, completedWeekCount);
  const entryFeeRemaining = weeklyPickEmWeeklyEntryDollars(
    entryFee,
    completedWeekCount - entryWeeksCollected,
  );

  return {
    completedWeekCount,
    entryFee,
    entryWeeksCollected,
    entryFeeTotal,
    entryFeeRemaining,
    weeklyWon,
    outstandingNet: entryFeeRemaining - totalWon,
  };
}

export async function buildWeeklyPickEmCommissionerBalanceSheet(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<WeeklyPickEmCommissionerBalanceSheet> {
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
  const payoutModel = resolveWeeklyPickEmPayoutModel(pool);
  const usePeriodPotIncrementalEntry =
    payoutModel === "period_pot" && isWeeklyPickEmPayoutModelPool(pool) && entryFee > 0;

  const periodSpecs = await listCompletedPeriodSpecs(pool, poolId);
  const completedWeekCount = usePeriodPotIncrementalEntry ? periodSpecs.length : undefined;
  const weeklyEntryPerPlayer =
    usePeriodPotIncrementalEntry && completedWeekCount != null
      ? weeklyPickEmWeeklyEntryDollars(entryFee, completedWeekCount)
      : entryFee;

  const winsByUser = new Map<number, WeeklyPeriodWinLine[]>();
  const periods: WeeklyPickEmPeriodSummary[] = [];

  for (const spec of periodSpecs) {
    const prizeMap = await computePickEmPeriodPrizeByUser(pool, poolId, spec.target);
    if (!prizeMap || prizeMap.size === 0) continue;
    let totalOwed = 0;
    for (const [userId, amount] of prizeMap) {
      if (amount <= 0) continue;
      totalOwed += amount;
      if (!winsByUser.has(userId)) winsByUser.set(userId, []);
      winsByUser.get(userId)!.push({
        periodKey: spec.periodKey,
        label: spec.label,
        amount,
      });
    }
    if (totalOwed > 0) {
      periods.push({
        periodKey: spec.periodKey,
        label: spec.label,
        weekStart: spec.weekStart,
        weekEnd: spec.weekEnd,
        totalOwed,
        periodPaid: paidFlags.periodPaidKeys.has(spec.periodKey),
      });
    }
  }

  const players: WeeklyPickEmBalancePlayer[] = members.map((m) => {
    const periodWins = winsByUser.get(m.userId) ?? [];
    const weeklyWon = periodWins.reduce((s, w) => s + w.amount, 0);
    const seasonPrizeWon =
      m.prizeAmount != null ? Math.round(Number(m.prizeAmount) * 100) / 100 : 0;
    const totalWon = weeklyWon + seasonPrizeWon;

    if (usePeriodPotIncrementalEntry && completedWeekCount != null && completedWeekCount >= 0) {
      const entryWeeksCollected = resolveEntryWeeksCollected(
        m.userId,
        completedWeekCount,
        paidFlags,
      );
      const entryFeeTotal = weeklyEntryPerPlayer;
      const entryFeeRemaining = weeklyPickEmWeeklyEntryDollars(
        entryFee,
        completedWeekCount - entryWeeksCollected,
      );
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
        seasonPrizeWon,
        totalWon,
        netBalance,
        entryPaid: entryWeeksCollected >= completedWeekCount && completedWeekCount > 0,
        periodWins,
      };
    }

    const entryFeeOwed = entryFee;
    const netBalance = entryFeeOwed - totalWon;
    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed,
      weeklyWon,
      seasonPrizeWon,
      totalWon,
      netBalance,
      entryPaid: paidFlags.entryPaidUserIds.has(m.userId),
      periodWins,
    };
  });

  const totalEntryExpected = weeklyEntryPerPlayer * members.length;
  const totalWeeklyOwed = players.reduce((s, p) => s + p.weeklyWon, 0);
  const totalSeasonOwed = players.reduce((s, p) => s + p.seasonPrizeWon, 0);
  const totalOwedToPlayers = totalWeeklyOwed + totalSeasonOwed;

  return {
    poolId,
    poolName: pool.name,
    entryFee,
    completedWeekCount,
    memberCount: members.length,
    weeklyPickEmPayoutModel: payoutModel,
    weeklyBonusEnabled: pool.weeklyBonusEnabled,
    poolIsActive: pool.isActive,
    summary: {
      totalEntryExpected,
      totalWeeklyOwed,
      totalSeasonOwed,
      totalOwedToPlayers,
      netToCommissioner: totalEntryExpected - totalOwedToPlayers,
    },
    periods,
    players,
  };
}
