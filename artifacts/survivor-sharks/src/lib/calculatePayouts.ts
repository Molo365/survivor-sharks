export const ORDINALS = [
  "1st", "2nd", "3rd", "4th", "5th",
  "6th", "7th", "8th", "9th", "10th",
] as const;

export function calculatePayouts(
  prizeStructure: Array<{ place: number; amount: number }> | null | undefined,
  maxEntries: number | null | undefined,
  actualEntries: number | null | undefined,
): Array<{ place: number; amount: number }> | null {
  if (!prizeStructure || prizeStructure.length === 0) return null;
  if (!maxEntries || maxEntries <= 0 || actualEntries == null || actualEntries >= maxEntries) {
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
  if (!maxEntries || maxEntries <= 0 || actualEntries == null || actualEntries >= maxEntries) {
    return prizePot;
  }
  return Math.round(prizePot * (actualEntries / maxEntries) * 100) / 100;
}
