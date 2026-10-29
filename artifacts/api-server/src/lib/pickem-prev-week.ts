/** Default completed week for prev-week-results when ?week is omitted. */
export function resolveDefaultPrevPickemWeek(currentWeek: number): number | null {
  const prev = currentWeek - 1;
  return prev >= 1 ? prev : null;
}

export function offsetPickemDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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
