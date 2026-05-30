import { Router } from "express";
import { db } from "@workspace/db";
import { poolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  getMlbWeekBounds,
  fetchMlbWeekGames,
  fetchGamesForDate,
  getTodayEtDate,
  formatDateEt,
  getDailyPickDeadline,
  isDailyPickDeadlinePassed,
  type EspnGame,
} from "../lib/espn";

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

// GET /api/pools/:poolId/schedule/daily — today's MLB slate for daily pick pools
router.get("/daily", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const todayEt = getTodayEtDate();
  const todayEspn = formatDateEt(new Date());

  const games = await fetchGamesForDate("mlb", todayEspn);
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
  const label = fmt.format(new Date());

  res.json({
    date: todayEt,
    label,
    deadline: deadline?.toISOString() ?? null,
    deadlinePassed,
    firstGameTime,
    currentDay: pool.currentWeek,
    games: games.map(g => formatGame(g, pool.sport, pool.currentWeek, pool.season)),
  });
});

export default router;
