import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, entriesTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchGamesForDate, getTodayEtDate } from "../lib/espn";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/crazy-eights/grid?date=YYYY-MM-DD
router.get("/grid", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const date = String(req.query.date ?? getTodayEtDate());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const espnDate = date.replace(/-/g, "");

  const [games, allPicks] = await Promise.all([
    fetchGamesForDate("mlb", espnDate),
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
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.gameDate, date))),
  ]);

  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const gameMap = new Map(games.map((g) => [g.id, g]));

  const userMap = new Map<number, {
    userId: number; username: string; displayName: string | null;
    picks: Map<string, { pickedTeamId: string; pickedTeamName: string; pickedTeamLogoUrl: string | null; confidencePoints: number | null; result: string | null }>;
  }>();

  for (const pick of allPicks) {
    if (!userMap.has(pick.userId)) {
      userMap.set(pick.userId, { userId: pick.userId, username: pick.username, displayName: pick.displayName ?? null, picks: new Map() });
    }
    const game = gameMap.get(pick.gameId);
    const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
    userMap.get(pick.userId)!.picks.set(pick.gameId, {
      pickedTeamId: pick.pickedTeamId,
      pickedTeamName: pick.pickedTeamName,
      pickedTeamLogoUrl: game ? (pickedIsHome ? game.homeTeam.logo : game.awayTeam.logo) ?? null : null,
      confidencePoints: (pick as any).confidencePoints ?? null,
      result: pick.result ?? null,
    });
  }

  const [y, mo, d] = date.split("-").map(Number);
  const dateLabel = new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });

  const gamesSummary = games.map((g) => ({
    id: g.id,
    awayTeam: { id: g.awayTeam.id, abbreviation: g.awayTeam.abbreviation, name: g.awayTeam.displayName, logoUrl: g.awayTeam.logo ?? null },
    homeTeam: { id: g.homeTeam.id, abbreviation: g.homeTeam.abbreviation, name: g.homeTeam.displayName, logoUrl: g.homeTeam.logo ?? null },
    startTime: g.date,
    status: g.status,
    awayScore: g.awayScore ?? null,
    homeScore: g.homeScore ?? null,
  }));

  const players = Array.from(userMap.values()).map((u) => ({
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    picks: Object.fromEntries(u.picks.entries()),
  }));

  res.json({ date, dateLabel, games: gamesSummary, players });
});

// GET /api/pools/:poolId/crazy-eights/picks
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

  const todayEt = getTodayEtDate();
  const todayEspn = todayEt.replace(/-/g, "");

  const [picks, games] = await Promise.all([
    db.select().from(pickemPicksTable).where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.userId, userId),
        eq(pickemPicksTable.gameDate, todayEt),
      ),
    ),
    fetchGamesForDate("mlb", todayEspn),
  ]);

  const gameMap = new Map(games.map((g) => [g.id, g]));

  const details = picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
    return {
      gameId: pick.gameId,
      pickedTeamId: pick.pickedTeamId,
      pickedTeamName: pick.pickedTeamName,
      pickedTeamLogoUrl: game
        ? (pickedIsHome ? game.homeTeam.logo : game.awayTeam.logo) ?? null
        : null,
      confidencePoints: (pick as any).confidencePoints ?? null,
      result: pick.result,
      homeTeam: game
        ? { id: game.homeTeam.id, abbreviation: game.homeTeam.abbreviation, name: game.homeTeam.displayName, logoUrl: game.homeTeam.logo ?? null }
        : { id: "", abbreviation: "?", name: "Unknown", logoUrl: null },
      awayTeam: game
        ? { id: game.awayTeam.id, abbreviation: game.awayTeam.abbreviation, name: game.awayTeam.displayName, logoUrl: game.awayTeam.logo ?? null }
        : { id: "", abbreviation: "?", name: "Unknown", logoUrl: null },
      homeScore: game?.homeScore ?? null,
      awayScore: game?.awayScore ?? null,
      startTime: game?.date ?? "",
      status: (game?.status ?? "unknown") as string,
    };
  });

  res.json({
    picks: details,
    tiebreakerRuns: (entry as any).tiebreakerRuns ?? null,
    tiebreakerStrikeouts: (entry as any).tiebreakerStrikeouts ?? null,
  });
});

// POST /api/pools/:poolId/crazy-eights/picks
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const { picks, tiebreakerRuns, tiebreakerStrikeouts } = req.body as {
    picks: Array<{ gameId: string; pickedTeam?: string; confidencePoints: number }>;
    tiebreakerRuns: number;
    tiebreakerStrikeouts: number;
  };

  if (!Array.isArray(picks) || picks.length !== 8) {
    res.status(400).json({ error: "Exactly 8 picks are required" });
    return;
  }

  for (const p of picks) {
    if (!p.gameId || typeof p.confidencePoints !== "number") {
      res.status(400).json({ error: "Each pick must have gameId and confidencePoints" });
      return;
    }
  }

  const cpSorted = picks.map((p) => p.confidencePoints).sort((a, b) => a - b);
  if (!cpSorted.every((v, i) => v === i + 1)) {
    res.status(400).json({ error: "Confidence points 1-8 must each be used exactly once" });
    return;
  }

  if (typeof tiebreakerRuns !== "number" || typeof tiebreakerStrikeouts !== "number") {
    res.status(400).json({ error: "tiebreakerRuns and tiebreakerStrikeouts are required" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if ((pool.poolType as string) !== "crazy_8s") {
    res.status(400).json({ error: "This pool is not a Crazy 8's pool" });
    return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) {
    res.status(403).json({ error: "You are not a member of this pool" });
    return;
  }

  const todayEt = getTodayEtDate();
  const todayEspn = todayEt.replace(/-/g, "");
  const games = await fetchGamesForDate("mlb", todayEspn);
  const gameMap = new Map(games.map((g) => [g.id, g]));

  for (const pick of picks) {
    if (!gameMap.has(pick.gameId)) {
      res.status(400).json({ error: `Unknown game: ${pick.gameId}` });
      return;
    }
  }

  const selectedGames = picks.map((p) => gameMap.get(p.gameId)!);
  const earliestStartMs = Math.min(...selectedGames.map((g) => new Date(g.date).getTime()));
  if (Date.now() >= earliestStartMs) {
    res.status(400).json({ error: "Picks are locked — the earliest selected game has already started" });
    return;
  }

  let saved = 0;
  for (const pick of picks) {
    const teamLabel = pick.pickedTeam ?? "";
    await db
      .insert(pickemPicksTable)
      .values({
        poolId,
        userId,
        gameId: pick.gameId,
        gameDate: todayEt,
        week: pool.currentWeek,
        pickedTeamId: teamLabel,
        pickedTeamName: teamLabel,
        confidencePoints: pick.confidencePoints,
        result: "pending",
      } as any)
      .onConflictDoUpdate({
        target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
        set: {
          pickedTeamId: teamLabel,
          pickedTeamName: teamLabel,
          confidencePoints: pick.confidencePoints,
          result: "pending",
          updatedAt: new Date(),
        } as any,
      });
    saved++;
  }

  await db
    .update(entriesTable)
    .set({
      tiebreakerRuns,
      tiebreakerStrikeouts,
    } as any)
    .where(eq(entriesTable.id, entry.id));

  res.status(201).json({ ok: true, saved, message: "Crazy 8's picks submitted successfully" });
});

export default router;
