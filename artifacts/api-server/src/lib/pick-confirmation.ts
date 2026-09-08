import {
  sendPicksConfirmationEmail,
  type PickConfirmationItem,
  type PicksConfirmationEmailInput,
} from "./mailer";

export interface ConfirmationGame {
  id: string;
  date: string;
  homeTeam: { id: string; displayName: string };
  awayTeam: { id: string; displayName: string };
}

export interface SubmittedConfirmationPick {
  gameId: string;
  pickedTeamId: string;
  pickedTeamName: string;
}

export function isSharedPickConfirmationSport(sport: string): boolean {
  return sport === "superleague" || sport === "championsleague";
}

export function buildTeamPickConfirmationItems(
  picks: SubmittedConfirmationPick[],
  games: ConfirmationGame[],
): PickConfirmationItem[] {
  const gameMap = new Map(games.map((game) => [game.id, game]));
  return picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const pickedIsHome = game?.homeTeam.id === pick.pickedTeamId;
    const pickedIsAway = game?.awayTeam.id === pick.pickedTeamId;
    const selection = pickedIsHome
      ? game.homeTeam.displayName
      : pickedIsAway
        ? game.awayTeam.displayName
        : pick.pickedTeamName;
    const opponent = pickedIsHome
      ? game?.awayTeam.displayName
      : pickedIsAway
        ? game?.homeTeam.displayName
        : null;
    return {
      selection,
      matchup: opponent ? `${selection} vs. ${opponent}` : null,
      gameTime: game?.date ?? null,
    };
  });
}

export function buildThreeWayPickConfirmationItems(
  picks: SubmittedConfirmationPick[],
  games: ConfirmationGame[],
): PickConfirmationItem[] {
  const gameMap = new Map(games.map((game) => [game.id, game]));
  return picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const selection = pick.pickedTeamId === "draw"
      ? "Draw"
      : pick.pickedTeamId === "home_win"
        ? `${game?.homeTeam.displayName ?? "Home team"} win`
        : pick.pickedTeamId === "away_win"
          ? `${game?.awayTeam.displayName ?? "Away team"} win`
          : pick.pickedTeamName;
    return {
      selection,
      matchup: game
        ? `${game.awayTeam.displayName} at ${game.homeTeam.displayName}`
        : null,
      gameTime: game?.date ?? null,
    };
  });
}

export async function sendPicksConfirmationSafely(
  input: PicksConfirmationEmailInput,
  onError: (error: unknown) => void,
  sender: (input: PicksConfirmationEmailInput) => Promise<unknown> = sendPicksConfirmationEmail,
): Promise<void> {
  try {
    await sender(input);
  } catch (error) {
    onError(error);
  }
}