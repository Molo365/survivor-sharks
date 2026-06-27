import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, entriesTable, usersTable, sandboxGameScoresTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchGamesForDate, getTodayEtDate, getNhlWeekBounds, fetchNhlGamesByWeek, NHL_SANDBOX_ANCHOR, EspnGame } from "../lib/espn";

const router = Router({ mergeParams: true });

// ── NHL helper ────────────────────────────────────────────────────────────────

async function getNhlWeekendSlate(pool: typeof poolsTable.$inferSelect): Promise<{
  games: EspnGame[];
  satDate: string;
  sunDate: string;
}> {
  // Sandbox mode: use the fixed NHL_SANDBOX_ANCHOR so Week N always maps to the
  // 2025-26 season opener regardless of when the pool was actually created.
  const isSandbox = (pool as any).sandboxMode as boolean;
  const anchor = isSandbox ? NHL_SANDBOX_ANCHOR : pool.createdAt;
  const { espnDates, days } = getNhlWeekBounds(anchor, pool.currentWeek);
  const satEspn = espnDates[5];
  const sunEspn = espnDates[6];
  const satDate = days[5];
  const sunDate = days[6];
  const [satGames, sunGames] = await Promise.all([
    fetchGamesForDate("nhl", satEspn),
    fetchGamesForDate("nhl", sunEspn),
  ]);
  const seen = new Set<string>();
  const games: EspnGame[] = [];
  for (const g of [...satGames, ...sunGames]) {
    if (!seen.has(g.id)) { seen.add(g.id); games.push(g); }
  }
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { games, satDate, sunDate };
}

function toSlateShape(g: EspnGame) {
  return {
    id: g.id,
    startTime: g.date,
    status: g.status,
    awayTeam: { id: g.awayTeam.id, abbreviation: g.awayTeam.abbreviation, name: g.awayTeam.displayName, logoUrl: g.awayTeam.logo ?? null },
    homeTeam: { id: g.homeTeam.id, abbreviation: g.homeTeam.abbreviation, name: g.homeTeam.displayName, logoUrl: g.homeTeam.logo ?? null },
    awayScore: g.awayScore ?? null,
    homeScore: g.homeScore ?? null,
  };
}

// ── GET /api/pools/:poolId/crazy-eights/slate ─────────────────────────────────
// Returns the correct slate for the pool's current period:
//   NHL → combined Saturday + Sunday games for pool.currentWeek
//   MLB → today's MLB games

router.get("/slate", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [entry] = await db.select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, req.user!.id)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  if (pool.sport === "nhl") {
    const isSandbox = (pool as any).sandboxMode as boolean;
    const { games, satDate, sunDate } = await getNhlWeekendSlate(pool);

    // Load sandbox scores so graded cards display final results
    const sandboxScores = new Map<string, { homeScore: number; awayScore: number }>();
    if (isSandbox) {
      const rows = await db.select().from(sandboxGameScoresTable)
        .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, pool.currentWeek)));
      for (const r of rows) sandboxScores.set(r.gameId, { homeScore: r.homeScore, awayScore: r.awayScore });
    }

    const [sy, sm, sd] = satDate.split("-").map(Number);
    const [ny, nm, nd] = sunDate.split("-").map(Number);
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    const weekLabel = `${fmt.format(new Date(Date.UTC(sy, sm - 1, sd)))} – ${fmt.format(new Date(Date.UTC(ny, nm - 1, nd)))}`;
    res.json({
      sport: "nhl",
      week: pool.currentWeek,
      weekLabel,
      satDate,
      sunDate,
      sandboxMode: isSandbox,
      games: games.map(g => {
        const sbScore = isSandbox ? sandboxScores.get(g.id) : undefined;
        return {
          ...toSlateShape(g),
          homeScore: isSandbox ? (sbScore?.homeScore ?? null) : (g.homeScore ?? null),
          awayScore: isSandbox ? (sbScore?.awayScore ?? null) : (g.awayScore ?? null),
          status: isSandbox ? (sbScore ? "final" : "scheduled") : g.status,
        };
      }),
    });
    return;
  }

  // MLB: today's slate
  const todayEt = getTodayEtDate();
  const todayEspn = todayEt.replace(/-/g, "");
  const games = await fetchGamesForDate("mlb", todayEspn);
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const lastGame = games.at(-1);
  res.json({
    sport: "mlb",
    gameDate: todayEt,
    games: games.map(g => ({
      ...toSlateShape(g),
      awayPitcher: g.awayStartingPitcher ?? null,
      homePitcher: g.homeStartingPitcher ?? null,
    })),
    tiebreakerGame: lastGame ? {
      awayTeam: { abbreviation: lastGame.awayTeam.abbreviation, name: lastGame.awayTeam.displayName },
      homeTeam: { abbreviation: lastGame.homeTeam.abbreviation, name: lastGame.homeTeam.displayName },
      startTime: lastGame.date,
    } : null,
  });
});

// ── GET /api/pools/:poolId/crazy-eights/grid?date=YYYY-MM-DD ─────────────────
// MLB:  date = the day to display
// NHL:  date = Saturday of the weekend to display (Sunday auto-derived)
// Omit date for NHL sandbox pools — backend resolves the anchor Saturday automatically.

router.get("/grid", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const rawDate = String(req.query.date ?? "");

  // If a date was provided, validate it eagerly before hitting the DB
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  // Resolve missing date: NHL sandbox → anchor Saturday for pool.currentWeek; else today
  let date = rawDate;
  if (!date) {
    if (pool.sport === "nhl" && (pool as any).sandboxMode) {
      const { days } = getNhlWeekBounds(NHL_SANDBOX_ANCHOR, pool.currentWeek);
      date = days[5]; // index 5 = Saturday
    } else {
      date = getTodayEtDate();
    }
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  if (pool.sport === "nhl") {
    // date = Saturday anchor; derive Sunday = Saturday + 1
    const [sy, sm, sd] = date.split("-").map(Number);
    const satDt = new Date(Date.UTC(sy, sm - 1, sd));
    const sunDt = new Date(satDt.getTime() + 24 * 60 * 60 * 1000);
    const sunDate = sunDt.toISOString().slice(0, 10);
    const satEspn = date.replace(/-/g, "");
    const sunEspn = sunDate.replace(/-/g, "");

    const [satGames, sunGames, allPicks] = await Promise.all([
      fetchGamesForDate("nhl", satEspn),
      fetchGamesForDate("nhl", sunEspn),
      db.select({
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
        .where(and(
          eq(pickemPicksTable.poolId, poolId),
          inArray(pickemPicksTable.gameDate, [date, sunDate]),
        )),
    ]);

    const seen = new Set<string>();
    const games: EspnGame[] = [];
    for (const g of [...satGames, ...sunGames]) {
      if (!seen.has(g.id)) { seen.add(g.id); games.push(g); }
    }
    games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const gameMap = new Map(games.map(g => [g.id, g]));

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

    // Visibility rule: hide another player's picks until they've locked their full slate.
    {
      const totalGamesNhl = games.length;
      const now = Date.now();
      const slateIsLive =
        totalGamesNhl === 0 ||
        games.some(
          (g) =>
            new Date(g.date).getTime() <= now ||
            (g.status && g.status !== "scheduled"),
        );
      if (!slateIsLive) {
        for (const [uid, player] of userMap) {
          if (uid === userId) continue;
          if (player.picks.size >= totalGamesNhl) continue;
          player.picks.clear();
        }
      }
    }

    const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const dateLabel = `${fmt.format(satDt)} – ${fmt.format(sunDt)}`;

    res.json({
      date,
      dateLabel,
      games: games.map(g => ({
        id: g.id,
        awayTeam: { id: g.awayTeam.id, abbreviation: g.awayTeam.abbreviation, name: g.awayTeam.displayName, logoUrl: g.awayTeam.logo ?? null },
        homeTeam: { id: g.homeTeam.id, abbreviation: g.homeTeam.abbreviation, name: g.homeTeam.displayName, logoUrl: g.homeTeam.logo ?? null },
        startTime: g.date,
        status: g.status,
        awayScore: g.awayScore ?? null,
        homeScore: g.homeScore ?? null,
      })),
      players: Array.from(userMap.values()).map(u => ({
        userId: u.userId,
        username: u.username,
        displayName: u.displayName,
        picks: Object.fromEntries(u.picks.entries()),
      })),
    });
    return;
  }

  // MLB: single-date grid (unchanged)
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

  // Visibility rule: hide another player's picks until they've locked their full slate.
  {
    const totalGamesMlb = games.length;
    const now = Date.now();
    const slateIsLive =
      totalGamesMlb === 0 ||
      games.some(
        (g) =>
          new Date(g.date).getTime() <= now ||
          (g.status && g.status !== "scheduled"),
      );
    if (!slateIsLive) {
      for (const [uid, player] of userMap) {
        if (uid === userId) continue;
        if (player.picks.size >= totalGamesMlb) continue;
        player.picks.clear();
      }
    }
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

// ── GET /api/pools/:poolId/crazy-eights/picks ─────────────────────────────────
// Returns the current user's submitted picks for the active period.
// NHL: week-based query (both Sat+Sun); tiebreaker = shots/PIM
// MLB: today-based query; tiebreaker = runs/strikeouts

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

  if (pool.sport === "nhl") {
    const isSandbox = (pool as any).sandboxMode as boolean;
    const { games, satDate, sunDate } = await getNhlWeekendSlate(pool);
    const gameMap = new Map(games.map(g => [g.id, g]));
    const lastGame = games.at(-1);

    const picks = await db.select().from(pickemPicksTable).where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.userId, userId),
        inArray(pickemPicksTable.gameDate, [satDate, sunDate]),
      ),
    );

    // In sandbox mode, overlay scores from sandboxGameScoresTable so the
    // picks view shows the same simulated results used for grading.
    const sandboxScores = new Map<string, { homeScore: number; awayScore: number }>();
    if (isSandbox) {
      const sbRows = await db.select().from(sandboxGameScoresTable)
        .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, pool.currentWeek)));
      for (const r of sbRows) sandboxScores.set(r.gameId, { homeScore: r.homeScore, awayScore: r.awayScore });
    }

    const details = picks.map((pick) => {
      const game = gameMap.get(pick.gameId);
      const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
      const sbScore = isSandbox ? sandboxScores.get(pick.gameId) : undefined;
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
        homeScore: isSandbox ? (sbScore?.homeScore ?? null) : (game?.homeScore ?? null),
        awayScore: isSandbox ? (sbScore?.awayScore ?? null) : (game?.awayScore ?? null),
        startTime: game?.date ?? "",
        status: isSandbox ? (sbScore ? "final" : "scheduled") : ((game?.status ?? "unknown") as string),
      };
    });

    res.json({
      picks: details,
      tiebreakerShotsOnGoal: (entry as any).tiebreakerShotsOnGoal ?? null,
      tiebreakerPenaltyMinutes: (entry as any).tiebreakerPenaltyMinutes ?? null,
      tiebreakerGame: lastGame ? {
        awayTeam: { abbreviation: lastGame.awayTeam.abbreviation, name: lastGame.awayTeam.displayName },
        homeTeam: { abbreviation: lastGame.homeTeam.abbreviation, name: lastGame.homeTeam.displayName },
        startTime: lastGame.date,
      } : null,
    });
    return;
  }

  // MLB
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

  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const gameMap = new Map(games.map((g) => [g.id, g]));
  const lastGame = games.at(-1);

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
    tiebreakerGame: lastGame
      ? {
          awayTeam: { abbreviation: lastGame.awayTeam.abbreviation, name: lastGame.awayTeam.displayName },
          homeTeam: { abbreviation: lastGame.homeTeam.abbreviation, name: lastGame.homeTeam.displayName },
          startTime: lastGame.date,
        }
      : null,
  });
});

// ── POST /api/pools/:poolId/crazy-eights/picks ────────────────────────────────
// Validates + stores 8 picks with confidence points 1-8.
// NHL: validates against weekend slate; saves shots/PIM tiebreaker
// MLB: validates against today's slate; saves runs/strikeouts tiebreaker

router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const { picks, tiebreakerRuns, tiebreakerStrikeouts, tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes } = req.body as {
    picks: Array<{ gameId: string; pickedTeam?: string; confidencePoints: number }>;
    tiebreakerRuns?: number;
    tiebreakerStrikeouts?: number;
    tiebreakerShotsOnGoal?: number;
    tiebreakerPenaltyMinutes?: number;
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

  if (pool.sport === "nhl") {
    if (typeof tiebreakerShotsOnGoal !== "number" || typeof tiebreakerPenaltyMinutes !== "number") {
      res.status(400).json({ error: "tiebreakerShotsOnGoal and tiebreakerPenaltyMinutes are required" });
      return;
    }

    const { games, satDate, sunDate } = await getNhlWeekendSlate(pool);
    const gameMap = new Map(games.map(g => [g.id, g]));

    for (const pick of picks) {
      if (!gameMap.has(pick.gameId)) {
        res.status(400).json({ error: `Unknown game: ${pick.gameId}` });
        return;
      }
    }

    const isSandbox = (pool as any).sandboxMode as boolean;
    const selectedGames = picks.map(p => gameMap.get(p.gameId)!);
    // In sandbox mode the anchor games are historical; skip the real-time lock.
    if (!isSandbox) {
      const earliestStartMs = Math.min(...selectedGames.map(g => new Date(g.date).getTime()));
      if (Date.now() >= earliestStartMs) {
        res.status(400).json({ error: "Picks are locked — the earliest selected game has already started" });
        return;
      }
    }

    let saved = 0;
    for (const pick of picks) {
      const game = gameMap.get(pick.gameId)!;
      const gameDate = game.date.slice(0, 10);
      const teamLabel = pick.pickedTeam ?? "";
      await db
        .insert(pickemPicksTable)
        .values({
          poolId,
          userId,
          gameId: pick.gameId,
          gameDate,
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
      .set({ tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes } as any)
      .where(eq(entriesTable.id, entry.id));

    res.status(201).json({ ok: true, saved, message: "Hit the Ice! picks submitted successfully" });
    return;
  }

  // MLB
  if (typeof tiebreakerRuns !== "number" || typeof tiebreakerStrikeouts !== "number") {
    res.status(400).json({ error: "tiebreakerRuns and tiebreakerStrikeouts are required" });
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

// ── GET /api/pools/:poolId/crazy-eights/yesterday-winner ──────────────────────
// MLB:  ?date=YYYY-MM-DD  (the day to resolve)
// NHL:  ?date=YYYY-MM-DD  (Saturday of the weekend to resolve; Sunday auto-derived)

router.get("/yesterday-winner", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;
  const date = String(req.query.date ?? "");

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

  // For NHL: date = Saturday; derive Sunday
  const datesToQuery: string[] = pool.sport === "nhl"
    ? (() => {
        const [y, m, d] = date.split("-").map(Number);
        const sunDt = new Date(Date.UTC(y, m - 1, d + 1));
        return [date, sunDt.toISOString().slice(0, 10)];
      })()
    : [date];

  const rows = await db
    .select({
      userId: pickemPicksTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      confidencePoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0)`,
      total: sql<string>`COUNT(*)`,
      graded: sql<string>`COUNT(*) FILTER (WHERE pickem_picks.result != 'pending')`,
    })
    .from(pickemPicksTable)
    .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
    .where(and(eq(pickemPicksTable.poolId, poolId), inArray(pickemPicksTable.gameDate, datesToQuery)))
    .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
    .orderBy(sql`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0) DESC`);

  const hasResults = rows.some((r) => Number(r.graded) > 0);
  if (!hasResults) {
    res.json({ date, hasResults: false, winners: [] });
    return;
  }

  const allGraded = rows.every((r) => Number(r.graded) === Number(r.total));
  if (!allGraded) {
    res.json({ date, hasResults: false, winners: [] });
    return;
  }

  const maxPts = Math.max(...rows.map((r) => Number(r.confidencePoints)));
  const winners = rows
    .filter((r) => Number(r.confidencePoints) === maxPts)
    .map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName ?? null,
      confidencePoints: Number(r.confidencePoints),
    }));

  res.json({ date, hasResults: true, winners });
});

export default router;
