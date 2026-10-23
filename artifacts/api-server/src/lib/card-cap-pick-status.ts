/** Status for pools where players submit a capped card (e.g. NBA ATS dirty dozen), not the full open slate. */
export type CardCapPickStatus = "pending" | "not_required" | "incomplete" | "submitted";

export function cardCapPickStatus(
  openGameIds: string[],
  pickedGameIds: string[],
  maxPicks: number,
): CardCapPickStatus {
  if (pickedGameIds.length === 0) {
    return openGameIds.length === 0 ? "not_required" : "pending";
  }

  const cardTarget = Math.min(maxPicks, openGameIds.length);
  if (cardTarget === 0) {
    return "submitted";
  }

  if (pickedGameIds.length >= cardTarget) {
    return "submitted";
  }

  const pickedSet = new Set(pickedGameIds);
  const unpickedOpen = openGameIds.filter((id) => !pickedSet.has(id));
  if (unpickedOpen.length === 0) {
    return "submitted";
  }

  return "incomplete";
}
