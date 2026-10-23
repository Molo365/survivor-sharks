import { cardCapPickStatus, type CardCapPickStatus } from "./card-cap-pick-status";

/** Max spread picks per NBA ATS weekend ("dirty dozen"). */
export const NBA_ATS_MAX_PICKS = 12;

export function nbaAtsPeriodPickStatus(
  openGameIds: string[],
  pickedGameIds: string[],
): CardCapPickStatus {
  return cardCapPickStatus(openGameIds, pickedGameIds, NBA_ATS_MAX_PICKS);
}

/** Pick reminders / completion: dirty-dozen cap, not full weekend slate size. */
export function nbaAtsRequiredPickCount(slateGameCount: number): number {
  return Math.min(NBA_ATS_MAX_PICKS, slateGameCount);
}

export function nbaAtsPickCountAfterMerge(
  existingGameIds: Iterable<string>,
  submittedGameIds: Iterable<string>,
): number {
  const merged = new Set(existingGameIds);
  for (const id of submittedGameIds) merged.add(id);
  return merged.size;
}

export function nbaAtsExceedsPickLimit(
  existingGameIds: Iterable<string>,
  submittedGameIds: Iterable<string>,
): boolean {
  return nbaAtsPickCountAfterMerge(existingGameIds, submittedGameIds) > NBA_ATS_MAX_PICKS;
}
