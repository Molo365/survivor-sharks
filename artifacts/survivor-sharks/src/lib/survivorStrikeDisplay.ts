type GradedPick = { week: number; result?: string | null; userId?: number };

export function countSurvivorGradedLossesExcludingVoidWeeks(
  picks: readonly GradedPick[],
  voidedWeeks: readonly number[],
  options?: { userId?: number; maxWeek?: number },
): number {
  const voided = new Set(voidedWeeks);
  let count = 0;
  for (const pick of picks) {
    if (options?.userId !== undefined && pick.userId !== options.userId) continue;
    if (pick.result !== "loss") continue;
    if (voided.has(pick.week)) continue;
    if (options?.maxWeek !== undefined && pick.week > options.maxWeek) continue;
    count++;
  }
  return count;
}

export function survivorStrikeCountForDisplay(
  storedStrikeCount: number,
  gradedLossCount: number,
  maxLives: number,
): number {
  if (maxLives <= 1) return 0;
  const cappedLosses = Math.min(Math.max(gradedLossCount, 0), maxLives);
  return Math.max(storedStrikeCount, cappedLosses);
}