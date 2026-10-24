/** Default completed week for prev-week-results when ?week is omitted. */
export function resolveDefaultPrevPickemWeek(currentWeek: number): number | null {
  const prev = currentWeek - 1;
  return prev >= 1 ? prev : null;
}

/** NBA ATS prev-week banner/prizes only after the Fri–Sun window has ended (ET calendar day). */
export function isNbaAtsPrevWeekSettled(
  weekEndEt: string,
  todayEt: string,
  poolCurrentWeek: number,
  prevWeekNum: number,
): boolean {
  if (poolCurrentWeek > prevWeekNum) return true;
  return todayEt > weekEndEt;
}
