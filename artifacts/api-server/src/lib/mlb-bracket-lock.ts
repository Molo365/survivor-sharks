import { db, mlbBracketResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchMlbPostseasonSeries, type MlbSeries } from "./mlb-bracket";

export async function isMlbBracketLocked(
  poolId: number,
  season: number,
  sandboxMode: boolean | null,
  series?: MlbSeries[],
): Promise<boolean> {
  if (sandboxMode) {
    const result = await db
      .select({ id: mlbBracketResultsTable.id })
      .from(mlbBracketResultsTable)
      .where(eq(mlbBracketResultsTable.poolId, poolId))
      .limit(1);
    return result.length > 0;
  }

  const slate = series ?? await fetchMlbPostseasonSeries(season);
  const firstPitch = slate
    .filter((item) => item.round === "wild_card")
    .map((item) => item.startsAt.getTime())
    .sort((a, b) => a - b)[0];
  return firstPitch !== undefined && Date.now() >= firstPitch;
}