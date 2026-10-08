/**
 * Tiebreaker resolution.
 *
 * Default (NFL, NHL, NBA): one guess on the last slate game — closest wins; same
 * distance → split.
 *
 * MLB exception: runs (primary) then strikeouts (secondary) when primary distance
 * ties exactly — O/U totals often cluster on the same run guess in big pools.
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

function narrow(
  candidates: number[],
  guesses: Map<number, number | null>,
  actual: number | null,
): number[] | null {
  if (actual == null) return null;
  const diffs = candidates.map((uid) => ({
    uid,
    diff: guesses.get(uid) != null ? Math.abs(guesses.get(uid)! - actual) : Infinity,
  }));
  const min = Math.min(...diffs.map((d) => d.diff));
  if (!isFinite(min)) return null;
  const winners = diffs.filter((d) => d.diff === min).map((d) => d.uid);
  return winners.length < candidates.length ? winners : null;
}

/**
 * Primary stat decides; secondary used only when multiple players share the same
 * primary distance (MLB). Pass null secondary actuals to use single-stat mode only.
 */
export function resolveSequentialTiebreaker(
  tiedUserIds: number[],
  primaryGuesses: Map<number, number | null>,
  secondaryGuesses: Map<number, number | null>,
  primaryActual: number | null,
  secondaryActual: number | null,
): Set<number> | null {
  if (tiedUserIds.length <= 1) return null;

  if (secondaryActual == null) {
    return resolveClosestTiebreaker(tiedUserIds, primaryGuesses, primaryActual);
  }

  const afterPrimary = narrow(tiedUserIds, primaryGuesses, primaryActual);
  if (afterPrimary !== null) {
    if (afterPrimary.length === 1) return new Set(afterPrimary);
    const afterSecondary = narrow(afterPrimary, secondaryGuesses, secondaryActual);
    return afterSecondary ? new Set(afterSecondary) : new Set(afterPrimary);
  }

  const afterSecondary = narrow(tiedUserIds, secondaryGuesses, secondaryActual);
  return afterSecondary ? new Set(afterSecondary) : null;
}
