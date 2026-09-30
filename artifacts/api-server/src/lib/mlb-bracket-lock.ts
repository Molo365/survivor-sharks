import { db, mlbBracketResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchMlbPostseasonSeries, type MlbPostseasonFetchResult } from "./mlb-bracket";
import { logger } from "./logger";

export async function isMlbBracketLocked(
  poolId: number,
  season: number,
  sandboxMode: boolean | null,
  series?: MlbPostseasonFetchResult,
): Promise<boolean> {
  if (sandboxMode) {
    const result = await db
      .select({ id: mlbBracketResultsTable.id })
      .from(mlbBracketResultsTable)
      .where(eq(mlbBracketResultsTable.poolId, poolId))
      .limit(1);
    return result.length > 0;
  }

  let slate: MlbPostseasonFetchResult;
  try {
    slate = series ?? await fetchMlbPostseasonSeries(season);
  } catch (err) {
    logger.error({ poolId, season, err }, "MLB bracket locked: postseason scoreboard fetch failed");
    return true;
  }
  if (slate.failedMonths.length > 0) {
    logger.error({ poolId, season, failedMonths: slate.failedMonths }, "MLB bracket locked: postseason scoreboard incomplete");
    return true;
  }
  const firstPitch = slate.series
    .filter((item) => item.round === "wild_card")
    .map((item) => item.startsAt.getTime())
    .sort((a, b) => a - b)[0];
  return firstPitch !== undefined && Date.now() >= firstPitch;
}