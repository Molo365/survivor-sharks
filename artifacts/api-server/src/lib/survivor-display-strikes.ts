type GradedPick = { week: number; result: string | null };

/** Count graded losses on non-void weeks (matches survivor grid red cells for settled voids). */
export function countSurvivorGradedLossesExcludingVoidWeeks(
  picks: readonly GradedPick[],
  voidedWeeks: ReadonlySet<number>,
  options?: { maxWeek?: number },
): number {
  const maxWeek = options?.maxWeek;
  let count = 0;
  for (const pick of picks) {
    if (pick.result !== "loss") continue;
    if (voidedWeeks.has(pick.week)) continue;
    if (maxWeek !== undefined && pick.week > maxWeek) continue;
    count++;
  }
  return count;
}

/**
 * Losses shown on strike badges and standings: at least the stored strike_count,
 * and at least graded losses so UI matches the grid when settlement lags.
 */
export function survivorStrikeCountForDisplay(
  storedStrikeCount: number,
  gradedLossCount: number,
  maxLives: number,
): number {
  if (maxLives <= 1) return 0;
  const cappedLosses = Math.min(Math.max(gradedLossCount, 0), maxLives);
  return Math.max(storedStrikeCount, cappedLosses);
}