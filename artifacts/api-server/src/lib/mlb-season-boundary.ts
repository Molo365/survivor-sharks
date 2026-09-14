import {
  fetchMlbGamesForDateRangeChecked,
  type EspnGame,
} from "./espn";

export type MlbSeasonBoundaryGame = Pick<
  EspnGame,
  "seasonType" | "seasonYear" | "status"
>;

export function getMlbSeasonBoundaryWindow(season: number): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: `${season}0901`,
    endDate: `${season}1231`,
  };
}

/**
 * Returns true only when ESPN affirmatively shows that the target season has
 * entered the postseason and every regular-season event in the boundary window
 * is final or postponed. Missing, wrong-season, and incomplete data fail open.
 */
export function hasMlbRegularSeasonEnded(
  games: readonly MlbSeasonBoundaryGame[],
  season: number,
): boolean {
  const seasonGames = games.filter((game) => game.seasonYear === season);
  const regularSeasonGames = seasonGames.filter((game) => game.seasonType === 2);
  const hasPostseasonGame = seasonGames.some((game) => game.seasonType === 3);

  return hasPostseasonGame
    && regularSeasonGames.length > 0
    && regularSeasonGames.every((game) => game.status === "final" || game.status === "postponed");
}

export async function detectMlbRegularSeasonEnd(
  season: number,
): Promise<boolean> {
  const { startDate, endDate } = getMlbSeasonBoundaryWindow(season);
  const games = await fetchMlbGamesForDateRangeChecked(startDate, endDate);
  return games !== null && hasMlbRegularSeasonEnded(games, season);
}