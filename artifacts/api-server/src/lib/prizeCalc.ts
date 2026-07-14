type PrizeEntry = { place: number; amount: number };

/**
 * Calculate the prize amount for a given finishing place.
 *
 * - prizeMode "fixed"  → entry.amount is a dollar amount
 * - prizeMode "pct"    → entry.amount is a percentage of the prize pot
 *                        pot = prizePot ?? (entryFee * totalEntries)
 * - No prizeStructure  → only 1st place gets a prize (= prizePot, if set)
 * - coWinners > 1      → prize is split equally (floor division)
 *
 * Returns null when no prize exists for the given place.
 */
export function calcPrize(opts: {
  place: number;
  coWinners: number;
  prizeStructure: PrizeEntry[] | null | undefined;
  prizeMode: string | null | undefined;
  entryFee: number | null | undefined;
  prizePot: number | null | undefined;
  totalEntries: number;
}): number | null {
  const { place, prizeStructure, prizeMode, entryFee, prizePot, totalEntries } = opts;
  const winners = Math.max(1, opts.coWinners);

  if (prizeStructure && prizeStructure.length > 0) {
    const entry = prizeStructure.find((p) => p.place === place);
    if (!entry) return null;

    if (prizeMode === "pct") {
      const pot =
        prizePot != null && prizePot > 0
          ? prizePot
          : entryFee != null && entryFee > 0
            ? entryFee * totalEntries
            : 0;
      if (pot <= 0) return null;
      const prize = Math.floor((entry.amount / 100) * pot);
      return winners === 1 ? prize : Math.floor(prize / winners);
    } else {
      return winners === 1 ? entry.amount : Math.floor(entry.amount / winners);
    }
  }

  if (place === 1 && prizePot != null && prizePot > 0) {
    return winners === 1 ? Math.floor(prizePot) : Math.floor(prizePot / winners);
  }

  return null;
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
