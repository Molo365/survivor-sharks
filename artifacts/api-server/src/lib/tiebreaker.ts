/**
 * Tiebreaker resolution — single stat, closest guess wins.
 *
 * Product rule (all pick'em / confidence / crazy-8s game slates):
 *   - One guess per tiebreaker moment, tied to the last game on the slate.
 *   - Smallest |guess − actual| wins.
 *   - If multiple players share the same smallest distance, split the prize (null).
 *   - Missing guess or missing actual → split (null).
 *
 * Stat by sport (what players enter):
 *   NFL — combined passing yards (both teams)
 *   MLB — combined runs scored
 *   NHL — combined shots on goal
 *   NBA — combined points (Hit the Ice)
 *
 * Legacy DB columns for a "secondary" stat may still exist; resolution ignores them.
 */

export function resolveClosestTiebreaker(
  tiedUserIds: number[],
  guesses: Map<number, number | null>,
  actual: number | null,
): Set<number> | null {
  if (tiedUserIds.length <= 1) return null;
  if (actual == null) return null;

  const diffs = tiedUserIds.map((uid) => ({
    uid,
    diff: guesses.get(uid) != null ? Math.abs(guesses.get(uid)! - actual) : Infinity,
  }));
  const min = Math.min(...diffs.map((d) => d.diff));
  if (!isFinite(min)) return null;

  const winners = diffs.filter((d) => d.diff === min).map((d) => d.uid);
  if (winners.length === 1) return new Set(winners);
  return null;
}

/** @deprecated Secondary guesses are ignored; use resolveClosestTiebreaker via primary only. */
export function resolveSequentialTiebreaker(
  tiedUserIds: number[],
  primaryGuesses: Map<number, number | null>,
  _secondaryGuesses: Map<number, number | null>,
  primaryActual: number | null,
  _secondaryActual: number | null,
): Set<number> | null {
  return resolveClosestTiebreaker(tiedUserIds, primaryGuesses, primaryActual);
}
