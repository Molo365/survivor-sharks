/**
 * Auto-eliminator: polls ESPN every 5 minutes, grades pending picks when
 * games go Final, and eliminates players — no commissioner action required.
 *
 * processedBy = null in weekResultsTable marks auto-processed entries.
 *
 * Two passes per run (non-MLB sports):
 *  Pass 1 — Grade new pending picks against live ESPN scores.
 *  Pass 2 — Idempotency: fix any "loss" picks whose entry is still "alive"
 *            (handles pool-type changes, restarts, or any prior missed run).
 *
 * MLB weekly processing (separate pass):
 *  - Runs once per pool per week, triggered Monday 10 PM ET.
 *  - Fetches full week's game results (Mon–Sun ET).
 *  - Applies double-elimination and revival rules.
 *  - Updates streak and strike counts.
 *  - Advances pool.currentWeek.
 */

import { db } from "@workspace/db";
import { picksTable, pickemPicksTable, entriesTable, poolsTable, weekResultsTable } from "@workspace/db";
import { eq, and, ne, inArray, count } from "drizzle-orm";
import {
  fetchGames,
  fetchGamesForDate,
  fetchIntlGamesForDate,
  getTodayEtDate,
  formatDateEt,
  formatDateEtDash,
  type EspnGame,
  getMlbWeekBounds,
  getMlbProcessingTrigger,
  fetchMlbWeekGames,
  getTeamsWithWin,
} from "./espn";
import {
  getCurrentWcPhase,
  fetchTodayWcGames,
  fetchWcGamesForDate,
  wcOutcome as wcOutcomeFromWc,
  type WcGame,
} from "./wc";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Non-MLB: grade pending picks against live ESPN scores
// ---------------------------------------------------------------------------

export async function processCompletedGames(): Promise<{
  picksGraded: number;
  playersEliminated: number;
  weeksFinalized: number;
}> {
  let picksGraded = 0;
  let playersEliminated = 0;
  let weeksFinalized = 0;

  // ── PASS 1: Grade pending picks (non-MLB only) ────────────────────────────

  const pendingRows = await db
    .select({
      pickId: picksTable.id,
      poolId: picksTable.poolId,
      userId: picksTable.userId,
      teamId: picksTable.teamId,
      teamName: picksTable.teamName,
      week: picksTable.week,
      sport: poolsTable.sport,
      poolType: poolsTable.poolType,
    })
    .from(picksTable)
    .innerJoin(poolsTable, eq(picksTable.poolId, poolsTable.id))
    .where(and(eq(picksTable.result, "pending"), ne(poolsTable.sport, "mlb")));

  if (pendingRows.length > 0) {
    // Fetch ESPN scoreboards — one request per sport per poll cycle
    const distinctSports = [...new Set(pendingRows.map(r => r.sport))];
    const gamesBySport = new Map<string, EspnGame[]>();

    await Promise.all(
      distinctSports.map(async (sport) => {
        const games = await fetchGames(sport);
        gamesBySport.set(sport, games);
      }),
    );

    // Build teamId → completed game lookup; log all completed game IDs
    const completedByTeam = new Map<string, EspnGame>();
    for (const [sport, games] of gamesBySport) {
      const completed = games.filter(g => g.isCompleted);
      logger.info(
        {
          sport,
          completedGames: completed.map(g =>
            `${g.awayTeam.abbreviation}(${g.awayTeam.id}) ${g.awayScore}-${g.homeScore} ${g.homeTeam.abbreviation}(${g.homeTeam.id})`,
          ),
        },
        "ESPN completed games for sport",
      );
      for (const g of completed) {
        completedByTeam.set(g.homeTeam.id, g);
        completedByTeam.set(g.awayTeam.id, g);
      }
    }

    const affectedPoolWeeks = new Set<string>();

    for (const row of pendingRows) {
      const game = completedByTeam.get(row.teamId);

      // ── Comparison log (always emitted for pending picks) ──
      logger.info(
        {
          poolId: row.poolId,
          userId: row.userId,
          storedTeamId: row.teamId,
          storedTeamName: row.teamName,
          espnMatch: game
            ? `${game.awayTeam.abbreviation}(${game.awayTeam.id}) vs ${game.homeTeam.abbreviation}(${game.homeTeam.id})`
            : "no completed game found for this teamId",
          gameIsFinal: game?.isCompleted ?? false,
        },
        "Auto-eliminator: pick vs ESPN comparison",
      );

      if (!game) continue; // game not final yet
      if (game.homeScore == null || game.awayScore == null) continue;
      if (game.homeScore === game.awayScore) continue; // tie — leave for commissioner

      const pickedTeamIsHome = game.homeTeam.id === row.teamId;
      const pickedScore = pickedTeamIsHome ? game.homeScore : game.awayScore;
      const opponentScore = pickedTeamIsHome ? game.awayScore : game.homeScore;
      const result: "win" | "loss" = pickedScore > opponentScore ? "win" : "loss";

      await db
        .update(picksTable)
        .set({ result })
        .where(eq(picksTable.id, row.pickId));

      picksGraded++;
      affectedPoolWeeks.add(`${row.poolId}:${row.week}`);

      logger.info(
        {
          poolId: row.poolId,
          userId: row.userId,
          teamId: row.teamId,
          teamName: row.teamName,
          week: row.week,
          poolType: row.poolType,
          result,
          score: `${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore}`,
        },
        "Auto-graded pick",
      );

      if (result === "loss" && row.poolType !== "weekly") {
        const updated = await db
          .update(entriesTable)
          .set({ status: "eliminated", eliminatedWeek: row.week, streak: 0 })
          .where(
            and(
              eq(entriesTable.poolId, row.poolId),
              eq(entriesTable.userId, row.userId),
              eq(entriesTable.status, "alive"),
            ),
          )
          .returning({ id: entriesTable.id });

        if (updated.length > 0) {
          playersEliminated++;
          logger.info(
            { poolId: row.poolId, userId: row.userId, week: row.week, teamName: row.teamName },
            "Auto-eliminated player (pass 1)",
          );
        } else {
          logger.warn(
            { poolId: row.poolId, userId: row.userId, week: row.week },
            "Auto-eliminator pass 1: loss pick found but entry update matched 0 rows (already eliminated or entry missing)",
          );
        }
      }

    }

    // Finalize weeks where all picks are now resolved
    for (const key of affectedPoolWeeks) {
      const [poolIdStr, weekStr] = key.split(":");
      const pId = parseInt(poolIdStr, 10);
      const wk = parseInt(weekStr, 10);

      const [existing] = await db
        .select({ id: weekResultsTable.id })
        .from(weekResultsTable)
        .where(and(eq(weekResultsTable.poolId, pId), eq(weekResultsTable.week, wk)))
        .limit(1);

      if (existing) continue;

      const [stillPending] = await db
        .select({ id: picksTable.id })
        .from(picksTable)
        .where(
          and(
            eq(picksTable.poolId, pId),
            eq(picksTable.week, wk),
            eq(picksTable.result, "pending"),
          ),
        )
        .limit(1);

      if (stillPending) continue;

      const weekPicks = await db
        .select({ teamId: picksTable.teamId, result: picksTable.result })
        .from(picksTable)
        .where(and(eq(picksTable.poolId, pId), eq(picksTable.week, wk)));

      const losingTeamIds = [
        ...new Set(weekPicks.filter(p => p.result === "loss").map(p => p.teamId)),
      ];

      await db.insert(weekResultsTable).values({
        poolId: pId,
        week: wk,
        losingTeamIds,
        processedBy: null,
      });

      weeksFinalized++;
      logger.info({ poolId: pId, week: wk, losingTeamIds }, "Auto-finalized week results");
    }
  }

  // ── PASS 2: Idempotency — fix graded-loss picks with alive entries ────────
  // Catches: pool-type changes (weekly → season), server restarts, any prior
  // missed elimination. Safe to run every cycle — updates are no-ops if the
  // entry is already eliminated.
  // Excludes MLB pools — they use weekly batch processing instead.

  const missedRows = await db
    .select({
      poolId: picksTable.poolId,
      userId: picksTable.userId,
      teamId: picksTable.teamId,
      teamName: picksTable.teamName,
      week: picksTable.week,
      poolType: poolsTable.poolType,
      entryId: entriesTable.id,
    })
    .from(picksTable)
    .innerJoin(poolsTable, eq(picksTable.poolId, poolsTable.id))
    .innerJoin(
      entriesTable,
      and(
        eq(entriesTable.poolId, picksTable.poolId),
        eq(entriesTable.userId, picksTable.userId),
      ),
    )
    .where(
      and(
        eq(picksTable.result, "loss"),
        eq(entriesTable.status, "alive"),
        ne(poolsTable.poolType, "weekly"),
        ne(poolsTable.sport, "mlb"),
      ),
    );

  for (const row of missedRows) {
    logger.warn(
      {
        poolId: row.poolId,
        userId: row.userId,
        teamId: row.teamId,
        teamName: row.teamName,
        week: row.week,
        poolType: row.poolType,
      },
      "Auto-eliminator pass 2: found loss pick with alive entry — correcting",
    );

    const updated = await db
      .update(entriesTable)
      .set({ status: "eliminated", eliminatedWeek: row.week, streak: 0 })
      .where(
        and(
          eq(entriesTable.poolId, row.poolId),
          eq(entriesTable.userId, row.userId),
          eq(entriesTable.status, "alive"),
        ),
      )
      .returning({ id: entriesTable.id });

    if (updated.length > 0) {
      playersEliminated++;
      logger.info(
        { poolId: row.poolId, userId: row.userId, week: row.week, teamName: row.teamName },
        "Auto-eliminated player (pass 2 correction)",
      );
    }
  }

  return { picksGraded, playersEliminated, weeksFinalized };
}

// ---------------------------------------------------------------------------
// MLB weekly batch processing
// ---------------------------------------------------------------------------

export async function processMlbWeeklyResults(): Promise<{
  weeksProcessed: number;
  playersEliminated: number;
  playersRevived: number;
}> {
  let weeksProcessed = 0;
  let playersEliminated = 0;
  let playersRevived = 0;

  // Find all active MLB weekly pools (daily pools handled separately)
  const mlbPools = await db.select()
    .from(poolsTable)
    .where(and(eq(poolsTable.sport, "mlb"), eq(poolsTable.isActive, true), eq(poolsTable.pickFrequency, "weekly")));

  for (const pool of mlbPools) {
    // Check if processing is due: now >= trigger time for this week
    const trigger = getMlbProcessingTrigger(pool.createdAt, pool.currentWeek);
    if (Date.now() < trigger.getTime()) continue;

    // Check if already processed this week
    const [existing] = await db.select({ id: weekResultsTable.id })
      .from(weekResultsTable)
      .where(and(eq(weekResultsTable.poolId, pool.id), eq(weekResultsTable.week, pool.currentWeek)))
      .limit(1);
    if (existing) continue;

    logger.info(
      { poolId: pool.id, currentWeek: pool.currentWeek, trigger: trigger.toISOString() },
      "MLB: starting weekly results processing",
    );

    // Fetch all games for this week (Mon–Sun ET)
    const weekBounds = getMlbWeekBounds(pool.createdAt, pool.currentWeek);
    const games = await fetchMlbWeekGames(weekBounds.espnDates);
    const teamsWithWin = getTeamsWithWin(games);

    logger.info(
      {
        poolId: pool.id,
        week: pool.currentWeek,
        totalGames: games.length,
        completedGames: games.filter(g => g.isCompleted).length,
        teamsWithWin: [...teamsWithWin],
      },
      "MLB: weekly game results fetched",
    );

    // Get all alive entries for this pool
    const aliveEntries = await db.select({
      id: entriesTable.id,
      userId: entriesTable.userId,
      strikeCount: entriesTable.strikeCount,
      streak: entriesTable.streak,
    }).from(entriesTable)
      .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));

    // Get all picks submitted for this week
    const weekPicks = await db.select().from(picksTable)
      .where(and(eq(picksTable.poolId, pool.id), eq(picksTable.week, pool.currentWeek)));

    const pickByUserId = new Map(weekPicks.map(p => [p.userId, p]));
    const eliminatedThisWeek: number[] = [];

    for (const entry of aliveEntries) {
      const pick = pickByUserId.get(entry.userId);
      const teamWon = pick ? teamsWithWin.has(pick.teamId) : false;

      // Update pick result in DB
      if (pick) {
        await db.update(picksTable)
          .set({ result: teamWon ? "win" : "loss" })
          .where(eq(picksTable.id, pick.id));
      }

      if (teamWon) {
        // Survived: increment streak
        await db.update(entriesTable)
          .set({ streak: entry.streak + 1 })
          .where(eq(entriesTable.id, entry.id));

        logger.info(
          { poolId: pool.id, userId: entry.userId, week: pool.currentWeek, teamId: pick?.teamId, streak: entry.streak + 1 },
          "MLB: player survived",
        );
      } else {
        // Lost or no pick
        if (pool.doubleElimination && entry.strikeCount === 0) {
          // First loss in a double-elimination pool: warning strike, stay alive
          await db.update(entriesTable)
            .set({ strikeCount: 1, streak: 0 })
            .where(eq(entriesTable.id, entry.id));

          logger.info(
            { poolId: pool.id, userId: entry.userId, week: pool.currentWeek, teamId: pick?.teamId },
            "MLB: double-elim warning strike (1 of 2)",
          );
        } else {
          // Permanent elimination
          await db.update(entriesTable)
            .set({ status: "eliminated", eliminatedWeek: pool.currentWeek, streak: 0 })
            .where(eq(entriesTable.id, entry.id));

          eliminatedThisWeek.push(entry.userId);
          playersEliminated++;

          logger.info(
            {
              poolId: pool.id,
              userId: entry.userId,
              week: pool.currentWeek,
              teamId: pick?.teamId,
              doubleElim: pool.doubleElimination,
              hadStrike: entry.strikeCount > 0,
            },
            "MLB: player eliminated",
          );
        }
      }
    }

    // Revival rule: if ALL survivors were eliminated this week, revive them all
    if (eliminatedThisWeek.length > 0) {
      const [{ remaining }] = await db
        .select({ remaining: count() })
        .from(entriesTable)
        .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));

      if (Number(remaining) === 0) {
        await db.update(entriesTable)
          .set({ status: "alive", eliminatedWeek: null, streak: 0, strikeCount: 0 })
          .where(and(
            eq(entriesTable.poolId, pool.id),
            inArray(entriesTable.userId, eliminatedThisWeek),
          ));

        playersRevived += eliminatedThisWeek.length;
        playersEliminated -= eliminatedThisWeek.length;

        logger.info(
          { poolId: pool.id, week: pool.currentWeek, revived: eliminatedThisWeek.length },
          "MLB: revival rule triggered — all survivors eliminated, everyone revived",
        );
      }
    }

    // Record week results
    const losingTeamIds = [
      ...new Set(
        weekPicks
          .filter(p => !teamsWithWin.has(p.teamId))
          .map(p => p.teamId)
      ),
    ];

    await db.insert(weekResultsTable).values({
      poolId: pool.id,
      week: pool.currentWeek,
      losingTeamIds,
      processedBy: null,
    });

    // Advance pool to next week
    await db.update(poolsTable)
      .set({ currentWeek: pool.currentWeek + 1 })
      .where(eq(poolsTable.id, pool.id));

    weeksProcessed++;
    logger.info(
      { poolId: pool.id, week: pool.currentWeek, playersEliminated, playersRevived },
      "MLB: weekly results processed, advancing to next week",
    );
  }

  return { weeksProcessed, playersEliminated, playersRevived };
}

// ---------------------------------------------------------------------------
// MLB daily pick processing (one run per pool per day when all games final)
// ---------------------------------------------------------------------------

export async function processMlbDailyResults(): Promise<{
  daysProcessed: number;
  picksGraded: number;
  playersEliminated: number;
  playersRevived: number;
}> {
  let daysProcessed = 0;
  let picksGraded = 0;
  let playersEliminated = 0;
  let playersRevived = 0;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Check yesterday first so a missed day is caught up before processing today.
  // Mirrors the pattern used by processPickEmResults.
  const datesToCheck = [
    { dateEt: formatDateEtDash(yesterday), dateEspn: formatDateEt(yesterday) },
    { dateEt: getTodayEtDate(),             dateEspn: formatDateEt(now) },
  ];

  const dailyPools = await db.select()
    .from(poolsTable)
    .where(and(
      eq(poolsTable.sport, "mlb"),
      eq(poolsTable.isActive, true),
      eq(poolsTable.pickFrequency, "daily"),
      ne(poolsTable.poolType, "pickem"),
    ));

  for (const pool of dailyPools) {
    for (const { dateEt, dateEspn } of datesToCheck) {
      // Skip if this day is already processed (week_results row exists for the current slot)
      const [existing] = await db.select({ id: weekResultsTable.id })
        .from(weekResultsTable)
        .where(and(eq(weekResultsTable.poolId, pool.id), eq(weekResultsTable.week, pool.currentWeek)))
        .limit(1);
      if (existing) continue;

      // Fetch games for this specific date
      const games = await fetchGamesForDate("mlb", dateEspn);
      if (games.length === 0) continue;

      // Build completed game lookup by teamId
      const completedByTeam = new Map<string, EspnGame>();
      for (const g of games) {
        if (g.isCompleted && g.homeScore != null && g.awayScore != null) {
          completedByTeam.set(g.homeTeam.id, g);
          completedByTeam.set(g.awayTeam.id, g);
        }
      }

      // Get pending picks for this date
      const pendingPicks = await db.select({
        id: picksTable.id,
        userId: picksTable.userId,
        teamId: picksTable.teamId,
        teamName: picksTable.teamName,
      }).from(picksTable)
        .where(and(
          eq(picksTable.poolId, pool.id),
          eq(picksTable.pickDate, dateEt),
          eq(picksTable.result, "pending"),
        ));

      // Get alive entries for streak tracking
      const aliveEntries = await db.select({
        id: entriesTable.id,
        userId: entriesTable.userId,
        streak: entriesTable.streak,
      }).from(entriesTable)
        .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));
      const entryByUserId = new Map(aliveEntries.map(e => [e.userId, e]));

      // Grade each pending pick whose game is complete
      for (const pick of pendingPicks) {
        const game = completedByTeam.get(pick.teamId);
        if (!game || game.homeScore == null || game.awayScore == null) continue;
        if (game.homeScore === game.awayScore) continue; // tie — skip

        const isHome = game.homeTeam.id === pick.teamId;
        const myScore = isHome ? game.homeScore : game.awayScore;
        const oppScore = isHome ? game.awayScore : game.homeScore;
        const result: "win" | "loss" = myScore > oppScore ? "win" : "loss";

        await db.update(picksTable).set({ result }).where(eq(picksTable.id, pick.id));
        picksGraded++;

        if (result === "loss") {
          const updated = await db.update(entriesTable)
            .set({ status: "eliminated", eliminatedWeek: pool.currentWeek, streak: 0 })
            .where(and(
              eq(entriesTable.poolId, pool.id),
              eq(entriesTable.userId, pick.userId),
              eq(entriesTable.status, "alive"),
            ))
            .returning({ id: entriesTable.id });
          if (updated.length > 0) playersEliminated++;
          logger.info({ poolId: pool.id, userId: pick.userId, day: pool.currentWeek, teamId: pick.teamId }, "MLB Daily: player eliminated");
        } else {
          const entry = entryByUserId.get(pick.userId);
          if (entry) {
            await db.update(entriesTable)
              .set({ streak: entry.streak + 1 })
              .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.userId, pick.userId)));
          }
          logger.info({ poolId: pool.id, userId: pick.userId, day: pool.currentWeek, teamId: pick.teamId }, "MLB Daily: player survived");
        }
      }

      // Only close the day when ALL games for this date are final and no picks remain pending
      const allGamesFinal = games.every(g => g.isCompleted);
      if (!allGamesFinal) continue;

      const [stillPending] = await db.select({ id: picksTable.id })
        .from(picksTable)
        .where(and(
          eq(picksTable.poolId, pool.id),
          eq(picksTable.pickDate, dateEt),
          eq(picksTable.result, "pending"),
        ))
        .limit(1);
      if (stillPending) continue;

      // Guard: don't close a date where this pool had zero picks — the pool may not
      // have been active on that date (e.g. yesterday check on a brand-new pool).
      const [{ totalForDate }] = await db.select({ totalForDate: count() })
        .from(picksTable)
        .where(and(
          eq(picksTable.poolId, pool.id),
          eq(picksTable.pickDate, dateEt),
        ));
      if (Number(totalForDate) === 0) continue;

      // Revival rule: if ALL survivors were eliminated today, revive them all
      const eliminatedToday = await db.select({ userId: entriesTable.userId })
        .from(entriesTable)
        .where(and(
          eq(entriesTable.poolId, pool.id),
          eq(entriesTable.status, "eliminated"),
          eq(entriesTable.eliminatedWeek, pool.currentWeek),
        ));

      if (eliminatedToday.length > 0) {
        const [{ remaining }] = await db.select({ remaining: count() })
          .from(entriesTable)
          .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));

        if (Number(remaining) === 0) {
          await db.update(entriesTable)
            .set({ status: "alive", eliminatedWeek: null, streak: 0 })
            .where(and(
              eq(entriesTable.poolId, pool.id),
              inArray(entriesTable.userId, eliminatedToday.map(e => e.userId)),
            ));
          playersRevived += eliminatedToday.length;
          playersEliminated -= eliminatedToday.length;
          logger.info(
            { poolId: pool.id, day: pool.currentWeek, revived: eliminatedToday.length },
            "MLB Daily: revival rule triggered — all survivors eliminated, everyone revived",
          );
        }
      }

      // Record day results
      const datePicksAll = await db.select({ teamId: picksTable.teamId, result: picksTable.result })
        .from(picksTable)
        .where(and(eq(picksTable.poolId, pool.id), eq(picksTable.pickDate, dateEt)));

      const losingTeamIds = [
        ...new Set(datePicksAll.filter(p => p.result === "loss").map(p => p.teamId)),
      ];

      await db.insert(weekResultsTable).values({
        poolId: pool.id,
        week: pool.currentWeek,
        losingTeamIds,
        processedBy: null,
      });

      if (pool.isRecurring) {
        await db.update(poolsTable)
          .set({ currentWeek: pool.currentWeek + 1 })
          .where(eq(poolsTable.id, pool.id));
        logger.info({ poolId: pool.id, day: pool.currentWeek, date: dateEt }, "MLB Daily: day closed, advancing day counter");
      } else {
        await db.update(poolsTable)
          .set({ isActive: false, endedAt: new Date() })
          .where(eq(poolsTable.id, pool.id));
        logger.info({ poolId: pool.id, day: pool.currentWeek, date: dateEt }, "MLB Daily: non-recurring pool closed after single day");
      }

      daysProcessed++;
      // Day closed — stop iterating dates for this pool. Either currentWeek advanced
      // (recurring) or the pool is now inactive (non-recurring). Either way, processing
      // the next date with the stale in-memory pool state would be incorrect.
      break;
    }
  }

  return { daysProcessed, picksGraded, playersEliminated, playersRevived };
}

// ---------------------------------------------------------------------------
// Pick-Em auto-grading (all active pickem pools, runs every poll cycle)
// ---------------------------------------------------------------------------


export async function processPickEmResults(): Promise<{
  picksGraded: number;
}> {
  let picksGraded = 0;

  // Find all active pick-em pools
  const pickemPools = await db
    .select()
    .from(poolsTable)
    .where(and(eq(poolsTable.poolType, "pickem"), eq(poolsTable.isActive, true)));

  if (pickemPools.length === 0) return { picksGraded };

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const todayEspn = formatDateEt(now);
  const todayEt = getTodayEtDate();
  const yesterdayEspn = formatDateEt(yesterday);
  const yesterdayEt = formatDateEtDash(yesterday);

  // Both dates checked so West Coast games finishing after midnight ET are graded
  const datesToCheck = [todayEt, yesterdayEt];

  // Separate pools by sport
  const mlbPools = pickemPools.filter((p) => p.sport === "mlb");
  const wcPools = pickemPools.filter((p) => p.sport === "worldcup");
  const intlPools = pickemPools.filter((p) => p.sport === "intl");

  // ── MLB grading ───────────────────────────────────────────────────────────

  if (mlbPools.length > 0) {
    const [todayGames, yesterdayGames] = await Promise.all([
      fetchGamesForDate("mlb", todayEspn),
      fetchGamesForDate("mlb", yesterdayEspn),
    ]);
    const allGames = [...todayGames, ...yesterdayGames];

    const finalGames = allGames.filter(
      (g) =>
        g.isCompleted &&
        g.homeScore != null &&
        g.awayScore != null &&
        g.homeScore !== g.awayScore,
    );

    // Build gameId → winning teamId map
    const winnerByGameId = new Map<string, string>();
    for (const game of finalGames) {
      const winningTeamId =
        game.homeScore! > game.awayScore! ? game.homeTeam.id : game.awayTeam.id;
      winnerByGameId.set(game.id, winningTeamId);
      logger.info(
        {
          gameId: game.id,
          winner: winningTeamId,
          score: `${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore}`,
        },
        "Pick-Em: completed game found",
      );
    }

    const mlbPostponedIds = allGames.filter((g) => g.isPostponed).map((g) => g.id);

    for (const pool of mlbPools) {
      for (const [gameId, winningTeamId] of winnerByGameId) {
        const gamePicks = await db
          .select()
          .from(pickemPicksTable)
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.gameId, gameId),
              inArray(pickemPicksTable.gameDate, datesToCheck),
              eq(pickemPicksTable.result, "pending"),
            ),
          );

        for (const pick of gamePicks) {
          const result: "correct" | "incorrect" =
            pick.pickedTeamId === winningTeamId ? "correct" : "incorrect";

          await db
            .update(pickemPicksTable)
            .set({ result, updatedAt: new Date() })
            .where(eq(pickemPicksTable.id, pick.id));

          picksGraded++;
          logger.info(
            { poolId: pool.id, userId: pick.userId, gameId, pickedTeamId: pick.pickedTeamId, winningTeamId, result },
            "Auto-graded pickem pick",
          );
        }
      }

      for (const gameId of mlbPostponedIds) {
        const updated = await db
          .update(pickemPicksTable)
          .set({ result: "postponed", updatedAt: new Date() })
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.gameId, gameId),
              eq(pickemPicksTable.result, "pending"),
            ),
          )
          .returning({ id: pickemPicksTable.id });
        if (updated.length > 0) {
          logger.info({ poolId: pool.id, gameId, count: updated.length }, "Pick-Em: marked picks as postponed");
        }
      }
    }

    // ── MLB Daily pickem: advance day counter / close non-recurring pools ────
    // processMlbDailyResults only handles survivor-style pools (picks table).
    // Daily pickem pools write to pickem_picks, so their lifecycle is managed here.
    const mlbDailyPools = mlbPools.filter((p) => p.pickFrequency === "daily");
    if (mlbDailyPools.length > 0) {
      // Map ET date strings to the game arrays already fetched above.
      const gamesByDate = new Map<string, EspnGame[]>([
        [todayEt, todayGames],
        [yesterdayEt, yesterdayGames],
      ]);

      for (const pool of mlbDailyPools) {
        // Check yesterday first so a missed day is caught up before today.
        for (const dateEt of [yesterdayEt, todayEt]) {
          const gamesForDate = gamesByDate.get(dateEt) ?? [];
          if (gamesForDate.length === 0) continue;

          // All games must be final before closing the day.
          const allGamesFinal = gamesForDate.every((g) => g.isCompleted);
          if (!allGamesFinal) continue;

          // Guard: don't close a date with zero picks — pool may not have been
          // active on that date (e.g. yesterday check on a brand-new pool).
          const [{ totalForDate }] = await db
            .select({ totalForDate: count() })
            .from(pickemPicksTable)
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameDate, dateEt),
              ),
            );
          if (Number(totalForDate) === 0) continue;

          // Idempotency guard: picks are stored with week = pool.currentWeek at
          // submission time. After a day closes and currentWeek advances, no picks
          // for that dateEt will match pool.currentWeek — skip to avoid double-advancing.
          const [currentDayPick] = await db
            .select({ id: pickemPicksTable.id })
            .from(pickemPicksTable)
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameDate, dateEt),
                eq(pickemPicksTable.week, pool.currentWeek),
              ),
            )
            .limit(1);
          if (!currentDayPick) continue;

          // No pending picks may remain before closing.
          const [stillPending] = await db
            .select({ id: pickemPicksTable.id })
            .from(pickemPicksTable)
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameDate, dateEt),
                eq(pickemPicksTable.result, "pending"),
              ),
            )
            .limit(1);
          if (stillPending) continue;

          if (pool.isRecurring) {
            await db
              .update(poolsTable)
              .set({ currentWeek: pool.currentWeek + 1 })
              .where(eq(poolsTable.id, pool.id));
            logger.info(
              { poolId: pool.id, day: pool.currentWeek, date: dateEt },
              "Pick-Em MLB Daily: day closed, advancing day counter",
            );
          } else {
            await db
              .update(poolsTable)
              .set({ isActive: false, endedAt: new Date() })
              .where(eq(poolsTable.id, pool.id));
            logger.info(
              { poolId: pool.id, day: pool.currentWeek, date: dateEt },
              "Pick-Em MLB Daily: non-recurring pool closed after single day",
            );
          }

          // Day closed — stop iterating dates for this pool.
          break;
        }
      }
    }
  }

  // ── International Soccer grading (3-way: home_win / draw / away_win) ────────

  if (intlPools.length > 0) {
    const [todayIntlGames, yesterdayIntlGames] = await Promise.all([
      fetchIntlGamesForDate(todayEspn),
      fetchIntlGamesForDate(yesterdayEspn),
    ]);
    const allIntlGames = [...todayIntlGames, ...yesterdayIntlGames];
    const completedIntlGames = allIntlGames.filter((g) => g.isCompleted && g.homeScore != null && g.awayScore != null);

    const outcomeByIntlGameId = new Map<string, "home_win" | "draw" | "away_win">();
    for (const game of completedIntlGames) {
      const h = game.homeScore!, a = game.awayScore!;
      const outcome: "home_win" | "draw" | "away_win" = h > a ? "home_win" : a > h ? "away_win" : "draw";
      outcomeByIntlGameId.set(game.id, outcome);
      logger.info(
        {
          gameId: game.id,
          outcome,
          score: `${game.awayTeam.abbreviation} ${game.awayScore} - ${game.homeScore} ${game.homeTeam.abbreviation}`,
        },
        "Pick-Em intl: completed game found",
      );
    }

    const intlPostponedIds = allIntlGames.filter((g) => g.isPostponed).map((g) => g.id);

    for (const pool of intlPools) {
      for (const [gameId, outcome] of outcomeByIntlGameId) {
        const gamePicks = await db
          .select()
          .from(pickemPicksTable)
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.gameId, gameId),
              inArray(pickemPicksTable.gameDate, datesToCheck),
              eq(pickemPicksTable.result, "pending"),
            ),
          );

        for (const pick of gamePicks) {
          const result: "correct" | "incorrect" =
            pick.pickedTeamId === outcome ? "correct" : "incorrect";

          await db
            .update(pickemPicksTable)
            .set({ result, updatedAt: new Date() })
            .where(eq(pickemPicksTable.id, pick.id));

          picksGraded++;
          logger.info(
            { poolId: pool.id, userId: pick.userId, gameId, pickedTeamId: pick.pickedTeamId, outcome, result },
            "Auto-graded intl pickem pick",
          );
        }
      }

      for (const gameId of intlPostponedIds) {
        const updated = await db
          .update(pickemPicksTable)
          .set({ result: "postponed", updatedAt: new Date() })
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.gameId, gameId),
              eq(pickemPicksTable.result, "pending"),
            ),
          )
          .returning({ id: pickemPicksTable.id });
        if (updated.length > 0) {
          logger.info({ poolId: pool.id, gameId, count: updated.length }, "Pick-Em intl: marked picks as postponed");
        }
      }
    }
  }

  // ── World Cup grading (3-way: home_win / draw / away_win) ─────────────────

  if (wcPools.length > 0) {
    const wcPhase = getCurrentWcPhase();
    // Only grade during active WC phases; skip if no phase active
    if (wcPhase) {
      const [wcTodayGames, wcYesterdayGames] = await Promise.all([
        fetchTodayWcGames(),
        fetchWcGamesForDate(yesterdayEt),
      ]);
      const allWcGames = [...wcTodayGames, ...wcYesterdayGames];
      const completedWcGames = allWcGames.filter((g) => g.isCompleted && g.homeScore != null && g.awayScore != null);

      // Build gameId → 3-way outcome map
      const outcomeByGameId = new Map<string, "home_win" | "draw" | "away_win">();
      for (const game of completedWcGames) {
        const outcome = wcOutcomeFromWc(game);
        if (outcome) {
          outcomeByGameId.set(game.id, outcome);
          logger.info(
            {
              gameId: game.id,
              outcome,
              score: `${game.awayTeam.abbreviation} ${game.awayScore} - ${game.homeScore} ${game.homeTeam.abbreviation}`,
            },
            "Pick-Em WC: completed game found",
          );
        }
      }

      for (const pool of wcPools) {
        for (const [gameId, outcome] of outcomeByGameId) {
          const gamePicks = await db
            .select()
            .from(pickemPicksTable)
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameId, gameId),
                inArray(pickemPicksTable.gameDate, datesToCheck),
                eq(pickemPicksTable.result, "pending"),
              ),
            );

          for (const pick of gamePicks) {
            const result: "correct" | "incorrect" =
              pick.pickedTeamId === outcome ? "correct" : "incorrect";

            await db
              .update(pickemPicksTable)
              .set({ result, updatedAt: new Date() })
              .where(eq(pickemPicksTable.id, pick.id));

            picksGraded++;
            logger.info(
              { poolId: pool.id, userId: pick.userId, gameId, pickedTeamId: pick.pickedTeamId, outcome, result },
              "Auto-graded WC pickem pick",
            );
          }
        }
      }
    }
  }

  return { picksGraded };
}

// ---------------------------------------------------------------------------
// Crazy 8's auto-grading (MLB daily confidence-pick pools)
// ---------------------------------------------------------------------------
//
// Grades pickemPicksTable rows for poolType = "crazy_8s".
// Logic mirrors the MLB block of processPickEmResults():
//  - Compare pickedTeamId against the ESPN winning teamId
//  - Mark "correct" / "incorrect" / "postponed"
//  - No elimination — Crazy 8's is a scoring game, not a survival game
// ---------------------------------------------------------------------------

export async function processCrazyEightsResults(): Promise<{
  picksGraded: number;
}> {
  let picksGraded = 0;

  const crazyPools = await db
    .select()
    .from(poolsTable)
    .where(and(eq(poolsTable.poolType, "crazy_8s"), eq(poolsTable.isActive, true)));

  if (crazyPools.length === 0) return { picksGraded };

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const todayEspn = formatDateEt(now);
  const todayEt = getTodayEtDate();
  const yesterdayEspn = formatDateEt(yesterday);
  const yesterdayEt = formatDateEtDash(yesterday);

  // Both dates so West Coast games finishing after midnight ET are still graded
  const datesToCheck = [todayEt, yesterdayEt];

  const [todayGames, yesterdayGames] = await Promise.all([
    fetchGamesForDate("mlb", todayEspn),
    fetchGamesForDate("mlb", yesterdayEspn),
  ]);
  const allGames = [...todayGames, ...yesterdayGames];

  // Build gameId → winning teamId for all completed, non-tied games
  const winnerByGameId = new Map<string, string>();
  for (const game of allGames) {
    if (
      game.isCompleted &&
      game.homeScore != null &&
      game.awayScore != null &&
      game.homeScore !== game.awayScore
    ) {
      const winningTeamId =
        game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;
      winnerByGameId.set(game.id, winningTeamId);
      logger.info(
        {
          gameId: game.id,
          winner: winningTeamId,
          score: `${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore}`,
        },
        "Crazy 8's: completed game found",
      );
    }
  }

  const postponedIds = allGames.filter((g) => g.isPostponed).map((g) => g.id);

  for (const pool of crazyPools) {
    // Grade correct / incorrect
    for (const [gameId, winningTeamId] of winnerByGameId) {
      const gamePicks = await db
        .select()
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.gameId, gameId),
            inArray(pickemPicksTable.gameDate, datesToCheck),
            eq(pickemPicksTable.result, "pending"),
          ),
        );

      for (const pick of gamePicks) {
        const result: "correct" | "incorrect" =
          pick.pickedTeamId === winningTeamId ? "correct" : "incorrect";

        await db
          .update(pickemPicksTable)
          .set({ result, updatedAt: new Date() })
          .where(eq(pickemPicksTable.id, pick.id));

        picksGraded++;
        logger.info(
          {
            poolId: pool.id,
            userId: pick.userId,
            gameId,
            pickedTeamId: pick.pickedTeamId,
            winningTeamId,
            result,
          },
          "Crazy 8's: auto-graded pick",
        );
      }
    }

    // Mark postponed picks
    for (const gameId of postponedIds) {
      const updated = await db
        .update(pickemPicksTable)
        .set({ result: "postponed", updatedAt: new Date() })
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.gameId, gameId),
            eq(pickemPicksTable.result, "pending"),
          ),
        )
        .returning({ id: pickemPicksTable.id });

      if (updated.length > 0) {
        logger.info(
          { poolId: pool.id, gameId, count: updated.length },
          "Crazy 8's: marked picks as postponed",
        );
      }
    }
  }

  return { picksGraded };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let _timer: ReturnType<typeof setInterval> | null = null;

export function startAutoEliminator(): void {
  if (_timer) return;

  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Auto-eliminator starting");

  async function runAll() {
    const [nonMlb, mlbWeekly, mlbDaily, pickEm, crazyEights] = await Promise.all([
      processCompletedGames(),
      processMlbWeeklyResults(),
      processMlbDailyResults(),
      processPickEmResults(),
      processCrazyEightsResults(),
    ]);
    return {
      ...nonMlb,
      mlbWeeksProcessed: mlbWeekly.weeksProcessed,
      mlbPlayersEliminated: mlbWeekly.playersEliminated + mlbDaily.playersEliminated,
      mlbPlayersRevived: mlbWeekly.playersRevived + mlbDaily.playersRevived,
      mlbDaysProcessed: mlbDaily.daysProcessed,
      pickEmPicksGraded: pickEm.picksGraded,
      crazyEightsPicksGraded: crazyEights.picksGraded,
    };
  }

  runAll()
    .then(stats => logger.info(stats, "Auto-eliminator initial run complete"))
    .catch(err => logger.error({ err }, "Auto-eliminator initial run failed"));

  _timer = setInterval(() => {
    runAll()
      .then(stats => {
        if (
          stats.picksGraded > 0 ||
          stats.playersEliminated > 0 ||
          stats.mlbWeeksProcessed > 0 ||
          stats.mlbDaysProcessed > 0 ||
          stats.pickEmPicksGraded > 0
        ) {
          logger.info(stats, "Auto-eliminator poll complete");
        }
      })
      .catch(err => logger.error({ err }, "Auto-eliminator poll failed"));
  }, POLL_INTERVAL_MS);
}

export function stopAutoEliminator(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
