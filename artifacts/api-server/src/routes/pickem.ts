import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, usersTable, entriesTable, sandboxGameScoresTable, pickemGameSpreadsTable } from "@workspace/db";
import { eq, and, sql, gte, lte, inArray, count } from "drizzle-orm";
import { calcPrize } from "../lib/prizeCalc";
import { resolveSequentialTiebreaker } from "../lib/tiebreaker";
import { NFL_TEAM_INFO } from "../lib/nfl2025Schedule";
import { requireAuth } from "../middlewares/auth";
import {
  fetchGamesForDate,
  fetchSuperLeagueGamesForDate,
  fetchIntlGamesForDate,
  fetchNhlGamesByWeek,
  fetchNbaGamesByWeek,
  getNhlWeekBounds,
  NHL_SANDBOX_ANCHOR,
  getNbaWeekBounds,
  getNbaWeekendBounds,
  NBA_SANDBOX_ANCHOR,
  getTodayEtDate,
  formatDateEt,
  getSuperLeagueWeekBoundsEt,
  type EspnGame,
} from "../lib/espn";
import { fetchDailyStrikeouts } from "../lib/mlb-stats";
import { fetchNhlTiebreakerStats } from "../lib/nhl-stats";
import {
  fetchWcSchedule,
  WC_PHASES,
  type WcPhase,
} from "../lib/wc";

const router = Router({ mergeParams: true });

const WC_PICK_OPTIONS = ["home_win", "draw", "away_win"] as const;
type WcPickOption = (typeof WC_PICK_OPTIONS)[number];

const WC_PICK_LABELS: Record<WcPickOption, string> = {
  home_win: "Home Win",
  draw: "Draw",
  away_win: "Away Win",
};

/** 5-minute pregame lock */
function isGameLocked(gameStartIso: string): boolean {
  return new Date(gameStartIso).getTime() - 5 * 60 * 1000 <= Date.now();
}

function wcOutcome(homeScore: number, awayScore: number): WcPickOption {
  if (homeScore > awayScore) return "home_win";
  if (awayScore > homeScore) return "away_win";
  return "draw";
}

// GET /api/pools/:poolId/pickem/games
router.get("/games", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem" && (pool.poolType as string) !== "crazy_8s" && (pool.poolType as string) !== "nba_ats") { res.status(400).json({ error: "This pool is not a Pick-Em pool" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const sport = pool.sport as string;
  const isWc = sport === "worldcup";
  const isIntl = sport === "intl";
  const isMls = sport === "mls" || sport === "superleague";
  const is3way = isWc || isIntl || isMls;
  const isAts = (pool.poolType as string) === "nba_ats";
  const todayEt = getTodayEtDate();

  // Accept an optional ?date=YYYY-MM-DD param; fall back to today
  const rawDate = typeof req.query.date === "string" ? req.query.date : null;
  const requestedDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayEt;
  const espnDate = requestedDate.replace(/-/g, "");

  let allGames = isIntl
    ? await fetchIntlGamesForDate(espnDate)
    : sport === "superleague"
      ? await fetchSuperLeagueGamesForDate(espnDate)
      : await fetchGamesForDate(sport, espnDate);
  allGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Sandbox mode for NHL weekly Pick'em: map the requested day-of-week onto the anchor week
  // and suppress real ESPN scores until simulate-grading runs.
  let sandboxScoreMap = new Map<string, { homeScore: number; awayScore: number }>();
  if (pool.sandboxMode && sport === "nhl" && pool.pickFrequency === "weekly") {
    const [ry2, rm2, rd2] = requestedDate.split("-").map(Number);
    const dow = new Date(Date.UTC(ry2, rm2 - 1, rd2)).getUTCDay(); // 0=Sun…6=Sat
    const mondayOffset = dow === 0 ? 6 : dow - 1; // Mon=0…Sun=6
    const anchorBounds = getNhlWeekBounds(NHL_SANDBOX_ANCHOR, pool.currentWeek);
    const sandboxDayDate = new Date(anchorBounds.weekStart.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
    const sandboxDay = sandboxDayDate.toISOString().slice(0, 10); // YYYY-MM-DD
    allGames = await fetchGamesForDate("nhl", sandboxDay.replace(/-/g, ""));
    allGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sbRows = await db.select().from(sandboxGameScoresTable)
      .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, pool.currentWeek)));
    sandboxScoreMap = new Map(sbRows.map(r => [r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 }]));
  }

  // Sandbox mode for NBA weekly Pick'em: same day-of-week mapping onto the anchor week.
  // nba_ats pools skip this block — their sandboxScoreMap is populated in the isAts block below
  // after allGames is built from the full weekend slate, so game IDs match correctly.
  if (pool.sandboxMode && sport === "nba" && pool.pickFrequency === "weekly" && !isAts) {
    const [ry2, rm2, rd2] = requestedDate.split("-").map(Number);
    const dow = new Date(Date.UTC(ry2, rm2 - 1, rd2)).getUTCDay(); // 0=Sun…6=Sat
    const mondayOffset = dow === 0 ? 6 : dow - 1; // Mon=0…Sun=6
    const anchorBounds = getNbaWeekBounds(NBA_SANDBOX_ANCHOR, pool.currentWeek);
    const sandboxDayDate = new Date(anchorBounds.weekStart.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
    const sandboxDay = sandboxDayDate.toISOString().slice(0, 10); // YYYY-MM-DD
    allGames = await fetchGamesForDate("nba", sandboxDay.replace(/-/g, ""));
    allGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sbRows = await db.select().from(sandboxGameScoresTable)
      .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, pool.currentWeek)));
    sandboxScoreMap = new Map(sbRows.map(r => [r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 }]));
  }

  // ATS: replace allGames with the full Fri/Sat/Sun weekend slate (ignore date param)
  const atsGameDates = new Map<string, string>(); // gameId → ET calendar date, e.g. "2026-01-03"
  if (isAts) {
    const anchor = pool.sandboxMode ? NBA_SANDBOX_ANCHOR : pool.createdAt;
    const { espnDates, days } = getNbaWeekendBounds(anchor, pool.currentWeek);
    const results = await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d)));
    const seen = new Set<string>();
    allGames = [];
    results.forEach((dayGames, i) => {
      for (const g of dayGames) {
        if (!seen.has(g.id)) {
          seen.add(g.id);
          allGames.push(g);
          atsGameDates.set(g.id, days[i]!);
        }
      }
    });
    allGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // ATS sandbox: build the score map from sandboxGameScoresTable now that allGames (and
    // its game IDs) reflect the real weekend slate. Must run after allGames is populated
    // so sandboxScoreMap keys match the games the client will see.
    if (pool.sandboxMode) {
      const sbRows = await db
        .select()
        .from(sandboxGameScoresTable)
        .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, pool.currentWeek)));
      sandboxScoreMap = new Map(sbRows.map((r) => [r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 }]));
    }
  }

  // ATS: load commissioner-entered spread lines for the current week
  const atsSpreadByGameId = new Map<string, { spread: number; favoriteTeamId: string }>();
  if (isAts) {
    const spreadRows = await db
      .select()
      .from(pickemGameSpreadsTable)
      .where(and(eq(pickemGameSpreadsTable.poolId, poolId), eq(pickemGameSpreadsTable.week, pool.currentWeek)));
    for (const row of spreadRows) {
      atsSpreadByGameId.set(row.gameId, { spread: row.spread, favoriteTeamId: row.favoriteTeamId });
    }
  }

  const games = allGames.filter((g) => g.status !== "suspended");

  // ATS: query picks by week (the slate spans Fri/Sat/Sun — not a single date)
  const existingPicks = isAts
    ? await db
        .select()
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, poolId),
            eq(pickemPicksTable.userId, userId),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        )
    : await db
        .select()
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, poolId),
            eq(pickemPicksTable.userId, userId),
            eq(pickemPicksTable.gameDate, requestedDate),
          ),
        );

  const pickMap = new Map(existingPicks.map((p) => [p.gameId, p]));

  const isSandboxNhl = pool.sandboxMode && sport === "nhl" && pool.pickFrequency === "weekly";
  const isSandboxNba = pool.sandboxMode && sport === "nba" && pool.pickFrequency === "weekly";
  const isSandboxWeekly = isSandboxNhl || isSandboxNba;

  const formattedGames = games.map((g, idx) => {
    const existing = pickMap.get(g.id);
    const sbScore = sandboxScoreMap.get(g.id);
    // In sandbox mode: locked iff the game has been graded (score exists). Otherwise always unlocked.
    const locked = isSandboxWeekly ? sbScore != null : isGameLocked(g.date);
    const base = {
      id: g.id,
      startTime: g.date,
      status: isSandboxWeekly ? (sbScore ? "final" : "scheduled") : g.status,
      deadlinePassed: locked,
      isTiebreakerGame: !is3way && (
        (sport === "mlb" && idx === games.length - 1) ||
        (sport === "nhl" && pool.pickFrequency === "weekly" && requestedDate === getWeekBoundsEt(requestedDate).weekEnd && idx === games.length - 1)
      ),
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
      awayScore: isSandboxWeekly ? (sbScore?.awayScore ?? null) : (g.awayScore ?? null),
      homeScore: isSandboxWeekly ? (sbScore?.homeScore ?? null) : (g.homeScore ?? null),
      userPickTeamId: is3way ? null : (existing?.pickedTeamId ?? null),
      userPickResult: existing?.result ?? null,
      liveDetail: g.liveState?.shortDetail ?? null,
      liveOuts: null as number | null,
      liveBaseRunners: null as { onFirst: boolean; onSecond: boolean; onThird: boolean } | null,
      homeRecord: g.homeRecord ?? null,
      awayRecord: g.awayRecord ?? null,
      homePitcher: null as null,
      awayPitcher: null as null,
      pickOptions: is3way ? WC_PICK_OPTIONS.map(id => id) : null,
      userPickOption: is3way ? (existing?.pickedTeamId ?? null) : null,
      // ATS-specific fields (null for non-ATS pools)
      etDate: isAts ? (atsGameDates.get(g.id) ?? null) : null,
      spread: isAts ? (atsSpreadByGameId.get(g.id)?.spread ?? null) : null,
      favoriteTeamId: isAts ? (atsSpreadByGameId.get(g.id)?.favoriteTeamId ?? null) : null,
    };

    if (!is3way) {
      return {
        ...base,
        liveOuts: g.liveState?.outs ?? null,
        liveBaseRunners: g.liveState
          ? { onFirst: g.liveState.onFirst, onSecond: g.liveState.onSecond, onThird: g.liveState.onThird }
          : null,
        homePitcher: g.homeStartingPitcher
          ? { name: g.homeStartingPitcher.name, photoUrl: null, era: g.homeStartingPitcher.era, wins: g.homeStartingPitcher.wins, losses: g.homeStartingPitcher.losses }
          : null as any,
        awayPitcher: g.awayStartingPitcher
          ? { name: g.awayStartingPitcher.name, photoUrl: null, era: g.awayStartingPitcher.era, wins: g.awayStartingPitcher.wins, losses: g.awayStartingPitcher.losses }
          : null as any,
      };
    }
    return base;
  });

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Sandbox NHL: deadline passed iff every game has been graded (score in sandboxGameScoresTable).
  // Live: past dates are always locked; present/future check actual game times.
  const isPastDate = requestedDate < todayEt;
  const slateDeadlinePassed = isSandboxWeekly
    ? games.every(g => sandboxScoreMap.has(g.id))
    : isAts
    // ATS: slate is only fully locked once EVERY game has started (not just one)
    ? games.length > 0 && games.every((g) => isGameLocked(g.date))
    : isPastDate || (games.length > 0 && games.some((g) => isGameLocked(g.date)));

  // Format the label from the requested date (not always "today")
  const [ry, rm, rd] = requestedDate.split("-").map(Number);
  const labelDate = new Date(Date.UTC(ry, rm - 1, rd, 12, 0, 0)); // noon UTC → any ET offset lands on correct day
  const label = fmt.format(labelDate);

  // Phase: only meaningful for WC pools
  const phase = isWc ? (WC_PHASES.group_stage.start <= requestedDate && requestedDate <= WC_PHASES.group_stage.end
    ? "group_stage"
    : WC_PHASES.knockout_stage.start <= requestedDate && requestedDate <= WC_PHASES.knockout_stage.end
      ? "knockout_stage"
      : null) : null;

  // A non-recurring pool that has already finished: flag as closed so the
  // frontend can show a permanent "pool ended" read-only state instead of a picks UI.
  // Applies to all sports/frequencies (daily MLB, weekly MLB, etc.).
  const isMlbDaily = sport === "mlb" && pool.pickFrequency === "daily";
  const poolClosed = !pool.isActive && !pool.isRecurring;

  res.json({
    date: requestedDate,
    label,
    deadlinePassed: poolClosed ? true : slateDeadlinePassed,
    poolClosed: poolClosed || undefined,
    isRecurring: isMlbDaily ? pool.isRecurring : undefined,
    sport,
    phase,
    games: formattedGames,
  });
});

/**
 * Fetch MLS games for the full Mon–Sun week starting at weekStart, grouped by ET date.
 * Days with no games are excluded from the result. De-duplicates game IDs across days.
 * @param weekStart  Monday date string "YYYY-MM-DD"
 */
async function fetchMlsWeekDays(weekStart: string): Promise<{ date: string; games: EspnGame[] }[]> {
  const [wy, wm, wd] = weekStart.split("-").map(Number);
  const weekMonday = new Date(Date.UTC(wy!, wm! - 1, wd!));
  const dates = Array.from({ length: 7 }, (_, i) =>
    new Date(weekMonday.getTime() + i * 86_400_000).toISOString().slice(0, 10),
  );
  const results = await Promise.all(
    dates.map((d) => fetchGamesForDate("mls", d.replace(/-/g, ""))),
  );
  const seen = new Set<string>();
  return dates
    .map((date, i) => ({
      date,
      games: (results[i] ?? [])
        .filter((g) => { if (seen.has(g.id)) return false; seen.add(g.id); return true; })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    }))
    .filter((day) => day.games.length > 0);
}

// Same structure as fetchMlsWeekDays but fetches one Friday–Monday Super League
// slate. The sport-specific fetcher applies the team allow-list and day guard.
async function fetchSlWeekDays(weekStart: string): Promise<{ date: string; games: EspnGame[] }[]> {
  const [wy, wm, wd] = weekStart.split("-").map(Number);
  const friday = new Date(Date.UTC(wy!, wm! - 1, wd!));
  const dates = Array.from({ length: 4 }, (_, i) =>
    new Date(friday.getTime() + i * 86_400_000).toISOString().slice(0, 10),
  );
  const results = await Promise.all(
    dates.map((d) => fetchSuperLeagueGamesForDate(d.replace(/-/g, ""))),
  );
  const seen = new Set<string>();
  return dates
    .map((date, i) => ({
      date,
      games: (results[i] ?? [])
        .filter((g) => { if (seen.has(g.id)) return false; seen.add(g.id); return true; })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    }))
    .filter((day) => day.games.length > 0);
}

// GET /api/pools/:poolId/pickem/week-games
// Returns the full Mon–Sun MLS slate or Fri–Mon Super League slate, grouped by day.
// Only days that have at least one game are included. Game shape matches GET /pickem/games.
router.get("/week-games", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.sport !== "mls" && pool.sport !== "superleague") || pool.pickFrequency !== "weekly") {
    res.status(400).json({ error: "This endpoint is only for MLS or Super League weekly pick-em pools" });
    return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const todayEt = getTodayEtDate();
  const { weekStart, weekEnd } = pool.sport === "superleague"
    ? getSuperLeagueWeekBoundsEt(todayEt)
    : getWeekBoundsEt(todayEt);

  // Fetch the sport's complete active window in parallel; empty days are excluded.
  const weekDays = pool.sport === "superleague"
    ? await fetchSlWeekDays(weekStart)
    : await fetchMlsWeekDays(weekStart);

  // Load the requesting user's picks for the entire week in one query.
  const weekPicks = await db
    .select()
    .from(pickemPicksTable)
    .where(and(
      eq(pickemPicksTable.poolId, poolId),
      eq(pickemPicksTable.userId, userId),
      gte(pickemPicksTable.gameDate, weekStart),
      lte(pickemPicksTable.gameDate, weekEnd),
    ));
  const pickMap = new Map(weekPicks.map((p) => [p.gameId, p]));

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const days = weekDays.map(({ date, games }) => {
    const [ry, rm, rd] = date.split("-").map(Number);
    const labelDate = new Date(Date.UTC(ry!, rm! - 1, rd!, 12, 0, 0));
    const label = fmt.format(labelDate);

    return {
      date,
      label,
      games: games.map((g) => {
        const existing = pickMap.get(g.id);
        const locked = isGameLocked(g.date);
        return {
          id: g.id,
          startTime: g.date,
          status: g.status,
          deadlinePassed: locked,
          isTiebreakerGame: false,
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
          userPickTeamId: null as string | null,
          userPickResult: existing?.result ?? null,
          liveDetail: g.liveState?.shortDetail ?? null,
          liveOuts: null as number | null,
          liveBaseRunners: null as { onFirst: boolean; onSecond: boolean; onThird: boolean } | null,
          homeRecord: g.homeRecord ?? null,
          awayRecord: g.awayRecord ?? null,
          homePitcher: null as null,
          awayPitcher: null as null,
          pickOptions: WC_PICK_OPTIONS.map((id) => id) as string[],
          userPickOption: existing?.pickedTeamId ?? null,
        };
      }),
    };
  });

  const poolClosed = !pool.isActive && !pool.isRecurring;
  res.json({ weekStart, weekEnd, days, poolClosed });
});

// GET /api/pools/:poolId/pickem/wc-schedule
router.get("/wc-schedule", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem" || pool.sport !== "worldcup") {
    res.status(400).json({ error: "Not a World Cup pick-em pool" }); return;
  }

  const [entry] = await db
    .select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const schedule = await fetchWcSchedule();

  // Fetch all user picks across the full group stage date range
  const allPicks = await db
    .select().from(pickemPicksTable)
    .where(and(
      eq(pickemPicksTable.poolId, poolId),
      eq(pickemPicksTable.userId, userId),
      gte(pickemPicksTable.gameDate, WC_PHASES.group_stage.start),
      lte(pickemPicksTable.gameDate, WC_PHASES.group_stage.end),
    ));

  const pickMap = new Map(allPicks.map((p) => [p.gameId, p]));
  const todayEt = getTodayEtDate();
  const phase = todayEt >= WC_PHASES.group_stage.start && todayEt <= WC_PHASES.group_stage.end
    ? "group_stage"
    : todayEt >= WC_PHASES.knockout_stage.start && todayEt <= WC_PHASES.knockout_stage.end
      ? "knockout_stage"
      : null;

  const dateGroups = schedule.map(({ dateStr, label, games }) => ({
    date: dateStr,
    label,
    games: games.map((g) => {
      const existing = pickMap.get(g.id);
      const locked = isGameLocked(g.date);
      const isPickable = !locked;

      return {
        id: g.id,
        startTime: g.date,
        status: g.status,
        deadlinePassed: locked,
        isPickable,
        group: g.groupLabel ?? null,
        awayTeam: { id: g.awayTeam.id, name: g.awayTeam.displayName, abbreviation: g.awayTeam.abbreviation, logoUrl: g.awayTeam.logo ?? null },
        homeTeam: { id: g.homeTeam.id, name: g.homeTeam.displayName, abbreviation: g.homeTeam.abbreviation, logoUrl: g.homeTeam.logo ?? null },
        awayScore: g.awayScore ?? null,
        homeScore: g.homeScore ?? null,
        userPickOption: existing?.pickedTeamId ?? null,
        userPickResult: existing?.result ?? null,
        liveDetail: g.liveDetail ?? null,
      };
    }),
  }));

  res.json({ phase, dateGroups });
});

// POST /api/pools/:poolId/pickem/picks
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const { picks, tiebreakerRuns, tiebreakerStrikeouts, tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes, date: submittedDate } = req.body as {
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string; gameDate?: string }>;
    tiebreakerRuns?: number;
    tiebreakerStrikeouts?: number;
    tiebreakerShotsOnGoal?: number;
    tiebreakerPenaltyMinutes?: number;
    date?: string;
  };

  if (!Array.isArray(picks) || picks.length === 0) {
    res.status(400).json({ error: "picks must be a non-empty array" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem" && (pool.poolType as string) !== "nba_ats") { res.status(400).json({ error: "This pool is not a Pick-Em pool" }); return; }
  if (!pool.isActive) { res.status(400).json({ error: "This pool has ended — picks are no longer accepted." }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const sport = pool.sport as string;
  const isWc = sport === "worldcup";
  const isIntl = sport === "intl";
  const isMls = sport === "mls" || sport === "superleague";
  const is3way = isWc || isIntl || isMls;
  const isAts = (pool.poolType as string) === "nba_ats";
  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();
  const superLeagueBounds = sport === "superleague" && pool.pickFrequency === "weekly"
    ? getSuperLeagueWeekBoundsEt(todayEt)
    : null;

  if (superLeagueBounds) {
    if (!submittedDate || !/^\d{4}-\d{2}-\d{2}$/.test(submittedDate)) {
      res.status(400).json({ error: "Super League weekly picks require a valid Friday–Monday slate date." });
      return;
    }
    if (submittedDate < superLeagueBounds.weekStart || submittedDate > superLeagueBounds.weekEnd) {
      res.status(400).json({
        error: `Super League picks must be within the active ${superLeagueBounds.weekStart} through ${superLeagueBounds.weekEnd} slate.`,
      });
      return;
    }
    if (picks.some((pick) => pick.gameDate !== submittedDate)) {
      res.status(400).json({ error: "Each Super League pick must use the submitted slate date." });
      return;
    }
    if (pool.isRecurring) {
      const [latestCurrentWeekPick] = await db
        .select({ gameDate: pickemPicksTable.gameDate })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, poolId),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        )
        .orderBy(sql`${pickemPicksTable.gameDate} DESC`)
        .limit(1);
      if (latestCurrentWeekPick?.gameDate) {
        const storedBounds = getSuperLeagueWeekBoundsEt(latestCurrentWeekPick.gameDate);
        if (storedBounds.weekEnd < superLeagueBounds.weekStart) {
          res.status(409).json({
            error: "The prior Super League slate is still processing. Please try again after the weekly rollover completes.",
          });
          return;
        }
      }
    }
  }

  // Build a map of all known games for validation
  const gameMap = new Map<string, { date: string }>();
  // For NHL/NBA weekly sandbox pools, the anchor date of the games being submitted
  // (e.g. "2025-10-11" for the sandbox Saturday). Set inside the matching branch below
  // and used as gameDate when storing picks so all reads can find them by game date.
  let anchorGameDate: string | null = null;

  if (isWc) {
    // For WC: use cached full schedule for validation (avoids re-fetching today only)
    const schedule = await fetchWcSchedule();
    for (const day of schedule) {
      for (const g of day.games) gameMap.set(g.id, { date: g.date });
    }
  } else if (isIntl) {
    const games = await fetchIntlGamesForDate(todayEspn);
    for (const g of games) gameMap.set(g.id, { date: g.date });
  } else if (pool.sandboxMode && sport === "nhl" && pool.pickFrequency === "weekly") {
    // Sandbox: validate against the same anchor-week day the client loaded games for.
    // Use the submitted date if present; fall back to real-world today only as a
    // last resort (keeps backwards-compat if the client omits the field).
    const baseDate = (submittedDate && /^\d{4}-\d{2}-\d{2}$/.test(submittedDate)) ? submittedDate : todayEt;
    const [ry2, rm2, rd2] = baseDate.split("-").map(Number);
    const dow = new Date(Date.UTC(ry2, rm2 - 1, rd2)).getUTCDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const anchorBounds = getNhlWeekBounds(NHL_SANDBOX_ANCHOR, pool.currentWeek);
    const sandboxDayDate = new Date(anchorBounds.weekStart.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
    const sandboxDay = sandboxDayDate.toISOString().slice(0, 10);
    anchorGameDate = sandboxDay;
    const anchorGames = await fetchGamesForDate("nhl", sandboxDay.replace(/-/g, ""));
    for (const g of anchorGames) gameMap.set(g.id, { date: g.date });
  } else if (pool.sandboxMode && sport === "nba" && pool.pickFrequency === "weekly" && !isAts) {
    // NBA sandbox weekly (non-ATS): map today's day-of-week onto the anchor week.
    // nba_ats sandbox pools skip this branch — they need the full weekend slate, not a
    // single day, and the isAts branch below already handles their sandbox anchor correctly.
    const baseDate = (submittedDate && /^\d{4}-\d{2}-\d{2}$/.test(submittedDate)) ? submittedDate : todayEt;
    const [ry2, rm2, rd2] = baseDate.split("-").map(Number);
    const dow = new Date(Date.UTC(ry2, rm2 - 1, rd2)).getUTCDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const anchorBounds = getNbaWeekBounds(NBA_SANDBOX_ANCHOR, pool.currentWeek);
    const sandboxDayDate = new Date(anchorBounds.weekStart.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
    const sandboxDay = sandboxDayDate.toISOString().slice(0, 10);
    anchorGameDate = sandboxDay;
    const anchorGames = await fetchGamesForDate("nba", sandboxDay.replace(/-/g, ""));
    for (const g of anchorGames) gameMap.set(g.id, { date: g.date });
  } else if (pool.sandboxMode && sport === "nfl") {
    // For NFL sandbox/replay pools, fetch games using the stored pick game dates
    // rather than today's date (which has no NFL games in the off-season).
    // Get unique game dates from the submitted picks and fetch each one.
    const uniqueDates = [...new Set(picks.map((p: { gameDate?: string }) => p.gameDate).filter(Boolean))] as string[];
    if (uniqueDates.length > 0) {
      const results = await Promise.all(
        uniqueDates.map((d: string) => fetchGamesForDate("nfl", d.replace(/-/g, "")))
      );
      for (const dayGames of results) {
        for (const g of dayGames) gameMap.set(g.id, { date: g.date });
      }
    }
    // If no gameDate supplied on picks, gameMap stays empty → picks rejected as "unknown games"
  } else if ((isMls) && pool.pickFrequency === "weekly" && !pool.sandboxMode && submittedDate && /^\d{4}-\d{2}-\d{2}$/.test(submittedDate)) {
    // Live MLS/Super League weekly: validate against the specific day the client submitted,
    // not just today. Super League's date is already constrained to its Friday–Monday slate.
    // Super League has no ESPN_ENDPOINTS key so must use its dedicated fetcher (YYYY-MM-DD).
    const games = sport === "superleague"
      ? await fetchSuperLeagueGamesForDate(submittedDate.replace(/-/g, ""))
      : await fetchGamesForDate(sport, submittedDate.replace(/-/g, ""));
    for (const g of games) gameMap.set(g.id, { date: g.date });
  } else if (isAts) {
    // NBA ATS: validate against the full Fri/Sat/Sun weekend slate for this week
    const anchor = pool.sandboxMode ? NBA_SANDBOX_ANCHOR : pool.createdAt;
    const { espnDates } = getNbaWeekendBounds(anchor, pool.currentWeek);
    const results = await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d)));
    for (const dayGames of results) {
      for (const g of dayGames) {
        if (!gameMap.has(g.id)) gameMap.set(g.id, { date: g.date });
      }
    }
  } else {
    // Fallback for daily (non-weekly) picks and any unmatched branch.
    // Super League has no ESPN_ENDPOINTS key — use its dedicated fetcher.
    const games = sport === "superleague"
      ? await fetchSuperLeagueGamesForDate(todayEspn)
      : await fetchGamesForDate(sport, todayEspn);
    for (const g of games) gameMap.set(g.id, { date: g.date });
  }

  const lockedGameIds: string[] = [];
  const unknownGameIds: string[] = [];
  const invalidPickIds: string[] = [];

  for (const pick of picks) {
    const game = gameMap.get(pick.gameId);
    if (!game) {
      unknownGameIds.push(pick.gameId);
    } else if (!pool.sandboxMode && isGameLocked(game.date)) {
      // Sandbox mode: never lock picks regardless of game start time
      lockedGameIds.push(pick.gameId);
    } else if (is3way && !WC_PICK_OPTIONS.includes(pick.pickedTeamId as WcPickOption)) {
      invalidPickIds.push(pick.gameId);
    }
  }

  if (unknownGameIds.length > 0) {
    res.status(400).json({ error: `Unknown games: ${unknownGameIds.join(", ")}` });
    return;
  }
  if (lockedGameIds.length > 0) {
    res.status(400).json({ error: `Games already locked: ${lockedGameIds.join(", ")}` });
    return;
  }
  if (invalidPickIds.length > 0) {
    res.status(400).json({ error: `Invalid pick option — must be home_win, draw, or away_win` });
    return;
  }

  let saved = 0;

  for (const pick of picks) {
    const resolvedTeamId = NFL_TEAM_INFO[pick.pickedTeamId]?.id ?? pick.pickedTeamId;
    const pickedTeamName = is3way
      ? (WC_PICK_LABELS[pick.pickedTeamId as WcPickOption] ?? pick.pickedTeamName)
      : pick.pickedTeamName;

    // For 3-way picks: use the game-specific date.
    // For NHL/NBA weekly sandbox pools: use the anchor date captured during game-ID validation
    // (e.g. "2025-10-11" for the sandbox Saturday) so all read paths can find picks by game date.
    // For all other sports: fall back to today.
    const gameDate = (is3way || isAts) && pick.gameDate ? pick.gameDate : (anchorGameDate ?? todayEt);

    await db
      .insert(pickemPicksTable)
      .values({
        poolId,
        userId,
        gameId: pick.gameId,
        gameDate,
        week: pool.currentWeek,
        pickedTeamId: resolvedTeamId,
        pickedTeamName,
        result: "pending",
      })
      .onConflictDoUpdate({
        target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
        set: {
          pickedTeamId: resolvedTeamId,
          pickedTeamName,
          result: "pending",
          updatedAt: new Date(),
        },
      });
    saved++;
  }

  // For MLB pools: save tiebreaker guesses onto the entry row when provided
  const isMlb = sport === "mlb";
  if (isMlb && typeof tiebreakerRuns === "number" && typeof tiebreakerStrikeouts === "number") {
    await db
      .update(entriesTable)
      .set({ tiebreakerRuns, tiebreakerStrikeouts })
      .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)));
  }

  // For NHL weekly pools: save tiebreaker guesses onto the entry row when provided
  const isNhl = sport === "nhl";
  if (isNhl && pool.pickFrequency === "weekly" && typeof tiebreakerShotsOnGoal === "number" && typeof tiebreakerPenaltyMinutes === "number") {
    await db
      .update(entriesTable)
      .set({ tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes })
      .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)));
  }

  res.status(201).json({ saved, skipped: 0 });
});

/**
 * Shared reveal gate used by the leaderboard entry loop and the daily-pick drill-down.
 * Own picks are always shown; other players' picks are hidden until the game/pick is graded or locked.
 */
function isPickRevealed(opts: {
  isOwnPick: boolean;
  sandboxMode: boolean;
  result: string | null;
  startTime: string | null | undefined;
}): boolean {
  if (opts.isOwnPick) return true;
  if (opts.sandboxMode) return opts.result !== "pending";
  // A pick whose result is already set is definitively graded and public —
  // reveal it even if the live ESPN game lookup fails to return the historical game.
  if (opts.result != null && opts.result !== "pending") return true;
  return !!opts.startTime && isGameLocked(opts.startTime);
}

// GET /api/pools/:poolId/pickem/daily-picks?date=YYYY-MM-DD&userId=N
router.get("/daily-picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const requestingUserId = req.user!.id;
  const date = String(req.query.date ?? "");
  const targetUserId = parseInt(String(req.query.userId ?? "0"));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  if (!targetUserId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, requestingUserId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const sport = pool.sport as string;
  const isIntl = sport === "intl";
  const isAts = (pool.poolType as string) === "nba_ats";
  const espnDate = date.replace(/-/g, "");

  const [picks, games] = await Promise.all([
    db
      .select()
      .from(pickemPicksTable)
      .where(
        and(
          eq(pickemPicksTable.poolId, poolId),
          eq(pickemPicksTable.userId, targetUserId),
          eq(pickemPicksTable.gameDate, date),
        ),
      ),
    isIntl ? fetchIntlGamesForDate(espnDate)
      : sport === "superleague" ? fetchSuperLeagueGamesForDate(espnDate)
      : fetchGamesForDate(sport, espnDate),
  ]);

  // For NBA ATS pools: load spread lines for the games in this set of picks.
  // Query by poolId + gameId (ESPN IDs are globally unique per pool) so we don't
  // need to know the week number from just a date.
  const spreadMap = new Map<string, { spread: number; favoriteTeamId: string }>();
  if (isAts && picks.length > 0) {
    const gameIds = picks.map((p) => p.gameId);
    const spreadRows = await db
      .select()
      .from(pickemGameSpreadsTable)
      .where(and(eq(pickemGameSpreadsTable.poolId, poolId), inArray(pickemGameSpreadsTable.gameId, gameIds)));
    for (const row of spreadRows) {
      spreadMap.set(row.gameId, { spread: row.spread, favoriteTeamId: row.favoriteTeamId });
    }
  }

  const gameMap = new Map(games.map((g) => [g.id, g]));

  const details = picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const revealed = isPickRevealed({
      isOwnPick: targetUserId === requestingUserId,
      sandboxMode: pool.sandboxMode ?? false,
      result: pick.result,
      startTime: game?.date,
    });
    // 3-way pools (mls/superleague) store "home_win"/"draw"/"away_win" as pickedTeamId,
    // not an actual team ID.  Detect before computing logo/side.
    const WC_OPTIONS_BE = ["home_win", "draw", "away_win"] as const;
    const is3wayOption = revealed && pick.pickedTeamId != null &&
      (WC_OPTIONS_BE as readonly string[]).includes(pick.pickedTeamId);
    const pickedIsHome = revealed && game
      ? (is3wayOption ? pick.pickedTeamId === "home_win" : pick.pickedTeamId === game.homeTeam.id)
      : false;
    const spreadEntry = isAts ? (spreadMap.get(pick.gameId) ?? null) : null;
    return {
      gameId: pick.gameId,
      pickedTeamId: revealed ? pick.pickedTeamId : null as string | null,
      pickedTeamName: revealed ? pick.pickedTeamName : null as string | null,
      pickedTeamLogoUrl: !revealed || !game ? null
        : (is3wayOption && pick.pickedTeamId === "draw") ? null
        : (pickedIsHome ? game.homeTeam.logo : game.awayTeam.logo) ?? null,
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
      status: game?.status ?? "unknown",
      // NBA ATS only — the commissioner-entered spread and which team is the favourite.
      // Null for all other pool types.
      spread: spreadEntry?.spread ?? null,
      favoriteTeamId: spreadEntry?.favoriteTeamId ?? null,
    };
  });

  res.json(details);
});

/** Compute the Mon–Sun week bounds (ET dates) for the week that contains today.
 *  Weeks run Monday–Sunday.  Sunday is the LAST day of its week, not the first
 *  day of the next one (e.g. Sunday 2026-06-14 → Mon 2026-06-08 … Sun 2026-06-14). */
function getWeekBoundsEt(todayEt: string): { weekStart: string; weekEnd: string } {
  const [y, m, d] = todayEt.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat

  // In a Mon–Sun week, Sunday is the LAST day of the week.
  // Sunday (dow=0) → go back 6 days to the Monday that opened this week
  // Mon–Sat        → go back to this week's Monday
  const daysToMonday = dow === 0 ? -6 : -(dow - 1);
  const monday = new Date(date.getTime() + daysToMonday * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);

  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

// GET /api/pools/:poolId/pickem/daily-results?date=YYYY-MM-DD
router.get("/daily-results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;
  const date = String(req.query.date ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem" && (pool.poolType as string) !== "nba_ats") { res.status(400).json({ error: "Not a Pick-Em pool" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const sport = pool.sport as string;
  const isIntl = sport === "intl";

  // Friendly label: "Monday, June 7"
  const [y, mo, d] = date.split("-").map(Number);
  const dateLabel = new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });

  // ESPN date format: YYYYMMDD
  const espnDate = date.replace(/-/g, "");

  const [espnGames, allPicks] = await Promise.all([
    isIntl ? fetchIntlGamesForDate(espnDate)
      : sport === "superleague" ? fetchSuperLeagueGamesForDate(espnDate)
      : fetchGamesForDate(sport, espnDate),
    db
      .select({
        userId: pickemPicksTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
        gameId: pickemPicksTable.gameId,
        pickedTeamId: pickemPicksTable.pickedTeamId,
        pickedTeamName: pickemPicksTable.pickedTeamName,
        result: pickemPicksTable.result,
      })
      .from(pickemPicksTable)
      .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.gameDate, date))),
  ]);

  espnGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hasResults = allPicks.some((p) => p.result != null);

  // Group picks by user
  const userMap = new Map<number, {
    userId: number; username: string; displayName: string | null;
    picks: Map<string, { pickedTeamId: string; pickedTeamName: string; result: string | null }>;
  }>();

  for (const pick of allPicks) {
    if (!userMap.has(pick.userId)) {
      userMap.set(pick.userId, { userId: pick.userId, username: pick.username, displayName: pick.displayName ?? null, picks: new Map() });
    }
    userMap.get(pick.userId)!.picks.set(pick.gameId, {
      pickedTeamId: pick.pickedTeamId,
      pickedTeamName: pick.pickedTeamName,
      result: pick.result ?? null,
    });
  }

  // Visibility rule: a pick is only visible to other players once that specific game has kicked off.
  {
    const gameDateMap = new Map<string, string>(espnGames.map((g: any) => [g.id, g.date]));
    for (const [uid, player] of userMap) {
      if (uid === userId) continue;
      for (const gameId of Array.from(player.picks.keys())) {
        const gameDate = gameDateMap.get(gameId);
        if (gameDate == null || !isGameLocked(gameDate)) {
          player.picks.delete(gameId);
        }
      }
    }
  }

  // Compute scores and sort
  const scored = Array.from(userMap.values()).map((u) => {
    const picks = Array.from(u.picks.entries());
    const correct = picks.filter(([, p]) => p.result === "correct").length;
    const total = picks.length;
    return { ...u, correct, total };
  });

  scored.sort((a, b) => b.correct - a.correct || b.total - a.total);

  // Assign ranks with ties
  let rank = 1;
  const players = scored.map((u, i) => {
    if (i > 0 && u.correct === scored[i - 1].correct) {
      // same rank as previous
    } else {
      rank = i + 1;
    }
    return {
      rank,
      userId: u.userId,
      username: u.username,
      displayName: u.displayName,
      correct: u.correct,
      total: u.total,
      picks: Array.from(u.picks.entries()).map(([gameId, p]) => ({
        gameId,
        pickedTeamId: p.pickedTeamId,
        pickedTeamName: p.pickedTeamName,
        result: p.result,
      })),
    };
  });

  const games = espnGames.map((g) => ({
    id: g.id,
    awayTeam: { id: g.awayTeam.id, abbreviation: g.awayTeam.abbreviation, name: g.awayTeam.displayName, logoUrl: g.awayTeam.logo ?? null },
    homeTeam: { id: g.homeTeam.id, abbreviation: g.homeTeam.abbreviation, name: g.homeTeam.displayName, logoUrl: g.homeTeam.logo ?? null },
    awayScore: g.awayScore,
    homeScore: g.homeScore,
  }));

  res.json({ date, label: dateLabel, hasResults, games, players });
});

// GET /api/pools/:poolId/pickem/yesterday-winner?date=YYYY-MM-DD
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

  const rows = await db
    .select({
      userId: pickemPicksTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
      total: sql<string>`COUNT(*)`,
      graded: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} IS NOT NULL)`,
    })
    .from(pickemPicksTable)
    .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
    .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.gameDate, date)))
    .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
    .orderBy(sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`);

  const hasResults = rows.some((r) => Number(r.graded) > 0);
  if (!hasResults) {
    res.json({ date, hasResults: false, winners: [] });
    return;
  }

  // Only declare a winner once every pick has been graded.
  // If any player still has ungraded picks, at least one game is still live.
  const allGraded = rows.every((r) => Number(r.graded) === Number(r.total));
  if (!allGraded) {
    res.json({ date, hasResults: false, winners: [] });
    return;
  }

  const maxCorrect = Math.max(...rows.map((r) => Number(r.correct)));
  const winners = rows
    .filter((r) => Number(r.correct) === maxCorrect)
    .map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName ?? null,
      correct: Number(r.correct),
      total: Number(r.total),
    }));

  // Compute prize per winner: sole winner takes 1st-place tier; tied winners split total equally.
  // Weekly pools award the prize at week level (via prev-week-results), not per individual day.
  let prizeWon: number | null = null;
  if (pool.pickFrequency !== "weekly") {
    if (pool.prizeStructure && pool.prizeStructure.length > 0) {
      const total = pool.prizeStructure.reduce((sum, p) => sum + p.amount, 0);
      prizeWon = winners.length > 1
        ? Math.floor(total / winners.length)
        : pool.prizeStructure[0].amount;
    } else if (pool.prizePot && pool.prizePot > 0) {
      prizeWon = Math.floor(pool.prizePot / winners.length);
    }
  }

  res.json({ date, hasResults: true, winners: winners.map(w => ({ ...w, prizeWon })) });
});

// Helper: offset a YYYY-MM-DD string by N days
function offsetDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// GET /api/pools/:poolId/pickem/prev-week-results
router.get("/prev-week-results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const isNbaAts = (pool.poolType as string) === "nba_ats";
  if (pool.poolType !== "pickem" && !isNbaAts) { res.status(400).json({ error: "Not a pick-em pool" }); return; }

  const sport = pool.sport as string;
  const isWeekly = pool.pickFrequency === "weekly" && sport !== "worldcup" && sport !== "intl";
  if (!isWeekly) {
    res.status(400).json({ error: "Pool is not a weekly pick-em pool" });
    return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  // Optional ?week=N param: 1-indexed completed week number. Defaults to the
  // immediately prior calendar/weekend week when omitted (backward-compatible).
  const weekParam = req.query.week;
  const requestedWeek = weekParam !== undefined ? parseInt(String(weekParam)) : null;
  if (requestedWeek !== null) {
    if (isNaN(requestedWeek) || requestedWeek < 1 || requestedWeek >= pool.currentWeek) {
      res.status(400).json({ error: `week must be between 1 and ${pool.currentWeek - 1}` });
      return;
    }
  }

  const todayEt = getTodayEtDate();

  // Compute date bounds for the requested (or default previous) week.
  // For nba_ats: Fri–Sun weekend bounds keyed by week counter.
  // For Super League: Fri–Mon slate bounds. For all others: Mon–Sun calendar
  // week. Without a week param, default to the immediately prior full window.
  let prevWeekBounds: { weekStart: string; weekEnd: string };
  if (isNbaAts) {
    const anchor = pool.sandboxMode ? NBA_SANDBOX_ANCHOR : pool.createdAt;
    const weekNum = requestedWeek ?? Math.max(1, pool.currentWeek - 1);
    const { days } = getNbaWeekendBounds(anchor, weekNum);
    prevWeekBounds = { weekStart: days[0]!, weekEnd: days[days.length - 1]! };
  } else if (requestedWeek !== null) {
    // Offset back from the current week's Monday by (currentWeek − requestedWeek) weeks.
    const currentWeekBounds = sport === "superleague"
      ? getSuperLeagueWeekBoundsEt(todayEt)
      : getWeekBoundsEt(todayEt);
    const weeksBack = pool.currentWeek - requestedWeek;
    const weekNStart = offsetDateStr(currentWeekBounds.weekStart, -(weeksBack * 7));
    prevWeekBounds = sport === "superleague"
      ? getSuperLeagueWeekBoundsEt(weekNStart)
      : getWeekBoundsEt(weekNStart);
  } else {
    const currentWeekBounds = sport === "superleague"
      ? getSuperLeagueWeekBoundsEt(todayEt)
      : getWeekBoundsEt(todayEt);
    const priorWindowReference = sport === "superleague"
      ? offsetDateStr(currentWeekBounds.weekStart, -7)
      : offsetDateStr(currentWeekBounds.weekStart, -1);
    prevWeekBounds = sport === "superleague"
      ? getSuperLeagueWeekBoundsEt(priorWindowReference)
      : getWeekBoundsEt(priorWindowReference);
  }

  const isMlb = sport === "mlb";
  const isNhl = sport === "nhl";

  const picksWhere = and(
    eq(pickemPicksTable.poolId, poolId),
    gte(pickemPicksTable.gameDate, prevWeekBounds.weekStart),
    lte(pickemPicksTable.gameDate, prevWeekBounds.weekEnd),
  );

  const [aggregates, dailyAggregates, tbMlbEntries, tbNhlEntries, prevSundayGames, memberCountRow] = await Promise.all([
    db
      .select({
        userId: pickemPicksTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
        correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        picked: sql<string>`COUNT(*)`,
        graded: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} IN ('correct', 'incorrect', 'postponed'))`,
      })
      .from(pickemPicksTable)
      .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
      .where(picksWhere)
      .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
      .orderBy(
        sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
        sql`COUNT(*) DESC`,
      ),
    db
      .select({
        userId: pickemPicksTable.userId,
        gameDate: pickemPicksTable.gameDate,
        correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        picked: sql<string>`COUNT(*)`,
      })
      .from(pickemPicksTable)
      .where(picksWhere)
      .groupBy(pickemPicksTable.userId, pickemPicksTable.gameDate)
      .orderBy(pickemPicksTable.gameDate),
    // MLB tiebreaker guesses stored on entries
    isMlb
      ? db.select({ userId: entriesTable.userId, tiebreakerRuns: entriesTable.tiebreakerRuns, tiebreakerStrikeouts: entriesTable.tiebreakerStrikeouts }).from(entriesTable).where(eq(entriesTable.poolId, poolId))
      : Promise.resolve(null as null),
    // NHL tiebreaker guesses stored on entries
    isNhl
      ? db.select({ userId: entriesTable.userId, tiebreakerShotsOnGoal: entriesTable.tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes: entriesTable.tiebreakerPenaltyMinutes }).from(entriesTable).where(eq(entriesTable.poolId, poolId))
      : Promise.resolve(null as null),
    // Previous week's Sunday ESPN games — tiebreaker reference is the last game by start time.
    // Sandbox NHL excluded (its game IDs come from the NHL anchor, not the real schedule).
    (isMlb || (isNhl && !pool.sandboxMode))
      ? fetchGamesForDate(sport, prevWeekBounds.weekEnd.replace(/-/g, ""))
      : Promise.resolve(null as null),
    // Total pool members — needed for correct prize scaling in calcPrize
    db.select({ value: count() }).from(entriesTable).where(eq(entriesTable.poolId, poolId)),
  ]);

  const hasResults = aggregates.some((r) => Number(r.graded) > 0);

  const dailyByUser = new Map<number, { date: string; correct: number; picked: number }[]>();
  for (const row of dailyAggregates) {
    if (!dailyByUser.has(row.userId)) dailyByUser.set(row.userId, []);
    dailyByUser.get(row.userId)!.push({
      date: row.gameDate,
      correct: Number(row.correct),
      picked: Number(row.picked),
    });
  }

  // allGraded / weekTopCorrect needed for tiebreaker rank resolution and prize computation below.
  const allGraded = hasResults && aggregates.every((r) => Number(r.graded) === Number(r.picked));
  let weekTopCorrect = -1;
  if (allGraded && aggregates.length > 0) {
    weekTopCorrect = Number(aggregates[0].correct);
  }

  // Build tiebreaker guess maps
  const tiebreakerByUser = new Map<number, { tiebreakerRuns: number | null; tiebreakerStrikeouts: number | null }>();
  if (tbMlbEntries) {
    for (const e of tbMlbEntries) {
      tiebreakerByUser.set(e.userId, { tiebreakerRuns: e.tiebreakerRuns ?? null, tiebreakerStrikeouts: e.tiebreakerStrikeouts ?? null });
    }
  }
  const nhlTiebreakerByUser = new Map<number, { tiebreakerShotsOnGoal: number | null; tiebreakerPenaltyMinutes: number | null }>();
  if (tbNhlEntries) {
    for (const e of tbNhlEntries) {
      nhlTiebreakerByUser.set(e.userId, { tiebreakerShotsOnGoal: e.tiebreakerShotsOnGoal ?? null, tiebreakerPenaltyMinutes: e.tiebreakerPenaltyMinutes ?? null });
    }
  }

  // Compute tiebreaker actuals from the previous week's last game on Sunday
  let tiebreakerActualRuns: number | null = null;
  let tiebreakerActualStrikeouts: number | null = null;
  if (isMlb && prevSundayGames && prevSundayGames.length > 0) {
    const sorted = [...prevSundayGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const tiebreakerGame = sorted[sorted.length - 1]!;
    if (tiebreakerGame.isCompleted) {
      tiebreakerActualRuns = (tiebreakerGame.homeScore ?? 0) + (tiebreakerGame.awayScore ?? 0);
      tiebreakerActualStrikeouts = await fetchDailyStrikeouts([tiebreakerGame], prevWeekBounds.weekEnd);
    }
  }
  let tiebreakerActualShotsOnGoal: number | null = null;
  let tiebreakerActualPenaltyMinutes: number | null = null;
  if (isNhl && !pool.sandboxMode && prevSundayGames && prevSundayGames.length > 0) {
    const sorted = [...prevSundayGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const tiebreakerGame = sorted[sorted.length - 1]!;
    if (tiebreakerGame.isCompleted) {
      const stats = await fetchNhlTiebreakerStats(tiebreakerGame.id);
      tiebreakerActualShotsOnGoal = stats.shotsOnGoal;
      tiebreakerActualPenaltyMinutes = stats.penaltyMinutes;
    }
  }

  // Resolve tied top scorers via tiebreaker proximity, mirroring auto-eliminator weekly closure.
  // Combined diff = |primary − actual| + |secondary − actual| (MLB: runs+SO; NHL: shots+PIM).
  // Falls back to even split when actuals are unavailable or all tied diffs are equal.
  let tiebreakWinnerIds: Set<number> | null = null;
  if (allGraded && weekTopCorrect >= 0) {
    const tiedAggregates = aggregates.filter((r) => Number(r.correct) === weekTopCorrect);
    if (tiedAggregates.length > 1) {
      if (isMlb) {
        const primaryGuesses = new Map<number, number | null>(
          tiedAggregates.map((r) => {
            const tb = tbMlbEntries?.find((e) => e.userId === r.userId);
            return [r.userId, tb?.tiebreakerRuns ?? null];
          }),
        );
        const secondaryGuesses = new Map<number, number | null>(
          tiedAggregates.map((r) => {
            const tb = tbMlbEntries?.find((e) => e.userId === r.userId);
            return [r.userId, tb?.tiebreakerStrikeouts ?? null];
          }),
        );
        tiebreakWinnerIds = resolveSequentialTiebreaker(
          tiedAggregates.map((r) => r.userId),
          primaryGuesses,
          secondaryGuesses,
          tiebreakerActualRuns,
          tiebreakerActualStrikeouts,
        );
      } else if (isNhl) {
        const primaryGuesses = new Map<number, number | null>(
          tiedAggregates.map((r) => {
            const tb = tbNhlEntries?.find((e) => e.userId === r.userId);
            return [r.userId, tb?.tiebreakerShotsOnGoal ?? null];
          }),
        );
        const secondaryGuesses = new Map<number, number | null>(
          tiedAggregates.map((r) => {
            const tb = tbNhlEntries?.find((e) => e.userId === r.userId);
            return [r.userId, tb?.tiebreakerPenaltyMinutes ?? null];
          }),
        );
        tiebreakWinnerIds = resolveSequentialTiebreaker(
          tiedAggregates.map((r) => r.userId),
          primaryGuesses,
          secondaryGuesses,
          tiebreakerActualShotsOnGoal,
          tiebreakerActualPenaltyMinutes,
        );
      }
    }
  }

  // Compute prize for every rank group dynamically from this week's pick data.
  // This mirrors auto-eliminator's closure logic so all paid positions (1st, 2nd, 3rd…)
  // are returned correctly — including for pools that are still active and haven't been
  // written to entries.prize_amount yet.
  const prizeWonByUser = new Map<number, number>();
  if (allGraded && aggregates.length > 0) {
    const totalEntries = memberCountRow[0]?.value ?? aggregates.length;
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;

    // Build ordered rank groups. When a tiebreaker resolved the top group, split
    // confirmed winners (slot 0) from tiebreaker-losers (slot 1) into separate groups.
    // All other equal-correct-count runs stay together as one co-winner group.
    const rankGroups: number[][] = [];
    let prevCorrect = -1;
    for (const row of aggregates) {
      const c = Number(row.correct);
      if (tiebreakWinnerIds != null && c === weekTopCorrect) {
        const slot = tiebreakWinnerIds.has(row.userId) ? 0 : 1;
        while (rankGroups.length <= slot) rankGroups.push([]);
        rankGroups[slot].push(row.userId);
      } else {
        if (c !== prevCorrect) rankGroups.push([]);
        rankGroups[rankGroups.length - 1].push(row.userId);
        prevCorrect = c;
      }
    }

    let placeIndex = 0;
    for (const group of rankGroups) {
      const prize = calcPrize({
        prizeStructure: ps,
        prizeMode: pool.prizeMode,
        entryFee: pool.entryFee,
        prizePot: pool.prizePot,
        totalEntries,
        maxEntries: pool.maxEntries,
        placeIndex,
        coWinners: group.length,
      });
      if (prize != null && prize > 0) {
        for (const uid of group) prizeWonByUser.set(uid, prize);
      }
      placeIndex += group.length;
    }
  }

  let weekRank = 1;
  const entries = aggregates.map((row, i) => {
    if (tiebreakWinnerIds != null && Number(row.correct) === weekTopCorrect) {
      // tiebreaker resolved: confirmed winners keep rank 1; tied-on-picks losers drop to rank (winners + 1)
      weekRank = tiebreakWinnerIds.has(row.userId) ? 1 : tiebreakWinnerIds.size + 1;
    } else if (i > 0 && Number(row.correct) === Number(aggregates[i - 1].correct)) {
      // same rank as previous — tie
    } else {
      weekRank = i + 1;
    }
    const tb = tiebreakerByUser.get(row.userId);
    const runsGuess = tb?.tiebreakerRuns ?? null;
    const strikesGuess = tb?.tiebreakerStrikeouts ?? null;
    const runsDiff = isMlb && tiebreakerActualRuns != null && runsGuess != null
      ? Math.abs(runsGuess - tiebreakerActualRuns) : null;
    const nhlTb = nhlTiebreakerByUser.get(row.userId);
    const shotsGuess = nhlTb?.tiebreakerShotsOnGoal ?? null;
    const pimGuess = nhlTb?.tiebreakerPenaltyMinutes ?? null;
    const nhlDiff = isNhl && tiebreakerActualShotsOnGoal != null && tiebreakerActualPenaltyMinutes != null && shotsGuess != null && pimGuess != null
      ? Math.abs(shotsGuess - tiebreakerActualShotsOnGoal) + Math.abs(pimGuess - tiebreakerActualPenaltyMinutes) : null;
    return {
      rank: weekRank,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName ?? null,
      correct: Number(row.correct),
      picked: Number(row.picked),
      picks: [] as { gameId: string; pickedTeamId: string; pickedTeamName: string; result: string | null; pickOption: string | undefined }[],
      dailyBreakdown: dailyByUser.get(row.userId) ?? [],
      prizeWon: prizeWonByUser.get(row.userId) ?? null,
      tiebreakerRunsGuess: isMlb ? runsGuess : undefined,
      tiebreakerStrikeoutsGuess: isMlb ? strikesGuess : undefined,
      tiebreakerRunsDiff: isMlb ? runsDiff : undefined,
      tiebreakerShotsOnGoalGuess: isNhl ? shotsGuess : undefined,
      tiebreakerPenaltyMinutesGuess: isNhl ? pimGuess : undefined,
      tiebreakerNhlDiff: isNhl ? nhlDiff : undefined,
    };
  });

  res.json({
    hasResults,
    weekStart: prevWeekBounds.weekStart,
    weekEnd: prevWeekBounds.weekEnd,
    weekNumber: requestedWeek ?? Math.max(1, pool.currentWeek - 1),
    entries,
    tiebreakerActualRuns: isMlb ? tiebreakerActualRuns : undefined,
    tiebreakerActualStrikeouts: isMlb ? tiebreakerActualStrikeouts : undefined,
    tiebreakerActualShotsOnGoal: isNhl ? tiebreakerActualShotsOnGoal : undefined,
    tiebreakerActualPenaltyMinutes: isNhl ? tiebreakerActualPenaltyMinutes : undefined,
  });
});

// GET /api/pools/:poolId/pickem/leaderboard
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem" && (pool.poolType as string) !== "nba_ats") { res.status(400).json({ error: "This pool is not a Pick-Em pool" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const sport = pool.sport as string;
  const isWc = sport === "worldcup";
  const isIntl = sport === "intl";
  const isWeekly = pool.pickFrequency === "weekly" && !isWc && !isIntl;
  const isAts = (pool.poolType as string) === "nba_ats";
  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  // For WC: resolve which phase to show — default to group_stage
  const phaseParam = req.query.phase as string | undefined;
  const wcPhase: WcPhase = (isWc && phaseParam && WC_PHASES[phaseParam as WcPhase])
    ? (phaseParam as WcPhase)
    : "group_stage";

  // For NHL/NBA weekly sandbox pools picks are stored against anchor dates
  // (e.g. "2025-10-04"), not the real-world current week. Use the same anchor
  // week bounds here so the picksWhereClause actually matches those rows.
  // For ended non-sandbox weekly pools, derive bounds from the most recent
  // pick's gameDate so we query the week the pool actually played, not today.
  let weekBounds: { weekStart: string; weekEnd: string } | null = null;
  if (isWeekly) {
    if (sport === "nhl" && pool.sandboxMode) {
      const b = getNhlWeekBounds(NHL_SANDBOX_ANCHOR, pool.currentWeek);
      weekBounds = { weekStart: b.days[0]!, weekEnd: b.days[b.days.length - 1]! };
    } else if (sport === "nba" && pool.sandboxMode && !isAts) {
      // Non-ATS NBA sandbox (e.g. crazy_8s): full Mon–Sun week
      const b = getNbaWeekBounds(NBA_SANDBOX_ANCHOR, pool.currentWeek);
      weekBounds = { weekStart: b.days[0]!, weekEnd: b.days[b.days.length - 1]! };
    } else if (isAts) {
      // nba_ats picks only happen Fri/Sat/Sun — always use Fri–Sun bounds so the
      // picks WHERE clause and game list are both constrained to the 3-day window.
      if (pool.sandboxMode) {
        // Sandbox: anchor week's Fri/Sat/Sun dates
        const b = getNbaWeekendBounds(NBA_SANDBOX_ANCHOR, pool.currentWeek);
        weekBounds = { weekStart: b.days[0]!, weekEnd: b.days[b.days.length - 1]! };
      } else {
        // Live: find the reference date (last pick for ended pools, today for active)
        let refDate = todayEt;
        if (!pool.isActive) {
          const [latestWeekRow] = await db
            .select({ gameDate: pickemPicksTable.gameDate })
            .from(pickemPicksTable)
            .where(eq(pickemPicksTable.poolId, poolId))
            .orderBy(sql`${pickemPicksTable.gameDate} DESC`)
            .limit(1);
          if (latestWeekRow) refDate = latestWeekRow.gameDate;
        }
        // getWeekBoundsEt always returns Monday as weekStart; Fri = +4 days, Sun = +6 days
        const full = getWeekBoundsEt(refDate);
        const [wy, wm, wd] = full.weekStart.split("-").map(Number);
        const monday = new Date(Date.UTC(wy!, wm! - 1, wd!));
        weekBounds = {
          weekStart: new Date(monday.getTime() + 4 * 86_400_000).toISOString().slice(0, 10),
          weekEnd:   new Date(monday.getTime() + 6 * 86_400_000).toISOString().slice(0, 10),
        };
      }
    } else if (!pool.isActive) {
      // Ended non-ATS weekly pool — look up the last graded pick's date and use that
      // week's bounds so the leaderboard returns historical data, not an empty
      // current-week result set. (Mirrors the daily pool fallback below.)
      const [latestWeekRow] = await db
        .select({ gameDate: pickemPicksTable.gameDate })
        .from(pickemPicksTable)
        .where(eq(pickemPicksTable.poolId, poolId))
        .orderBy(sql`${pickemPicksTable.gameDate} DESC`)
        .limit(1);
      const referenceDate = latestWeekRow ? latestWeekRow.gameDate : todayEt;
      weekBounds = sport === "superleague"
        ? getSuperLeagueWeekBoundsEt(referenceDate)
        : getWeekBoundsEt(referenceDate);
    } else {
      weekBounds = sport === "superleague"
        ? getSuperLeagueWeekBoundsEt(todayEt)
        : getWeekBoundsEt(todayEt);
    }
  }

  // For ended daily pools use the actual last game date so the leaderboard
  // returns the final standings rather than an empty today-date result set.
  let dailyDate = todayEt;
  if (!pool.isActive && !isWc && !isIntl && !isWeekly) {
    const [latestRow] = await db
      .select({ gameDate: pickemPicksTable.gameDate })
      .from(pickemPicksTable)
      .where(eq(pickemPicksTable.poolId, poolId))
      .orderBy(sql`${pickemPicksTable.gameDate} DESC`)
      .limit(1);
    if (latestRow) dailyDate = latestRow.gameDate;
  }

  // Build picks WHERE clause:
  //   WC     → full phase date range
  //   intl   → all picks in pool (cumulative standings)
  //   weekly → current Mon–Sun week
  //   other  → today (or last game date for ended daily pools)
  const picksWhereClause = isWc
    ? and(
        eq(pickemPicksTable.poolId, poolId),
        gte(pickemPicksTable.gameDate, WC_PHASES[wcPhase].start),
        lte(pickemPicksTable.gameDate, WC_PHASES[wcPhase].end),
      )
    : isIntl
    ? eq(pickemPicksTable.poolId, poolId)
    : isWeekly
    ? and(
        eq(pickemPicksTable.poolId, poolId),
        gte(pickemPicksTable.gameDate, weekBounds!.weekStart),
        lte(pickemPicksTable.gameDate, weekBounds!.weekEnd),
      )
    : and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.gameDate, dailyDate));

  const isMlb = sport === "mlb";
  const isNhl = sport === "nhl";

  const [wcSchedule, espnGames, allPicks, aggregates, dailyAggregates, poolEntries, poolEntriesNhl] = await Promise.all([
    isWc ? fetchWcSchedule() : Promise.resolve(null as null),
    isIntl ? fetchIntlGamesForDate(todayEspn)
    : isWc ? Promise.resolve([] as Awaited<ReturnType<typeof fetchGamesForDate>>)
    : (isNhl && pool.sandboxMode && isWeekly) ? fetchNhlGamesByWeek(NHL_SANDBOX_ANCHOR, pool.currentWeek)
    : (isAts && isWeekly && weekBounds)
      ? (() => {
          // nba_ats: fetch only the 3 Fri/Sat/Sun dates already set in weekBounds.
          // weekBounds.weekStart is Friday (sandbox anchor or real), so +0/+1/+2 = Fri/Sat/Sun.
          const [wy, wm, wd] = weekBounds!.weekStart.split("-").map(Number);
          const fri = new Date(Date.UTC(wy!, wm! - 1, wd!));
          const atsEspnDates = [0, 1, 2].map((i) =>
            new Date(fri.getTime() + i * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
          );
          return Promise.all(atsEspnDates.map((d) => fetchGamesForDate("nba", d))).then((results) => {
            const seen = new Set<string>();
            return results.flat().filter((g) => {
              if (seen.has(g.id)) return false;
              seen.add(g.id);
              return true;
            });
          });
        })()
    : (sport === "nba" && pool.sandboxMode && isWeekly) ? fetchNbaGamesByWeek(NBA_SANDBOX_ANCHOR, pool.currentWeek)
    : (sport === "superleague" && isWeekly && weekBounds)
      ? (() => {
          const [wy, wm, wd] = weekBounds.weekStart.split("-").map(Number);
          const friday = new Date(Date.UTC(wy!, wm! - 1, wd!));
          const slWeekEspnDates = Array.from({ length: 4 }, (_, i) =>
            new Date(friday.getTime() + i * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
          );
          return Promise.all(slWeekEspnDates.map((d) => fetchSuperLeagueGamesForDate(d))).then((results) => {
            const seen = new Set<string>();
            return results.flat().filter((g) => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
          });
        })()
    : (sport === "mls" && isWeekly && weekBounds)
      ? (() => {
          const [wy, wm, wd] = weekBounds.weekStart.split("-").map(Number);
          const weekMonday = new Date(Date.UTC(wy!, wm! - 1, wd!));
          const mlsWeekEspnDates = Array.from({ length: 7 }, (_, i) =>
            new Date(weekMonday.getTime() + i * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
          );
          return Promise.all(mlsWeekEspnDates.map((d) => fetchGamesForDate("mls", d))).then((results) => {
            const seen = new Set<string>();
            return results.flat().filter((g) => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
          });
        })()
    : (sport === "nfl" && pool.sandboxMode && isWeekly && weekBounds)
      ? (() => {
          const [wy, wm, wd] = weekBounds.weekStart.split("-").map(Number);
          const weekMonday = new Date(Date.UTC(wy!, wm! - 1, wd!));
          const nflWeekEspnDates = Array.from({ length: 7 }, (_, i) =>
            new Date(weekMonday.getTime() + i * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
          );
          return Promise.all(nflWeekEspnDates.map((d) => fetchGamesForDate("nfl", d))).then((results) => results.flat());
        })()
    : fetchGamesForDate(sport, todayEspn),
    db.select().from(pickemPicksTable).where(picksWhereClause),
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
      .where(picksWhereClause)
      .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
      .orderBy(
        sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
        sql`COUNT(*) DESC`,
      ),
    isWeekly
      ? db
          .select({
            userId: pickemPicksTable.userId,
            gameDate: pickemPicksTable.gameDate,
            correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
            picked: sql<string>`COUNT(*)`,
          })
          .from(pickemPicksTable)
          .where(picksWhereClause)
          .groupBy(pickemPicksTable.userId, pickemPicksTable.gameDate)
          .orderBy(pickemPicksTable.gameDate)
      : Promise.resolve(null as null),
    // For MLB pools: fetch tiebreaker guesses stored on entries
    isMlb
      ? db
          .select({
            userId: entriesTable.userId,
            tiebreakerRuns: entriesTable.tiebreakerRuns,
            tiebreakerStrikeouts: entriesTable.tiebreakerStrikeouts,
          })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, poolId))
      : Promise.resolve(null as null),
    // For NHL weekly pools: fetch tiebreaker guesses stored on entries
    isNhl
      ? db
          .select({
            userId: entriesTable.userId,
            tiebreakerShotsOnGoal: entriesTable.tiebreakerShotsOnGoal,
            tiebreakerPenaltyMinutes: entriesTable.tiebreakerPenaltyMinutes,
          })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, poolId))
      : Promise.resolve(null as null),
  ]);

  if (!isWc) {
    espnGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Sandbox score map for NHL weekly Pick'em leaderboard — gates tiebreaker actuals and game status display
  let lbSandboxScoreMap = new Map<string, { homeScore: number; awayScore: number }>();
  if (isNhl && pool.sandboxMode && isWeekly) {
    const sbRows = await db.select().from(sandboxGameScoresTable)
      .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, pool.currentWeek)));
    lbSandboxScoreMap = new Map(sbRows.map(r => [r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 }]));
  }

  // Build per-day breakdown map for weekly pools
  const dailyByUser = new Map<number, { date: string; correct: number; picked: number }[]>();
  if (dailyAggregates) {
    for (const row of dailyAggregates) {
      if (!dailyByUser.has(row.userId)) dailyByUser.set(row.userId, []);
      dailyByUser.get(row.userId)!.push({
        date: row.gameDate,
        correct: Number(row.correct),
        picked: Number(row.picked),
      });
    }
  }

  // Build tiebreaker guess map for MLB pools
  const tiebreakerByUser = new Map<number, { tiebreakerRuns: number | null; tiebreakerStrikeouts: number | null }>();
  if (poolEntries) {
    for (const entry of poolEntries) {
      tiebreakerByUser.set(entry.userId, {
        tiebreakerRuns: entry.tiebreakerRuns ?? null,
        tiebreakerStrikeouts: entry.tiebreakerStrikeouts ?? null,
      });
    }
  }

  // Build tiebreaker guess map for NHL weekly pools
  const nhlTiebreakerByUser = new Map<number, { tiebreakerShotsOnGoal: number | null; tiebreakerPenaltyMinutes: number | null }>();
  if (poolEntriesNhl) {
    for (const entry of poolEntriesNhl) {
      nhlTiebreakerByUser.set(entry.userId, {
        tiebreakerShotsOnGoal: entry.tiebreakerShotsOnGoal ?? null,
        tiebreakerPenaltyMinutes: entry.tiebreakerPenaltyMinutes ?? null,
      });
    }
  }

  // For MLB pools: compute actualRuns and actualStrikeouts from the tiebreaker game only —
  // the last game on the slate by start time (matching the frontend's isTiebreakerGame tag).
  // Mirrors NFL Confidence's pattern of isolating a single tiebreakerGame.
  let tiebreakerActualRuns: number | null = null;
  let tiebreakerActualStrikeouts: number | null = null;
  if (isMlb && espnGames.length > 0) {
    const tiebreakerGame = espnGames[espnGames.length - 1];
    if (tiebreakerGame.isCompleted) {
      tiebreakerActualRuns = (tiebreakerGame.homeScore ?? 0) + (tiebreakerGame.awayScore ?? 0);
      // Fetch strikeouts from MLB Stats API for this game only; returns null on any failure
      tiebreakerActualStrikeouts = await fetchDailyStrikeouts([tiebreakerGame], todayEt);
    }
  }

  // For NHL weekly pools: compute actualShotsOnGoal and actualPenaltyMinutes from the last
  // game on today's slate — only applicable on Sunday (the final day of the week).
  let tiebreakerActualShotsOnGoal: number | null = null;
  let tiebreakerActualPenaltyMinutes: number | null = null;
  // In sandbox mode: show tiebreaker whenever last game is graded (not tied to Sunday).
  // In live mode: only on Sunday (last day of the week).
  const nhlTiebreakerApplicable = isNhl && isWeekly && espnGames.length > 0 && weekBounds != null &&
    (pool.sandboxMode ? true : todayEt === weekBounds.weekEnd);
  if (nhlTiebreakerApplicable) {
    const tiebreakerGame = espnGames[espnGames.length - 1];
    // Sandbox: gate on sandboxGameScoresTable existence, not ESPN completion status.
    // The anchor-week game ID is a real historical ESPN event — fetchNhlTiebreakerStats
    // will return real shots-on-goal and penalty-minutes for it once grading runs.
    const tbCompleted = pool.sandboxMode ? lbSandboxScoreMap.has(tiebreakerGame.id) : tiebreakerGame.isCompleted;
    if (tbCompleted) {
      const stats = await fetchNhlTiebreakerStats(tiebreakerGame.id);
      tiebreakerActualShotsOnGoal = stats.shotsOnGoal;
      tiebreakerActualPenaltyMinutes = stats.penaltyMinutes;
    }
  }

  const picksByUser = new Map<number, Map<string, typeof allPicks[0]>>();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, new Map());
    picksByUser.get(pick.userId)!.set(pick.gameId, pick);
  }

  // For ended nba_ats pools: compute per-user total margin of victory across
  // correct picks, using final scores already returned by espnGames. This is the
  // same margin used by the closure block's tiebreaker; returning it here lets
  // the "POOL ENDED" view display why the tiebreak resolved the way it did.
  const atsTiebreakerMarginByUser = new Map<number, number>(); // userId → total |home−away|
  if (isAts && !pool.isActive) {
    const marginByGame = new Map<string, number>();
    for (const g of espnGames) {
      if (g.isCompleted && g.homeScore != null && g.awayScore != null) {
        marginByGame.set(g.id, Math.abs(g.homeScore - g.awayScore));
      }
    }
    for (const pick of allPicks) {
      if (pick.result !== "correct") continue;
      const margin = marginByGame.get(pick.gameId);
      if (margin == null) continue;
      atsTiebreakerMarginByUser.set(
        pick.userId,
        (atsTiebreakerMarginByUser.get(pick.userId) ?? 0) + margin,
      );
    }
  }

  // Build gameId → ISO start-time map for pick redaction.
  // WC picks span the full phase so we pull from wcSchedule; all other sports use espnGames.
  const gameStartMap = new Map<string, string>();
  if (isWc && wcSchedule) {
    for (const day of wcSchedule) {
      for (const g of day.games) {
        gameStartMap.set(g.id, g.date);
      }
    }
  } else {
    for (const g of espnGames) {
      gameStartMap.set(g.id, g.date);
    }
  }

  let lbRank = 1;
  const entries = aggregates.map((row, i) => {
    if (i > 0 && Number(row.correct) === Number(aggregates[i - 1].correct)) {
      // same correct count as previous player — keep rank unchanged (tie)
    } else {
      lbRank = i + 1;
    }
    const userPicks = picksByUser.get(row.userId) ?? new Map();
    const tb = tiebreakerByUser.get(row.userId);
    const runsGuess = tb?.tiebreakerRuns ?? null;
    const strikesGuess = tb?.tiebreakerStrikeouts ?? null;
    const runsDiff =
      isMlb && tiebreakerActualRuns != null && runsGuess != null
        ? Math.abs(runsGuess - tiebreakerActualRuns)
        : null;
    const nhlTb = nhlTiebreakerByUser.get(row.userId);
    const shotsGuess = nhlTb?.tiebreakerShotsOnGoal ?? null;
    const pimGuess = nhlTb?.tiebreakerPenaltyMinutes ?? null;
    const nhlDiff =
      isNhl &&
      tiebreakerActualShotsOnGoal != null &&
      tiebreakerActualPenaltyMinutes != null &&
      shotsGuess != null &&
      pimGuess != null
        ? Math.abs(shotsGuess - tiebreakerActualShotsOnGoal) + Math.abs(pimGuess - tiebreakerActualPenaltyMinutes)
        : null;
    return {
      rank: lbRank,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName ?? null,
      correct: Number(row.correct),
      picked: Number(row.picked),
      picks: Array.from(userPicks.values()).map((p) => {
        const startTime = gameStartMap.get(p.gameId);
        const revealed = isPickRevealed({
          isOwnPick: row.userId === userId,
          sandboxMode: pool.sandboxMode ?? false,
          result: p.result,
          startTime,
        });
        if (!revealed) {
          return {
            gameId: p.gameId,
            pickedTeamId: null as string | null,
            pickedTeamName: null as string | null,
            result: p.result,
            pickOption: null as string | null | undefined,
          };
        }
        return {
          gameId: p.gameId,
          pickedTeamId: p.pickedTeamId as string | null,
          pickedTeamName: p.pickedTeamName as string | null,
          result: p.result,
          pickOption: (isWc || isIntl) ? p.pickedTeamId : undefined as string | null | undefined,
        };
      }),
      dailyBreakdown: isWeekly ? (dailyByUser.get(row.userId) ?? []) : undefined,
      tiebreakerRunsGuess: isMlb ? runsGuess : undefined,
      tiebreakerStrikeoutsGuess: isMlb ? strikesGuess : undefined,
      tiebreakerRunsDiff: isMlb ? runsDiff : undefined,
      tiebreakerShotsOnGoalGuess: isNhl ? shotsGuess : undefined,
      tiebreakerPenaltyMinutesGuess: isNhl ? pimGuess : undefined,
      tiebreakerNhlDiff: isNhl ? nhlDiff : undefined,
      atsTiebreakerMargin: isAts && !pool.isActive ? (atsTiebreakerMarginByUser.get(row.userId) ?? 0) : undefined,
    };
  });

  // Build game list — WC uses full schedule for the active phase; others use today's ESPN games
  const wcRange = isWc ? WC_PHASES[wcPhase] : null;
  const formattedGames = isWc && wcSchedule
    ? wcSchedule
        .filter((day) => wcRange && day.dateStr >= wcRange.start && day.dateStr <= wcRange.end)
        .flatMap((day) =>
          day.games.map((g) => ({
            id: g.id,
            startTime: g.date,
            status: g.status,
            group: g.groupLabel ?? null,
            awayTeam: { id: g.awayTeam.id, abbreviation: g.awayTeam.abbreviation, logoUrl: g.awayTeam.logo ?? null },
            homeTeam: { id: g.homeTeam.id, abbreviation: g.homeTeam.abbreviation, logoUrl: g.homeTeam.logo ?? null },
          }))
        )
    : espnGames.map((g, idx) => ({
        id: g.id,
        startTime: g.date,
        status: (isNhl && pool.sandboxMode)
          ? (lbSandboxScoreMap.has(g.id) ? "final" : "scheduled")
          : g.status,
        group: null as string | null,
        isTiebreakerGame: (isMlb && idx === espnGames.length - 1) ||
          (isNhl && isWeekly && weekBounds != null &&
            (pool.sandboxMode || todayEt === weekBounds.weekEnd) &&
            idx === espnGames.length - 1),
        awayTeam: { id: g.awayTeam.id, abbreviation: g.awayTeam.abbreviation, logoUrl: g.awayTeam.logo ?? null },
        homeTeam: { id: g.homeTeam.id, abbreviation: g.homeTeam.abbreviation, logoUrl: g.homeTeam.logo ?? null },
        leagueSlug: g.leagueSlug ?? null,
      }));

  const phase = isWc ? wcPhase : null;
  const totalGames = isWc ? formattedGames.length : null;
  const completedGames = isWc && wcSchedule
    ? wcSchedule
        .filter((day) => wcRange && day.dateStr >= wcRange.start && day.dateStr <= wcRange.end)
        .flatMap((day) => day.games)
        .filter((g) => g.isCompleted)
        .length
    : null;

  res.json({
    poolId,
    week: pool.currentWeek,
    isWeekly: isWeekly || undefined,
    weekStart: weekBounds?.weekStart ?? null,
    weekEnd: weekBounds?.weekEnd ?? null,
    phase,
    games: formattedGames,
    entries,
    totalGames,
    completedGames,
    tiebreakerActualRuns: isMlb ? tiebreakerActualRuns : undefined,
    tiebreakerActualStrikeouts: isMlb ? tiebreakerActualStrikeouts : undefined,
    tiebreakerActualShotsOnGoal: isNhl ? tiebreakerActualShotsOnGoal : undefined,
    tiebreakerActualPenaltyMinutes: isNhl ? tiebreakerActualPenaltyMinutes : undefined,
  });
});

// POST /api/pools/:poolId/pickem/process-results  — commissioner only
router.post("/process-results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem" && (pool.poolType as string) !== "nba_ats") { res.status(400).json({ error: "This pool is not a Pick-Em pool" }); return; }
  if (pool.commissionerId !== userId && req.user!.role !== "admin") {
    res.status(403).json({ error: "Commissioner only" });
    return;
  }

  const sport = pool.sport as string;
  const isWc = sport === "worldcup";
  const isIntl = sport === "intl";
  const isMls = sport === "mls" || sport === "superleague";
  const is3way = isWc || isIntl || isMls;
  const isAts = (pool.poolType as string) === "nba_ats";
  const todayEt = getTodayEtDate();

  // ATS: load commissioner-entered spreads for grading
  const atsSpreadByGameId = new Map<string, { spread: number; favoriteTeamId: string }>();
  if (isAts) {
    const spreadRows = await db
      .select()
      .from(pickemGameSpreadsTable)
      .where(eq(pickemGameSpreadsTable.poolId, poolId));
    for (const row of spreadRows) {
      atsSpreadByGameId.set(row.gameId, { spread: row.spread, favoriteTeamId: row.favoriteTeamId });
    }
  }

  // Find every distinct gameDate that has pending picks in this pool.
  // This replaces the old "today + yesterday" hard window: any game that
  // finished after midnight ET (stored under a prior ESPN date) is still
  // found and graded, no matter how far back the ESPN date is.
  const pendingDateRows = await db
    .selectDistinct({ gameDate: pickemPicksTable.gameDate })
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.result, "pending"),
      ),
    );

  const pendingDates = pendingDateRows.map((r) => r.gameDate);

  // Fetch ESPN scores for every date that has pending picks (in parallel),
  // then flatten, deduplicate by gameId, and keep only completed games.
  const gamesByDate = await Promise.all(
    pendingDates.map((dateStr) => {
      const espnDate = dateStr.replace(/-/g, "");
      return isIntl
        ? fetchIntlGamesForDate(espnDate)
        : sport === "superleague" ? fetchSuperLeagueGamesForDate(espnDate)
        : fetchGamesForDate(sport, espnDate);
    }),
  );

  const seenIds = new Set<string>();
  const finalGames = gamesByDate.flat().filter((g) => {
    if (!g.isCompleted || g.homeScore == null || g.awayScore == null) return false;
    if (seenIds.has(g.id)) return false;
    seenIds.add(g.id);
    return true;
  });

  let processed = 0;

  for (const game of finalGames) {
    if (game.homeScore == null || game.awayScore == null) continue;
    // Match picks by poolId + gameId only — no date filter, so games that
    // finish after midnight ET (stored under the previous calendar date) are
    // still found and graded.  Only process picks still marked "pending".
    const gamePicks = await db
      .select()
      .from(pickemPicksTable)
      .where(
        and(
          eq(pickemPicksTable.poolId, poolId),
          eq(pickemPicksTable.gameId, game.id),
          eq(pickemPicksTable.result, "pending"),
        ),
      );

    // ATS grading: favourite must cover by more than the spread
    if (isAts) {
      const spreadRow = atsSpreadByGameId.get(game.id);
      if (!spreadRow) continue; // no spread entered yet — skip until commissioner sets it
      const { spread, favoriteTeamId } = spreadRow;
      const favoriteIsHome = favoriteTeamId === game.homeTeam.id;
      const homeMargin = (game.homeScore ?? 0) - (game.awayScore ?? 0); // positive = home won
      const favoriteMargin = favoriteIsHome ? homeMargin : -homeMargin;
      for (const pick of gamePicks) {
        const pickedFavorite = pick.pickedTeamId === favoriteTeamId;
        // Favourite covers if they win by strictly MORE than the spread.
        // Underdog covers if the favourite wins by LESS than the spread (or loses).
        // An exact push on the spread (rare with half-point lines) grades as incorrect.
        const result: "correct" | "incorrect" = pickedFavorite
          ? favoriteMargin > spread ? "correct" : "incorrect"
          : favoriteMargin < spread ? "correct" : "incorrect";
        await db
          .update(pickemPicksTable)
          .set({ result, updatedAt: new Date() })
          .where(eq(pickemPicksTable.id, pick.id));
        processed++;
      }
      continue; // skip standard grading below
    }

    for (const pick of gamePicks) {
      let result: "correct" | "incorrect";

      if (is3way) {
        const outcome = wcOutcome(game.homeScore, game.awayScore);
        result = pick.pickedTeamId === outcome ? "correct" : "incorrect";
      } else {
        const winningTeamId = game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;
        result = pick.pickedTeamId === winningTeamId ? "correct" : "incorrect";
      }

      await db
        .update(pickemPicksTable)
        .set({ result, updatedAt: new Date() })
        .where(eq(pickemPicksTable.id, pick.id));
      processed++;
    }
  }

  // ── WC group stage closure ───────────────────────────────────────────────
  // Fires when: sport=worldcup, group stage has ended, zero pending picks
  // remain in the group stage date range. Sets final_winner on the winner(s)
  // and marks the pool inactive. Safe to re-run: inArray([], …) is guarded.
  let wcGroupStageClosed = false;
  let wcGroupStageWinnerCount = 0;

  if (isWc && pool.isActive && todayEt > WC_PHASES.group_stage.end) {
    const [{ pendingCount }] = await db
      .select({ pendingCount: sql<string>`COUNT(*)` })
      .from(pickemPicksTable)
      .where(and(
        eq(pickemPicksTable.poolId, poolId),
        gte(pickemPicksTable.gameDate, WC_PHASES.group_stage.start),
        lte(pickemPicksTable.gameDate, WC_PHASES.group_stage.end),
        eq(pickemPicksTable.result, "pending"),
      ));

    if (Number(pendingCount) === 0) {
      const totals = await db
        .select({
          userId: pickemPicksTable.userId,
          correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        })
        .from(pickemPicksTable)
        .where(and(
          eq(pickemPicksTable.poolId, poolId),
          gte(pickemPicksTable.gameDate, WC_PHASES.group_stage.start),
          lte(pickemPicksTable.gameDate, WC_PHASES.group_stage.end),
        ))
        .groupBy(pickemPicksTable.userId);

      if (totals.length > 0) {
        const maxCorrect = Math.max(...totals.map((r) => Number(r.correct)));
        const winnerIds = totals
          .filter((r) => Number(r.correct) === maxCorrect)
          .map((r) => r.userId);

        if (winnerIds.length > 0) {
          const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
          const totalEntries = totals.length;
          const firstPrize = calcPrize({ placeIndex: 0, coWinners: winnerIds.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });

          await db
            .update(entriesTable)
            .set({ finalWinner: true, finishPosition: 1, prizeAmount: firstPrize })
            .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, winnerIds)));

          const winnerSet = new Set(winnerIds);
          const nonWinnersWc = totals.filter((r) => !winnerSet.has(r.userId)).sort((a, b) => Number(b.correct) - Number(a.correct));
          if (nonWinnersWc.length > 0) {
            const p2Score = Number(nonWinnersWc[0].correct);
            const secondGroup = nonWinnersWc.filter((r) => Number(r.correct) === p2Score);
            const secondPrize = calcPrize({ placeIndex: winnerIds.length, coWinners: secondGroup.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
            await db.update(entriesTable).set({ finishPosition: 2, prizeAmount: secondPrize }).where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, secondGroup.map((r) => r.userId))));
            const rest2 = nonWinnersWc.filter((r) => Number(r.correct) !== p2Score);
            if (rest2.length > 0) {
              const p3Score = Number(rest2[0].correct);
              const thirdGroup = rest2.filter((r) => Number(r.correct) === p3Score);
              const thirdPrize = calcPrize({ placeIndex: winnerIds.length + secondGroup.length, coWinners: thirdGroup.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
              await db.update(entriesTable).set({ finishPosition: 3, prizeAmount: thirdPrize }).where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, thirdGroup.map((r) => r.userId))));
            }
          }

          await db
            .update(poolsTable)
            .set({ isActive: false, endedAt: new Date() })
            .where(eq(poolsTable.id, poolId));

          wcGroupStageClosed = true;
          wcGroupStageWinnerCount = winnerIds.length;
          req.log.info(
            { poolId, maxCorrect, winnerCount: winnerIds.length, winnerIds },
            "WC Pick-Ems: group stage ended — pool closed and winner(s) declared",
          );
        }
      }
    }
  }

  // ── Daily pickem closure (non-WC, non-recurring) ─────────────────────────
  // Fires when: non-WC non-intl daily pool, pool still active, zero pending picks remain.
  // Sets final_winner on the top scorer(s) (ties = co-winners) and inactivates the pool.
  // Safe to re-run: pool.isActive guard means it only fires once.
  const isDailyPickem = !isWc && !isIntl && pool.pickFrequency === "daily" && !pool.isRecurring;
  let dailyClosed = false;
  let dailyWinnerCount = 0;

  if (isDailyPickem && pool.isActive) {
    const [{ pendingCount }] = await db
      .select({ pendingCount: sql<string>`COUNT(*)` })
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.result, "pending")));

    if (Number(pendingCount) === 0) {
      const totals = await db
        .select({
          userId: pickemPicksTable.userId,
          correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        })
        .from(pickemPicksTable)
        .where(eq(pickemPicksTable.poolId, poolId))
        .groupBy(pickemPicksTable.userId);

      if (totals.length > 0) {
        const maxCorrect = Math.max(...totals.map((r) => Number(r.correct)));
        const winnerIds = totals
          .filter((r) => Number(r.correct) === maxCorrect)
          .map((r) => r.userId);

        if (winnerIds.length > 0) {
          const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
          const totalEntries = totals.length;
          const firstPrize = calcPrize({ placeIndex: 0, coWinners: winnerIds.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });

          await db
            .update(entriesTable)
            .set({ finalWinner: true, finishPosition: 1, prizeAmount: firstPrize })
            .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, winnerIds)));

          const winnerSetDaily = new Set(winnerIds);
          const nonWinnersDaily = totals.filter((r) => !winnerSetDaily.has(r.userId)).sort((a, b) => Number(b.correct) - Number(a.correct));
          if (nonWinnersDaily.length > 0) {
            const p2Score = Number(nonWinnersDaily[0].correct);
            const secondGroup = nonWinnersDaily.filter((r) => Number(r.correct) === p2Score);
            const secondPrize = calcPrize({ placeIndex: winnerIds.length, coWinners: secondGroup.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
            await db.update(entriesTable).set({ finishPosition: 2, prizeAmount: secondPrize }).where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, secondGroup.map((r) => r.userId))));
            const rest2 = nonWinnersDaily.filter((r) => Number(r.correct) !== p2Score);
            if (rest2.length > 0) {
              const p3Score = Number(rest2[0].correct);
              const thirdGroup = rest2.filter((r) => Number(r.correct) === p3Score);
              const thirdPrize = calcPrize({ placeIndex: winnerIds.length + secondGroup.length, coWinners: thirdGroup.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
              await db.update(entriesTable).set({ finishPosition: 3, prizeAmount: thirdPrize }).where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, thirdGroup.map((r) => r.userId))));
            }
          }

          await db
            .update(poolsTable)
            .set({ isActive: false, endedAt: new Date() })
            .where(eq(poolsTable.id, poolId));

          dailyClosed = true;
          dailyWinnerCount = winnerIds.length;
          req.log.info(
            { poolId, maxCorrect, winnerCount: winnerIds.length, winnerIds },
            "Daily Pick-Ems: all picks graded — pool closed and winner(s) declared",
          );
        }
      }
    }
  }

  res.json({
    processed,
    date: todayEt,
    ...(isWc ? { wcGroupStageClosed, wcGroupStageWinnerCount } : {}),
    ...(isDailyPickem ? { dailyClosed, dailyWinnerCount } : {}),
  });
});

// POST /api/pools/:poolId/pickem/simulate-grading — sandbox grading for NHL Weekly Pick'em
router.post("/simulate-grading", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (pool.commissionerId !== userId && userRow?.role !== "admin") {
    res.status(403).json({ error: "Commissioner or admin only" }); return;
  }
  const isCrazyEightsNhl = (pool.poolType as string) === "crazy_8s" && pool.sport === "nhl";
  const isPickemNhlWeekly = pool.poolType === "pickem" && pool.sport === "nhl" && pool.pickFrequency === "weekly";
  const isNbaAts = (pool.poolType as string) === "nba_ats";
  if (!isCrazyEightsNhl && !isPickemNhlWeekly && !isNbaAts) {
    res.status(400).json({ error: "Simulate grading is only available for NHL Pick'em (weekly), NHL Hit the Ice, and NBA ATS pools in sandbox mode" }); return;
  }
  if (!pool.sandboxMode) {
    res.status(400).json({ error: "Sandbox mode is not enabled for this pool" }); return;
  }

  const week = pool.currentWeek;

  // ── NBA ATS sandbox simulate-grading ────────────────────────────────────────
  if (isNbaAts) {
    // 1. Fetch the full Fri/Sat/Sun weekend slate for this anchor week
    const { espnDates } = getNbaWeekendBounds(NBA_SANDBOX_ANCHOR, week);
    const weekendGames = (await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d)))).flat();
    type AtsSandboxGame = { id: string; homeTeamId: string; awayTeamId: string };
    const gameList: AtsSandboxGame[] = weekendGames.map((g) => ({
      id: g.id,
      homeTeamId: g.homeTeam.id,
      awayTeamId: g.awayTeam.id,
    }));

    // 2. Load existing scores so outcomes stay stable across repeated calls
    const existingRows = await db
      .select()
      .from(sandboxGameScoresTable)
      .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, week)));
    const gameScores = new Map<string, { homeScore: number; awayScore: number }>(
      existingRows.map((r) => [r.gameId, { homeScore: r.homeScore ?? 90, awayScore: r.awayScore ?? 90 }]),
    );

    // 3. Generate NBA-range scores (90–130 pts, never a tie) for unscored games
    for (const game of gameList) {
      if (gameScores.has(game.id)) continue;
      let homeScore = 90 + Math.floor(Math.random() * 41); // 90–130
      let awayScore = 90 + Math.floor(Math.random() * 41);
      if (homeScore === awayScore) awayScore = awayScore >= 130 ? 129 : awayScore + 1;
      gameScores.set(game.id, { homeScore, awayScore });
      await db
        .insert(sandboxGameScoresTable)
        .values({ poolId, week, gameId: game.id, homeScore, awayScore })
        .onConflictDoNothing();
    }

    // 4. Load commissioner-entered spread lines for this pool+week
    const spreadRows = await db
      .select()
      .from(pickemGameSpreadsTable)
      .where(and(eq(pickemGameSpreadsTable.poolId, poolId), eq(pickemGameSpreadsTable.week, week)));
    const spreadByGameId = new Map(
      spreadRows.map((r) => [r.gameId, { spread: r.spread, favoriteTeamId: r.favoriteTeamId }]),
    );

    // 5. Grade all pending picks using ATS logic
    //    Favourite covers when their margin of victory > spread.
    //    Underdog covers when they win outright or lose by less than the spread.
    const pendingPicks = await db
      .select()
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week), eq(pickemPicksTable.result, "pending")));

    let graded = 0;
    for (const pick of pendingPicks) {
      const scores = gameScores.get(pick.gameId);
      const spreadEntry = spreadByGameId.get(pick.gameId);
      const game = gameList.find((g) => g.id === pick.gameId);
      if (!scores || !spreadEntry || !game) continue;

      const favoriteIsHome = spreadEntry.favoriteTeamId === game.homeTeamId;
      const favScore = favoriteIsHome ? scores.homeScore : scores.awayScore;
      const underdogScore = favoriteIsHome ? scores.awayScore : scores.homeScore;
      const favMargin = favScore - underdogScore;

      const pickedFav = pick.pickedTeamId === spreadEntry.favoriteTeamId;
      const favCovered = favMargin > spreadEntry.spread;
      const result: "correct" | "incorrect" = pickedFav === favCovered ? "correct" : "incorrect";

      await db
        .update(pickemPicksTable)
        .set({ result, updatedAt: new Date() })
        .where(eq(pickemPicksTable.id, pick.id));
      graded++;
    }

    res.json({ graded, week });
    return;
  }

  // ── NHL sandbox simulate-grading (unchanged) ─────────────────────────────────
  // Fetch all games for the anchor week
  const weekGames = await fetchNhlGamesByWeek(NHL_SANDBOX_ANCHOR, week);
  type SandboxGame = { id: string; homeTeamId: string; awayTeamId: string };
  const gameList: SandboxGame[] = weekGames.map(g => ({ id: g.id, homeTeamId: g.homeTeam.id, awayTeamId: g.awayTeam.id }));

  // Load existing scores so outcomes stay stable across repeated calls
  const existingScoreRows = await db
    .select()
    .from(sandboxGameScoresTable)
    .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, week)));
  const gameScores = new Map<string, { homeScore: number; awayScore: number }>(
    existingScoreRows.map(r => [r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 }]),
  );

  // Generate scores for any unscored games (NHL: 0–7 goals, no ties)
  for (const game of gameList) {
    if (gameScores.has(game.id)) continue;
    let homeScore = Math.floor(Math.random() * 8);
    let awayScore = Math.floor(Math.random() * 8);
    if (homeScore === awayScore) homeScore = Math.min(homeScore + 1, 7);
    gameScores.set(game.id, { homeScore, awayScore });
    await db
      .insert(sandboxGameScoresTable)
      .values({ poolId, week, gameId: game.id, homeScore, awayScore })
      .onConflictDoNothing();
  }

  // Build winner map from the now-stable score map
  const winnerByGameId = new Map<string, string>(); // gameId → winning teamId
  for (const game of gameList) {
    const scores = gameScores.get(game.id);
    if (!scores) continue;
    winnerByGameId.set(game.id, scores.homeScore > scores.awayScore ? game.homeTeamId : game.awayTeamId);
  }

  // Grade all pending picks for this pool/week as correct or incorrect
  const pendingPicks = await db
    .select()
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week), eq(pickemPicksTable.result, "pending")));

  let graded = 0;
  for (const pick of pendingPicks) {
    const winner = winnerByGameId.get(pick.gameId);
    if (winner === undefined) continue;
    const result: "correct" | "incorrect" = pick.pickedTeamId === winner ? "correct" : "incorrect";
    await db.update(pickemPicksTable).set({ result, updatedAt: new Date() }).where(eq(pickemPicksTable.id, pick.id));
    graded++;
  }

  res.json({ graded, week });
});

// GET /api/pools/:poolId/pickem/ats-spreads — commissioner reads this week's spread lines
router.get("/ats-spreads", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nba_ats") { res.status(400).json({ error: "Not an ATS pool" }); return; }
  if (pool.commissionerId !== userId && req.user!.role !== "admin") {
    res.status(403).json({ error: "Commissioner only" }); return;
  }

  const rows = await db
    .select()
    .from(pickemGameSpreadsTable)
    .where(and(eq(pickemGameSpreadsTable.poolId, poolId), eq(pickemGameSpreadsTable.week, pool.currentWeek)));

  res.json({ week: pool.currentWeek, spreads: rows });
});

// POST /api/pools/:poolId/pickem/ats-spreads — commissioner saves spread lines
router.post("/ats-spreads", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nba_ats") { res.status(400).json({ error: "Not an ATS pool" }); return; }
  if (pool.commissionerId !== userId && req.user!.role !== "admin") {
    res.status(403).json({ error: "Commissioner only" }); return;
  }

  const { spreads } = req.body as {
    spreads: Array<{ gameId: string; spread: number; favoriteTeamId: string }>;
  };

  if (!Array.isArray(spreads) || spreads.length === 0) {
    res.status(400).json({ error: "spreads must be a non-empty array" }); return;
  }

  let saved = 0;
  for (const s of spreads) {
    if (!s.gameId || typeof s.spread !== "number" || s.spread <= 0 || !s.favoriteTeamId) continue;
    await db
      .insert(pickemGameSpreadsTable)
      .values({
        poolId,
        gameId: s.gameId,
        week: pool.currentWeek,
        spread: s.spread,
        favoriteTeamId: s.favoriteTeamId,
      })
      .onConflictDoUpdate({
        target: [pickemGameSpreadsTable.poolId, pickemGameSpreadsTable.gameId, pickemGameSpreadsTable.week],
        set: { spread: s.spread, favoriteTeamId: s.favoriteTeamId },
      });
    saved++;
  }

  res.json({ saved });
});

export default router;
