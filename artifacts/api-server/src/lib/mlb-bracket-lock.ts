import { db, mlbBracketResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchMlbPostseasonSeries, type MlbPostseasonFetchResult } from "./mlb-bracket";
import { logger } from "./logger";

export function firstMlbWildCardPitchMs(slate: MlbPostseasonFetchResult): number | undefined {
  return slate.series
    .filter((item) => item.round === "wild_card")
    .map((item) => item.startsAt.getTime())
    .sort((a, b) => a - b)[0];
}

export type MlbBracketPlayoffStartState = "not_started" | "started" | "unavailable";

/** Whether live MLB bracket pools can still be created (before first Wild Card pitch). */
export async function getMlbBracketPlayoffStartState(
  season: number,
  series?: MlbPostseasonFetchResult,
): Promise<MlbBracketPlayoffStartState> {
  let slate: MlbPostseasonFetchResult;
  try {
    slate = series ?? await fetchMlbPostseasonSeries(season);
  } catch (err) {
    logger.error({ season, err }, "MLB bracket playoff start check: postseason scoreboard fetch failed");
    return "unavailable";
  }
  if (slate.failedMonths.length > 0) {
    logger.error({ season, failedMonths: slate.failedMonths }, "MLB bracket playoff start check: postseason scoreboard incomplete");
    return "unavailable";
  }
  const firstPitch = firstMlbWildCardPitchMs(slate);
  if (firstPitch === undefined) return "not_started";
  return Date.now() >= firstPitch ? "started" : "not_started";
}

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

  const state = await getMlbBracketPlayoffStartState(season, series);
  if (state === "unavailable") {
    logger.error({ poolId, season }, "MLB bracket locked: postseason scoreboard unavailable");
    return true;
  }
  return state === "started";
}
