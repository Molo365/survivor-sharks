import { getWeekBoundsEt } from "./espn";

type MlbWeeklyPool = {
  sport: string;
  poolType: string;
  pickFrequency: string;
  initialPeriodStart: string | null;
  createdAt: Date;
};

function etDateString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isMlbWeeklyPickem(pool: MlbWeeklyPool): boolean {
  return pool.sport === "mlb" && pool.poolType === "pickem" && pool.pickFrequency === "weekly";
}

export function isMlbWeeklyHighHeat(pool: MlbWeeklyPool): boolean {
  return pool.sport === "mlb" && pool.poolType === "crazy_8s" && pool.pickFrequency === "weekly";
}

export function isMlbWeeklyPool(pool: MlbWeeklyPool): boolean {
  return isMlbWeeklyPickem(pool) || isMlbWeeklyHighHeat(pool);
}

export function getMlbWeeklyInitialPeriodStart(pool: MlbWeeklyPool): string {
  if (pool.initialPeriodStart) return pool.initialPeriodStart;
  return getWeekBoundsEt(etDateString(pool.createdAt)).weekStart;
}

export function getMlbWeeklyAnchor(pool: MlbWeeklyPool): Date {
  return new Date(`${getMlbWeeklyInitialPeriodStart(pool)}T12:00:00Z`);
}

export function isMlbWeeklyPreStart(pool: MlbWeeklyPool, now = new Date()): boolean {
  return isMlbWeeklyPool(pool) && etDateString(now) < getMlbWeeklyInitialPeriodStart(pool);
}

export function resolveMlbWeeklyStartDate(
  requestedStart: string | undefined,
  now = new Date(),
): string {
  const currentStart = getWeekBoundsEt(etDateString(now)).weekStart;
  const nextStart = new Date(`${currentStart}T12:00:00Z`);
  nextStart.setUTCDate(nextStart.getUTCDate() + 7);
  const allowed = new Set([currentStart, nextStart.toISOString().slice(0, 10)]);
  if (!requestedStart || !allowed.has(requestedStart)) return currentStart;
  return requestedStart;
}