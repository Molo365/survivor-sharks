import { isWeeklyBonusPoolType } from "./pool-start";

export type WeeklyPickEmPayoutModel = "period_pot" | "season_budget";

export type WeeklyPickEmPayoutPool = {
  sport: string;
  poolType: string;
  pickFrequency?: string | null;
  isRecurring?: boolean | null;
  weeklyPickEmPayoutModel?: string | null;
  weeklyBonusEnabled?: boolean | null;
};

const RECURRING_PICKEM_SPORTS = ["mlb", "nhl", "nba", "mls", "superleague", "championsleague"] as const;

/** Paid one-week office pools (NFL/MLB/NHL/MLS/Super League/NBA weekly pick-em). */
const ONE_SHOT_WEEKLY_PICKEM_SPORTS = ["nfl", "mlb", "nhl", "mls", "superleague", "nba"] as const;

export function isWeeklyPickEmPayoutModelPool(pool: WeeklyPickEmPayoutPool): boolean {
  return (
    pool.poolType === "pickem" &&
    pool.pickFrequency === "weekly" &&
    pool.isRecurring === true &&
    (RECURRING_PICKEM_SPORTS as readonly string[]).includes(pool.sport)
  );
}

/** Stored column with legacy inference from weeklyBonusEnabled. */
export function resolveWeeklyPickEmPayoutModel(pool: WeeklyPickEmPayoutPool): WeeklyPickEmPayoutModel | null {
  if (!isWeeklyPickEmPayoutModelPool(pool)) return null;
  if (pool.weeklyPickEmPayoutModel === "period_pot" || pool.weeklyPickEmPayoutModel === "season_budget") {
    return pool.weeklyPickEmPayoutModel;
  }
  // CL matchday standings are leaders-only unless explicitly period_pot; tournament buy-in + final prize.
  if (pool.sport === "championsleague") return "season_budget";
  return pool.weeklyBonusEnabled === true ? "season_budget" : "period_pot";
}

/** Weekly prev-week-results: prizeStructure % applies to entry × members for this week. */
export function shouldUsePeriodPotWeeklyPrizes(pool: WeeklyPickEmPayoutPool): boolean {
  const model = resolveWeeklyPickEmPayoutModel(pool);
  if (model === "season_budget") return false;
  return true;
}

/** Fixed weekly $ from season buy-in (NHL today; gated by weekly bonus fields). */
export function shouldUseSeasonBudgetFixedWeeklyPayout(pool: WeeklyPickEmPayoutPool): boolean {
  if (pool.weeklyBonusEnabled !== true || !isWeeklyBonusPoolType(pool)) return false;
  return resolveWeeklyPickEmPayoutModel(pool) === "season_budget";
}

export function normalizeWeeklyPickEmPayoutModelForCreate(opts: {
  sport: string;
  poolType: string;
  pickFrequency: string;
  isRecurring: boolean;
  requested: unknown;
}): "period_pot" | "season_budget" | null {
  if (
    !isWeeklyPickEmPayoutModelPool({
      sport: opts.sport,
      poolType: opts.poolType,
      pickFrequency: opts.pickFrequency,
      isRecurring: opts.isRecurring,
    })
  ) {
    return null;
  }
  return opts.requested === "season_budget" ? "season_budget" : "period_pot";
}

export function isWeeklyPickEmCommissionerBalancesPool(pool: {
  sport: string;
  poolType: string;
  pickFrequency: string;
  isRecurring: boolean;
  entryFee: number | null;
}): boolean {
  if (!pool.isRecurring || pool.pickFrequency !== "weekly" || pool.poolType !== "pickem") return false;
  if (pool.entryFee == null || pool.entryFee <= 0) return false;
  return isWeeklyPickEmPayoutModelPool(pool);
}

export function isWeeklyPickEmOneShotCommissionerBalancesPool(pool: {
  sport: string;
  poolType: string;
  pickFrequency: string;
  isRecurring?: boolean | null;
  entryFee: number | null;
}): boolean {
  if (pool.poolType !== "pickem" || pool.pickFrequency !== "weekly" || pool.isRecurring !== false) {
    return false;
  }
  if (pool.entryFee == null || pool.entryFee <= 0) return false;
  return (ONE_SHOT_WEEKLY_PICKEM_SPORTS as readonly string[]).includes(pool.sport);
}

/** Paid weekly pick-em with commissioner ledger (recurring payout-model pools or one-shot contests). */
export function isPickemWeeklyCommissionerBalancesPool(pool: {
  sport: string;
  poolType: string;
  pickFrequency: string;
  isRecurring?: boolean | null;
  entryFee: number | null;
}): boolean {
  return (
    isWeeklyPickEmCommissionerBalancesPool({
      sport: pool.sport,
      poolType: pool.poolType,
      pickFrequency: pool.pickFrequency,
      isRecurring: pool.isRecurring === true,
      entryFee: pool.entryFee,
    })
    || isWeeklyPickEmOneShotCommissionerBalancesPool(pool)
  );
}

export function weeklyPickEmOneShotContestPeriodKey(week: number): string {
  return `pickem-contest-w${week}`;
}
