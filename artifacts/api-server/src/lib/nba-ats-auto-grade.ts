import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { fetchGamesForDate, formatCalendarDateEt, getNbaWeekendBounds } from "./espn";
import { gradeNflPickemAtsPick } from "./nfl-pickem-ats-cover";
import { loadNbaAtsSpreads } from "./nba-ats-spreads";
import { logger } from "./logger";

/** Grade pending live NBA ATS picks from ESPN final scores (same rules as POST /pickem/process-results). */
export async function gradeLiveNbaAtsPickEmPools(): Promise<number> {
  let picksGraded = 0;

  const pools = await db
    .select()
    .from(poolsTable)
    .where(
      and(
        eq(poolsTable.poolType, "nba_ats"),
        eq(poolsTable.isActive, true),
        eq(poolsTable.sandboxMode, false),
      ),
    );

  for (const pool of pools) {
    try {
      const { days, espnDates } = getNbaWeekendBounds(pool.createdAt, pool.currentWeek);
      const weekendDates = new Set(days);
      const gameArrays = await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d)));
      const weekendGames = gameArrays.flat().filter(
        (g) => g.seasonType === 2 && weekendDates.has(formatCalendarDateEt(new Date(g.date))),
      );

      const spreadByGame = await loadNbaAtsSpreads({
        poolId: pool.id,
        week: pool.currentWeek,
        games: weekendGames.map((g) => ({
          id: g.id,
          homeTeamId: g.homeTeam.id,
          awayTeamId: g.awayTeam.id,
        })),
      });

      for (const game of weekendGames) {
        if (game.isPostponed) {
          const updated = await db
            .update(pickemPicksTable)
            .set({ result: "postponed", updatedAt: new Date() })
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.gameId, game.id),
                eq(pickemPicksTable.week, pool.currentWeek),
                eq(pickemPicksTable.result, "pending"),
              ),
            )
            .returning({ id: pickemPicksTable.id });
          picksGraded += updated.length;
          continue;
        }

        if (!game.isCompleted || game.homeScore == null || game.awayScore == null) continue;

        const line = spreadByGame.get(game.id);
        if (!line) continue;

        const gamePicks = await db
          .select()
          .from(pickemPicksTable)
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.gameId, game.id),
              eq(pickemPicksTable.week, pool.currentWeek),
              eq(pickemPicksTable.result, "pending"),
            ),
          );

        for (const pick of gamePicks) {
          const result = gradeNflPickemAtsPick({
            pickedTeamId: pick.pickedTeamId,
            favoriteTeamId: line.favoriteTeamId,
            spread: line.spread,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            homeTeamId: game.homeTeam.id,
          });
          await db
            .update(pickemPicksTable)
            .set({ result, updatedAt: new Date() })
            .where(eq(pickemPicksTable.id, pick.id));
          picksGraded++;
          logger.info(
            { poolId: pool.id, userId: pick.userId, gameId: game.id, result },
            "Auto-graded nba_ats pick",
          );
        }
      }
    } catch (err) {
      logger.error({ poolId: pool.id, week: pool.currentWeek, err }, "NBA ATS auto-grade error");
    }
  }

  return picksGraded;
}
