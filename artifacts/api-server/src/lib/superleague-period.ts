import { getSuperLeagueWeekBoundsEt } from "./espn";

type SuperLeaguePool = {
  sport: string;
  poolType: string;
  pickFrequency: string;
  initialPeriodStart: string | null;
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

export function isSuperLeagueWeeklyPickem(pool: SuperLeaguePool): boolean {
  return pool.sport === "superleague" && pool.poolType === "pickem" && pool.pickFrequency === "weekly";
}

export function resolveSuperLeagueStartDate(requestedStart: string | undefined, now = new Date()): string {
  const currentStart = getSuperLeagueWeekBoundsEt(etDateString(now)).weekStart;
  const nextStart = offsetDate(currentStart, 7);
  return requestedStart === currentStart || requestedStart === nextStart ? requestedStart : currentStart;
}

export function getSuperLeagueInitialPeriodStart(pool: SuperLeaguePool, now = new Date()): string {
  return pool.initialPeriodStart ?? getSuperLeagueWeekBoundsEt(etDateString(now)).weekStart;
}

export function isSuperLeaguePreStart(pool: SuperLeaguePool, now = new Date()): boolean {
  return isSuperLeagueWeeklyPickem(pool)
    && pool.initialPeriodStart !== null
    && etDateString(now) < pool.initialPeriodStart;
}

export function getSuperLeagueConfiguredPeriod(pool: SuperLeaguePool, now = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const todayEt = etDateString(now);
  const reference = isSuperLeaguePreStart(pool, now)
    ? getSuperLeagueInitialPeriodStart(pool, now)
    : todayEt;
  return getSuperLeagueWeekBoundsEt(reference);
}

/**
 * Fri–Mon slate immediately before the configured "current" period.
 * Tue–Thu (before the upcoming Friday opens) the configured current period
 * already points at the next slate; offsetting its Friday by -7 lands on
 * the wrong window, so we anchor via Sunday inside the just-finished slate.
 */
export function getSuperLeaguePreviousConfiguredPeriod(pool: SuperLeaguePool, now = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const todayEt = etDateString(now);
  const current = getSuperLeagueConfiguredPeriod(pool, now);
  if (todayEt < current.weekStart) {
    return getSuperLeagueWeekBoundsEt(offsetDate(current.weekStart, -4));
  }
  return getSuperLeagueWeekBoundsEt(offsetDate(current.weekStart, -7));
}

export function getSuperLeaguePeriodWeeksBefore(
  pool: SuperLeaguePool,
  weeksBack: number,
  now = new Date(),
): { weekStart: string; weekEnd: string } {
  if (weeksBack < 1) {
    return getSuperLeagueConfiguredPeriod(pool, now);
  }
  let bounds = getSuperLeaguePreviousConfiguredPeriod(pool, now);
  for (let i = 1; i < weeksBack; i++) {
    bounds = getSuperLeagueWeekBoundsEt(offsetDate(bounds.weekStart, -7));
  }
  return bounds;
}