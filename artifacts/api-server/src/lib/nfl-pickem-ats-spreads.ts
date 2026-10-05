import { db } from "@workspace/db";
import { pickemGameSpreadsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { parseEspnNflSpread, type NflPickemAtsSpreadLine } from "./nfl-pickem-ats-spread-parse";

const ESPN_NFL_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

async function fetchEspnNflSpread(
  gameId: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<NflPickemAtsSpreadLine | null> {
  try {
    const res = await fetch(`${ESPN_NFL_SUMMARY}?event=${encodeURIComponent(gameId)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pickcenter?: unknown[] };
    const pc = (data.pickcenter ?? [])[0] ?? null;
    return parseEspnNflSpread(pc, homeTeamId, awayTeamId);
  } catch {
    return null;
  }
}

/**
 * Load stored ATS lines for an NFL Pick-Ems Season week, then fill missing games from ESPN.
 * Existing rows are never overwritten (insert-only catch-up).
 */
export async function loadNflPickemAtsSpreads(opts: {
  poolId: number;
  week: number;
  games: Array<{ id: string; homeTeamId: string; awayTeamId: string }>;
}): Promise<Map<string, NflPickemAtsSpreadLine>> {
  const { poolId, week, games } = opts;
  const existing = await db
    .select()
    .from(pickemGameSpreadsTable)
    .where(and(eq(pickemGameSpreadsTable.poolId, poolId), eq(pickemGameSpreadsTable.week, week)));

  const byGame = new Map<string, NflPickemAtsSpreadLine>();
  for (const row of existing) {
    byGame.set(row.gameId, { spread: row.spread, favoriteTeamId: row.favoriteTeamId });
  }

  const missing = games.filter((g) => !byGame.has(g.id));
  if (missing.length === 0) return byGame;

  const fetched = await Promise.all(
    missing.map(async (g) => {
      const line = await fetchEspnNflSpread(g.id, g.homeTeamId, g.awayTeamId);
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
      // Table missing in unmigrated env — still return ESPN line for this response.
    }
  }

  return byGame;
}
