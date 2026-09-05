import type { EspnGame } from "./espn";

export const MLB_HIGH_HEAT_MAX_PICKS = 8;

/**
 * High Heat accepts one pick per currently available game, capped at eight.
 * Keep this in sync with the MLB branch of POST /crazy-eights/picks.
 */
export function getMlbHighHeatRequiredPickCount(
  games: EspnGame[],
  nowMs = Date.now(),
): number {
  const availableGames = games.filter((game) => {
    const startMs = new Date(game.date).getTime();
    return game.status !== "in_progress" && game.status !== "final" && nowMs < startMs;
  });

  return Math.min(availableGames.length, MLB_HIGH_HEAT_MAX_PICKS);
}