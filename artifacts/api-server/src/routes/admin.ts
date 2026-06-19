import { Router } from "express";
import { db } from "@workspace/db";
import { poolsTable, usersTable, entriesTable, pickemPicksTable, picksTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { processCompletedGames } from "../lib/auto-eliminator";
import { fetchGamesForDate, fetchIntlGamesForDate } from "../lib/espn";

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
      poolType: pool.poolType,
      description: pool.description,
      inviteCode: pool.inviteCode,
      currentWeek: pool.currentWeek,
      season: pool.season,
      isActive: pool.isActive,
      sandboxMode: (pool as any).sandboxMode ?? false,
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

// PATCH /api/admin/pools/:poolId/sandbox-mode
router.patch("/pools/:poolId/sandbox-mode", requireAuth, requireAdmin, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }
  const { sandboxMode } = req.body as { sandboxMode: boolean };
  if (typeof sandboxMode !== "boolean") {
    res.status(400).json({ error: "sandboxMode must be a boolean" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  const sandboxCapable = ["nfl_confidence", "nfl_confidence_weekly", "season", "weekly", "mid_season", "nfl_division_predictor"];
  if (!sandboxCapable.includes(pool.poolType as string)) {
    res.status(400).json({ error: "Sandbox mode is not available for this pool type" });
    return;
  }
  await db.update(poolsTable).set({ sandboxMode }).where(eq(poolsTable.id, poolId));
  res.json({ ok: true, poolId, sandboxMode });
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

// DELETE /api/admin/users/:userId
router.delete("/users/:userId", requireAuth, requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const [existing] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (existing.role === "admin") {
    res.status(403).json({ error: "Cannot delete admin users" });
    return;
  }
  const ownedPools = await db.select({ id: poolsTable.id }).from(poolsTable).where(eq(poolsTable.commissionerId, userId));
  if (ownedPools.length > 0) {
    res.status(409).json({ error: "User is a commissioner of one or more pools. Delete or reassign those pools first." });
    return;
  }
  await db.delete(pickemPicksTable).where(eq(pickemPicksTable.userId, userId));
  await db.delete(picksTable).where(eq(picksTable.userId, userId));
  await db.delete(entriesTable).where(eq(entriesTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.json({ success: true });
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

// POST /api/admin/process-results — manually trigger the auto-eliminator
router.post("/process-results", requireAuth, requireAdmin, async (req, res) => {
  req.log.info("Manual auto-elimination triggered via admin API");
  const stats = await processCompletedGames();
  res.json({ success: true, ...stats });
});

// POST /api/admin/pickem/process-results
// Body: { poolId: number, date?: string (YYYY-MM-DD) }
router.post("/pickem/process-results", requireAuth, requireAdmin, async (req, res) => {
  const { poolId, date } = req.body as { poolId: number; date?: string };

  if (!poolId) { res.status(400).json({ error: "poolId is required" }); return; }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem") { res.status(400).json({ error: "Not a Pick-Em pool" }); return; }

  const sport = pool.sport as string;
  const isIntl = sport === "intl";
  const isWc = sport === "worldcup";
  const is3way = isWc || isIntl;

  let pendingDates: string[];
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    pendingDates = [date];
  } else {
    const rows = await db
      .selectDistinct({ gameDate: pickemPicksTable.gameDate })
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.result, "pending")));
    pendingDates = rows.map((r) => r.gameDate);
  }

  const gamesByDate = await Promise.all(
    pendingDates.map((dateStr) => {
      const espnDate = dateStr.replace(/-/g, "");
      return isIntl ? fetchIntlGamesForDate(espnDate) : fetchGamesForDate(sport, espnDate);
    }),
  );

  const seenIds = new Set<string>();
  const finalGames = gamesByDate.flat().filter((g) => {
    if (!g.isCompleted || g.homeScore == null || g.awayScore == null) return false;
    if (seenIds.has(g.id)) return false;
    seenIds.add(g.id);
    return true;
  });

  let processed = 0;
  for (const game of finalGames) {
    const gamePicks = await db
      .select()
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.gameId, game.id), eq(pickemPicksTable.result, "pending")));

    for (const pick of gamePicks) {
      let result: "correct" | "incorrect";
      if (is3way) {
        const outcome = game.homeScore! > game.awayScore! ? "home_win" : game.awayScore! > game.homeScore! ? "away_win" : "draw";
        result = pick.pickedTeamId === outcome ? "correct" : "incorrect";
      } else {
        const winningTeamId = game.homeScore! > game.awayScore! ? game.homeTeam.id : game.awayTeam.id;
        result = pick.pickedTeamId === winningTeamId ? "correct" : "incorrect";
      }
      await db.update(pickemPicksTable).set({ result, updatedAt: new Date() }).where(eq(pickemPicksTable.id, pick.id));
      processed++;
    }
  }

  req.log.info({ poolId, date, processed, pendingDates }, "Admin graded Pick-Em results");
  res.json({ processed, dates: pendingDates });
});

export default router;
