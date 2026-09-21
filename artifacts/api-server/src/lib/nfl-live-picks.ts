import { fetchNflGamesByWeek, type EspnGame } from "./espn";

export interface PendingNflPick {
  userId: number;
  gameId: string;
  pickedTeamId: string;
}

export interface LiveCorrectResult {
  liveByUser: Map<number, number>;
  liveGamesInProgress: number;
}

export function computeLiveCorrect(
  games: EspnGame[],
  pendingPicks: PendingNflPick[],
): LiveCorrectResult {
  const leadingTeamByGame = new Map<string, string>();
  let liveGamesInProgress = 0;

  for (const game of games) {
    if (
      game.status !== "in_progress" ||
      game.homeScore == null ||
      game.awayScore == null
    ) {
      continue;
    }

    liveGamesInProgress++;
    if (game.homeScore === game.awayScore) continue;

    leadingTeamByGame.set(
      game.id,
      game.homeScore > game.awayScore
        ? game.homeTeam.id
        : game.awayTeam.id,
    );
  }

  const liveByUser = new Map<number, number>();
  for (const pick of pendingPicks) {
    if (leadingTeamByGame.get(pick.gameId) !== pick.pickedTeamId) continue;
    liveByUser.set(pick.userId, (liveByUser.get(pick.userId) ?? 0) + 1);
  }

  return { liveByUser, liveGamesInProgress };
}

interface CachedLiveGames {
  expiresAt: number;
  games: EspnGame[];
}

const liveGamesCache = new Map<string, CachedLiveGames>();
const LIVE_GAMES_CACHE_TTL_MS = 15_000;

export async function getLiveGamesCached(
  week: number,
  season?: number,
  seasonType = 2,
): Promise<EspnGame[]> {
  const cacheKey = `${week}:${season ?? "default"}:${seasonType}`;
  const cached = liveGamesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.games;

  try {
    const games = await fetchNflGamesByWeek(week, season, seasonType);
    liveGamesCache.set(cacheKey, {
      games,
      expiresAt: Date.now() + LIVE_GAMES_CACHE_TTL_MS,
    });
    return games;
  } catch {
    const games: EspnGame[] = [];
    liveGamesCache.set(cacheKey, {
      games,
      expiresAt: Date.now() + LIVE_GAMES_CACHE_TTL_MS,
    });
    return games;
  }
}