/** Live NBA Pick'em (ATS): weekend picks require combined-points tiebreaker on submit. */

export function liveNbaAtsPickRequiresTiebreaker(opts: {
  isLiveNbaAts: boolean;
  entryTiebreakerPoints: number | null | undefined;
  requestTiebreakerPoints: unknown;
}): boolean {
  if (!opts.isLiveNbaAts) return false;
  if (opts.entryTiebreakerPoints != null) return false;
  return typeof opts.requestTiebreakerPoints !== "number";
}
