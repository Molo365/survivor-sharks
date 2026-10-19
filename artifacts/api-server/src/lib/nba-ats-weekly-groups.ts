import { db } from "@workspace/db";
import { entriesTable, pickemPicksTable } from "@workspace/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { nbaAtsWeeklyPeriodReason, rankNbaAtsUsersByWeeklyScore } from "./nba-ats-weekly-ranking";

export { nbaAtsWeeklyPeriodReason, rankNbaAtsUsersByWeeklyScore } from "./nba-ats-weekly-ranking";

export async function computeNbaAtsWeeklyLeaderGroups(
  poolId: number,
  week: number,
  actualCombinedPoints: number | null,
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

  const userIds = [...scoreByUser.keys()];
  const guessRows = await db
    .select({ userId: entriesTable.userId, tiebreakerPoints: entriesTable.tiebreakerPoints })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, userIds)));

  const pointsGuessByUser = new Map<number, number | null>();
  for (const row of guessRows) {
    pointsGuessByUser.set(row.userId, row.tiebreakerPoints ?? null);
  }

  const tiebreakerDiffByUser = new Map<number, number>();
  for (const uid of userIds) {
    const guess = pointsGuessByUser.get(uid) ?? null;
    if (actualCombinedPoints != null && guess != null) {
      tiebreakerDiffByUser.set(uid, Math.abs(guess - actualCombinedPoints));
    } else {
      tiebreakerDiffByUser.set(uid, Infinity);
    }
  }

  const groups = rankNbaAtsUsersByWeeklyScore(scoreByUser, tiebreakerDiffByUser);
  return { groups, totalParticipants: scoreByUser.size };
}
