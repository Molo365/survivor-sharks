import type { poolsTable } from "@workspace/db";
import {
  EspnGame,
  fetchGames,
  fetchNflGamesByWeek,
  fetchNhlGamesByWeek,
  NHL_SANDBOX_ANCHOR,
} from "./espn";
import { nhlSurvivorSlateForSettlement } from "./nhl-survivor-slate";

type SurvivorGridPool = Pick<
  typeof poolsTable.$inferSelect,
  "sport" | "season" | "isPreseason" | "sandboxMode" | "createdAt" | "initialPeriodStart"
>;

export function applyGamesToTeamKickoffMap(games: EspnGame[], map: Map<string, Date>): void {
  for (const game of games) {
    const kickoff = new Date(game.date);
    map.set(game.homeTeam.id, kickoff);
    map.set(game.awayTeam.id, kickoff);
  }
}

export async function buildSurvivorGridTeamKickoffMap(
  pool: SurvivorGridPool,
  weeks: number[],
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  const seasonType = pool.isPreseason ? 1 : 2;

  await Promise.all(
    weeks.map(async (week) => {
      let games: EspnGame[];
      if (pool.sport === "nfl") {
        games = await fetchNflGamesByWeek(week, pool.season ?? undefined, seasonType);
      } else if (pool.sport === "nhl") {
        const anchor = pool.sandboxMode ? NHL_SANDBOX_ANCHOR : pool.createdAt;
        const initialPeriodStart = pool.sandboxMode ? null : pool.initialPeriodStart;
        const weekGames = await fetchNhlGamesByWeek(
          anchor,
          week,
          seasonType,
          initialPeriodStart,
        );
        games = nhlSurvivorSlateForSettlement(weekGames);
      } else {
        games = await fetchGames(pool.sport, week, pool.season ?? undefined, seasonType);
      }
      applyGamesToTeamKickoffMap(games, map);
    }),
  );

  return map;
}
