import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, entriesTable, usersTable, nflConfidenceResultsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireCommissioner } from "../middlewares/auth";
import { getSandboxGamesForWeek, sandboxGameToPickEmShape } from "../lib/nfl2025Schedule";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/nfl-confidence-weekly/games
router.get("/games", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_confidence_weekly") {
    res.status(400).json({ error: "Not an NFL Confidence Weekly pool" });
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

  res.json({ week, games: [], sandboxMode: false, message: "Enable sandbox mode to use the 2025 schedule" });
});

// GET /api/pools/:poolId/nfl-confidence-weekly/picks
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameMap = new Map<string, any>();

  if (isSandbox) {
    const sandboxGames = getSandboxGamesForWeek(week);
    for (const g of sandboxGames) {
      gameMap.set(g.id, sandboxGameToPickEmShape(g));
    }
  } else {
    // Fetch live scores + status from ESPN for non-sandbox pools
    try {
      const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const espnData = (await (await fetch(espnUrl)).json()) as { events?: any[] };
      for (const ev of espnData.events ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const comp = ev.competitions?.[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
        const isCompleted = comp?.status?.type?.completed ?? false;
        const state = comp?.status?.type?.state ?? "pre";
        gameMap.set(String(ev.id), {
          homeTeam: { id: String(home?.team?.id ?? ""), abbreviation: home?.team?.abbreviation ?? "", name: home?.team?.displayName ?? "", logoUrl: home?.team?.logo ?? null },
          awayTeam: { id: String(away?.team?.id ?? ""), abbreviation: away?.team?.abbreviation ?? "", name: away?.team?.displayName ?? "", logoUrl: away?.team?.logo ?? null },
          homeScore: home?.score != null ? parseInt(String(home.score)) : null,
          awayScore: away?.score != null ? parseInt(String(away.score)) : null,
          startTime: ev.date ?? "",
          status: isCompleted ? "final" : state === "in" ? "in_progress" : "scheduled",
        });
      }
    } catch { /* ESPN unavailable; status derived from pick result below */ }
  }

  const details = picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
    // Derive "final" status from pick result when game data is unavailable or stale
    const isGraded = pick.result === "correct" || pick.result === "incorrect";
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
      status: (isGraded ? "final" : (game?.status ?? "unknown")) as string,
    };
  });

  const tiebreakerPassingYards = (entry as any).tiebreakerPassingYards ?? null;
  const tiebreakerRushingYards = (entry as any).tiebreakerRushingYards ?? null;

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

// POST /api/pools/:poolId/nfl-confidence-weekly/picks
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
  if ((pool.poolType as string) !== "nfl_confidence_weekly") {
    res.status(400).json({ error: "Not an NFL Confidence Weekly pool" });
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

    const cpSorted = picks.map(p => p.confidencePoints).sort((a, b) => a - b);
    if (!cpSorted.every((v, i) => v === i + 1)) {
      res.status(400).json({ error: `Confidence points 1-${expectedCount} must each be used exactly once` });
      return;
    }
  }

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

  req.log.info({ poolId, userId, week, saved }, "NFL Confidence Weekly picks submitted");
  res.status(201).json({ ok: true, saved, message: "NFL Confidence Weekly picks submitted successfully" });
});

// GET /api/pools/:poolId/nfl-confidence-weekly/grid?week=W
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

// PATCH /api/pools/:poolId/nfl-confidence-weekly/sandbox-week
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

  req.log.info({ poolId, week }, "NFL Confidence Weekly sandbox week updated");
  res.json({ ok: true, week: updated.currentWeek });
});

// POST /api/pools/:poolId/nfl-confidence-weekly/simulate-grading
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

  function randomNflScore(): number {
    const tds = Math.floor(Math.random() * 5) + 1;
    const fgs = Math.floor(Math.random() * 4);
    const twoPt = Math.random() < 0.25 ? 2 : 0;
    return Math.max(10, Math.min(45, tds * 7 + fgs * 3 + twoPt));
  }

  const gameWinners = new Map<string, string>();
  for (const [gameId, game] of gameMap) {
    let homeScore: number, awayScore: number;
    do {
      homeScore = randomNflScore();
      awayScore = randomNflScore();
    } while (homeScore === awayScore);
    gameWinners.set(gameId, homeScore > awayScore ? game.homeTeamId : game.awayTeamId);
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

  const actualPassingYards = Math.floor(Math.random() * (650 - 400 + 1)) + 400;
  const actualRushingYards = Math.floor(Math.random() * (200 - 80 + 1)) + 80;

  await db
    .insert(nflConfidenceResultsTable)
    .values({ poolId, week, actualPassingYards, actualRushingYards })
    .onConflictDoUpdate({
      target: [nflConfidenceResultsTable.poolId, nflConfidenceResultsTable.week],
      set: { actualPassingYards, actualRushingYards, recordedAt: new Date() },
    });

  req.log.info({ poolId, week, graded, actualPassingYards, actualRushingYards }, "NFL Confidence Weekly sandbox grading complete");
  res.json({ ok: true, week, graded, summary, actualPassingYards, actualRushingYards });
});

// GET /api/pools/:poolId/nfl-confidence-weekly/leaderboard?week=W
// Returns ranked leaderboard for the given week only — no season accumulation
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

  // Weekly-only: fetch this week's picks, actual TB values, and member entries (guesses)
  const [rows, [actualResult], memberEntries] = await Promise.all([
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
    db
      .select()
      .from(nflConfidenceResultsTable)
      .where(and(eq(nflConfidenceResultsTable.poolId, poolId), eq(nflConfidenceResultsTable.week, week)))
      .limit(1),
    db
      .select({
        userId: entriesTable.userId,
        tiebreakerPassingYards: entriesTable.tiebreakerPassingYards,
        tiebreakerRushingYards: entriesTable.tiebreakerRushingYards,
      })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, poolId)),
  ]);

  const actualPassingYards = actualResult?.actualPassingYards ?? null;
  const actualRushingYards = actualResult?.actualRushingYards ?? null;
  const guessMap = new Map(memberEntries.map((e) => [e.userId, e]));

  function tbDiff(guess: number | null, actual: number | null): number {
    if (guess == null || actual == null) return Infinity;
    return Math.abs(guess - actual);
  }

  type BasePlayer = {
    userId: number; username: string; displayName: string | null;
    weekPoints: number; totalPicks: number; gradedPicks: number;
    tbPassingGuess: number | null; tbRushingGuess: number | null;
  };

  const basePlayers: BasePlayer[] = rows.map((r) => {
    const guesses = guessMap.get(r.userId);
    return {
      userId: r.userId,
      username: r.username,
      displayName: r.displayName ?? null,
      weekPoints: Number(r.weekPoints),
      totalPicks: Number(r.totalPicks),
      gradedPicks: Number(r.gradedPicks),
      tbPassingGuess: guesses?.tiebreakerPassingYards ?? null,
      tbRushingGuess: guesses?.tiebreakerRushingYards ?? null,
    };
  });

  // Group only by weekPoints — no season accumulation
  type TieKey = string;
  const groups = new Map<TieKey, BasePlayer[]>();
  for (const p of basePlayers) {
    const key: TieKey = `${p.weekPoints}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const players: Array<{
    rank: number; userId: number; username: string; displayName: string | null;
    weekPoints: number; totalPicks: number; gradedPicks: number;
    tiebreakerPassingYardsGuess: number | null; tiebreakerRushingYardsGuess: number | null;
    tiebreakerDiff1: number | null; tiebreakerDiff2: number | null;
    potSplit: boolean;
  }> = [];

  let currentRank = 1;
  const sortedGroups = [...groups.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));

  for (const [, group] of sortedGroups) {
    if (group.length === 1 || actualPassingYards == null) {
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

    // Sort within tied group by TB1, then TB2
    group.sort((a, b) => {
      const d1Diff = tbDiff(a.tbPassingGuess, actualPassingYards) - tbDiff(b.tbPassingGuess, actualPassingYards);
      if (d1Diff !== 0) return d1Diff;
      return tbDiff(a.tbRushingGuess, actualRushingYards) - tbDiff(b.tbRushingGuess, actualRushingYards);
    });

    // Re-group within the tied group for further splits
    type SubKey = string;
    const subGroups = new Map<SubKey, BasePlayer[]>();
    for (const p of group) {
      const d1 = tbDiff(p.tbPassingGuess, actualPassingYards);
      const d2 = tbDiff(p.tbRushingGuess, actualRushingYards);
      const subKey: SubKey = `${isFinite(d1) ? d1 : "∞"}:${isFinite(d2) ? d2 : "∞"}`;
      if (!subGroups.has(subKey)) subGroups.set(subKey, []);
      subGroups.get(subKey)!.push(p);
    }

    let i = 0;
    for (const sp of group) {
      const d1 = tbDiff(sp.tbPassingGuess, actualPassingYards);
      const d2 = tbDiff(sp.tbRushingGuess, actualRushingYards);
      const subKey: SubKey = `${isFinite(d1) ? d1 : "∞"}:${isFinite(d2) ? d2 : "∞"}`;
      const subGroup = subGroups.get(subKey)!;
      const potSplit = subGroup.length > 1;

      players.push({
        rank: currentRank + i,
        ...sp,
        tiebreakerPassingYardsGuess: sp.tbPassingGuess,
        tiebreakerRushingYardsGuess: sp.tbRushingGuess,
        tiebreakerDiff1: isFinite(tbDiff(sp.tbPassingGuess, actualPassingYards)) ? tbDiff(sp.tbPassingGuess, actualPassingYards) : null,
        tiebreakerDiff2: isFinite(tbDiff(sp.tbRushingGuess, actualRushingYards)) ? tbDiff(sp.tbRushingGuess, actualRushingYards) : null,
        potSplit,
      });
      i++;
    }
    currentRank += group.length;
  }

  res.json({ week, players, actualPassingYards, actualRushingYards });
});

export default router;
