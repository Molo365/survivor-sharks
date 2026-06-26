import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, usersTable, entriesTable, nflConfidenceResultsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchNflGamesByWeek, fetchNflWeek18TiebreakerStats } from "../lib/espn";
import { getSandboxGamesForWeek, sandboxGameToPickEmShape } from "../lib/nfl2025Schedule";

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

  const existingPicks = await db.select().from(pickemPicksTable).where(
    and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.userId, userId), eq(pickemPicksTable.week, week))
  );
  const pickMap = new Map(existingPicks.map(p => [p.gameId, p]));

  // ── Sandbox path ────────────────────────────────────────────────────────────
  if (pool.sandboxMode) {
    const sandboxGames = getSandboxGamesForWeek(week);
    const formattedGames = sandboxGames.map(g => {
      const shaped = sandboxGameToPickEmShape(g);
      const existing = pickMap.get(g.id);
      // Merge stored scores from grading — required for locked pick display
      const awayScore = existing?.awayScore ?? null;
      const homeScore = existing?.homeScore ?? null;
      const isGraded = existing?.result != null && existing.result !== "pending";
      return {
        ...shaped,
        // Graded games: mark final so NflGameCard renders scores + winner highlight
        status: isGraded && awayScore != null ? "final" : shaped.status,
        deadlinePassed: isGraded,
        awayScore,
        homeScore,
        userPickTeamId: existing?.pickedTeamId ?? null,
        userPickResult: existing?.result ?? null,
        homeRecord: null,
        awayRecord: null,
      };
    });
    res.json({ week, totalWeeks: NFL_TOTAL_WEEKS, currentWeek: pool.currentWeek, games: formattedGames });
    return;
  }

  const games = await fetchNflGamesByWeek(week, pool.season);
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const formattedGames = games.map(g => {
    const existing = pickMap.get(g.id);
    // Use stored scores as fallback when ESPN returns null (e.g. season-ID mismatch
    // causes ESPN to return future scheduled games with no scores).
    const awayScore = g.awayScore ?? existing?.awayScore ?? null;
    const homeScore = g.homeScore ?? existing?.homeScore ?? null;
    // If ESPN says "scheduled" but we have stored scores from grading, treat as final.
    const status = (g.status !== "final" && awayScore != null && homeScore != null)
      ? "final"
      : g.status;
    return {
      id: g.id,
      startTime: g.date,
      status,
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
      awayScore,
      homeScore,
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
  const { week, picks, tiebreakerPassingYards, tiebreakerRushingYards } = req.body as {
    week: number;
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>;
    tiebreakerPassingYards?: number;
    tiebreakerRushingYards?: number;
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
  if (!pool.isActive) { res.status(400).json({ error: "This pool has ended — picks are no longer accepted." }); return; }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const numWeek = Number(week);

  // ── Sandbox path — skip lock validation ────────────────────────────────────
  if (pool.sandboxMode) {
    const sandboxGames = getSandboxGamesForWeek(numWeek);
    const validGameIds = new Set(sandboxGames.map(g => g.id));
    const unknownSandboxIds = picks.filter(p => !validGameIds.has(p.gameId)).map(p => p.gameId);
    if (unknownSandboxIds.length > 0) {
      res.status(400).json({ error: `Unknown sandbox game IDs: ${unknownSandboxIds.join(", ")}` }); return;
    }
    const sandboxGameMap = new Map(sandboxGames.map(g => [g.id, g]));
    let saved = 0;
    for (const pick of picks) {
      const g = sandboxGameMap.get(pick.gameId)!;
      await db.insert(pickemPicksTable).values({
        poolId, userId, gameId: pick.gameId,
        gameDate: g.gameTime.slice(0, 10),
        week: numWeek, pickedTeamId: pick.pickedTeamId,
        pickedTeamName: pick.pickedTeamName, result: "pending",
      }).onConflictDoUpdate({
        target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
        set: { pickedTeamId: pick.pickedTeamId, pickedTeamName: pick.pickedTeamName, result: "pending", updatedAt: new Date() },
      });
      saved++;
    }
    // Week 18 sandbox: optionally save tiebreaker guesses (not required in sandbox)
    if (numWeek === NFL_TOTAL_WEEKS &&
        typeof tiebreakerPassingYards === "number" && isFinite(tiebreakerPassingYards) &&
        typeof tiebreakerRushingYards === "number" && isFinite(tiebreakerRushingYards)) {
      await db.update(entriesTable)
        .set({ tiebreakerPassingYards: Math.round(tiebreakerPassingYards), tiebreakerRushingYards: Math.round(tiebreakerRushingYards) } as any)
        .where(eq(entriesTable.id, entry.id));
    }
    res.status(201).json({ saved, skipped: 0 });
    return;
  }

  // ── Week 18 tiebreaker — required on final week, forbidden/ignored on all others ──
  if (numWeek === NFL_TOTAL_WEEKS) {
    if (typeof tiebreakerPassingYards !== "number" || !isFinite(tiebreakerPassingYards) ||
        typeof tiebreakerRushingYards !== "number" || !isFinite(tiebreakerRushingYards)) {
      res.status(400).json({ error: "tiebreakerPassingYards and tiebreakerRushingYards are required for Week 18" });
      return;
    }
  }

  const games = await fetchNflGamesByWeek(numWeek, pool.season);
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

  // Reject picks for games that already have a graded result (correct / incorrect).
  // This is a defence-in-depth check: even if the time-lock above is bypassed (e.g.
  // clock skew, future-season game IDs) we must never overwrite a graded result.
  const submittedGameIds = picks.map((p) => p.gameId);
  const existingGradedPicks = await db
    .select({ gameId: pickemPicksTable.gameId })
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.userId, userId),
        inArray(pickemPicksTable.gameId, submittedGameIds),
        sql`${pickemPicksTable.result} != 'pending'`,
      ),
    );
  if (existingGradedPicks.length > 0) {
    const gradedIds = existingGradedPicks.map((p) => p.gameId);
    res.status(400).json({
      error: `Cannot change picks for already-graded games: ${gradedIds.join(", ")}`,
    });
    return;
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
          // Intentionally omit result — never overwrite a graded (correct/incorrect) result.
          // New inserts start as "pending" via .values() above; updates preserve whatever
          // result the grading process already wrote.
          pickedTeamId: pick.pickedTeamId,
          pickedTeamName: pick.pickedTeamName,
          updatedAt: new Date(),
        },
      });
    saved++;
  }

  // Persist tiebreaker guesses for Week 18 (season champion resolution)
  if (numWeek === NFL_TOTAL_WEEKS) {
    await db.update(entriesTable)
      .set({ tiebreakerPassingYards: Math.round(tiebreakerPassingYards as number), tiebreakerRushingYards: Math.round(tiebreakerRushingYards as number) } as any)
      .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)));
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

  const [seasonAggregates, weeklyAggregates, tiebreakers, actualsRow] = await Promise.all([
    db
      .select({
        userId: pickemPicksTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
        seasonCorrect: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
        seasonTotal: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} IN ('correct', 'incorrect'))`,
      })
      .from(pickemPicksTable)
      .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
      .where(eq(pickemPicksTable.poolId, poolId))
      .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
      .orderBy(
        sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
        sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} IN ('correct', 'incorrect')) DESC`,
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
        tiebreakerPassingYards: entriesTable.tiebreakerPassingYards,
        tiebreakerRushingYards: entriesTable.tiebreakerRushingYards,
      })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, poolId)),
    db
      .select({
        actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
        actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
      })
      .from(nflConfidenceResultsTable)
      .where(and(eq(nflConfidenceResultsTable.poolId, poolId), eq(nflConfidenceResultsTable.week, NFL_TOTAL_WEEKS)))
      .limit(1),
  ]);

  const actualPassingYards: number | null = actualsRow[0]?.actualPassingYards ?? null;
  const actualRushingYards: number | null = actualsRow[0]?.actualRushingYards ?? null;

  const tiebreakerMap = new Map(tiebreakers.map(t => [t.userId, {
    tiebreakerPrediction: t.tiebreakerPrediction,
    tiebreakerPassingYards: t.tiebreakerPassingYards,
    tiebreakerRushingYards: t.tiebreakerRushingYards,
  }]));

  // When Week 18 actuals exist, re-sort to break ties by closest tiebreaker guess
  if (actualPassingYards !== null && actualRushingYards !== null) {
    const tbDelta = (uid: number) => {
      const g = tiebreakerMap.get(uid);
      if (g?.tiebreakerPassingYards == null || g?.tiebreakerRushingYards == null) return Infinity;
      return Math.abs(g.tiebreakerPassingYards - actualPassingYards) + Math.abs(g.tiebreakerRushingYards - actualRushingYards);
    };
    seasonAggregates.sort((a, b) => {
      const diff = Number(b.seasonCorrect) - Number(a.seasonCorrect);
      if (diff !== 0) return diff;
      return tbDelta(a.userId) - tbDelta(b.userId);
    });
  }

  const weeklyMap = new Map<number, Record<number, { correct: number; total: number }>>();
  for (const row of weeklyAggregates) {
    if (!weeklyMap.has(row.userId)) weeklyMap.set(row.userId, {});
    weeklyMap.get(row.userId)![row.week] = {
      correct: Number(row.correct),
      total: Number(row.total),
    };
  }

  // Per-field TB delta helpers (Infinity when guess or actuals are missing)
  const tbPassingDelta = (uid: number): number => {
    if (actualPassingYards === null) return Infinity;
    const g = tiebreakerMap.get(uid);
    if (g?.tiebreakerPassingYards == null) return Infinity;
    return Math.abs(g.tiebreakerPassingYards - actualPassingYards);
  };
  const tbRushingDelta = (uid: number): number => {
    if (actualRushingYards === null) return Infinity;
    const g = tiebreakerMap.get(uid);
    if (g?.tiebreakerRushingYards == null) return Infinity;
    return Math.abs(g.tiebreakerRushingYards - actualRushingYards);
  };

  // Group players by seasonCorrect, sorted descending
  const groupMap = new Map<number, typeof seasonAggregates>();
  for (const u of seasonAggregates) {
    const k = Number(u.seasonCorrect);
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k)!.push(u);
  }
  const sortedKeys = [...groupMap.keys()].sort((a, b) => b - a);

  type LeaderboardEntry = {
    rank: number;
    userId: number;
    username: string;
    displayName: string | null;
    seasonCorrect: number;
    seasonTotal: number;
    tiebreakerPassingYards: number | null;
    tiebreakerRushingYards: number | null;
    tiebreakerDiff1: number | null;
    tiebreakerDiff2: number | null;
    potSplit: boolean;
    weeklyScores: Record<string, { correct: number; total: number }>;
  };
  const entries: LeaderboardEntry[] = [];
  let currentRank = 1;

  for (const key of sortedKeys) {
    const group = groupMap.get(key)!;

    if (group.length === 1 || actualPassingYards === null) {
      // Single player, or actuals not yet available — no tiebreaker to apply
      for (const u of group) {
        const tb = tiebreakerMap.get(u.userId);
        entries.push({
          rank: currentRank,
          userId: u.userId,
          username: u.username,
          displayName: u.displayName ?? null,
          seasonCorrect: Number(u.seasonCorrect),
          seasonTotal: Number(u.seasonTotal),
          tiebreakerPassingYards: tb?.tiebreakerPassingYards ?? null,
          tiebreakerRushingYards: tb?.tiebreakerRushingYards ?? null,
          tiebreakerDiff1: null,
          tiebreakerDiff2: null,
          potSplit: group.length > 1,
          weeklyScores: weeklyMap.get(u.userId) ?? {},
        });
      }
      currentRank += group.length;
      continue;
    }

    // Sort within tied group: TB1 (passing delta) first, TB2 (rushing delta) second
    group.sort((a, b) => {
      const d1 = tbPassingDelta(a.userId) - tbPassingDelta(b.userId);
      if (d1 !== 0) return d1;
      return tbRushingDelta(a.userId) - tbRushingDelta(b.userId);
    });

    // Assign sub-ranks; flag sub-groups that are still tied after both TBs
    let i = 0;
    while (i < group.length) {
      const d1 = tbPassingDelta(group[i].userId);
      const d2 = tbRushingDelta(group[i].userId);
      let j = i + 1;
      while (j < group.length &&
             tbPassingDelta(group[j].userId) === d1 &&
             tbRushingDelta(group[j].userId) === d2) {
        j++;
      }
      const subGroup = group.slice(i, j);
      const potSplit = subGroup.length > 1;
      for (const u of subGroup) {
        const tb = tiebreakerMap.get(u.userId);
        entries.push({
          rank: currentRank + i,
          userId: u.userId,
          username: u.username,
          displayName: u.displayName ?? null,
          seasonCorrect: Number(u.seasonCorrect),
          seasonTotal: Number(u.seasonTotal),
          tiebreakerPassingYards: tb?.tiebreakerPassingYards ?? null,
          tiebreakerRushingYards: tb?.tiebreakerRushingYards ?? null,
          tiebreakerDiff1: isFinite(d1) ? d1 : null,
          tiebreakerDiff2: isFinite(d2) ? d2 : null,
          potSplit,
          weeklyScores: weeklyMap.get(u.userId) ?? {},
        });
      }
      i = j;
    }
    currentRank += group.length;
  }

  res.json({ currentWeek: pool.currentWeek, totalWeeks: NFL_TOTAL_WEEKS, actualPassingYards, actualRushingYards, entries });
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

  const games = await fetchNflGamesByWeek(week, pool.season);
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

  // Build a score/winner map for storage alongside each pick's result
  const gameScoreMap = new Map<string, { awayScore: number; homeScore: number; winnerTeamId: string | null }>();
  for (const game of completedGames) {
    if (game.homeScore != null && game.awayScore != null) {
      gameScoreMap.set(game.id, {
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        winnerTeamId: winnerMap.get(game.id) ?? null,
      });
    }
  }

  let graded = 0;
  for (const pick of pendingPicks) {
    const winner = winnerMap.get(pick.gameId);
    if (winner === undefined) continue;
    const result: "correct" | "incorrect" =
      winner !== null && pick.pickedTeamId === winner ? "correct" : "incorrect";
    const scores = gameScoreMap.get(pick.gameId);
    await db
      .update(pickemPicksTable)
      .set({
        result,
        updatedAt: new Date(),
        ...(scores ? { awayScore: scores.awayScore, homeScore: scores.homeScore, winnerTeamId: scores.winnerTeamId } : {}),
      })
      .where(eq(pickemPicksTable.id, pick.id));
    graded++;
  }

  // Week 18: fetch real tiebreaker actuals from ESPN and write to nfl_confidence_results
  let actualPassingYards: number | null = null;
  let actualRushingYards: number | null = null;
  if (week === NFL_TOTAL_WEEKS && completedGameIds.length > 0) {
    try {
      const stats = await fetchNflWeek18TiebreakerStats(completedGameIds);
      if (stats) {
        actualPassingYards = stats.actualPassingYards;
        actualRushingYards = stats.actualRushingYards;
        await db
          .insert(nflConfidenceResultsTable)
          .values({ poolId, week: NFL_TOTAL_WEEKS, actualPassingYards, actualRushingYards })
          .onConflictDoUpdate({
            target: [nflConfidenceResultsTable.poolId, nflConfidenceResultsTable.week],
            set: { actualPassingYards, actualRushingYards, recordedAt: new Date() },
          });
        req.log.info({ poolId, week, actualPassingYards, actualRushingYards }, "pickem-season Week 18 tiebreaker actuals recorded");
      } else {
        req.log.warn({ poolId, week }, "pickem-season Week 18: ESPN stats unavailable, tiebreaker actuals not recorded");
      }
    } catch (err) {
      req.log.error({ err, poolId, week }, "pickem-season Week 18: failed to fetch ESPN tiebreaker stats");
    }
  }

  res.json({
    graded,
    week,
    completedGames: completedGameIds.length,
    ...(actualPassingYards != null ? { actualPassingYards, actualRushingYards } : {}),
  });
});

// GET /api/pools/:poolId/pickem-season/week-results?week=N
router.get("/week-results", requireAuth, async (req, res) => {
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

  const [rawGames, allPicks] = await Promise.all([
    pool.sandboxMode
      ? Promise.resolve(getSandboxGamesForWeek(pool.sandboxWeek ?? week).map(sandboxGameToPickEmShape))
      : fetchNflGamesByWeek(week, pool.season).then(gs => gs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())),
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
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week))),
  ]);

  // normalise to a common shape: { id, date, status, awayTeam, homeTeam, awayScore, homeScore }
  type GameRow = { id: string; date: string; status: string; awayTeam: { id: string; displayName: string; abbreviation: string; logo?: string | null }; homeTeam: { id: string; displayName: string; abbreviation: string; logo?: string | null }; awayScore?: number | null; homeScore?: number | null; homeRecord?: string | null; awayRecord?: string | null; liveState?: { shortDetail: string | null } | null };
  const games: GameRow[] = pool.sandboxMode
    ? (rawGames as ReturnType<typeof sandboxGameToPickEmShape>[]).map(g => ({
        id: g.id,
        date: g.startTime,
        status: g.status,
        awayTeam: { id: g.awayTeam.id, displayName: g.awayTeam.name, abbreviation: g.awayTeam.abbreviation, logo: g.awayTeam.logoUrl },
        homeTeam: { id: g.homeTeam.id, displayName: g.homeTeam.name, abbreviation: g.homeTeam.abbreviation, logo: g.homeTeam.logoUrl },
        awayScore: null,
        homeScore: null,
        homeRecord: null,
        awayRecord: null,
      }))
    : (rawGames as Awaited<ReturnType<typeof fetchNflGamesByWeek>>);

  const picksByUser = new Map<number, { username: string; displayName: string | null; picks: typeof allPicks }>();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.userId)) {
      picksByUser.set(pick.userId, { username: pick.username, displayName: pick.displayName ?? null, picks: [] });
    }
    picksByUser.get(pick.userId)!.picks.push(pick);
  }

  const hasResults = allPicks.some(p => p.result === "correct" || p.result === "incorrect");

  const players = Array.from(picksByUser.entries()).map(([uid, data]) => {
    const correct = data.picks.filter(p => p.result === "correct").length;
    const total = data.picks.length;
    return {
      userId: uid,
      username: data.username,
      displayName: data.displayName,
      correct,
      total,
      picks: data.picks.map(p => ({
        gameId: p.gameId,
        pickedTeamId: p.pickedTeamId,
        pickedTeamName: p.pickedTeamName,
        result: p.result ?? null,
      })),
    };
  });

  players.sort((a, b) => b.correct - a.correct || b.total - a.total);

  let rank = 1;
  const rankedPlayers = players.map((p, i) => {
    if (i > 0 && p.correct < players[i - 1].correct) rank = i + 1;
    return { ...p, rank };
  });

  const maxCorrect = rankedPlayers[0]?.correct ?? 0;
  const winners =
    hasResults && maxCorrect > 0
      ? rankedPlayers
          .filter(p => p.correct === maxCorrect)
          .map(p => ({
            userId: p.userId,
            username: p.username,
            displayName: p.displayName,
            correct: p.correct,
            total: p.total,
          }))
      : [];

  const formattedGames = games.map(g => ({
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
    userPickTeamId: null,
    userPickResult: null,
    liveDetail: g.liveState?.shortDetail ?? null,
    homeRecord: g.homeRecord ?? null,
    awayRecord: g.awayRecord ?? null,
  }));

  res.json({ week, games: formattedGames, players: rankedPlayers, winners, hasResults });
});

// PATCH /api/pools/:poolId/pickem-season/sandbox-week
router.patch("/sandbox-week", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (pool.commissionerId !== userId && userRow?.role !== "admin") {
    res.status(403).json({ error: "Commissioner or admin only" }); return;
  }

  const week = Math.max(1, Math.min(NFL_TOTAL_WEEKS, parseInt(String(req.body.week)) || 1));
  await db.update(poolsTable).set({ sandboxWeek: week }).where(eq(poolsTable.id, poolId));
  res.json({ week });
});

// POST /api/pools/:poolId/pickem-season/simulate-grading
router.post("/simulate-grading", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "pickem_season") {
    res.status(400).json({ error: "Not an NFL Pick-Ems Season pool" }); return;
  }

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (pool.commissionerId !== userId && userRow?.role !== "admin") {
    res.status(403).json({ error: "Commissioner or admin only" }); return;
  }

  const week = pool.sandboxWeek ?? pool.currentWeek;
  const games = getSandboxGamesForWeek(week);

  // Random NFL-realistic scores (10–45, no ties), stored per game for display
  const winnerByTeamId = new Map<string, string>();
  const gameScores = new Map<string, { awayScore: number; homeScore: number; winnerTeamId: string }>();
  for (const game of games) {
    let homeScore = 10 + Math.floor(Math.random() * 36);
    let awayScore = 10 + Math.floor(Math.random() * 36);
    if (homeScore === awayScore) homeScore += 3;
    const winner = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
    winnerByTeamId.set(game.homeTeamId, winner);
    winnerByTeamId.set(game.awayTeamId, winner);
    gameScores.set(game.id, { awayScore, homeScore, winnerTeamId: winner });
  }

  const completedGameIds = Array.from(new Set(games.map(g => g.id)));
  const pendingPicks = await db.select().from(pickemPicksTable).where(
    and(
      eq(pickemPicksTable.poolId, poolId),
      eq(pickemPicksTable.week, week),
      eq(pickemPicksTable.result, "pending"),
      inArray(pickemPicksTable.gameId, completedGameIds),
    )
  );

  let graded = 0;
  for (const pick of pendingPicks) {
    const winner = winnerByTeamId.get(pick.pickedTeamId);
    if (winner === undefined) continue;
    const result: "correct" | "incorrect" = pick.pickedTeamId === winner ? "correct" : "incorrect";
    const scores = gameScores.get(pick.gameId);
    await db.update(pickemPicksTable).set({
      result,
      updatedAt: new Date(),
      ...(scores ? { awayScore: scores.awayScore, homeScore: scores.homeScore, winnerTeamId: scores.winnerTeamId } : {}),
    }).where(eq(pickemPicksTable.id, pick.id));
    graded++;
  }

  // Bug 2 fix: advance currentWeek so the WeekStrip unlocks the next week
  const nextWeek = Math.min(week + 1, NFL_TOTAL_WEEKS);
  if (nextWeek > pool.currentWeek) {
    await db.update(poolsTable).set({ currentWeek: nextWeek }).where(eq(poolsTable.id, poolId));
  }

  // Week 18 sandbox: generate random tiebreaker actuals so resolution can be tested end-to-end
  let tiebreakerActuals: { actualPassingYards: number; actualRushingYards: number } | null = null;
  if (week === NFL_TOTAL_WEEKS) {
    const actualPassingYards = 200 + Math.floor(Math.random() * 201); // 200–400
    const actualRushingYards = 50 + Math.floor(Math.random() * 151);  // 50–200
    await db
      .insert(nflConfidenceResultsTable)
      .values({ poolId, week: NFL_TOTAL_WEEKS, actualPassingYards, actualRushingYards })
      .onConflictDoUpdate({
        target: [nflConfidenceResultsTable.poolId, nflConfidenceResultsTable.week],
        set: { actualPassingYards, actualRushingYards, recordedAt: new Date() },
      });
    tiebreakerActuals = { actualPassingYards, actualRushingYards };
  }

  res.json({ graded, week, ...(tiebreakerActuals ? { tiebreakerActuals } : {}) });
});

export default router;
