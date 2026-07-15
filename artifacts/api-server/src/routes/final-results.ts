import { Router } from "express";
import { db } from "@workspace/db";
import {
  entriesTable,
  poolsTable,
  usersTable,
  pickemPicksTable,
  nflConfidenceResultsTable,
} from "@workspace/db";
import { eq, and, isNotNull, gt, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router({ mergeParams: true });

const PICKEM_SEASON_TIEBREAKER_WEEK = 18;

// GET /api/pools/:poolId/final-results
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = (req as any).user.id as number;

  const [pool] = await db
    .select({
      entryFee: poolsTable.entryFee,
      poolType: poolsTable.poolType,
    })
    .from(poolsTable)
    .where(eq(poolsTable.id, poolId))
    .limit(1);

  if (!pool) return res.status(404).json({ error: "Pool not found" });

  const isFreePool = !pool.entryFee || pool.entryFee <= 0;

  const [rawUserEntry] = await db
    .select({
      finishPosition: entriesTable.finishPosition,
      prizeAmount: entriesTable.prizeAmount,
      finalWinner: entriesTable.finalWinner,
    })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);

  const payoutRows = await db
    .select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      finishPosition: entriesTable.finishPosition,
      prizeAmount: entriesTable.prizeAmount,
    })
    .from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(
      isFreePool
        ? and(eq(entriesTable.poolId, poolId), isNotNull(entriesTable.finishPosition))
        : and(
            eq(entriesTable.poolId, poolId),
            isNotNull(entriesTable.finishPosition),
            gt(entriesTable.prizeAmount, 0),
          ),
    )
    .orderBy(entriesTable.finishPosition);

  const payouts = payoutRows.map((r) => ({
    userId: r.userId,
    username: r.displayName ?? r.username,
    finishPosition: r.finishPosition!,
    prizeAmount: r.prizeAmount ?? null,
  }));

  const coWinners = Math.max(1, payouts.filter((p) => p.finishPosition === 1).length);

  const currentUserEntry = rawUserEntry
    ? {
        finishPosition: rawUserEntry.finishPosition ?? null,
        prizeAmount: rawUserEntry.prizeAmount ?? null,
        finalWinner: rawUserEntry.finalWinner,
        coWinners,
      }
    : null;

  // ── Tiebreaker detection and summary (pickem_season only) ────────────────
  // A tiebreaker resolved the pool when:
  //   • 2+ players share the highest season correct-pick count, AND
  //   • exactly 1 entry has finalWinner = true (sole winner, not a co-winner split)
  // Detection reads from the actual data rather than relying on closureReason,
  // which stores the winner's display name rather than a sentinel string.
  let hadTiebreaker = false;
  let tiebreakerSummary: {
    actualPassingYards: number;
    actualRushingYards: number;
    actualCombinedYards: number;
    players: Array<{
      userId: number;
      username: string;
      guessPassingYards: number | null;
      guessRushingYards: number | null;
      guessCombinedYards: number | null;
      delta: number | null;
      isWinner: boolean;
    }>;
  } | null = null;

  if (pool.poolType === "pickem_season") {
    // Season-total correct picks per user across all weeks.
    const seasonTotals = await db
      .select({
        userId: pickemPicksTable.userId,
        correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
      })
      .from(pickemPicksTable)
      .where(eq(pickemPicksTable.poolId, poolId))
      .groupBy(pickemPicksTable.userId);

    if (seasonTotals.length > 0) {
      const topCorrect = Math.max(...seasonTotals.map((r) => Number(r.correct)));
      const topScorerIds = seasonTotals
        .filter((r) => Number(r.correct) === topCorrect)
        .map((r) => r.userId);

      // Count how many entries carry the finalWinner flag.
      const winnerEntries = await db
        .select({ userId: entriesTable.userId })
        .from(entriesTable)
        .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.finalWinner, true)));

      // Tiebreaker: 2+ players tied at the top, but only one ended up as winner
      // (meaning the tie was broken, not split as co-winners).
      hadTiebreaker = topScorerIds.length >= 2 && winnerEntries.length === 1;

      if (hadTiebreaker) {
        const [actualsRow] = await db
          .select({
            actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
            actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
          })
          .from(nflConfidenceResultsTable)
          .where(
            and(
              eq(nflConfidenceResultsTable.poolId, poolId),
              eq(nflConfidenceResultsTable.week, PICKEM_SEASON_TIEBREAKER_WEEK),
            ),
          )
          .limit(1);

        if (actualsRow) {
          // Fetch entries for all tied players (the full top-score group).
          const tiedEntries = await db
            .select({
              userId: entriesTable.userId,
              username: usersTable.username,
              displayName: usersTable.displayName,
              tiebreakerPassingYards: entriesTable.tiebreakerPassingYards,
              tiebreakerRushingYards: entriesTable.tiebreakerRushingYards,
              finalWinner: entriesTable.finalWinner,
            })
            .from(entriesTable)
            .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
            .where(
              and(
                eq(entriesTable.poolId, poolId),
                inArray(entriesTable.userId, topScorerIds),
              ),
            );

          const actualCombined =
            actualsRow.actualPassingYards + actualsRow.actualRushingYards;

          tiebreakerSummary = {
            actualPassingYards: actualsRow.actualPassingYards,
            actualRushingYards: actualsRow.actualRushingYards,
            actualCombinedYards: actualCombined,
            players: tiedEntries
              .map((e) => {
                const guessCombined =
                  e.tiebreakerPassingYards != null && e.tiebreakerRushingYards != null
                    ? e.tiebreakerPassingYards + e.tiebreakerRushingYards
                    : null;
                const delta =
                  guessCombined != null ? Math.abs(guessCombined - actualCombined) : null;
                return {
                  userId: e.userId,
                  username: e.displayName ?? e.username,
                  guessPassingYards: e.tiebreakerPassingYards,
                  guessRushingYards: e.tiebreakerRushingYards,
                  guessCombinedYards: guessCombined,
                  delta,
                  isWinner: e.finalWinner ?? false,
                };
              })
              .sort((a, b) => {
                // Closest guesser first; null deltas (no guess) go last.
                if (a.delta == null && b.delta == null) return 0;
                if (a.delta == null) return 1;
                if (b.delta == null) return -1;
                return a.delta - b.delta;
              }),
          };
        }
      }
    }
  }

  return res.json({ currentUserEntry, payouts, isFreePool, hadTiebreaker, tiebreakerSummary });
});

export default router;
