/**
 * Auto-eliminator: polls ESPN every 5 minutes, grades pending picks when
 * games go Final, and eliminates players — no commissioner action required.
 *
 * processedBy = null in weekResultsTable marks auto-processed entries.
 */

import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, weekResultsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fetchGames, type EspnGame } from "./espn";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

export async function processCompletedGames(): Promise<{
  picksGraded: number;
  playersEliminated: number;
  weeksFinalized: number;
}> {
  // 1. Load all pending picks joined with their pool's sport/type
  const pendingRows = await db
    .select({
      pickId: picksTable.id,
      entryId: picksTable.entryId,
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
    .where(eq(picksTable.result, "pending"));

  if (pendingRows.length === 0) {
    return { picksGraded: 0, playersEliminated: 0, weeksFinalized: 0 };
  }

  // 2. Fetch ESPN scoreboards per sport (one request per sport per poll cycle)
  const distinctSports = [...new Set(pendingRows.map(r => r.sport))];
  const gamesBySport = new Map<string, EspnGame[]>();

  await Promise.all(
    distinctSports.map(async (sport) => {
      const games = await fetchGames(sport);
      gamesBySport.set(sport, games);
    }),
  );

  // 3. Build teamId → completed game lookup
  const completedByTeam = new Map<string, EspnGame>();
  for (const [, games] of gamesBySport) {
    for (const g of games) {
      if (!g.isCompleted) continue;
      completedByTeam.set(g.homeTeam.id, g);
      completedByTeam.set(g.awayTeam.id, g);
    }
  }

  // 4. Grade each pending pick
  let picksGraded = 0;
  let playersEliminated = 0;

  // Track which (poolId, week) pairs had picks resolved in this cycle
  const affectedPoolWeeks = new Set<string>();

  for (const row of pendingRows) {
    const game = completedByTeam.get(row.teamId);
    if (!game) continue; // game not final yet

    if (game.homeScore == null || game.awayScore == null) continue;
    if (game.homeScore === game.awayScore) continue; // tie — leave pending for commissioner

    const pickedTeamIsHome = game.homeTeam.id === row.teamId;
    const pickedScore = pickedTeamIsHome ? game.homeScore : game.awayScore;
    const opponentScore = pickedTeamIsHome ? game.awayScore : game.homeScore;
    const result: "win" | "loss" = pickedScore > opponentScore ? "win" : "loss";

    // Update the pick
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
        result,
        score: `${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore}`,
      },
      "Auto-graded pick",
    );

    // Eliminate for survivor pools on loss
    if (result === "loss" && row.poolType !== "weekly") {
      const updated = await db
        .update(entriesTable)
        .set({ status: "eliminated", eliminatedWeek: row.week })
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
          "Auto-eliminated player",
        );
      }
    }
  }

  // 5. For each resolved pool+week, check if the week is fully graded and
  //    record a weekResultsTable entry if there are no more pending picks.
  let weeksFinalized = 0;

  for (const key of affectedPoolWeeks) {
    const [poolIdStr, weekStr] = key.split(":");
    const poolId = parseInt(poolIdStr, 10);
    const week = parseInt(weekStr, 10);

    // Skip if a result record already exists (manual or prior auto run)
    const [existing] = await db
      .select({ id: weekResultsTable.id })
      .from(weekResultsTable)
      .where(
        and(eq(weekResultsTable.poolId, poolId), eq(weekResultsTable.week, week)),
      )
      .limit(1);

    if (existing) continue;

    // Check if any picks for this pool+week are still pending
    const [stillPending] = await db
      .select({ id: picksTable.id })
      .from(picksTable)
      .where(
        and(
          eq(picksTable.poolId, poolId),
          eq(picksTable.week, week),
          eq(picksTable.result, "pending"),
        ),
      )
      .limit(1);

    if (stillPending) continue; // more games still to finish

    // All picks resolved — collect losers and finalize
    const weekPicks = await db
      .select({ teamId: picksTable.teamId, result: picksTable.result })
      .from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));

    const losingTeamIds = [...new Set(
      weekPicks.filter(p => p.result === "loss").map(p => p.teamId),
    )];

    await db.insert(weekResultsTable).values({
      poolId,
      week,
      losingTeamIds,
      processedBy: null, // null = auto-processed
    });

    weeksFinalized++;
    logger.info({ poolId, week, losingTeamIds }, "Auto-finalized week results");
  }

  return { picksGraded, playersEliminated, weeksFinalized };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let _timer: ReturnType<typeof setInterval> | null = null;

export function startAutoEliminator(): void {
  if (_timer) return; // already started

  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Auto-eliminator starting");

  // Run immediately on startup
  processCompletedGames()
    .then(stats => logger.info(stats, "Auto-eliminator initial run complete"))
    .catch(err => logger.error({ err }, "Auto-eliminator initial run failed"));

  _timer = setInterval(() => {
    processCompletedGames()
      .then(stats => {
        if (stats.picksGraded > 0 || stats.playersEliminated > 0) {
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
