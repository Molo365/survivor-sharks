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
import { picksTable, entriesTable, poolsTable, weekResultsTable } from "@workspace/db";
import { eq, and, ne, inArray, count } from "drizzle-orm";
import {
  fetchGames,
  type EspnGame,
  getMlbWeekBounds,
  getMlbProcessingTrigger,
  fetchMlbWeekGames,
  getTeamsWithWin,
} from "./espn";
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

  // Find all active MLB pools
  const mlbPools = await db.select()
    .from(poolsTable)
    .where(and(eq(poolsTable.sport, "mlb"), eq(poolsTable.isActive, true)));

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
// Scheduler
// ---------------------------------------------------------------------------

let _timer: ReturnType<typeof setInterval> | null = null;

export function startAutoEliminator(): void {
  if (_timer) return;

  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Auto-eliminator starting");

  async function runAll() {
    const [nonMlb, mlb] = await Promise.all([
      processCompletedGames(),
      processMlbWeeklyResults(),
    ]);
    return { ...nonMlb, mlbWeeksProcessed: mlb.weeksProcessed, mlbPlayersEliminated: mlb.playersEliminated, mlbPlayersRevived: mlb.playersRevived };
  }

  runAll()
    .then(stats => logger.info(stats, "Auto-eliminator initial run complete"))
    .catch(err => logger.error({ err }, "Auto-eliminator initial run failed"));

  _timer = setInterval(() => {
    runAll()
      .then(stats => {
        if (stats.picksGraded > 0 || stats.playersEliminated > 0 || stats.mlbWeeksProcessed > 0) {
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
