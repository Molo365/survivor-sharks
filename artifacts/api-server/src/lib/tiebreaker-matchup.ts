/** Shared tiebreaker-game payload for standings + pick UIs. */

export type TiebreakerMatchupTeamPayload = {
  name: string;
  abbreviation?: string;
  logoUrl?: string | null;
};

export type TiebreakerMatchupPayload = {
  awayTeam: TiebreakerMatchupTeamPayload;
  homeTeam: TiebreakerMatchupTeamPayload;
  startTime?: string | null;
};

export function toTiebreakerMatchupPayload(game: {
  date: string;
  awayTeam: { displayName: string; abbreviation: string; logo?: string | null };
  homeTeam: { displayName: string; abbreviation: string; logo?: string | null };
}): TiebreakerMatchupPayload {
  return {
    awayTeam: {
      name: game.awayTeam.displayName,
      abbreviation: game.awayTeam.abbreviation,
      logoUrl: game.awayTeam.logo ?? null,
    },
    homeTeam: {
      name: game.homeTeam.displayName,
      abbreviation: game.homeTeam.abbreviation,
      logoUrl: game.homeTeam.logo ?? null,
    },
    startTime: game.date,
  };
}
