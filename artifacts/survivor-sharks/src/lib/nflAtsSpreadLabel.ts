/** ATS line label for a picked team, e.g. "-1.5" or "+3.5". */
export function nflAtsSpreadLabelForTeam(
  teamId: string,
  game: {
    spread?: number | null;
    favoriteTeamId?: string | null;
  },
): string | null {
  if (game.spread == null || !game.favoriteTeamId) return null;
  return teamId === game.favoriteTeamId ? `-${game.spread}` : `+${game.spread}`;
}

export function nflAtsMatchupLines(game: {
  spread?: number | null;
  favoriteTeamId?: string | null;
  awayTeam: { id: string; abbreviation: string };
  homeTeam: { id: string; abbreviation: string };
}): { away: string; home: string } | null {
  if (game.spread == null || !game.favoriteTeamId) return null;
  const away =
    game.awayTeam.id === game.favoriteTeamId
      ? `-${game.spread}`
      : `+${game.spread}`;
  const home =
    game.homeTeam.id === game.favoriteTeamId
      ? `-${game.spread}`
      : `+${game.spread}`;
  return {
    away: `${game.awayTeam.abbreviation} ${away}`,
    home: `${game.homeTeam.abbreviation} ${home}`,
  };
}
