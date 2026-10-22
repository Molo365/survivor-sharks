import { db } from "@workspace/db";
import { pickemGameMoneylinesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { parseEspnNbaMoneylines, type NbaMoneylinePair } from "./nba-ml-odds-parse";

const ESPN_NBA_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary";

async function fetchEspnNbaMoneylines(
  gameId: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<NbaMoneylinePair | null> {
  try {
    const res = await fetch(`${ESPN_NBA_SUMMARY}?event=${encodeURIComponent(gameId)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const pc = (data.pickcenter ?? [])[0] ?? null;
    return parseEspnNbaMoneylines(pc, homeTeamId, awayTeamId);
  } catch {
    return null;
  }
}

export type NbaGameMoneylineLookup = Map<
  string,
  { homeDecimalOdds: number; awayDecimalOdds: number; homeTeamId: string; awayTeamId: string }
>;

export async function loadNbaMoneylines(opts: {
  poolId: number;
  week: number;
  games: Array<{ id: string; homeTeamId: string; awayTeamId: string }>;
}): Promise<NbaGameMoneylineLookup> {
  const { poolId, week, games } = opts;
  const existing = await db
    .select()
    .from(pickemGameMoneylinesTable)
    .where(and(eq(pickemGameMoneylinesTable.poolId, poolId), eq(pickemGameMoneylinesTable.week, week)));

  const byGame = new Map<string, {
    homeDecimalOdds: number;
    awayDecimalOdds: number;
    homeTeamId: string;
    awayTeamId: string;
  }>();
  for (const row of existing) {
    byGame.set(row.gameId, {
      homeDecimalOdds: row.homeDecimalOdds,
      awayDecimalOdds: row.awayDecimalOdds,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
    });
  }

  const missing = games.filter((g) => !byGame.has(g.id));
  if (missing.length === 0) return byGame;

  const fetched = await Promise.all(
    missing.map(async (g) => {
      const line = await fetchEspnNbaMoneylines(g.id, g.homeTeamId, g.awayTeamId);
      return { gameId: g.id, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, line };
    }),
  );

  for (const { gameId, homeTeamId, awayTeamId, line } of fetched) {
    if (!line) continue;
    byGame.set(gameId, {
      homeDecimalOdds: line.homeDecimalOdds,
      awayDecimalOdds: line.awayDecimalOdds,
      homeTeamId,
      awayTeamId,
    });
    try {
      await db
        .insert(pickemGameMoneylinesTable)
        .values({
          poolId,
          gameId,
          week,
          homeTeamId,
          awayTeamId,
          homeDecimalOdds: line.homeDecimalOdds,
          awayDecimalOdds: line.awayDecimalOdds,
        })
        .onConflictDoNothing();
    } catch {
      // Table may be missing until migration runs.
    }
  }

  return byGame;
}

export function decimalOddsForTeam(
  lines: { homeDecimalOdds: number; awayDecimalOdds: number; homeTeamId: string; awayTeamId: string },
  teamId: string,
): number | null {
  if (teamId === lines.homeTeamId) return lines.homeDecimalOdds;
  if (teamId === lines.awayTeamId) return lines.awayDecimalOdds;
  return null;
}
