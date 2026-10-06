import { db } from "@workspace/db";
import { pickemPicksTable } from "@workspace/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { nbaAtsWeeklyPeriodReason, rankNbaAtsUsersByWeeklyScore } from "./nba-ats-weekly-ranking";

export { nbaAtsWeeklyPeriodReason, rankNbaAtsUsersByWeeklyScore } from "./nba-ats-weekly-ranking";

export async function computeNbaAtsWeeklyLeaderGroups(
  poolId: number,
  week: number,
  gameScoreMap: Map<string, number>,
): Promise<{ groups: number[][]; totalParticipants: number }> {
  const scoreRows = await db
    .select({ userId: pickemPicksTable.userId, correct: count() })
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.week, week),
        eq(pickemPicksTable.result, "correct"),
      ),
    )
    .groupBy(pickemPicksTable.userId);

  const allPickUsers = await db
    .selectDistinct({ userId: pickemPicksTable.userId })
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.week, week),
      ),
    );

  const scoreByUser = new Map<number, number>();
  for (const row of scoreRows) scoreByUser.set(row.userId, Number(row.correct));
  for (const { userId } of allPickUsers) {
    if (!scoreByUser.has(userId)) scoreByUser.set(userId, 0);
  }

  if (scoreByUser.size === 0) {
    return { groups: [], totalParticipants: 0 };
  }

  const sortedScores = [...new Set(scoreByUser.values())].sort((a, b) => b - a);
  const tiedUserIds = sortedScores
    .filter((score) => [...scoreByUser.entries()].filter(([, s]) => s === score).length > 1)
    .flatMap((score) => [...scoreByUser.entries()].filter(([, s]) => s === score).map(([uid]) => uid));

  const marginByUser = new Map<number, number>();
  if (tiedUserIds.length > 0 && gameScoreMap.size > 0) {
    const tiedCorrectPicks = await db
      .select({ userId: pickemPicksTable.userId, gameId: pickemPicksTable.gameId })
      .from(pickemPicksTable)
      .where(
        and(
          eq(pickemPicksTable.poolId, poolId),
          eq(pickemPicksTable.week, week),
          eq(pickemPicksTable.result, "correct"),
          inArray(pickemPicksTable.userId, tiedUserIds),
        ),
      );

    for (const pick of tiedCorrectPicks) {
      const margin = gameScoreMap.get(pick.gameId) ?? 0;
      marginByUser.set(pick.userId, (marginByUser.get(pick.userId) ?? 0) + margin);
    }
  }

  const groups = rankNbaAtsUsersByWeeklyScore(scoreByUser, marginByUser);
  return { groups, totalParticipants: scoreByUser.size };
}
