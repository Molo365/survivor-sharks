type PrizeEntry = { place: number; amount: number };

/** Round a dollar amount to the nearest $5. */
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * Calculate the prize for players tied at a given finishing position.
 *
 * Rules
 * ─────
 * • Pot (pct mode)  = prizePot if set and > 0, else entryFee × totalEntries.
 * • pct mode        : convert each structure entry from percentage → dollars,
 *                     then round to nearest $5.
 * • fixed mode      : scale each structure entry by (totalEntries / maxEntries)
 *                     when the pool is under capacity, then round to nearest $5.
 * • co-winners      : combine the prize amounts for ALL positions the tied group
 *                     collectively occupies (placeIndex … placeIndex+coWinners−1),
 *                     divide equally, round to nearest $5.
 *
 * @param placeIndex  0-based index of the leading structural position in this
 *                    tie group (0 = 1st place, 1 = 2nd place, …).
 *                    For the 2nd-rank group, pass the count of 1st-place winners.
 *                    For the 3rd-rank group, pass 1st-winners + 2nd-winners.
 * @param coWinners   Number of players sharing this finishing position.
 *
 * Returns null when no prize is defined for the given position.
 */
export function calcPrize(opts: {
  prizeStructure: PrizeEntry[] | null | undefined;
  prizeMode: string | null | undefined;
  entryFee: number | null | undefined;
  prizePot: number | null | undefined;
  totalEntries: number;
  maxEntries: number | null | undefined;
  placeIndex: number;
  coWinners: number;
}): number | null {
  const {
    prizeStructure, prizeMode, entryFee, prizePot,
    totalEntries, maxEntries, placeIndex,
  } = opts;
  const coWinners = Math.max(1, opts.coWinners);

  // Sort by place ascending so array index === structural position (0-based).
  const sorted: PrizeEntry[] = prizeStructure
    ? [...prizeStructure].sort((a, b) => a.place - b.place)
    : [];

  if (prizeMode === "pct") {
    const pot =
      prizePot != null && prizePot > 0
        ? prizePot
        : entryFee != null && entryFee > 0
          ? entryFee * totalEntries
          : 0;
    if (pot <= 0) return null;

    if (sorted.length === 0) {
      // No structure: only 1st-place position gets the pot
      if (placeIndex !== 0) return null;
      return round5(Math.floor(pot / coWinners));
    }

    // Combine percentages for all positions this co-winner group occupies
    let combinedPct = 0;
    for (let i = placeIndex; i < placeIndex + coWinners && i < sorted.length; i++) {
      combinedPct += sorted[i].amount;
    }
    if (combinedPct <= 0) return null;

    const combined = Math.floor((combinedPct / 100) * pot);
    return round5(Math.floor(combined / coWinners));
  }

  // Fixed mode: scale down when pool is under capacity
  const scale =
    maxEntries != null && maxEntries > 0 && totalEntries > 0 && totalEntries < maxEntries
      ? totalEntries / maxEntries
      : 1;

  if (sorted.length === 0) {
    // No structure: 1st place only, from prizePot
    if (placeIndex !== 0 || prizePot == null || prizePot <= 0) return null;
    return round5(Math.floor((prizePot * scale) / coWinners));
  }

  // Combine fixed amounts for all positions this co-winner group occupies
  let combinedAmount = 0;
  for (let i = placeIndex; i < placeIndex + coWinners && i < sorted.length; i++) {
    combinedAmount += sorted[i].amount;
  }
  if (combinedAmount <= 0) return null;

  const scaledCombined = Math.floor(combinedAmount * scale);
  return round5(Math.floor(scaledCombined / coWinners));
}

/**
 * Returns true if the pool's prizeStructure defines a prize for the given place.
 * Falls back to place === 1 only (via prizePot) when there is no prizeStructure.
 */
export function hasPrizePlace(
  prizeStructure: PrizeEntry[] | null | undefined,
  place: number,
): boolean {
  if (!prizeStructure || prizeStructure.length === 0) return place === 1;
  return prizeStructure.some((p) => p.place === place);
}
