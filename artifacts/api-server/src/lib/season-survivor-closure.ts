/**
 * Shared season Survivor closure logic.
 *
 * The commissioner results route and the admin preseason-close route both use
 * this helper so winner, finish-position, prize, and SOV behavior stays in one
 * place. The operation is idempotent when the pool is already inactive.
 */

import { db } from "@workspace/db";
import { entriesTable, poolsTable, picksTable, weekResultsTable } from "@workspace/db";
import { and, count, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { calcPrize } from "./prizeCalc";

type Pool = typeof poolsTable.$inferSelect;

interface ClosureLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg?: string): void;
}

export interface SeasonSurvivorClosureOpts {
  poolId: number;
  week: number;
  terminalWeek?: number;
  pool: Pool;
  log: ClosureLog;
}

export interface SeasonSurvivorClosureResult {
  closureApplied: boolean;
  winnerCount: number;
  closureReason: string | null;
}

export function calculateSeasonSurvivorCoWinnerPrize(
  pool: Pick<typeof poolsTable.$inferSelect,
    "prizeStructure" | "prizeMode" | "entryFee" | "prizePot" | "maxEntries">,
  totalEntries: number,
  coWinners: number,
): number | null {
  return calcPrize({
    placeIndex: 0,
    coWinners,
    prizeStructure: pool.prizeStructure as Array<{ place: number; amount: number }> | null,
    prizeMode: pool.prizeMode,
    entryFee: pool.entryFee,
    prizePot: pool.prizePot,
    totalEntries,
    maxEntries: pool.maxEntries,
  });
}

async function resolveSov(poolId: number): Promise<void> {
  const aliveEntries = await db
    .select({ id: entriesTable.id, userId: entriesTable.userId })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

  const allPicks = await db
    .select({ userId: picksTable.userId, marginOfVictory: picksTable.marginOfVictory })
    .from(picksTable)
    .where(eq(picksTable.poolId, poolId));

  const sovByUser = new Map<number, number>();
  for (const pick of allPicks) {
    if (pick.marginOfVictory == null) continue;
    sovByUser.set(pick.userId, (sovByUser.get(pick.userId) ?? 0) + pick.marginOfVictory);
  }

  for (const entry of aliveEntries) {
    await db
      .update(entriesTable)
      .set({ sovTotal: sovByUser.get(entry.userId) ?? 0 })
      .where(eq(entriesTable.id, entry.id));
  }
}

async function assignEliminatedPlaces(
  poolId: number,
  eliminated: Array<{ userId: number; eliminatedWeek: number | null }>,
  firstPlaceCount: number,
  pool: Pool,
  totalEntries: number,
): Promise<void> {
  let remaining = eliminated.filter((entry) => entry.eliminatedWeek != null);
  let placeIndex = firstPlaceCount;
  let finishPosition = 2;
  const prizeStructure = pool.prizeStructure as Array<{ place: number; amount: number }> | null;

  while (remaining.length > 0) {
    const groupWeek = Math.max(...remaining.map((entry) => entry.eliminatedWeek!));
    const group = remaining.filter((entry) => entry.eliminatedWeek === groupWeek);
    const prize = calcPrize({
      placeIndex,
      coWinners: group.length,
      prizeStructure,
      prizeMode: pool.prizeMode,
      entryFee: pool.entryFee,
      prizePot: pool.prizePot,
      totalEntries,
      maxEntries: pool.maxEntries,
    });

    await db
      .update(entriesTable)
      .set({
        finishPosition,
        ...(prize !== null ? { prizeAmount: prize } : {}),
      })
      .where(and(
        eq(entriesTable.poolId, poolId),
        inArray(entriesTable.userId, group.map((entry) => entry.userId)),
      ));

    remaining = remaining.filter((entry) => entry.eliminatedWeek !== groupWeek);
    placeIndex += group.length;
    finishPosition++;
  }
}

export async function applySeasonSurvivorClosure(
  opts: SeasonSurvivorClosureOpts,
): Promise<SeasonSurvivorClosureResult> {
  const { poolId, week, pool, log } = opts;
  const terminalWeek = opts.terminalWeek ?? 18;

  if (!pool.isActive) {
    return { closureApplied: false, winnerCount: 0, closureReason: pool.closureReason ?? null };
  }

  const aliveEntries = await db
    .select({ userId: entriesTable.userId })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

  if (aliveEntries.length > 1 && week !== terminalWeek) {
    return { closureApplied: false, winnerCount: 0, closureReason: null };
  }

  if (aliveEntries.length === 0) {
    log.warn({ poolId, week }, "Season Survivor closure skipped: no alive entries remain");
    return { closureApplied: false, winnerCount: 0, closureReason: null };
  }

  const totalEntriesRows = await db
    .select({ totalEntries: count() })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, poolId));
  const totalEntries = Number(totalEntriesRows[0]?.totalEntries ?? 0);

  if (aliveEntries.length === 1) {
    const [[eliminatedEntry], [gradedPick], [finalizedPeriod]] = await Promise.all([
      db
        .select({ id: entriesTable.id })
        .from(entriesTable)
        .where(and(
          eq(entriesTable.poolId, poolId),
          eq(entriesTable.status, "eliminated"),
          isNotNull(entriesTable.eliminatedWeek),
        ))
        .limit(1),
      db
        .select({ id: picksTable.id })
        .from(picksTable)
        .where(and(eq(picksTable.poolId, poolId), ne(picksTable.result, "pending")))
        .limit(1),
      db
        .select({ id: weekResultsTable.id })
        .from(weekResultsTable)
        .where(eq(weekResultsTable.poolId, poolId))
        .limit(1),
    ]);
    const startWeek = pool.startWeek ?? 1;
    const hasStarted =
      pool.currentWeek > startWeek ||
      week > startWeek ||
      gradedPick != null ||
      finalizedPeriod != null;

    if (totalEntries < 2 || eliminatedEntry == null || !hasStarted) {
      log.warn(
        {
          poolId,
          week,
          totalEntries,
          hasEliminatedEntry: eliminatedEntry != null,
          hasStarted,
        },
        "Season Survivor closure skipped: one alive entry without sufficient gameplay evidence",
      );
      return { closureApplied: false, winnerCount: 0, closureReason: null };
    }
  }

  const prizeStructure = pool.prizeStructure as Array<{ place: number; amount: number }> | null;

  if (aliveEntries.length > 1) {
    const firstPrize = calculateSeasonSurvivorCoWinnerPrize(
      pool,
      totalEntries,
      aliveEntries.length,
    );

    await db
      .update(entriesTable)
      .set({ finalWinner: true, finishPosition: 1, prizeAmount: firstPrize })
      .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

    await resolveSov(poolId);

    const eliminated = await db
      .select({ userId: entriesTable.userId, eliminatedWeek: entriesTable.eliminatedWeek })
      .from(entriesTable)
      .where(and(
        eq(entriesTable.poolId, poolId),
        eq(entriesTable.status, "eliminated"),
        isNotNull(entriesTable.eliminatedWeek),
      ));
    await assignEliminatedPlaces(poolId, eliminated, aliveEntries.length, pool, totalEntries);

    await db
      .update(poolsTable)
      .set({ isActive: false, endedAt: new Date(), closureReason: "sov_tiebreaker" })
      .where(and(eq(poolsTable.id, poolId), eq(poolsTable.isActive, true)));

    log.info(
      { poolId, week, winnerCount: aliveEntries.length },
      "Season Survivor closed with SOV tiebreaker",
    );
    return { closureApplied: true, winnerCount: aliveEntries.length, closureReason: "sov_tiebreaker" };
  }

  const firstPlaceCount = aliveEntries.length;
  const firstPrize = calcPrize({
    placeIndex: 0,
    coWinners: firstPlaceCount,
    prizeStructure,
    prizeMode: pool.prizeMode,
    entryFee: pool.entryFee,
    prizePot: pool.prizePot,
    totalEntries,
    maxEntries: pool.maxEntries,
  });

  await db
    .update(entriesTable)
    .set({ finalWinner: true, finishPosition: 1, prizeAmount: firstPrize })
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

  const eliminated = await db
    .select({ userId: entriesTable.userId, eliminatedWeek: entriesTable.eliminatedWeek })
    .from(entriesTable)
    .where(and(
      eq(entriesTable.poolId, poolId),
      eq(entriesTable.status, "eliminated"),
      isNotNull(entriesTable.eliminatedWeek),
    ));
  await assignEliminatedPlaces(poolId, eliminated, firstPlaceCount, pool, totalEntries);

  await db
    .update(poolsTable)
    .set({ isActive: false, endedAt: new Date() })
    .where(and(eq(poolsTable.id, poolId), eq(poolsTable.isActive, true)));

  log.info(
    { poolId, week, winnerCount: aliveEntries.length },
    "Season Survivor closed",
  );
  return { closureApplied: true, winnerCount: aliveEntries.length, closureReason: null };
}