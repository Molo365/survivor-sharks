/** Live NHL weekly Pick'em: Sunday slate picks require SOG on the same submit. */

export function liveNhlWeeklySundayPickRequiresTiebreaker(opts: {
  isLiveNhlWeekly: boolean;
  submitsSundayPick: boolean;
  entryTiebreakerShotsOnGoal: number | null | undefined;
  requestTiebreakerShotsOnGoal: unknown;
}): boolean {
  if (!opts.isLiveNhlWeekly || !opts.submitsSundayPick) return false;
  if (opts.entryTiebreakerShotsOnGoal != null) return false;
  return typeof opts.requestTiebreakerShotsOnGoal !== "number";
}
