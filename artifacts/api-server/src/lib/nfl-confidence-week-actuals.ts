import { db, nflConfidenceResultsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { EspnGame } from "./espn";
import { fetchNflWeek18TiebreakerStats } from "./espn";
import { findLastNflGameByKickoff } from "./nfl-weekly-tiebreaker";
import { isUnambiguousFinalNflGame } from "./nfl-auto-advance";

/**
 * When the week's last game (by kickoff) is final, fetch combined passing/rushing
 * from ESPN and persist to nfl_confidence_results for leaderboard / Tiebreaker Actuals UI.
 */
export async function recordNflConfidenceWeekTiebreakerActualsIfReady(
  poolId: number,
  week: number,
  weekGames: EspnGame[],
  log?: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void },
): Promise<boolean> {
  const lastTarget = findLastNflGameByKickoff(
    weekGames.map((g) => ({ id: g.id, startTime: g.date })),
  );
  if (!lastTarget) return false;

  const lastGame = weekGames.find((g) => g.id === lastTarget.id);
  if (!lastGame || !isUnambiguousFinalNflGame(lastGame)) return false;

  const stats = await fetchNflWeek18TiebreakerStats([lastTarget.id]);
  if (!stats) {
    log?.warn(
      { poolId, week, lastGameId: lastTarget.id },
      "NFL Confidence: ESPN tiebreaker stats unavailable — actuals not recorded",
    );
    return false;
  }

  await db
    .insert(nflConfidenceResultsTable)
    .values({
      poolId,
      week,
      actualPassingYards: stats.actualPassingYards,
      actualRushingYards: stats.actualRushingYards,
    })
    .onConflictDoUpdate({
      target: [nflConfidenceResultsTable.poolId, nflConfidenceResultsTable.week],
      set: {
        actualPassingYards: stats.actualPassingYards,
        actualRushingYards: stats.actualRushingYards,
        recordedAt: new Date(),
      },
    });

  log?.info(
    {
      poolId,
      week,
      lastGameId: lastGame.id,
      actualPassingYards: stats.actualPassingYards,
      actualRushingYards: stats.actualRushingYards,
    },
    "NFL Confidence: week tiebreaker actuals recorded",
  );
  return true;
}

/** Read stored actuals for a pool/week (for closure / settlement). */
export async function getStoredNflConfidenceWeekActuals(
  poolId: number,
  week: number,
): Promise<{ actualPassingYards: number | null; actualRushingYards: number | null }> {
  const [row] = await db
    .select({
      actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
      actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
    })
    .from(nflConfidenceResultsTable)
    .where(and(eq(nflConfidenceResultsTable.poolId, poolId), eq(nflConfidenceResultsTable.week, week)))
    .limit(1);
  return {
    actualPassingYards: row?.actualPassingYards ?? null,
    actualRushingYards: row?.actualRushingYards ?? null,
  };
}
