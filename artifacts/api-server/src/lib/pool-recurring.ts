const ONE_SHOT_BRACKET_POOL_TYPES = new Set(["mlb_bracket", "wc_bracket"]);

/** Pool types where the commissioner chooses recurring vs one-time. */
export function isRecurringConfigurablePool(pool: {
  sport: string;
  poolType: string;
}): boolean {
  const pt = pool.poolType;
  if (pt === "crazy_8s" || pt === "fast_break_multiplier" || pt === "nfl_confidence_weekly" || pt === "nba_ats") {
    return true;
  }
  if (pt === "pickem" && ["mlb", "nhl", "mls", "superleague"].includes(pool.sport)) {
    return true;
  }
  return false;
}

export function resolveIsRecurringOnCreate(
  poolType: string,
  isRecurring: boolean | undefined,
): boolean {
  if (poolType === "crazy_8s" || poolType === "fast_break_multiplier") return true;
  if (ONE_SHOT_BRACKET_POOL_TYPES.has(poolType)) return false;
  if (typeof isRecurring === "boolean") return isRecurring;
  return true;
}

/** Bracket pools are always one-shot even if legacy rows have is_recurring=true. */
export function effectivePoolIsRecurring(pool: {
  poolType: string;
  isRecurring: boolean;
}): boolean {
  if (ONE_SHOT_BRACKET_POOL_TYPES.has(pool.poolType)) return false;
  return pool.isRecurring;
}
