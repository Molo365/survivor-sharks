import { db } from "@workspace/db";
import { entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export { isWeeklyPickEmCommissionerBalancesPool };

export type WeeklyPeriodWinLine = { periodKey: string; label: string; amount: number };

export type WeeklyPickEmBalancePlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  entryFeeOwed: number;
  weeklyWon: number;
  totalWon: number;
  netBalance: number;
  periodWins: WeeklyPeriodWinLine[];
};

export type WeeklyPickEmPeriodSummary = {
  periodKey: string;
  label: string;
  weekStart: string;
  weekEnd: string;
  totalOwed: number;
};

export type WeeklyPickEmCommissionerBalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
  memberCount: number;
  weeklyPickEmPayoutModel: "period_pot" | "season_budget" | null;
  weeklyBonusEnabled: boolean;
  poolIsActive: boolean;
  summary: {
    totalEntryExpected: number;
    totalWeeklyOwed: number;
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

export async function buildWeeklyPickEmCommissionerBalanceSheet(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<WeeklyPickEmCommissionerBalanceSheet> {
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
  const periodSpecs = await listCompletedPeriodSpecs(pool, poolId);
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
      });
    }
  }

  const players: WeeklyPickEmBalancePlayer[] = members.map((m) => {
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
    weeklyPickEmPayoutModel: resolveWeeklyPickEmPayoutModel(pool),
    weeklyBonusEnabled: pool.weeklyBonusEnabled,
    poolIsActive: pool.isActive,
    summary: {
      totalEntryExpected,
      totalWeeklyOwed,
      netToCommissioner: totalEntryExpected - totalWeeklyOwed,
    },
    periods,
    players,
  };
}
