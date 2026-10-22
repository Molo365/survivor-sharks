import type { EspnGame } from "./espn";
import { fetchNflGamesByWeek } from "./espn";

const NFL_PRESEASON_MAX_WEEK = 4;

export type NflPoolEspnContext = {
  season: number | null;
  isPreseason: boolean;
  currentWeek?: number;
};

/** Regular-season pools must not query ESPN preseason slates after week 4. */
export function resolveNflEspnSeasonType(
  pool: NflPoolEspnContext,
  week: number,
): 1 | 2 {
  if (pool.isPreseason && week <= NFL_PRESEASON_MAX_WEEK) return 1;
  return 2;
}

function seasonCandidates(pool: NflPoolEspnContext): number[] {
  const nowYear = new Date().getFullYear();
  const base = pool.season ?? nowYear;
  return [...new Set([base, nowYear, base + 1, base - 1].filter((y) => y >= 2000 && y <= 2100))];
}

/**
 * Load an NFL week slate for a pool. Retries ESPN and tries nearby season years when
 * the first request returns an empty list (transient outage or stale pool.season).
 */
export async function fetchNflGamesForPoolWeek(
  pool: NflPoolEspnContext,
  week: number,
): Promise<{ games: EspnGame[]; scheduleUnavailable: boolean }> {
  const seasonType = resolveNflEspnSeasonType(pool, week);
  for (const season of seasonCandidates(pool)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const games = await fetchNflGamesByWeek(week, season, seasonType);
      if (games.length > 0) {
        return { games, scheduleUnavailable: false };
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }
  return { games: [], scheduleUnavailable: true };
}
