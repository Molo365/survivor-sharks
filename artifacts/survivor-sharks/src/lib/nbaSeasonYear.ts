/** ESPN NBA season year (end year of the season, e.g. 2027 for 2026–27). */
export function nbaSeasonYearFromDate(d = new Date()): number {
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 9 ? y + 1 : y;
}