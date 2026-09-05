import { db, pickemPicksTable } from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import { fetchGamesForDate, getTodayEtDate } from "./espn";
import { getMlbHighHeatRequiredPickCount } from "./mlb-high-heat-rules";

export type MlbHighHeatDailyStatus = {
  todayEt: string;
  slateGameCount: number;
  requiredPickCount: number;
  pickedCount: number;
  hasRequirement: boolean;
  isComplete: boolean;
};

/**
 * Resolve the same current MLB slate used by the High Heat page and compare
 * today's picks only. Weekly High Heat scoring remains separate from this
 * submission-status calculation.
 */
export async function getMlbHighHeatDailyStatus(
  poolId: number,
  userId: number,
  nowMs = Date.now(),
): Promise<MlbHighHeatDailyStatus> {
  const todayEt = getTodayEtDate();
  const [games, [countRow]] = await Promise.all([
    fetchGamesForDate("mlb", todayEt.replace(/-/g, "")),
    db
      .select({ count: count() })
      .from(pickemPicksTable)
      .where(and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.userId, userId),
        eq(pickemPicksTable.gameDate, todayEt),
      )),
  ]);

  const requiredPickCount = getMlbHighHeatRequiredPickCount(games, nowMs);
  const pickedCount = Number(countRow?.count ?? 0);
  const hasRequirement = requiredPickCount > 0;

  return {
    todayEt,
    slateGameCount: games.length,
    requiredPickCount,
    pickedCount,
    hasRequirement,
    isComplete: !hasRequirement || pickedCount >= requiredPickCount,
  };
}