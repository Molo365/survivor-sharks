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
  isWeeklyPickEmOneShotCommissionerBalancesPool,
  weeklyPickEmOneShotContestPeriodKey,
} from "./weekly-pickem-payout-model";
import {
  loadWeeklyPickEmCommissionerPaidFlags,
  resolveEntryWeeksCollected,
} from "./weekly-pickem-commissioner-ledger";
import { weeklyPickEmWeeklyEntryDollars } from "./weekly-pickem-commissioner-balance-math";

export {
  isWeeklyPickEmCommissionerBalancesPool,
  isWeeklyPickEmOneShotCommissionerBalancesPool,
  isPickemWeeklyCommissionerBalancesPool,
  weeklyPickEmOneShotContestPeriodKey,
} from "./weekly-pickem-payout-model";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function prizeFromEntry(prizeAmount: string | number | null): number {
  if (prizeAmount == null) return 0;
  const n = roundMoney(Number(prizeAmount));
  return n > 0 ? n : 0;
}

async function buildOneShotWeeklyPeriodSpec(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<PeriodSpec | null> {
  const week = pool.currentWeek;
  const periodKey = weeklyPickEmOneShotContestPeriodKey(week);
  const sport = pool.sport as string;

  if (sport === "nhl") {
    const { days } = getNhlWeekBounds(
      pool.createdAt,
      week,
      pool.sandboxMode ? null : pool.initialPeriodStart,
    );
    return {
      periodKey,
      label: "Contest week",
      weekStart: days[0]!,
      weekEnd: days[days.length - 1]!,
      target: { kind: "nhl_week", week },
    };
  }

  if (sport === "mlb") {
    const bounds = mlbPickEmWeekBounds(pool, week);
    return {
      periodKey,
      label: `Week ${week}`,
      weekStart: bounds.weekStart,
      weekEnd: bounds.weekEnd,
      target: { kind: "date_range", weekStart: bounds.weekStart, weekEnd: bounds.weekEnd },
    };
  }

  if (sport === "mls" || sport === "superleague") {
    try {
      const { periods } = await listPickEmPeriodsForPool(poolId, {
        sport: pool.sport,
        poolType: pool.poolType,
        pickFrequency: pool.pickFrequency,
        currentWeek: pool.currentWeek,
        createdAt: pool.createdAt,
        initialPeriodStart: pool.initialPeriodStart,
      });
      const match =
        periods.find((p) => p.status === "current" || p.status === "completed") ?? periods[0];
      if (match) {
        return {
          periodKey,
          label: match.label,
          weekStart: match.weekStart,
          weekEnd: match.weekEnd,
          target: {
            kind: "date_range",
            weekStart: match.weekStart,
            weekEnd: match.weekEnd,
          },
        };
      }
    } catch {
      return null;
    }
  }

  const todayEt = getTodayEtDate();
  const bounds = genericWeekBoundsFromCurrentWeek(pool, week, todayEt);
  return {
    periodKey,
    label: sport === "nfl" || sport === "nba" ? `Week ${week}` : "Contest",
    weekStart: bounds.weekStart,
    weekEnd: bounds.weekEnd,
    target: { kind: "date_range", weekStart: bounds.weekStart, weekEnd: bounds.weekEnd },
  };
}

export type WeeklyPeriodWinLine = { periodKey: string; label: string; amount: number };

export type WeeklyPickEmBalancePlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  entryFeeOwed: number;
  /** Recurring pick-em (period pot or season buy-in): total entry billing units owed so far. */
  entryFeeTotal?: number;
  /** Still owed after weeks_collected taps (one unit = one week’s entry or one season buy-in). */
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
   * Recurring weekly pick-em: entry billing units (completed weeks for period pot; 1 for season buy-in).
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

  if (isWeeklyPickEmOneShotCommissionerBalancesPool(pool)) {
    const spec = await buildOneShotWeeklyPeriodSpec(pool, poolId);
    if (spec) specs.push(spec);
  }

  return specs;
}

/** Max entry billing units for commissioner ledger taps (weeks for period pot; 1 for season buy-in). */
export async function weeklyPickEmCommissionerMaxEntryWeeks(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<number | undefined> {
  if (isWeeklyPickEmOneShotCommissionerBalancesPool(pool)) return 1;
  if (!isWeeklyPickEmCommissionerBalancesPool(pool)) return undefined;
  const model = resolveWeeklyPickEmPayoutModel(pool);
  if (model === "season_budget") return 1;
  if (model === "period_pot") {
    const specs = await listCompletedPeriodSpecs(pool, poolId);
    return specs.length;
  }
  return undefined;
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

/** Profile /balance: recurring weekly pick-em — same math as commissioner sheet. */
async function resolveOneShotWeeklyContestPrizeByUser(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  members: Array<{ userId: number; prizeAmount: string | number | null }>,
  periodSpecs: PeriodSpec[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const useStored =
    !pool.isActive || members.some((m) => prizeFromEntry(m.prizeAmount) > 0);

  if (useStored) {
    for (const m of members) {
      const amount = prizeFromEntry(m.prizeAmount);
      if (amount > 0) out.set(m.userId, amount);
    }
    return out;
  }

  for (const spec of periodSpecs) {
    const prizeMap = await computePickEmPeriodPrizeByUser(pool, poolId, spec.target);
    if (!prizeMap) continue;
    for (const [userId, amount] of prizeMap) {
      if (amount > 0) out.set(userId, (out.get(userId) ?? 0) + amount);
    }
  }
  return out;
}

export async function getWeeklyPickEmPlayerWeeklyLedger(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  userId: number,
): Promise<WeeklyPickEmPlayerWeeklyLedger | null> {
  const isOneShot = isWeeklyPickEmOneShotCommissionerBalancesPool(pool);
  if (!isWeeklyPickEmCommissionerBalancesPool(pool) && !isOneShot) return null;

  const [member] = await db
    .select({ userId: entriesTable.userId, prizeAmount: entriesTable.prizeAmount })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!member) return null;

  const paidFlags = await loadWeeklyPickEmCommissionerPaidFlags(poolId);
  const entryFee = pool.entryFee ?? 0;
  const periodSpecs = await listCompletedPeriodSpecs(pool, poolId);

  if (isOneShot) {
    const completedWeekCount = 1;
    const allMembers = await db
      .select({ userId: entriesTable.userId, prizeAmount: entriesTable.prizeAmount })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, poolId));
    const prizeByUser = await resolveOneShotWeeklyContestPrizeByUser(
      pool,
      poolId,
      allMembers,
      periodSpecs,
    );
    const periodKey =
      periodSpecs[0]?.periodKey ?? weeklyPickEmOneShotContestPeriodKey(pool.currentWeek);
    let weeklyWon = prizeByUser.get(userId) ?? 0;
    if (paidFlags.periodPaidKeys.has(periodKey)) weeklyWon = 0;

    const entryWeeksCollected = resolveEntryWeeksCollected(userId, completedWeekCount, paidFlags);
    const entryFeeTotal = entryFee;
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
      outstandingNet: entryFeeRemaining - weeklyWon,
    };
  }

  const payoutModel = resolveWeeklyPickEmPayoutModel(pool);
  if (payoutModel !== "period_pot" && payoutModel !== "season_budget") return null;

  const completedWeekCount = payoutModel === "season_budget" ? 1 : periodSpecs.length;

  let weeklyWon = 0;
  for (const spec of periodSpecs) {
    const prizeMap = await computePickEmPeriodPrizeByUser(pool, poolId, spec.target);
    const amount = prizeMap?.get(userId) ?? 0;
    if (amount > 0) weeklyWon += amount;
  }

  const seasonPrizeWon =
    member.prizeAmount != null ? roundMoney(Number(member.prizeAmount)) : 0;
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
  const isOneShot = isWeeklyPickEmOneShotCommissionerBalancesPool(pool);
  const payoutModel = isOneShot ? null : resolveWeeklyPickEmPayoutModel(pool);
  const useIncrementalEntryCollection =
    (isOneShot && entryFee > 0)
    || (isWeeklyPickEmPayoutModelPool(pool)
      && entryFee > 0
      && (payoutModel === "period_pot" || payoutModel === "season_budget"));

  const periodSpecs = await listCompletedPeriodSpecs(pool, poolId);
  const completedWeekCount = useIncrementalEntryCollection
    ? isOneShot
      ? 1
      : payoutModel === "season_budget"
        ? 1
        : periodSpecs.length
    : undefined;
  const weeklyEntryPerPlayer =
    useIncrementalEntryCollection && completedWeekCount != null
      ? weeklyPickEmWeeklyEntryDollars(entryFee, completedWeekCount)
      : entryFee;

  const winsByUser = new Map<number, WeeklyPeriodWinLine[]>();
  const periods: WeeklyPickEmPeriodSummary[] = [];

  if (isOneShot) {
    const prizeByUser = await resolveOneShotWeeklyContestPrizeByUser(
      pool,
      poolId,
      members,
      periodSpecs,
    );
    const spec = periodSpecs[0];
    const periodKey = spec?.periodKey ?? weeklyPickEmOneShotContestPeriodKey(pool.currentWeek);
    const label = spec?.label ?? "Contest";
    let totalOwed = 0;
    for (const [userId, amount] of prizeByUser) {
      if (amount <= 0) continue;
      totalOwed += amount;
      winsByUser.set(userId, [{ periodKey, label, amount }]);
    }
    if (totalOwed > 0 && spec) {
      periods.push({
        periodKey,
        label,
        weekStart: spec.weekStart,
        weekEnd: spec.weekEnd,
        totalOwed,
        periodPaid: paidFlags.periodPaidKeys.has(periodKey),
      });
    }
  } else {
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
  }

  const players: WeeklyPickEmBalancePlayer[] = members.map((m) => {
    const periodWins = winsByUser.get(m.userId) ?? [];
    let weeklyWon = periodWins.reduce((s, w) => s + w.amount, 0);
    const seasonPrizeWon = isOneShot
      ? 0
      : m.prizeAmount != null
        ? roundMoney(Number(m.prizeAmount))
        : 0;
    if (isOneShot && periodWins.length > 0) {
      const periodKey = periodWins[0]!.periodKey;
      if (paidFlags.periodPaidKeys.has(periodKey)) weeklyWon = 0;
    }
    const totalWon = weeklyWon + seasonPrizeWon;

    if (useIncrementalEntryCollection && completedWeekCount != null && completedWeekCount >= 0) {
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
