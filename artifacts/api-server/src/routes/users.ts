import { Router } from "express";
import { db } from "@workspace/db";
import { entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq, inArray, sql, desc, and, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { normalizeDisplayName } from "../lib/display-name";

const router = Router();

// PATCH /api/users/me/reminders
router.patch("/me/reminders", requireAuth, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  const [user] = await db.update(usersTable)
    .set({ remindersEnabled: enabled })
    .where(eq(usersTable.id, req.user!.id))
    .returning({ remindersEnabled: usersTable.remindersEnabled });
  res.json({ remindersEnabled: user!.remindersEnabled });
});

// PATCH /api/users/me/display-name
router.patch("/me/display-name", requireAuth, async (req, res) => {
  const normalized = normalizeDisplayName(req.body?.displayName);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const [conflict] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      ne(usersTable.id, req.user!.id),
      sql`(
        lower(${usersTable.displayName}) = lower(${normalized.value})
        OR lower(${usersTable.username}) = lower(${normalized.value})
      )`,
    ))
    .limit(1);

  if (conflict) {
    res.status(409).json({
      error: "That name is already taken. Please choose another.",
    });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ displayName: normalized.value })
    .where(eq(usersTable.id, req.user!.id))
    .returning({ displayName: usersTable.displayName });

  res.json({ displayName: user?.displayName ?? normalized.value });
});

// GET /api/users/me/balance
router.get("/me/balance", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const rows = await db
    .select({
      entryId: entriesTable.id,
      poolId: entriesTable.poolId,
      status: entriesTable.status,
      finalWinner: entriesTable.finalWinner,
      finishPosition: entriesTable.finishPosition,
      prizeAmount: entriesTable.prizeAmount,
      eliminatedWeek: entriesTable.eliminatedWeek,
      poolName: poolsTable.name,
      sport: poolsTable.sport,
      poolType: poolsTable.poolType,
      entryFee: poolsTable.entryFee,
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

  // Fetch winner names for past pools
  const pastPoolIds = [...new Set(rows.filter((r) => !r.isActive).map((r) => r.poolId))];
  const winnersByPool = new Map<number, string[]>();
  if (pastPoolIds.length > 0) {
    const winnerRows = await db
      .select({
        poolId: entriesTable.poolId,
        winnerName: sql<string>`COALESCE(${usersTable.displayName}, ${usersTable.username})`,
      })
      .from(entriesTable)
      .innerJoin(usersTable, eq(usersTable.id, entriesTable.userId))
      .where(and(
        inArray(entriesTable.poolId, pastPoolIds),
        eq(entriesTable.finalWinner, true),
      ));
    for (const r of winnerRows) {
      const arr = winnersByPool.get(r.poolId) ?? [];
      arr.push(r.winnerName);
      winnersByPool.set(r.poolId, arr);
    }
  }

  function formatWinnerName(names: string[] | undefined): string | null {
    if (!names || names.length === 0) return null;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names[0]} +${names.length - 1} more`;
  }

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
    finishPosition: number | null;
    prizeAmount: number | null;
    netResult: number;
    winnerName: string | null;
  }> = [];

  for (const row of rows) {
    const commissionerName = row.commissionerName ?? row.commissionerUsername;

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
      if (row.finalWinner) result = "won";
      else if (row.status === "eliminated") result = "lost";

      const prizeAmount = row.prizeAmount ?? null;
      const entryFee = row.entryFee ?? null;
      const netResult = (prizeAmount ?? 0) - (entryFee ?? 0);

      pastPools.push({
        poolId: row.poolId,
        poolName: row.poolName,
        sport: row.sport as string,
        poolType: row.poolType as string,
        entryFee,
        commissionerName,
        result,
        finishPosition: row.finishPosition ?? null,
        prizeAmount,
        netResult,
        winnerName: formatWinnerName(winnersByPool.get(row.poolId)),
      });
    }
  }

  res.json({ activePools, pastPools });
});

export default router;
