import {
  crazyEightsPeriodResultsTable,
  db,
  entriesTable,
  poolsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { calcPrize } from "./prizeCalc";

type NbaAtsRecurringPool = typeof poolsTable.$inferSelect;

export function isRecurringLiveNbaAtsPool(pool: {
  sport: string;
  poolType: string;
  isRecurring: boolean;
  isActive: boolean;
  sandboxMode: boolean;
}): boolean {
  return (
    pool.sport === "nba"
    && pool.poolType === "nba_ats"
    && pool.isRecurring
    && pool.isActive
    && !pool.sandboxMode
  );
}

/** Record weekly payout groups and advance currentWeek (pool stays open). */
export async function recordNbaAtsPeriodAndAdvance(
  pool: NbaAtsRecurringPool,
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
      || !isRecurringLiveNbaAtsPool(lockedPool)
      || lockedPool.currentWeek !== pool.currentWeek
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

    const advanced = await tx
      .update(poolsTable)
      .set({ currentWeek: lockedPool.currentWeek + 1 })
      .where(and(
        eq(poolsTable.id, lockedPool.id),
        eq(poolsTable.currentWeek, lockedPool.currentWeek),
      ))
      .returning({ id: poolsTable.id });

    if (advanced.length === 0) {
      throw new Error(`NBA ATS pool ${lockedPool.id} did not advance from week ${lockedPool.currentWeek}`);
    }

    return true;
  });
}
