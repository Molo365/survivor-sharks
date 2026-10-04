import { sandboxGameScoresTable } from "@workspace/db";
import { db } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  fetchGamesForDate,
  fetchNflGamesByWeek,
  fetchNhlGamesByWeek,
  fetchSuperLeagueGamesForDate,
  getNbaWeekendBounds,
  getNhlWeekBounds,
  getTodayEtDate,
  type EspnGame,
} from "./espn";
import { getSuperLeagueConfiguredPeriod } from "./superleague-period";
import { getMlsConfiguredPeriod } from "./mls-weekly-period";

export type PoolSlateContext = {
  id: number;
  sport: string;
  poolType: string;
  pickFrequency: string;
  currentWeek: number;
  season: number;
  isPreseason: boolean | null;
  sandboxMode: boolean | null;
  isActive: boolean;
  createdAt: Date;
  initialPeriodStart: string | null;
};

function datesInRangeEspn(start: string, end: string): string[] {
  const cursor = new Date(`${start}T00:00:00Z`);
  const finish = new Date(`${end}T00:00:00Z`);
  const dates: string[] = [];
  while (cursor <= finish) {
    dates.push(cursor.toISOString().slice(0, 10).replace(/-/g, ""));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Games that belong to this pool's current pick period (for live badges and open-pick checks). */
export async function fetchPoolSlateGames(pool: PoolSlateContext): Promise<EspnGame[]> {
  const pt = pool.poolType;
  const sport = pool.sport;

  if (pt === "pickem_season" || pt === "nfl_confidence" || pt === "nfl_confidence_weekly") {
    return fetchNflGamesByWeek(pool.currentWeek, pool.season, pool.isPreseason ? 1 : 2);
  }

  if (pt === "nba_ats") {
    const dates = getNbaWeekendBounds(pool.createdAt, pool.currentWeek).espnDates;
    const results = await Promise.all(dates.map((date) => fetchGamesForDate("nba", date)));
    const seen = new Set<string>();
    return results.flat().filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    });
  }

  if (pt === "crazy_8s" || pt === "crazy_eights") {
    if (sport === "mlb") {
      const today = getTodayEtDate().replace(/-/g, "");
      return fetchGamesForDate("mlb", today);
    }
    if (sport === "nhl") {
      const { days } = getNhlWeekBounds(pool.createdAt, pool.currentWeek, pool.initialPeriodStart);
      const results = await Promise.all(days.map((d) => fetchGamesForDate("nhl", d.replace(/-/g, ""), pool.isPreseason ? 1 : 2)));
      const seen = new Set<string>();
      return results.flat().filter((g) => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
    }
    if (sport === "nba") {
      const { espnDates } = getNbaWeekendBounds(pool.createdAt, pool.currentWeek);
      const results = await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d)));
      const seen = new Set<string>();
      return results.flat().filter((g) => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
    }
  }

  if (SURVIVOR_TYPES.has(pt) && sport === "nfl") {
    return fetchNflGamesByWeek(pool.currentWeek, pool.season, pool.isPreseason ? 1 : 2);
  }

  if (pt === "pickem") {
    if (pool.pickFrequency === "daily") {
      const today = getTodayEtDate().replace(/-/g, "");
      return fetchGamesForDate(sport, today);
    }
    if (sport === "nhl" && pool.pickFrequency === "weekly") {
      return fetchNhlGamesByWeek(
        pool.createdAt,
        pool.currentWeek,
        pool.isPreseason ? 1 : 2,
        pool.initialPeriodStart,
      );
    }
    if (sport === "superleague" && pool.pickFrequency === "weekly") {
      const bounds = getSuperLeagueConfiguredPeriod(pool);
      const results = await Promise.all(
        datesInRangeEspn(bounds.weekStart, bounds.weekEnd).map((d) => fetchSuperLeagueGamesForDate(d)),
      );
      const seen = new Set<string>();
      return results.flat().filter((g) => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
    }
    if (sport === "mls" && pool.pickFrequency === "weekly") {
      const bounds = getMlsConfiguredPeriod(pool);
      const results = await Promise.all(
        datesInRangeEspn(bounds.weekStart, bounds.weekEnd).map((d) => fetchGamesForDate("mls", d)),
      );
      const seen = new Set<string>();
      return results.flat().filter((g) => {
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
    }
  }

  return [];
}

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season"]);

export function isPickSummaryGameLocked(game: { date: string; hasStarted: boolean }): boolean {
  return game.hasStarted || new Date(game.date).getTime() <= Date.now();
}

export async function poolSlateHasLiveGames(
  pool: PoolSlateContext,
  sandboxLivePoolIds: Set<number>,
): Promise<boolean> {
  if (!pool.isActive) return false;
  if (pool.sandboxMode) return sandboxLivePoolIds.has(pool.id);
  const games = await fetchPoolSlateGames(pool);
  return games.some((game) => game.status === "in_progress");
}

export async function loadSandboxLivePoolIds(poolIds: number[]): Promise<Set<number>> {
  const live = new Set<number>();
  if (poolIds.length === 0) return live;
  const rows = await db
    .select({ poolId: sandboxGameScoresTable.poolId })
    .from(sandboxGameScoresTable)
    .where(and(
      inArray(sandboxGameScoresTable.poolId, poolIds),
      inArray(sandboxGameScoresTable.gameStatus, ["q1", "q2", "half", "q3", "q4", "in_progress"]),
    ));
  for (const row of rows) live.add(row.poolId);
  return live;
}

export function openSlateGames(games: EspnGame[]): EspnGame[] {
  return games.filter((game) => !game.isPostponed && !isPickSummaryGameLocked(game));
}
