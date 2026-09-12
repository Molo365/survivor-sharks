export interface NflScheduledGame {
  id: string;
  startTime: string | Date | null | undefined;
}

/**
 * Weekly bonus tiebreakers use the final scheduled kickoff on that week's
 * board. This is intentionally separate from the existing Week 18 season-end
 * tiebreaker selection paths.
 */
export function findLastNflGameByKickoff(games: NflScheduledGame[]): NflScheduledGame | null {
  return [...games]
    .filter((game) => game.id && game.startTime && !Number.isNaN(new Date(game.startTime).getTime()))
    .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime())
    .at(-1) ?? null;
}