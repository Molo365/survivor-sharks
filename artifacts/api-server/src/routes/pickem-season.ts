import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, usersTable, entriesTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchNflGamesByWeek } from "../lib/espn";

const router = Router({ mergeParams: true });

const NFL_TOTAL_WEEKS = 18;

function isGameLocked(startIso: string): boolean {
  return new Date(startIso).getTime() <= Date.now();
}

// GET /api/pools/:poolId/pickem-season/games?week=N
router.get("/games", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "pickem_season") {
    res.status(400).json({ error: "Not an NFL Pick-Ems Season pool" }); return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const rawWeek = parseInt(String(req.query.week ?? pool.currentWeek));
  const week = Math.max(1, Math.min(NFL_TOTAL_WEEKS, isNaN(rawWeek) ? pool.currentWeek : rawWeek));

  const [games, existingPicks] = await Promise.all([
    fetchNflGamesByWeek(week),
    db.select().from(pickemPicksTable).where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.userId, userId),
        eq(pickemPicksTable.week, week),
      )
    ),
  ]);

  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const pickMap = new Map(existingPicks.map(p => [p.gameId, p]));

  const formattedGames = games.map(g => {
    const existing = pickMap.get(g.id);
    return {
      id: g.id,
      startTime: g.date,
      status: g.status,
      deadlinePassed: isGameLocked(g.date),
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
      homeRecord: g.homeRecord ?? null,
      awayRecord: g.awayRecord ?? null,
    };
  });

  res.json({
    week,
    totalWeeks: NFL_TOTAL_WEEKS,
    currentWeek: pool.currentWeek,
    games: formattedGames,
  });
});

// POST /api/pools/:poolId/pickem-season/picks
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;
  const { week, picks } = req.body as {
    week: number;
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>;
  };

  if (!week || isNaN(Number(week)) || Number(week) < 1 || Number(week) > NFL_TOTAL_WEEKS) {
    res.status(400).json({ error: `week must be 1–${NFL_TOTAL_WEEKS}` }); return;
  }
  if (!Array.isArray(picks) || picks.length === 0) {
    res.status(400).json({ error: "picks must be a non-empty array" }); return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "pickem_season") {
    res.status(400).json({ error: "Not an NFL Pick-Ems Season pool" }); return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const numWeek = Number(week);
  const games = await fetchNflGamesByWeek(numWeek);
  const gameMap = new Map(games.map(g => [g.id, g]));

  const lockedIds: string[] = [];
  const unknownIds: string[] = [];

  for (const pick of picks) {
    const game = gameMap.get(pick.gameId);
    if (!game) { unknownIds.push(pick.gameId); }
    else if (isGameLocked(game.date)) { lockedIds.push(pick.gameId); }
  }

  if (unknownIds.length > 0) {
    res.status(400).json({ error: `Unknown game IDs: ${unknownIds.join(", ")}` }); return;
  }
  if (lockedIds.length > 0) {
    res.status(400).json({ error: `Games already locked (kickoff passed): ${lockedIds.join(", ")}` }); return;
  }

  let saved = 0;
  for (const pick of picks) {
    const game = gameMap.get(pick.gameId)!;
    const gameDate = game.date.slice(0, 10);
    await db
      .insert(pickemPicksTable)
      .values({
        poolId,
        userId,
        gameId: pick.gameId,
        gameDate,
        week: numWeek,
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

// GET /api/pools/:poolId/pickem-season/leaderboard
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "pickem_season") {
    res.status(400).json({ error: "Not an NFL Pick-Ems Season pool" }); return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const [seasonAggregates, weeklyAggregates, tiebreakers] = await Promise.all([
    db
      .select({
        userId: pickemPicksTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
        seasonCorrect: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        seasonTotal: sql<string>`COUNT(*)`,
      })
      .from(pickemPicksTable)
      .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
      .where(eq(pickemPicksTable.poolId, poolId))
      .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
      .orderBy(
        sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
        sql`COUNT(*) DESC`,
      ),
    db
      .select({
        userId: pickemPicksTable.userId,
        week: pickemPicksTable.week,
        correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        total: sql<string>`COUNT(*)`,
      })
      .from(pickemPicksTable)
      .where(eq(pickemPicksTable.poolId, poolId))
      .groupBy(pickemPicksTable.userId, pickemPicksTable.week),
    db
      .select({
        userId: entriesTable.userId,
        tiebreakerPrediction: entriesTable.tiebreakerPrediction,
      })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, poolId)),
  ]);

  const tiebreakerMap = new Map(tiebreakers.map(t => [t.userId, t.tiebreakerPrediction]));

  const weeklyMap = new Map<number, Record<number, { correct: number; total: number }>>();
  for (const row of weeklyAggregates) {
    if (!weeklyMap.has(row.userId)) weeklyMap.set(row.userId, {});
    weeklyMap.get(row.userId)![row.week] = {
      correct: Number(row.correct),
      total: Number(row.total),
    };
  }

  let rank = 1;
  const entries = seasonAggregates.map((u, i) => {
    if (i > 0 && Number(u.seasonCorrect) < Number(seasonAggregates[i - 1].seasonCorrect)) {
      rank = i + 1;
    }
    return {
      rank,
      userId: u.userId,
      username: u.username,
      displayName: u.displayName ?? null,
      seasonCorrect: Number(u.seasonCorrect),
      seasonTotal: Number(u.seasonTotal),
      tiebreakerPrediction: tiebreakerMap.get(u.userId) ?? null,
      weeklyScores: weeklyMap.get(u.userId) ?? {},
    };
  });

  res.json({ currentWeek: pool.currentWeek, totalWeeks: NFL_TOTAL_WEEKS, entries });
});

// POST /api/pools/:poolId/pickem-season/process-results
router.post("/process-results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "pickem_season") {
    res.status(400).json({ error: "Not an NFL Pick-Ems Season pool" }); return;
  }

  const isCommissioner = pool.commissionerId === userId;
  const [userRow] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!isCommissioner && userRow?.role !== "admin") {
    res.status(403).json({ error: "Commissioner or admin only" }); return;
  }

  const rawWeek = req.body.week != null
    ? parseInt(String(req.body.week))
    : parseInt(String(req.query.week ?? pool.currentWeek));
  const week = Math.max(1, Math.min(NFL_TOTAL_WEEKS, isNaN(rawWeek) ? pool.currentWeek : rawWeek));

  const games = await fetchNflGamesByWeek(week);
  const completedGames = games.filter(
    g => g.status === "final" && g.homeScore != null && g.awayScore != null
  );

  if (completedGames.length === 0) {
    res.json({ graded: 0, week, message: "No completed games found for that week" }); return;
  }

  const winnerMap = new Map<string, string | null>();
  for (const game of completedGames) {
    if (game.homeScore != null && game.awayScore != null) {
      if (game.homeScore > game.awayScore) winnerMap.set(game.id, game.homeTeam.id);
      else if (game.awayScore > game.homeScore) winnerMap.set(game.id, game.awayTeam.id);
      else winnerMap.set(game.id, null);
    }
  }

  const completedGameIds = Array.from(winnerMap.keys());

  const pendingPicks = await db
    .select()
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.week, week),
        eq(pickemPicksTable.result, "pending"),
        inArray(pickemPicksTable.gameId, completedGameIds),
      )
    );

  let graded = 0;
  for (const pick of pendingPicks) {
    const winner = winnerMap.get(pick.gameId);
    if (winner === undefined) continue;
    const result: "correct" | "incorrect" =
      winner !== null && pick.pickedTeamId === winner ? "correct" : "incorrect";
    await db
      .update(pickemPicksTable)
      .set({ result, updatedAt: new Date() })
      .where(eq(pickemPicksTable.id, pick.id));
    graded++;
  }

  res.json({ graded, week, completedGames: completedGameIds.length });
});

export default router;
