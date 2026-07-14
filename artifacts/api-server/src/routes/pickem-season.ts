import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, usersTable, entriesTable, nflConfidenceResultsTable, pickemSeasonWeekGameCountsTable, sandboxGameScoresTable } from "@workspace/db";
import { eq, and, sql, inArray, isNotNull, count } from "drizzle-orm";
import { calcPrize, hasPrizePlace } from "../lib/prizeCalc";
import { requireAuth } from "../middlewares/auth";
import { fetchNflGamesByWeek, fetchNflWeek18TiebreakerStats } from "../lib/espn";
import { getSandboxGamesForWeek, sandboxGameToPickEmShape, NFL_TEAM_INFO } from "../lib/nfl2025Schedule";

const router = Router({ mergeParams: true });

const NFL_TOTAL_WEEKS = 18;

function isGameLocked(startIso: string): boolean {
  return new Date(startIso).getTime() <= Date.now();
}

// Shared helper: compute season totals, resolve tiebreaker, write final_winner + close pool.
// Called from both process-results (real games) and simulate-grading (sandbox).
// Idempotent: no-ops when pool.isActive is already false.
async function applyPickEmSeasonClosure(opts: {
  poolId: number;
  week: number;
  pool: { isActive: boolean };
  actualPassingYards: number | null;
  actualRushingYards: number | null;
  log: { info(obj: object, msg: string): void; warn(obj: object, msg?: string): void };
}): Promise<{ closureApplied: boolean; winnerCount: number }> {
  const { poolId, week, pool, log } = opts;
  let { actualPassingYards, actualRushingYards } = opts;

  if (week !== NFL_TOTAL_WEEKS || !pool.isActive) {
    return { closureApplied: false, winnerCount: 0 };
  }

  const seasonTotals = await db
    .select({
      userId: pickemPicksTable.userId,
      seasonCorrect: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
    })
    .from(pickemPicksTable)
    .where(eq(pickemPicksTable.poolId, poolId))
    .groupBy(pickemPicksTable.userId);

  if (seasonTotals.length === 0) {
    log.warn({ poolId }, "pickem-season Week 18 closure: no pick data — skipping");
    return { closureApplied: false, winnerCount: 0 };
  }

  const maxCorrect = Math.max(...seasonTotals.map((r) => Number(r.seasonCorrect)));
  let topGroup = seasonTotals.filter((r) => Number(r.seasonCorrect) === maxCorrect);

  if (topGroup.length > 1) {
    if (actualPassingYards === null) {
      const [stored] = await db
        .select({
          actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
          actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
        })
        .from(nflConfidenceResultsTable)
        .where(
          and(
            eq(nflConfidenceResultsTable.poolId, poolId),
            eq(nflConfidenceResultsTable.week, NFL_TOTAL_WEEKS),
          ),
        )
        .limit(1);
      actualPassingYards = stored?.actualPassingYards ?? null;
      actualRushingYards = stored?.actualRushingYards ?? null;
    }

    if (actualPassingYards !== null && actualRushingYards !== null) {
      const topUserIds = topGroup.map((r) => r.userId);
      const tbGuesses = await db
        .select({
          userId: entriesTable.userId,
          tiebreakerPassingYards: entriesTable.tiebreakerPassingYards,
          tiebreakerRushingYards: entriesTable.tiebreakerRushingYards,
        })
        .from(entriesTable)
        .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, topUserIds)));

      const tbMap = new Map(tbGuesses.map((g) => [g.userId, g]));
      const rpy = actualPassingYards;
      const rry = actualRushingYards;
      const tbDelta = (uid: number): number => {
        const g = tbMap.get(uid);
        if (g?.tiebreakerPassingYards == null || g?.tiebreakerRushingYards == null) return Infinity;
        return Math.abs(g.tiebreakerPassingYards - rpy) + Math.abs(g.tiebreakerRushingYards - rry);
      };

      topGroup.sort((a, b) => tbDelta(a.userId) - tbDelta(b.userId));
      const bestDelta = tbDelta(topGroup[0].userId);
      topGroup = topGroup.filter((r) => tbDelta(r.userId) === bestDelta);

      log.info(
        { poolId, resolvedPassingYards: actualPassingYards, resolvedRushingYards: actualRushingYards, bestDelta, remainingTied: topGroup.length },
        "pickem-season Week 18: yardage tiebreaker applied",
      );
    } else {
      log.info({ poolId }, "pickem-season Week 18: tiebreaker actuals unavailable — split declared");
    }
  }

  const winnerUserIds = topGroup.map((r) => r.userId);

  // Fetch pool prize fields for finish position / prize amount
  const [poolPrize] = await db
    .select({
      prizeStructure: poolsTable.prizeStructure,
      prizeMode: poolsTable.prizeMode,
      entryFee: poolsTable.entryFee,
      prizePot: poolsTable.prizePot,
    })
    .from(poolsTable)
    .where(eq(poolsTable.id, poolId))
    .limit(1);

  const ps = poolPrize?.prizeStructure ?? null;
  const totalEntries = seasonTotals.length;

  const firstPrize = calcPrize({
    place: 1, coWinners: winnerUserIds.length,
    prizeStructure: ps, prizeMode: poolPrize?.prizeMode,
    entryFee: poolPrize?.entryFee, prizePot: poolPrize?.prizePot,
    totalEntries,
  });

  await db
    .update(entriesTable)
    .set({ finalWinner: true, finishPosition: 1, prizeAmount: firstPrize })
    .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, winnerUserIds)));

  // Always write finishPosition for 2nd and 3rd place so every placer has a
  // recorded position regardless of whether the prize structure awards them
  // money.  prizeAmount is only written when the pool's prize structure
  // actually pays that place (hasPrizePlace guard stays on the prize calc only).
  const winnerSet = new Set(winnerUserIds);
  const nonWinners = seasonTotals
    .filter((r) => !winnerSet.has(r.userId))
    .sort((a, b) => Number(b.seasonCorrect) - Number(a.seasonCorrect));

  if (nonWinners.length > 0) {
    const place2Score = Number(nonWinners[0].seasonCorrect);
    const secondGroup = nonWinners.filter((r) => Number(r.seasonCorrect) === place2Score);
    const secondPrize = hasPrizePlace(ps, 2)
      ? calcPrize({ place: 2, coWinners: secondGroup.length, prizeStructure: ps, prizeMode: poolPrize?.prizeMode, entryFee: poolPrize?.entryFee, prizePot: poolPrize?.prizePot, totalEntries })
      : null;
    await db.update(entriesTable)
      .set({ finishPosition: 2, ...(secondPrize !== null ? { prizeAmount: secondPrize } : {}) })
      .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, secondGroup.map((r) => r.userId))));

    const rest2 = nonWinners.filter((r) => Number(r.seasonCorrect) !== place2Score);
    if (rest2.length > 0) {
      const place3Score = Number(rest2[0].seasonCorrect);
      const thirdGroup = rest2.filter((r) => Number(r.seasonCorrect) === place3Score);
      const thirdPrize = hasPrizePlace(ps, 3)
        ? calcPrize({ place: 3, coWinners: thirdGroup.length, prizeStructure: ps, prizeMode: poolPrize?.prizeMode, entryFee: poolPrize?.entryFee, prizePot: poolPrize?.prizePot, totalEntries })
        : null;
      await db.update(entriesTable)
        .set({ finishPosition: 3, ...(thirdPrize !== null ? { prizeAmount: thirdPrize } : {}) })
        .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, thirdGroup.map((r) => r.userId))));
    }
  }

  await db
    .update(poolsTable)
    .set({ isActive: false, endedAt: new Date() })
    .where(eq(poolsTable.id, poolId));

  log.info(
    { poolId, maxCorrect, winnerCount: winnerUserIds.length, winnerUserIds },
    "pickem-season Week 18: season closed",
  );

  return { closureApplied: true, winnerCount: winnerUserIds.length };
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
    // Check for replay rows first
    const replayRows = await db
      .select()
      .from(sandboxGameScoresTable)
      .where(and(
        eq(sandboxGameScoresTable.poolId, poolId),
        eq(sandboxGameScoresTable.week, week),
        isNotNull(sandboxGameScoresTable.gameStatus),
      ));

    if (replayRows.length > 0) {
      // Replay Mode — build game list ENTIRELY from sandbox_game_scores (real ESPN data)
      // Do NOT use the static schedule — it has different matchups than ESPN
      const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500";
      const formattedGames = replayRows.map(r => {
        const awayAbbr = r.awayTeam ?? "";
        const homeAbbr = r.homeTeam ?? "";
        const awayInfo = NFL_TEAM_INFO[awayAbbr];
        const homeInfo = NFL_TEAM_INFO[homeAbbr];
        const gameStatus = r.gameStatus ?? "scheduled";
        const status = gameStatus === "final" ? "final"
          : gameStatus !== "scheduled" ? "in_progress"
          : r.replayKickoff && new Date(r.replayKickoff) <= new Date() ? "in_progress"
          : "scheduled";
        // Look up existing pick by ESPN game ID
        const existing = pickMap.get(r.gameId);
        return {
          id: r.gameId,
          startTime: r.replayKickoff ? r.replayKickoff.toISOString() : "",
          status,
          deadlinePassed: status === "final" || status === "in_progress",
          awayTeam: {
            id: awayInfo?.id ?? awayAbbr,
            name: awayInfo?.displayName ?? awayAbbr,
            abbreviation: awayAbbr,
            logoUrl: `${LOGO_BASE}/${awayAbbr.toLowerCase()}.png`,
          },
          homeTeam: {
            id: homeInfo?.id ?? homeAbbr,
            name: homeInfo?.displayName ?? homeAbbr,
            abbreviation: homeAbbr,
            logoUrl: `${LOGO_BASE}/${homeAbbr.toLowerCase()}.png`,
          },
          awayScore: r.awayScore ?? null,
          homeScore: r.homeScore ?? null,
          userPickTeamId: existing?.pickedTeamId ?? null,
          userPickResult: existing?.result ?? null,
          liveDetail: (() => {
            const s = r.gameStatus;
            if (s === "q1") return "Q1";
            if (s === "q2") return "Q2";
            if (s === "halftime") return "HALF";
            if (s === "q3") return "Q3";
            if (s === "q4") return "Q4";
            return null;
          })(),
          homeRecord: null,
          awayRecord: null,
        };
      });
      res.json({ week, totalWeeks: NFL_TOTAL_WEEKS, currentWeek: pool.currentWeek, games: formattedGames, sandboxMode: true, replayMode: true });
      return;
    }

    // Static sandbox (no replay rows)
    const sandboxGames = getSandboxGamesForWeek(week);
    const formattedGames = sandboxGames.map(g => {
      const shaped = sandboxGameToPickEmShape(g);
      const existing = pickMap.get(g.id);
      const awayScore = existing?.awayScore ?? null;
      const homeScore = existing?.homeScore ?? null;
      const isGraded  = existing?.result != null && existing.result !== "pending";
      return {
        ...shaped,
        status:       isGraded && awayScore != null ? "final" : shaped.status,
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

  // Auto-designate: last game of the week by start time is the tiebreaker reference game (Week 18 only)
  const tiebreakerGameId = week === NFL_TOTAL_WEEKS ? (games.at(-1)?.id ?? null) : null;

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
    ...(tiebreakerGameId !== null && { tiebreakerGameId }),
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
    // Check for replay rows first
    const replayRows = await db
      .select()
      .from(sandboxGameScoresTable)
      .where(and(
        eq(sandboxGameScoresTable.poolId, poolId),
        eq(sandboxGameScoresTable.week, numWeek),
        isNotNull(sandboxGameScoresTable.gameStatus),
      ));

    if (replayRows.length > 0) {
      // Replay mode — validate against sandbox_game_scores (ESPN game IDs)
      const replayGameMap = new Map(replayRows.map(r => [r.gameId, r]));
      const unknownIds = picks.filter(p => !replayGameMap.has(p.gameId)).map(p => p.gameId);
      if (unknownIds.length > 0) {
        res.status(400).json({ error: `Unknown replay game IDs: ${unknownIds.join(", ")}` }); return;
      }
      // Check lock — don't allow picks on games that have already started
      const lockedIds = picks.filter(p => {
        const r = replayGameMap.get(p.gameId);
        return r?.replayKickoff && new Date(r.replayKickoff) <= new Date();
      }).map(p => p.gameId);
      if (lockedIds.length > 0) {
        res.status(400).json({ error: "Some games have already locked." }); return;
      }
      // Save picks using ESPN game IDs
      for (const pick of picks) {
        const r = replayGameMap.get(pick.gameId)!;
        const awayInfo = NFL_TEAM_INFO[r.awayTeam ?? ""];
        const homeInfo = NFL_TEAM_INFO[r.homeTeam ?? ""];
        const pickedIsHome = pick.pickedTeamId === (homeInfo?.id ?? r.homeTeam);
        const pickedTeamName = pickedIsHome
          ? (homeInfo?.displayName ?? r.homeTeam ?? "")
          : (awayInfo?.displayName ?? r.awayTeam ?? "");
        await db.insert(pickemPicksTable).values({
          poolId,
          userId,
          week: numWeek,
          gameId: pick.gameId,
          pickedTeamId: pick.pickedTeamId,
          pickedTeamName,
          gameDate: r.replayKickoff ? r.replayKickoff.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          result: "pending",
        }).onConflictDoUpdate({
          target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
          set: { pickedTeamId: pick.pickedTeamId, pickedTeamName, result: "pending" },
        });
      }
      res.json({ saved: picks.length, skipped: 0 });
      return;
    }

    // Static sandbox fallback
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

  const [seasonAggregates, weeklyAggregates, tiebreakers, actualsRow, storedGameCounts, fallbackDistinctCounts] = await Promise.all([
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
    // Stored game counts written by process-results / simulate-grading
    db
      .select({
        week: pickemSeasonWeekGameCountsTable.week,
        gameCount: pickemSeasonWeekGameCountsTable.gameCount,
      })
      .from(pickemSeasonWeekGameCountsTable)
      .where(eq(pickemSeasonWeekGameCountsTable.poolId, poolId)),
    // Fallback for historical weeks (before this fix): count distinct game IDs
    // from graded picks — accurate as long as at least one player picked each game
    db
      .select({
        week: pickemPicksTable.week,
        gameCount: sql<string>`COUNT(DISTINCT ${pickemPicksTable.gameId})`,
      })
      .from(pickemPicksTable)
      .where(and(
        eq(pickemPicksTable.poolId, poolId),
        sql`${pickemPicksTable.result} IN ('correct', 'incorrect')`,
      ))
      .groupBy(pickemPicksTable.week),
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

  // Build a week → gameCount map: prefer stored counts, fall back to distinct-gameId count
  // from graded picks (covers historical weeks graded before this fix was deployed).
  const weekGameCountMap = new Map<number, number>();
  for (const row of storedGameCounts) {
    weekGameCountMap.set(row.week, row.gameCount);
  }
  for (const row of fallbackDistinctCounts) {
    if (!weekGameCountMap.has(row.week)) {
      weekGameCountMap.set(row.week, Number(row.gameCount));
    }
  }

  // weeklyMap: per-user per-week scores.  The denominator (total) is always the
  // full game count for that week — not just the picks the player submitted.
  // For ungraded/pending weeks the total falls back to submitted pick count.
  const weeklyMap = new Map<number, Record<number, { correct: number; total: number }>>();
  const userSeasonTotals = new Map<number, number>();

  for (const row of weeklyAggregates) {
    if (!weeklyMap.has(row.userId)) weeklyMap.set(row.userId, {});
    const correct = Number(row.correct);
    const storedTotal = weekGameCountMap.get(row.week);
    // Use the full game count for graded weeks; fall back to submitted count for pending weeks
    const weekTotal = storedTotal ?? Number(row.total);

    weeklyMap.get(row.userId)![row.week] = { correct, total: weekTotal };

    // Season total: accumulate only for graded weeks (those with a known game count)
    if (storedTotal !== undefined) {
      userSeasonTotals.set(row.userId, (userSeasonTotals.get(row.userId) ?? 0) + storedTotal);
    }
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
          seasonTotal: userSeasonTotals.get(u.userId) ?? Number(u.seasonTotal),
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
          seasonTotal: userSeasonTotals.get(u.userId) ?? Number(u.seasonTotal),
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

  // Week 18: fetch tiebreaker actuals for the auto-designated last game only.
  // Auto-designate: last game of Week 18 by start time (same pattern as NFL Confidence Season).
  // Only write actuals once that specific game is complete — commissioner can re-run after it finishes.
  let actualPassingYards: number | null = null;
  let actualRushingYards: number | null = null;
  if (week === NFL_TOTAL_WEEKS) {
    const sortedAllGames = [...games].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastGame = sortedAllGames.at(-1);
    const isLastGameComplete = lastGame ? completedGames.some(g => g.id === lastGame.id) : false;
    if (lastGame && isLastGameComplete) {
      try {
        const stats = await fetchNflWeek18TiebreakerStats([lastGame.id]);
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
          req.log.info({ poolId, week, lastGameId: lastGame.id, actualPassingYards, actualRushingYards }, "pickem-season Week 18 tiebreaker actuals recorded for last game");
        } else {
          req.log.warn({ poolId, week, lastGameId: lastGame.id }, "pickem-season Week 18: ESPN stats unavailable, tiebreaker actuals not recorded");
        }
      } catch (err) {
        req.log.error({ err, poolId, week }, "pickem-season Week 18: failed to fetch ESPN tiebreaker stats");
      }
    } else if (lastGame) {
      req.log.info({ poolId, week, lastGameId: lastGame.id }, "pickem-season Week 18: last game not yet complete, tiebreaker actuals deferred");
    }
  }

  // Record the full game count for this week so the leaderboard can use the
  // correct denominator even when players submitted incomplete picks.
  await db
    .insert(pickemSeasonWeekGameCountsTable)
    .values({ poolId, week, gameCount: games.length })
    .onConflictDoUpdate({
      target: [pickemSeasonWeekGameCountsTable.poolId, pickemSeasonWeekGameCountsTable.week],
      set: { gameCount: games.length, recordedAt: new Date() },
    });

  // ── Season-end closure (Week 18 only) ─────────────────────────────────────
  // Fires when every Week 18 game is complete. Idempotent: skips if the pool
  // is already closed (commissioner re-runs process-results after closure).
  let closureApplied = false;
  let closureWinnerCount = 0;
  if (week === NFL_TOTAL_WEEKS && pool.isActive) {
    const allGamesComplete =
      games.length > 0 &&
      games.every((g) => completedGames.some((c) => c.id === g.id));

    if (!allGamesComplete) {
      req.log.info(
        { poolId, week, total: games.length, completed: completedGames.length },
        "pickem-season Week 18: not all games complete — season closure deferred",
      );
    } else {
      const result = await applyPickEmSeasonClosure({
        poolId, week, pool,
        actualPassingYards,
        actualRushingYards,
        log: req.log,
      });
      closureApplied = result.closureApplied;
      closureWinnerCount = result.winnerCount;
    }
  }

  res.json({
    graded,
    week,
    completedGames: completedGameIds.length,
    ...(actualPassingYards != null ? { actualPassingYards, actualRushingYards } : {}),
    ...(closureApplied ? { seasonClosed: true, winnerCount: closureWinnerCount } : {}),
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
      ? (async () => {
          const replayRows = await db
            .select()
            .from(sandboxGameScoresTable)
            .where(and(
              eq(sandboxGameScoresTable.poolId, poolId),
              eq(sandboxGameScoresTable.week, week),
              isNotNull(sandboxGameScoresTable.gameStatus),
            ));
          if (replayRows.length > 0) {
            const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500";
            return replayRows.map(r => ({
              id: r.gameId,
              startTime: r.replayKickoff ? r.replayKickoff.toISOString() : "",
              status: r.gameStatus === "final" ? "final"
                : r.gameStatus !== "scheduled" ? "in_progress"
                : "scheduled",
              awayTeam: {
                id: NFL_TEAM_INFO[r.awayTeam ?? ""]?.id ?? r.awayTeam ?? "",
                name: NFL_TEAM_INFO[r.awayTeam ?? ""]?.displayName ?? r.awayTeam ?? "",
                abbreviation: r.awayTeam ?? "",
                logoUrl: `${LOGO_BASE}/${(r.awayTeam ?? "").toLowerCase()}.png`,
              },
              homeTeam: {
                id: NFL_TEAM_INFO[r.homeTeam ?? ""]?.id ?? r.homeTeam ?? "",
                name: NFL_TEAM_INFO[r.homeTeam ?? ""]?.displayName ?? r.homeTeam ?? "",
                abbreviation: r.homeTeam ?? "",
                logoUrl: `${LOGO_BASE}/${(r.homeTeam ?? "").toLowerCase()}.png`,
              },
              awayScore: r.awayScore ?? null,
              homeScore: r.homeScore ?? null,
            }));
          }
          return getSandboxGamesForWeek(pool.sandboxWeek ?? week).map(sandboxGameToPickEmShape);
        })()
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

  // total is always the full game count for the week, regardless of how many
  // picks the player submitted — unpicked games count as incorrect (0 correct).
  const totalGamesInSlate = games.length;
  const players = Array.from(picksByUser.entries()).map(([uid, data]) => {
    const correct = data.picks.filter(p => p.result === "correct").length;
    const total = totalGamesInSlate;
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

  // Record the full game count for this week (same as process-results does for real games)
  await db
    .insert(pickemSeasonWeekGameCountsTable)
    .values({ poolId, week, gameCount: games.length })
    .onConflictDoUpdate({
      target: [pickemSeasonWeekGameCountsTable.poolId, pickemSeasonWeekGameCountsTable.week],
      set: { gameCount: games.length, recordedAt: new Date() },
    });

  // Bug 2 fix: advance currentWeek so the WeekStrip unlocks the next week
  const nextWeek = Math.min(week + 1, NFL_TOTAL_WEEKS);
  if (nextWeek > pool.currentWeek) {
    await db.update(poolsTable).set({ currentWeek: nextWeek }).where(eq(poolsTable.id, poolId));
  }

  // Week 18 sandbox: generate random tiebreaker actuals, then run season-end closure
  // so simulate-grading is a complete end-to-end test (no separate process-results call needed).
  let tiebreakerActuals: { actualPassingYards: number; actualRushingYards: number } | null = null;
  let sandboxClosure: { closureApplied: boolean; winnerCount: number } | null = null;
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

    // Re-read pool so isActive reflects current DB state (handles re-runs on already-closed pools)
    const [freshPool] = await db.select({ isActive: poolsTable.isActive }).from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
    if (freshPool) {
      sandboxClosure = await applyPickEmSeasonClosure({
        poolId, week, pool: freshPool,
        actualPassingYards,
        actualRushingYards,
        log: req.log,
      });
    }
  }

  res.json({
    graded,
    week,
    ...(tiebreakerActuals ? { tiebreakerActuals } : {}),
    ...(sandboxClosure?.closureApplied ? { seasonClosed: true, winnerCount: sandboxClosure.winnerCount } : {}),
  });
});

// GET /api/pools/:poolId/pickem-season/grid?week=W
router.get("/grid", requireAuth, async (req, res) => {
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
  const weekParam = req.query.week ? parseInt(String(req.query.week)) : pool.currentWeek;
  const week = isNaN(weekParam) ? pool.currentWeek : weekParam;
  const allPicks = await db
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
    .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week)));
  const isSandbox = pool.sandboxMode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameMap = new Map<string, any>();
  if (isSandbox) {
    const replayRows = await db
      .select()
      .from(sandboxGameScoresTable)
      .where(and(
        eq(sandboxGameScoresTable.poolId, poolId),
        eq(sandboxGameScoresTable.week, week),
        isNotNull(sandboxGameScoresTable.gameStatus),
      ));
    const sandboxGames = getSandboxGamesForWeek(week);
    if (replayRows.length > 0) {
      // Replay mode — key by ESPN game ID directly (matches how picks are stored)
      const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500";
      for (const r of replayRows) {
        const awayAbbr = r.awayTeam ?? "";
        const homeAbbr = r.homeTeam ?? "";
        const awayInfo = NFL_TEAM_INFO[awayAbbr];
        const homeInfo = NFL_TEAM_INFO[homeAbbr];
        const gameStatus = r.gameStatus ?? "scheduled";
        const status = gameStatus === "final" ? "final"
          : gameStatus !== "scheduled" ? "in_progress"
          : r.replayKickoff && new Date(r.replayKickoff) <= new Date() ? "in_progress"
          : "scheduled";
        gameMap.set(r.gameId, {
          id: r.gameId,
          awayTeam: {
            id: awayInfo?.id ?? awayAbbr,
            name: awayInfo?.displayName ?? awayAbbr,
            abbreviation: awayAbbr,
            logoUrl: `${LOGO_BASE}/${awayAbbr.toLowerCase()}.png`,
          },
          homeTeam: {
            id: homeInfo?.id ?? homeAbbr,
            name: homeInfo?.displayName ?? homeAbbr,
            abbreviation: homeAbbr,
            logoUrl: `${LOGO_BASE}/${homeAbbr.toLowerCase()}.png`,
          },
          startTime: r.replayKickoff ? r.replayKickoff.toISOString() : "",
          status,
          awayScore: r.awayScore ?? null,
          homeScore: r.homeScore ?? null,
        });
      }
    } else {
      for (const g of sandboxGames) {
        gameMap.set(g.id, sandboxGameToPickEmShape(g));
      }
    }
  } else {
    // Live ESPN path
    try {
      const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const espnData = (await (await fetch(espnUrl)).json()) as { events?: any[] };
      for (const ev of espnData.events ?? []) {
        const comp = ev.competitions?.[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
        const isCompleted = comp?.status?.type?.completed ?? false;
        const state = comp?.status?.type?.state ?? "pre";
        const gameId = String(ev.id);
        gameMap.set(gameId, {
          id: gameId,
          homeTeam: { id: String(home?.team?.id ?? ""), abbreviation: home?.team?.abbreviation ?? "", name: home?.team?.displayName ?? "", logoUrl: home?.team?.logo ?? null },
          awayTeam: { id: String(away?.team?.id ?? ""), abbreviation: away?.team?.abbreviation ?? "", name: away?.team?.displayName ?? "", logoUrl: away?.team?.logo ?? null },
          homeScore: home?.score != null ? parseInt(String(home.score)) : null,
          awayScore: away?.score != null ? parseInt(String(away.score)) : null,
          startTime: ev.date ?? "",
          status: isCompleted ? "final" : state === "in" ? "in_progress" : "scheduled",
        });
      }
    } catch { /* ESPN unavailable */ }
  }
  const userMap = new Map<number, {
    userId: number;
    username: string;
    displayName: string | null;
    picks: Map<string, {
      pickedTeamId: string;
      pickedTeamName: string;
      pickedTeamLogoUrl: string | null;
      result: string | null;
    }>;
  }>();
  for (const pick of allPicks) {
    if (!userMap.has(pick.userId)) {
      userMap.set(pick.userId, {
        userId: pick.userId,
        username: pick.username,
        displayName: pick.displayName ?? null,
        picks: new Map(),
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = gameMap.get(pick.gameId) as any;
    const pickedIsHome = game ? pick.pickedTeamId === game.homeTeam.id : false;
    userMap.get(pick.userId)!.picks.set(pick.gameId, {
      pickedTeamId: pick.pickedTeamId,
      pickedTeamName: pick.pickedTeamName,
      pickedTeamLogoUrl: game ? (pickedIsHome ? game.homeTeam.logoUrl : game.awayTeam.logoUrl) ?? null : null,
      result: pick.result ?? null,
    });
  }
  // Visibility rule
  {
    const totalGamesInWeek = gameMap.size;
    const now = Date.now();
    const slateIsLive =
      totalGamesInWeek === 0 ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [...gameMap.values()].some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (g: any) =>
          new Date(g.startTime).getTime() <= now ||
          (g.status && g.status !== "scheduled"),
      );
    if (!slateIsLive) {
      for (const [uid, player] of userMap) {
        if (uid === userId) continue;
        if (player.picks.size >= totalGamesInWeek) continue;
        player.picks.clear();
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = [...gameMap.values()].map((g: any) => ({
    id: g.id,
    awayTeam: g.awayTeam,
    homeTeam: g.homeTeam,
    startTime: g.startTime,
    status: g.status,
    awayScore: g.awayScore ?? null,
    homeScore: g.homeScore ?? null,
  }));
  const players = Array.from(userMap.values()).map(u => ({
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    picks: Object.fromEntries(u.picks.entries()),
  }));
  res.json({ week, games, players });
});

export default router;
