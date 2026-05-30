import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  fetchGamesForDate,
  getTodayEtDate,
  formatDateEt,
} from "../lib/espn";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/pickem/games
router.get("/games", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
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

  const now = Date.now();
  const formattedGames = games.map((g) => {
    const existing = pickMap.get(g.id);
    const gameStarted = new Date(g.date).getTime() <= now;
    return {
      id: g.id,
      startTime: g.date,
      status: g.status,
      deadlinePassed: gameStarted,
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
    };
  });

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const slateDeadlinePassed = games.length > 0 && games.some((g) => new Date(g.date).getTime() <= now);

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

  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  const games = await fetchGamesForDate("mlb", todayEspn);
  const gameMap = new Map(games.map((g) => [g.id, g]));

  let saved = 0;
  let skipped = 0;

  for (const pick of picks) {
    const game = gameMap.get(pick.gameId);
    if (!game || game.hasStarted) {
      skipped++;
      continue;
    }

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

  res.status(201).json({ saved, skipped });
});

// GET /api/pools/:poolId/pickem/leaderboard
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const rows = await db
    .select({
      userId: pickemPicksTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
      total: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} != 'pending')`,
    })
    .from(pickemPicksTable)
    .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.week, pool.currentWeek),
      ),
    )
    .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
    .orderBy(sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`);

  const entries = rows.map((row, i) => ({
    rank: i + 1,
    userId: row.userId,
    username: row.username,
    displayName: row.displayName ?? null,
    correct: Number(row.correct),
    total: Number(row.total),
  }));

  res.json({ poolId, week: pool.currentWeek, entries });
});

// POST /api/pools/:poolId/pickem/process-results
router.post("/process-results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
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
