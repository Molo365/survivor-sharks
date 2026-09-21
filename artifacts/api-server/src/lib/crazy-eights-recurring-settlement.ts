import {
  crazyEightsPeriodResultsTable,
  db,
  entriesTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { isRecurringNhlOrNbaCrazyEights } from "./crazy-eights-recurring-policy";
import { calcPrize } from "./prizeCalc";

export async function recordCrazyEightsPeriodAndAdvance(
  pool: typeof poolsTable.$inferSelect,
  groups: number[][],
  reason: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [lockedPool] = await tx
      .select()
      .from(poolsTable)
      .where(eq(poolsTable.id, pool.id))
      .for("update")
      .limit(1);
    if (
      !lockedPool
      || !lockedPool.isActive
      || lockedPool.currentWeek !== pool.currentWeek
      || !isRecurringNhlOrNbaCrazyEights(lockedPool)
    ) {
      return false;
    }

    const allEntries = await tx
      .select({ userId: entriesTable.userId })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, lockedPool.id));
    const totalEntries = allEntries.length;
    const prizeStructure = lockedPool.prizeStructure as Array<{ place: number; amount: number }> | null;

    let placeIndex = 0;
    const resultGroups = groups.map((userIds) => {
      const position = placeIndex + 1;
      const prize = calcPrize({
        prizeStructure,
        prizeMode: lockedPool.prizeMode,
        entryFee: lockedPool.entryFee,
        prizePot: lockedPool.prizePot,
        totalEntries,
        maxEntries: lockedPool.maxEntries,
        placeIndex,
        coWinners: userIds.length,
      }) ?? 0;
      placeIndex += userIds.length;
      return { position, userIds, prize };
    });

    const inserted = await tx
      .insert(crazyEightsPeriodResultsTable)
      .values({
        poolId: lockedPool.id,
        week: lockedPool.currentWeek,
        groups: resultGroups,
        reason,
      })
      .onConflictDoNothing()
      .returning({ id: crazyEightsPeriodResultsTable.id });

    if (inserted.length === 0) return false;

    await tx
      .update(entriesTable)
      .set({
        tiebreakerShotsOnGoal: null,
        tiebreakerPenaltyMinutes: null,
        tiebreakerPoints: null,
        tiebreakerThrees: null,
      })
      .where(eq(entriesTable.poolId, lockedPool.id));

    const advanced = await tx
      .update(poolsTable)
      .set({ currentWeek: lockedPool.currentWeek + 1 })
      .where(and(eq(poolsTable.id, lockedPool.id), eq(poolsTable.currentWeek, lockedPool.currentWeek)))
      .returning({ id: poolsTable.id });

    if (advanced.length === 0) {
      throw new Error(`Crazy 8's pool ${lockedPool.id} did not advance from week ${lockedPool.currentWeek}`);
    }

    return true;
  });
}

export async function closeCrazyEightsPool(
  pool: typeof poolsTable.$inferSelect,
  groups: number[][],
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [lockedPool] = await tx
      .select()
      .from(poolsTable)
      .where(eq(poolsTable.id, pool.id))
      .for("update")
      .limit(1);
    if (!lockedPool?.isActive || isRecurringNhlOrNbaCrazyEights(lockedPool)) {
      return false;
    }

    const allEntries = await tx
      .select({ userId: entriesTable.userId })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, lockedPool.id));
    const totalEntries = allEntries.length;
    const prizeStructure = lockedPool.prizeStructure as Array<{ place: number; amount: number }> | null;

    let placeIndex = 0;
    for (const group of groups) {
      const finishPosition = placeIndex + 1;
      const prize = calcPrize({
        prizeStructure,
        prizeMode: lockedPool.prizeMode,
        entryFee: lockedPool.entryFee,
        prizePot: lockedPool.prizePot,
        totalEntries,
        maxEntries: lockedPool.maxEntries,
        placeIndex,
        coWinners: group.length,
      });
      await tx
        .update(entriesTable)
        .set({
          finishPosition,
          prizeAmount: prize,
          ...(finishPosition === 1 ? { finalWinner: true } : {}),
        })
        .where(and(
          eq(entriesTable.poolId, lockedPool.id),
          inArray(entriesTable.userId, group),
        ));
      placeIndex += group.length;
    }

    const winnerIds = groups[0] ?? [];
    let closureReason = winnerIds.length === 0 ? "no_winners" : "co_winners";
    if (winnerIds.length === 1) {
      const [winnerUser] = await tx
        .select({ displayName: usersTable.displayName, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, winnerIds[0]))
        .limit(1);
      if (winnerUser) closureReason = winnerUser.displayName ?? winnerUser.username;
    }

    await tx
      .update(poolsTable)
      .set({ isActive: false, endedAt: new Date(), closureReason })
      .where(eq(poolsTable.id, lockedPool.id));

    return true;
  });
}
