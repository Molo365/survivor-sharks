import { Router } from "express";
import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, usersTable, weekResultsTable, sandboxGameScoresTable } from "@workspace/db";
import { eq, and, count, isNotNull, inArray } from "drizzle-orm";
import { calcPrize } from "../lib/prizeCalc";
import { requireAuth } from "../middlewares/auth";
import {
  isPickLocked,
  isMlbPickDeadlinePassed,
  getTodayEtDate,
  formatDateEt,
  isDailyPickDeadlinePassed,
  fetchGamesForDate,
  fetchNhlGamesByWeek,
  NHL_SANDBOX_ANCHOR,
} from "../lib/espn";
import { resolveTeam } from "../lib/teams-data";
import { getSandboxGamesForWeek } from "../lib/nfl2025Schedule";

const router = Router({ mergeParams: true });

function formatPick(pick: typeof picksTable.$inferSelect, username: string) {
  return {
    id: pick.id,
    entryId: pick.entryId,
    poolId: pick.poolId,
    userId: pick.userId,
    username,
    teamId: pick.teamId,
    teamName: pick.teamName,
    teamLogoUrl: pick.teamLogoUrl,
    week: pick.week,
    pickDate: pick.pickDate ?? null,
    result: pick.result,
    submittedAt: pick.submittedAt.toISOString(),
  };
}

// GET /api/pools/:poolId/picks  — current user's picks in this pool
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const picks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, userId)));

  res.json(picks.map(p => formatPick(p, req.user!.username)));
});

// POST /api/pools/:poolId/picks
router.post("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;
  const { teamId, week, teamName: clientTeamName, teamLogoUrl: clientTeamLogoUrl } = req.body;

  if (!teamId) {
    res.status(400).json({ error: "teamId is required" });
    return;
  }

  // Load pool first (needed to determine pick flow)
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  if (!pool.isActive) {
    res.status(400).json({ error: "This pool has ended — picks are no longer accepted." });
    return;
  }

  // Check entry exists and is alive
  const [entry] = await db.select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);

  if (!entry) {
    res.status(403).json({ error: "Not a member of this pool" });
    return;
  }
  if (entry.status === "eliminated") {
    res.status(400).json({ error: "Eliminated players cannot make picks" });
    return;
  }

  // Load all user's picks for this pool
  const previousPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, userId)));

  // Resolve team metadata (prefer client-supplied values for accuracy)
  const resolved = resolveTeam(pool.sport, teamId);
  const teamName = (typeof clientTeamName === "string" && clientTeamName.trim())
    ? clientTeamName.trim()
    : resolved.teamName;
  const teamLogoUrl = (typeof clientTeamLogoUrl === "string" && clientTeamLogoUrl)
    ? clientTeamLogoUrl
    : resolved.teamLogoUrl;

  // ── DAILY MLB PICK FLOW ──────────────────────────────────────────────────
  if (pool.pickFrequency === "daily") {
    const todayEt = getTodayEtDate();
    const todayEspn = formatDateEt(new Date());
    const todayGames = await fetchGamesForDate("mlb", todayEspn);

    // Deadline: 5 minutes before first game of the day
    if (isDailyPickDeadlinePassed(todayGames)) {
      res.status(400).json({
        error: "Daily pick deadline has passed — picks are locked for today.",
      });
      return;
    }

    // New team's game must not have started
    const newTeamGame = todayGames.find(g =>
      g.homeTeam.id === teamId || g.awayTeam.id === teamId
    );
    if (newTeamGame?.hasStarted) {
      res.status(400).json({
        error: "That team's game has already started — choose a different team.",
      });
      return;
    }

    // If player already has a pick today, check whether it's locked
    const existingDailyPick = previousPicks.find(p => p.pickDate === todayEt);
    if (existingDailyPick) {
      const existingGame = todayGames.find(g =>
        g.homeTeam.id === existingDailyPick.teamId || g.awayTeam.id === existingDailyPick.teamId
      );
      if (existingGame?.hasStarted) {
        res.status(400).json({
          error: `Your pick (${existingDailyPick.teamName}) is locked — that game has already started.`,
        });
        return;
      }
    }

    // Team re-use: cannot pick the same team on any other day
    const usedOnAnotherDay = previousPicks.some(
      p => p.teamId === teamId && p.pickDate !== todayEt
    );
    if (usedOnAnotherDay) {
      res.status(400).json({ error: "You have already used this team on a previous day." });
      return;
    }

    // Upsert the daily pick (week = pool's current day counter)
    const dayNum = pool.currentWeek;
    let pick: typeof picksTable.$inferSelect;

    if (existingDailyPick) {
      const [updated] = await db.update(picksTable).set({
        teamId, teamName, teamLogoUrl, result: "pending",
      }).where(eq(picksTable.id, existingDailyPick.id)).returning();
      pick = updated;
    } else {
      const [inserted] = await db.insert(picksTable).values({
        entryId: entry.id,
        poolId,
        userId,
        teamId,
        teamName,
        teamLogoUrl,
        week: dayNum,
        pickDate: todayEt,
        result: "pending",
      }).returning();
      pick = inserted;
    }

    res.status(201).json(formatPick(pick, req.user!.username));
    return;
  }

  // ── WEEKLY / SEASON PICK FLOW ────────────────────────────────────────────
  if (!week) {
    res.status(400).json({ error: "teamId and week are required" });
    return;
  }

  // Week must match the pool's active week — applies even in sandbox mode.
  // Sandbox bypasses game-start timing locks, but never "wrong week" protection.
  if (week !== pool.currentWeek) {
    res.status(400).json({
      error: `Week ${week} is not currently active — picks can only be submitted for Week ${pool.currentWeek}.`,
    });
    return;
  }

  const existingPick = previousPicks.find(p => p.week === week);

  // ── Lock checks (skipped when sandbox mode is on) ────────────────────────
  if (!pool.sandboxMode) {
  if (pool.sport === "mlb") {
    // MLB weekly: entire week locks on Monday 10 PM ET
    if (isMlbPickDeadlinePassed(pool.createdAt, pool.currentWeek)) {
      res.status(400).json({
        error: "MLB pick deadline has passed (Monday 10 PM ET). Picks are locked for this week.",
      });
      return;
    }
  } else {
    // All other sports: lock once the picked team's game has started
    if (existingPick) {
      const currentlyLocked = await isPickLocked(pool.sport, existingPick.teamId, week, pool.createdAt);
      if (currentlyLocked) {
        res.status(400).json({
          error: `Your pick (${existingPick.teamName}) is locked — that game has already started`,
        });
        return;
      }
    }
    const newTeamLocked = await isPickLocked(pool.sport, teamId, week, pool.createdAt);
    if (newTeamLocked) {
      res.status(400).json({
        error: "That team's game has already started — choose a team that hasn't played yet",
      });
      return;
    }
  }
  } // end !pool.sandboxMode

  // Team re-use rules depend on pool type
  if (pool.poolType !== "weekly") {
    const relevantPicks = pool.poolType === "mid_season" && pool.startWeek
      ? previousPicks.filter(p => p.week >= pool.startWeek!)
      : previousPicks;

    // NHL Survivor Season allows each team to be picked up to 2 times; all other season/mid_season pools allow 1 use.
    const maxTeamUses = (pool.sport === "nhl" && pool.poolType === "season") ? 2 : 1;
    const timesUsed = relevantPicks.filter(p => p.teamId === teamId && p.week !== week).length;
    if (timesUsed >= maxTeamUses) {
      res.status(400).json({ error: timesUsed >= 2
        ? "You have already used this team twice — maximum reuse reached"
        : "You have already used this team in a previous week" });
      return;
    }
  }

  // Upsert pick for this week
  let pick: typeof picksTable.$inferSelect;

  if (existingPick) {
    const [updated] = await db.update(picksTable).set({
      teamId, teamName, teamLogoUrl, result: "pending",
    }).where(eq(picksTable.id, existingPick.id)).returning();
    pick = updated;
  } else {
    const [inserted] = await db.insert(picksTable).values({
      entryId: entry.id,
      poolId,
      userId,
      teamId,
      teamName,
      teamLogoUrl,
      week,
      result: "pending",
    }).returning();
    pick = inserted;
  }

  res.status(201).json(formatPick(pick, req.user!.username));
});

// POST /api/pools/:poolId/picks/simulate-grading — sandbox grading for Classic/Weekly Survivor
router.post("/simulate-grading", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (pool.commissionerId !== userId && userRow?.role !== "admin") {
    res.status(403).json({ error: "Commissioner or admin only" }); return;
  }
  if (pool.sport !== "nfl" && pool.sport !== "nhl") {
    res.status(400).json({ error: "Simulate grading is only available for NFL and NHL pools" }); return;
  }

  const week = pool.currentWeek;

  // Normalise game list to { id, homeTeamId, awayTeamId } regardless of sport.
  // NFL uses the static schedule; NHL fetches real historical ESPN data anchored
  // to the 2025-26 season opener via NHL_SANDBOX_ANCHOR.
  type SandboxGame = { id: string; homeTeamId: string; awayTeamId: string };
  let gameList: SandboxGame[];
  if (pool.sport === "nhl") {
    const nhlGames = await fetchNhlGamesByWeek(NHL_SANDBOX_ANCHOR, week);
    gameList = nhlGames.map(g => ({ id: g.id, homeTeamId: g.homeTeam.id, awayTeamId: g.awayTeam.id }));
  } else {
    const nflGames = getSandboxGamesForWeek(week);
    gameList = nflGames.map(g => ({ id: g.id, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId }));
  }

  // Load any previously stored scores for this pool/week so outcomes are
  // stable across repeated simulate-grading calls.
  const existingScoreRows = await db
    .select()
    .from(sandboxGameScoresTable)
    .where(and(eq(sandboxGameScoresTable.poolId, poolId), eq(sandboxGameScoresTable.week, week)));
  const gameScores = new Map<string, { homeScore: number; awayScore: number }>(
    existingScoreRows.map(r => [r.gameId, { homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0 }]),
  );

  // Generate and persist scores only for games that don't yet have stored scores.
  // NHL uses hockey-appropriate goal counts (0–7); NFL uses touchdown-scale scores.
  for (const game of gameList) {
    if (gameScores.has(game.id)) continue;
    let homeScore: number;
    let awayScore: number;
    if (pool.sport === "nhl") {
      homeScore = Math.floor(Math.random() * 8); // 0-7 goals
      awayScore = Math.floor(Math.random() * 8);
      if (homeScore === awayScore) homeScore = Math.min(homeScore + 1, 7); // no ties
    } else {
      homeScore = 10 + Math.floor(Math.random() * 36);
      awayScore = 10 + Math.floor(Math.random() * 36);
      if (homeScore === awayScore) homeScore += 3;
    }
    gameScores.set(game.id, { homeScore, awayScore });
    await db
      .insert(sandboxGameScoresTable)
      .values({ poolId, week, gameId: game.id, homeScore, awayScore })
      .onConflictDoNothing();
  }

  // Build winner/margin maps from the now-stable score map.
  const winnerByTeamId = new Map<string, string>();
  const marginByTeamId = new Map<string, number>();
  for (const game of gameList) {
    const scores = gameScores.get(game.id);
    if (!scores) continue;
    const { homeScore, awayScore } = scores;
    const winner = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
    winnerByTeamId.set(game.homeTeamId, winner);
    winnerByTeamId.set(game.awayTeamId, winner);
    const diff = homeScore - awayScore; // positive → home won
    marginByTeamId.set(game.homeTeamId, diff);
    marginByTeamId.set(game.awayTeamId, -diff);
  }

  // Phase 1: snapshot alive entries BEFORE grading
  const aliveAtStart = await db
    .select({ id: entriesTable.id, userId: entriesTable.userId, strikeCount: entriesTable.strikeCount })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
  const aliveUserIds = new Set(aliveAtStart.map(e => e.userId));

  // Load ALL picks for this week first so pickedUserIds is correct even on
  // repeated calls (when picks are already graded and pendingPicks is empty).
  // False forfeits occur when pickedUserIds is built only from pendingPicks:
  // on a second call every alive entry appears to have no pick → forfeit.
  const allPicksThisWeek = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));
  const pendingPicks = allPicksThisWeek.filter(p => p.result === "pending");

  // Phase 2: grade picks (no entry status changes yet)
  let graded = 0;
  const pickedUserIds = new Set(allPicksThisWeek.map(p => p.userId));
  const resultByPickId = new Map<number, "win" | "loss">();
  const lostEntryIds = new Set<number>();

  for (const pick of pendingPicks) {
    const winner = winnerByTeamId.get(pick.teamId);
    if (winner === undefined) continue;
    const result: "win" | "loss" = pick.teamId === winner ? "win" : "loss";
    const marginOfVictory = marginByTeamId.get(pick.teamId) ?? null;
    await db.update(picksTable).set({ result, marginOfVictory }).where(eq(picksTable.id, pick.id));
    resultByPickId.set(pick.id, result);
    if (result === "loss") lostEntryIds.add(pick.entryId);
    graded++;
  }

  // Phase 3: identify losers + forfeits among alive-at-start players
  const losersThisWeek = new Set<number>(); // userId
  let forfeitCount = 0;
  const forfeitEntryIds: number[] = [];

  for (const pick of pendingPicks) {
    if (aliveUserIds.has(pick.userId) && resultByPickId.get(pick.id) === "loss") {
      losersThisWeek.add(pick.userId);
    }
  }
  for (const entry of aliveAtStart) {
    if (!pickedUserIds.has(entry.userId)) {
      losersThisWeek.add(entry.userId);
      forfeitCount++;
      forfeitEntryIds.push(entry.id);
    }
  }

  // Phase 4: void / co-winner check (Classic Season only)
  const allAliveAtStartLost =
    aliveAtStart.length > 0 && losersThisWeek.size === aliveAtStart.length;
  let voidFired = false;
  let coWinnersTriggered = false;
  let coWinnerPrize: number | null = null;

  if (pool.poolType === "season" && allAliveAtStartLost) {
    if (week < 18) {
      voidFired = true;
    } else {
      coWinnersTriggered = true;
      const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
      if (ps && ps.length > 0) {
        coWinnerPrize = Math.floor(ps.reduce((sum, p) => sum + p.amount, 0) / aliveAtStart.length);
      } else if (pool.prizePot && pool.prizePot > 0) {
        coWinnerPrize = Math.floor(pool.prizePot / aliveAtStart.length);
      }
    }
  }

  // Phase 5: conditionally apply eliminations
  // NHL Survivor Season uses 3 lives (maxStrikes = 2 warning strikes before elimination).
  const maxStrikes = (pool.sport === "nhl" && pool.poolType === "season") ? 2 : 0;
  const aliveById = new Map(aliveAtStart.map(e => [e.id, e]));

  if (!voidFired && !coWinnersTriggered) {
    for (const entryId of [...lostEntryIds, ...forfeitEntryIds]) {
      if (maxStrikes > 0) {
        const entry = aliveById.get(entryId);
        const currentStrikes = entry?.strikeCount ?? 0;
        if (currentStrikes < maxStrikes) {
          // Use up one life — player survives with a warning strike
          await db.update(entriesTable)
            .set({ strikeCount: currentStrikes + 1, streak: 0 })
            .where(eq(entriesTable.id, entryId));
          continue;
        }
      }
      // Single-life pool, or strikes exhausted: permanent elimination
      await db.update(entriesTable)
        .set({ status: "eliminated", eliminatedWeek: week })
        .where(eq(entriesTable.id, entryId));
    }
  }

  // weekResultsTable record — parity with real grading
  const losingTeamIds = [
    ...new Set(
      pendingPicks
        .filter(p => {
          const w = winnerByTeamId.get(p.teamId);
          return w !== undefined && p.teamId !== w;
        })
        .map(p => p.teamId),
    ),
  ];
  // onConflictDoNothing: the unique (poolId, week) constraint ensures a second
  // call leaves the existing weekResults row untouched rather than crashing.
  await db.insert(weekResultsTable).values({
    poolId,
    week,
    losingTeamIds,
    isVoided: voidFired,
    processedBy: userId,
  }).onConflictDoNothing();

  // Pool closure
  let poolEnded = false;
  let sovUsed = false;

  if (!voidFired && pool.poolType !== "weekly") {
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;

    if (coWinnersTriggered) {
      await db.update(entriesTable)
        .set({ finalWinner: true, finishPosition: 1, prizeAmount: coWinnerPrize })
        .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
      await db.update(poolsTable)
        .set({ isActive: false, endedAt: new Date(), closureReason: "co_winners" })
        .where(eq(poolsTable.id, poolId));
      poolEnded = true;
    } else {
      const [{ remaining }] = await db
        .select({ remaining: count() })
        .from(entriesTable)
        .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

      const remainingCount = Number(remaining);

      if (remainingCount <= 1) {
        const [{ totalEntries }] = await db
          .select({ totalEntries: count() })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, poolId));
        const totalEntriesCount = Number(totalEntries);
        const firstPlaceCount = Math.max(1, remainingCount);
        const firstPrize = calcPrize({
          placeIndex: 0, coWinners: firstPlaceCount,
          prizeStructure: ps, prizeMode: pool.prizeMode,
          entryFee: pool.entryFee, prizePot: pool.prizePot,
          totalEntries: totalEntriesCount, maxEntries: pool.maxEntries,
        });

        await db.update(entriesTable)
          .set({ finalWinner: true, finishPosition: 1, prizeAmount: firstPrize })
          .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

        // 2nd and 3rd place: last-eliminated entries by week
        const elimEntries = await db
          .select({ userId: entriesTable.userId, eliminatedWeek: entriesTable.eliminatedWeek })
          .from(entriesTable)
          .where(and(
            eq(entriesTable.poolId, poolId),
            eq(entriesTable.status, "eliminated"),
            isNotNull(entriesTable.eliminatedWeek),
          ));

        if (elimEntries.length > 0) {
          const maxElimWeek = Math.max(...elimEntries.map((e) => e.eliminatedWeek!));
          const secondGroup = elimEntries.filter((e) => e.eliminatedWeek === maxElimWeek);
          const secondPrize = calcPrize({
            placeIndex: firstPlaceCount, coWinners: secondGroup.length,
            prizeStructure: ps, prizeMode: pool.prizeMode,
            entryFee: pool.entryFee, prizePot: pool.prizePot,
            totalEntries: totalEntriesCount, maxEntries: pool.maxEntries,
          });
          await db.update(entriesTable)
            .set({ finishPosition: 2, prizeAmount: secondPrize })
            .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, secondGroup.map((e) => e.userId))));

          const rest = elimEntries.filter((e) => e.eliminatedWeek !== maxElimWeek);
          if (rest.length > 0) {
            const nextElimWeek = Math.max(...rest.map((e) => e.eliminatedWeek!));
            const thirdGroup = rest.filter((e) => e.eliminatedWeek === nextElimWeek);
            const thirdPrize = calcPrize({
              placeIndex: firstPlaceCount + secondGroup.length, coWinners: thirdGroup.length,
              prizeStructure: ps, prizeMode: pool.prizeMode,
              entryFee: pool.entryFee, prizePot: pool.prizePot,
              totalEntries: totalEntriesCount, maxEntries: pool.maxEntries,
            });
            await db.update(entriesTable)
              .set({ finishPosition: 3, prizeAmount: thirdPrize })
              .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, thirdGroup.map((e) => e.userId))));
          }
        }

        await db.update(poolsTable)
          .set({ isActive: false, endedAt: new Date() })
          .where(eq(poolsTable.id, poolId));
        poolEnded = true;
      } else if (pool.poolType === "season" && week === 18) {
        // Multiple survivors after the final week — resolve via SOV
        const aliveEntriesForSOV = await db
          .select({ id: entriesTable.id, userId: entriesTable.userId })
          .from(entriesTable)
          .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

        const allPicks = await db
          .select({ userId: picksTable.userId, marginOfVictory: picksTable.marginOfVictory })
          .from(picksTable)
          .where(eq(picksTable.poolId, poolId));

        const sovByUser = new Map<number, number>();
        for (const pick of allPicks) {
          if (pick.marginOfVictory == null) continue;
          sovByUser.set(pick.userId, (sovByUser.get(pick.userId) ?? 0) + pick.marginOfVictory);
        }

        const [{ totalEntries }] = await db
          .select({ totalEntries: count() })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, poolId));
        const sovPrize = calcPrize({
          placeIndex: 0, coWinners: aliveEntriesForSOV.length,
          prizeStructure: ps, prizeMode: pool.prizeMode,
          entryFee: pool.entryFee, prizePot: pool.prizePot,
          totalEntries: Number(totalEntries), maxEntries: pool.maxEntries,
        });

        for (const entry of aliveEntriesForSOV) {
          await db.update(entriesTable)
            .set({ sovTotal: sovByUser.get(entry.userId) ?? 0, finalWinner: true, finishPosition: 1, prizeAmount: sovPrize })
            .where(eq(entriesTable.id, entry.id));
        }

        await db.update(poolsTable)
          .set({ isActive: false, endedAt: new Date(), closureReason: "sov_tiebreaker" })
          .where(eq(poolsTable.id, poolId));
        poolEnded = true;
        sovUsed = true;
      }
    }
  }

  res.json({ graded, week, eliminated: lostEntryIds.size, forfeits: forfeitCount, poolEnded, sovUsed, voidFired, coWinners: coWinnersTriggered, coWinnerPrize });
});

export default router;
