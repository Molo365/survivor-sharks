const ONE_SHOT_BRACKET_POOL_TYPES = new Set(["mlb_bracket", "wc_bracket"]);

export function isRecurringBadgeApplicable(pool: {
  sport: string;
  poolType: string;
}): boolean {
  const pt = pool.poolType;
  if (pt === "crazy_8s" || pt === "nfl_confidence_weekly" || pt === "nba_ats") {
    return true;
  }
  if (pt === "pickem" && ["mlb", "nhl", "mls", "superleague"].includes(pool.sport)) {
    return true;
  }
  return false;
}

export function effectivePoolIsRecurring(pool: {
  poolType: string;
  isRecurring: boolean;
}): boolean {
  if (ONE_SHOT_BRACKET_POOL_TYPES.has(pool.poolType)) return false;
  return pool.isRecurring;
}
