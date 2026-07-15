import { Router } from "express";
import { db } from "@workspace/db";
import { entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq, and, isNotNull, gt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/final-results
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = (req as any).user.id as number;

  const [pool] = await db
    .select({ entryFee: poolsTable.entryFee, closureReason: poolsTable.closureReason })
    .from(poolsTable)
    .where(eq(poolsTable.id, poolId))
    .limit(1);

  if (!pool) return res.status(404).json({ error: "Pool not found" });

  const isFreePool = !pool.entryFee || pool.entryFee <= 0;
  const hadTiebreaker = pool.closureReason === "sov_tiebreaker";

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

  return res.json({ currentUserEntry, payouts, isFreePool, hadTiebreaker });
});

export default router;
