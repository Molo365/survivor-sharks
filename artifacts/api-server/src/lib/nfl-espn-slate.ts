import type { EspnGame } from "./espn";
import { fetchGamesForDate, fetchNflGamesByWeek, getTodayEtDate } from "./espn";

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

function offsetEtDate(yyyyMmDd: string, dayDelta: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + dayDelta, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(utc);
}

/**
 * When ESPN's week scoreboard returns nothing (common during platform blips), load
 * the Thu–Mon window around today via per-day scoreboards — enough for TNF + weekend.
 */
async function fetchNflGamesDateWindowFallback(seasonType: 1 | 2): Promise<EspnGame[]> {
  const todayEt = getTodayEtDate();
  const espnDates = Array.from({ length: 8 }, (_, i) =>
    offsetEtDate(todayEt, i - 3).replace(/-/g, ""),
  );
  const results = await Promise.all(
    espnDates.map((date) => fetchGamesForDate("nfl", date, seasonType)),
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
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return games;
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

  const fallbackGames = await fetchNflGamesDateWindowFallback(seasonType);
  if (fallbackGames.length > 0) {
    return { games: fallbackGames, scheduleUnavailable: false };
  }

  return { games: [], scheduleUnavailable: true };
}
