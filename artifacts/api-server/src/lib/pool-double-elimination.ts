/** Pool types that use survivor picks (one team per period), not pick'em slates. */
export const SURVIVOR_POOL_TYPES = new Set([
  "season",
  "weekly",
  "mid_season",
  "dirty_dozen",
]);

/** Double-elimination (one warning strike) is only meaningful for NFL/MLB survivor pools. */
export function poolSupportsDoubleElimination(sport: string, poolType: string): boolean {
  return SURVIVOR_POOL_TYPES.has(poolType) && (sport === "nfl" || sport === "mlb");
}

export function resolveStoredDoubleElimination(
  sport: string,
  poolType: string,
  requested: unknown,
): boolean {
  return poolSupportsDoubleElimination(sport, poolType) && requested === true;
}
