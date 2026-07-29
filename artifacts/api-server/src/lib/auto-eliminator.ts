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
import { picksTable, pickemPicksTable, entriesTable, poolsTable, weekResultsTable, wcBracketPicksTable, wcBracketResultsTable, sandboxGameScoresTable, usersTable, nflConfidenceResultsTable } from "@workspace/db";
import { eq, and, ne, inArray, count, or, isNull, max, gte, lte, lt, sql } from "drizzle-orm";
import { calcPrize } from "./prizeCalc";
import {
  fetchGames,
  fetchGamesForDate,
  fetchSuperLeagueGamesForDate,
  fetchIntlGamesForDate,
  getTodayEtDate,
  formatDateEt,
  formatDateEtDash,
  getNhlWeekBounds,
  NHL_SANDBOX_ANCHOR,
  getNbaWeekendBounds,
  NBA_SANDBOX_ANCHOR,
  type EspnGame,
  getMlbWeekBounds,
  getMlbProcessingTrigger,
  fetchMlbWeekGames,
  fetchNhlGamesByWeek,
  fetchNbaGamesByWeek,
  fetchNflGamesByWeek,
  getTeamsWithWin,
} from "./espn";
import { applyPickEmSeasonClosure, applyNflConfidenceSeasonClosure, NFL_TOTAL_WEEKS } from "./pickem-season-closure";
import {
  fetchTodayWcGames,
  fetchWcGamesForDate,
  wcOutcome as wcOutcomeFromWc,
  WC_PHASES,
  type WcGame,
  fetchWcBracketMatches,
  invalidateBracketCache,
  WIN_TYPE_MAP,
} from "./wc";
import { fetchNhlTiebreakerStats } from "./nhl-stats";
import { fetchNbaTiebreakerStats } from "./nba-stats";
import { fetchSingleGameStrikeouts, fetchDailyStrikeouts } from "./mlb-stats";
import { resolveSequentialTiebreaker } from "./tiebreaker";
import { logger } from "./logger";
import { processReplayTick } from "./replayMode";
import { NFL_TEAM_INFO, NFL_TEAM_INFO_BY_ID, getSandboxGamesForWeek } from "./nfl2025Schedule";

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
      poolCreatedAt: poolsTable.createdAt,
      sandboxMode: poolsTable.sandboxMode,
    })
    .from(picksTable)
    .innerJoin(poolsTable, eq(picksTable.poolId, poolsTable.id))
    .where(and(eq(picksTable.result, "pending"), ne(poolsTable.sport, "mlb"), eq(poolsTable.isActive, true)));

  if (pendingRows.length > 0) {
    // ── Non-NHL, non-NBA: batch-fetch today's scoreboard once per sport ──────
    // NBA is excluded here and handled below with week-specific batching,
    // for the same reason NHL is: the bare scoreboard only returns today's
    // live games, so a game that finished yesterday disappears and any pending
    // pick attached to it would never be graded.
    const nonNhlRows = pendingRows.filter(r => r.sport !== "nhl" && r.sport !== "nba");
    const distinctSports = [...new Set(nonNhlRows.map(r => r.sport))];
    const gamesBySport = new Map<string, EspnGame[]>();

    await Promise.all(
      distinctSports.map(async (sport) => {
        const games = await fetchGames(sport);
        gamesBySport.set(sport, games);
      }),
    );

    // ── NHL: fetch full Mon-Sun week per pool+week combo ─────────────────────
    // The bare scoreboard only has today's games; NHL picks can reference any
    // game within the week, so we need the full 7-day range.
    const nhlRows = pendingRows.filter(r => r.sport === "nhl");
    const nhlPoolWeekKeys = [...new Set(nhlRows.map(r => `${r.poolId}:${r.week}`))];
    const nhlGamesByPoolWeek = new Map<string, EspnGame[]>();
    if (nhlPoolWeekKeys.length > 0) {
      await Promise.all(nhlPoolWeekKeys.map(async key => {
        const ref = nhlRows.find(r => `${r.poolId}:${r.week}` === key)!;
        const anchor = ref.sandboxMode ? NHL_SANDBOX_ANCHOR : ref.poolCreatedAt;
        const games = await fetchNhlGamesByWeek(anchor, ref.week);
        nhlGamesByPoolWeek.set(key, games);
        const completed = games.filter(g => g.isCompleted);
        logger.info(
          {
            sport: "nhl",
            poolId: ref.poolId,
            week: ref.week,
            completedGames: completed.map(g =>
              `${g.awayTeam.abbreviation}(${g.awayTeam.id}) ${g.awayScore}-${g.homeScore} ${g.homeTeam.abbreviation}(${g.homeTeam.id})`,
            ),
          },
          "ESPN completed games for sport",
        );
      }));
    }

    // ── NBA: fetch full Fri-Sun weekend per pool+week combo ──────────────────
    // Same day-boundary problem as NHL: a game finishing Friday night is gone
    // from Saturday's bare scoreboard. fetchNbaGamesByWeek batches the full
    // Fri+Sat+Sun window so no pick falls through the gap.
    const nbaRows = pendingRows.filter(r => r.sport === "nba");
    const nbaPoolWeekKeys = [...new Set(nbaRows.map(r => `${r.poolId}:${r.week}`))];
    const nbaGamesByPoolWeek = new Map<string, EspnGame[]>();
    if (nbaPoolWeekKeys.length > 0) {
      await Promise.all(nbaPoolWeekKeys.map(async key => {
        const ref = nbaRows.find(r => `${r.poolId}:${r.week}` === key)!;
        const anchor = ref.sandboxMode ? NBA_SANDBOX_ANCHOR : ref.poolCreatedAt;
        const games = await fetchNbaGamesByWeek(anchor, ref.week);
        nbaGamesByPoolWeek.set(key, games);
        const completed = games.filter(g => g.isCompleted);
        logger.info(
          {
            sport: "nba",
            poolId: ref.poolId,
            week: ref.week,
            completedGames: completed.map(g =>
              `${g.awayTeam.abbreviation}(${g.awayTeam.id}) ${g.awayScore}-${g.homeScore} ${g.homeTeam.abbreviation}(${g.homeTeam.id})`,
            ),
          },
          "ESPN completed games for sport",
        );
      }));
    }

    // Build teamId → completed game lookup for non-NHL sports
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
      // NHL: look up the game from the week-specific batch, not today's scoreboard
      let game;
      if (row.sandboxMode && row.sport === "nfl") {
        // Replay mode — look up from sandbox_game_scores instead of ESPN
        const replayRows = await db
          .select()
          .from(sandboxGameScoresTable)
          .where(and(
            eq(sandboxGameScoresTable.poolId, row.poolId),
            eq(sandboxGameScoresTable.week, row.week),
            eq(sandboxGameScoresTable.gameStatus, "final"),
            or(
              eq(sandboxGameScoresTable.homeTeam, NFL_TEAM_INFO_BY_ID[row.teamId] ?? ""),
              eq(sandboxGameScoresTable.awayTeam, NFL_TEAM_INFO_BY_ID[row.teamId] ?? ""),
            ),
          ));
        if (replayRows.length > 0) {
          const r = replayRows[0];
          const homeScore = r.homeScore ?? 0;
          const awayScore = r.awayScore ?? 0;
          game = {
            homeTeam: { id: NFL_TEAM_INFO[r.homeTeam ?? ""]?.id ?? "", abbreviation: r.homeTeam ?? "", displayName: r.homeTeam ?? "" },
            awayTeam: { id: NFL_TEAM_INFO[r.awayTeam ?? ""]?.id ?? "", abbreviation: r.awayTeam ?? "", displayName: r.awayTeam ?? "" },
            homeScore,
            awayScore,
            isCompleted: true,
          };
        }
      } else if (row.sport === "nhl") {
        game = (nhlGamesByPoolWeek.get(`${row.poolId}:${row.week}`) ?? []).find(
          g => (g.homeTeam.id === row.teamId || g.awayTeam.id === row.teamId) && g.isCompleted,
        );
      } else if (row.sport === "nba") {
        game = (nbaGamesByPoolWeek.get(`${row.poolId}:${row.week}`) ?? []).find(
          g => (g.homeTeam.id === row.teamId || g.awayTeam.id === row.teamId) && g.isCompleted,
        );
      } else {
        game = completedByTeam.get(row.teamId);
      }

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
      if (game.homeScore === game.awayScore) {
        if (row.sport !== "superleague") continue; // tie — leave for commissioner
        // Soccer draw: push — safe, no strike, not counted as a win
        await db.update(picksTable).set({ result: "push" }).where(eq(picksTable.id, row.pickId));
        picksGraded++;
        affectedPoolWeeks.add(`${row.poolId}:${row.week}`);
        logger.info(
          {
            poolId: row.poolId,
            userId: row.userId,
            teamId: row.teamId,
            teamName: row.teamName,
            week: row.week,
            score: `${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore}`,
          },
          "Auto-graded pick (soccer draw = push)",
        );
        continue;
      }

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
        // NHL and NBA Survivor Season use 3 lives (2 warning strikes before elimination).
        const maxStrikes = ((row.sport === "nhl" || row.sport === "nba" || row.sport === "superleague") && row.poolType === "season") ? 2 : 0;

        if (maxStrikes > 0) {
          // Point-read the entry to get current strikeCount
          const [entry] = await db
            .select({ strikeCount: entriesTable.strikeCount })
            .from(entriesTable)
            .where(and(
              eq(entriesTable.poolId, row.poolId),
              eq(entriesTable.userId, row.userId),
              eq(entriesTable.status, "alive"),
            ))
            .limit(1);

          if (entry && entry.strikeCount < maxStrikes) {
            // Warning strike — player stays alive
            await db
              .update(entriesTable)
              .set({ strikeCount: entry.strikeCount + 1, streak: 0 })
              .where(and(
                eq(entriesTable.poolId, row.poolId),
                eq(entriesTable.userId, row.userId),
                eq(entriesTable.status, "alive"),
              ));
            logger.info(
              { poolId: row.poolId, userId: row.userId, week: row.week, teamName: row.teamName, strikeCount: entry.strikeCount + 1, maxStrikes },
              "Auto-eliminator pass 1: warning strike (multi-life pool)",
            );
          } else if (entry) {
            // Strikes exhausted — permanent elimination
            await db
              .update(entriesTable)
              .set({ status: "eliminated", eliminatedWeek: row.week, streak: 0 })
              .where(and(
                eq(entriesTable.poolId, row.poolId),
                eq(entriesTable.userId, row.userId),
                eq(entriesTable.status, "alive"),
              ));
            playersEliminated++;
            logger.info(
              { poolId: row.poolId, userId: row.userId, week: row.week, teamName: row.teamName, strikeCount: entry.strikeCount },
              "Auto-eliminated player (pass 1, strikes exhausted)",
            );
          }
        } else {
          // Single-life pool: eliminate immediately
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

  // ── PASS 2: Idempotency — fix alive entries that have exceeded their loss cap ──
  // Catches: Pass 1 failures (grade succeeded but entry UPDATE missed), server
  // restarts, any prior missed elimination. Safe to run every cycle — entry
  // UPDATE has WHERE status = "alive", so re-runs against already-eliminated
  // entries are no-ops.
  // Excludes MLB pools — they use weekly batch processing instead.
  // Excludes picks from voided weeks — void intentionally keeps entries alive.
  //
  // Algorithm: two flat queries + in-memory walk.
  //   Query 1 — fetch all alive entries in eligible (non-mlb, non-weekly,
  //             isActive) pools.
  //   Query 2 — fetch all graded (non-pending) picks for those pools, excluding
  //             picks from voided weeks, ordered (poolId, userId, week ASC).
  //   Walk    — for each player, accumulate a running loss count in week order.
  //             The FIRST week where lossCount > maxStrikes is violatingWeek.
  //   Outcome — violatingWeek found → eliminate with eliminatedWeek = violatingWeek.
  //             not found → player correctly alive, skip.
  //
  // This correctly handles two previously broken cases:
  //   • Player exceeded cap early then won later weeks: latest pick is a win,
  //     which the old "most recent pick" approach never saw.
  //   • Player exceeded cap at week N then kept playing: eliminatedWeek must be
  //     N (the first violating week), not the last loss week.

  const pass2Candidates = await db
    .select({
      poolId: entriesTable.poolId,
      userId: entriesTable.userId,
      entryId: entriesTable.id,
      sport: poolsTable.sport,
      poolType: poolsTable.poolType,
    })
    .from(entriesTable)
    .innerJoin(poolsTable, eq(entriesTable.poolId, poolsTable.id))
    .where(
      and(
        eq(entriesTable.status, "alive"),
        ne(poolsTable.poolType, "weekly"),
        ne(poolsTable.sport, "mlb"),
        eq(poolsTable.isActive, true),
      ),
    );

  if (pass2Candidates.length > 0) {
    const candidatePoolIds = [...new Set(pass2Candidates.map(c => c.poolId))];

    const gradedPicks = await db
      .select({
        poolId: picksTable.poolId,
        userId: picksTable.userId,
        week: picksTable.week,
        result: picksTable.result,
        teamId: picksTable.teamId,
        teamName: picksTable.teamName,
      })
      .from(picksTable)
      .leftJoin(
        weekResultsTable,
        and(
          eq(weekResultsTable.poolId, picksTable.poolId),
          eq(weekResultsTable.week, picksTable.week),
        ),
      )
      .where(
        and(
          inArray(picksTable.poolId, candidatePoolIds),
          ne(picksTable.result, "pending"),
          or(isNull(weekResultsTable.id), eq(weekResultsTable.isVoided, false)),
        ),
      )
      .orderBy(picksTable.poolId, picksTable.userId, picksTable.week);

    const picksByPlayer = new Map<string, typeof gradedPicks>();
    for (const pick of gradedPicks) {
      const key = `${pick.poolId}:${pick.userId}`;
      if (!picksByPlayer.has(key)) picksByPlayer.set(key, []);
      picksByPlayer.get(key)!.push(pick);
    }

    for (const candidate of pass2Candidates) {
      const maxStrikes =
        (candidate.sport === "nhl" || candidate.sport === "nba" || candidate.sport === "superleague") && candidate.poolType === "season" ? 2 : 0;
      const picks =
        picksByPlayer.get(`${candidate.poolId}:${candidate.userId}`) ?? [];

      let lossCount = 0;
      let violatingWeek: number | null = null;
      let violatingTeamId: string | null = null;
      let violatingTeamName: string | null = null;

      for (const pick of picks) {
        if (pick.result === "loss") {
          lossCount++;
          if (lossCount > maxStrikes && violatingWeek === null) {
            violatingWeek = pick.week;
            violatingTeamId = pick.teamId;
            violatingTeamName = pick.teamName;
          }
        }
      }

      if (violatingWeek === null) continue;

      logger.warn(
        {
          poolId: candidate.poolId,
          userId: candidate.userId,
          violatingWeek,
          lossCount,
          maxStrikes,
          teamId: violatingTeamId,
          teamName: violatingTeamName,
          sport: candidate.sport,
          poolType: candidate.poolType,
        },
        "Auto-eliminator pass 2: cumulative losses exceed cap — correcting",
      );

      const updated = await db
        .update(entriesTable)
        .set({ status: "eliminated", eliminatedWeek: violatingWeek, streak: 0 })
        .where(
          and(
            eq(entriesTable.poolId, candidate.poolId),
            eq(entriesTable.userId, candidate.userId),
            eq(entriesTable.status, "alive"),
          ),
        )
        .returning({ id: entriesTable.id });

      if (updated.length > 0) {
        playersEliminated++;
        logger.info(
          {
            poolId: candidate.poolId,
            userId: candidate.userId,
            eliminatedWeek: violatingWeek,
            teamName: violatingTeamName,
          },
          "Auto-eliminated player (pass 2 correction)",
        );
      }
    }
  }

  // ── NFL Survivor auto-close: declare winner when exactly 1 alive entry remains ──
  const nflSurvivorPools = await db
    .select()
    .from(poolsTable)
    .where(and(
      eq(poolsTable.sport, "nfl"),
      eq(poolsTable.poolType, "season"),
      eq(poolsTable.isActive, true),
    ));

  for (const pool of nflSurvivorPools) {
    const aliveEntries = await db
      .select({ id: entriesTable.id, userId: entriesTable.userId })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));

    // 0 = void edge case (leave for commissioner); >1 = still playing
    if (aliveEntries.length !== 1) continue;

    const winner = aliveEntries[0];

    // Fetch all entries to rank the full field
    const allEntries = await db
      .select({
        id: entriesTable.id,
        userId: entriesTable.userId,
        status: entriesTable.status,
        eliminatedWeek: entriesTable.eliminatedWeek,
      })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, pool.id));

    const totalEntries = allEntries.length;
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;

    // ── 1. Write winner (finish position 1) ────────────────────────────────
    const winnerPrize = calcPrize({
      prizeStructure: ps,
      prizeMode: pool.prizeMode,
      entryFee: pool.entryFee,
      prizePot: pool.prizePot,
      totalEntries,
      maxEntries: pool.maxEntries,
      placeIndex: 0,
      coWinners: 1,
    });

    await db
      .update(entriesTable)
      .set({ finishPosition: 1, prizeAmount: winnerPrize, finalWinner: true })
      .where(eq(entriesTable.id, winner.id));

    // ── 2. Rank eliminated entries by eliminatedWeek desc ──────────────────
    // Later elimination = better finish position (survived longer).
    const eliminated = allEntries
      .filter(e => e.status === "eliminated" && e.eliminatedWeek != null)
      .sort((a, b) => (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0));

    let positionOffset = 1; // slot 0 taken by the winner
    let ei = 0;
    while (ei < eliminated.length) {
      let ej = ei + 1;
      while (ej < eliminated.length && eliminated[ej].eliminatedWeek === eliminated[ei].eliminatedWeek) ej++;
      const group = eliminated.slice(ei, ej);
      const finishPosition = positionOffset + 1;
      const prize = calcPrize({
        prizeStructure: ps,
        prizeMode: pool.prizeMode,
        entryFee: pool.entryFee,
        prizePot: pool.prizePot,
        totalEntries,
        maxEntries: pool.maxEntries,
        placeIndex: positionOffset,
        coWinners: group.length,
      });
      await db
        .update(entriesTable)
        .set({ finishPosition, prizeAmount: prize })
        .where(inArray(entriesTable.id, group.map(e => e.id)));
      positionOffset += group.length;
      ei = ej;
    }

    // ── 3. Close pool with winner's display name in closureReason ─────────
    const [winnerUser] = await db
      .select({ username: usersTable.username, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, winner.userId))
      .limit(1);
    const winnerUsername = winnerUser ? (winnerUser.displayName ?? winnerUser.username) : null;

    await db
      .update(poolsTable)
      .set({ isActive: false, endedAt: new Date(), closureReason: winnerUsername })
      .where(eq(poolsTable.id, pool.id));

    logger.info(
      { poolId: pool.id, winnerUserId: winner.userId, winnerUsername, totalEntries },
      "NFL Survivor auto-close: 1 survivor remains — pool closed, standings written",
    );
  }

  // ── NHL Survivor auto-close: declare winner when exactly 1 alive entry remains ──
  const nhlSurvivorPools = await db
    .select()
    .from(poolsTable)
    .where(and(
      eq(poolsTable.sport, "nhl"),
      eq(poolsTable.poolType, "season"),
      eq(poolsTable.isActive, true),
    ));

  for (const pool of nhlSurvivorPools) {
    const aliveEntries = await db
      .select({ id: entriesTable.id, userId: entriesTable.userId })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));

    // 0 = void edge case (leave for commissioner); >1 = still playing
    if (aliveEntries.length !== 1) continue;

    const winner = aliveEntries[0];

    const allEntries = await db
      .select({
        id: entriesTable.id,
        userId: entriesTable.userId,
        status: entriesTable.status,
        eliminatedWeek: entriesTable.eliminatedWeek,
      })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, pool.id));

    const totalEntries = allEntries.length;
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;

    const winnerPrize = calcPrize({
      prizeStructure: ps,
      prizeMode: pool.prizeMode,
      entryFee: pool.entryFee,
      prizePot: pool.prizePot,
      totalEntries,
      maxEntries: pool.maxEntries,
      placeIndex: 0,
      coWinners: 1,
    });

    await db
      .update(entriesTable)
      .set({ finishPosition: 1, prizeAmount: winnerPrize, finalWinner: true })
      .where(eq(entriesTable.id, winner.id));

    const eliminated = allEntries
      .filter(e => e.status === "eliminated" && e.eliminatedWeek != null)
      .sort((a, b) => (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0));

    let positionOffset = 1;
    let ei = 0;
    while (ei < eliminated.length) {
      let ej = ei + 1;
      while (ej < eliminated.length && eliminated[ej].eliminatedWeek === eliminated[ei].eliminatedWeek) ej++;
      const group = eliminated.slice(ei, ej);
      const finishPosition = positionOffset + 1;
      const prize = calcPrize({
        prizeStructure: ps,
        prizeMode: pool.prizeMode,
        entryFee: pool.entryFee,
        prizePot: pool.prizePot,
        totalEntries,
        maxEntries: pool.maxEntries,
        placeIndex: positionOffset,
        coWinners: group.length,
      });
      await db
        .update(entriesTable)
        .set({ finishPosition, prizeAmount: prize })
        .where(inArray(entriesTable.id, group.map(e => e.id)));
      positionOffset += group.length;
      ei = ej;
    }

    const [winnerUser] = await db
      .select({ username: usersTable.username, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, winner.userId))
      .limit(1);
    const winnerUsername = winnerUser ? (winnerUser.displayName ?? winnerUser.username) : null;

    await db
      .update(poolsTable)
      .set({ isActive: false, endedAt: new Date(), closureReason: winnerUsername })
      .where(eq(poolsTable.id, pool.id));

    logger.info(
      { poolId: pool.id, winnerUserId: winner.userId, winnerUsername, totalEntries },
      "NHL Survivor auto-close: 1 survivor remains — pool closed, standings written",
    );
  }

  // ── NBA Survivor auto-close: declare winner when exactly 1 alive entry remains ──
  const nbaSurvivorPools = await db
    .select()
    .from(poolsTable)
    .where(and(
      eq(poolsTable.sport, "nba"),
      eq(poolsTable.poolType, "season"),
      eq(poolsTable.isActive, true),
    ));

  for (const pool of nbaSurvivorPools) {
    const aliveEntries = await db
      .select({ id: entriesTable.id, userId: entriesTable.userId })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));

    // 0 = void edge case (leave for commissioner); >1 = still playing
    if (aliveEntries.length !== 1) continue;

    const winner = aliveEntries[0];

    const allEntries = await db
      .select({
        id: entriesTable.id,
        userId: entriesTable.userId,
        status: entriesTable.status,
        eliminatedWeek: entriesTable.eliminatedWeek,
      })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, pool.id));

    const totalEntries = allEntries.length;
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;

    const winnerPrize = calcPrize({
      prizeStructure: ps,
      prizeMode: pool.prizeMode,
      entryFee: pool.entryFee,
      prizePot: pool.prizePot,
      totalEntries,
      maxEntries: pool.maxEntries,
      placeIndex: 0,
      coWinners: 1,
    });

    await db
      .update(entriesTable)
      .set({ finishPosition: 1, prizeAmount: winnerPrize, finalWinner: true })
      .where(eq(entriesTable.id, winner.id));

    const eliminated = allEntries
      .filter(e => e.status === "eliminated" && e.eliminatedWeek != null)
      .sort((a, b) => (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0));

    let positionOffset = 1;
    let ei = 0;
    while (ei < eliminated.length) {
      let ej = ei + 1;
      while (ej < eliminated.length && eliminated[ej].eliminatedWeek === eliminated[ei].eliminatedWeek) ej++;
      const group = eliminated.slice(ei, ej);
      const finishPosition = positionOffset + 1;
      const prize = calcPrize({
        prizeStructure: ps,
        prizeMode: pool.prizeMode,
        entryFee: pool.entryFee,
        prizePot: pool.prizePot,
        totalEntries,
        maxEntries: pool.maxEntries,
        placeIndex: positionOffset,
        coWinners: group.length,
      });
      await db
        .update(entriesTable)
        .set({ finishPosition, prizeAmount: prize })
        .where(inArray(entriesTable.id, group.map(e => e.id)));
      positionOffset += group.length;
      ei = ej;
    }

    const [winnerUser] = await db
      .select({ username: usersTable.username, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, winner.userId))
      .limit(1);
    const winnerUsername = winnerUser ? (winnerUser.displayName ?? winnerUser.username) : null;

    await db
      .update(poolsTable)
      .set({ isActive: false, endedAt: new Date(), closureReason: winnerUsername })
      .where(eq(poolsTable.id, pool.id));

    logger.info(
      { poolId: pool.id, winnerUserId: winner.userId, winnerUsername, totalEntries },
      "NBA Survivor auto-close: 1 survivor remains — pool closed, standings written",
    );
  }

  // ── ESL Survivor auto-close ────────────────────────────────────────────────
  // Case A: exactly 1 alive → close immediately (matches NFL/NHL/NBA pattern).
  // Case B: multiple alive after matchweek 38, fully graded → rank surviving
  //         players by total-season wins (descending). Fall back to even-split
  //         co-winner only when two or more players share the highest win count.
  const eslSurvivorPools = await db
    .select()
    .from(poolsTable)
    .where(and(
      eq(poolsTable.sport, "superleague"),
      eq(poolsTable.poolType, "season"),
      eq(poolsTable.isActive, true),
    ));

  for (const pool of eslSurvivorPools) {
    const aliveEntries = await db
      .select({ id: entriesTable.id, userId: entriesTable.userId })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));

    if (aliveEntries.length === 0) continue; // void edge case — leave for commissioner

    const allEntries = await db
      .select({
        id: entriesTable.id,
        userId: entriesTable.userId,
        status: entriesTable.status,
        eliminatedWeek: entriesTable.eliminatedWeek,
      })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, pool.id));

    const totalEntries = allEntries.length;
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;

    const eliminated = allEntries
      .filter(e => e.status === "eliminated" && e.eliminatedWeek != null)
      .sort((a, b) => (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0));

    // ── Case A: exactly one survivor ─────────────────────────────────────────
    if (aliveEntries.length === 1) {
      const winner = aliveEntries[0]!;
      const winnerPrize = calcPrize({
        prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
        prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
        placeIndex: 0, coWinners: 1,
      });
      await db.update(entriesTable)
        .set({ finishPosition: 1, prizeAmount: winnerPrize, finalWinner: true })
        .where(eq(entriesTable.id, winner.id));

      let positionOffset = 1;
      let ei = 0;
      while (ei < eliminated.length) {
        let ej = ei + 1;
        while (ej < eliminated.length && eliminated[ej].eliminatedWeek === eliminated[ei].eliminatedWeek) ej++;
        const group = eliminated.slice(ei, ej);
        const prize = calcPrize({
          prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
          prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
          placeIndex: positionOffset, coWinners: group.length,
        });
        await db.update(entriesTable)
          .set({ finishPosition: positionOffset + 1, prizeAmount: prize })
          .where(inArray(entriesTable.id, group.map(e => e.id)));
        positionOffset += group.length;
        ei = ej;
      }

      const [winnerUser] = await db
        .select({ username: usersTable.username, displayName: usersTable.displayName })
        .from(usersTable)
        .where(eq(usersTable.id, winner.userId))
        .limit(1);
      const winnerUsername = winnerUser ? (winnerUser.displayName ?? winnerUser.username) : null;
      await db.update(poolsTable)
        .set({ isActive: false, endedAt: new Date(), closureReason: winnerUsername })
        .where(eq(poolsTable.id, pool.id));
      logger.info(
        { poolId: pool.id, winnerUserId: winner.userId, winnerUsername, totalEntries },
        "ESL Survivor auto-close: 1 survivor remains — pool closed, standings written",
      );
      continue;
    }

    // ── Case B: multiple alive — only fire after matchweek 38 is fully graded ─
    if (pool.currentWeek < 38) continue;

    const [pendingRow] = await db
      .select({ cnt: sql<number>`cast(count(*) as int)` })
      .from(picksTable)
      .where(and(eq(picksTable.poolId, pool.id), eq(picksTable.week, 38), eq(picksTable.result, "pending")));
    if ((pendingRow?.cnt ?? 0) > 0) continue; // week 38 not fully graded yet

    // Count total-season wins per alive player
    const winRows = await db
      .select({ userId: picksTable.userId, wins: sql<number>`cast(count(*) as int)` })
      .from(picksTable)
      .where(and(eq(picksTable.poolId, pool.id), eq(picksTable.result, "win")))
      .groupBy(picksTable.userId);

    const winsByUserId = new Map(winRows.map(r => [r.userId, Number(r.wins)]));
    const ranked = [...aliveEntries]
      .map(e => ({ ...e, wins: winsByUserId.get(e.userId) ?? 0 }))
      .sort((a, b) => b.wins - a.wins);

    const topWins = ranked[0]!.wins;
    const champions = ranked.filter(e => e.wins === topWins);
    const runnersUp = ranked.filter(e => e.wins < topWins);

    // Assign position 1 to champion(s)
    const championPrize = calcPrize({
      prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
      prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
      placeIndex: 0, coWinners: champions.length,
    });
    await db.update(entriesTable)
      .set({ finishPosition: 1, prizeAmount: championPrize, finalWinner: true })
      .where(inArray(entriesTable.id, champions.map(e => e.id)));

    // Assign positions to runner-up alive entries, grouped by win count
    let positionOffset = champions.length;
    let ri = 0;
    while (ri < runnersUp.length) {
      let rj = ri + 1;
      while (rj < runnersUp.length && runnersUp[rj]!.wins === runnersUp[ri]!.wins) rj++;
      const group = runnersUp.slice(ri, rj);
      const prize = calcPrize({
        prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
        prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
        placeIndex: positionOffset, coWinners: group.length,
      });
      await db.update(entriesTable)
        .set({ finishPosition: positionOffset + 1, prizeAmount: prize })
        .where(inArray(entriesTable.id, group.map(e => e.id)));
      positionOffset += group.length;
      ri = rj;
    }

    // Rank eliminated entries by eliminatedWeek descending
    let ei = 0;
    while (ei < eliminated.length) {
      let ej = ei + 1;
      while (ej < eliminated.length && eliminated[ej].eliminatedWeek === eliminated[ei].eliminatedWeek) ej++;
      const group = eliminated.slice(ei, ej);
      const prize = calcPrize({
        prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
        prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
        placeIndex: positionOffset, coWinners: group.length,
      });
      await db.update(entriesTable)
        .set({ finishPosition: positionOffset + 1, prizeAmount: prize })
        .where(inArray(entriesTable.id, group.map(e => e.id)));
      positionOffset += group.length;
      ei = ej;
    }

    // Close pool — name the winner if uncontested, otherwise "co_winners"
    let closureReason: string | null = null;
    if (champions.length === 1) {
      const [winnerUser] = await db
        .select({ username: usersTable.username, displayName: usersTable.displayName })
        .from(usersTable)
        .where(eq(usersTable.id, champions[0]!.userId))
        .limit(1);
      closureReason = winnerUser ? (winnerUser.displayName ?? winnerUser.username) : null;
    } else {
      closureReason = "co_winners";
    }
    await db.update(poolsTable)
      .set({ isActive: false, endedAt: new Date(), closureReason })
      .where(eq(poolsTable.id, pool.id));

    logger.info(
      { poolId: pool.id, champions: champions.length, topWins, totalEntries },
      "ESL Survivor auto-close: week 38 complete — ranked surviving players by total wins",
    );
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

    // Advance or close depending on isRecurring
    if (pool.isRecurring) {
      await db.update(poolsTable)
        .set({ currentWeek: pool.currentWeek + 1 })
        .where(eq(poolsTable.id, pool.id));

      weeksProcessed++;
      logger.info(
        { poolId: pool.id, week: pool.currentWeek, playersEliminated, playersRevived },
        "MLB: weekly results processed, advancing to next week",
      );
    } else {
      await db.update(poolsTable)
        .set({ isActive: false, endedAt: new Date() })
        .where(eq(poolsTable.id, pool.id));

      weeksProcessed++;
      logger.info(
        { poolId: pool.id, week: pool.currentWeek, playersEliminated, playersRevived },
        "MLB: weekly results processed, pool closed (isRecurring=false)",
      );
    }
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

      // Get pending picks for this date — must match pool.currentWeek so a
      // previously-closed day (week already advanced) is never re-processed.
      const pendingPicks = await db.select({
        id: picksTable.id,
        userId: picksTable.userId,
        teamId: picksTable.teamId,
        teamName: picksTable.teamName,
      }).from(picksTable)
        .where(and(
          eq(picksTable.poolId, pool.id),
          eq(picksTable.week, pool.currentWeek),
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
          eq(picksTable.week, pool.currentWeek),
          eq(picksTable.pickDate, dateEt),
          eq(picksTable.result, "pending"),
        ))
        .limit(1);
      if (stillPending) continue;

      // Guard: don't close a date where this pool had zero picks for the current
      // week slot — the pool may not have been active on that date (e.g. yesterday
      // check on a brand-new pool), or the day has already been advanced.
      const [{ totalForDate }] = await db.select({ totalForDate: count() })
        .from(picksTable)
        .where(and(
          eq(picksTable.poolId, pool.id),
          eq(picksTable.week, pool.currentWeek),
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
// Shared settlement helper for NFL Confidence Weekly pools
// Called by both the simulate-grading route (sandbox) and the live auto-grader.
// ---------------------------------------------------------------------------

export async function settleNflConfidenceWeeklyPool(
  pool: {
    id: number;
    prizeStructure: unknown;
    prizeMode: string | null;
    entryFee: number | null;
    prizePot: number | null;
    maxEntries: number | null;
  },
  week: number,
): Promise<{ winnerUsername: string | null }> {
  // Tiebreaker actuals — may not exist for live pools (simulate-grading inserts
  // them before calling this; live auto-grader falls back to 0).
  const [resultsRow] = await db
    .select({
      actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
      actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
    })
    .from(nflConfidenceResultsTable)
    .where(and(eq(nflConfidenceResultsTable.poolId, pool.id), eq(nflConfidenceResultsTable.week, week)))
    .limit(1);

  const actualPassingYards = resultsRow?.actualPassingYards ?? null;
  const actualRushingYards = resultsRow?.actualRushingYards ?? null;

  const scoreRows = await db
    .select({
      userId: pickemPicksTable.userId,
      points: sql<number>`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE(${pickemPicksTable.confidencePoints}::integer, 0) ELSE 0 END), 0)`,
    })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, pool.id), eq(pickemPicksTable.week, week)))
    .groupBy(pickemPicksTable.userId);

  const entryRows = await db
    .select({
      id: entriesTable.id,
      userId: entriesTable.userId,
      tiebreakerPassingYards: entriesTable.tiebreakerPassingYards,
      tiebreakerRushingYards: entriesTable.tiebreakerRushingYards,
    })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, pool.id));

  const allUserIds = entryRows.map((e) => e.userId);
  const userRows =
    allUserIds.length > 0
      ? await db
          .select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName })
          .from(usersTable)
          .where(inArray(usersTable.id, allUserIds))
      : [];
  const usernameMap = new Map(userRows.map((u) => [u.id, u.displayName ?? u.username]));

  const scoreMap = new Map(scoreRows.map((r) => [r.userId, Number(r.points)]));
  // Sort by confidence points only — tiebreaker resolves ties within each group.
  const players = entryRows.map((e) => ({
    userId: e.userId,
    entryId: e.id,
    points: scoreMap.get(e.userId) ?? 0,
    passingGuess: e.tiebreakerPassingYards ?? null,
    rushingGuess: e.tiebreakerRushingYards ?? null,
  }));
  players.sort((a, b) => b.points - a.points);

  const totalEntries = players.length;
  const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
  let positionOffset = 0;
  let i = 0;

  while (i < players.length) {
    // Find end of this points-tied group.
    let j = i + 1;
    while (j < players.length && players[j].points === players[i].points) j++;
    const group = players.slice(i, j);

    if (group.length === 1) {
      // No tie — assign directly.
      const finishPosition = positionOffset + 1;
      const prize = calcPrize({
        prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
        prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
        placeIndex: positionOffset, coWinners: 1,
      });
      await db.update(entriesTable)
        .set({ finishPosition, prizeAmount: prize, finalWinner: finishPosition === 1 })
        .where(inArray(entriesTable.id, group.map((p) => p.entryId)));
      positionOffset += 1;
    } else {
      // Tied on points — apply sequential tiebreaker (passing primary, rushing secondary).
      const primaryGuesses = new Map(group.map((p) => [p.userId, p.passingGuess]));
      const secondaryGuesses = new Map(group.map((p) => [p.userId, p.rushingGuess]));
      const winnerIds = resolveSequentialTiebreaker(
        group.map((p) => p.userId),
        primaryGuesses,
        secondaryGuesses,
        actualPassingYards,
        actualRushingYards,
      );

      if (winnerIds !== null) {
        // Tiebreaker resolved: write winners, then the rest at the next rank.
        const winners = group.filter((p) => winnerIds.has(p.userId));
        const losers  = group.filter((p) => !winnerIds.has(p.userId));

        const winnerPos = positionOffset + 1;
        const winnerPrize = calcPrize({
          prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
          prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
          placeIndex: positionOffset, coWinners: winners.length,
        });
        await db.update(entriesTable)
          .set({ finishPosition: winnerPos, prizeAmount: winnerPrize, finalWinner: winnerPos === 1 })
          .where(inArray(entriesTable.id, winners.map((p) => p.entryId)));
        positionOffset += winners.length;

        if (losers.length > 0) {
          const loserPos = positionOffset + 1;
          const loserPrize = calcPrize({
            prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
            prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
            placeIndex: positionOffset, coWinners: losers.length,
          });
          await db.update(entriesTable)
            .set({ finishPosition: loserPos, prizeAmount: loserPrize, finalWinner: false })
            .where(inArray(entriesTable.id, losers.map((p) => p.entryId)));
          positionOffset += losers.length;
        }
      } else {
        // No resolution — even prize split, all share the same rank.
        const finishPosition = positionOffset + 1;
        const prize = calcPrize({
          prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee,
          prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries,
          placeIndex: positionOffset, coWinners: group.length,
        });
        await db.update(entriesTable)
          .set({ finishPosition, prizeAmount: prize, finalWinner: finishPosition === 1 })
          .where(inArray(entriesTable.id, group.map((p) => p.entryId)));
        positionOffset += group.length;
      }
    }

    i = j;
  }

  const winnerUsername = players[0] ? (usernameMap.get(players[0].userId) ?? null) : null;
  await db
    .update(poolsTable)
    .set({ isActive: false, endedAt: new Date(), closureReason: winnerUsername })
    .where(eq(poolsTable.id, pool.id));

  logger.info(
    { poolId: pool.id, week, totalEntries, winnerUsername },
    "NFL Confidence Weekly: pool settled and closed",
  );

  return { winnerUsername };
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

  const nflReplayPools = await db
    .select()
    .from(poolsTable)
    .where(and(
      inArray(poolsTable.poolType, ["nfl_confidence", "nfl_confidence_weekly", "pickem_season"]),
      eq(poolsTable.isActive, true),
      eq(poolsTable.sandboxMode, true),
    ));

  const nflConfidenceLivePools = await db
    .select()
    .from(poolsTable)
    .where(and(
      inArray(poolsTable.poolType, ["nfl_confidence", "nfl_confidence_weekly"]),
      eq(poolsTable.isActive, true),
      eq(poolsTable.sandboxMode, false),
    ));

  if (pickemPools.length === 0 && nflReplayPools.length === 0 && nflConfidenceLivePools.length === 0) return { picksGraded };

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const todayEspn = formatDateEt(now);
  const todayEt = getTodayEtDate();
  const yesterdayEspn = formatDateEt(yesterday);
  const yesterdayEt = formatDateEtDash(yesterday);

  // Both dates checked so West Coast games finishing after midnight ET are graded
  const datesToCheck = [todayEt, yesterdayEt];

  // ── Catch-up grading pass ─────────────────────────────────────────────────
  // Grade any pending picks whose gameDate is older than yesterday (i.e., outside
  // the normal 48-hour rolling window). These are picks that fell through the
  // grading sweep — e.g. the server restarted after games finished, or an
  // exception in an earlier block aborted the run on the day the game completed.
  // We query for all distinct (sport, gameDate) pairs that still have pending
  // picks, fetch ESPN results for those dates, and grade them before the
  // per-sport closure checks run so pendingCount can reach 0.
  // This is a no-op on every normal run (no picks older than yesterday exist).
  if (pickemPools.length > 0) {
    const stuckRows = await db
      .selectDistinct({ sport: poolsTable.sport, gameDate: pickemPicksTable.gameDate })
      .from(pickemPicksTable)
      .innerJoin(poolsTable, eq(pickemPicksTable.poolId, poolsTable.id))
      .where(
        and(
          eq(pickemPicksTable.result, "pending"),
          eq(poolsTable.isActive, true),
          eq(poolsTable.poolType, "pickem"),
          lt(pickemPicksTable.gameDate, yesterdayEt),
        ),
      );

    for (const { sport, gameDate } of stuckRows) {
      try {
        const espnDate = gameDate.replace(/-/g, ""); // YYYYMMDD for most ESPN calls
        // WC uses a separate WcGame type and has its own dedicated grading block
        // with datesToCheck — skip it here to avoid type complexity.
        if (sport === "worldcup") continue;

        let games: EspnGame[];
        if (sport === "intl") {
          games = await fetchIntlGamesForDate(espnDate);
        } else if (sport === "superleague") {
          games = await fetchSuperLeagueGamesForDate(espnDate);
        } else {
          // mlb, mls, nhl, nba — all routed through fetchGamesForDate
          games = await fetchGamesForDate(sport, espnDate);
        }

        // worldcup is skipped above, so only the remaining 3-way sports need this check
        const is3way =
          sport === "mls" ||
          sport === "intl" ||
          sport === "superleague";

        const completedGames = games.filter(
          (g) => g.isCompleted && g.homeScore != null && g.awayScore != null,
        );
        if (completedGames.length === 0) continue;

        // Find every active pickem pool for this sport that has stuck pending picks.
        const affectedPools = await db
          .selectDistinct({ poolId: pickemPicksTable.poolId })
          .from(pickemPicksTable)
          .innerJoin(poolsTable, eq(pickemPicksTable.poolId, poolsTable.id))
          .where(
            and(
              eq(pickemPicksTable.result, "pending"),
              eq(pickemPicksTable.gameDate, gameDate),
              eq(poolsTable.isActive, true),
              eq(poolsTable.poolType, "pickem"),
              eq(poolsTable.sport, sport as "nfl"), // cast to satisfy enum type; runtime value is correct
            ),
          );

        if (is3way) {
          type Outcome3 = "home_win" | "draw" | "away_win";
          const outcomeMap = new Map<string, Outcome3>();
          for (const g of completedGames) {
            const h = g.homeScore!, a = g.awayScore!;
            outcomeMap.set(g.id, h > a ? "home_win" : a > h ? "away_win" : "draw");
          }
          for (const { poolId } of affectedPools) {
            for (const [gameId, outcome] of outcomeMap) {
              const picks = await db
                .select()
                .from(pickemPicksTable)
                .where(
                  and(
                    eq(pickemPicksTable.poolId, poolId),
                    eq(pickemPicksTable.gameId, gameId),
                    eq(pickemPicksTable.gameDate, gameDate),
                    eq(pickemPicksTable.result, "pending"),
                  ),
                );
              for (const pick of picks) {
                const result: "correct" | "incorrect" =
                  pick.pickedTeamId === outcome ? "correct" : "incorrect";
                await db
                  .update(pickemPicksTable)
                  .set({ result, updatedAt: new Date() })
                  .where(eq(pickemPicksTable.id, pick.id));
                picksGraded++;
                logger.info(
                  { poolId, gameId, gameDate, sport, result },
                  "Pick-Em catch-up: graded stuck pending pick",
                );
              }
            }
          }
        } else {
          // 2-way: mlb, nhl, nba
          const winnerMap = new Map<string, string>();
          for (const g of completedGames) {
            // Ties in NHL (shouldn't happen after OT) and NBA are skipped —
            // they're handled by the sport's own grading logic or postponed.
            if (g.homeScore === g.awayScore) continue;
            winnerMap.set(
              g.id,
              g.homeScore! > g.awayScore! ? g.homeTeam.id : g.awayTeam.id,
            );
          }
          if (winnerMap.size === 0) continue;
          for (const { poolId } of affectedPools) {
            for (const [gameId, winnerTeamId] of winnerMap) {
              const picks = await db
                .select()
                .from(pickemPicksTable)
                .where(
                  and(
                    eq(pickemPicksTable.poolId, poolId),
                    eq(pickemPicksTable.gameId, gameId),
                    eq(pickemPicksTable.gameDate, gameDate),
                    eq(pickemPicksTable.result, "pending"),
                  ),
                );
              for (const pick of picks) {
                const result: "correct" | "incorrect" =
                  pick.pickedTeamId === winnerTeamId ? "correct" : "incorrect";
                await db
                  .update(pickemPicksTable)
                  .set({ result, updatedAt: new Date() })
                  .where(eq(pickemPicksTable.id, pick.id));
                picksGraded++;
                logger.info(
                  { poolId, gameId, gameDate, sport, result },
                  "Pick-Em catch-up: graded stuck pending pick",
                );
              }
            }
          }
        }
      } catch (err) {
        logger.error({ sport, gameDate, err }, "Pick-Em catch-up grading error");
      }
    }
  }

  // Separate pools by sport
  const mlbPools = pickemPools.filter((p) => p.sport === "mlb");
  const wcPools = pickemPools.filter((p) => p.sport === "worldcup");
  const intlPools = pickemPools.filter((p) => p.sport === "intl");
  const mlsPools = pickemPools.filter((p) => p.sport === "mls");
  const superleaguePools = pickemPools.filter((p) => p.sport === "superleague");

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

  // ── MLS grading (3-way: home_win / draw / away_win) ──────────────────────

  if (mlsPools.length > 0) {
    const [todayMlsGames, yesterdayMlsGames] = await Promise.all([
      fetchGamesForDate("mls", todayEspn),
      fetchGamesForDate("mls", yesterdayEspn),
    ]);
    const allMlsGames = [...todayMlsGames, ...yesterdayMlsGames];
    const completedMlsGames = allMlsGames.filter((g) => g.isCompleted && g.homeScore != null && g.awayScore != null);

    const outcomeByMlsGameId = new Map<string, "home_win" | "draw" | "away_win">();
    for (const game of completedMlsGames) {
      const h = game.homeScore!, a = game.awayScore!;
      const outcome: "home_win" | "draw" | "away_win" = h > a ? "home_win" : a > h ? "away_win" : "draw";
      outcomeByMlsGameId.set(game.id, outcome);
      logger.info(
        {
          gameId: game.id,
          outcome,
          score: `${game.awayTeam.abbreviation} ${game.awayScore} - ${game.homeScore} ${game.homeTeam.abbreviation}`,
        },
        "Pick-Em mls: completed game found",
      );
    }

    const mlsPostponedIds = allMlsGames.filter((g) => g.isPostponed).map((g) => g.id);

    for (const pool of mlsPools) {
      for (const [gameId, outcome] of outcomeByMlsGameId) {
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
            "Auto-graded mls pickem pick",
          );
        }
      }

      for (const gameId of mlsPostponedIds) {
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
          logger.info({ poolId: pool.id, gameId, count: updated.length }, "Pick-Em mls: marked picks as postponed");
        }
      }
    }
  }

  // ── Super League grading (3-way: home_win / draw / away_win) ────────────────

  if (superleaguePools.length > 0) {
    const [todaySlGames, yesterdaySlGames] = await Promise.all([
      fetchSuperLeagueGamesForDate(todayEspn),
      fetchSuperLeagueGamesForDate(yesterdayEspn),
    ]);
    const allSlGames = [...todaySlGames, ...yesterdaySlGames];
    const completedSlGames = allSlGames.filter((g) => g.isCompleted && g.homeScore != null && g.awayScore != null);

    const outcomeBySlGameId = new Map<string, "home_win" | "draw" | "away_win">();
    for (const game of completedSlGames) {
      const h = game.homeScore!, a = game.awayScore!;
      const outcome: "home_win" | "draw" | "away_win" = h > a ? "home_win" : a > h ? "away_win" : "draw";
      outcomeBySlGameId.set(game.id, outcome);
      logger.info(
        {
          gameId: game.id,
          outcome,
          score: `${game.awayTeam.abbreviation} ${game.awayScore} - ${game.homeScore} ${game.homeTeam.abbreviation}`,
        },
        "Pick-Em superleague: completed game found",
      );
    }

    const slPostponedIds = allSlGames.filter((g) => g.isPostponed).map((g) => g.id);

    for (const pool of superleaguePools) {
      for (const [gameId, outcome] of outcomeBySlGameId) {
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
            "Auto-graded superleague pickem pick",
          );
        }
      }

      for (const gameId of slPostponedIds) {
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
          logger.info({ poolId: pool.id, gameId, count: updated.length }, "Pick-Em superleague: marked picks as postponed");
        }
      }
    }
  }

  // ── World Cup grading (3-way: home_win / draw / away_win) ─────────────────

  if (wcPools.length > 0) {
    // Fetch today + yesterday regardless of phase — the gap between group stage
    // (ends Jun 27) and knockout stage (starts Jul 3) is 6 days where the phase
    // is null but picks from the last group-stage day still need grading.
    // Downstream code handles "no games found" gracefully.
    {
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

        // ── WC group stage auto-closure ────────────────────────────────────
        // After grading, if the group stage has ended and no pending picks
        // remain in the group stage range, declare winner(s) and close pool.
        if (pool.isActive && todayEt > WC_PHASES.group_stage.end) {
          const [{ pendingCount }] = await db
            .select({ pendingCount: count() })
            .from(pickemPicksTable)
            .where(and(
              eq(pickemPicksTable.poolId, pool.id),
              gte(pickemPicksTable.gameDate, WC_PHASES.group_stage.start),
              lte(pickemPicksTable.gameDate, WC_PHASES.group_stage.end),
              eq(pickemPicksTable.result, "pending"),
            ));

          if (Number(pendingCount) === 0) {
            const totals = await db
              .select({
                userId: pickemPicksTable.userId,
                correct: count(),
              })
              .from(pickemPicksTable)
              .where(and(
                eq(pickemPicksTable.poolId, pool.id),
                gte(pickemPicksTable.gameDate, WC_PHASES.group_stage.start),
                lte(pickemPicksTable.gameDate, WC_PHASES.group_stage.end),
                eq(pickemPicksTable.result, "correct"),
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
                  .where(and(
                    eq(entriesTable.poolId, pool.id),
                    inArray(entriesTable.userId, winnerIds),
                  ));

                const winnerSet = new Set(winnerIds);
                const nonWinners = totals.filter((r) => !winnerSet.has(r.userId)).sort((a, b) => Number(b.correct) - Number(a.correct));
                if (nonWinners.length > 0) {
                  const p2Score = Number(nonWinners[0].correct);
                  const secondGroup = nonWinners.filter((r) => Number(r.correct) === p2Score);
                  const secondPrize = calcPrize({ placeIndex: winnerIds.length, coWinners: secondGroup.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
                  await db.update(entriesTable).set({ finishPosition: 2, prizeAmount: secondPrize }).where(and(eq(entriesTable.poolId, pool.id), inArray(entriesTable.userId, secondGroup.map((r) => r.userId))));
                  const rest2 = nonWinners.filter((r) => Number(r.correct) !== p2Score);
                  if (rest2.length > 0) {
                    const p3Score = Number(rest2[0].correct);
                    const thirdGroup = rest2.filter((r) => Number(r.correct) === p3Score);
                    const thirdPrize = calcPrize({ placeIndex: winnerIds.length + secondGroup.length, coWinners: thirdGroup.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
                    await db.update(entriesTable).set({ finishPosition: 3, prizeAmount: thirdPrize }).where(and(eq(entriesTable.poolId, pool.id), inArray(entriesTable.userId, thirdGroup.map((r) => r.userId))));
                  }
                }

                await db
                  .update(poolsTable)
                  .set({ isActive: false, endedAt: new Date() })
                  .where(eq(poolsTable.id, pool.id));

                logger.info(
                  { poolId: pool.id, maxCorrect, winnerCount: winnerIds.length, winnerIds },
                  "WC Pick-Ems auto-closure: group stage ended — pool closed and winner(s) declared",
                );
              }
            }
          }
        }
      }
    }
  }

  // ── NFL Confidence live grading ────────────────────────────────────────────
  // Grades picks for active non-sandbox nfl_confidence / nfl_confidence_weekly
  // pools from live ESPN scores.  Follows the MLB pick-em pattern (today +
  // yesterday) so late-finishing games are picked up on the next cycle.

  if (nflConfidenceLivePools.length > 0) {
    const [todayNflGames, yesterdayNflGames] = await Promise.all([
      fetchGamesForDate("nfl", todayEspn),
      fetchGamesForDate("nfl", yesterdayEspn),
    ]);
    const allNflGames = [...todayNflGames, ...yesterdayNflGames];

    const finalNflGames = allNflGames.filter(
      (g) => g.isCompleted && g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore,
    );

    const winnerByNflGameId = new Map<string, string>();
    for (const game of finalNflGames) {
      const winningTeamId = game.homeScore! > game.awayScore! ? game.homeTeam.id : game.awayTeam.id;
      winnerByNflGameId.set(game.id, winningTeamId);
      logger.info(
        {
          gameId: game.id,
          winner: winningTeamId,
          score: `${game.awayTeam.abbreviation} ${game.awayScore} - ${game.homeScore} ${game.homeTeam.abbreviation}`,
        },
        "NFL Confidence live: completed game found",
      );
    }

    const nflPostponedIds = allNflGames.filter((g) => g.isPostponed).map((g) => g.id);

    for (const pool of nflConfidenceLivePools) {
      try {
        for (const [gameId, winningTeamId] of winnerByNflGameId) {
          const gamePicks = await db
            .select()
            .from(pickemPicksTable)
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameId, gameId),
                eq(pickemPicksTable.week, pool.currentWeek),
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
              "Auto-graded NFL confidence pick",
            );
          }
        }

        for (const gameId of nflPostponedIds) {
          const updated = await db
            .update(pickemPicksTable)
            .set({ result: "postponed", updatedAt: new Date() })
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameId, gameId),
                eq(pickemPicksTable.week, pool.currentWeek),
                eq(pickemPicksTable.result, "pending"),
              ),
            )
            .returning({ id: pickemPicksTable.id });
          if (updated.length > 0) {
            logger.info(
              { poolId: pool.id, gameId, count: updated.length },
              "NFL Confidence live: marked picks as postponed",
            );
          }
        }

        // Week closure applies only to nfl_confidence_weekly pools.
        // nfl_confidence (season) pools stay open — picks for the next week
        // come in naturally and no week advancement is needed.
        if (pool.poolType === "nfl_confidence_weekly") {
          const [stillPending] = await db
            .select({ id: pickemPicksTable.id })
            .from(pickemPicksTable)
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.week, pool.currentWeek),
                eq(pickemPicksTable.result, "pending"),
              ),
            )
            .limit(1);

          if (!stillPending) {
            // Guard: must have at least one pick this week before closing.
            const [{ totalPicks }] = await db
              .select({ totalPicks: count() })
              .from(pickemPicksTable)
              .where(
                and(
                  eq(pickemPicksTable.poolId, pool.id),
                  eq(pickemPicksTable.week, pool.currentWeek),
                ),
              );

            if (Number(totalPicks) > 0) {
              if (!pool.isRecurring) {
                await settleNflConfidenceWeeklyPool(pool, pool.currentWeek);
                logger.info(
                  { poolId: pool.id, week: pool.currentWeek },
                  "NFL Confidence Weekly live: week fully graded — pool settled and closed",
                );
              } else {
                await db
                  .update(poolsTable)
                  .set({ currentWeek: pool.currentWeek + 1 })
                  .where(eq(poolsTable.id, pool.id));
                logger.info(
                  { poolId: pool.id, nextWeek: pool.currentWeek + 1 },
                  "NFL Confidence Weekly live: week fully graded — advanced to next week",
                );
              }
            }
          }
        }

        // ── nfl_confidence season auto-closure (live) ────────────────────────
        // Season-long confidence pools close once all Week 18 picks are
        // resolved, ranked by total confidence points on correct picks.
        // Mirrors the live pickem_season closure block below.
        if (pool.poolType === "nfl_confidence" && pool.currentWeek === NFL_TOTAL_WEEKS && pool.isActive) {
          try {
            const [{ pendingCount }] = await db
              .select({ pendingCount: count() })
              .from(pickemPicksTable)
              .where(and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.week, NFL_TOTAL_WEEKS),
                eq(pickemPicksTable.result, "pending"),
              ));
            if (Number(pendingCount) === 0) {
              logger.info({ poolId: pool.id }, "nfl_confidence auto-closure: live Week 18 fully graded — applying season closure");
              await applyNflConfidenceSeasonClosure({
                poolId: pool.id,
                week: NFL_TOTAL_WEEKS,
                pool: { isActive: pool.isActive },
                actualPassingYards: null,
                actualRushingYards: null,
                log: logger,
              });
            } else {
              logger.info({ poolId: pool.id, pendingCount: Number(pendingCount) }, "nfl_confidence auto-closure: live Week 18 still has pending picks — deferring");
            }
          } catch (err) {
            logger.error({ poolId: pool.id, err }, "nfl_confidence auto-closure: live closure check error");
          }
        }
      } catch (err) {
        logger.error({ poolId: pool.id, err }, "NFL Confidence live grading error");
      }
    }
  }

  logger.info({ nflReplayPoolCount: nflReplayPools.length }, "NFL replay grading loop starting");
  for (const pool of nflReplayPools) {
    logger.info({ poolId: pool.id, poolType: pool.poolType }, "Processing NFL replay pool for grading");
    try {
      const finalGames = await db
        .select()
        .from(sandboxGameScoresTable)
        .where(and(
          eq(sandboxGameScoresTable.poolId, pool.id),
          eq(sandboxGameScoresTable.gameStatus, "final"),
        ));

      for (const game of finalGames) {
        if (game.homeScore == null || game.awayScore == null || !game.homeTeam || !game.awayTeam) continue;
        const winnerAbbr = game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam;
        const winnerTeamId = NFL_TEAM_INFO[winnerAbbr]?.id ?? winnerAbbr;

        if (pool.poolType === "pickem_season") {
          // pickem_season replay picks are stored with ESPN game IDs directly
          await db
            .update(pickemPicksTable)
            .set({ result: sql`CASE WHEN picked_team_id = ${winnerTeamId} THEN 'correct'::pickem_result ELSE 'incorrect'::pickem_result END` })
            .where(and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.gameId, game.gameId),
              eq(pickemPicksTable.result, "pending"),
            ));
        } else {
          // nfl_confidence / nfl_confidence_weekly — match by ESPN game ID directly
          await db
            .update(pickemPicksTable)
            .set({ result: sql`CASE WHEN picked_team_id = ${winnerTeamId} THEN 'correct'::pickem_result ELSE 'incorrect'::pickem_result END` })
            .where(and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.gameId, game.gameId),
              eq(pickemPicksTable.result, "pending"),
            ));
        }
      }
    } catch (err) {
      logger.error({ poolId: pool.id, err }, "NFL replay grading loop error");
    }

    // ── pickem_season auto-closure (sandbox) ─────────────────────────────────
    // After grading, check whether this sandbox pool has reached the final week
    // with all picks resolved. applyPickEmSeasonClosure is idempotent: it
    // no-ops when pool.isActive is already false.
    if (pool.poolType === "pickem_season" && pool.currentWeek === NFL_TOTAL_WEEKS && pool.isActive) {
      try {
        const [{ pendingCount }] = await db
          .select({ pendingCount: count() })
          .from(pickemPicksTable)
          .where(and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, NFL_TOTAL_WEEKS),
            eq(pickemPicksTable.result, "pending"),
          ));
        if (Number(pendingCount) === 0) {
          logger.info({ poolId: pool.id }, "pickem_season auto-closure: sandbox Week 18 fully graded — applying season closure");
          await applyPickEmSeasonClosure({
            poolId: pool.id,
            week: NFL_TOTAL_WEEKS,
            pool: { isActive: pool.isActive },
            actualPassingYards: null,
            actualRushingYards: null,
            log: logger,
          });
        } else {
          logger.info({ poolId: pool.id, pendingCount: Number(pendingCount) }, "pickem_season auto-closure: sandbox Week 18 still has pending picks — deferring");
        }
      } catch (err) {
        logger.error({ poolId: pool.id, err }, "pickem_season auto-closure: sandbox closure check error");
      }
    }

    // ── nfl_confidence season auto-closure (sandbox) ─────────────────────────
    // Same pattern as pickem_season above, but ranked by total confidence
    // points on correct picks. applyNflConfidenceSeasonClosure is idempotent.
    if (pool.poolType === "nfl_confidence" && pool.currentWeek === NFL_TOTAL_WEEKS && pool.isActive) {
      try {
        const [{ pendingCount }] = await db
          .select({ pendingCount: count() })
          .from(pickemPicksTable)
          .where(and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, NFL_TOTAL_WEEKS),
            eq(pickemPicksTable.result, "pending"),
          ));
        if (Number(pendingCount) === 0) {
          logger.info({ poolId: pool.id }, "nfl_confidence auto-closure: sandbox Week 18 fully graded — applying season closure");
          await applyNflConfidenceSeasonClosure({
            poolId: pool.id,
            week: NFL_TOTAL_WEEKS,
            pool: { isActive: pool.isActive },
            actualPassingYards: null,
            actualRushingYards: null,
            log: logger,
          });
        } else {
          logger.info({ poolId: pool.id, pendingCount: Number(pendingCount) }, "nfl_confidence auto-closure: sandbox Week 18 still has pending picks — deferring");
        }
      } catch (err) {
        logger.error({ poolId: pool.id, err }, "nfl_confidence auto-closure: sandbox closure check error");
      }
    }

    // ── nfl_confidence_weekly auto-closure (sandbox/replay) ──────────────────
    // Mirrors the live closure block. Picks are graded from sandboxGameScoresTable
    // above; the pending check queries the same pickemPicksTable used by the live
    // path — no adaptation needed for sandbox data sources.
    if (pool.poolType === "nfl_confidence_weekly" && pool.isActive) {
      try {
        const [stillPending] = await db
          .select({ id: pickemPicksTable.id })
          .from(pickemPicksTable)
          .where(and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "pending"),
          ))
          .limit(1);

        if (!stillPending) {
          const [{ totalPicks }] = await db
            .select({ totalPicks: count() })
            .from(pickemPicksTable)
            .where(and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.week, pool.currentWeek),
            ));

          if (Number(totalPicks) > 0) {
            if (!pool.isRecurring) {
              await settleNflConfidenceWeeklyPool(pool, pool.currentWeek);
              logger.info(
                { poolId: pool.id, week: pool.currentWeek },
                "NFL Confidence Weekly sandbox: week fully graded — pool settled and closed",
              );
            } else {
              await db
                .update(poolsTable)
                .set({ currentWeek: pool.currentWeek + 1 })
                .where(eq(poolsTable.id, pool.id));
              logger.info(
                { poolId: pool.id, nextWeek: pool.currentWeek + 1 },
                "NFL Confidence Weekly sandbox: week fully graded — advanced to next week",
              );
            }
          }
        }
      } catch (err) {
        logger.error({ poolId: pool.id, err }, "nfl_confidence_weekly sandbox auto-closure: error");
      }
    }
  }

  // ── pickem_season live pool auto-grading and closure ─────────────────────
  // Grade picks for live (non-sandbox) pickem_season pools against real ESPN
  // data, then apply season closure once all Week 18 picks are resolved.
  // The manual POST /process-results endpoint is not modified and continues
  // to work as the commissioner's override/fallback path.

  const livePickemSeasonPools = await db
    .select()
    .from(poolsTable)
    .where(and(
      eq(poolsTable.poolType, "pickem_season"),
      eq(poolsTable.isActive, true),
      eq(poolsTable.sandboxMode, false),
    ));

  for (const pool of livePickemSeasonPools) {
    try {
      const games = await fetchNflGamesByWeek(pool.currentWeek, pool.season ?? undefined);
      const completedGames = games.filter(
        (g) => g.status === "final" && g.homeScore != null && g.awayScore != null,
      );
      if (completedGames.length > 0) {
        for (const game of completedGames) {
          const home = game.homeScore!;
          const away = game.awayScore!;
          if (home === away) {
            // Tied game: all picks are incorrect (matches process-results behaviour)
            await db
              .update(pickemPicksTable)
              .set({ result: "incorrect" })
              .where(and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameId, game.id),
                eq(pickemPicksTable.result, "pending"),
              ));
          } else {
            const winnerTeamId = home > away ? game.homeTeam.id : game.awayTeam.id;
            await db
              .update(pickemPicksTable)
              .set({ result: sql`CASE WHEN picked_team_id = ${winnerTeamId} THEN 'correct'::pickem_result ELSE 'incorrect'::pickem_result END` })
              .where(and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameId, game.id),
                eq(pickemPicksTable.result, "pending"),
              ));
          }
        }
      }
    } catch (err) {
      logger.error({ poolId: pool.id, err }, "pickem_season auto-closure: live ESPN fetch/grade error");
    }

    // ── pickem_season auto-closure (live) ──────────────────────────────────
    if (pool.currentWeek === NFL_TOTAL_WEEKS && pool.isActive) {
      try {
        const [{ pendingCount }] = await db
          .select({ pendingCount: count() })
          .from(pickemPicksTable)
          .where(and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, NFL_TOTAL_WEEKS),
            eq(pickemPicksTable.result, "pending"),
          ));
        if (Number(pendingCount) === 0) {
          logger.info({ poolId: pool.id }, "pickem_season auto-closure: live Week 18 fully graded — applying season closure");
          await applyPickEmSeasonClosure({
            poolId: pool.id,
            week: NFL_TOTAL_WEEKS,
            pool: { isActive: pool.isActive },
            actualPassingYards: null,
            actualRushingYards: null,
            log: logger,
          });
        } else {
          logger.info({ poolId: pool.id, pendingCount: Number(pendingCount) }, "pickem_season auto-closure: live Week 18 still has pending picks — deferring");
        }
      } catch (err) {
        logger.error({ poolId: pool.id, err }, "pickem_season auto-closure: live closure check error");
      }
    }
  }

  // ── NFL Pick-Ems Weekly: auto-closure for non-recurring pools ──────────────
  // Once every pick for the current week is graded, rank players by correct
  // picks, apply the passing+rushing yards tiebreaker (from entries +
  // nfl_confidence_results), assign finishPosition / prizeAmount, and close.
  // Recurring pools are intentionally left open — they advance week-by-week.

  const nflPickemWeeklyPools = pickemPools.filter(
    (p) => p.sport === "nfl" && p.pickFrequency === "weekly" && !p.isRecurring,
  );

  for (const pool of nflPickemWeeklyPools) {
    try {
      // 1. Skip if any picks for this week are still pending.
      const [{ pendingCount }] = await db
        .select({ pendingCount: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "pending"),
          ),
        );
      if (Number(pendingCount) > 0) continue;

      // Guard: must have at least one pick this week (pool may not yet be live).
      const [{ totalPicks }] = await db
        .select({ totalPicks: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );
      if (Number(totalPicks) === 0) continue;

      // 2. Sum correct picks per user for this week.
      const scoreRows = await db
        .select({ userId: pickemPicksTable.userId, correct: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "correct"),
          ),
        )
        .groupBy(pickemPicksTable.userId);

      // All participating user IDs (include players with 0 correct).
      const allPickUsers = await db
        .selectDistinct({ userId: pickemPicksTable.userId })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );

      const scoreByUser = new Map<number, number>();
      for (const row of scoreRows) {
        scoreByUser.set(row.userId, Number(row.correct));
      }
      for (const { userId } of allPickUsers) {
        if (!scoreByUser.has(userId)) scoreByUser.set(userId, 0);
      }

      // 3. Fetch tiebreaker actuals (actualPassingYards + actualRushingYards).
      const actualsRow = await db
        .select({
          actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
          actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
        })
        .from(nflConfidenceResultsTable)
        .where(
          and(
            eq(nflConfidenceResultsTable.poolId, pool.id),
            eq(nflConfidenceResultsTable.week, pool.currentWeek),
          ),
        )
        .limit(1);

      const actualPrimary =
        actualsRow.length > 0 ? actualsRow[0].actualPassingYards : null;
      const actualSecondary =
        actualsRow.length > 0 ? actualsRow[0].actualRushingYards : null;

      // Fetch each user's tiebreaker guess from their entry row.
      const entryTbRows = await db
        .select({
          userId: entriesTable.userId,
          tbPassing: entriesTable.tiebreakerPassingYards,
          tbRushing: entriesTable.tiebreakerRushingYards,
        })
        .from(entriesTable)
        .where(eq(entriesTable.poolId, pool.id));

      const primaryGuessByUser = new Map<number, number | null>();
      const secondaryGuessByUser = new Map<number, number | null>();
      for (const e of entryTbRows) {
        primaryGuessByUser.set(e.userId, e.tbPassing ?? null);
        secondaryGuessByUser.set(e.userId, e.tbRushing ?? null);
      }

      // 4. Group players by correct count.
      const byScore = new Map<number, number[]>();
      for (const [userId, correct] of scoreByUser) {
        if (!byScore.has(correct)) byScore.set(correct, []);
        byScore.get(correct)!.push(userId);
      }
      const sortedScores = [...byScore.keys()].sort((a, b) => b - a);

      // 5. Build finish-position groups using sequential tiebreaker resolution.
      //    Primary stat (passing yards) decides alone; secondary (rushing yards)
      //    breaks a primary-stat tie. Tied on both → co-winner even split.
      const groups: number[][] = [];
      for (const score of sortedScores) {
        const tiedIds = byScore.get(score)!;
        if (tiedIds.length <= 1) {
          groups.push(tiedIds);
        } else {
          const resolved = resolveSequentialTiebreaker(
            tiedIds, primaryGuessByUser, secondaryGuessByUser, actualPrimary, actualSecondary,
          );
          if (resolved) {
            groups.push([...resolved]);
            const losers = tiedIds.filter((uid) => !resolved.has(uid));
            if (losers.length > 0) groups.push(losers);
          } else {
            groups.push(tiedIds);
          }
        }
      }

      // 6. Write finishPosition and prizeAmount to entries.
      const totalEntries = scoreByUser.size;
      const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
      let placeIndex = 0;

      for (const group of groups) {
        const finishPosition = placeIndex + 1;
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

        await db
          .update(entriesTable)
          .set({
            finishPosition,
            prizeAmount: prize,
            ...(finishPosition === 1 ? { finalWinner: true } : {}),
          })
          .where(
            and(
              eq(entriesTable.poolId, pool.id),
              inArray(entriesTable.userId, group),
            ),
          );

        placeIndex += group.length;
      }

      // 7. Determine closureReason: winner's displayName (or username), or
      //    "co_winners" when multiple players share 1st place.
      const firstGroup = groups[0] ?? [];
      let closureReason = "co_winners";
      if (firstGroup.length === 1) {
        const [winnerUser] = await db
          .select({ displayName: usersTable.displayName, username: usersTable.username })
          .from(usersTable)
          .where(eq(usersTable.id, firstGroup[0]))
          .limit(1);
        if (winnerUser) {
          closureReason = winnerUser.displayName ?? winnerUser.username;
        }
      }

      // 8. Close the pool.
      await db
        .update(poolsTable)
        .set({ isActive: false, endedAt: new Date(), closureReason })
        .where(eq(poolsTable.id, pool.id));

      logger.info(
        {
          poolId: pool.id,
          week: pool.currentWeek,
          closureReason,
          winnerCount: firstGroup.length,
          totalEntries,
          actualPrimary,
          actualSecondary,
        },
        "NFL Pick-Ems Weekly auto-closure: all picks graded — pool closed and winner(s) declared",
      );
    } catch (err) {
      logger.error({ poolId: pool.id, err }, "NFL Pick-Ems Weekly auto-closure error");
    }
  }

  // ── MLB Pick-Ems Weekly: auto-closure for non-recurring pools ──────────────
  // Mirrors the NFL weekly close block above. Once every pick for the current
  // week is graded (no result = 'pending'), rank players by correct picks,
  // apply the passing+rushing yards tiebreaker from entries if available,
  // assign finishPosition / prizeAmount, and close the pool.
  // Recurring MLB weekly pools are intentionally left open.

  const mlbPickemWeeklyPools = pickemPools.filter(
    (p) => p.sport === "mlb" && p.pickFrequency === "weekly" && !p.isRecurring,
  );

  for (const pool of mlbPickemWeeklyPools) {
    try {
      logger.info({ poolId: pool.id, week: pool.currentWeek }, "MLB Pick-Ems Weekly auto-closure: checking pool");

      // 1. Skip if any picks for this week are still pending.
      const [{ pendingCount }] = await db
        .select({ pendingCount: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "pending"),
          ),
        );
      if (Number(pendingCount) > 0) continue;

      // Guard: must have at least one pick this week (pool may not yet be live).
      const [{ totalPicks }] = await db
        .select({ totalPicks: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );
      if (Number(totalPicks) === 0) continue;

      // 2. Sum correct picks per user for this week.
      const scoreRows = await db
        .select({ userId: pickemPicksTable.userId, correct: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "correct"),
          ),
        )
        .groupBy(pickemPicksTable.userId);

      // All participating user IDs (include players with 0 correct).
      const allPickUsers = await db
        .selectDistinct({ userId: pickemPicksTable.userId })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );

      const scoreByUser = new Map<number, number>();
      for (const row of scoreRows) {
        scoreByUser.set(row.userId, Number(row.correct));
      }
      for (const { userId } of allPickUsers) {
        if (!scoreByUser.has(userId)) scoreByUser.set(userId, 0);
      }

      // 3. Fetch tiebreaker actuals: runs scored (primary) + strikeouts (secondary)
      //    for the last completed game of the week. Mirrors the prev-week-results
      //    endpoint. Falls back to null (even split) if ESPN / MLB Stats unavailable.
      const mlbPickGameRows = await db
        .selectDistinct({ gameDate: pickemPicksTable.gameDate })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );
      const mlbSundayDate = mlbPickGameRows.map((r) => r.gameDate).sort().pop() ?? null;

      let actualPrimary: number | null = null;
      let actualSecondary: number | null = null;
      if (mlbSundayDate) {
        try {
          const sundayGames = await fetchGamesForDate("mlb", mlbSundayDate.replace(/-/g, ""));
          const completedGames = sundayGames.filter((g) => g.isCompleted);
          const tiebreakerGame = completedGames[completedGames.length - 1] ?? null;
          if (tiebreakerGame) {
            actualPrimary = (tiebreakerGame.homeScore ?? 0) + (tiebreakerGame.awayScore ?? 0);
            actualSecondary = await fetchDailyStrikeouts([tiebreakerGame], mlbSundayDate);
          }
        } catch {
          // ESPN / MLB Stats unavailable — fall back to even split
        }
      }

      // Fetch each user's tiebreaker guess from their entry row.
      const entryTbRows = await db
        .select({
          userId: entriesTable.userId,
          tbRuns: entriesTable.tiebreakerRuns,
          tbSO: entriesTable.tiebreakerStrikeouts,
        })
        .from(entriesTable)
        .where(eq(entriesTable.poolId, pool.id));

      const primaryGuessByUser = new Map<number, number | null>();
      const secondaryGuessByUser = new Map<number, number | null>();
      for (const e of entryTbRows) {
        primaryGuessByUser.set(e.userId, e.tbRuns ?? null);
        secondaryGuessByUser.set(e.userId, e.tbSO ?? null);
      }

      // 4. Group players by correct count.
      const byScore = new Map<number, number[]>();
      for (const [userId, correct] of scoreByUser) {
        if (!byScore.has(correct)) byScore.set(correct, []);
        byScore.get(correct)!.push(userId);
      }
      const sortedScores = [...byScore.keys()].sort((a, b) => b - a);

      // 5. Build finish-position groups using sequential tiebreaker resolution.
      //    Primary stat (runs) decides alone; secondary (strikeouts) breaks a
      //    primary-stat tie. Tied on both → co-winner even split.
      const groups: number[][] = [];
      for (const score of sortedScores) {
        const tiedIds = byScore.get(score)!;
        if (tiedIds.length <= 1) {
          groups.push(tiedIds);
        } else {
          const resolved = resolveSequentialTiebreaker(
            tiedIds, primaryGuessByUser, secondaryGuessByUser, actualPrimary, actualSecondary,
          );
          if (resolved) {
            groups.push([...resolved]);
            const losers = tiedIds.filter((uid) => !resolved.has(uid));
            if (losers.length > 0) groups.push(losers);
          } else {
            groups.push(tiedIds);
          }
        }
      }

      // 6. Write finishPosition and prizeAmount to entries.
      const totalEntries = scoreByUser.size;
      const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
      let placeIndex = 0;

      for (const group of groups) {
        const finishPosition = placeIndex + 1;
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

        await db
          .update(entriesTable)
          .set({
            finishPosition,
            prizeAmount: prize,
            ...(finishPosition === 1 ? { finalWinner: true } : {}),
          })
          .where(
            and(
              eq(entriesTable.poolId, pool.id),
              inArray(entriesTable.userId, group),
            ),
          );

        placeIndex += group.length;
      }

      // 7. Determine closureReason: winner's displayName (or username), or
      //    "co_winners" when multiple players share 1st place.
      const firstGroup = groups[0] ?? [];
      let closureReason = "co_winners";
      if (firstGroup.length === 1) {
        const [winnerUser] = await db
          .select({ displayName: usersTable.displayName, username: usersTable.username })
          .from(usersTable)
          .where(eq(usersTable.id, firstGroup[0]))
          .limit(1);
        if (winnerUser) {
          closureReason = winnerUser.displayName ?? winnerUser.username;
        }
      }

      // 8. Close the pool.
      await db
        .update(poolsTable)
        .set({ isActive: false, endedAt: new Date(), closureReason })
        .where(eq(poolsTable.id, pool.id));

      logger.info(
        {
          poolId: pool.id,
          week: pool.currentWeek,
          closureReason,
          winnerCount: firstGroup.length,
          totalEntries,
          actualPrimary,
          actualSecondary,
        },
        "MLB Pick-Ems Weekly auto-closure: all picks graded — pool closed and winner(s) declared",
      );
    } catch (err) {
      logger.error({ poolId: pool.id, err }, "MLB Pick-Ems Weekly auto-closure error");
    }
  }

  // ── NHL Pick-Ems Weekly: auto-closure for non-recurring pools ──────────────
  // Mirrors the MLB weekly close block above. Once every pick for the current
  // week is graded (no result = 'pending'), rank players by correct picks,
  // apply the passing+rushing yards tiebreaker from entries if available,
  // assign finishPosition / prizeAmount, and close the pool.
  // Recurring NHL weekly pools are intentionally left open.

  const nhlPickemWeeklyPools = pickemPools.filter(
    (p) => p.sport === "nhl" && p.pickFrequency === "weekly" && !p.isRecurring,
  );

  for (const pool of nhlPickemWeeklyPools) {
    try {
      logger.info({ poolId: pool.id, week: pool.currentWeek }, "NHL Pick-Ems Weekly auto-closure: checking pool");

      // 1. Skip if any picks for this week are still pending.
      const [{ pendingCount }] = await db
        .select({ pendingCount: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "pending"),
          ),
        );
      if (Number(pendingCount) > 0) continue;

      // Guard: must have at least one pick this week (pool may not yet be live).
      const [{ totalPicks }] = await db
        .select({ totalPicks: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );
      if (Number(totalPicks) === 0) continue;

      // Multi-day guard: wait until every game that was part of THIS pool's
      // pick list is final. We query the pool's own pickem_picks records to
      // get the exact game IDs users were offered, then fetch ESPN status for
      // those specific games only. This avoids two failure modes of the old
      // date-range sweep: (a) week-window drift when pool.createdAt is not a
      // Monday, and (b) picking up unrelated league games / exhibitions that
      // share the same calendar week but were never part of this pool.
      const nhlPoolGameRows = await db
        .selectDistinct({ gameId: pickemPicksTable.gameId, gameDate: pickemPicksTable.gameDate })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );

      // Group game IDs by date so we make one ESPN call per unique date.
      const nhlGameIdsByDate = new Map<string, Set<string>>();
      for (const { gameId, gameDate } of nhlPoolGameRows) {
        const espnDate = gameDate.replace(/-/g, "");
        if (!nhlGameIdsByDate.has(espnDate)) nhlGameIdsByDate.set(espnDate, new Set());
        nhlGameIdsByDate.get(espnDate)!.add(gameId);
      }

      // Fetch ESPN results for each date, collect all pool-relevant games.
      const nhlWeekendGames: EspnGame[] = [];
      let nhlHasUnfinished = false;
      for (const [espnDate, gameIds] of nhlGameIdsByDate) {
        const gamesOnDate = await fetchGamesForDate("nhl", espnDate);
        for (const g of gamesOnDate) {
          if (!gameIds.has(g.id)) continue;
          nhlWeekendGames.push(g);
          if (!g.isCompleted && !g.isPostponed) nhlHasUnfinished = true;
        }
      }

      if (nhlHasUnfinished) {
        logger.info(
          { poolId: pool.id, week: pool.currentWeek },
          "NHL Pick-Ems Weekly auto-closure: skipping — unfinished games remain in weekend schedule",
        );
        continue;
      }

      // 2. Sum correct picks per user for this week.
      const scoreRows = await db
        .select({ userId: pickemPicksTable.userId, correct: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "correct"),
          ),
        )
        .groupBy(pickemPicksTable.userId);

      // All participating user IDs (include players with 0 correct).
      const allPickUsers = await db
        .selectDistinct({ userId: pickemPicksTable.userId })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );

      const scoreByUser = new Map<number, number>();
      for (const row of scoreRows) {
        scoreByUser.set(row.userId, Number(row.correct));
      }
      for (const { userId } of allPickUsers) {
        if (!scoreByUser.has(userId)) scoreByUser.set(userId, 0);
      }

      // 3. Fetch tiebreaker actuals: shots on goal (primary) + penalty minutes
      //    (secondary) for the last completed game of the weekend. Sequential
      //    resolution: shots alone decides; PIM breaks a shots-tied tie only.
      //    Falls back to even split if ESPN stats are unavailable.
      const completedWeekendGames = nhlWeekendGames.filter((g) => g.isCompleted);
      const nhlTiebreakerGame = completedWeekendGames[completedWeekendGames.length - 1] ?? null;
      let actualPrimary: number | null = null;
      let actualSecondary: number | null = null;
      if (nhlTiebreakerGame) {
        const tbStats = await fetchNhlTiebreakerStats(nhlTiebreakerGame.id);
        actualPrimary = tbStats.shotsOnGoal ?? null;
        actualSecondary = tbStats.penaltyMinutes ?? null;
      }

      // Fetch each user's tiebreaker guess (shots on goal + penalty minutes)
      // stored on their entry row at pick-submission time.
      const entryTbRows = await db
        .select({
          userId: entriesTable.userId,
          tbShots: entriesTable.tiebreakerShotsOnGoal,
          tbPim: entriesTable.tiebreakerPenaltyMinutes,
        })
        .from(entriesTable)
        .where(eq(entriesTable.poolId, pool.id));

      const primaryGuessByUser = new Map<number, number | null>();
      const secondaryGuessByUser = new Map<number, number | null>();
      for (const e of entryTbRows) {
        primaryGuessByUser.set(e.userId, e.tbShots ?? null);
        secondaryGuessByUser.set(e.userId, e.tbPim ?? null);
      }

      // 4. Group players by correct count.
      const byScore = new Map<number, number[]>();
      for (const [userId, correct] of scoreByUser) {
        if (!byScore.has(correct)) byScore.set(correct, []);
        byScore.get(correct)!.push(userId);
      }
      const sortedScores = [...byScore.keys()].sort((a, b) => b - a);

      // 5. Build finish-position groups using sequential tiebreaker resolution.
      //    Primary stat (shots on goal) decides alone; secondary (penalty minutes)
      //    breaks a primary-stat tie. Tied on both → co-winner even split.
      const groups: number[][] = [];
      for (const score of sortedScores) {
        const tiedIds = byScore.get(score)!;
        if (tiedIds.length <= 1) {
          groups.push(tiedIds);
        } else {
          const resolved = resolveSequentialTiebreaker(
            tiedIds, primaryGuessByUser, secondaryGuessByUser, actualPrimary, actualSecondary,
          );
          if (resolved) {
            groups.push([...resolved]);
            const losers = tiedIds.filter((uid) => !resolved.has(uid));
            if (losers.length > 0) groups.push(losers);
          } else {
            groups.push(tiedIds);
          }
        }
      }

      // 6. Write finishPosition and prizeAmount to entries.
      const totalEntries = scoreByUser.size;
      const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
      let placeIndex = 0;

      for (const group of groups) {
        const finishPosition = placeIndex + 1;
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

        await db
          .update(entriesTable)
          .set({
            finishPosition,
            prizeAmount: prize,
            ...(finishPosition === 1 ? { finalWinner: true } : {}),
          })
          .where(
            and(
              eq(entriesTable.poolId, pool.id),
              inArray(entriesTable.userId, group),
            ),
          );

        placeIndex += group.length;
      }

      // 7. Determine closureReason: winner's displayName (or username), or
      //    "co_winners" when multiple players share 1st place.
      const firstGroup = groups[0] ?? [];
      let closureReason = "co_winners";
      if (firstGroup.length === 1) {
        const [winnerUser] = await db
          .select({ displayName: usersTable.displayName, username: usersTable.username })
          .from(usersTable)
          .where(eq(usersTable.id, firstGroup[0]))
          .limit(1);
        if (winnerUser) {
          closureReason = winnerUser.displayName ?? winnerUser.username;
        }
      }

      // 8. Close the pool.
      await db
        .update(poolsTable)
        .set({ isActive: false, endedAt: new Date(), closureReason })
        .where(eq(poolsTable.id, pool.id));

      logger.info(
        {
          poolId: pool.id,
          week: pool.currentWeek,
          closureReason,
          winnerCount: firstGroup.length,
          totalEntries,
          actualPrimary,
          actualSecondary,
        },
        "NHL Pick-Ems Weekly auto-closure: all picks graded — pool closed and winner(s) declared",
      );
    } catch (err) {
      logger.error({ poolId: pool.id, err }, "NHL Pick-Ems Weekly auto-closure error");
    }
  }

  // Mirrors the NHL weekly close block above. Once every pick for the current
  // week is graded (no result = 'pending'), rank players by correct picks,
  // apply the tiebreaker logic from entries if available, assign
  // finishPosition / prizeAmount, and close the pool.
  // Recurring MLS weekly pools are intentionally left open.

  const mlsPickemWeeklyPools = pickemPools.filter(
    (p) => p.sport === "mls" && p.pickFrequency === "weekly" && !p.isRecurring,
  );

  for (const pool of mlsPickemWeeklyPools) {
    try {
      logger.info({ poolId: pool.id, week: pool.currentWeek }, "MLS Pick-Ems Weekly auto-closure: checking pool");

      // 1. Skip if any picks for this week are still pending.
      const [{ pendingCount }] = await db
        .select({ pendingCount: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "pending"),
          ),
        );
      if (Number(pendingCount) > 0) continue;

      // Guard: must have at least one pick this week (pool may not yet be live).
      const [{ totalPicks }] = await db
        .select({ totalPicks: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );
      if (Number(totalPicks) === 0) continue;

      // Multi-day guard: wait until every game that was part of THIS pool's
      // pick list is final. We query the pool's own pickem_picks records to
      // get the exact game IDs users were offered, then fetch ESPN status for
      // those specific games only. This avoids two failure modes of the old
      // date-range sweep: (a) week-window drift when pool.createdAt is not a
      // Monday, and (b) picking up unrelated league games / exhibitions that
      // share the same calendar week but were never part of this pool.
      const mlsPoolGameRows = await db
        .selectDistinct({ gameId: pickemPicksTable.gameId, gameDate: pickemPicksTable.gameDate })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );

      // Group game IDs by date so we make one ESPN call per unique date.
      const mlsGameIdsByDate = new Map<string, Set<string>>();
      for (const { gameId, gameDate } of mlsPoolGameRows) {
        const espnDate = gameDate.replace(/-/g, "");
        if (!mlsGameIdsByDate.has(espnDate)) mlsGameIdsByDate.set(espnDate, new Set());
        mlsGameIdsByDate.get(espnDate)!.add(gameId);
      }

      let mlsHasUnfinished = false;
      for (const [espnDate, gameIds] of mlsGameIdsByDate) {
        if (mlsHasUnfinished) break;
        const gamesOnDate = await fetchGamesForDate("mls", espnDate);
        for (const g of gamesOnDate) {
          if (gameIds.has(g.id) && !g.isCompleted && !g.isPostponed) {
            mlsHasUnfinished = true;
            break;
          }
        }
      }

      if (mlsHasUnfinished) {
        logger.info(
          { poolId: pool.id, week: pool.currentWeek },
          "MLS Pick-Ems Weekly auto-closure: skipping — unfinished games remain in week schedule",
        );
        continue;
      }

      // 2. Sum correct picks per user for this week.
      const scoreRows = await db
        .select({ userId: pickemPicksTable.userId, correct: count() })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
            eq(pickemPicksTable.result, "correct"),
          ),
        )
        .groupBy(pickemPicksTable.userId);

      // All participating user IDs (include players with 0 correct).
      const allPickUsers = await db
        .selectDistinct({ userId: pickemPicksTable.userId })
        .from(pickemPicksTable)
        .where(
          and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.week, pool.currentWeek),
          ),
        );

      const scoreByUser = new Map<number, number>();
      for (const row of scoreRows) {
        scoreByUser.set(row.userId, Number(row.correct));
      }
      for (const { userId } of allPickUsers) {
        if (!scoreByUser.has(userId)) scoreByUser.set(userId, 0);
      }

      // 3. Fetch tiebreaker actuals (actualPassingYards + actualRushingYards).
      //    MLS pools typically have no nfl_confidence_results row; actualCombined
      //    will be null and tied players become co-winners.
      const actualsRow = await db
        .select({
          actualPassingYards: nflConfidenceResultsTable.actualPassingYards,
          actualRushingYards: nflConfidenceResultsTable.actualRushingYards,
        })
        .from(nflConfidenceResultsTable)
        .where(
          and(
            eq(nflConfidenceResultsTable.poolId, pool.id),
            eq(nflConfidenceResultsTable.week, pool.currentWeek),
          ),
        )
        .limit(1);

      const actualPrimary =
        actualsRow.length > 0 ? actualsRow[0].actualPassingYards : null;
      const actualSecondary =
        actualsRow.length > 0 ? actualsRow[0].actualRushingYards : null;

      // Fetch each user's tiebreaker guess from their entry row.
      const entryTbRows = await db
        .select({
          userId: entriesTable.userId,
          tbPassing: entriesTable.tiebreakerPassingYards,
          tbRushing: entriesTable.tiebreakerRushingYards,
        })
        .from(entriesTable)
        .where(eq(entriesTable.poolId, pool.id));

      const primaryGuessByUser = new Map<number, number | null>();
      const secondaryGuessByUser = new Map<number, number | null>();
      for (const e of entryTbRows) {
        primaryGuessByUser.set(e.userId, e.tbPassing ?? null);
        secondaryGuessByUser.set(e.userId, e.tbRushing ?? null);
      }

      // 4. Group players by correct count.
      const byScore = new Map<number, number[]>();
      for (const [userId, correct] of scoreByUser) {
        if (!byScore.has(correct)) byScore.set(correct, []);
        byScore.get(correct)!.push(userId);
      }
      const sortedScores = [...byScore.keys()].sort((a, b) => b - a);

      // 5. Build finish-position groups using sequential tiebreaker resolution.
      //    MLS pools have no tiebreaker stats; actuals are always null → even split.
      const groups: number[][] = [];
      for (const score of sortedScores) {
        const tiedIds = byScore.get(score)!;
        if (tiedIds.length <= 1) {
          groups.push(tiedIds);
        } else {
          const resolved = resolveSequentialTiebreaker(
            tiedIds, primaryGuessByUser, secondaryGuessByUser, actualPrimary, actualSecondary,
          );
          if (resolved) {
            groups.push([...resolved]);
            const losers = tiedIds.filter((uid) => !resolved.has(uid));
            if (losers.length > 0) groups.push(losers);
          } else {
            groups.push(tiedIds);
          }
        }
      }

      // 6. Write finishPosition and prizeAmount to entries.
      const totalEntries = scoreByUser.size;
      const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
      let placeIndex = 0;

      for (const group of groups) {
        const finishPosition = placeIndex + 1;
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

        await db
          .update(entriesTable)
          .set({
            finishPosition,
            prizeAmount: prize,
            ...(finishPosition === 1 ? { finalWinner: true } : {}),
          })
          .where(
            and(
              eq(entriesTable.poolId, pool.id),
              inArray(entriesTable.userId, group),
            ),
          );

        placeIndex += group.length;
      }

      // 7. Determine closureReason: winner's displayName (or username), or
      //    "co_winners" when multiple players share 1st place.
      const firstGroup = groups[0] ?? [];
      let closureReason = "co_winners";
      if (firstGroup.length === 1) {
        const [winnerUser] = await db
          .select({ displayName: usersTable.displayName, username: usersTable.username })
          .from(usersTable)
          .where(eq(usersTable.id, firstGroup[0]))
          .limit(1);
        if (winnerUser) {
          closureReason = winnerUser.displayName ?? winnerUser.username;
        }
      }

      // 8. Close the pool.
      await db
        .update(poolsTable)
        .set({ isActive: false, endedAt: new Date(), closureReason })
        .where(eq(poolsTable.id, pool.id));

      logger.info(
        {
          poolId: pool.id,
          week: pool.currentWeek,
          closureReason,
          winnerCount: firstGroup.length,
          totalEntries,
          actualPrimary,
          actualSecondary,
        },
        "MLS Pick-Ems Weekly auto-closure: all picks graded — pool closed and winner(s) declared",
      );
    } catch (err) {
      logger.error({ poolId: pool.id, err }, "MLS Pick-Ems Weekly auto-closure error");
    }
  }

  return { picksGraded };
}

// ---------------------------------------------------------------------------
// Crazy 8's — period resolution helpers
// ---------------------------------------------------------------------------
//
// After all picks in a period are graded, resolveCrazyEightsPeriod() declares
// the winner by writing finalWinner = true on the winning entry.
//
// Tie-break order:
//   1. Outright top scorer              → finalWinner = true
//   2. Tie → primary tiebreaker diff    → closest guess wins
//   3. Still tied → secondary diff      → closest guess wins
//   4. All equal / stats unavailable    → split pot (all tied get finalWinner)
// ---------------------------------------------------------------------------

/**
 * Narrows a tied set of players to the winner(s) using closest-guess logic.
 * `primary` is checked first; `secondary` breaks any remaining tie.
 * Returns the full input set (split pot) when both actuals are null.
 */
function resolveTiebreakerByProximity(
  players: Array<{ userId: number; primary: number | null; secondary: number | null }>,
  actual: { primary: number | null; secondary: number | null },
): number[] {
  if (actual.primary !== null) {
    const withPrimary = players.map((p) => ({
      ...p,
      diff: p.primary != null ? Math.abs(p.primary - actual.primary!) : Infinity,
    }));
    const minDiff = Math.min(...withPrimary.map((p) => p.diff));
    const primaryWinners = withPrimary.filter((p) => p.diff === minDiff);
    if (primaryWinners.length === 1) return [primaryWinners[0].userId];

    if (actual.secondary !== null) {
      const withSecondary = primaryWinners.map((p) => ({
        ...p,
        diff2: p.secondary != null ? Math.abs(p.secondary - actual.secondary!) : Infinity,
      }));
      const minDiff2 = Math.min(...withSecondary.map((p) => p.diff2));
      return withSecondary.filter((p) => p.diff2 === minDiff2).map((p) => p.userId);
    }
    return primaryWinners.map((p) => p.userId);
  }

  if (actual.secondary !== null) {
    const withSecondary = players.map((p) => ({
      ...p,
      diff: p.secondary != null ? Math.abs(p.secondary - actual.secondary!) : Infinity,
    }));
    const minDiff = Math.min(...withSecondary.map((p) => p.diff));
    return withSecondary.filter((p) => p.diff === minDiff).map((p) => p.userId);
  }

  return players.map((p) => p.userId); // both null → split pot
}

/**
 * Iteratively applies a tiebreaker resolver to a tied group, splitting it into
 * ordered sub-groups until no further differentiation is possible.
 *
 * Example: [A, B, C] where resolver picks [B] from the full set, then [A] from
 * the remaining [A, C] → returns [[B], [A], [C]].
 *
 * When the resolver cannot distinguish any players in a remaining sub-group it
 * returns all of them (the split-pot fallback), and iteration stops there.
 */
async function resolveGroupIteratively(
  group: number[],
  resolver: (ids: number[]) => Promise<number[]>,
): Promise<number[][]> {
  const result: number[][] = [];
  let remaining = [...group];
  while (remaining.length > 0) {
    if (remaining.length === 1) {
      result.push(remaining);
      break;
    }
    const frontrunners = await resolver(remaining);
    result.push(frontrunners);
    if (frontrunners.length === remaining.length) break; // tiebreaker exhausted → keep as co-group
    const frontSet = new Set(frontrunners);
    remaining = remaining.filter((id) => !frontSet.has(id));
  }
  return result;
}

/**
 * Writes finishPosition / prizeAmount / finalWinner for every player and then
 * closes the pool.
 *
 * @param groups  Pre-resolved ordered groups. groups[0] = 1st-place players
 *                (may be co-winners). Each subsequent group holds players at
 *                the next finishPosition, with coWinners > 1 only when the
 *                tiebreaker could not differentiate them.
 */
async function declareCrazyEightsWinners(
  pool: typeof poolsTable.$inferSelect,
  groups: number[][],
  reason: string,
): Promise<void> {
  // 1. Total entries for calcPrize.
  const allEntries = await db
    .select({ userId: entriesTable.userId })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, pool.id));
  const totalEntries = allEntries.length;

  const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
  let placeIndex = 0;

  for (const group of groups) {
    const finishPosition = placeIndex + 1;
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

    await db
      .update(entriesTable)
      .set({
        finishPosition,
        prizeAmount: prize,
        ...(finishPosition === 1 ? { finalWinner: true } : {}),
      })
      .where(and(eq(entriesTable.poolId, pool.id), inArray(entriesTable.userId, group)));

    placeIndex += group.length;
  }

  // 2. Determine closureReason: winner's displayName/username, or "co_winners".
  const winnerIds = groups[0];
  let closureReason = "co_winners";
  if (winnerIds.length === 1) {
    const [winnerUser] = await db
      .select({ displayName: usersTable.displayName, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, winnerIds[0]))
      .limit(1);
    if (winnerUser) {
      closureReason = winnerUser.displayName ?? winnerUser.username;
    }
  }

  // 3. Close the pool.
  await db
    .update(poolsTable)
    .set({ isActive: false, endedAt: new Date(), closureReason })
    .where(eq(poolsTable.id, pool.id));

  logger.info(
    { poolId: pool.id, winnerIds, isTie: winnerIds.length > 1, reason, totalEntries, groups: groups.length },
    "Crazy 8's: period winner(s) declared and pool closed",
  );
}

/**
 * MLB tiebreaker: total runs (ESPN scores) + total strikeouts (MLB Stats API)
 * for the last completed game of the day.
 */
async function resolveMlbTiebreakerForPeriod(
  poolId: number,
  tiedUserIds: number[],
  lastGame: EspnGame,
  periodDate: string, // YYYY-MM-DD
): Promise<number[]> {
  const actualRuns =
    lastGame.homeScore != null && lastGame.awayScore != null
      ? lastGame.homeScore + lastGame.awayScore
      : null;
  const actualStrikeouts = await fetchSingleGameStrikeouts(lastGame, periodDate);

  if (actualRuns === null && actualStrikeouts === null) {
    logger.warn({ poolId, gameId: lastGame.id }, "Crazy 8's MLB: tiebreaker stats unavailable → split pot");
    return tiedUserIds;
  }

  const entries = await db
    .select({ userId: entriesTable.userId, runs: entriesTable.tiebreakerRuns, so: entriesTable.tiebreakerStrikeouts })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, tiedUserIds)));

  return resolveTiebreakerByProximity(
    entries.map((e) => ({ userId: e.userId, primary: e.runs, secondary: e.so })),
    { primary: actualRuns, secondary: actualStrikeouts },
  );
}

/**
 * NHL tiebreaker: combined shots on goal + combined penalty minutes for the
 * last completed game of the weekend (fetched from ESPN boxscore).
 */
async function resolveNhlTiebreakerForPeriod(
  poolId: number,
  tiedUserIds: number[],
  lastGame: EspnGame,
): Promise<number[]> {
  const stats = await fetchNhlTiebreakerStats(lastGame.id);
  if (stats.shotsOnGoal === null && stats.penaltyMinutes === null) {
    logger.warn({ poolId, gameId: lastGame.id }, "Crazy 8's NHL: tiebreaker stats unavailable → split pot");
    return tiedUserIds;
  }

  const entries = await db
    .select({ userId: entriesTable.userId, sog: entriesTable.tiebreakerShotsOnGoal, pim: entriesTable.tiebreakerPenaltyMinutes })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, tiedUserIds)));

  return resolveTiebreakerByProximity(
    entries.map((e) => ({ userId: e.userId, primary: e.sog, secondary: e.pim })),
    { primary: stats.shotsOnGoal, secondary: stats.penaltyMinutes },
  );
}

/**
 * NBA tiebreaker: combined total points + combined three-pointers made for the
 * last completed game of the weekend (fetched from ESPN boxscore).
 */
async function resolveNbaTiebreakerForPeriod(
  poolId: number,
  tiedUserIds: number[],
  lastGame: EspnGame,
): Promise<number[]> {
  const stats = await fetchNbaTiebreakerStats(lastGame.id);
  // Fall back to the already-fetched scoreboard scores for total points if the
  // summary endpoint didn't return them.
  const actualPoints =
    stats.totalPoints ??
    (lastGame.homeScore != null && lastGame.awayScore != null
      ? lastGame.homeScore + lastGame.awayScore
      : null);

  if (actualPoints === null && stats.threePointersMade === null) {
    logger.warn({ poolId, gameId: lastGame.id }, "Crazy 8's NBA: tiebreaker stats unavailable → split pot");
    return tiedUserIds;
  }

  const entries = await db
    .select({ userId: entriesTable.userId, pts: entriesTable.tiebreakerPoints, threes: entriesTable.tiebreakerThrees })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, tiedUserIds)));

  return resolveTiebreakerByProximity(
    entries.map((e) => ({ userId: e.userId, primary: e.pts, secondary: e.threes })),
    { primary: actualPoints, secondary: stats.threePointersMade },
  );
}

/**
 * After grading completes for a period, declares winner(s) and writes
 * finalWinner = true. Safe to call every poll cycle — idempotent.
 *
 * @param pool         Active crazy_8s pool.
 * @param periodDates  YYYY-MM-DD date(s) for this period.
 *                     MLB: single day [dateEt]
 *                     NHL: weekend pair [satDate, sunDate]
 * @param periodGames  Pre-fetched EspnGames for these dates.
 */
async function resolveCrazyEightsPeriod(
  pool: typeof poolsTable.$inferSelect,
  periodDates: string[],
  periodGames: EspnGame[],
): Promise<void> {
  // 1. Any picks submitted for this period?
  const [{ total }] = await db
    .select({ total: count() })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, pool.id), inArray(pickemPicksTable.gameDate, periodDates)));
  if (total === 0) return;

  // 2. All picks graded? (no pending = grading cycle finished)
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(pickemPicksTable)
    .where(and(
      eq(pickemPicksTable.poolId, pool.id),
      inArray(pickemPicksTable.gameDate, periodDates),
      eq(pickemPicksTable.result, "pending"),
    ));
  if (pending > 0) return;

  // 2a. Full-period guard: all scheduled games for this period must be complete
  //     or postponed before we resolve — even if all submitted picks are already
  //     graded. This prevents premature closure when a live game has no picks yet.
  //     MLB: single-day check. NHL: Sat+Sun weekend check (all games in both days).
  const hasUnfinished = periodGames.some((g) => !g.isCompleted && !g.isPostponed);
  if (hasUnfinished) {
    logger.info(
      { poolId: pool.id, sport: pool.sport, periodDates },
      "Crazy 8's: skipping resolution — unfinished games remain in period schedule",
    );
    return;
  }

  // 3. Idempotency: already resolved for this period?
  const alreadyResolved = await db
    .selectDistinct({ userId: pickemPicksTable.userId })
    .from(pickemPicksTable)
    .innerJoin(
      entriesTable,
      and(
        eq(entriesTable.userId, pickemPicksTable.userId),
        eq(entriesTable.poolId, pool.id),
        eq(entriesTable.finalWinner, true),
      ),
    )
    .where(and(eq(pickemPicksTable.poolId, pool.id), inArray(pickemPicksTable.gameDate, periodDates)))
    .limit(1);
  if (alreadyResolved.length > 0) return;

  // 4. Compute per-user confidence-point totals in JS (avoids sql`` dependency)
  const allPicks = await db
    .select({
      userId: pickemPicksTable.userId,
      cp: (pickemPicksTable as any).confidencePoints,
      result: pickemPicksTable.result,
    })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, pool.id), inArray(pickemPicksTable.gameDate, periodDates)));

  const scoreByUser = new Map<number, number>();
  for (const pick of allPicks) {
    if (!scoreByUser.has(pick.userId)) scoreByUser.set(pick.userId, 0);
    if (pick.result === "correct" && pick.cp != null) {
      scoreByUser.set(pick.userId, scoreByUser.get(pick.userId)! + (pick.cp as number));
    }
  }
  if (scoreByUser.size === 0) return;

  // 5. Build all score groups, sorted desc by score. Each group is players who
  //    share the same raw confidence-point total.
  const uniqueScores = [...new Set(scoreByUser.values())].sort((a, b) => b - a);
  const scoreGroups: number[][] = uniqueScores.map((score) =>
    [...scoreByUser.entries()].filter(([, s]) => s === score).map(([uid]) => uid),
  );

  // 6. If no group has more than one player, no tiebreaking needed at any position.
  const anyTied = scoreGroups.some((g) => g.length > 1);
  if (!anyTied) {
    await declareCrazyEightsWinners(pool, scoreGroups, "outright winner");
    return;
  }

  // 7. At least one tied group exists. We need the reference game for tiebreaking.
  const completedGames = periodGames
    .filter((g) => g.isCompleted && g.homeScore != null && g.awayScore != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const lastGame = completedGames.at(-1);

  if (!lastGame) {
    // No completed game to use as a reference — split all tied groups.
    await declareCrazyEightsWinners(pool, scoreGroups, "split-pot: no completed tiebreaker game");
    return;
  }

  // 8. Build a sport-specific resolver closure used for EVERY tied group.
  const resolver = (ids: number[]): Promise<number[]> => {
    if (pool.sport === "nhl") return resolveNhlTiebreakerForPeriod(pool.id, ids, lastGame);
    if (pool.sport === "nba") return resolveNbaTiebreakerForPeriod(pool.id, ids, lastGame);
    return resolveMlbTiebreakerForPeriod(pool.id, ids, lastGame, periodDates[0]);
  };

  // 9. Apply the tiebreaker to every tied group at every position, not just the
  //    top scorers. resolveGroupIteratively repeatedly calls the resolver on the
  //    remaining players until only solo survivors or an irresolvable co-group
  //    remain — turning one split group into ordered sub-groups where possible.
  const resolvedGroups: number[][] = [];
  for (const group of scoreGroups) {
    if (group.length === 1) {
      resolvedGroups.push(group);
    } else {
      logger.info(
        { poolId: pool.id, tiedUserIds: group, score: scoreByUser.get(group[0]) },
        "Crazy 8's: tied group detected — resolving tiebreaker",
      );
      const subGroups = await resolveGroupIteratively(group, resolver);
      resolvedGroups.push(...subGroups);
    }
  }

  // 10. Determine the overall resolution reason from the top group's outcome.
  const topGroup = resolvedGroups[0];
  const reason = topGroup.length > 1 ? "split-pot: tiebreaker exhausted" : "tiebreaker resolved";

  await declareCrazyEightsWinners(pool, resolvedGroups, reason);
}

// ---------------------------------------------------------------------------
// Crazy 8's auto-grading (MLB daily + NHL weekend confidence-pick pools)
// ---------------------------------------------------------------------------
//
// Grades pickemPicksTable rows for poolType = "crazy_8s":
//  - Compare pickedTeamId against the ESPN winning teamId
//  - Mark "correct" / "incorrect" / "postponed"
//  - After grading, call resolveCrazyEightsPeriod() to auto-declare winner
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

  const mlbPools = crazyPools.filter((p) => p.sport !== "nhl" && p.sport !== "nba");
  const nhlPools = crazyPools.filter((p) => p.sport === "nhl");
  const nbaPools = crazyPools.filter((p) => p.sport === "nba");

  // ── MLB ────────────────────────────────────────────────────────────────────
  if (mlbPools.length > 0) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayEspn = formatDateEt(now);
    const todayEt = getTodayEtDate();
    const yesterdayEspn = formatDateEt(yesterday);
    const yesterdayEt = formatDateEtDash(yesterday);

    const [todayGames, yesterdayGames] = await Promise.all([
      fetchGamesForDate("mlb", todayEspn),
      fetchGamesForDate("mlb", yesterdayEspn),
    ]);

    const winnerByGameId = new Map<string, string>();
    const postponedIds: string[] = [];
    for (const game of [...todayGames, ...yesterdayGames]) {
      if (game.isPostponed) {
        postponedIds.push(game.id);
        continue;
      }
      if (game.isCompleted && game.homeScore != null && game.awayScore != null && game.homeScore !== game.awayScore) {
        const winningTeamId = game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;
        winnerByGameId.set(game.id, winningTeamId);
        logger.info(
          { gameId: game.id, winner: winningTeamId, score: `${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore}` },
          "Crazy 8's: completed game found",
        );
      }
    }

    for (const pool of mlbPools) {
      // Grade correct / incorrect
      for (const [gameId, winningTeamId] of winnerByGameId) {
        const gamePicks = await db
          .select()
          .from(pickemPicksTable)
          .where(and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.gameId, gameId),
            inArray(pickemPicksTable.gameDate, [todayEt, yesterdayEt]),
            eq(pickemPicksTable.result, "pending"),
          ));
        for (const pick of gamePicks) {
          const result: "correct" | "incorrect" = pick.pickedTeamId === winningTeamId ? "correct" : "incorrect";
          await db.update(pickemPicksTable).set({ result, updatedAt: new Date() }).where(eq(pickemPicksTable.id, pick.id));
          picksGraded++;
          logger.info({ poolId: pool.id, userId: pick.userId, gameId, pickedTeamId: pick.pickedTeamId, winningTeamId, result }, "Crazy 8's: auto-graded pick");
        }
      }
      // Mark postponed
      for (const gameId of postponedIds) {
        const updated = await db
          .update(pickemPicksTable)
          .set({ result: "postponed", updatedAt: new Date() })
          .where(and(
            eq(pickemPicksTable.poolId, pool.id),
            eq(pickemPicksTable.gameId, gameId),
            eq(pickemPicksTable.result, "pending"),
          ))
          .returning({ id: pickemPicksTable.id });
        if (updated.length > 0) logger.info({ poolId: pool.id, gameId, count: updated.length }, "Crazy 8's: marked picks as postponed");
      }

      // Resolve each day separately (yesterday first — most likely complete)
      await resolveCrazyEightsPeriod(pool, [yesterdayEt], yesterdayGames);
      await resolveCrazyEightsPeriod(pool, [todayEt], todayGames);
    }
  }

  // ── NHL ────────────────────────────────────────────────────────────────────
  for (const pool of nhlPools) {
    const anchor = pool.sandboxMode ? NHL_SANDBOX_ANCHOR : pool.createdAt;
    const { days, espnDates } = getNhlWeekBounds(anchor, pool.currentWeek);
    const satDate = days[0];
    const sunDate = days[1];
    const satEspn = espnDates[0];
    const sunEspn = espnDates[1];
    const periodDates = [satDate, sunDate];

    const [satGames, sunGames] = await Promise.all([
      fetchGamesForDate("nhl", satEspn),
      fetchGamesForDate("nhl", sunEspn),
    ]);
    const allNhlGames = [...satGames, ...sunGames];

    const winnerByGameId = new Map<string, string>();
    const postponedIds: string[] = [];
    for (const game of allNhlGames) {
      if (game.isPostponed) {
        postponedIds.push(game.id);
        continue;
      }
      if (game.isCompleted && game.homeScore != null && game.awayScore != null && game.homeScore !== game.awayScore) {
        const winningTeamId = game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;
        winnerByGameId.set(game.id, winningTeamId);
        logger.info(
          { gameId: game.id, winner: winningTeamId, score: `${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore}` },
          "Crazy 8's NHL: completed game found",
        );
      }
    }

    // Grade picks
    for (const [gameId, winningTeamId] of winnerByGameId) {
      const gamePicks = await db
        .select()
        .from(pickemPicksTable)
        .where(and(
          eq(pickemPicksTable.poolId, pool.id),
          eq(pickemPicksTable.gameId, gameId),
          inArray(pickemPicksTable.gameDate, periodDates),
          eq(pickemPicksTable.result, "pending"),
        ));
      for (const pick of gamePicks) {
        const result: "correct" | "incorrect" = pick.pickedTeamId === winningTeamId ? "correct" : "incorrect";
        await db.update(pickemPicksTable).set({ result, updatedAt: new Date() }).where(eq(pickemPicksTable.id, pick.id));
        picksGraded++;
        logger.info({ poolId: pool.id, userId: pick.userId, gameId, pickedTeamId: pick.pickedTeamId, winningTeamId, result }, "Crazy 8's NHL: auto-graded pick");
      }
    }
    for (const gameId of postponedIds) {
      const updated = await db
        .update(pickemPicksTable)
        .set({ result: "postponed", updatedAt: new Date() })
        .where(and(
          eq(pickemPicksTable.poolId, pool.id),
          eq(pickemPicksTable.gameId, gameId),
          eq(pickemPicksTable.result, "pending"),
        ))
        .returning({ id: pickemPicksTable.id });
      if (updated.length > 0) logger.info({ poolId: pool.id, gameId, count: updated.length }, "Crazy 8's NHL: marked picks as postponed");
    }

    // Resolve the full Sat+Sun weekend as one period
    await resolveCrazyEightsPeriod(pool, periodDates, allNhlGames);
  }

  // ── NBA ────────────────────────────────────────────────────────────────────
  // Fri+Sat+Sun weekend window (3 days vs NHL's 2). Same grade → postpone →
  // resolve flow; resolveCrazyEightsPeriod's full-period guard ensures all
  // three days' games are complete/postponed before the period resolves.
  for (const pool of nbaPools) {
    const anchor = pool.sandboxMode ? NBA_SANDBOX_ANCHOR : pool.createdAt;
    const { days, espnDates } = getNbaWeekendBounds(anchor, pool.currentWeek);
    const periodDates = days; // [friDate, satDate, sunDate]

    const gameArrays = await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d)));
    const allNbaGames = gameArrays.flat();

    const winnerByGameId = new Map<string, string>();
    const postponedIds: string[] = [];
    for (const game of allNbaGames) {
      if (game.isPostponed) {
        postponedIds.push(game.id);
        continue;
      }
      if (game.isCompleted && game.homeScore != null && game.awayScore != null && game.homeScore !== game.awayScore) {
        const winningTeamId = game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;
        winnerByGameId.set(game.id, winningTeamId);
        logger.info(
          { gameId: game.id, winner: winningTeamId, score: `${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore}` },
          "Crazy 8's NBA: completed game found",
        );
      }
    }

    // Grade picks
    for (const [gameId, winningTeamId] of winnerByGameId) {
      const gamePicks = await db
        .select()
        .from(pickemPicksTable)
        .where(and(
          eq(pickemPicksTable.poolId, pool.id),
          eq(pickemPicksTable.gameId, gameId),
          inArray(pickemPicksTable.gameDate, periodDates),
          eq(pickemPicksTable.result, "pending"),
        ));
      for (const pick of gamePicks) {
        const result: "correct" | "incorrect" = pick.pickedTeamId === winningTeamId ? "correct" : "incorrect";
        await db.update(pickemPicksTable).set({ result, updatedAt: new Date() }).where(eq(pickemPicksTable.id, pick.id));
        picksGraded++;
        logger.info({ poolId: pool.id, userId: pick.userId, gameId, pickedTeamId: pick.pickedTeamId, winningTeamId, result }, "Crazy 8's NBA: auto-graded pick");
      }
    }
    for (const gameId of postponedIds) {
      const updated = await db
        .update(pickemPicksTable)
        .set({ result: "postponed", updatedAt: new Date() })
        .where(and(
          eq(pickemPicksTable.poolId, pool.id),
          eq(pickemPicksTable.gameId, gameId),
          eq(pickemPicksTable.result, "pending"),
        ))
        .returning({ id: pickemPicksTable.id });
      if (updated.length > 0) logger.info({ poolId: pool.id, gameId, count: updated.length }, "Crazy 8's NBA: marked picks as postponed");
    }

    // Resolve the full Fri+Sat+Sun weekend as one period
    await resolveCrazyEightsPeriod(pool, periodDates, allNbaGames);
  }

  return { picksGraded };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WC Bracket grader — handles STATUS_FINAL, STATUS_FINAL_AET, STATUS_FINAL_PEN
// ---------------------------------------------------------------------------

export async function processWcBracketResults(): Promise<{ picksGraded: number }> {
  let picksGraded = 0;

  const wcBracketPools = await db
    .select({
      id: poolsTable.id,
      prizeStructure: poolsTable.prizeStructure,
      prizeMode: poolsTable.prizeMode,
      entryFee: poolsTable.entryFee,
      prizePot: poolsTable.prizePot,
      maxEntries: poolsTable.maxEntries,
    })
    .from(poolsTable)
    .where(and(eq(poolsTable.poolType, "wc_bracket"), eq(poolsTable.isActive, true)));

  if (wcBracketPools.length === 0) return { picksGraded };

  const matches = await fetchWcBracketMatches();
  const completedMatches = matches.filter(
    (m) => m.isCompleted && m.winner !== null && WIN_TYPE_MAP[m.statusName] !== undefined,
  );

  if (completedMatches.length === 0) return { picksGraded };

  for (const pool of wcBracketPools) {
    for (const match of completedMatches) {
      const winner = match.winner!;
      const winType = WIN_TYPE_MAP[match.statusName] ?? "normal";

      // Upsert result row (idempotent)
      await db
        .insert(wcBracketResultsTable)
        .values({
          poolId: pool.id,
          espnEventId: match.espnEventId,
          round: match.round,
          matchSlot: match.matchSlot,
          team1: match.team1,
          team2: match.team2,
          winner,
          winType,
          matchDate: new Date(match.matchDate),
          gradedAt: new Date(),
        })
        .onConflictDoNothing();

      // Grade all pending (is_correct IS NULL) picks for this match
      const pendingPicks = await db
        .select()
        .from(wcBracketPicksTable)
        .where(
          and(
            eq(wcBracketPicksTable.poolId, pool.id),
            eq(wcBracketPicksTable.espnEventId, match.espnEventId),
            isNull(wcBracketPicksTable.isCorrect),
          ),
        );

      for (const pick of pendingPicks) {
        const isCorrect = pick.pickedTeam === winner;
        await db
          .update(wcBracketPicksTable)
          .set({ isCorrect, updatedAt: new Date() })
          .where(eq(wcBracketPicksTable.id, pick.id));

        picksGraded++;
        logger.info(
          {
            poolId: pool.id,
            userId: pick.userId,
            espnEventId: match.espnEventId,
            pickedTeam: pick.pickedTeam,
            winner,
            winType,
            isCorrect,
          },
          "WC bracket: graded pick",
        );
      }
    }
  }

  // ── WC Bracket auto-close: close pool once the Final match is graded ─────
  const finalComplete = completedMatches.some((m) => m.round === "final");
  if (finalComplete) {
    for (const pool of wcBracketPools) {
      // Idempotency: skip if winner already declared for this pool
      const [existing] = await db
        .select({ id: entriesTable.id })
        .from(entriesTable)
        .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true)))
        .limit(1);
      if (existing) continue;

      // Sum correct picks per user across all rounds
      const totals = await db
        .select({
          userId: wcBracketPicksTable.userId,
          correct: sql<string>`count(*) filter (where ${wcBracketPicksTable.isCorrect} = true)`,
        })
        .from(wcBracketPicksTable)
        .where(eq(wcBracketPicksTable.poolId, pool.id))
        .groupBy(wcBracketPicksTable.userId);

      if (totals.length === 0) continue;

      const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
      const totalEntries = totals.length;
      const sorted = [...totals].sort((a, b) => Number(b.correct) - Number(a.correct));
      const maxCorrect = Number(sorted[0].correct);
      const winnerIds = sorted.filter((r) => Number(r.correct) === maxCorrect).map((r) => r.userId);

      const firstPrize = calcPrize({ placeIndex: 0, coWinners: winnerIds.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
      await db
        .update(entriesTable)
        .set({ finalWinner: true, finishPosition: 1, prizeAmount: firstPrize })
        .where(and(eq(entriesTable.poolId, pool.id), inArray(entriesTable.userId, winnerIds)));

      const winnerSet = new Set(winnerIds);
      const nonWinners = sorted.filter((r) => !winnerSet.has(r.userId));
      if (nonWinners.length > 0) {
        const p2Score = Number(nonWinners[0].correct);
        const secondGroup = nonWinners.filter((r) => Number(r.correct) === p2Score);
        const secondPrize = calcPrize({ placeIndex: winnerIds.length, coWinners: secondGroup.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
        await db
          .update(entriesTable)
          .set({ finishPosition: 2, prizeAmount: secondPrize })
          .where(and(eq(entriesTable.poolId, pool.id), inArray(entriesTable.userId, secondGroup.map((r) => r.userId))));
        const rest2 = nonWinners.filter((r) => Number(r.correct) !== p2Score);
        if (rest2.length > 0) {
          const p3Score = Number(rest2[0].correct);
          const thirdGroup = rest2.filter((r) => Number(r.correct) === p3Score);
          const thirdPrize = calcPrize({ placeIndex: winnerIds.length + secondGroup.length, coWinners: thirdGroup.length, prizeStructure: ps, prizeMode: pool.prizeMode, entryFee: pool.entryFee, prizePot: pool.prizePot, totalEntries, maxEntries: pool.maxEntries });
          await db
            .update(entriesTable)
            .set({ finishPosition: 3, prizeAmount: thirdPrize })
            .where(and(eq(entriesTable.poolId, pool.id), inArray(entriesTable.userId, thirdGroup.map((r) => r.userId))));
        }
      }

      await db
        .update(poolsTable)
        .set({ isActive: false, endedAt: new Date() })
        .where(eq(poolsTable.id, pool.id));

      logger.info(
        { poolId: pool.id, maxCorrect, winnerCount: winnerIds.length, winnerIds },
        "WC Bracket auto-closure: final complete — pool closed and winner(s) declared",
      );
    }
  }

  // Invalidate bracket cache so next fetch reflects updated status.
  // Invalidate any time completed matches exist (not just when picks are graded)
  // so R16/QF/SF/Final advancements appear in the bracket tree immediately.
  if (completedMatches.length > 0) invalidateBracketCache();

  return { picksGraded };
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startAutoEliminator(): void {
  if (_timer) return;

  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Auto-eliminator starting");

  async function runAll() {
    const [nonMlb, mlbWeekly, mlbDaily, pickEm, crazyEights, wcBracket] = await Promise.all([
      processCompletedGames(),
      processMlbWeeklyResults(),
      processMlbDailyResults(),
      processPickEmResults(),
      processCrazyEightsResults(),
      processWcBracketResults(),
      processReplayTick(),
    ]);
    return {
      ...nonMlb,
      mlbWeeksProcessed: mlbWeekly.weeksProcessed,
      mlbPlayersEliminated: mlbWeekly.playersEliminated + mlbDaily.playersEliminated,
      mlbPlayersRevived: mlbWeekly.playersRevived + mlbDaily.playersRevived,
      mlbDaysProcessed: mlbDaily.daysProcessed,
      pickEmPicksGraded: pickEm.picksGraded,
      crazyEightsPicksGraded: crazyEights.picksGraded,
      wcBracketPicksGraded: wcBracket.picksGraded,
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
