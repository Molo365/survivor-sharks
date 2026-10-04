import { db } from "@workspace/db";
import { crazyEightsPeriodResultsTable, pickemPicksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getNbaWeekendBounds, getNhlWeekBounds } from "./espn";
import type { PickEmPeriodListItem } from "./pickem-periods";

export type CrazyEightsPeriodPool = {
  sport: string;
  poolType: string;
  isRecurring: boolean;
  sandboxMode: boolean | null;
  createdAt: Date;
  currentWeek: number;
  initialPeriodStart: string | null;
};

function periodKeyNhl(pool: CrazyEightsPeriodPool, weekNumber: number): string {
  return getNhlWeekBounds(pool.createdAt, weekNumber, pool.initialPeriodStart).days[0]!;
}

function periodKeyNba(pool: CrazyEightsPeriodPool, weekNumber: number): string {
  return getNbaWeekendBounds(pool.createdAt, weekNumber).days[0]!;
}

async function distinctWeeksFromPicks(poolId: number): Promise<number[]> {
  const weekRows = await db
    .selectDistinct({ week: pickemPicksTable.week })
    .from(pickemPicksTable)
    .where(eq(pickemPicksTable.poolId, poolId));
  return weekRows
    .map((row) => row.week)
    .filter((week): week is number => week != null && week >= 1);
}

async function distinctWeeksFromPeriodResults(poolId: number): Promise<number[]> {
  const rows = await db
    .select({ week: crazyEightsPeriodResultsTable.week })
    .from(crazyEightsPeriodResultsTable)
    .where(eq(crazyEightsPeriodResultsTable.poolId, poolId));
  return rows.map((row) => row.week).filter((week) => week >= 1);
}

export async function listCrazyEightsPeriods(
  poolId: number,
  pool: CrazyEightsPeriodPool,
): Promise<{ periods: PickEmPeriodListItem[]; defaultKey: string | null }> {
  const isNhl = pool.sport === "nhl";
  const weeks = new Set<number>();
  for (const week of await distinctWeeksFromPicks(poolId)) weeks.add(week);
  for (const week of await distinctWeeksFromPeriodResults(poolId)) weeks.add(week);
  for (let w = 1; w <= pool.currentWeek; w++) weeks.add(w);

  const periods: PickEmPeriodListItem[] = [...weeks].sort((a, b) => a - b).map((weekNumber) => {
    const bounds = isNhl
      ? getNhlWeekBounds(pool.createdAt, weekNumber, pool.initialPeriodStart)
      : getNbaWeekendBounds(pool.createdAt, weekNumber);
    const weekStart = bounds.days[0]!;
    const weekEnd = bounds.days.at(-1)!;
    const isCurrent = weekNumber === pool.currentWeek;
    return {
      key: isNhl ? periodKeyNhl(pool, weekNumber) : periodKeyNba(pool, weekNumber),
      label: `Week ${weekNumber} · ${bounds.weekLabel}`,
      weekStart,
      weekEnd,
      dates: bounds.days,
      weekNumber,
      status: isCurrent ? "current" : "completed",
      canPick: isCurrent,
    };
  });

  const defaultKey = isNhl
    ? periodKeyNhl(pool, pool.currentWeek)
    : periodKeyNba(pool, pool.currentWeek);

  return { periods, defaultKey };
}

export function resolveCrazyEightsPeriod(
  pool: CrazyEightsPeriodPool,
  periodStart: string | undefined,
): {
  weekNumber: number;
  anchorDate: string;
  weekStart: string;
  weekEnd: string;
  dates: string[];
  viewingPastPeriod: boolean;
} | null {
  const resolveWeek = (weekNumber: number) => {
    const bounds = pool.sport === "nhl"
      ? getNhlWeekBounds(pool.createdAt, weekNumber, pool.initialPeriodStart)
      : getNbaWeekendBounds(pool.createdAt, weekNumber);
    return {
      weekNumber,
      anchorDate: bounds.days[0]!,
      weekStart: bounds.days[0]!,
      weekEnd: bounds.days.at(-1)!,
      dates: bounds.days,
      viewingPastPeriod: weekNumber < pool.currentWeek,
    };
  };

  if (!periodStart) return resolveWeek(pool.currentWeek);

  for (let w = 1; w <= pool.currentWeek; w++) {
    const key = pool.sport === "nhl" ? periodKeyNhl(pool, w) : periodKeyNba(pool, w);
    if (key === periodStart) return resolveWeek(w);
  }
  return null;
}
