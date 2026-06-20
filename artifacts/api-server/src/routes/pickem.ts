import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, usersTable, entriesTable } from "@workspace/db";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  fetchGamesForDate,
  fetchIntlGamesForDate,
  getTodayEtDate,
  formatDateEt,
} from "../lib/espn";
import { fetchDailyStrikeouts } from "../lib/mlb-stats";
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
  if (pool.poolType !== "pickem" && (pool.poolType as string) !== "crazy_8s") { res.status(400).json({ error: "This pool is not a Pick-Em pool" }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const sport = pool.sport as string;
  const isWc = sport === "worldcup";
  const isIntl = sport === "intl";
  const is3way = isWc || isIntl;
  const todayEt = getTodayEtDate();

  // Accept an optional ?date=YYYY-MM-DD param; fall back to today
  const rawDate = typeof req.query.date === "string" ? req.query.date : null;
  const requestedDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayEt;
  const espnDate = requestedDate.replace(/-/g, "");

  const allGames = isIntl
    ? await fetchIntlGamesForDate(espnDate)
    : await fetchGamesForDate(sport, espnDate);
  allGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const games = allGames.filter((g) => g.status !== "suspended");

  const existingPicks = await db
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

  const formattedGames = games.map((g) => {
    const existing = pickMap.get(g.id);
    const locked = isGameLocked(g.date);
    const base = {
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

  // Past dates are always fully locked; present/future: check actual game times
  const isPastDate = requestedDate < todayEt;
  const slateDeadlinePassed = isPastDate || (games.length > 0 && games.some((g) => isGameLocked(g.date)));

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

  // A non-recurring MLB daily pool that has already finished: flag as closed so the
  // frontend can show a permanent "pool ended" read-only state instead of a picks UI.
  const isMlbDaily = sport === "mlb" && pool.pickFrequency === "daily";
  const poolClosed = isMlbDaily && !pool.isActive && !pool.isRecurring;

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

  const { picks, tiebreakerRuns, tiebreakerStrikeouts } = req.body as {
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string; gameDate?: string }>;
    tiebreakerRuns?: number;
    tiebreakerStrikeouts?: number;
  };

  if (!Array.isArray(picks) || picks.length === 0) {
    res.status(400).json({ error: "picks must be a non-empty array" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem") { res.status(400).json({ error: "This pool is not a Pick-Em pool" }); return; }
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
  const is3way = isWc || isIntl;
  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  // Build a map of all known games for validation
  const gameMap = new Map<string, { date: string }>();

  if (isWc) {
    // For WC: use cached full schedule for validation (avoids re-fetching today only)
    const schedule = await fetchWcSchedule();
    for (const day of schedule) {
      for (const g of day.games) gameMap.set(g.id, { date: g.date });
    }
  } else if (isIntl) {
    const games = await fetchIntlGamesForDate(todayEspn);
    for (const g of games) gameMap.set(g.id, { date: g.date });
  } else {
    const games = await fetchGamesForDate(sport, todayEspn);
    for (const g of games) gameMap.set(g.id, { date: g.date });
  }

  const lockedGameIds: string[] = [];
  const unknownGameIds: string[] = [];
  const invalidPickIds: string[] = [];

  for (const pick of picks) {
    const game = gameMap.get(pick.gameId);
    if (!game) {
      unknownGameIds.push(pick.gameId);
    } else if (isGameLocked(game.date)) {
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
    const pickedTeamName = is3way
      ? (WC_PICK_LABELS[pick.pickedTeamId as WcPickOption] ?? pick.pickedTeamName)
      : pick.pickedTeamName;

    // For 3-way picks: use the game-specific date; for other sports: use today
    const gameDate = is3way && pick.gameDate ? pick.gameDate : todayEt;

    await db
      .insert(pickemPicksTable)
      .values({
        poolId,
        userId,
        gameId: pick.gameId,
        gameDate,
        week: pool.currentWeek,
        pickedTeamId: pick.pickedTeamId,
        pickedTeamName,
        result: "pending",
      })
      .onConflictDoUpdate({
        target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
        set: {
          pickedTeamId: pick.pickedTeamId,
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

  res.status(201).json({ saved, skipped: 0 });
});

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
    isIntl ? fetchIntlGamesForDate(espnDate) : fetchGamesForDate(sport, espnDate),
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
  if (pool.poolType !== "pickem") { res.status(400).json({ error: "Not a Pick-Em pool" }); return; }

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
    isIntl ? fetchIntlGamesForDate(espnDate) : fetchGamesForDate(sport, espnDate),
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

  res.json({ date, hasResults: true, winners });
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
  if (pool.poolType !== "pickem") { res.status(400).json({ error: "Not a pick-em pool" }); return; }

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

  const todayEt = getTodayEtDate();
  const currentWeekBounds = getWeekBoundsEt(todayEt);

  // Previous week: the day before current week's Monday is last Sunday
  const prevWeekSunday = offsetDateStr(currentWeekBounds.weekStart, -1);
  const prevWeekBounds = getWeekBoundsEt(prevWeekSunday);

  const picksWhere = and(
    eq(pickemPicksTable.poolId, poolId),
    gte(pickemPicksTable.gameDate, prevWeekBounds.weekStart),
    lte(pickemPicksTable.gameDate, prevWeekBounds.weekEnd),
  );

  const [aggregates, dailyAggregates] = await Promise.all([
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

  const entries = aggregates.map((row, i) => ({
    rank: i + 1,
    userId: row.userId,
    username: row.username,
    displayName: row.displayName ?? null,
    correct: Number(row.correct),
    picked: Number(row.picked),
    picks: [] as { gameId: string; pickedTeamId: string; pickedTeamName: string; result: string | null; pickOption: string | undefined }[],
    dailyBreakdown: dailyByUser.get(row.userId) ?? [],
  }));

  res.json({
    hasResults,
    weekStart: prevWeekBounds.weekStart,
    weekEnd: prevWeekBounds.weekEnd,
    entries,
  });
});

// GET /api/pools/:poolId/pickem/leaderboard
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem") { res.status(400).json({ error: "This pool is not a Pick-Em pool" }); return; }

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
  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  // For WC: resolve which phase to show — default to group_stage
  const phaseParam = req.query.phase as string | undefined;
  const wcPhase: WcPhase = (isWc && phaseParam && WC_PHASES[phaseParam as WcPhase])
    ? (phaseParam as WcPhase)
    : "group_stage";

  const weekBounds = isWeekly ? getWeekBoundsEt(todayEt) : null;

  // Build picks WHERE clause:
  //   WC     → full phase date range
  //   intl   → all picks in pool (cumulative standings)
  //   weekly → current Mon–Sun week
  //   other  → today only
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
    : and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.gameDate, todayEt));

  const isMlb = sport === "mlb";

  const [wcSchedule, espnGames, allPicks, aggregates, dailyAggregates, poolEntries] = await Promise.all([
    isWc ? fetchWcSchedule() : Promise.resolve(null as null),
    isIntl ? fetchIntlGamesForDate(todayEspn)
    : isWc ? Promise.resolve([] as Awaited<ReturnType<typeof fetchGamesForDate>>)
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
  ]);

  if (!isWc) {
    espnGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

  // For MLB pools: compute actualRuns from final ESPN games on today's slate
  // and fetch actualStrikeouts from MLB Stats API (secondary source — failures → null)
  let tiebreakerActualRuns: number | null = null;
  let tiebreakerActualStrikeouts: number | null = null;
  if (isMlb && espnGames.length > 0) {
    const finalGames = espnGames.filter((g) => g.isCompleted);
    if (finalGames.length > 0) {
      tiebreakerActualRuns = finalGames.reduce(
        (sum, g) => sum + (g.homeScore ?? 0) + (g.awayScore ?? 0),
        0,
      );
      // Fetch strikeouts from MLB Stats API; returns null on any match/fetch failure
      tiebreakerActualStrikeouts = await fetchDailyStrikeouts(espnGames, todayEt);
    }
  }

  const picksByUser = new Map<number, Map<string, typeof allPicks[0]>>();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, new Map());
    picksByUser.get(pick.userId)!.set(pick.gameId, pick);
  }

  const entries = aggregates.map((row, i) => {
    const userPicks = picksByUser.get(row.userId) ?? new Map();
    const tb = tiebreakerByUser.get(row.userId);
    const runsGuess = tb?.tiebreakerRuns ?? null;
    const strikesGuess = tb?.tiebreakerStrikeouts ?? null;
    const runsDiff =
      isMlb && tiebreakerActualRuns != null && runsGuess != null
        ? Math.abs(runsGuess - tiebreakerActualRuns)
        : null;
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
        pickOption: (isWc || isIntl) ? p.pickedTeamId : undefined,
      })),
      dailyBreakdown: isWeekly ? (dailyByUser.get(row.userId) ?? []) : undefined,
      tiebreakerRunsGuess: isMlb ? runsGuess : undefined,
      tiebreakerStrikeoutsGuess: isMlb ? strikesGuess : undefined,
      tiebreakerRunsDiff: isMlb ? runsDiff : undefined,
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
    : espnGames.map((g) => ({
        id: g.id,
        startTime: g.date,
        status: g.status,
        group: null as string | null,
        awayTeam: { id: g.awayTeam.id, abbreviation: g.awayTeam.abbreviation, logoUrl: g.awayTeam.logo ?? null },
        homeTeam: { id: g.homeTeam.id, abbreviation: g.homeTeam.abbreviation, logoUrl: g.homeTeam.logo ?? null },
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
  });
});

// POST /api/pools/:poolId/pickem/process-results  — commissioner only
router.post("/process-results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if (pool.poolType !== "pickem") { res.status(400).json({ error: "This pool is not a Pick-Em pool" }); return; }
  if (pool.commissionerId !== userId && req.user!.role !== "admin") {
    res.status(403).json({ error: "Commissioner only" });
    return;
  }

  const sport = pool.sport as string;
  const isWc = sport === "worldcup";
  const isIntl = sport === "intl";
  const is3way = isWc || isIntl;
  const todayEt = getTodayEtDate();

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

  res.json({ processed, date: todayEt });
});

export default router;
