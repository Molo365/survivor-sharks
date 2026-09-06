import { getWeekBoundsEt } from "./espn";

type MlsWeeklyPool = {
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

export function isMlsWeeklyPickem(pool: MlsWeeklyPool): boolean {
  return pool.sport === "mls" && pool.poolType === "pickem" && pool.pickFrequency === "weekly";
}

export function resolveMlsWeeklyStartDate(requestedStart: string | undefined, now = new Date()): string {
  const currentStart = getWeekBoundsEt(etDateString(now)).weekStart;
  const nextStart = offsetDate(currentStart, 7);
  return requestedStart === currentStart || requestedStart === nextStart ? requestedStart : currentStart;
}

export function getMlsWeeklyInitialPeriodStart(pool: MlsWeeklyPool, now = new Date()): string {
  return pool.initialPeriodStart ?? getWeekBoundsEt(etDateString(now)).weekStart;
}

export function isMlsWeeklyPreStart(pool: MlsWeeklyPool, now = new Date()): boolean {
  return isMlsWeeklyPickem(pool)
    && pool.initialPeriodStart !== null
    && etDateString(now) < pool.initialPeriodStart;
}

export function getMlsConfiguredPeriod(pool: MlsWeeklyPool, now = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const todayEt = etDateString(now);
  const reference = isMlsWeeklyPreStart(pool, now)
    ? getMlsWeeklyInitialPeriodStart(pool, now)
    : todayEt;
  return getWeekBoundsEt(reference);
}