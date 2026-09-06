export const THREE_WAY_PICK_OPTIONS = ["home_win", "draw", "away_win"] as const;
export type ThreeWayPickOption = (typeof THREE_WAY_PICK_OPTIONS)[number];

export function isThreeWayPickOption(value: string): value is ThreeWayPickOption {
  return (THREE_WAY_PICK_OPTIONS as readonly string[]).includes(value);
}

export function threeWayOutcome(homeScore: number, awayScore: number): ThreeWayPickOption {
  if (homeScore > awayScore) return "home_win";
  if (awayScore > homeScore) return "away_win";
  return "draw";
}

/**
 * Champions League Pick-Ems settle the individual match at 90 minutes. A null
 * result deliberately means "do not grade": ESPN's final score may include
 * extra time or reflect the penalty winner.
 */
export function championsLeagueRegulationOutcome(game: {
  isCompleted: boolean;
  regulationHomeScore?: number | null;
  regulationAwayScore?: number | null;
}): ThreeWayPickOption | null {
  if (!game.isCompleted ||
    game.regulationHomeScore == null ||
    game.regulationAwayScore == null) {
    return null;
  }
  return threeWayOutcome(game.regulationHomeScore, game.regulationAwayScore);
}