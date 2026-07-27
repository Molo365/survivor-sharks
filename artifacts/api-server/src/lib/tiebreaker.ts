/**
 * Sequential tiebreaker resolution — the single source of truth for all pool types.
 *
 * Rule:
 *   1. Primary stat alone decides (smallest |guess − actual| wins outright).
 *   2. Secondary stat is consulted ONLY when two or more players are exactly tied
 *      on the primary diff.
 *   3. If still tied on both stats (or actuals unavailable / guesses missing),
 *      the returned value is null → caller falls back to an even-prize split.
 *
 * Sport primary / secondary pairs:
 *   MLB  — runs (primary),          strikeouts (secondary)
 *   NHL  — shots on goal (primary), penalty minutes (secondary)
 *   NFL  — passing yards (primary), rushing yards (secondary)
 *   NBA  — total points (primary),  three-pointers made (secondary)
 *
 * @param tiedUserIds     The userId values of all players tied at the same rank.
 * @param primaryGuesses  userId → primary stat guess (null = not submitted).
 * @param secondaryGuesses userId → secondary stat guess (null = not submitted).
 * @param primaryActual   Actual primary stat value; null if unavailable.
 * @param secondaryActual Actual secondary stat value; null if unavailable.
 * @returns A Set of winning userIds (always smaller than tiedUserIds), or null
 *          when the stat(s) cannot differentiate the tied players.
 */
export function resolveSequentialTiebreaker(
  tiedUserIds: number[],
  primaryGuesses: Map<number, number | null>,
  secondaryGuesses: Map<number, number | null>,
  primaryActual: number | null,
  secondaryActual: number | null,
): Set<number> | null {
  if (tiedUserIds.length <= 1) return null;

  /**
   * Narrows `candidates` to the subset closest to `actual` using `guesses`.
   * Returns the winning subset when it is strictly smaller than `candidates`,
   * or null when the stat cannot differentiate (all tied, all missing, or
   * actual is null).
   */
  const narrow = (
    candidates: number[],
    guesses: Map<number, number | null>,
    actual: number | null,
  ): number[] | null => {
    if (actual == null) return null;
    const diffs = candidates.map((uid) => ({
      uid,
      diff: guesses.get(uid) != null ? Math.abs(guesses.get(uid)! - actual) : Infinity,
    }));
    const min = Math.min(...diffs.map((d) => d.diff));
    if (!isFinite(min)) return null;
    const winners = diffs.filter((d) => d.diff === min).map((d) => d.uid);
    return winners.length < candidates.length ? winners : null;
  };

  // Step 1 — primary stat across all tied players.
  const afterPrimary = narrow(tiedUserIds, primaryGuesses, primaryActual);
  if (afterPrimary !== null) {
    // Primary differentiated at least one player.
    if (afterPrimary.length === 1) return new Set(afterPrimary);
    // Still multiple tied on primary — consult secondary among them only.
    const afterSecondary = narrow(afterPrimary, secondaryGuesses, secondaryActual);
    return afterSecondary ? new Set(afterSecondary) : new Set(afterPrimary);
  }

  // Step 2 — all tied on primary (or primary unavailable) — try secondary across all.
  const afterSecondary = narrow(tiedUserIds, secondaryGuesses, secondaryActual);
  return afterSecondary ? new Set(afterSecondary) : null;
}
