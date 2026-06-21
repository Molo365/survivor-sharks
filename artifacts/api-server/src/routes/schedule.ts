import { Router } from "express";
import { db } from "@workspace/db";
import { poolsTable, usersTable, sandboxGameScoresTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  getMlbWeekBounds,
  fetchMlbWeekGames,
  fetchGamesForDate,
  fetchNflGamesByWeek,
  getTodayEtDate,
  formatDateEt,
  getDailyPickDeadline,
  isDailyPickDeadlinePassed,
  type EspnGame,
} from "../lib/espn";
import { getSandboxGamesForWeek, NFL_TEAM_INFO } from "../lib/nfl2025Schedule";

const router = Router({ mergeParams: true });

function formatTeam(t: EspnGame["homeTeam"], sport: string) {
  return {
    id: t.id,
    name: t.displayName,
    abbreviation: t.abbreviation,
    sport,
    logoUrl: t.logo ?? null,
    location: null,
    conference: null,
    division: null,
    flagUrl: null,
  };
}

function formatPitcher(sp: EspnGame["homeStartingPitcher"]) {
  if (!sp) return null;
  return { name: sp.name, photoUrl: null, era: sp.era, wins: sp.wins, losses: sp.losses };
}

function formatGame(g: EspnGame, sport: string, week: number, season: number) {
  return {
    id: g.id,
    sport,
    homeTeam: formatTeam(g.homeTeam, sport),
    awayTeam: formatTeam(g.awayTeam, sport),
    startTime: g.date,
    week,
    season,
    status: g.status,
    hasStarted: g.hasStarted,
    homeScore: g.homeScore ?? null,
    awayScore: g.awayScore ?? null,
    homeRecord: g.homeRecord ?? null,
    awayRecord: g.awayRecord ?? null,
    odds: null,
    awayMoneyline: null,
    homeMoneyline: null,
    awayPrimaryColor: null,
    homePrimaryColor: null,
    awayAlternateColor: null,
    homeAlternateColor: null,
    weather: null,
    liveState: g.liveState ?? null,
    awayPitcher: formatPitcher(g.awayStartingPitcher),
    homePitcher: formatPitcher(g.homeStartingPitcher),
    awayInjuries: [],
    homeInjuries: [],
    awayForm: [],
    homeForm: [],
  };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// GET /api/pools/:poolId/schedule
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  // ── NFL Sandbox path ─────────────────────────────────────────────────────
  if (pool.sport === "nfl" && pool.sandboxMode) {
    const week = pool.currentWeek;
    const sandboxGames = getSandboxGamesForWeek(week);
    const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500";

    // Load any scores stored by simulate-grading so graded cards show final scores.
    const storedScoreRows = await db
      .select()
      .from(sandboxGameScoresTable)
      .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, week)));
    const storedScores = new Map(storedScoreRows.map(r => [r.gameId, { homeScore: r.homeScore, awayScore: r.awayScore }]));

    // Group by date
    const byDate = new Map<string, typeof sandboxGames>();
    for (const g of sandboxGames) {
      const date = g.gameTime.slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(g);
    }
    const sortedDates = Array.from(byDate.keys()).sort();

    const days = sortedDates.map(dateStr => {
      const [yr, mo, dy] = dateStr.split("-").map(Number);
      const dtForLabel = new Date(Date.UTC(yr, mo - 1, dy, 17, 0, 0));
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
      return {
        date: dateStr,
        label: fmt.format(dtForLabel),
        games: byDate.get(dateStr)!.map(g => {
          const awayInfo = NFL_TEAM_INFO[g.awayAbbr];
          const homeInfo = NFL_TEAM_INFO[g.homeAbbr];
          const scored = storedScores.get(g.id);
          return {
            id: g.id,
            sport: "nfl",
            awayTeam: { id: g.awayTeamId, name: awayInfo?.displayName ?? g.awayAbbr, abbreviation: g.awayAbbr, sport: "nfl", logoUrl: `${LOGO_BASE}/${g.awayAbbr.toLowerCase()}.png`, location: null, conference: null, division: null, flagUrl: null },
            homeTeam: { id: g.homeTeamId, name: homeInfo?.displayName ?? g.homeAbbr, abbreviation: g.homeAbbr, sport: "nfl", logoUrl: `${LOGO_BASE}/${g.homeAbbr.toLowerCase()}.png`, location: null, conference: null, division: null, flagUrl: null },
            startTime: g.gameTime,
            week,
            season: pool.season,
            status: scored ? "final" : "scheduled",
            hasStarted: scored ? true : false,
            homeScore: scored?.homeScore ?? null,
            awayScore: scored?.awayScore ?? null,
            homeRecord: null,
            awayRecord: null,
            odds: null,
            awayMoneyline: null,
            homeMoneyline: null,
            awayPrimaryColor: null,
            homePrimaryColor: null,
            awayAlternateColor: null,
            homeAlternateColor: null,
            weather: null,
            liveState: null,
            awayPitcher: null,
            homePitcher: null,
            awayInjuries: [],
            homeInjuries: [],
            awayForm: [],
            homeForm: [],
          };
        }),
      };
    });

    const farFuture = "2099-01-01T00:00:00.000Z";
    res.json({
      weekLabel: `Week ${week} — Sandbox`,
      weekStart: sortedDates[0] ? `${sortedDates[0]}T00:00:00.000Z` : farFuture,
      weekEnd: sortedDates[sortedDates.length - 1] ? `${sortedDates[sortedDates.length - 1]}T23:59:59.000Z` : farFuture,
      deadline: farFuture,
      deadlinePassed: false,
      currentWeek: week,
      days,
    });
    return;
  }

  // ── NFL live path (non-sandbox) ───────────────────────────────────────────
  if (pool.sport === "nfl") {
    const week = pool.currentWeek;
    const nflGames = await fetchNflGamesByWeek(week, pool.season);

    const byDate = new Map<string, EspnGame[]>();
    for (const g of nflGames) {
      const dateStr = g.date.slice(0, 10);
      if (!byDate.has(dateStr)) byDate.set(dateStr, []);
      byDate.get(dateStr)!.push(g);
    }
    const sortedDates = Array.from(byDate.keys()).sort();

    const days = sortedDates.map(dateStr => {
      const [yr, mo, dy] = dateStr.split("-").map(Number);
      const dtForLabel = new Date(Date.UTC(yr!, mo! - 1, dy!, 17, 0, 0));
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
      return {
        date: dateStr,
        label: fmt.format(dtForLabel),
        games: (byDate.get(dateStr) ?? []).map(g => formatGame(g, "nfl", week, pool.season)),
      };
    });

    const farFuture = "2099-01-01T00:00:00.000Z";
    res.json({
      weekLabel: `Week ${week}`,
      weekStart: sortedDates[0] ? `${sortedDates[0]}T00:00:00.000Z` : farFuture,
      weekEnd: sortedDates[sortedDates.length - 1] ? `${sortedDates[sortedDates.length - 1]}T23:59:59.000Z` : farFuture,
      deadline: farFuture,
      deadlinePassed: false,
      currentWeek: week,
      days,
    });
    return;
  }

  const bounds = getMlbWeekBounds(pool.createdAt, pool.currentWeek);

  // Fetch all MLB games for the week (7 parallel ESPN calls)
  const allGames = await fetchMlbWeekGames(bounds.espnDates);

  // Group games by ET date string (YYYY-MM-DD)
  const gamesByDate = new Map<string, EspnGame[]>();
  for (const dateStr of bounds.days) {
    gamesByDate.set(dateStr, []);
  }

  for (const g of allGames) {
    // Determine ET date of game start
    const ET_OFFSET_MS = 4 * 60 * 60 * 1000;
    const etMs = new Date(g.date).getTime() - ET_OFFSET_MS;
    const etDate = new Date(etMs);
    const year = etDate.getUTCFullYear();
    const month = String(etDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(etDate.getUTCDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    if (gamesByDate.has(dateStr)) {
      gamesByDate.get(dateStr)!.push(g);
    }
  }

  // Sort games within each day by start time
  for (const [, games] of gamesByDate) {
    games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Build day schedule entries
  const days = bounds.days.map(dateStr => {
    const [yearStr, monthStr, dayStr] = dateStr.split("-");
    // Build Date object for ET midnight → UTC
    const ET_OFFSET_MS = 4 * 60 * 60 * 1000;
    const etMidnight = new Date(`${yearStr}-${monthStr}-${dayStr}T00:00:00Z`);
    const utcDate = new Date(etMidnight.getTime() + ET_OFFSET_MS);
    const dow = utcDate.getUTCDay();
    const dayName = DAY_NAMES[dow] ?? "";

    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "long",
      day: "numeric",
    });
    const label = `${dayName}, ${fmt.format(utcDate)}`;

    const games = (gamesByDate.get(dateStr) ?? []).map(g =>
      formatGame(g, pool.sport, pool.currentWeek, pool.season)
    );

    return { date: dateStr, label, games };
  });

  res.json({
    weekLabel: bounds.weekLabel,
    weekStart: bounds.weekStart.toISOString(),
    weekEnd: bounds.weekEnd.toISOString(),
    deadline: bounds.deadline.toISOString(),
    deadlinePassed: bounds.deadlinePassed,
    currentWeek: pool.currentWeek,
    days,
  });
});

// GET /api/pools/:poolId/schedule/daily — MLB slate for a given ET date (defaults to today)
router.get("/daily", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const todayEt = getTodayEtDate();
  const dateParam = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : todayEt;

  // Convert YYYY-MM-DD → YYYYMMDD for the ESPN API
  const espnDate = dateParam.replace(/-/g, "");

  const games = await fetchGamesForDate("mlb", espnDate);
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const deadline = getDailyPickDeadline(games);
  const deadlinePassed = isDailyPickDeadlinePassed(games);
  const firstGameTime = games.length > 0 ? games[0].date : null;

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  // Build a noon-ET timestamp for the selected date so the label is always correct
  const [yr, mo, dy] = dateParam.split("-").map(Number);
  const dateForLabel = new Date(Date.UTC(yr, mo - 1, dy, 17, 0, 0)); // 17:00 UTC = noon EDT
  const label = fmt.format(dateForLabel);

  res.json({
    date: dateParam,
    label,
    deadline: deadline?.toISOString() ?? null,
    deadlinePassed,
    firstGameTime,
    currentDay: pool.currentWeek,
    games: games.map(g => formatGame(g, pool.sport, pool.currentWeek, pool.season)),
  });
});

// PATCH /api/pools/:poolId/schedule/sandbox-week — set sandbox week (admin/commissioner only)
router.patch("/sandbox-week", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (pool.commissionerId !== userId && userRow?.role !== "admin") {
    res.status(403).json({ error: "Commissioner or admin only" }); return;
  }

  const week = Math.max(1, Math.min(18, parseInt(String(req.body.week)) || 1));
  // Write both so currentWeek is always the authoritative source of truth.
  // sandboxWeek stays in sync as a mirror; all consumers read currentWeek directly.
  await db.update(poolsTable).set({ sandboxWeek: week, currentWeek: week }).where(eq(poolsTable.id, poolId));
  res.json({ week });
});

export default router;
