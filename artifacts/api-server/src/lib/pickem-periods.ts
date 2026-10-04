import {
  enrichPhaseLabel,
  fetchChampionsLeagueGamesForPeriodDates,
  listChampionsLeaguePickPeriods,
  resolveChampionsLeaguePeriodContext,
  type ChampionsLeaguePoolPeriod,
} from "./champions-league-pool-period";
import { fetchCurrentChampionsLeagueSlate } from "./espn";

export type PickEmPeriodStatus = "current" | "completed";

export interface PickEmPeriodListItem {
  /** Stable id — for CL, the period weekStart (YYYY-MM-DD). */
  key: string;
  label: string;
  weekStart: string;
  weekEnd: string;
  dates: string[];
  status: PickEmPeriodStatus;
  canPick: boolean;
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

  const defaultKey = currentKey
    ?? (ctx.previous?.weekStart ?? periods.at(-1)?.key ?? null);

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
  } else if (liveSlate && ctx.current) {
    period = ctx.current;
    viewingPastPeriod = false;
  } else if (ctx.previous) {
    period = ctx.previous;
    viewingPastPeriod = true;
  } else {
    return null;
  }

  const games = await fetchChampionsLeagueGamesForPeriodDates(period.dates);
  return { period: await enrichPhaseLabel(period), games, viewingPastPeriod };
}
