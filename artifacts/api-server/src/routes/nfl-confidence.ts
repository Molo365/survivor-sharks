import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, entriesTable, usersTable, nflConfidenceResultsTable } from "@workspace/db";
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

  // Generate random realistic NFL scores for every game in this week.
  // Scores are ephemeral — not persisted — generated fresh each call.
  function randomNflScore(): number {
    const tds = Math.floor(Math.random() * 5) + 1; // 1–5 touchdowns (7 pts each)
    const fgs = Math.floor(Math.random() * 4);      // 0–3 field goals (3 pts each)
    const twoPt = Math.random() < 0.25 ? 2 : 0;    // occasional 2-pt conversion
    return Math.max(10, Math.min(45, tds * 7 + fgs * 3 + twoPt));
  }

  // Build a winner map keyed by gameId; re-roll until scores differ (no ties)
  const gameWinners = new Map<string, string>();
  const gameScores = new Map<string, { homeScore: number; awayScore: number }>();
  for (const [gameId, game] of gameMap) {
    let homeScore: number, awayScore: number;
    do {
      homeScore = randomNflScore();
      awayScore = randomNflScore();
    } while (homeScore === awayScore);
    gameWinners.set(gameId, homeScore > awayScore ? game.homeTeamId : game.awayTeamId);
    gameScores.set(gameId, { homeScore, awayScore });
  }

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
    const winnerId = gameWinners.get(pick.gameId);
    if (!winnerId) continue;

    const result: "correct" | "incorrect" = pick.pickedTeamId === winnerId ? "correct" : "incorrect";

    await db
      .update(pickemPicksTable)
      .set({ result, updatedAt: new Date() } as any)
      .where(eq(pickemPicksTable.id, pick.id));

    summary.push({ userId: pick.userId, gameId: pick.gameId, pickedTeamId: pick.pickedTeamId, result });
    graded++;
  }

  // Generate actual tiebreaker values and persist them so the leaderboard
  // always resolves ties against the same numbers.
  const actualPassingYards = Math.floor(Math.random() * (650 - 400 + 1)) + 400;
  const actualRushingYards = Math.floor(Math.random() * (200 - 80 + 1)) + 80;

  await db
    .insert(nflConfidenceResultsTable)
    .values({ poolId, week, actualPassingYards, actualRushingYards })
    .onConflictDoUpdate({
      target: [nflConfidenceResultsTable.poolId, nflConfidenceResultsTable.week],
      set: { actualPassingYards, actualRushingYards, recordedAt: new Date() },
    });

  req.log.info({ poolId, week, graded, actualPassingYards, actualRushingYards }, "NFL Confidence sandbox grading complete");
  res.json({ ok: true, week, graded, summary, actualPassingYards, actualRushingYards });
});

// GET /api/pools/:poolId/nfl-confidence/leaderboard?week=W
// Returns ranked leaderboard with tiebreaker resolution for the given week
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

  // Fetch: week picks, actual TB values, member entries (guesses), season totals — all in parallel
  const [rows, [actualResult], memberEntries, seasonRows] = await Promise.all([
    // This week's picks per player
    db
      .select({
        userId: pickemPicksTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
        weekPoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0)`,
        totalPicks: sql<string>`COUNT(*)`,
        gradedPicks: sql<string>`COUNT(*) FILTER (WHERE pickem_picks.result != 'pending')`,
      })
      .from(pickemPicksTable)
      .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week)))
      .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName),
    // Actual tiebreaker values for this week
    db
      .select()
      .from(nflConfidenceResultsTable)
      .where(and(eq(nflConfidenceResultsTable.poolId, poolId), eq(nflConfidenceResultsTable.week, week)))
      .limit(1),
    // Member entries (tiebreaker guesses)
    db
      .select({
        userId: entriesTable.userId,
        tiebreakerPassingYards: entriesTable.tiebreakerPassingYards,
        tiebreakerRushingYards: entriesTable.tiebreakerRushingYards,
      })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, poolId)),
    // Season cumulative correct points across all graded weeks
    db
      .select({
        userId: pickemPicksTable.userId,
        seasonPoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0)`,
      })
      .from(pickemPicksTable)
      .where(eq(pickemPicksTable.poolId, poolId))
      .groupBy(pickemPicksTable.userId),
  ]);

  const actualPassingYards = actualResult?.actualPassingYards ?? null;
  const actualRushingYards = actualResult?.actualRushingYards ?? null;
  const guessMap = new Map(memberEntries.map((e) => [e.userId, e]));
  const seasonMap = new Map(seasonRows.map((r) => [r.userId, Number(r.seasonPoints)]));

  // Helper: absolute distance; null guess treated as Infinity (loses all ties)
  function tbDiff(guess: number | null, actual: number | null): number {
    if (guess == null || actual == null) return Infinity;
    return Math.abs(guess - actual);
  }

  // Build base player objects
  type BasePlayer = {
    userId: number; username: string; displayName: string | null;
    weekPoints: number; seasonPoints: number; totalPicks: number; gradedPicks: number;
    tbPassingGuess: number | null; tbRushingGuess: number | null;
  };

  const basePlayers: BasePlayer[] = rows.map((r) => {
    const guesses = guessMap.get(r.userId);
    return {
      userId: r.userId,
      username: r.username,
      displayName: r.displayName ?? null,
      weekPoints: Number(r.weekPoints),
      seasonPoints: seasonMap.get(r.userId) ?? 0,
      totalPicks: Number(r.totalPicks),
      gradedPicks: Number(r.gradedPicks),
      tbPassingGuess: guesses?.tiebreakerPassingYards ?? null,
      tbRushingGuess: guesses?.tiebreakerRushingYards ?? null,
    };
  });

  // Primary sort: seasonPoints DESC; secondary: weekPoints DESC
  // Group players that are tied on BOTH to apply TB1 → TB2 → potSplit
  type TieKey = string; // `${seasonPoints}:${weekPoints}`
  const groups = new Map<TieKey, BasePlayer[]>();
  for (const p of basePlayers) {
    const key: TieKey = `${p.seasonPoints}:${p.weekPoints}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const players: Array<{
    rank: number; userId: number; username: string; displayName: string | null;
    weekPoints: number; seasonPoints: number; totalPicks: number; gradedPicks: number;
    tiebreakerPassingYardsGuess: number | null; tiebreakerRushingYardsGuess: number | null;
    tiebreakerDiff1: number | null; tiebreakerDiff2: number | null;
    potSplit: boolean;
  }> = [];

  let currentRank = 1;
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const [aSeason, aWeek] = a[0].split(":").map(Number);
    const [bSeason, bWeek] = b[0].split(":").map(Number);
    return bSeason - aSeason || bWeek - aWeek;
  });

  for (const [, group] of sortedGroups) {
    if (group.length === 1 || actualPassingYards == null) {
      // Single player, or actuals not available yet — no tiebreaker to apply
      for (const p of group) {
        players.push({
          rank: currentRank,
          ...p,
          tiebreakerPassingYardsGuess: p.tbPassingGuess,
          tiebreakerRushingYardsGuess: p.tbRushingGuess,
          tiebreakerDiff1: actualPassingYards != null ? tbDiff(p.tbPassingGuess, actualPassingYards) : null,
          tiebreakerDiff2: actualRushingYards != null ? tbDiff(p.tbRushingGuess, actualRushingYards) : null,
          potSplit: group.length > 1,
        });
      }
      currentRank += group.length;
      continue;
    }

    // Sort within the tied group: TB1 first, TB2 second
    group.sort((a, b) => {
      const d1Diff = tbDiff(a.tbPassingGuess, actualPassingYards) - tbDiff(b.tbPassingGuess, actualPassingYards);
      if (d1Diff !== 0) return d1Diff;
      return tbDiff(a.tbRushingGuess, actualRushingYards) - tbDiff(b.tbRushingGuess, actualRushingYards);
    });

    // Assign sub-ranks, flagging groups that remain tied after both tiebreakers
    let i = 0;
    while (i < group.length) {
      const p = group[i];
      const d1p = tbDiff(p.tbPassingGuess, actualPassingYards);
      const d2p = tbDiff(p.tbRushingGuess, actualRushingYards);
      let j = i + 1;
      while (j < group.length) {
        const q = group[j];
        if (tbDiff(q.tbPassingGuess, actualPassingYards) !== d1p ||
            tbDiff(q.tbRushingGuess, actualRushingYards) !== d2p) break;
        j++;
      }
      const subGroup = group.slice(i, j);
      const potSplit = subGroup.length > 1;
      for (const sp of subGroup) {
        players.push({
          rank: currentRank + i,
          ...sp,
          tiebreakerPassingYardsGuess: sp.tbPassingGuess,
          tiebreakerRushingYardsGuess: sp.tbRushingGuess,
          tiebreakerDiff1: isFinite(tbDiff(sp.tbPassingGuess, actualPassingYards)) ? tbDiff(sp.tbPassingGuess, actualPassingYards) : null,
          tiebreakerDiff2: isFinite(tbDiff(sp.tbRushingGuess, actualRushingYards)) ? tbDiff(sp.tbRushingGuess, actualRushingYards) : null,
          potSplit,
        });
      }
      i = j;
    }
    currentRank += group.length;
  }

  res.json({ week, players, actualPassingYards, actualRushingYards });
});

export default router;
