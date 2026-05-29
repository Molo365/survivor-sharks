import { Router } from "express";
import { db } from "@workspace/db";
import { poolsTable, entriesTable, usersTable, picksTable } from "@workspace/db";
import { eq, and, count, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { nanoid } from "../lib/nanoid";

const router = Router();

function generateInviteCode() {
  return nanoid(8).toUpperCase();
}

function formatPool(pool: typeof poolsTable.$inferSelect, memberCount: number, activeCount: number, commissionerName: string) {
  return {
    id: pool.id,
    name: pool.name,
    sport: pool.sport,
    description: pool.description,
    inviteCode: pool.inviteCode,
    currentWeek: pool.currentWeek,
    season: pool.season,
    isActive: pool.isActive,
    memberCount,
    activeCount,
    commissionerId: pool.commissionerId,
    commissionerName,
    maxEntries: pool.maxEntries,
    entryFee: pool.entryFee,
    prizePot: pool.prizePot,
    createdAt: pool.createdAt.toISOString(),
  };
}

// GET /api/pools
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const memberships = await db.select({ poolId: entriesTable.poolId })
    .from(entriesTable)
    .where(eq(entriesTable.userId, userId));

  const poolIds = memberships.map(m => m.poolId);
  if (poolIds.length === 0) {
    res.json([]);
    return;
  }

  const pools = await db.select().from(poolsTable)
    .where(inArray(poolsTable.id, poolIds));

  const result = await Promise.all(pools.map(async (pool) => {
    const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, pool.id));
    const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));
    const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, pool.commissionerId));
    return formatPool(pool, Number(total), Number(active), commissioner?.username ?? "");
  }));

  res.json(result);
});

// POST /api/pools
router.post("/", requireAuth, async (req, res) => {
  const { name, sport, description, maxEntries, entryFee, prizePot, currentWeek, season } = req.body;

  if (!name || !sport) {
    res.status(400).json({ error: "name and sport are required" });
    return;
  }

  const inviteCode = generateInviteCode();
  const [pool] = await db.insert(poolsTable).values({
    name,
    sport: sport as "nfl" | "mlb" | "nba" | "nhl" | "fifa",
    description: description ?? null,
    inviteCode,
    currentWeek: currentWeek ?? 1,
    season: season ?? new Date().getFullYear(),
    isActive: true,
    commissionerId: req.user!.id,
    maxEntries: maxEntries ?? null,
    entryFee: entryFee ?? null,
    prizePot: prizePot ?? null,
  }).returning();

  await db.insert(entriesTable).values({ poolId: pool.id, userId: req.user!.id, status: "alive" });

  res.status(201).json(formatPool(pool, 1, 1, req.user!.username));
});

// POST /api/pools/join
router.post("/join", requireAuth, async (req, res) => {
  const { inviteCode } = req.body;

  if (!inviteCode) {
    res.status(400).json({ error: "inviteCode is required" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.inviteCode, inviteCode.toUpperCase())).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [existing] = await db.select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.userId, req.user!.id)))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Already a member of this pool" });
    return;
  }

  await db.insert(entriesTable).values({ poolId: pool.id, userId: req.user!.id, status: "alive" });

  const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, pool.id));
  const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));
  const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, pool.commissionerId));

  res.json(formatPool(pool, Number(total), Number(active), commissioner?.username ?? ""));
});

// GET /api/pools/:poolId
router.get("/:poolId", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const members = await db.select({
    userId: entriesTable.userId,
    username: usersTable.username,
    displayName: usersTable.displayName,
    status: entriesTable.status,
    eliminatedWeek: entriesTable.eliminatedWeek,
    joinedAt: entriesTable.joinedAt,
  }).from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId));

  const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, pool.commissionerId));

  res.json({
    id: pool.id,
    name: pool.name,
    sport: pool.sport,
    description: pool.description,
    inviteCode: pool.inviteCode,
    currentWeek: pool.currentWeek,
    season: pool.season,
    isActive: pool.isActive,
    commissionerId: pool.commissionerId,
    commissionerName: commissioner?.username ?? "",
    maxEntries: pool.maxEntries,
    entryFee: pool.entryFee,
    prizePot: pool.prizePot,
    totalMembers: members.length,
    activeCount: members.filter(m => m.status === "alive").length,
    members: members.map(m => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    createdAt: pool.createdAt.toISOString(),
  });
});

// PATCH /api/pools/:poolId
router.patch("/:poolId", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.commissionerId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const { name, description, maxEntries, currentWeek, season, isActive } = req.body;
  const [updated] = await db.update(poolsTable).set({
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(maxEntries !== undefined && { maxEntries }),
    ...(currentWeek !== undefined && { currentWeek }),
    ...(season !== undefined && { season }),
    ...(isActive !== undefined && { isActive }),
  }).where(eq(poolsTable.id, poolId)).returning();

  const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, poolId));
  const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
  const [commissioner] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, updated.commissionerId));

  res.json(formatPool(updated, Number(total), Number(active), commissioner?.username ?? ""));
});

// DELETE /api/pools/:poolId
router.delete("/:poolId", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.commissionerId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  await db.delete(poolsTable).where(eq(poolsTable.id, poolId));
  res.json({ success: true, message: "Pool deleted" });
});

// GET /api/pools/:poolId/stats
router.get("/:poolId/stats", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, poolId));
  const [{ active }] = await db.select({ active: count() }).from(entriesTable).where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
  const totalNum = Number(total);
  const activeNum = Number(active);

  const thisWeekPicks = await db.select({ teamName: picksTable.teamName }).from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, pool.currentWeek)));

  const teamCounts: Record<string, number> = {};
  for (const p of thisWeekPicks) {
    teamCounts[p.teamName] = (teamCounts[p.teamName] ?? 0) + 1;
  }
  const sortedTeams = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);

  res.json({
    poolId,
    totalMembers: totalNum,
    activeMembers: activeNum,
    eliminatedMembers: totalNum - activeNum,
    currentWeek: pool.currentWeek,
    weeklyPickRate: totalNum > 0 ? thisWeekPicks.length / totalNum : 0,
    mostPickedTeam: sortedTeams[0]?.[0] ?? null,
    mostPickedTeamCount: sortedTeams[0]?.[1] ?? null,
    survivorPercentage: totalNum > 0 ? (activeNum / totalNum) * 100 : 0,
  });
});

export default router;
