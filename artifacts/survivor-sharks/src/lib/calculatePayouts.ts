export const ORDINALS = [
  "1st", "2nd", "3rd", "4th", "5th",
  "6th", "7th", "8th", "9th", "10th",
] as const;

export function calculatePayouts(
  prizeStructure: Array<{ place: number; amount: number }> | null | undefined,
  maxEntries: number | null | undefined,
  actualEntries: number | null | undefined,
  prizeMode?: "fixed" | "pct",
  entryFee?: number | null,
  /** When set (e.g. after weekly reserve), pct prizes use this pot instead of entry × entries. */
  seasonPotDollars?: number | null,
): Array<{ place: number; amount: number }> | null {
  if (!prizeStructure || prizeStructure.length === 0) return null;

  if (prizeMode === "pct") {
    // Pct mode: amounts are percentages (0–100). Compute dollar payout from
    // season pot dollars × (pct / 100), rounded to nearest $5.
    if (!actualEntries || actualEntries <= 0) return null;
    const pot =
      seasonPotDollars != null && seasonPotDollars >= 0
        ? seasonPotDollars
        : entryFee && entryFee > 0
          ? entryFee * actualEntries
          : 0;
    if (pot <= 0) return null;
    return prizeStructure.map((p) => ({
      place: p.place,
      amount: Math.round((p.amount / 100) * pot / 5) * 5,
    }));
  }

  // Fixed mode: existing scaling behavior unchanged.
  if (!maxEntries || maxEntries <= 0 || actualEntries == null || actualEntries <= 0 || actualEntries >= maxEntries) {
    return prizeStructure;
  }
  const scale = actualEntries / maxEntries;
  return prizeStructure.map((p) => ({
    place: p.place,
    amount: Math.round(p.amount * scale * 100) / 100,
  }));
}

export function scaledPrizePot(
  prizePot: number | null | undefined,
  maxEntries: number | null | undefined,
  actualEntries: number | null | undefined,
): number | null {
  if (prizePot == null || prizePot <= 0) return null;
  if (!maxEntries || maxEntries <= 0 || actualEntries == null || actualEntries <= 0 || actualEntries >= maxEntries) {
    return prizePot;
  }
  return Math.round(prizePot * (actualEntries / maxEntries) * 100) / 100;
}
