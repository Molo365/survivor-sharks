import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, pool as pgPool } from "@workspace/db";
import { poolsTable, usersTable, entriesTable, picksTable, pickemPicksTable, groupStageResultsTable, groupStagePredictorPicksTable } from "@workspace/db";
import { eq, count, gte, sql, and, or } from "drizzle-orm";
import { requireAdminAuth } from "../middlewares/adminAuth";
import { processCompletedGames } from "../lib/auto-eliminator";
import { fetchGamesForDate, fetchIntlGamesForDate } from "../lib/espn";
import { fetchWcStandings } from "../lib/wc";
import { closePredictorPool, GSP_GROUP_COUNT } from "../lib/closePredictorPool";

const router = Router();

router.use(requireAdminAuth);

// GET /api/admin-panel/environment
router.get("/environment", (_req, res) => {
  res.json({ isProduction: process.env.NODE_ENV === "production" });
});

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

// POST /api/admin-panel/users
router.post("/users", async (req, res) => {
  const { username, email, password, displayName, role } = req.body;
  if (!username || !email || !password) {
    res.status(400).json({ error: "username, email, and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.username, username), eq(usersTable.email, email)));
  if (existing) {
    res.status(409).json({ error: "Username or email already taken" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    username,
    email,
    passwordHash,
    displayName: displayName || null,
    role: role === "admin" ? "admin" : "user",
  }).returning();
  res.status(201).json({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    poolCount: 0,
    createdAt: user.createdAt.toISOString(),
  });
});

// PATCH /api/admin-panel/users/:userId/password
router.patch("/users/:userId/password", async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
  res.json({ success: true });
});

// DELETE /api/admin-panel/users/:userId
router.delete("/users/:userId", async (req, res) => {
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
    res.status(409).json({ error: "User is a commissioner of one or more pools. Delete those pools first." });
    return;
  }
  await db.delete(pickemPicksTable).where(eq(pickemPicksTable.userId, userId));
  await db.delete(picksTable).where(eq(picksTable.userId, userId));
  await db.delete(entriesTable).where(eq(entriesTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.json({ success: true });
});

// POST /api/admin-panel/wipe-test-data
// Deletes pools/users whose names contain "test" (case-insensitive), plus orphaned entries/picks
router.post("/wipe-test-data", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "This action is disabled in production." });
    return;
  }
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
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "This action is disabled in production." });
    return;
  }
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

// ── GSP Admin endpoints ──────────────────────────────────────────────────────

// GET /api/admin-panel/gsp/pools — list all Group Stage Predictor pools
router.get("/gsp/pools", async (_req, res) => {
  const gspPools = await db
    .select({ id: poolsTable.id, name: poolsTable.name })
    .from(poolsTable)
    .where(sql`${poolsTable.poolType}::text = 'group_stage_predictor'`);
  res.json(gspPools);
});

// GET /api/admin-panel/gsp/groups — WC 2026 live group definitions from ESPN
router.get("/gsp/groups", async (_req, res) => {
  const standings = await fetchWcStandings();
  if (standings.length === 0) {
    res.status(503).json({ error: "Group data unavailable — ESPN API unreachable" });
    return;
  }
  const groups = standings.map((g) => ({
    name: g.groupLetter,
    teams: g.teams.map((t) => ({
      name: t.displayName,
      abbr: t.abbreviation,
      flagUrl: t.logo ?? "",
    })),
  }));
  res.json(groups);
});

// GET /api/admin-panel/gsp/results/:poolId — current actual results for a pool
router.get("/gsp/results/:poolId", async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }

  const results = await db
    .select()
    .from(groupStageResultsTable)
    .where(eq(groupStageResultsTable.poolId, poolId));

  res.json(results.map((r) => ({
    groupName: r.groupName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
  })));
});

// POST /api/admin-panel/gsp/auto-results — auto-populate group standings from ESPN + fire closure
router.post("/gsp/auto-results", async (req, res) => {
  const { poolId } = req.body as { poolId: number };
  if (!poolId) { res.status(400).json({ error: "poolId is required" }); return; }

  const [pool] = await db
    .select({ id: poolsTable.id, isActive: poolsTable.isActive })
    .from(poolsTable)
    .where(eq(poolsTable.id, poolId))
    .limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const standings = await fetchWcStandings();
  if (standings.length === 0) {
    res.status(503).json({ error: "ESPN standings unavailable — cannot auto-populate results" });
    return;
  }

  const values = standings.map((g) => ({
    poolId,
    groupName: g.groupLetter,
    pos1Team: g.teams[0]?.displayName ?? "",
    pos2Team: g.teams[1]?.displayName ?? "",
    pos3Team: g.teams[2]?.displayName ?? "",
    pos4Team: g.teams[3]?.displayName ?? "",
  })).filter((v) => v.pos1Team && v.pos2Team && v.pos3Team && v.pos4Team);

  if (values.length === 0) {
    res.status(400).json({ error: "No complete group standings available from ESPN yet" });
    return;
  }

  await db
    .insert(groupStageResultsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [groupStageResultsTable.poolId, groupStageResultsTable.groupName],
      set: {
        pos1Team: sql`excluded.pos1_team`,
        pos2Team: sql`excluded.pos2_team`,
        pos3Team: sql`excluded.pos3_team`,
        pos4Team: sql`excluded.pos4_team`,
        enteredAt: sql`now()`,
      },
    });

  const allSaved = await db
    .select()
    .from(groupStageResultsTable)
    .where(eq(groupStageResultsTable.poolId, poolId));

  let closedPool = false;
  let closureWarning: string | undefined;

  if (pool.isActive) {
    try {
      const distinctCount = allSaved.length;
      if (distinctCount >= GSP_GROUP_COUNT) {
        const [allPicks, members] = await Promise.all([
          db.select().from(groupStagePredictorPicksTable)
            .where(eq(groupStagePredictorPicksTable.poolId, poolId)),
          db.select({ userId: entriesTable.userId })
            .from(entriesTable)
            .where(eq(entriesTable.poolId, poolId)),
        ]);

        const resultMap = new Map(allSaved.map((r) => [r.groupName, r]));
        const outcome = await closePredictorPool({
          poolId,
          resultMap,
          allPicks,
          memberUserIds: members.map((m) => m.userId),
          getPickKey: (pick) => pick.groupName,
          log: req.log,
        });

        if (outcome.closed) {
          closedPool = true;
        } else {
          closureWarning = outcome.detail ?? `Closure skipped (${outcome.reason})`;
        }
      }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      req.log.error({ err, poolId }, "GSP auto-results: closure detection failed");
      closureWarning = `Pool closure check failed: ${detail}. Results were saved — please retry.`;
    }
  }

  req.log.info({ poolId, groupCount: values.length, closedPool }, "GSP auto-results populated from ESPN standings");
  res.json(closureWarning
    ? { saved: values.length, closedPool, closureWarning }
    : { saved: values.length, closedPool });
});

// POST /api/admin-panel/gsp/results — enter actual group stage standings
// Body: { poolId: number, results: Array<{ groupName, pos1Team..pos4Team }> }
router.post("/gsp/results", async (req, res) => {
  const { poolId, results } = req.body as {
    poolId: number;
    results: Array<{
      groupName: string;
      pos1Team: string;
      pos2Team: string;
      pos3Team: string;
      pos4Team: string;
    }>;
  };

  if (!poolId) { res.status(400).json({ error: "poolId is required" }); return; }
  if (!Array.isArray(results) || results.length === 0) {
    res.status(400).json({ error: "results array is required" });
    return;
  }

  const standings = await fetchWcStandings();
  if (standings.length === 0) {
    res.status(503).json({ error: "Cannot validate results — ESPN API unreachable" });
    return;
  }

  const validGroupMap = new Map(
    standings.map((g) => [g.groupLetter, new Set(g.teams.map((t) => t.displayName))]),
  );

  for (const result of results) {
    const groupTeams = validGroupMap.get(result.groupName);
    if (!groupTeams) {
      res.status(400).json({ error: `Invalid group: ${result.groupName}` });
      return;
    }
    const submitted = [result.pos1Team, result.pos2Team, result.pos3Team, result.pos4Team];
    if (!submitted.every((t) => groupTeams.has(t))) {
      res.status(400).json({ error: `Invalid teams for group ${result.groupName}` });
      return;
    }
    if (new Set(submitted).size !== 4) {
      res.status(400).json({ error: `Duplicate teams in group ${result.groupName}` });
      return;
    }
  }

  const values = results.map((r) => ({
    poolId,
    groupName: r.groupName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
  }));

  await db
    .insert(groupStageResultsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [groupStageResultsTable.poolId, groupStageResultsTable.groupName],
      set: {
        pos1Team: sql`excluded.pos1_team`,
        pos2Team: sql`excluded.pos2_team`,
        pos3Team: sql`excluded.pos3_team`,
        pos4Team: sql`excluded.pos4_team`,
        enteredAt: sql`now()`,
      },
    });

  // ── Closure detection ─────────────────────────────────────────────────────
  const [pool] = await db
    .select({ id: poolsTable.id, isActive: poolsTable.isActive })
    .from(poolsTable)
    .where(eq(poolsTable.id, poolId))
    .limit(1);

  let closedPool = false;
  let closureWarning: string | undefined;

  if (pool?.isActive) {
    try {
      const [countRows, allPicks, members] = await Promise.all([
        db.select({ count: sql<number>`COUNT(DISTINCT group_name)` })
          .from(groupStageResultsTable)
          .where(eq(groupStageResultsTable.poolId, poolId)),
        db.select().from(groupStagePredictorPicksTable)
          .where(eq(groupStagePredictorPicksTable.poolId, poolId)),
        db.select({ userId: entriesTable.userId })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, poolId)),
      ]);

      const distinctCount = Number(countRows[0]?.count ?? 0);

      if (distinctCount >= GSP_GROUP_COUNT) {
        const allSaved = await db
          .select()
          .from(groupStageResultsTable)
          .where(eq(groupStageResultsTable.poolId, poolId));
        const resultMap = new Map(allSaved.map((r) => [r.groupName, r]));

        const outcome = await closePredictorPool({
          poolId,
          resultMap,
          allPicks,
          memberUserIds: members.map((m) => m.userId),
          getPickKey: (pick) => pick.groupName,
          log: req.log,
        });

        if (outcome.closed) {
          closedPool = true;
        } else {
          closureWarning = outcome.detail ?? `Closure skipped (${outcome.reason})`;
        }
      }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      req.log.error({ err, poolId }, "GSP admin-panel closure detection failed");
      closureWarning = `Pool closure check failed: ${detail}. Results were saved — please retry or contact support.`;
    }
  }

  res.json(closureWarning
    ? { saved: results.length, closedPool, closureWarning }
    : { saved: results.length, closedPool });
});

// GET /api/admin-panel/pools/:poolId/detail
router.get("/pools/:poolId/detail", async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [commissioner] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, pool.commissionerId))
    .limit(1);

  const members = await db
    .select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      status: entriesTable.status,
      eliminatedWeek: entriesTable.eliminatedWeek,
      joinedAt: entriesTable.joinedAt,
    })
    .from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId));

  const PICKEM_TYPES = new Set(["pickem", "crazy_8s", "nfl_confidence", "nfl_confidence_weekly", "pickem_season"]);
  const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season", "dirty_dozen"]);
  const pt = pool.poolType as string;

  const userPickSet = new Set<number>();
  if (PICKEM_TYPES.has(pt)) {
    const rows = await db
      .select({ userId: pickemPicksTable.userId })
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, pool.currentWeek)));
    for (const r of rows) userPickSet.add(r.userId);
  } else if (SURVIVOR_TYPES.has(pt)) {
    const rows = await db
      .select({ userId: picksTable.userId })
      .from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, pool.currentWeek)));
    for (const r of rows) userPickSet.add(r.userId);
  }

  const entryFee = parseFloat(String(pool.entryFee ?? "0")) || 0;
  const prizePot = parseFloat(String(pool.prizePot ?? "0")) || 0;

  res.json({
    id: pool.id,
    name: pool.name,
    sport: pool.sport,
    poolType: pool.poolType,
    isActive: pool.isActive,
    season: pool.season,
    currentWeek: pool.currentWeek,
    sandboxMode: (pool as any).sandboxMode ?? false,
    entryFee,
    prizePot,
    prizeMode: pool.prizeMode ?? "fixed",
    prizeStructure: pool.prizeStructure ?? null,
    pickFrequency: pool.pickFrequency,
    isRecurring: pool.isRecurring ?? false,
    inviteCode: pool.inviteCode,
    commissionerName: commissioner?.username ?? "",
    createdAt: pool.createdAt.toISOString(),
    closureReason: pool.closureReason ?? null,
    endedAt: pool.endedAt?.toISOString() ?? null,
    totalMembers: members.length,
    members: members.map(m => ({
      userId: m.userId,
      username: m.username,
      displayName: m.displayName ?? null,
      status: m.status,
      eliminatedWeek: m.eliminatedWeek ?? null,
      joinedAt: m.joinedAt.toISOString(),
      hasPickThisWeek: userPickSet.has(m.userId),
    })),
  });
});

// PATCH /api/admin-panel/pools/:poolId/cancel
router.patch("/pools/:poolId/cancel", async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (!pool.isActive) { res.status(409).json({ error: "Pool is already inactive." }); return; }

  await db
    .update(poolsTable)
    .set({ isActive: false, endedAt: new Date(), closureReason: "cancelled_by_admin" })
    .where(eq(poolsTable.id, poolId));

  res.json({ success: true });
});

export default router;
