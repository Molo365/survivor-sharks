import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, usersTable, entriesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  fetchGamesForDate,
  getTodayEtDate,
  formatDateEt,
} from "../lib/espn";

const router = Router({ mergeParams: true });

/** 5-minute pregame lock — matches the daily pick deadline pattern */
function isGameLocked(gameStartIso: string): boolean {
  return new Date(gameStartIso).getTime() - 5 * 60 * 1000 <= Date.now();
}

// GET /api/pools/:poolId/pickem/games
router.get("/games", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.poolType !== "pickem") {
    res.status(400).json({ error: "This pool is not a Pick-Em pool" });
    return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) {
    res.status(403).json({ error: "Not a member of this pool" });
    return;
  }

  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  const games = await fetchGamesForDate("mlb", todayEspn);
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const existingPicks = await db
    .select()
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.userId, userId),
        eq(pickemPicksTable.gameDate, todayEt),
      ),
    );

  const pickMap = new Map(existingPicks.map((p) => [p.gameId, p]));

  const formattedGames = games.map((g) => {
    const existing = pickMap.get(g.id);
    const locked = isGameLocked(g.date);
    return {
      id: g.id,
      startTime: g.date,
      status: g.status,
      deadlinePassed: locked,
      awayTeam: {
        id: g.awayTeam.id,
        name: g.awayTeam.displayName,
        abbreviation: g.awayTeam.abbreviation,
        logoUrl: g.awayTeam.logo ?? null,
      },
      homeTeam: {
        id: g.homeTeam.id,
        name: g.homeTeam.displayName,
        abbreviation: g.homeTeam.abbreviation,
        logoUrl: g.homeTeam.logo ?? null,
      },
      awayScore: g.awayScore ?? null,
      homeScore: g.homeScore ?? null,
      userPickTeamId: existing?.pickedTeamId ?? null,
      userPickResult: existing?.result ?? null,
      liveDetail: g.liveState?.shortDetail ?? null,
    };
  });

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const slateDeadlinePassed =
    games.length > 0 && games.some((g) => isGameLocked(g.date));

  res.json({
    date: todayEt,
    label: fmt.format(new Date()),
    deadlinePassed: slateDeadlinePassed,
    games: formattedGames,
  });
});

// POST /api/pools/:poolId/pickem/picks
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const { picks } = req.body as {
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>;
  };

  if (!Array.isArray(picks) || picks.length === 0) {
    res.status(400).json({ error: "picks must be a non-empty array" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.poolType !== "pickem") {
    res.status(400).json({ error: "This pool is not a Pick-Em pool" });
    return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) {
    res.status(403).json({ error: "Not a member of this pool" });
    return;
  }

  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  const games = await fetchGamesForDate("mlb", todayEspn);
  const gameMap = new Map(games.map((g) => [g.id, g]));

  // Reject picks that target invalid or locked games
  const lockedGameIds: string[] = [];
  const unknownGameIds: string[] = [];

  for (const pick of picks) {
    const game = gameMap.get(pick.gameId);
    if (!game) {
      unknownGameIds.push(pick.gameId);
    } else if (isGameLocked(game.date)) {
      lockedGameIds.push(pick.gameId);
    }
  }

  if (unknownGameIds.length > 0) {
    res.status(400).json({
      error: `Unknown games (not in today's slate): ${unknownGameIds.join(", ")}`,
    });
    return;
  }
  if (lockedGameIds.length > 0) {
    res.status(400).json({
      error: `Cannot pick already-locked games (deadline passed): ${lockedGameIds.join(", ")}`,
    });
    return;
  }

  let saved = 0;

  for (const pick of picks) {
    await db
      .insert(pickemPicksTable)
      .values({
        poolId,
        userId,
        gameId: pick.gameId,
        gameDate: todayEt,
        week: pool.currentWeek,
        pickedTeamId: pick.pickedTeamId,
        pickedTeamName: pick.pickedTeamName,
        result: "pending",
      })
      .onConflictDoUpdate({
        target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
        set: {
          pickedTeamId: pick.pickedTeamId,
          pickedTeamName: pick.pickedTeamName,
          result: "pending",
          updatedAt: new Date(),
        },
      });
    saved++;
  }

  res.status(201).json({ saved, skipped: 0 });
});

// GET /api/pools/:poolId/pickem/leaderboard
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.poolType !== "pickem") {
    res.status(400).json({ error: "This pool is not a Pick-Em pool" });
    return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) {
    res.status(403).json({ error: "Not a member of this pool" });
    return;
  }

  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  // Fetch today's schedule and all picks for this pool/week in parallel
  const [games, allPicks, aggregates] = await Promise.all([
    fetchGamesForDate("mlb", todayEspn),
    db
      .select()
      .from(pickemPicksTable)
      .where(
        and(
          eq(pickemPicksTable.poolId, poolId),
          eq(pickemPicksTable.gameDate, todayEt),
        ),
      ),
    db
      .select({
        userId: pickemPicksTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
        correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        picked: sql<string>`COUNT(*)`,
      })
      .from(pickemPicksTable)
      .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
      .where(
        and(
          eq(pickemPicksTable.poolId, poolId),
          eq(pickemPicksTable.gameDate, todayEt),
        ),
      )
      .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
      .orderBy(
        sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
        sql`COUNT(*) DESC`,
      ),
  ]);

  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Build per-user pick map: userId → { gameId → pick }
  const picksByUser = new Map<number, Map<string, typeof allPicks[0]>>();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, new Map());
    picksByUser.get(pick.userId)!.set(pick.gameId, pick);
  }

  const entries = aggregates.map((row, i) => {
    const userPicks = picksByUser.get(row.userId) ?? new Map();
    return {
      rank: i + 1,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName ?? null,
      correct: Number(row.correct),
      picked: Number(row.picked),
      picks: Array.from(userPicks.values()).map((p) => ({
        gameId: p.gameId,
        pickedTeamId: p.pickedTeamId,
        pickedTeamName: p.pickedTeamName,
        result: p.result,
      })),
    };
  });

  const formattedGames = games.map((g) => ({
    id: g.id,
    startTime: g.date,
    status: g.status,
    awayTeam: { id: g.awayTeam.id, abbreviation: g.awayTeam.abbreviation, logoUrl: g.awayTeam.logo ?? null },
    homeTeam: { id: g.homeTeam.id, abbreviation: g.homeTeam.abbreviation, logoUrl: g.homeTeam.logo ?? null },
  }));

  res.json({ poolId, week: pool.currentWeek, games: formattedGames, entries });
});

// POST /api/pools/:poolId/pickem/process-results  — commissioner only
router.post("/process-results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.poolType !== "pickem") {
    res.status(400).json({ error: "This pool is not a Pick-Em pool" });
    return;
  }

  if (pool.commissionerId !== userId && req.user!.role !== "admin") {
    res.status(403).json({ error: "Commissioner only" });
    return;
  }

  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  const games = await fetchGamesForDate("mlb", todayEspn);
  const finalGames = games.filter((g) => g.isCompleted);

  let processed = 0;

  for (const game of finalGames) {
    if (game.homeScore == null || game.awayScore == null) continue;
    const winningTeamId = game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;

    const gamePicks = await db
      .select()
      .from(pickemPicksTable)
      .where(
        and(
          eq(pickemPicksTable.poolId, poolId),
          eq(pickemPicksTable.gameId, game.id),
          eq(pickemPicksTable.gameDate, todayEt),
        ),
      );

    for (const pick of gamePicks) {
      const result: "correct" | "incorrect" =
        pick.pickedTeamId === winningTeamId ? "correct" : "incorrect";
      await db
        .update(pickemPicksTable)
        .set({ result, updatedAt: new Date() })
        .where(eq(pickemPicksTable.id, pick.id));
      processed++;
    }
  }

  res.json({ processed, date: todayEt });
});

export default router;
