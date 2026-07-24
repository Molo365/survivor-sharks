/**
 * Shared season-end closure logic for pickem_season and nfl_confidence pools.
 *
 * Extracted here so both the manual POST /process-results route and the
 * auto-eliminator can call the same functions without circular imports.
 *
 * Idempotent: no-ops when pool.isActive is already false.
 */

import { db } from "@workspace/db";
import {
  pickemPicksTable,
  poolsTable,
  entriesTable,
  nflConfidenceResultsTable,
} from "@workspace/db";
import { eq, and, sql, inArray, type SQL } from "drizzle-orm";
import { calcPrize } from "./prizeCalc";

export const NFL_TOTAL_WEEKS = 18;

interface SeasonClosureOpts {
  poolId: number;
  week: number;
  pool: { isActive: boolean };
  actualPassingYards: number | null;
  actualRushingYards: number | null;
  log: { info(obj: object, msg: string): void; warn(obj: object, msg?: string): void };
}

interface SeasonClosureResult {
  closureApplied: boolean;
  winnerCount: number;
}

/**
 * Season-end closure for pickem_season pools: ranked by count of correct picks.
 */
export async function applyPickEmSeasonClosure(opts: SeasonClosureOpts): Promise<SeasonClosureResult> {
  return applySeasonClosureCore(
    opts,
    sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
    "pickem-season",
  );
}

/**
 * Season-end closure for nfl_confidence (season-long) pools: ranked by total
 * confidence points earned on correct picks.
 */
export async function applyNflConfidenceSeasonClosure(opts: SeasonClosureOpts): Promise<SeasonClosureResult> {
  return applySeasonClosureCore(
    opts,
    sql<string>`COALESCE(SUM(${pickemPicksTable.confidencePoints}) FILTER (WHERE ${pickemPicksTable.result} = 'correct'), 0)`,
    "nfl-confidence-season",
  );
}

async function applySeasonClosureCore(
  opts: SeasonClosureOpts,
  scoreExpr: SQL<string>,
  label: string,
): Promise<SeasonClosureResult> {
  const { poolId, week, pool, log } = opts;
  let { actualPassingYards, actualRushingYards } = opts;

  if (week !== NFL_TOTAL_WEEKS || !pool.isActive) {
    return { closureApplied: false, winnerCount: 0 };
  }

  const seasonTotals = await db
    .select({
      userId: pickemPicksTable.userId,
      seasonScore: scoreExpr,
    })
    .from(pickemPicksTable)
    .where(eq(pickemPicksTable.poolId, poolId))
    .groupBy(pickemPicksTable.userId);

  if (seasonTotals.length === 0) {
    log.warn({ poolId }, `${label} Week 18 closure: no pick data — skipping`);
    return { closureApplied: false, winnerCount: 0 };
  }

  const maxScore = Math.max(...seasonTotals.map((r) => Number(r.seasonScore)));
  let topGroup = seasonTotals.filter((r) => Number(r.seasonScore) === maxScore);

  if (topGroup.length > 1) {
    if (actualPassingYards === null) {
      const [stored] = await db
        .select({
          actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
          actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
        })
        .from(nflConfidenceResultsTable)
        .where(
          and(
            eq(nflConfidenceResultsTable.poolId, poolId),
            eq(nflConfidenceResultsTable.week, NFL_TOTAL_WEEKS),
          ),
        )
        .limit(1);
      actualPassingYards = stored?.actualPassingYards ?? null;
      actualRushingYards = stored?.actualRushingYards ?? null;
    }

    if (actualPassingYards !== null && actualRushingYards !== null) {
      const topUserIds = topGroup.map((r) => r.userId);
      const tbGuesses = await db
        .select({
          userId: entriesTable.userId,
          tiebreakerPassingYards: entriesTable.tiebreakerPassingYards,
          tiebreakerRushingYards: entriesTable.tiebreakerRushingYards,
        })
        .from(entriesTable)
        .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, topUserIds)));

      const tbMap = new Map(tbGuesses.map((g) => [g.userId, g]));
      const rpy = actualPassingYards;
      const rry = actualRushingYards;
      const tbDelta = (uid: number): number => {
        const g = tbMap.get(uid);
        if (g?.tiebreakerPassingYards == null || g?.tiebreakerRushingYards == null) return Infinity;
        return Math.abs(g.tiebreakerPassingYards - rpy) + Math.abs(g.tiebreakerRushingYards - rry);
      };

      topGroup.sort((a, b) => tbDelta(a.userId) - tbDelta(b.userId));
      const bestDelta = tbDelta(topGroup[0].userId);
      topGroup = topGroup.filter((r) => tbDelta(r.userId) === bestDelta);

      log.info(
        { poolId, resolvedPassingYards: actualPassingYards, resolvedRushingYards: actualRushingYards, bestDelta, remainingTied: topGroup.length },
        `${label} Week 18: yardage tiebreaker applied`,
      );
    } else {
      log.info({ poolId }, `${label} Week 18: tiebreaker actuals unavailable — split declared`);
    }
  }

  const winnerUserIds = topGroup.map((r) => r.userId);

  const [poolPrize] = await db
    .select({
      prizeStructure: poolsTable.prizeStructure,
      prizeMode: poolsTable.prizeMode,
      entryFee: poolsTable.entryFee,
      prizePot: poolsTable.prizePot,
      maxEntries: poolsTable.maxEntries,
    })
    .from(poolsTable)
    .where(eq(poolsTable.id, poolId))
    .limit(1);

  const ps = poolPrize?.prizeStructure ?? null;
  const totalEntries = seasonTotals.length;

  const firstPrize = calcPrize({
    placeIndex: 0, coWinners: winnerUserIds.length,
    prizeStructure: ps, prizeMode: poolPrize?.prizeMode,
    entryFee: poolPrize?.entryFee, prizePot: poolPrize?.prizePot,
    totalEntries, maxEntries: poolPrize?.maxEntries ?? null,
  });

  await db
    .update(entriesTable)
    .set({ finalWinner: true, finishPosition: 1, prizeAmount: firstPrize })
    .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, winnerUserIds)));

  const winnerSet = new Set(winnerUserIds);
  const nonWinners = seasonTotals
    .filter((r) => !winnerSet.has(r.userId))
    .sort((a, b) => Number(b.seasonScore) - Number(a.seasonScore));

  if (nonWinners.length > 0) {
    const place2Score = Number(nonWinners[0].seasonScore);
    const secondGroup = nonWinners.filter((r) => Number(r.seasonScore) === place2Score);
    const secondPrize = calcPrize({ placeIndex: winnerUserIds.length, coWinners: secondGroup.length, prizeStructure: ps, prizeMode: poolPrize?.prizeMode, entryFee: poolPrize?.entryFee, prizePot: poolPrize?.prizePot, totalEntries, maxEntries: poolPrize?.maxEntries ?? null });
    await db.update(entriesTable)
      .set({ finishPosition: 2, ...(secondPrize !== null ? { prizeAmount: secondPrize } : {}) })
      .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, secondGroup.map((r) => r.userId))));

    const rest2 = nonWinners.filter((r) => Number(r.seasonScore) !== place2Score);
    if (rest2.length > 0) {
      const place3Score = Number(rest2[0].seasonScore);
      const thirdGroup = rest2.filter((r) => Number(r.seasonScore) === place3Score);
      const thirdPrize = calcPrize({ placeIndex: winnerUserIds.length + secondGroup.length, coWinners: thirdGroup.length, prizeStructure: ps, prizeMode: poolPrize?.prizeMode, entryFee: poolPrize?.entryFee, prizePot: poolPrize?.prizePot, totalEntries, maxEntries: poolPrize?.maxEntries ?? null });
      await db.update(entriesTable)
        .set({ finishPosition: 3, ...(thirdPrize !== null ? { prizeAmount: thirdPrize } : {}) })
        .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, thirdGroup.map((r) => r.userId))));
    }
  }

  await db
    .update(poolsTable)
    .set({ isActive: false, endedAt: new Date() })
    .where(eq(poolsTable.id, poolId));

  log.info(
    { poolId, maxScore, winnerCount: winnerUserIds.length, winnerUserIds },
    `${label} Week 18: season closed`,
  );

  return { closureApplied: true, winnerCount: winnerUserIds.length };
}
