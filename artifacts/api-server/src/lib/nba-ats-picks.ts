/** Max spread picks per NBA ATS weekend ("dirty dozen"). */
export const NBA_ATS_MAX_PICKS = 12;

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
