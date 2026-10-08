/** One-question tiebreaker copy shared across pool UIs. */

export type TiebreakerSport = "nfl" | "mlb" | "nhl" | "nba";

const STAT: Record<TiebreakerSport, { short: string; phrase: string }> = {
  nfl: {
    short: "Combined passing yards",
    phrase: "combined passing yards (both teams)",
  },
  mlb: {
    short: "Runs + strikeouts",
    phrase: "combined runs scored and total strikeouts on the tiebreaker game",
  },
  nhl: {
    short: "Combined shots on goal",
    phrase: "combined shots on goal (both teams)",
  },
  nba: {
    short: "Combined points",
    phrase: "combined points (both teams)",
  },
};

export function tiebreakerStatLabel(sport: TiebreakerSport): string {
  return STAT[sport].short;
}

export function tiebreakerStatPhrase(sport: TiebreakerSport): string {
  return STAT[sport].phrase;
}

export function tiebreakerHelpLine(sport: TiebreakerSport, context: "weekly" | "slate" | "season"): string {
  const stat = tiebreakerStatPhrase(sport);
  if (context === "weekly") {
    return `Enter the ${stat} for the last scheduled game this week. Closest guess wins if players tie on picks.`;
  }
  if (context === "season") {
    return `If the season ends in a tie, the closest ${stat} guess on the last game of Week 18 wins.`;
  }
  return `Enter the ${stat} for the last game on this slate. Closest guess wins if players tie.`;
}
