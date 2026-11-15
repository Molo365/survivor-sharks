import { getNbaWeekendBounds } from "./espn";
import {
  getTuesdaySixAmOpensAfterPeriodEnd,
  isPlatformPromotionAllowedAfterPeriodEnd,
} from "./platform-period";
import { nhlSurvivorSaturdayDateEt } from "./nhl-survivor-slate";

export type CalendarSurvivorPeriodPool = {
  sport: string;
  poolType: string;
  createdAt: Date;
  initialPeriodStart?: string | null;
  sandboxMode?: boolean | null;
};

const CALENDAR_SURVIVOR_SPORTS = new Set(["nhl", "nba", "superleague"]);

export function isCalendarSurvivorSeasonPool(pool: {
  sport: string;
  poolType: string;
  sandboxMode?: boolean | null;
}): boolean {
  return (
    pool.poolType === "season"
    && CALENDAR_SURVIVOR_SPORTS.has(pool.sport)
    && !pool.sandboxMode
  );
}

/** Last ET calendar day of the pickable slate for one survivor week. */
export function calendarSurvivorPeriodLastDayEt(
  pool: CalendarSurvivorPeriodPool,
  week: number,
): string | null {
  if (!isCalendarSurvivorSeasonPool(pool)) return null;
  if (pool.sport === "nhl") {
    return nhlSurvivorSaturdayDateEt(
      pool.createdAt,
      week,
      pool.initialPeriodStart,
      false,
    );
  }
  if (pool.sport === "nba") {
    const { days } = getNbaWeekendBounds(pool.createdAt, week);
    return days.length > 0 ? days[days.length - 1]! : null;
  }
  return null;
}

export function calendarSurvivorNextPeriodOpensAt(
  periodLastDayEt: string,
  now = new Date(),
): string | null {
  if (isPlatformPromotionAllowedAfterPeriodEnd(periodLastDayEt, now)) return null;
  return getTuesdaySixAmOpensAfterPeriodEnd(periodLastDayEt).toISOString();
}

/**
 * When the old auto-advance jumped to N+1 before Tue 6 AM ET, roll back to N so
 * Sun–Mon still show the settled week (only when nobody has submitted for N+1).
 */
export function shouldReconcilePrematureCalendarSurvivorWeek(options: {
  currentWeek: number;
  previousWeekFinalized: boolean;
  currentWeekFinalized: boolean;
  currentWeekHasAnyPicks: boolean;
  promotionAllowedForPreviousPeriod: boolean;
}): boolean {
  if (options.currentWeek <= 1) return false;
  if (!options.previousWeekFinalized) return false;
  if (options.currentWeekFinalized) return false;
  if (options.currentWeekHasAnyPicks) return false;
  return !options.promotionAllowedForPreviousPeriod;
}