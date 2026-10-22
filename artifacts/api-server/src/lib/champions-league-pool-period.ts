import { db } from "@workspace/db";
import { pickemPicksTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  fetchChampionsLeaguePickemSlates,
  fetchCurrentChampionsLeagueSlate,
  fetchGamesForDate,
  formatDateEtDash,
  isChampionsLeaguePeriodWithinPickemVisibilityWindow,
  type EspnGame,
} from "./espn";
import {
  isChampionsLeaguePoolPicksOpen,
  resolveChampionsLeagueDefaultPeriodKey,
} from "./champions-league-default-period";
import { openSlateGames } from "./pool-slate-live";

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

export function toPoolPeriod(dates: string[]): ChampionsLeaguePoolPeriod {
  const sorted = [...dates].sort();
  return {
    dates: sorted,
    weekStart: sorted[0]!,
    weekEnd: sorted[sorted.length - 1]!,
  };
}

/** Merge pick-history periods with the live ESPN slate so new pools see the open matchday. */
export function mergeChampionsLeaguePeriodsWithLiveSlate(
  fromPicks: ChampionsLeaguePoolPeriod[],
  slateDates: string[],
): ChampionsLeaguePoolPeriod[] {
  const periods = [...fromPicks];
  if (slateDates.length === 0) {
    return periods.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }
  const slatePeriod = toPoolPeriod(slateDates);
  const overlapsSlate = periods.some(
    (period) =>
      period.weekStart === slatePeriod.weekStart
      || period.dates.some((date) => slatePeriod.dates.includes(date)),
  );
  if (!overlapsSlate) periods.push(slatePeriod);
  return periods.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
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

export async function enrichPhaseLabel(period: ChampionsLeaguePoolPeriod): Promise<ChampionsLeaguePoolPeriod> {
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

export async function fetchChampionsLeagueGamesForPeriodDates(dates: string[]): Promise<EspnGame[]> {
  const results = await Promise.all(
    dates.map((date) => fetchGamesForDate("championsleague", date.replace(/-/g, ""))),
  );
  const seen = new Set<string>();
  const games: EspnGame[] = [];
  for (const dayGames of results) {
    for (const game of dayGames) {
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      games.push(game);
    }
  }
  return games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Pure selection for tests: which period indices are "current" (open slate) vs "previous" (results).
 */
export function pickChampionsLeaguePeriodIndices(
  periods: ChampionsLeaguePoolPeriod[],
  gradedWeekStarts: string[],
  slateDates: string[],
): { current: number | null; previous: number | null } {
  if (periods.length === 0) return { current: null, previous: null };

  const graded = new Set(gradedWeekStarts);
  const gradedIndices = periods
    .map((period, index) => ({ index, period }))
    .filter(({ period }) => graded.has(period.weekStart))
    .map(({ index }) => index);

  let current: number | null = null;
  if (slateDates.length > 0) {
    const slateSet = new Set(slateDates);
    const idx = periods.findIndex((period) => period.dates.some((d) => slateSet.has(d)));
    if (idx >= 0) current = idx;
  }

  let previous: number | null = null;

  if (current !== null) {
    for (let i = gradedIndices.length - 1; i >= 0; i--) {
      const gi = gradedIndices[i]!;
      if (periods[gi]!.weekEnd < periods[current]!.weekStart) {
        previous = gi;
        break;
      }
    }
    // Only matchday so far, already graded — show results instead of an empty "current" slate.
    if (previous === null && graded.has(periods[current]!.weekStart)) {
      previous = current;
      current = null;
    }
  } else if (gradedIndices.length > 0) {
    previous = gradedIndices[gradedIndices.length - 1]!;
  }

  return { current, previous };
}

export type ChampionsLeaguePeriodContext = {
  current: ChampionsLeaguePoolPeriod | null;
  previous: ChampionsLeaguePoolPeriod | null;
};

function championsLeagueEspnPeriodDates(
  slates: Awaited<ReturnType<typeof fetchChampionsLeaguePickemSlates>>,
): string[] {
  const dates = new Set<string>();
  for (const slate of [slates.visible, slates.upcoming, slates.lastCompleted]) {
    for (const date of slate?.dates ?? []) dates.add(date);
  }
  return [...dates];
}

/**
 * Derive current (ESPN slate) and previous (last graded pick period) matchdays for a pool.
 */
export async function resolveChampionsLeaguePeriodContext(
  poolId: number,
  now = new Date(),
): Promise<ChampionsLeaguePeriodContext> {
  const fromPicks = await listChampionsLeaguePickPeriods(poolId);
  const slates = await fetchChampionsLeaguePickemSlates(now);
  let periods = mergeChampionsLeaguePeriodsWithLiveSlate(
    fromPicks,
    championsLeagueEspnPeriodDates(slates),
  );
  if (periods.length === 0) {
    return { current: null, previous: null };
  }

  const gradedWeekStarts: string[] = [];
  for (const period of periods) {
    if (await periodHasGradedPicks(poolId, period.dates)) {
      gradedWeekStarts.push(period.weekStart);
    }
  }

  const slateDatesForCurrent =
    slates.visible?.dates
    ?? slates.upcoming?.dates
    ?? [];

  let { current: currentIdx, previous: previousIdx } = pickChampionsLeaguePeriodIndices(
    periods,
    gradedWeekStarts,
    slateDatesForCurrent,
  );

  if (previousIdx === null && slates.lastCompleted) {
    const lastPeriod = toPoolPeriod(slates.lastCompleted.dates);
    if (!periods.some((p) => p.weekStart === lastPeriod.weekStart)) {
      periods = [...periods, lastPeriod].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    }
    previousIdx = periods.findIndex((p) => p.weekStart === lastPeriod.weekStart);
    if (previousIdx < 0) previousIdx = null;
  }

  if (currentIdx === null && slates.upcoming) {
    const upcomingPeriod = toPoolPeriod(slates.upcoming.dates);
    if (!periods.some((p) => p.weekStart === upcomingPeriod.weekStart)) {
      periods = [...periods, upcomingPeriod].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    }
    currentIdx = periods.findIndex((p) => p.weekStart === upcomingPeriod.weekStart);
    if (currentIdx < 0) currentIdx = null;
  }

  const current = currentIdx !== null ? await enrichPhaseLabel(periods[currentIdx]!) : null;
  const previous = previousIdx !== null ? await enrichPhaseLabel(periods[previousIdx]!) : null;

  return { current, previous };
}

export type ChampionsLeagueOpenPickState = {
  openPeriod: ChampionsLeaguePoolPeriod | null;
  /** Period shown on My Picks summary when picks are not open. */
  displayPeriod: ChampionsLeaguePoolPeriod | null;
  pickDates: string[];
  openGames: EspnGame[];
};

export async function resolveChampionsLeagueOpenPickState(
  poolId: number,
  now = new Date(),
): Promise<ChampionsLeagueOpenPickState> {
  const ctx = await resolveChampionsLeaguePeriodContext(poolId, now);
  const liveSlate = await fetchCurrentChampionsLeagueSlate(now);
  const hasVisibleLiveSlate =
    liveSlate != null
    && isChampionsLeaguePeriodWithinPickemVisibilityWindow(liveSlate.games, now);

  const defaultKey = resolveChampionsLeagueDefaultPeriodKey(ctx, hasVisibleLiveSlate, now);
  let displayPeriod: ChampionsLeaguePoolPeriod | null = null;
  if (defaultKey) {
    if (ctx.current?.weekStart === defaultKey) displayPeriod = ctx.current;
    else if (ctx.previous?.weekStart === defaultKey) displayPeriod = ctx.previous;
    else {
      const fromPicks = await listChampionsLeaguePickPeriods(poolId);
      const slates = await fetchChampionsLeaguePickemSlates(now);
      const merged = mergeChampionsLeaguePeriodsWithLiveSlate(
        fromPicks,
        championsLeagueEspnPeriodDates(slates),
      );
      displayPeriod = merged.find((p) => p.weekStart === defaultKey) ?? null;
    }
  }

  if (!isChampionsLeaguePoolPicksOpen(ctx, hasVisibleLiveSlate, now) || !ctx.current) {
    return {
      openPeriod: null,
      displayPeriod,
      pickDates: [],
      openGames: [],
    };
  }

  const games = await fetchChampionsLeagueGamesForPeriodDates(ctx.current.dates);
  const openGames = openSlateGames(
    games.filter((game) => game.status !== "suspended" && game.status !== "postponed" && !game.isPostponed),
  );

  return {
    openPeriod: ctx.current,
    displayPeriod: ctx.current,
    pickDates: ctx.current.dates,
    openGames,
  };
}
