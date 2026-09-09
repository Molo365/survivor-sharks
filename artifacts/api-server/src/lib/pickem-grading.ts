import type { EspnGame } from "./espn";
import {
  championsLeagueRegulationOutcome,
  threeWayOutcome,
  type ThreeWayPickOption,
} from "./champions-league-pickem";

const THREE_WAY_PICKEM_SPORTS = new Set([
  "worldcup",
  "intl",
  "mls",
  "superleague",
  "championsleague",
]);

export function isThreeWayPickEmSport(sport: string): boolean {
  return THREE_WAY_PICKEM_SPORTS.has(sport);
}

export function threeWayPickEmOutcome(
  sport: string,
  game: EspnGame,
): ThreeWayPickOption | null {
  if (!game.isCompleted) return null;
  if (sport === "championsleague") {
    return championsLeagueRegulationOutcome(game);
  }
  if (game.homeScore == null || game.awayScore == null) return null;
  return threeWayOutcome(game.homeScore, game.awayScore);
}