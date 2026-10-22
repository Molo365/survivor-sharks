export function crazyEightsCorrectPickPoints(
  poolType: string,
  pick: { confidencePoints: number | null; lockedDecimalOdds: number | null; result: string | null },
): number {
  if (pick.result !== "correct" || pick.confidencePoints == null) return 0;
  const cp = Number(pick.confidencePoints);
  if (!Number.isFinite(cp) || cp <= 0) return 0;
  if (poolType === "fast_break_multiplier") {
    const dec = pick.lockedDecimalOdds;
    if (dec == null || !Number.isFinite(dec) || dec < 1) return 0;
    return cp * dec;
  }
  return cp;
}
