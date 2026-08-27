import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, entriesTable, usersTable, sandboxGameScoresTable } from "@workspace/db";
import { eq, and, sql, inArray, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchGamesForDate, getTodayEtDate, getNhlWeekBounds, fetchNhlGamesByWeek, NHL_SANDBOX_ANCHOR, getNbaWeekendBounds, NBA_SANDBOX_ANCHOR, EspnGame } from "../lib/espn";
import { fetchNhlTiebreakerStats } from "../lib/nhl-stats";
import { fetchNbaTiebreakerStats } from "../lib/nba-stats";
import { fetchSingleGameStrikeouts } from "../lib/mlb-stats";
import { resolveSequentialTiebreaker } from "../lib/tiebreaker";

const router = Router({ mergeParams: true });

function isGridPickRevealed(opts: {
  isOwnPick: boolean;
  sandboxMode: boolean;
  result: string | null;
  game: EspnGame | undefined;
}): boolean {
  if (opts.isOwnPick) return true;
  if (opts.result != null && opts.result !== "pending") return true;
  if (opts.sandboxMode || !opts.game) return false;
  return new Date(opts.game.date).getTime() <= Date.now();
}

// ── NHL helper ────────────────────────────────────────────────────────────────

async function getNhlWeekendSlate(pool: typeof poolsTable.$inferSelect): Promise<{
  games: EspnGame[];
  satDate: string;
  sunDate: string;
  gameDates: Map<string, string>;
}> {
  // Sandbox mode: use the fixed NHL_SANDBOX_ANCHOR so Week N always maps to the
  // 2025-26 season opener regardless of when the pool was actually created.
  const isSandbox = (pool as any).sandboxMode as boolean;
  const anchor = isSandbox ? NHL_SANDBOX_ANCHOR : pool.createdAt;
  const { espnDates, days } = getNhlWeekBounds(anchor, pool.currentWeek);
  const satEspn = espnDates[0];
  const sunEspn = espnDates[1];
  const satDate = days[0];
  const sunDate = days[1];
  const [satGames, sunGames] = await Promise.all([
    fetchGamesForDate("nhl", satEspn),
    fetchGamesForDate("nhl", sunEspn),
  ]);
  const seen = new Set<string>();
  const games: EspnGame[] = [];
  // Map each game to the ET slate day it was fetched under. ESPN's date-scoped
  // scoreboard buckets games by ET day, so this — NOT a UTC slice of game.date —
  // is the day the rest of the weekend pipeline (grid/picks/grading/resolution)
  // queries by. Sunday-evening ET games are Monday in UTC and would silently
  // fall out of every weekend-window query if we sliced game.date directly.
  const gameDates = new Map<string, string>();
  for (const g of satGames) {
    if (!seen.has(g.id)) { seen.add(g.id); games.push(g); gameDates.set(g.id, satDate); }
  }
  for (const g of sunGames) {
    if (!seen.has(g.id)) { seen.add(g.id); games.push(g); gameDates.set(g.id, sunDate); }
  }
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { games, satDate, sunDate, gameDates };
}

// ── NBA helper ────────────────────────────────────────────────────────────────

async function getNbaWeekendSlate(pool: typeof poolsTable.$inferSelect): Promise<{
  games: EspnGame[];
  friDate: string;
  satDate: string;
  sunDate: string;
  gameDates: Map<string, string>;
}> {
  // Sandbox mode: use the fixed NBA_SANDBOX_ANCHOR so Week N always maps to the
  // 2025-26 season regardless of when the pool was actually created.
  const isSandbox = (pool as any).sandboxMode as boolean;
  const anchor = isSandbox ? NBA_SANDBOX_ANCHOR : pool.createdAt;
  const { espnDates, days } = getNbaWeekendBounds(anchor, pool.currentWeek);
  const [friDate, satDate, sunDate] = days;
  const results = await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d)));
  const seen = new Set<string>();
  const games: EspnGame[] = [];
  // Map each game to the ET slate day it was fetched under. ESPN's date-scoped
  // scoreboard buckets games by ET day, so this — NOT a UTC slice of game.date —
  // is the day the rest of the weekend pipeline (grid/picks/grading) queries by.
  const gameDates = new Map<string, string>();
  results.forEach((dayGames, i) => {
    for (const g of dayGames) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        games.push(g);
        gameDates.set(g.id, days[i]);
      }
    }
  });
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { games, friDate, satDate, sunDate, gameDates };
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
      for (const r of rows) sandboxScores.set(r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 });
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

  if (pool.sport === "nba") {
    const isSandbox = (pool as any).sandboxMode as boolean;
    const { games, friDate, satDate, sunDate } = await getNbaWeekendSlate(pool);

    // Load sandbox scores so graded cards display final results
    const sandboxScores = new Map<string, { homeScore: number; awayScore: number }>();
    if (isSandbox) {
      const rows = await db.select().from(sandboxGameScoresTable)
        .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, pool.currentWeek)));
      for (const r of rows) sandboxScores.set(r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 });
    }

    const [fy, fm, fd] = friDate.split("-").map(Number);
    const [ny, nm, nd] = sunDate.split("-").map(Number);
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    const weekLabel = `${fmt.format(new Date(Date.UTC(fy, fm - 1, fd)))} – ${fmt.format(new Date(Date.UTC(ny, nm - 1, nd)))}`;
    res.json({
      sport: "nba",
      week: pool.currentWeek,
      weekLabel,
      friDate,
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
      date = days[0]; // index 0 = Saturday (filtered array: Sat=0, Sun=1)
    } else if (pool.sport === "nba" && (pool as any).sandboxMode) {
      const { days } = getNbaWeekendBounds(NBA_SANDBOX_ANCHOR, pool.currentWeek);
      date = days[0]; // index 0 = Friday (filtered array: Fri=0, Sat=1, Sun=2)
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
      picks: Map<string, { pickedTeamId: string | null; pickedTeamName: string | null; pickedTeamLogoUrl: string | null; confidencePoints: number | null; result: string | null }>;
    }>();

    for (const pick of allPicks) {
      if (!userMap.has(pick.userId)) {
        userMap.set(pick.userId, { userId: pick.userId, username: pick.username, displayName: pick.displayName ?? null, picks: new Map() });
      }
      const game = gameMap.get(pick.gameId);
      const revealed = isGridPickRevealed({
        isOwnPick: pick.userId === userId,
        sandboxMode: pool.sandboxMode ?? false,
        result: pick.result ?? null,
        game,
      });
      const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
      userMap.get(pick.userId)!.picks.set(pick.gameId, {
        pickedTeamId: revealed ? pick.pickedTeamId : null,
        pickedTeamName: revealed ? pick.pickedTeamName : null,
        pickedTeamLogoUrl: revealed && game ? (pickedIsHome ? game.homeTeam.logo : game.awayTeam.logo) ?? null : null,
        confidencePoints: (pick as any).confidencePoints ?? null,
        result: pick.result ?? null,
      });
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

  if (pool.sport === "nba") {
    // date = Friday anchor; derive Saturday = +1, Sunday = +2
    const [fy, fm, fd] = date.split("-").map(Number);
    const friDt = new Date(Date.UTC(fy, fm - 1, fd));
    const satDt = new Date(friDt.getTime() + 24 * 60 * 60 * 1000);
    const sunDt = new Date(friDt.getTime() + 2 * 24 * 60 * 60 * 1000);
    const satDate = satDt.toISOString().slice(0, 10);
    const sunDate = sunDt.toISOString().slice(0, 10);
    const weekendDates = [date, satDate, sunDate];
    const espnDatesNba = weekendDates.map(d => d.replace(/-/g, ""));

    const [gameArrays, allPicks] = await Promise.all([
      Promise.all(espnDatesNba.map(d => fetchGamesForDate("nba", d))),
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
          inArray(pickemPicksTable.gameDate, weekendDates),
        )),
    ]);

    const seen = new Set<string>();
    const games: EspnGame[] = [];
    for (const g of gameArrays.flat()) {
      if (!seen.has(g.id)) { seen.add(g.id); games.push(g); }
    }
    games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const gameMap = new Map(games.map(g => [g.id, g]));

    const userMap = new Map<number, {
      userId: number; username: string; displayName: string | null;
      picks: Map<string, { pickedTeamId: string | null; pickedTeamName: string | null; pickedTeamLogoUrl: string | null; confidencePoints: number | null; result: string | null }>;
    }>();

    for (const pick of allPicks) {
      if (!userMap.has(pick.userId)) {
        userMap.set(pick.userId, { userId: pick.userId, username: pick.username, displayName: pick.displayName ?? null, picks: new Map() });
      }
      const game = gameMap.get(pick.gameId);
      const revealed = isGridPickRevealed({
        isOwnPick: pick.userId === userId,
        sandboxMode: pool.sandboxMode ?? false,
        result: pick.result ?? null,
        game,
      });
      const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
      userMap.get(pick.userId)!.picks.set(pick.gameId, {
        pickedTeamId: revealed ? pick.pickedTeamId : null,
        pickedTeamName: revealed ? pick.pickedTeamName : null,
        pickedTeamLogoUrl: revealed && game ? (pickedIsHome ? game.homeTeam.logo : game.awayTeam.logo) ?? null : null,
        confidencePoints: (pick as any).confidencePoints ?? null,
        result: pick.result ?? null,
      });
    }

    const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const dateLabel = `${fmt.format(friDt)} – ${fmt.format(sunDt)}`;

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
    picks: Map<string, { pickedTeamId: string | null; pickedTeamName: string | null; pickedTeamLogoUrl: string | null; confidencePoints: number | null; result: string | null }>;
  }>();

  for (const pick of allPicks) {
    if (!userMap.has(pick.userId)) {
      userMap.set(pick.userId, { userId: pick.userId, username: pick.username, displayName: pick.displayName ?? null, picks: new Map() });
    }
    const game = gameMap.get(pick.gameId);
    const revealed = isGridPickRevealed({
      isOwnPick: pick.userId === userId,
      sandboxMode: pool.sandboxMode ?? false,
      result: pick.result ?? null,
      game,
    });
    const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
    userMap.get(pick.userId)!.picks.set(pick.gameId, {
      pickedTeamId: revealed ? pick.pickedTeamId : null,
      pickedTeamName: revealed ? pick.pickedTeamName : null,
      pickedTeamLogoUrl: revealed && game ? (pickedIsHome ? game.homeTeam.logo : game.awayTeam.logo) ?? null : null,
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
      for (const r of sbRows) sandboxScores.set(r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 });
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

  if (pool.sport === "nba") {
    const isSandbox = (pool as any).sandboxMode as boolean;
    const { games, friDate, satDate, sunDate } = await getNbaWeekendSlate(pool);
    const gameMap = new Map(games.map(g => [g.id, g]));
    const lastGame = games.at(-1);

    const picks = await db.select().from(pickemPicksTable).where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.userId, userId),
        inArray(pickemPicksTable.gameDate, [friDate, satDate, sunDate]),
      ),
    );

    // In sandbox mode, overlay scores from sandboxGameScoresTable so the
    // picks view shows the same simulated results used for grading.
    const sandboxScores = new Map<string, { homeScore: number; awayScore: number }>();
    if (isSandbox) {
      const sbRows = await db.select().from(sandboxGameScoresTable)
        .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, pool.currentWeek)));
      for (const r of sbRows) sandboxScores.set(r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 });
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
      tiebreakerPoints: (entry as any).tiebreakerPoints ?? null,
      tiebreakerThrees: (entry as any).tiebreakerThrees ?? null,
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

  const { picks, tiebreakerRuns, tiebreakerStrikeouts, tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes, tiebreakerPoints, tiebreakerThrees } = req.body as {
    picks: Array<{ gameId: string; pickedTeam?: string; pickedTeamName?: string; confidencePoints: number }>;
    tiebreakerRuns?: number;
    tiebreakerStrikeouts?: number;
    tiebreakerShotsOnGoal?: number;
    tiebreakerPenaltyMinutes?: number;
    tiebreakerPoints?: number;
    tiebreakerThrees?: number;
  };

  if (!Array.isArray(picks) || picks.length === 0) {
    res.status(400).json({ error: "picks array is required" });
    return;
  }

  for (const p of picks) {
    if (!p.gameId || typeof p.confidencePoints !== "number") {
      res.status(400).json({ error: "Each pick must have gameId and confidencePoints" });
      return;
    }
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
    const isSandbox = (pool as any).sandboxMode as boolean;
    const { games, satDate, sunDate, gameDates } = await getNhlWeekendSlate(pool);
    const gameMap = new Map(games.map(g => [g.id, g]));

    for (const pick of picks) {
      if (!gameMap.has(pick.gameId)) {
        res.status(400).json({ error: `Unknown game: ${pick.gameId}` });
        return;
      }
    }

    const nowMs = Date.now();
    const availableCount = Math.min(
      isSandbox
        ? games.length
        : games.filter(g => {
            const startMs = new Date(g.date).getTime();
            return g.status !== "in_progress" && g.status !== "final" && nowMs < startMs;
          }).length,
      8
    );
    if (availableCount === 0) {
      res.status(400).json({ error: "No games available to pick — all games have started" });
      return;
    }
    if (picks.length !== availableCount) {
      res.status(400).json({ error: `Expected ${availableCount} picks, got ${picks.length}` });
      return;
    }
    const cpSortedNhl = picks.map(p => p.confidencePoints).sort((a, b) => a - b);
    if (!cpSortedNhl.every((v, i) => v === i + 1)) {
      res.status(400).json({ error: `Confidence points 1-${availableCount} must each be used exactly once` });
      return;
    }

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
      // Bucket by the ET slate day (Sat/Sun) — a UTC slice of game.date would
      // push Sunday-evening ET games onto Monday and exclude them from all
      // weekend-window queries (picks/grid/grading/resolution).
      const gameDate = gameDates.get(pick.gameId) ?? satDate;
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
          pickedTeamName: pick.pickedTeamName || teamLabel,
          confidencePoints: pick.confidencePoints,
          result: "pending",
        } as any)
        .onConflictDoUpdate({
          target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
          set: {
            pickedTeamId: teamLabel,
            pickedTeamName: pick.pickedTeamName || teamLabel,
            confidencePoints: pick.confidencePoints,
            result: "pending",
            updatedAt: new Date(),
          } as any,
        });
      saved++;
    }

    await db
      .update(entriesTable)
      .set({ tiebreakerShotsOnGoal: tiebreakerShotsOnGoal ?? null, tiebreakerPenaltyMinutes: tiebreakerPenaltyMinutes ?? null } as any)
      .where(eq(entriesTable.id, entry.id));

    res.status(201).json({ ok: true, saved, message: "Hit the Ice! picks submitted successfully" });
    return;
  }

  if (pool.sport === "nba") {
    const isSandbox = (pool as any).sandboxMode as boolean;
    const { games, gameDates, friDate } = await getNbaWeekendSlate(pool);
    const gameMap = new Map(games.map(g => [g.id, g]));

    for (const pick of picks) {
      if (!gameMap.has(pick.gameId)) {
        res.status(400).json({ error: `Unknown game: ${pick.gameId}` });
        return;
      }
    }

    const nowMs = Date.now();
    const availableCount = Math.min(
      isSandbox
        ? games.length
        : games.filter(g => {
            const startMs = new Date(g.date).getTime();
            return g.status !== "in_progress" && g.status !== "final" && nowMs < startMs;
          }).length,
      8
    );
    if (availableCount === 0) {
      res.status(400).json({ error: "No games available to pick — all games have started" });
      return;
    }
    if (picks.length !== availableCount) {
      res.status(400).json({ error: `Expected ${availableCount} picks, got ${picks.length}` });
      return;
    }
    const cpSortedNba = picks.map(p => p.confidencePoints).sort((a, b) => a - b);
    if (!cpSortedNba.every((v, i) => v === i + 1)) {
      res.status(400).json({ error: `Confidence points 1-${availableCount} must each be used exactly once` });
      return;
    }

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
      // Bucket by the ET slate day (Fri/Sat/Sun) — a UTC slice of game.date would
      // push Sunday-evening ET games onto Monday and exclude them from all
      // weekend-window queries (picks/grid/grading/resolution).
      const gameDate = gameDates.get(pick.gameId) ?? friDate;
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
          pickedTeamName: pick.pickedTeamName || teamLabel,
          confidencePoints: pick.confidencePoints,
          result: "pending",
        } as any)
        .onConflictDoUpdate({
          target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
          set: {
            pickedTeamId: teamLabel,
            pickedTeamName: pick.pickedTeamName || teamLabel,
            confidencePoints: pick.confidencePoints,
            result: "pending",
            updatedAt: new Date(),
          } as any,
        });
      saved++;
    }

    await db
      .update(entriesTable)
      .set({ tiebreakerPoints: tiebreakerPoints ?? null, tiebreakerThrees: tiebreakerThrees ?? null } as any)
      .where(eq(entriesTable.id, entry.id));

    res.status(201).json({ ok: true, saved, message: "Fast Break picks submitted successfully" });
    return;
  }

  // MLB (continues below)
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

  const nowMlb = Date.now();
  const availableCountMlb = Math.min(
    games.filter(g => {
      const startMs = new Date(g.date).getTime();
      return g.status !== "in_progress" && g.status !== "final" && nowMlb < startMs;
    }).length,
    8
  );
  if (availableCountMlb === 0) {
    res.status(400).json({ error: "No games available to pick — all games have started" });
    return;
  }
  if (picks.length !== availableCountMlb) {
    res.status(400).json({ error: `Expected ${availableCountMlb} picks, got ${picks.length}` });
    return;
  }
  const cpSortedMlb = picks.map((p) => p.confidencePoints).sort((a, b) => a - b);
  if (!cpSortedMlb.every((v, i) => v === i + 1)) {
    res.status(400).json({ error: `Confidence points 1-${availableCountMlb} must each be used exactly once` });
    return;
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
        pickedTeamName: pick.pickedTeamName || teamLabel,
        confidencePoints: pick.confidencePoints,
        result: "pending",
      } as any)
      .onConflictDoUpdate({
        target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
        set: {
          pickedTeamId: teamLabel,
          pickedTeamName: pick.pickedTeamName || teamLabel,
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
      tiebreakerRuns: tiebreakerRuns ?? null,
      tiebreakerStrikeouts: tiebreakerStrikeouts ?? null,
    } as any)
    .where(eq(entriesTable.id, entry.id));

  res.status(201).json({ ok: true, saved, message: "Crazy 8's picks submitted successfully" });
});

// ── PATCH /api/pools/:poolId/crazy-eights/tiebreaker ─────────────────────────
// NHL Hit the Ice only — lets a member update their tiebreaker guesses after
// picks are already submitted (e.g. submitted on Saturday before dialog existed).

router.patch("/tiebreaker", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const { tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes, tiebreakerPoints, tiebreakerThrees } = req.body as {
    tiebreakerShotsOnGoal?: unknown;
    tiebreakerPenaltyMinutes?: unknown;
    tiebreakerPoints?: unknown;
    tiebreakerThrees?: unknown;
  };

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool || (pool.poolType as string) !== "crazy_8s" || (pool.sport !== "nhl" && pool.sport !== "nba")) {
    res.status(404).json({ error: "Pool not found or not a weekend Crazy 8's pool" });
    return;
  }

  if (pool.sport === "nhl") {
    if (typeof tiebreakerShotsOnGoal !== "number" || typeof tiebreakerPenaltyMinutes !== "number"
      || tiebreakerShotsOnGoal < 0 || tiebreakerPenaltyMinutes < 0) {
      res.status(400).json({ error: "tiebreakerShotsOnGoal and tiebreakerPenaltyMinutes must be numbers ≥ 0" });
      return;
    }
  } else {
    if (typeof tiebreakerPoints !== "number" || typeof tiebreakerThrees !== "number"
      || tiebreakerPoints < 0 || tiebreakerThrees < 0) {
      res.status(400).json({ error: "tiebreakerPoints and tiebreakerThrees must be numbers ≥ 0" });
      return;
    }
  }

  const [entry] = await db
    .select({ id: entriesTable.id })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) {
    res.status(403).json({ error: "You are not a member of this pool" });
    return;
  }

  await db
    .update(entriesTable)
    .set(
      pool.sport === "nhl"
        ? ({ tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes } as any)
        : ({ tiebreakerPoints, tiebreakerThrees } as any),
    )
    .where(eq(entriesTable.id, entry.id));

  res.json({ ok: true });
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

  // For NHL: date = Saturday; derive Sunday.
  // For NBA: date = Friday; derive Saturday + Sunday.
  const datesToQuery: string[] = pool.sport === "nhl" || pool.sport === "nba"
    ? (() => {
        const [y, m, d] = date.split("-").map(Number);
        const extraDays = pool.sport === "nba" ? 2 : 1;
        const dates = [date];
        for (let i = 1; i <= extraDays; i++) {
          dates.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
        }
        return dates;
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

// ── Weekly date-range helper ───────────────────────────────────────────────────

function getWeekBoundsFromDate(dateStr: string): { weekStart: string; weekEnd: string; weekLabel: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const monDt = new Date(Date.UTC(y, m - 1, d + daysToMon));
  const sunDt = new Date(Date.UTC(monDt.getUTCFullYear(), monDt.getUTCMonth(), monDt.getUTCDate() + 6));
  const weekStart = monDt.toISOString().slice(0, 10);
  const weekEnd = sunDt.toISOString().slice(0, 10);
  const fmt = (x: Date) => x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { weekStart, weekEnd, weekLabel: `${fmt(monDt)} – ${fmt(sunDt)}` };
}

function fmtDayLabel(ds: string): string {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

// ── GET /api/pools/:poolId/crazy-eights/weekly-leaderboard ────────────────────
// MLB only — aggregates picks across Mon–Sun for the week containing weekOf.
// ?weekOf=YYYY-MM-DD (defaults to today ET)
router.get("/weekly-leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [entry] = await db
    .select({ id: entriesTable.id })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const weekOf = String(req.query.weekOf || getTodayEtDate());
  const { weekStart, weekEnd, weekLabel } = getWeekBoundsFromDate(weekOf);
  const todayEt = getTodayEtDate();
  const isCurrentWeek = todayEt >= weekStart && todayEt <= weekEnd;

  const picks = await db
    .select({
      userId: pickemPicksTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      gameDate: pickemPicksTable.gameDate,
      confidencePoints: pickemPicksTable.confidencePoints,
      result: pickemPicksTable.result,
    })
    .from(pickemPicksTable)
    .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        gte(pickemPicksTable.gameDate, weekStart),
        lte(pickemPicksTable.gameDate, weekEnd),
      )
    );

  type DayData = { pointsEarned: number; pointsPossible: number; pending: number };
  type UserData = { userId: number; username: string; displayName: string | null; days: Map<string, DayData> };
  const byUser = new Map<number, UserData>();

  for (const pick of picks) {
    if (!byUser.has(pick.userId)) {
      byUser.set(pick.userId, { userId: pick.userId, username: pick.username, displayName: pick.displayName, days: new Map() });
    }
    const u = byUser.get(pick.userId)!;
    if (!u.days.has(pick.gameDate)) {
      u.days.set(pick.gameDate, { pointsEarned: 0, pointsPossible: 0, pending: 0 });
    }
    const day = u.days.get(pick.gameDate)!;
    const pts = Number(pick.confidencePoints ?? 0);
    if (pick.result === "correct") {
      day.pointsEarned += pts;
      day.pointsPossible += pts;
    } else if (pick.result === "incorrect" || pick.result === "postponed") {
      day.pointsPossible += pts;
    } else {
      day.pending += pts;
      day.pointsPossible += pts;
    }
  }

  type BaseEntry = {
    userId: number; username: string; displayName: string | null;
    weeklyPoints: number;
    days: Array<{ date: string; dateLabel: string; pointsEarned: number; pointsPossible: number; pending: number }>;
  };

  const baseEntries: BaseEntry[] = Array.from(byUser.values()).map((u) => {
    const days = Array.from(u.days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        dateLabel: fmtDayLabel(date),
        pointsEarned: data.pointsEarned,
        pointsPossible: data.pointsPossible,
        pending: data.pending,
      }));
    const weeklyPoints = days.reduce((s, day) => s + day.pointsEarned, 0);
    return { userId: u.userId, username: u.username, displayName: u.displayName, weeklyPoints, days };
  });
  baseEntries.sort((a, b) => b.weeklyPoints - a.weeklyPoints);

  // Group by score to detect ties
  const scoreGroupMap = new Map<number, BaseEntry[]>();
  for (const p of baseEntries) {
    if (!scoreGroupMap.has(p.weeklyPoints)) scoreGroupMap.set(p.weeklyPoints, []);
    scoreGroupMap.get(p.weeklyPoints)!.push(p);
  }
  const anyTied = [...scoreGroupMap.values()].some((g) => g.length > 1);

  // Tiebreaker state — only populated when ties exist
  let actualPrimary: number | null = null;
  let actualSecondary: number | null = null;
  const primaryGuessMap = new Map<number, number | null>();
  const secondaryGuessMap = new Map<number, number | null>();

  if (anyTied) {
    // Derive period dates from already-fetched picks (avoids fetching empty days)
    const periodDates = [...new Set(picks.map((p) => p.gameDate))].sort();
    if (periodDates.length > 0) {
      try {
        const sport = pool.sport as string;
        const espnSport = sport === "nhl" ? "nhl" : sport === "nba" ? "nba" : "mlb";
        const dayGameArrays = await Promise.all(
          periodDates.map((d) => fetchGamesForDate(espnSport, d.replace(/-/g, ""))),
        );
        const lastGame = dayGameArrays
          .flat()
          .filter((g) => g.isCompleted && g.homeScore != null && g.awayScore != null)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .at(-1) ?? null;

        if (lastGame) {
          if (sport === "nhl") {
            const stats = await fetchNhlTiebreakerStats(lastGame.id);
            actualPrimary = stats.shotsOnGoal;
            actualSecondary = stats.penaltyMinutes;
          } else if (sport === "nba") {
            const stats = await fetchNbaTiebreakerStats(lastGame.id);
            actualPrimary =
              stats.totalPoints ??
              (lastGame.homeScore != null && lastGame.awayScore != null
                ? lastGame.homeScore + lastGame.awayScore
                : null);
            actualSecondary = stats.threePointersMade;
          } else {
            // MLB: runs = combined score; strikeouts from MLB Stats API
            actualPrimary =
              lastGame.homeScore != null && lastGame.awayScore != null
                ? lastGame.homeScore + lastGame.awayScore
                : null;
            actualSecondary = await fetchSingleGameStrikeouts(lastGame, periodDates[0]!);
          }
        }
      } catch {
        // Actuals unavailable — tied players will share ranks
      }
    }

    // Fetch tiebreaker guesses for tied players only
    const tiedUserIds = [...scoreGroupMap.values()]
      .filter((g) => g.length > 1)
      .flatMap((g) => g.map((p) => p.userId));
    if (tiedUserIds.length > 0) {
      const sport = pool.sport as string;
      const tieEntries = await db
        .select({
          userId: entriesTable.userId,
          tiebreakerRuns: entriesTable.tiebreakerRuns,
          tiebreakerStrikeouts: entriesTable.tiebreakerStrikeouts,
          tiebreakerShotsOnGoal: entriesTable.tiebreakerShotsOnGoal,
          tiebreakerPenaltyMinutes: entriesTable.tiebreakerPenaltyMinutes,
          tiebreakerPoints: entriesTable.tiebreakerPoints,
          tiebreakerThrees: entriesTable.tiebreakerThrees,
        })
        .from(entriesTable)
        .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, tiedUserIds)));

      for (const e of tieEntries) {
        if (sport === "nhl") {
          primaryGuessMap.set(e.userId, e.tiebreakerShotsOnGoal ?? null);
          secondaryGuessMap.set(e.userId, e.tiebreakerPenaltyMinutes ?? null);
        } else if (sport === "nba") {
          primaryGuessMap.set(e.userId, e.tiebreakerPoints ?? null);
          secondaryGuessMap.set(e.userId, e.tiebreakerThrees ?? null);
        } else {
          primaryGuessMap.set(e.userId, e.tiebreakerRuns ?? null);
          secondaryGuessMap.set(e.userId, e.tiebreakerStrikeouts ?? null);
        }
      }
    }
  }

  // Iteratively split a tied group using resolveSequentialTiebreaker so we get
  // a fully ordered list of sub-groups (not just the top winner set).
  function splitGroupSequentially(tiedIds: number[]): number[][] {
    const result: number[][] = [];
    let remaining = [...tiedIds];
    while (remaining.length > 0) {
      if (remaining.length === 1) { result.push(remaining); break; }
      const winnerSet = resolveSequentialTiebreaker(
        remaining, primaryGuessMap, secondaryGuessMap, actualPrimary, actualSecondary,
      );
      if (winnerSet === null) { result.push(remaining); break; } // irresolvable co-group
      result.push([...winnerSet]);
      remaining = remaining.filter((id) => !winnerSet.has(id));
    }
    return result;
  }

  // Build final ranked players — sequential tiebreaker applied within each score group
  const players: Array<BaseEntry & { rank: number; potSplit: boolean }> = [];
  let currentRank = 1;
  const sortedGroups = [...scoreGroupMap.entries()].sort(([a], [b]) => b - a);
  for (const [, group] of sortedGroups) {
    if (group.length === 1) {
      players.push({ ...group[0], rank: currentRank, potSplit: false });
      currentRank++;
      continue;
    }
    // Apply sequential tiebreaker: returns ordered sub-groups
    const subGroups = splitGroupSequentially(group.map((p) => p.userId));
    for (const subGroup of subGroups) {
      const subPlayers = subGroup.map((uid) => group.find((p) => p.userId === uid)!);
      for (const p of subPlayers) {
        players.push({ ...p, rank: currentRank, potSplit: subGroup.length > 1 });
      }
      currentRank += subGroup.length;
    }
  }

  res.json({ weekStart, weekEnd, weekLabel, isCurrentWeek, players });
});

// ── GET /api/pools/:poolId/crazy-eights/tiebreaker-summary ───────────────────
// Returns tiebreaker actuals + per-player guesses/deltas for closed crazy_8s pools.
// hadTiebreaker = false when no tied score groups existed (no tiebreaker was needed).
router.get("/tiebreaker-summary", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "crazy_8s") { res.status(400).json({ error: "Not a crazy_8s pool" }); return; }

  const [entry] = await db.select({ id: entriesTable.id }).from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId))).limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  // Pool still active → no tiebreaker summary yet
  if (pool.isActive) { res.json({ hadTiebreaker: false }); return; }

  // 1. Get all entries with tiebreaker guesses and user info
  const [allEntries, allPicks] = await Promise.all([
    db.select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      tiebreakerRuns: entriesTable.tiebreakerRuns,
      tiebreakerStrikeouts: entriesTable.tiebreakerStrikeouts,
      tiebreakerShotsOnGoal: entriesTable.tiebreakerShotsOnGoal,
      tiebreakerPenaltyMinutes: entriesTable.tiebreakerPenaltyMinutes,
      tiebreakerPoints: entriesTable.tiebreakerPoints,
      tiebreakerThrees: entriesTable.tiebreakerThrees,
    }).from(entriesTable)
      .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
      .where(eq(entriesTable.poolId, poolId)),
    db.select({
      userId: pickemPicksTable.userId,
      confidencePoints: pickemPicksTable.confidencePoints,
      result: pickemPicksTable.result,
      gameDate: pickemPicksTable.gameDate,
    }).from(pickemPicksTable).where(eq(pickemPicksTable.poolId, poolId)),
  ]);

  if (allPicks.length === 0) { res.json({ hadTiebreaker: false }); return; }

  // 2. Compute per-user confidence-point totals and collect period dates
  const scoreByUser = new Map<number, number>();
  const periodDates = new Set<string>();
  for (const pick of allPicks) {
    periodDates.add(pick.gameDate);
    if (!scoreByUser.has(pick.userId)) scoreByUser.set(pick.userId, 0);
    if (pick.result === "correct" && pick.confidencePoints != null) {
      scoreByUser.set(pick.userId, scoreByUser.get(pick.userId)! + Number(pick.confidencePoints));
    }
  }

  // 3. Detect tied groups (players sharing the same score total)
  const scoreGroups = new Map<number, number[]>();
  for (const [uid, score] of scoreByUser.entries()) {
    if (!scoreGroups.has(score)) scoreGroups.set(score, []);
    scoreGroups.get(score)!.push(uid);
  }
  const tiedUserIds: number[] = [];
  for (const group of scoreGroups.values()) {
    if (group.length > 1) tiedUserIds.push(...group);
  }
  if (tiedUserIds.length === 0) { res.json({ hadTiebreaker: false }); return; }

  // 4. Re-fetch period games to identify the last completed tiebreaker game
  //    (same "last completed game" logic as resolveCrazyEightsPeriod)
  const sport = pool.sport as string;
  const sortedDates = [...periodDates].sort();
  const espnSport = sport === "nhl" ? "nhl" : sport === "nba" ? "nba" : "mlb";
  const dayGameArrays = await Promise.all(
    sortedDates.map(d => fetchGamesForDate(espnSport, d.replace(/-/g, "")))
  );
  const allGames = dayGameArrays.flat();
  const completedGames = allGames
    .filter(g => g.isCompleted && g.homeScore != null && g.awayScore != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const lastGame = completedGames.at(-1) ?? null;

  // 5. Fetch actual tiebreaker stats from ESPN / MLB Stats API
  let actualStat1: number | null = null;
  let actualStat2: number | null = null;

  if (lastGame) {
    if (sport === "nhl") {
      const stats = await fetchNhlTiebreakerStats(lastGame.id);
      actualStat1 = stats.shotsOnGoal;
      actualStat2 = stats.penaltyMinutes;
    } else if (sport === "nba") {
      const stats = await fetchNbaTiebreakerStats(lastGame.id);
      actualStat1 = stats.totalPoints ??
        (lastGame.homeScore != null && lastGame.awayScore != null
          ? lastGame.homeScore + lastGame.awayScore
          : null);
      actualStat2 = stats.threePointersMade;
    } else {
      // MLB: runs = combined score; strikeouts from MLB Stats API
      actualStat1 = lastGame.homeScore != null && lastGame.awayScore != null
        ? lastGame.homeScore + lastGame.awayScore
        : null;
      actualStat2 = await fetchSingleGameStrikeouts(lastGame, sortedDates[0]!);
    }
  }

  // 6. Build per-player guesses and deltas for all tied players
  const entryMap = new Map(allEntries.map(e => [e.userId, e]));
  const tiedPlayers = tiedUserIds
    .map(uid => {
      const e = entryMap.get(uid);
      if (!e) return null;
      let stat1Guess: number | null = null;
      let stat2Guess: number | null = null;
      if (sport === "nhl") {
        stat1Guess = e.tiebreakerShotsOnGoal ?? null;
        stat2Guess = e.tiebreakerPenaltyMinutes ?? null;
      } else if (sport === "nba") {
        stat1Guess = e.tiebreakerPoints ?? null;
        stat2Guess = e.tiebreakerThrees ?? null;
      } else {
        stat1Guess = e.tiebreakerRuns ?? null;
        stat2Guess = e.tiebreakerStrikeouts ?? null;
      }
      const diff1 = stat1Guess != null && actualStat1 != null ? Math.abs(stat1Guess - actualStat1) : null;
      const diff2 = stat2Guess != null && actualStat2 != null ? Math.abs(stat2Guess - actualStat2) : null;
      return {
        userId: e.userId,
        username: e.username,
        displayName: e.displayName ?? null,
        stat1Guess,
        stat2Guess,
        diff1,
        diff2,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  res.json({ hadTiebreaker: true, actualStat1, actualStat2, tiedPlayers });
});

export default router;
