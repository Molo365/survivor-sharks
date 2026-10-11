/** Keep in sync with api-server `pool-double-elimination.ts`. */
export const SURVIVOR_POOL_TYPES = new Set([
  "season",
  "weekly",
  "mid_season",
  "dirty_dozen",
]);

export function poolSupportsDoubleElimination(sport: string, poolType: string): boolean {
  return SURVIVOR_POOL_TYPES.has(poolType) && (sport === "nfl" || sport === "mlb");
}
