import { getWeekBoundsEt } from "./espn";
import { etWallClockToUtc } from "./nfl-slate-reveal";

/** Platform week: prior period viewable through Monday; next period opens Tuesday 6:00 AM ET. */
export const PLATFORM_PERIOD_OPENS_TUE_HOUR_ET = 6;

export const PLATFORM_TUESDAY_OPENS_SENTENCE =
  "Results for the current period stay available through Monday. Picks for the next period open Tuesday at 6:00 AM ET.";

function offsetDateEt(ymd: string, days: number): string {
  const value = new Date(`${ymd}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function etDayOfWeekFromYmd(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/** First Tuesday at 6:00 AM ET on or after the day following `periodLastDayEt`. */
export function getTuesdaySixAmOpensAfterPeriodEnd(periodLastDayEt: string): Date {
  let candidate = offsetDateEt(periodLastDayEt, 1);
  while (etDayOfWeekFromYmd(candidate) !== 2) {
    candidate = offsetDateEt(candidate, 1);
  }
  return etWallClockToUtc(candidate, PLATFORM_PERIOD_OPENS_TUE_HOUR_ET, 0);
}

/** Pick sheet for a Mon–Sun week containing `anchorDateEt` (e.g. first Friday of NBA weekend). */
export function getTuesdaySixAmOpensForWeekContaining(anchorDateEt: string): Date {
  const { weekStart } = getWeekBoundsEt(anchorDateEt);
  const tuesdayEt = offsetDateEt(weekStart, 1);
  return etWallClockToUtc(tuesdayEt, PLATFORM_PERIOD_OPENS_TUE_HOUR_ET, 0);
}

export function isPlatformPromotionAllowedAfterPeriodEnd(periodLastDayEt: string, now: Date): boolean {
  return now.getTime() >= getTuesdaySixAmOpensAfterPeriodEnd(periodLastDayEt).getTime();
}

export function isBeforePlatformPicksOpenForWeekContaining(anchorDateEt: string, now: Date): boolean {
  return now.getTime() < getTuesdaySixAmOpensForWeekContaining(anchorDateEt).getTime();
}

/** ET calendar date (YYYY-MM-DD) of the Tuesday 6 AM open for the week containing `anchorDateEt`. */
export function getPlatformPicksOpenDateEtForWeekContaining(anchorDateEt: string): string {
  const { weekStart } = getWeekBoundsEt(anchorDateEt);
  return offsetDateEt(weekStart, 1);
}
