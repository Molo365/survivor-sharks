import type { EspnGame } from "./espn";

export type PickemScoringMode = "straight" | "ats";

export function isNflPickemSeasonAts(pool: {
  poolType: string;
  pickemScoringMode?: PickemScoringMode | string | null;
}): boolean {
  return pool.poolType === "pickem_season" && (pool.pickemScoringMode ?? "straight") === "ats";
}

export function gradeNflPickemAtsPick(params: {
  pickedTeamId: string;
  favoriteTeamId: string;
  spread: number;
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
}): "correct" | "incorrect" {
  const { pickedTeamId, favoriteTeamId, spread, homeScore, awayScore, homeTeamId } = params;
  const favoriteIsHome = favoriteTeamId === homeTeamId;
  const homeMargin = homeScore - awayScore;
  const favoriteMargin = favoriteIsHome ? homeMargin : -homeMargin;
  const pickedFavorite = pickedTeamId === favoriteTeamId;
  return pickedFavorite
    ? favoriteMargin > spread ? "correct" : "incorrect"
    : favoriteMargin < spread ? "correct" : "incorrect";
}

export function gradeNflPickemStraightPick(params: {
  pickedTeamId: string;
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
  awayTeamId: string;
}): "correct" | "incorrect" | "push" {
  const { pickedTeamId, homeScore, awayScore, homeTeamId, awayTeamId } = params;
  if (homeScore === awayScore) return "push";
  const winnerTeamId = homeScore > awayScore ? homeTeamId : awayTeamId;
  return pickedTeamId === winnerTeamId ? "correct" : "incorrect";
}

export function computeLiveCorrectAts(
  games: EspnGame[],
  pendingPicks: Array<{ userId: number; gameId: string; pickedTeamId: string }>,
  spreadByGame: Map<string, { spread: number; favoriteTeamId: string }>,
): { liveByUser: Map<number, number>; liveGamesInProgress: number } {
  const coveringTeamByGame = new Map<string, string>();
  let liveGamesInProgress = 0;

  for (const game of games) {
    if (
      game.status !== "in_progress" ||
      game.homeScore == null ||
      game.awayScore == null
    ) {
      continue;
    }
    const line = spreadByGame.get(game.id);
    if (!line) continue;

    liveGamesInProgress++;
    const homeScore = game.homeScore;
    const awayScore = game.awayScore;
    const favoriteIsHome = line.favoriteTeamId === game.homeTeam.id;
    const homeMargin = homeScore - awayScore;
    const favoriteMargin = favoriteIsHome ? homeMargin : -homeMargin;

    if (favoriteMargin > line.spread) {
      coveringTeamByGame.set(game.id, line.favoriteTeamId);
    } else if (favoriteMargin < line.spread) {
      const underdogId = favoriteIsHome ? game.awayTeam.id : game.homeTeam.id;
      coveringTeamByGame.set(game.id, underdogId);
    }
  }

  const liveByUser = new Map<number, number>();
  for (const pick of pendingPicks) {
    if (coveringTeamByGame.get(pick.gameId) !== pick.pickedTeamId) continue;
    liveByUser.set(pick.userId, (liveByUser.get(pick.userId) ?? 0) + 1);
  }

  return { liveByUser, liveGamesInProgress };
}
