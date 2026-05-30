/**
 * Auto-eliminator: polls ESPN every 5 minutes, grades pending picks when
 * games go Final, and eliminates players — no commissioner action required.
 *
 * processedBy = null in weekResultsTable marks auto-processed entries.
 *
 * Two passes per run:
 *  Pass 1 — Grade new pending picks against live ESPN scores.
 *  Pass 2 — Idempotency: fix any "loss" picks whose entry is still "alive"
 *            (handles pool-type changes, restarts, or any prior missed run).
 */

import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, weekResultsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
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
  let picksGraded = 0;
  let playersEliminated = 0;
  let weeksFinalized = 0;

  // ── PASS 1: Grade pending picks ──────────────────────────────────────────

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
    .where(eq(picksTable.result, "pending"));

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
      const poolId = parseInt(poolIdStr, 10);
      const week = parseInt(weekStr, 10);

      const [existing] = await db
        .select({ id: weekResultsTable.id })
        .from(weekResultsTable)
        .where(and(eq(weekResultsTable.poolId, poolId), eq(weekResultsTable.week, week)))
        .limit(1);

      if (existing) continue;

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

      if (stillPending) continue;

      const weekPicks = await db
        .select({ teamId: picksTable.teamId, result: picksTable.result })
        .from(picksTable)
        .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));

      const losingTeamIds = [
        ...new Set(weekPicks.filter(p => p.result === "loss").map(p => p.teamId)),
      ];

      await db.insert(weekResultsTable).values({
        poolId,
        week,
        losingTeamIds,
        processedBy: null,
      });

      weeksFinalized++;
      logger.info({ poolId, week, losingTeamIds }, "Auto-finalized week results");
    }
  }

  // ── PASS 2: Idempotency — fix graded-loss picks with alive entries ────────
  // Catches: pool-type changes (weekly → season), server restarts, any prior
  // missed elimination. Safe to run every cycle — updates are no-ops if the
  // entry is already eliminated.

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
        "Auto-eliminated player (pass 2 correction)",
      );
    }
  }

  return { picksGraded, playersEliminated, weeksFinalized };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let _timer: ReturnType<typeof setInterval> | null = null;

export function startAutoEliminator(): void {
  if (_timer) return;

  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Auto-eliminator starting");

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
