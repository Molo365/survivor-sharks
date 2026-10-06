import { db } from "@workspace/db";
import { pickemPicksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  enrichPhaseLabel,
  fetchChampionsLeagueGamesForPeriodDates,
  listChampionsLeaguePickPeriods,
  resolveChampionsLeaguePeriodContext,
  type ChampionsLeaguePoolPeriod,
} from "./champions-league-pool-period";
import { getMlsConfiguredPeriod } from "./mls-weekly-period";
import { getSuperLeagueConfiguredPeriod } from "./superleague-period";
import { fetchCurrentChampionsLeagueSlate, getNhlWeekBounds, getSuperLeagueWeekBoundsEt, getWeekBoundsEt } from "./espn";

export type PickEmPeriodStatus = "current" | "completed";

export interface PickEmPeriodListItem {
  /** Stable id — CL/MLS/SL weekStart; NHL weekly Sat date (YYYY-MM-DD). */
  key: string;
  label: string;
  weekStart: string;
  weekEnd: string;
  dates: string[];
  status: PickEmPeriodStatus;
  canPick: boolean;
  /** NHL weekly pick-em: pool week counter (1-based). */
  weekNumber?: number;
}

function formatClRange(weekStart: string, weekEnd: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(new Date(`${weekStart}T12:00:00Z`))} – ${fmt.format(new Date(`${weekEnd}T12:00:00Z`))}`;
}

async function labelChampionsLeaguePeriod(period: ChampionsLeaguePoolPeriod): Promise<string> {
  const enriched = await enrichPhaseLabel(period);
  const range = formatClRange(enriched.weekStart, enriched.weekEnd);
  return enriched.phaseLabel ? `${enriched.phaseLabel} · ${range}` : range;
}

export async function listChampionsLeaguePickEmPeriods(
  poolId: number,
  now = new Date(),
): Promise<{ periods: PickEmPeriodListItem[]; defaultKey: string | null }> {
  const fromPicks = await listChampionsLeaguePickPeriods(poolId);
  const ctx = await resolveChampionsLeaguePeriodContext(poolId, now);
  const liveSlate = await fetchCurrentChampionsLeagueSlate(now);

  const byStart = new Map<string, ChampionsLeaguePoolPeriod>();
  for (const period of fromPicks) byStart.set(period.weekStart, period);
  if (ctx.current) byStart.set(ctx.current.weekStart, ctx.current);

  const sorted = [...byStart.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const currentKey = liveSlate && ctx.current ? ctx.current.weekStart : null;

  const periods: PickEmPeriodListItem[] = await Promise.all(
    sorted.map(async (period) => {
      const isCurrent = currentKey === period.weekStart;
      return {
        key: period.weekStart,
        label: await labelChampionsLeaguePeriod(period),
        weekStart: period.weekStart,
        weekEnd: period.weekEnd,
        dates: period.dates,
        status: isCurrent ? "current" : "completed",
        canPick: isCurrent,
      };
    }),
  );

  /** Default to the live matchday only; history is chosen explicitly in the dropdown. */
  const defaultKey = currentKey;

  return { periods, defaultKey };
}

export async function resolveChampionsLeaguePeriodByKey(
  poolId: number,
  periodStart: string,
  now = new Date(),
): Promise<ChampionsLeaguePoolPeriod | null> {
  const fromPicks = await listChampionsLeaguePickPeriods(poolId);
  const ctx = await resolveChampionsLeaguePeriodContext(poolId, now);
  const raw =
    fromPicks.find((p) => p.weekStart === periodStart)
    ?? (ctx.current?.weekStart === periodStart ? ctx.current : null)
    ?? (ctx.previous?.weekStart === periodStart ? ctx.previous : null);
  if (!raw) return null;
  return enrichPhaseLabel(raw);
}

export async function loadChampionsLeaguePeriodSlate(
  poolId: number,
  periodStart: string | undefined,
  now = new Date(),
): Promise<{
  period: ChampionsLeaguePoolPeriod;
  games: Awaited<ReturnType<typeof fetchChampionsLeagueGamesForPeriodDates>>;
  viewingPastPeriod: boolean;
} | null> {
  const ctx = await resolveChampionsLeaguePeriodContext(poolId, now);
  const liveSlate = await fetchCurrentChampionsLeagueSlate(now);

  let period: ChampionsLeaguePoolPeriod | null = null;
  let viewingPastPeriod = false;

  if (periodStart) {
    period = await resolveChampionsLeaguePeriodByKey(poolId, periodStart, now);
    if (!period) return null;
    viewingPastPeriod = !(liveSlate && ctx.current?.weekStart === period.weekStart);
  } else if (ctx.current) {
    period = ctx.current;
    viewingPastPeriod = !(liveSlate && ctx.current.weekStart === period.weekStart);
  } else {
    return null;
  }

  const games = await fetchChampionsLeagueGamesForPeriodDates(period.dates);
  return { period: await enrichPhaseLabel(period), games, viewingPastPeriod };
}

type CalendarSoccerSport = "mls" | "superleague";

type CalendarWeeklyPool = {
  sport: string;
  pickFrequency: string;
  initialPeriodStart: string | null;
};

function calendarWeekBounds(sport: CalendarSoccerSport, referenceDate: string) {
  return sport === "superleague"
    ? getSuperLeagueWeekBoundsEt(referenceDate)
    : getWeekBoundsEt(referenceDate);
}

function formatCalendarRange(weekStart: string, weekEnd: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(new Date(`${weekStart}T12:00:00Z`))} – ${fmt.format(new Date(`${weekEnd}T12:00:00Z`))}`;
}

async function listWeekStartsFromPicks(poolId: number, sport: CalendarSoccerSport): Promise<string[]> {
  const rows = await db
    .selectDistinct({ gameDate: pickemPicksTable.gameDate })
    .from(pickemPicksTable)
    .where(eq(pickemPicksTable.poolId, poolId));
  const weekStarts = new Set<string>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.gameDate)) continue;
    weekStarts.add(calendarWeekBounds(sport, row.gameDate).weekStart);
  }
  return [...weekStarts].sort();
}

export async function listCalendarSoccerPickEmPeriods(
  poolId: number,
  sport: CalendarSoccerSport,
  pool: CalendarWeeklyPool,
  now = new Date(),
): Promise<{ periods: PickEmPeriodListItem[]; defaultKey: string | null }> {
  const current = sport === "superleague"
    ? getSuperLeagueConfiguredPeriod(pool, now)
    : getMlsConfiguredPeriod(pool, now);
  const fromPicks = await listWeekStartsFromPicks(poolId, sport);
  const weekStarts = new Set(fromPicks);
  weekStarts.add(current.weekStart);

  const prefix = sport === "superleague" ? "Weekend" : "Week";
  const periods: PickEmPeriodListItem[] = [...weekStarts].sort().map((weekStart) => {
    const { weekEnd } = calendarWeekBounds(sport, weekStart);
    const isCurrent = weekStart === current.weekStart;
    const dates: string[] = [];
    return {
      key: weekStart,
      label: `${prefix} · ${formatCalendarRange(weekStart, weekEnd)}`,
      weekStart,
      weekEnd,
      dates,
      status: isCurrent ? "current" : "completed",
      canPick: isCurrent,
    };
  });

  return { periods, defaultKey: current.weekStart };
}

export function resolveCalendarSoccerPeriodBounds(
  sport: CalendarSoccerSport,
  pool: CalendarWeeklyPool,
  periodStart: string | undefined,
  now = new Date(),
): { weekStart: string; weekEnd: string; viewingPastPeriod: boolean } | null {
  const current = sport === "superleague"
    ? getSuperLeagueConfiguredPeriod(pool, now)
    : getMlsConfiguredPeriod(pool, now);

  if (!periodStart) {
    return { ...current, viewingPastPeriod: false };
  }

  const bounds = calendarWeekBounds(sport, periodStart);
  if (bounds.weekStart !== periodStart) return null;
  return {
    weekStart: bounds.weekStart,
    weekEnd: bounds.weekEnd,
    viewingPastPeriod: bounds.weekStart < current.weekStart,
  };
}

export type PickEmPeriodPool = CalendarWeeklyPool & {
  sport: string;
  poolType?: string;
  createdAt?: Date;
  currentWeek?: number;
};

export type NhlWeeklyPickEmPool = {
  createdAt: Date;
  currentWeek: number;
  initialPeriodStart: string | null;
};

export function getNhlPickEmWeekPeriodKey(pool: NhlWeeklyPickEmPool, weekNumber: number): string {
  return getNhlWeekBounds(pool.createdAt, weekNumber, pool.initialPeriodStart).days[0]!;
}

export async function listNhlPickEmPeriods(
  poolId: number,
  pool: NhlWeeklyPickEmPool,
): Promise<{ periods: PickEmPeriodListItem[]; defaultKey: string | null }> {
  const weekRows = await db
    .selectDistinct({ week: pickemPicksTable.week })
    .from(pickemPicksTable)
    .where(eq(pickemPicksTable.poolId, poolId));
  const weeks = new Set<number>();
  for (const row of weekRows) {
    if (row.week != null && row.week >= 1) weeks.add(row.week);
  }
  for (let w = 1; w <= pool.currentWeek; w++) weeks.add(w);

  const periods: PickEmPeriodListItem[] = [...weeks].sort((a, b) => a - b).map((weekNumber) => {
    const bounds = getNhlWeekBounds(pool.createdAt, weekNumber, pool.initialPeriodStart);
    const weekStart = bounds.days[0]!;
    const weekEnd = bounds.days.at(-1)!;
    const isCurrent = weekNumber === pool.currentWeek;
    return {
      key: weekStart,
      label: `Week ${weekNumber} · ${bounds.weekLabel}`,
      weekStart,
      weekEnd,
      dates: bounds.days,
      weekNumber,
      status: isCurrent ? "current" : "completed",
      canPick: isCurrent,
    };
  });

  return {
    periods,
    defaultKey: getNhlPickEmWeekPeriodKey(pool, pool.currentWeek),
  };
}

export function resolveNhlPickEmPeriod(
  pool: NhlWeeklyPickEmPool,
  periodStart: string | undefined,
): {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  dates: string[];
  viewingPastPeriod: boolean;
} | null {
  const resolveWeek = (weekNumber: number) => {
    const bounds = getNhlWeekBounds(pool.createdAt, weekNumber, pool.initialPeriodStart);
    return {
      weekNumber,
      weekStart: bounds.days[0]!,
      weekEnd: bounds.days.at(-1)!,
      dates: bounds.days,
      viewingPastPeriod: weekNumber < pool.currentWeek,
    };
  };

  if (!periodStart) return resolveWeek(pool.currentWeek);

  for (let w = 1; w <= pool.currentWeek; w++) {
    if (getNhlPickEmWeekPeriodKey(pool, w) === periodStart) return resolveWeek(w);
  }
  return null;
}

export async function listPickEmPeriodsForPool(
  poolId: number,
  pool: PickEmPeriodPool,
  now = new Date(),
): Promise<{ periods: PickEmPeriodListItem[]; defaultKey: string | null }> {
  if (pool.sport === "championsleague" && pool.pickFrequency === "weekly") {
    return listChampionsLeaguePickEmPeriods(poolId, now);
  }
  if ((pool.sport === "mls" || pool.sport === "superleague") && pool.pickFrequency === "weekly") {
    return listCalendarSoccerPickEmPeriods(poolId, pool.sport as CalendarSoccerSport, pool, now);
  }
  if (
    pool.sport === "nhl"
    && pool.pickFrequency === "weekly"
    && pool.poolType === "pickem"
    && pool.createdAt
    && pool.currentWeek != null
  ) {
    return listNhlPickEmPeriods(poolId, {
      createdAt: pool.createdAt,
      currentWeek: pool.currentWeek,
      initialPeriodStart: pool.initialPeriodStart,
    });
  }
  throw new Error("unsupported_pool");
}
