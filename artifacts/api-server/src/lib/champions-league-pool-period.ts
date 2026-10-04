import { db } from "@workspace/db";
import { pickemPicksTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { fetchCurrentChampionsLeagueSlate, fetchGamesForDate, formatDateEtDash } from "./espn";

/** Matches UEFA matchday clustering in espn.ts (gap > 3 days starts a new period). */
export const CHAMPIONS_LEAGUE_POOL_PERIOD_MAX_GAP_DAYS = 3;

export interface ChampionsLeaguePoolPeriod {
  dates: string[];
  weekStart: string;
  weekEnd: string;
  phaseLabel?: string;
}

function dayGapCalendarDays(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startMs = Date.UTC(sy!, sm! - 1, sd!);
  const endMs = Date.UTC(ey!, em! - 1, ed!);
  return Math.round((endMs - startMs) / 86_400_000);
}

export function groupSortedDatesIntoChampionsLeaguePeriods(sortedUniqueDates: string[]): string[][] {
  const dates = [...new Set(sortedUniqueDates)].sort();
  const periods: string[][] = [];
  for (const date of dates) {
    const current = periods.at(-1);
    if (!current) {
      periods.push([date]);
      continue;
    }
    const last = current.at(-1)!;
    if (dayGapCalendarDays(last, date) > CHAMPIONS_LEAGUE_POOL_PERIOD_MAX_GAP_DAYS) {
      periods.push([date]);
    } else {
      current.push(date);
    }
  }
  return periods;
}

function toPoolPeriod(dates: string[]): ChampionsLeaguePoolPeriod {
  const sorted = [...dates].sort();
  return {
    dates: sorted,
    weekStart: sorted[0]!,
    weekEnd: sorted[sorted.length - 1]!,
  };
}

export async function listChampionsLeaguePickPeriods(poolId: number): Promise<ChampionsLeaguePoolPeriod[]> {
  const rows = await db
    .selectDistinct({ gameDate: pickemPicksTable.gameDate })
    .from(pickemPicksTable)
    .where(eq(pickemPicksTable.poolId, poolId));
  const dateGroups = groupSortedDatesIntoChampionsLeaguePeriods(
    rows.map((row) => row.gameDate).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  );
  return dateGroups.map(toPoolPeriod);
}

async function periodHasGradedPicks(poolId: number, dates: string[]): Promise<boolean> {
  if (dates.length === 0) return false;
  const [row] = await db
    .select({
      graded: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} IN ('correct', 'incorrect', 'postponed'))`,
    })
    .from(pickemPicksTable)
    .where(and(
      eq(pickemPicksTable.poolId, poolId),
      inArray(pickemPicksTable.gameDate, dates),
    ));
  return Number(row?.graded ?? 0) > 0;
}

async function enrichPhaseLabel(period: ChampionsLeaguePoolPeriod): Promise<ChampionsLeaguePoolPeriod> {
  try {
    const games = await fetchGamesForDate("championsleague", period.weekStart.replace(/-/g, ""));
    const dateSet = new Set(period.dates);
    const inPeriod = games.filter((game) => dateSet.has(formatDateEtDash(new Date(game.date))));
    const seed = inPeriod.find((game) => game.phaseLabel) ?? inPeriod[0];
    if (!seed?.phaseLabel) return period;
    return { ...period, phaseLabel: seed.phaseLabel };
  } catch {
    return period;
  }
}

export type ChampionsLeaguePeriodContext = {
  current: ChampionsLeaguePoolPeriod | null;
  previous: ChampionsLeaguePoolPeriod | null;
};

/**
 * Derive current (ESPN slate) and previous (last graded pick period) matchdays for a pool.
 */
export async function resolveChampionsLeaguePeriodContext(
  poolId: number,
  now = new Date(),
): Promise<ChampionsLeaguePeriodContext> {
  const periods = await listChampionsLeaguePickPeriods(poolId);
  if (periods.length === 0) {
    return { current: null, previous: null };
  }

  const slate = await fetchCurrentChampionsLeagueSlate(now);
  const slateDates = new Set(slate?.dates ?? []);

  let currentIdx = -1;
  if (slateDates.size > 0) {
    currentIdx = periods.findIndex((period) => period.dates.some((d) => slateDates.has(d)));
  }

  const current = currentIdx >= 0 ? await enrichPhaseLabel(periods[currentIdx]!) : null;

  const searchStart = currentIdx >= 0 ? currentIdx - 1 : periods.length - 1;
  for (let i = searchStart; i >= 0; i--) {
    const candidate = periods[i]!;
    if (await periodHasGradedPicks(poolId, candidate.dates)) {
      return { current, previous: await enrichPhaseLabel(candidate) };
    }
  }

  return { current, previous: null };
}
