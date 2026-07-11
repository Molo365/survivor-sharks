import { Router } from "express";
import { db } from "@workspace/db";
import { entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq, inArray, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /api/users/me/balance
router.get("/me/balance", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const rows = await db
    .select({
      entryId: entriesTable.id,
      poolId: entriesTable.poolId,
      status: entriesTable.status,
      finalWinner: entriesTable.finalWinner,
      eliminatedWeek: entriesTable.eliminatedWeek,
      poolName: poolsTable.name,
      sport: poolsTable.sport,
      poolType: poolsTable.poolType,
      entryFee: poolsTable.entryFee,
      prizeStructure: poolsTable.prizeStructure,
      isActive: poolsTable.isActive,
      commissionerName: usersTable.displayName,
      commissionerUsername: usersTable.username,
    })
    .from(entriesTable)
    .innerJoin(poolsTable, eq(poolsTable.id, entriesTable.poolId))
    .innerJoin(usersTable, eq(usersTable.id, poolsTable.commissionerId))
    .where(eq(entriesTable.userId, userId))
    .orderBy(desc(poolsTable.isActive), desc(entriesTable.id));

  if (rows.length === 0) {
    res.json({ activePools: [], pastPools: [] });
    return;
  }

  const poolIds = [...new Set(rows.map((r) => r.poolId))];
  const countRows = await db
    .select({ poolId: entriesTable.poolId, cnt: sql<string>`COUNT(*)` })
    .from(entriesTable)
    .where(inArray(entriesTable.poolId, poolIds))
    .groupBy(entriesTable.poolId);
  const countMap = new Map(countRows.map((r) => [r.poolId, Number(r.cnt)]));

  const activePools: Array<{
    poolId: number;
    poolName: string;
    sport: string;
    poolType: string;
    entryFee: number | null;
    commissionerName: string;
    status: string;
  }> = [];

  const pastPools: Array<{
    poolId: number;
    poolName: string;
    sport: string;
    poolType: string;
    entryFee: number | null;
    commissionerName: string;
    result: "won" | "lost" | "unknown";
    prizeWon: number | null;
  }> = [];

  for (const row of rows) {
    const commissionerName = row.commissionerName ?? row.commissionerUsername;
    const totalEntries = countMap.get(row.poolId) ?? 0;

    if (row.isActive) {
      activePools.push({
        poolId: row.poolId,
        poolName: row.poolName,
        sport: row.sport as string,
        poolType: row.poolType as string,
        entryFee: row.entryFee ?? null,
        commissionerName,
        status: row.status,
      });
    } else {
      let result: "won" | "lost" | "unknown" = "unknown";
      if (row.finalWinner) {
        result = "won";
      } else if (row.status === "eliminated") {
        result = "lost";
      }

      let prizeWon: number | null = null;
      if (row.finalWinner && row.entryFee && row.entryFee > 0) {
        const ps = row.prizeStructure as Array<{ place: number; amount: number }> | null;
        if (ps && ps.length > 0 && totalEntries > 0) {
          prizeWon = Math.round(((ps[0].amount / 100) * row.entryFee * totalEntries) * 100) / 100;
        }
      }

      pastPools.push({
        poolId: row.poolId,
        poolName: row.poolName,
        sport: row.sport as string,
        poolType: row.poolType as string,
        entryFee: row.entryFee ?? null,
        commissionerName,
        result,
        prizeWon,
      });
    }
  }

  res.json({ activePools, pastPools });
});

export default router;
