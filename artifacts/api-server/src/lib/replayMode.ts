import { db, sandboxGameScoresTable, poolsTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { fetchNflGamesByWeek } from "./espn";
import { logger } from "./logger";

/**
 * Fetch the completed 2025 NFL week from ESPN, compress kickoff times
 * by a factor of 4 (real 8-hour window → 2-hour replay window), and
 * store per-game quarter scores + replay timestamps in sandbox_game_scores.
 *
 * Call this once when a commissioner arms Replay Mode for a pool.
 */
export async function fetchAndStoreReplayWeek(
  poolId: number,
  week: number,
  replayStartTime: Date,
): Promise<void> {
  const games = await fetchNflGamesByWeek(week, 2025);

  const validGames = games.filter(g => g.date && !isNaN(new Date(g.date).getTime()));
  if (validGames.length === 0) {
    logger.warn({ poolId, week }, "fetchAndStoreReplayWeek: no valid games found for replay week");
    return;
  }

  const getQ = (scores: { value: number; period: number }[], period: number): number | null =>
    scores.find(s => s.period === period)?.value ?? null;

  const kickoffMs = validGames.map(g => new Date(g.date).getTime());
  const earliestMs = Math.min(...kickoffMs);

  for (const game of validGames) {
    const realOffsetMs = new Date(game.date).getTime() - earliestMs;
    const replayKickoff = new Date(replayStartTime.getTime() + realOffsetMs / 4);

    const q1Home = getQ(game.homeLinescores, 1);
    const q1Away = getQ(game.awayLinescores, 1);
    const q2Home = getQ(game.homeLinescores, 2);
    const q2Away = getQ(game.awayLinescores, 2);
    const q3Home = getQ(game.homeLinescores, 3);
    const q3Away = getQ(game.awayLinescores, 3);
    const q4Home = getQ(game.homeLinescores, 4);
    const q4Away = getQ(game.awayLinescores, 4);

    await db
      .insert(sandboxGameScoresTable)
      .values({
        poolId,
        week,
        gameId: game.id,
        homeScore: null,
        awayScore: null,
        q1Home,
        q1Away,
        q2Home,
        q2Away,
        q3Home,
        q3Away,
        q4Home,
        q4Away,
        gameStatus: "scheduled",
        replayKickoff,
        homeTeam: game.homeTeam.abbreviation,
        awayTeam: game.awayTeam.abbreviation,
      })
      .onConflictDoUpdate({
        target: [
          sandboxGameScoresTable.poolId,
          sandboxGameScoresTable.week,
          sandboxGameScoresTable.gameId,
        ],
        set: {
          homeScore: null,
          awayScore: null,
          q1Home,
          q1Away,
          q2Home,
          q2Away,
          q3Home,
          q3Away,
          q4Home,
          q4Away,
          gameStatus: "scheduled",
          replayKickoff,
          homeTeam: game.homeTeam.abbreviation,
          awayTeam: game.awayTeam.abbreviation,
        },
      });
  }

  logger.info({ poolId, week, gameCount: games.length }, "Replay week loaded into sandbox_game_scores");
}

/**
 * Called every auto-eliminator poll cycle.
 *
 * For every active sandbox pool that has replay rows with a replay_kickoff
 * timestamp set, compares the current wall-clock time to each game's replay
 * kickoff and advances game_status + revealed cumulative scores accordingly.
 *
 * Quarter reveal schedule (minutes after replay_kickoff):
 *   ≥  0 min → q1     (q1 scores only)
 *   ≥ 30 min → q2     (q1+q2 cumulative)
 *   ≥ 60 min → halftime (same cumulative, status change)
 *   ≥ 75 min → q3     (q1+q2+q3 cumulative)
 *   ≥105 min → q4     (q1+q2+q3+q4 cumulative)
 *   ≥120 min → final  (full final score — triggers auto-grading next cycle)
 */
export async function processReplayTick(): Promise<void> {
  const now = new Date();

  const rows = await db
    .select({
      id: sandboxGameScoresTable.id,
      gameStatus: sandboxGameScoresTable.gameStatus,
      replayKickoff: sandboxGameScoresTable.replayKickoff,
      q1Home: sandboxGameScoresTable.q1Home,
      q1Away: sandboxGameScoresTable.q1Away,
      q2Home: sandboxGameScoresTable.q2Home,
      q2Away: sandboxGameScoresTable.q2Away,
      q3Home: sandboxGameScoresTable.q3Home,
      q3Away: sandboxGameScoresTable.q3Away,
      q4Home: sandboxGameScoresTable.q4Home,
      q4Away: sandboxGameScoresTable.q4Away,
    })
    .from(sandboxGameScoresTable)
    .innerJoin(poolsTable, eq(sandboxGameScoresTable.poolId, poolsTable.id))
    .where(
      and(
        eq(poolsTable.sandboxMode, true),
        eq(poolsTable.isActive, true),
        isNotNull(sandboxGameScoresTable.replayKickoff),
      ),
    );

  for (const row of rows) {
    if (!row.replayKickoff || row.gameStatus === "final") continue;

    const elapsedMin = (now.getTime() - row.replayKickoff.getTime()) / 60_000;

    let newStatus: string;
    let homeScore: number | null;
    let awayScore: number | null;

    if (elapsedMin >= 120) {
      newStatus = "final";
      homeScore = (row.q1Home ?? 0) + (row.q2Home ?? 0) + (row.q3Home ?? 0) + (row.q4Home ?? 0);
      awayScore = (row.q1Away ?? 0) + (row.q2Away ?? 0) + (row.q3Away ?? 0) + (row.q4Away ?? 0);
    } else if (elapsedMin >= 105) {
      newStatus = "q4";
      homeScore = (row.q1Home ?? 0) + (row.q2Home ?? 0) + (row.q3Home ?? 0) + (row.q4Home ?? 0);
      awayScore = (row.q1Away ?? 0) + (row.q2Away ?? 0) + (row.q3Away ?? 0) + (row.q4Away ?? 0);
    } else if (elapsedMin >= 75) {
      newStatus = "q3";
      homeScore = (row.q1Home ?? 0) + (row.q2Home ?? 0) + (row.q3Home ?? 0);
      awayScore = (row.q1Away ?? 0) + (row.q2Away ?? 0) + (row.q3Away ?? 0);
    } else if (elapsedMin >= 60) {
      newStatus = "halftime";
      homeScore = (row.q1Home ?? 0) + (row.q2Home ?? 0);
      awayScore = (row.q1Away ?? 0) + (row.q2Away ?? 0);
    } else if (elapsedMin >= 30) {
      newStatus = "q2";
      homeScore = (row.q1Home ?? 0) + (row.q2Home ?? 0);
      awayScore = (row.q1Away ?? 0) + (row.q2Away ?? 0);
    } else if (elapsedMin >= 0) {
      newStatus = "q1";
      homeScore = row.q1Home ?? 0;
      awayScore = row.q1Away ?? 0;
    } else {
      continue;
    }

    if (row.gameStatus === newStatus) continue;

    await db
      .update(sandboxGameScoresTable)
      .set({ gameStatus: newStatus, homeScore, awayScore })
      .where(eq(sandboxGameScoresTable.id, row.id));
  }
}
