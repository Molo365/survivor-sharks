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
  const is3way = isWc || isIntl;
  const todayEt = getTodayEtDate();

  // Accept an optional ?date=YYYY-MM-DD param; fall back to today
  const rawDate = typeof req.query.date === "string" ? req.query.date : null;
  const requestedDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayEt;
  const espnDate = requestedDate.replace(/-/g, "");

  const games = isIntl
    ? await fetchIntlGamesForDate(espnDate)
    : await fetchGamesForDate(sport, espnDate);
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

  res.json({
    date: requestedDate,
    label,
    deadlinePassed: slateDeadlinePassed,
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

  const { picks } = req.body as {
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string; gameDate?: string }>;
  };

  if (!Array.isArray(picks) || picks.length === 0) {
    res.status(400).json({ error: "picks must be a non-empty array" });
    return;
  }

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

  res.status(201).json({ saved, skipped: 0 });
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
  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  // For WC: resolve which phase to show — default to group_stage
  const phaseParam = req.query.phase as string | undefined;
  const wcPhase: WcPhase = (isWc && phaseParam && WC_PHASES[phaseParam as WcPhase])
    ? (phaseParam as WcPhase)
    : "group_stage";

  // Build picks WHERE clause:
  //   WC   → full phase date range
  //   intl → all picks in pool (cumulative standings)
  //   other → today only
  const picksWhereClause = isWc
    ? and(
        eq(pickemPicksTable.poolId, poolId),
        gte(pickemPicksTable.gameDate, WC_PHASES[wcPhase].start),
        lte(pickemPicksTable.gameDate, WC_PHASES[wcPhase].end),
      )
    : isIntl
    ? eq(pickemPicksTable.poolId, poolId)
    : and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.gameDate, todayEt));

  const [wcSchedule, espnGames, allPicks, aggregates] = await Promise.all([
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
  ]);

  if (!isWc) {
    espnGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }


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
        pickOption: (isWc || isIntl) ? p.pickedTeamId : undefined,
      })),
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

  res.json({ poolId, week: pool.currentWeek, phase, games: formattedGames, entries, totalGames, completedGames });
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
  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();

  const games = isIntl
    ? await fetchIntlGamesForDate(todayEspn)
    : await fetchGamesForDate(sport, todayEspn);
  const finalGames = games.filter((g) => g.isCompleted);

  let processed = 0;

  for (const game of finalGames) {
    if (game.homeScore == null || game.awayScore == null) continue;

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
