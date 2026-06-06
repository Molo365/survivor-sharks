import { Router } from "express";
import { db, pool as pgPool } from "@workspace/db";
import { poolsTable, usersTable, entriesTable, picksTable, pickemPicksTable } from "@workspace/db";
import { eq, count, gte, sql, and } from "drizzle-orm";
import { requireAdminAuth } from "../middlewares/adminAuth";
import { processCompletedGames } from "../lib/auto-eliminator";
import { fetchGamesForDate, fetchIntlGamesForDate } from "../lib/espn";

const router = Router();

router.use(requireAdminAuth);

// GET /api/admin-panel/stats
router.get("/stats", async (_req, res) => {
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);
  const [{ totalPools }] = await db.select({ totalPools: count() }).from(poolsTable);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [{ picksToday }] = await db
    .select({ picksToday: count() })
    .from(picksTable)
    .where(gte(picksTable.submittedAt, todayStart));

  res.json({
    totalUsers: Number(totalUsers),
    totalPools: Number(totalPools),
    picksToday: Number(picksToday),
  });
});

// GET /api/admin-panel/pools
router.get("/pools", async (_req, res) => {
  const pools = await db.select().from(poolsTable).orderBy(poolsTable.createdAt);

  const result = await Promise.all(pools.map(async (pool) => {
    const [{ total }] = await db.select({ total: count() }).from(entriesTable).where(eq(entriesTable.poolId, pool.id));
    const [commissioner] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, pool.commissionerId));

    return {
      id: pool.id,
      name: pool.name,
      sport: pool.sport,
      poolType: pool.poolType,
      isActive: pool.isActive,
      memberCount: Number(total),
      commissionerName: commissioner?.username ?? "",
      currentWeek: pool.currentWeek,
      season: pool.season,
      createdAt: pool.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

// DELETE /api/admin-panel/pools/:poolId
router.delete("/pools/:poolId", async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  await db.delete(poolsTable).where(eq(poolsTable.id, poolId));
  res.json({ success: true });
});

// GET /api/admin-panel/users
router.get("/users", async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);

  const result = await Promise.all(users.map(async (user) => {
    const [{ poolCount }] = await db
      .select({ poolCount: count() })
      .from(entriesTable)
      .where(eq(entriesTable.userId, user.id));
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

// DELETE /api/admin-panel/users/:userId
router.delete("/users/:userId", async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.json({ success: true });
});

// POST /api/admin-panel/wipe-test-data
// Deletes pools/users whose names contain "test" (case-insensitive), plus orphaned entries/picks
router.post("/wipe-test-data", async (_req, res) => {
  const testPools = await db
    .select({ id: poolsTable.id })
    .from(poolsTable)
    .where(sql`lower(${poolsTable.name}) like '%test%'`);

  let poolsDeleted = 0;
  for (const p of testPools) {
    await db.delete(poolsTable).where(eq(poolsTable.id, p.id));
    poolsDeleted++;
  }

  const testUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) like '%test%'`);

  let usersDeleted = 0;
  for (const u of testUsers) {
    await db.delete(usersTable).where(eq(usersTable.id, u.id));
    usersDeleted++;
  }

  res.json({ success: true, poolsDeleted, usersDeleted });
});

// POST /api/admin-panel/reset-database
// Full wipe: picks → entries → pools → users (sessions survive)
router.post("/reset-database", async (_req, res) => {
  await pgPool.query("DELETE FROM picks");
  await pgPool.query("DELETE FROM week_results");
  await pgPool.query("DELETE FROM entries");
  await pgPool.query("DELETE FROM pools");
  await pgPool.query("DELETE FROM users");
  res.json({ success: true, message: "All data wiped" });
});

// POST /api/admin-panel/process-results
router.post("/process-results", async (req, res) => {
  req.log.info("Manual auto-elimination triggered via admin panel");
  const stats = await processCompletedGames();
  res.json({ success: true, ...stats });
});

// POST /api/admin-panel/pickem/process-results
// Body: { poolId: number, date?: string (YYYY-MM-DD) }
// Grades all pending Pick-Em picks in a pool, optionally scoped to one date.
router.post("/pickem/process-results", async (req, res) => {
  const { poolId, date } = req.body as { poolId: number; date?: string };

  if (!poolId) { res.status(400).json({ error: "poolId is required" }); return; }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem") { res.status(400).json({ error: "Not a Pick-Em pool" }); return; }

  const sport = pool.sport as string;
  const isIntl = sport === "intl";
  const isWc = sport === "worldcup";
  const is3way = isWc || isIntl;

  // If a date is given, scope to that date; otherwise find all dates with pending picks.
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
