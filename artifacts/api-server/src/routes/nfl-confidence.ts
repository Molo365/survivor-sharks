import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, entriesTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireCommissioner } from "../middlewares/auth";
import { getSandboxGamesForWeek, sandboxGameToPickEmShape } from "../lib/nfl2025Schedule";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/nfl-confidence/games
// Returns the game slate for the current week (sandbox or live placeholder)
router.get("/games", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_confidence") {
    res.status(400).json({ error: "Not an NFL Confidence pool" });
    return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, req.user!.id)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const week = pool.currentWeek;

  if ((pool as any).sandboxMode) {
    const sandboxGames = getSandboxGamesForWeek(week);
    const games = sandboxGames.map(sandboxGameToPickEmShape);
    res.json({ week, games, sandboxMode: true });
    return;
  }

  // Live mode: return empty slate (ESPN NFL live data can be added here)
  res.json({ week, games: [], sandboxMode: false, message: "Enable sandbox mode to use the 2025 schedule" });
});

// GET /api/pools/:poolId/nfl-confidence/picks
// Returns the current user's picks for this week
router.get("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const week = pool.currentWeek;

  const picks = await db
    .select()
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.userId, userId), eq(pickemPicksTable.week, week)));

  const isSandbox = (pool as any).sandboxMode as boolean;
  let gameMap: Map<string, ReturnType<typeof sandboxGameToPickEmShape>> = new Map();

  if (isSandbox) {
    const sandboxGames = getSandboxGamesForWeek(week);
    for (const g of sandboxGames) {
      gameMap.set(g.id, sandboxGameToPickEmShape(g));
    }
  }

  const details = picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
    return {
      gameId: pick.gameId,
      pickedTeamId: pick.pickedTeamId,
      pickedTeamName: pick.pickedTeamName,
      pickedTeamLogoUrl: game
        ? (pickedIsHome ? game.homeTeam.logoUrl : game.awayTeam.logoUrl) ?? null
        : null,
      confidencePoints: (pick as any).confidencePoints ?? null,
      result: pick.result,
      homeTeam: game ? game.homeTeam : { id: "", abbreviation: "?", name: "Unknown", logoUrl: null },
      awayTeam: game ? game.awayTeam : { id: "", abbreviation: "?", name: "Unknown", logoUrl: null },
      homeScore: game?.homeScore ?? null,
      awayScore: game?.awayScore ?? null,
      startTime: game?.startTime ?? "",
      status: (game?.status ?? "unknown") as string,
    };
  });

  const tiebreakerPassingYards = (entry as any).tiebreakerPassingYards ?? null;
  const tiebreakerRushingYards = (entry as any).tiebreakerRushingYards ?? null;

  // Last game on the slate = tiebreaker
  const allGames = isSandbox ? getSandboxGamesForWeek(week).map(sandboxGameToPickEmShape) : [];
  allGames.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const lastGame = allGames.at(-1);

  res.json({
    picks: details,
    tiebreakerPassingYards,
    tiebreakerRushingYards,
    tiebreakerGame: lastGame
      ? {
          awayTeam: { abbreviation: lastGame.awayTeam.abbreviation, name: lastGame.awayTeam.name },
          homeTeam: { abbreviation: lastGame.homeTeam.abbreviation, name: lastGame.homeTeam.name },
          startTime: lastGame.startTime,
        }
      : null,
  });
});

// POST /api/pools/:poolId/nfl-confidence/picks
// Submit picks for the current week
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const { picks, tiebreakerPassingYards, tiebreakerRushingYards } = req.body as {
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string; confidencePoints: number }>;
    tiebreakerPassingYards: number;
    tiebreakerRushingYards: number;
  };

  if (!Array.isArray(picks) || picks.length === 0) {
    res.status(400).json({ error: "picks array is required" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_confidence") {
    res.status(400).json({ error: "Not an NFL Confidence pool" });
    return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const week = pool.currentWeek;
  const isSandbox = (pool as any).sandboxMode as boolean;

  // Validate game IDs against the sandbox schedule
  const validGames = isSandbox ? getSandboxGamesForWeek(week) : [];
  const validGameIds = new Set(validGames.map(g => g.id));

  if (isSandbox) {
    for (const p of picks) {
      if (!validGameIds.has(p.gameId)) {
        res.status(400).json({ error: `Unknown game: ${p.gameId}` });
        return;
      }
    }

    const expectedCount = validGames.length;
    if (picks.length !== expectedCount) {
      res.status(400).json({ error: `Expected ${expectedCount} picks, got ${picks.length}` });
      return;
    }

    // Validate confidence points 1-N each used exactly once
    const cpSorted = picks.map(p => p.confidencePoints).sort((a, b) => a - b);
    if (!cpSorted.every((v, i) => v === i + 1)) {
      res.status(400).json({ error: `Confidence points 1-${expectedCount} must each be used exactly once` });
      return;
    }
  }

  // Compute gameDate from week (use Sunday of the week)
  const weekSundayOffsets = [
    "", "2025-09-07", "2025-09-14", "2025-09-21", "2025-09-28",
    "2025-10-05", "2025-10-12", "2025-10-19", "2025-10-26",
    "2025-11-02", "2025-11-09", "2025-11-16", "2025-11-23",
    "2025-11-30", "2025-12-07", "2025-12-14", "2025-12-21",
    "2025-12-28", "2026-01-04",
  ];
  const gameDate = weekSundayOffsets[week] ?? `2025-week-${week}`;

  let saved = 0;
  for (const pick of picks) {
    await db
      .insert(pickemPicksTable)
      .values({
        poolId,
        userId,
        gameId: pick.gameId,
        gameDate,
        week,
        pickedTeamId: pick.pickedTeamId,
        pickedTeamName: pick.pickedTeamName,
        confidencePoints: pick.confidencePoints,
        result: "pending",
      } as any)
      .onConflictDoUpdate({
        target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
        set: {
          pickedTeamId: pick.pickedTeamId,
          pickedTeamName: pick.pickedTeamName,
          confidencePoints: pick.confidencePoints,
          result: "pending",
          updatedAt: new Date(),
        } as any,
      });
    saved++;
  }

  await db
    .update(entriesTable)
    .set({ tiebreakerPassingYards, tiebreakerRushingYards } as any)
    .where(eq(entriesTable.id, entry.id));

  req.log.info({ poolId, userId, week, saved }, "NFL Confidence picks submitted");
  res.status(201).json({ ok: true, saved, message: "NFL Confidence picks submitted successfully" });
});

// GET /api/pools/:poolId/nfl-confidence/grid?week=W
// Returns all players' picks for the given week
router.get("/grid", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const weekParam = req.query.week ? parseInt(String(req.query.week)) : pool.currentWeek;
  const week = isNaN(weekParam) ? pool.currentWeek : weekParam;

  const [allPicks] = await Promise.all([
    db
      .select({
        userId: pickemPicksTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
        gameId: pickemPicksTable.gameId,
        pickedTeamId: pickemPicksTable.pickedTeamId,
        pickedTeamName: pickemPicksTable.pickedTeamName,
        confidencePoints: (pickemPicksTable as any).confidencePoints,
        result: pickemPicksTable.result,
      })
      .from(pickemPicksTable)
      .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week))),
  ]);

  const isSandbox = (pool as any).sandboxMode as boolean;
  const sandboxGames = isSandbox ? getSandboxGamesForWeek(week).map(sandboxGameToPickEmShape) : [];
  sandboxGames.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const gameMap = new Map(sandboxGames.map(g => [g.id, g]));

  const userMap = new Map<number, {
    userId: number;
    username: string;
    displayName: string | null;
    picks: Map<string, {
      pickedTeamId: string;
      pickedTeamName: string;
      pickedTeamLogoUrl: string | null;
      confidencePoints: number | null;
      result: string | null;
    }>;
  }>();

  for (const pick of allPicks) {
    if (!userMap.has(pick.userId)) {
      userMap.set(pick.userId, {
        userId: pick.userId,
        username: pick.username,
        displayName: pick.displayName ?? null,
        picks: new Map(),
      });
    }
    const game = gameMap.get(pick.gameId);
    const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
    userMap.get(pick.userId)!.picks.set(pick.gameId, {
      pickedTeamId: pick.pickedTeamId,
      pickedTeamName: pick.pickedTeamName,
      pickedTeamLogoUrl: game ? (pickedIsHome ? game.homeTeam.logoUrl : game.awayTeam.logoUrl) ?? null : null,
      confidencePoints: (pick as any).confidencePoints ?? null,
      result: pick.result ?? null,
    });
  }

  const games = sandboxGames.map(g => ({
    id: g.id,
    awayTeam: g.awayTeam,
    homeTeam: g.homeTeam,
    startTime: g.startTime,
    status: g.status,
    awayScore: g.awayScore ?? null,
    homeScore: g.homeScore ?? null,
  }));

  const players = Array.from(userMap.values()).map(u => ({
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    picks: Object.fromEntries(u.picks.entries()),
  }));

  res.json({ week, games, players });
});

// PATCH /api/pools/:poolId/nfl-confidence/sandbox-week
// Commissioner: set the active sandbox week (updates pool.currentWeek)
router.patch("/sandbox-week", requireAuth, requireCommissioner, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const { week } = req.body as { week: number };

  if (typeof week !== "number" || week < 1 || week > 18) {
    res.status(400).json({ error: "week must be a number between 1 and 18" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (!(pool as any).sandboxMode) {
    res.status(400).json({ error: "Pool is not in sandbox mode" });
    return;
  }

  const [updated] = await db
    .update(poolsTable)
    .set({ currentWeek: week })
    .where(eq(poolsTable.id, poolId))
    .returning({ currentWeek: poolsTable.currentWeek });

  req.log.info({ poolId, week }, "Sandbox week updated");
  res.json({ ok: true, week: updated.currentWeek });
});

// POST /api/pools/:poolId/nfl-confidence/simulate-grading
// Commissioner: grade all pending picks for a week against sandbox schedule
router.post("/simulate-grading", requireAuth, requireCommissioner, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const { week: weekParam } = req.body as { week?: number };

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (!(pool as any).sandboxMode) {
    res.status(400).json({ error: "Pool is not in sandbox mode" });
    return;
  }

  const week = weekParam ?? pool.currentWeek;
  if (week < 1 || week > 18) {
    res.status(400).json({ error: "week must be between 1 and 18" });
    return;
  }

  const sandboxGames = getSandboxGamesForWeek(week);
  if (sandboxGames.length === 0) {
    res.status(400).json({ error: `No sandbox games found for week ${week}` });
    return;
  }

  const gameMap = new Map(sandboxGames.map(g => [g.id, g]));

  const pendingPicks = await db
    .select()
    .from(pickemPicksTable)
    .where(and(
      eq(pickemPicksTable.poolId, poolId),
      eq(pickemPicksTable.week, week),
      eq(pickemPicksTable.result, "pending"),
    ));

  let graded = 0;
  const summary: { userId: number; gameId: string; pickedTeamId: string; result: "correct" | "incorrect" }[] = [];

  for (const pick of pendingPicks) {
    const game = gameMap.get(pick.gameId);
    if (!game) continue;

    const winnerId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
    const result: "correct" | "incorrect" = pick.pickedTeamId === winnerId ? "correct" : "incorrect";

    await db
      .update(pickemPicksTable)
      .set({ result, updatedAt: new Date() } as any)
      .where(eq(pickemPicksTable.id, pick.id));

    summary.push({ userId: pick.userId, gameId: pick.gameId, pickedTeamId: pick.pickedTeamId, result });
    graded++;
  }

  req.log.info({ poolId, week, graded }, "NFL Confidence sandbox grading complete");
  res.json({ ok: true, week, graded, summary });
});

// GET /api/pools/:poolId/nfl-confidence/leaderboard?week=W
// Returns ranked leaderboard for the given week
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const weekParam = req.query.week ? parseInt(String(req.query.week)) : pool.currentWeek;
  const week = isNaN(weekParam) ? pool.currentWeek : weekParam;

  const rows = await db
    .select({
      userId: pickemPicksTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      correctPoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0)`,
      totalPicks: sql<string>`COUNT(*)`,
      gradedPicks: sql<string>`COUNT(*) FILTER (WHERE pickem_picks.result != 'pending')`,
    })
    .from(pickemPicksTable)
    .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
    .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week)))
    .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
    .orderBy(sql`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0) DESC`);

  const players = rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    username: r.username,
    displayName: r.displayName ?? null,
    correctPoints: Number(r.correctPoints),
    totalPicks: Number(r.totalPicks),
    gradedPicks: Number(r.gradedPicks),
  }));

  res.json({ week, players });
});

export default router;
