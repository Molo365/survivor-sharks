import { db } from "@workspace/db";
import { pickemGameSpreadsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { parseEspnNbaSpread, type NbaAtsSpreadLine } from "./nba-ats-spread-parse";

const ESPN_NBA_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary";

async function fetchEspnNbaSpread(
  gameId: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<NbaAtsSpreadLine | null> {
  try {
    const res = await fetch(`${ESPN_NBA_SUMMARY}?event=${encodeURIComponent(gameId)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const pc = (data.pickcenter ?? [])[0] ?? null;
    return parseEspnNbaSpread(pc, homeTeamId, awayTeamId);
  } catch {
    return null;
  }
}

/**
 * Load stored ATS lines, then fill any missing games from ESPN pickcenter.
 * Commissioner-entered rows are never overwritten.
 */
export async function loadNbaAtsSpreads(opts: {
  poolId: number;
  week: number;
  games: Array<{ id: string; homeTeamId: string; awayTeamId: string }>;
}): Promise<Map<string, NbaAtsSpreadLine>> {
  const { poolId, week, games } = opts;
  const existing = await db
    .select()
    .from(pickemGameSpreadsTable)
    .where(and(eq(pickemGameSpreadsTable.poolId, poolId), eq(pickemGameSpreadsTable.week, week)));

  const byGame = new Map<string, NbaAtsSpreadLine>();
  for (const row of existing) {
    byGame.set(row.gameId, { spread: row.spread, favoriteTeamId: row.favoriteTeamId });
  }

  const missing = games.filter((g) => !byGame.has(g.id));
  if (missing.length === 0) return byGame;

  const fetched = await Promise.all(
    missing.map(async (g) => {
      const line = await fetchEspnNbaSpread(g.id, g.homeTeamId, g.awayTeamId);
      return { gameId: g.id, line };
    }),
  );

  for (const { gameId, line } of fetched) {
    if (!line) continue;
    byGame.set(gameId, line);
    try {
      await db
        .insert(pickemGameSpreadsTable)
        .values({
          poolId,
          gameId,
          week,
          spread: line.spread,
          favoriteTeamId: line.favoriteTeamId,
        })
        .onConflictDoNothing();
    } catch {
      // Table may be missing in an environment that never migrated; still return the ESPN line for this response.
    }
  }

  return byGame;
}
