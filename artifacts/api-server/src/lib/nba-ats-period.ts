import {
  etCalendarMidnightUtc,
  getNbaAtsSlateBounds,
  getSuperLeagueWeekBoundsEt,
  getWeekBoundsEt,
  NBA_SANDBOX_ANCHOR,
  type NbaWeekBounds,
} from "./espn";

export type NbaAtsPool = {
  sport: string;
  poolType: string;
  initialPeriodStart: string | null;
  createdAt: Date;
  sandboxMode: boolean | null;
  currentWeek: number;
};

function etDateString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function offsetDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isNbaAtsPool(pool: { sport: string; poolType: string }): boolean {
  return pool.sport === "nba" && pool.poolType === "nba_ats";
}

/** First Friday of the configured NBA ATS weekend (this or next slate). */
export function resolveNbaAtsStartDate(requestedStart: string | undefined, now = new Date()): string {
  const currentStart = getSuperLeagueWeekBoundsEt(etDateString(now)).weekStart;
  const nextStart = offsetDate(currentStart, 7);
  return requestedStart === currentStart || requestedStart === nextStart ? requestedStart : currentStart;
}

/** First Fri of the scoring weekend (stored on the pool as initialPeriodStart). */
export function getNbaAtsInitialPeriodStart(pool: Pick<NbaAtsPool, "initialPeriodStart">, now = new Date()): string {
  return pool.initialPeriodStart ?? resolveNbaAtsStartDate(undefined, now);
}

/**
 * When the pick sheet opens: Monday ET of the week that contains the first weekend.
 * Spread lines typically post Mon–Tue; games are still Fri–Sun.
 */
export function getNbaAtsPicksOpenDate(pool: Pick<NbaAtsPool, "initialPeriodStart">, now = new Date()): string {
  const weekendFriday = getNbaAtsInitialPeriodStart(pool, now);
  return getWeekBoundsEt(weekendFriday).weekStart;
}

export function isNbaAtsPreStart(pool: Pick<NbaAtsPool, "poolType" | "initialPeriodStart">, now = new Date()): boolean {
  return pool.poolType === "nba_ats"
    && pool.initialPeriodStart !== null
    && etDateString(now) < getNbaAtsPicksOpenDate(pool, now);
}

function weekendBoundsFromFriday(friday: string): NbaWeekBounds {
  const days = [friday, offsetDate(friday, 1), offsetDate(friday, 2)];
  const espnDates = days.map((day) => day.replace(/-/g, ""));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
  const weekLabel = days.length >= 2
    ? `${fmt.format(new Date(`${days[0]}T12:00:00Z`))} – ${fmt.format(new Date(`${days.at(-1)!}T12:00:00Z`))}`
    : friday;
  const weekStartUtc = etCalendarMidnightUtc(new Date(`${friday}T12:00:00Z`));
  const sundayMidnight = etCalendarMidnightUtc(new Date(`${days.at(-1)!}T12:00:00Z`));
  const weekEndUtc = new Date(sundayMidnight.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { weekStart: weekStartUtc, weekEnd: weekEndUtc, weekLabel, days, espnDates };
}

/** Fri–Sun slate for week N, honoring optional initialPeriodStart (first Friday). */
export function getNbaAtsSlateBoundsForPool(pool: NbaAtsPool, weekNumber: number): NbaWeekBounds {
  const anchor = pool.sandboxMode
    ? NBA_SANDBOX_ANCHOR
    : pool.createdAt instanceof Date
      ? pool.createdAt
      : new Date(pool.createdAt);
  if (!pool.initialPeriodStart) {
    return getNbaAtsSlateBounds(anchor, weekNumber);
  }
  const friday = offsetDate(pool.initialPeriodStart, (weekNumber - 1) * 7);
  return weekendBoundsFromFriday(friday);
}
