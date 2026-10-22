export function isCrazyEightsFamilyPoolType(poolType: string): boolean {
  return poolType === "crazy_8s" || poolType === "fast_break_multiplier";
}

export function isFastBreakMultiplierPool(pool: { poolType: string; sport: string }): boolean {
  return pool.poolType === "fast_break_multiplier" && pool.sport === "nba";
}
