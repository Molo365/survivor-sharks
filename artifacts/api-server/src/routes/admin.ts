import { Router } from "express";
import { db } from "@workspace/db";
import { poolsTable, usersTable, entriesTable, pickemPicksTable, picksTable } from "@workspace/db";
import { eq, and, count, isNotNull, or, ne, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, requireCommissioner } from "../middlewares/auth";
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
router.patch("/pools/:poolId/sandbox-mode", requireAuth, requireCommissioner, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }
  const { sandboxMode } = req.body as { sandboxMode: boolean };
  if (typeof sandboxMode !== "boolean") {
    res.status(400).json({ error: "sandboxMode must be a boolean" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  const sandboxCapable = ["nfl_confidence", "nfl_confidence_weekly", "season", "weekly", "mid_season", "nfl_division_predictor", "pickem_season", "pickem"];
  const isCrazyEightsNhl = (pool.poolType as string) === "crazy_8s" && pool.sport === "nhl";
  if (!sandboxCapable.includes(pool.poolType as string) && !isCrazyEightsNhl) {
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

// POST /api/admin/pools/:poolId/reset-sandbox-picks
// Resets all pickem_picks for a sandbox pool back to result='pending'.
// Safety check: aborts if any entries in the pool have prize_amount or
// finish_position set (indicates closure already ran — manual review required).
router.post("/pools/:poolId/reset-sandbox-picks", requireAuth, requireAdmin, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem") { res.status(400).json({ error: "Not a Pick-Em pool" }); return; }
  if (!(pool as any).sandboxMode) {
    res.status(400).json({ error: "Only sandbox pools can be reset via this endpoint" });
    return;
  }

  // Safety: verify no entries have prize_amount or finish_position set.
  // Those are only written by pool closure code, not by pick grading.
  // If they exist, the pool may have closed and this reset could corrupt results.
  const dirtyEntries = await db
    .select({ id: entriesTable.id, prizeAmount: entriesTable.prizeAmount, finishPosition: entriesTable.finishPosition })
    .from(entriesTable)
    .where(and(
      eq(entriesTable.poolId, poolId),
      or(isNotNull(entriesTable.prizeAmount), isNotNull(entriesTable.finishPosition)),
    ));

  if (dirtyEntries.length > 0) {
    res.status(409).json({
      error: "One or more entries have prize_amount or finish_position set — manual review required before reset",
      dirtyEntries,
    });
    return;
  }

  // Count how many picks will be reset (those not already pending)
  const [{ toReset }] = await db
    .select({ toReset: count() })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, poolId), ne(pickemPicksTable.result, "pending")));

  // Reset all picks for this pool back to pending
  await db
    .update(pickemPicksTable)
    .set({ result: "pending", updatedAt: new Date() })
    .where(and(eq(pickemPicksTable.poolId, poolId), ne(pickemPicksTable.result, "pending")));

  req.log.info({ poolId, picksReset: Number(toReset) }, "Admin reset sandbox Pick-Em picks to pending");
  res.json({ ok: true, poolId, picksReset: Number(toReset) });
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

    // Tied game (2-way sports only): push all picks — no winner, no loser.
    if (!is3way && game.homeScore! === game.awayScore!) {
      for (const pick of gamePicks) {
        await db.update(pickemPicksTable).set({ result: "push", updatedAt: new Date() }).where(eq(pickemPicksTable.id, pick.id));
        processed++;
      }
      continue;
    }

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

// GET /api/admin/pickem/tie-damage-report
// Scans today's and yesterday's NFL games for ties, then finds all pickem_season
// picks that were incorrectly graded as "incorrect" for those tied games.
// Returns pool IDs, game IDs, and pick counts. Safe to call repeatedly before correcting.
router.get("/pickem/tie-damage-report", requireAuth, requireAdmin, async (req, res) => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  function toEspnDate(d: Date): string {
    const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const y = et.getFullYear();
    const m = String(et.getMonth() + 1).padStart(2, "0");
    const day = String(et.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }

  const [todayGames, yesterdayGames] = await Promise.all([
    fetchGamesForDate("nfl", toEspnDate(now)),
    fetchGamesForDate("nfl", toEspnDate(yesterday)),
  ]);

  const tiedGames = [...todayGames, ...yesterdayGames].filter(
    (g) => g.isCompleted && g.homeScore != null && g.awayScore != null && g.homeScore === g.awayScore,
  );

  if (tiedGames.length === 0) {
    res.json({ message: "No tied NFL games found in the past 48 hours", tiedGames: [], affectedPools: [] });
    return;
  }

  const tiedGameIds = tiedGames.map((g) => g.id);

  const rows = await db
    .select({
      poolId: pickemPicksTable.poolId,
      gameId: pickemPicksTable.gameId,
      pickCount: count(),
    })
    .from(pickemPicksTable)
    .innerJoin(poolsTable, eq(pickemPicksTable.poolId, poolsTable.id))
    .where(and(
      eq(poolsTable.poolType, "pickem_season"),
      inArray(pickemPicksTable.gameId, tiedGameIds),
      eq(pickemPicksTable.result, "incorrect"),
    ))
    .groupBy(pickemPicksTable.poolId, pickemPicksTable.gameId);

  res.json({
    tiedGames: tiedGames.map((g) => ({
      id: g.id,
      matchup: `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`,
      score: `${g.awayScore}-${g.homeScore}`,
    })),
    affectedPools: rows.map((r) => ({
      poolId: r.poolId,
      gameId: r.gameId,
      pickCount: Number(r.pickCount),
    })),
    correctionNote: rows.length > 0
      ? `To correct: POST /api/admin/pickem/fix-tie-grading with body { "gameIds": ${JSON.stringify(tiedGameIds)} }`
      : "No picks need correction",
  });
});

// POST /api/admin/pickem/fix-tie-grading
// Body: { gameIds: string[] }
// Corrects picks that were incorrectly graded as "incorrect" for tied games by
// resetting them to "push". Scoped to pickem_season pools only.
// SAFETY: Verifies each game ID actually ended in a tie via ESPN before writing.
router.post("/pickem/fix-tie-grading", requireAuth, requireAdmin, async (req, res) => {
  const { gameIds } = req.body as { gameIds?: string[] };
  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    res.status(400).json({ error: "gameIds must be a non-empty array of ESPN game ID strings" });
    return;
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  function toEspnDate(d: Date): string {
    const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const y = et.getFullYear();
    const m = String(et.getMonth() + 1).padStart(2, "0");
    const day = String(et.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }

  const [todayGames, yesterdayGames] = await Promise.all([
    fetchGamesForDate("nfl", toEspnDate(now)),
    fetchGamesForDate("nfl", toEspnDate(yesterday)),
  ]);

  const tiedGameMap = new Map(
    [...todayGames, ...yesterdayGames]
      .filter((g) => g.isCompleted && g.homeScore != null && g.awayScore != null && g.homeScore === g.awayScore)
      .map((g) => [g.id, g]),
  );

  // Safety: every provided game ID must be a confirmed tie from ESPN
  const unverified = gameIds.filter((id) => !tiedGameMap.has(id));
  if (unverified.length > 0) {
    res.status(409).json({
      error: "One or more game IDs could not be confirmed as tied games in ESPN — refusing to correct",
      unverifiedIds: unverified,
    });
    return;
  }

  // Find pickem_season pool IDs that have affected picks
  const affectedPoolRows = await db
    .selectDistinct({ poolId: pickemPicksTable.poolId })
    .from(pickemPicksTable)
    .innerJoin(poolsTable, eq(pickemPicksTable.poolId, poolsTable.id))
    .where(and(
      eq(poolsTable.poolType, "pickem_season"),
      inArray(pickemPicksTable.gameId, gameIds),
      eq(pickemPicksTable.result, "incorrect"),
    ));

  if (affectedPoolRows.length === 0) {
    res.json({ ok: true, totalCorrected: 0, byPool: {}, message: "No affected picks found in pickem_season pools" });
    return;
  }

  const affectedPoolIds = affectedPoolRows.map((r) => r.poolId);

  // Reset picks: only pickem_season pools, only for the verified tied game IDs
  const updated = await db
    .update(pickemPicksTable)
    .set({ result: "push", updatedAt: new Date() })
    .where(and(
      inArray(pickemPicksTable.poolId, affectedPoolIds),
      inArray(pickemPicksTable.gameId, gameIds),
      eq(pickemPicksTable.result, "incorrect"),
    ))
    .returning({ id: pickemPicksTable.id, poolId: pickemPicksTable.poolId, gameId: pickemPicksTable.gameId });

  const byPool: Record<number, number> = {};
  for (const row of updated) {
    byPool[row.poolId] = (byPool[row.poolId] ?? 0) + 1;
  }

  req.log.info(
    { totalCorrected: updated.length, gameIds, byPool },
    "Admin corrected tie-graded picks: incorrect → push",
  );

  res.json({
    ok: true,
    totalCorrected: updated.length,
    byPool,
    tiedGames: [...tiedGameMap.values()].map((g) => ({
      id: g.id,
      matchup: `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`,
      score: `${g.awayScore}-${g.homeScore}`,
    })),
  });
});

export default router;
