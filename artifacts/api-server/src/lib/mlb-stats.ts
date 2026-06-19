import type { EspnGame } from "./espn";

const MLB_STATS_BASE = "https://statsapi.mlb.com/api/v1";

interface MlbScheduleGame {
  gamePk: number;
  awayTeamName: string;
  homeTeamName: string;
}

// Normalize a team name for fuzzy matching: lowercase + strip punctuation
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// Return true if two team names refer to the same franchise.
// Handles edge cases like ESPN "Athletics" vs MLB Stats "Athletics" (or "Oakland Athletics").
function teamsMatch(espnName: string, mlbName: string): boolean {
  if (espnName === mlbName) return true;
  const a = normalizeName(espnName);
  const b = normalizeName(mlbName);
  if (a === b) return true;
  // Substring fallback: covers relocated/shortened names ("Athletics" ⊂ "Oakland Athletics")
  return a.includes(b) || b.includes(a);
}

async function fetchMlbSchedule(dateStr: string): Promise<MlbScheduleGame[]> {
  const url =
    `${MLB_STATS_BASE}/schedule` +
    `?sportId=1&date=${dateStr}&gameType=R` +
    `&fields=dates,games,gamePk,teams,away,home,team,name`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { dates?: { games?: any[] }[] };
  const games: MlbScheduleGame[] = [];
  for (const dt of data?.dates ?? []) {
    for (const g of dt?.games ?? []) {
      const awayName = g?.teams?.away?.team?.name ?? "";
      const homeName = g?.teams?.home?.team?.name ?? "";
      if (g?.gamePk && awayName && homeName) {
        games.push({ gamePk: g.gamePk, awayTeamName: awayName, homeTeamName: homeName });
      }
    }
  }
  return games;
}

async function fetchGameStrikeouts(gamePk: number): Promise<number | null> {
  const url = `${MLB_STATS_BASE}/game/${gamePk}/boxscore`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { teams?: { away?: any; home?: any } };
  const awaySo = data?.teams?.away?.teamStats?.pitching?.strikeOuts;
  const homeSo = data?.teams?.home?.teamStats?.pitching?.strikeOuts;
  if (typeof awaySo !== "number" || typeof homeSo !== "number") return null;
  return awaySo + homeSo;
}

/**
 * Returns the combined total strikeouts for all completed ESPN games on `dateStr`.
 *
 * Strategy:
 *  1. Filter espnGames to only completed games.
 *  2. Fetch the MLB Stats API schedule for that date to get gamePks.
 *  3. For each completed ESPN game, find the matching MLB Stats game by team name.
 *  4. Fetch each boxscore and sum both teams' pitching.strikeOuts.
 *
 * Returns null (show "—") if:
 *  - No games are final yet.
 *  - The MLB Stats API schedule call fails.
 *  - ANY completed game fails to match (prevents silently wrong partial totals).
 *  - ANY boxscore fetch fails for a matched game.
 *
 * Failures here are always soft — they never throw, they return null.
 */
export async function fetchDailyStrikeouts(
  espnGames: EspnGame[],
  dateStr: string,
): Promise<number | null> {
  const finalGames = espnGames.filter((g) => g.isCompleted);
  if (finalGames.length === 0) return null;

  let schedule: MlbScheduleGame[];
  try {
    schedule = await fetchMlbSchedule(dateStr);
  } catch {
    return null;
  }
  if (schedule.length === 0) return null;

  const soResults = await Promise.all(
    finalGames.map(async (espnGame) => {
      const mlbGame = schedule.find(
        (s) =>
          teamsMatch(espnGame.awayTeam.displayName, s.awayTeamName) &&
          teamsMatch(espnGame.homeTeam.displayName, s.homeTeamName),
      );
      if (!mlbGame) return null;
      try {
        return await fetchGameStrikeouts(mlbGame.gamePk);
      } catch {
        return null;
      }
    }),
  );

  // Only return a total if every completed game matched and returned a valid number.
  // A partial sum would be misleading — safer to show "—" than a wrong total.
  if (soResults.some((r) => r === null)) return null;
  return (soResults as number[]).reduce((sum, n) => sum + n, 0);
}
