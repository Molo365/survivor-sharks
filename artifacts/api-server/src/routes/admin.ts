import { Router } from "express";
import { db } from "@workspace/db";
import { poolsTable, usersTable, entriesTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router = Router();

// GET /api/admin/pools
router.get("/pools", requireAuth, requireAdmin, async (_req, res) => {
  const pools = await db.select().from(poolsTable).orderBy(poolsTable.createdAt);

  const result = await Promise.all(pools.map(async (pool) => {
    const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, pool.id));
    const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));
    const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, pool.commissionerId));

    return {
      id: pool.id,
      name: pool.name,
      sport: pool.sport,
      description: pool.description,
      inviteCode: pool.inviteCode,
      currentWeek: pool.currentWeek,
      season: pool.season,
      isActive: pool.isActive,
      memberCount: Number(total),
      activeCount: Number(active),
      commissionerId: pool.commissionerId,
      commissionerName: commissioner?.username ?? "",
      maxEntries: pool.maxEntries,
      entryFee: pool.entryFee,
      prizePot: pool.prizePot,
      createdAt: pool.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

// DELETE /api/admin/pools/:poolId
router.delete("/pools/:poolId", requireAuth, requireAdmin, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  await db.delete(poolsTable).where(eq(poolsTable.id, poolId));
  res.json({ success: true, message: "Pool deleted" });
});

// GET /api/admin/users
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);

  const result = await Promise.all(users.map(async (user) => {
    const [{ poolCount }] = await db.select({ poolCount: count() }).from(entriesTable).where(eq(entriesTable.userId, user.id));
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      poolCount: Number(poolCount),
      createdAt: user.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

// PATCH /api/admin/users/:userId
router.patch("/users/:userId", requireAuth, requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  const { role, displayName } = req.body;

  const [user] = await db.update(usersTable).set({
    ...(role !== undefined && { role }),
    ...(displayName !== undefined && { displayName }),
  }).where(eq(usersTable.id, userId)).returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [{ poolCount }] = await db.select({ poolCount: count() }).from(entriesTable).where(eq(entriesTable.userId, user.id));

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    poolCount: Number(poolCount),
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
