import {
  db,
  nflWeeklyTiebreakersTable,
  poolsTable,
  sandboxGameScoresTable,
} from "@workspace/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { fetchNflGamesByWeek, fetchNflWeeklyTiebreakerActual } from "./espn";
import { isUnambiguousFinalNflGame } from "./nfl-auto-advance";
import {
  findLastNflGameByKickoff,
  type NflScheduledGame,
} from "./nfl-weekly-tiebreaker";
import { logger } from "./logger";

export async function getCanonicalWeeklyTiebreakerTarget(
  poolId: number,
  week: number,
  scheduledGames: NflScheduledGame[],
): Promise<NflScheduledGame | null> {
  const scheduledTarget = findLastNflGameByKickoff(scheduledGames);
  if (!scheduledTarget) return null;

  const [existingTarget] = await db
    .select({ targetGameId: nflWeeklyTiebreakersTable.targetGameId })
    .from(nflWeeklyTiebreakersTable)
    .where(and(
      eq(nflWeeklyTiebreakersTable.poolId, poolId),
      eq(nflWeeklyTiebreakersTable.week, week),
    ))
    .orderBy(asc(nflWeeklyTiebreakersTable.id))
    .limit(1);

  if (!existingTarget) return scheduledTarget;
  return scheduledGames.find((game) => game.id === existingTarget.targetGameId) ?? null;
}

export async function resolveNflWeeklyTiebreakerActuals(): Promise<{
  groupsChecked: number;
  groupsFailed: number;
  rowsUpdated: number;
}> {
  const unresolvedGroups = await db
    .selectDistinct({
      poolId: nflWeeklyTiebreakersTable.poolId,
      week: nflWeeklyTiebreakersTable.week,
      targetGameId: nflWeeklyTiebreakersTable.targetGameId,
      season: poolsTable.season,
      isPreseason: poolsTable.isPreseason,
      sandboxMode: poolsTable.sandboxMode,
    })
    .from(nflWeeklyTiebreakersTable)
    .innerJoin(poolsTable, eq(nflWeeklyTiebreakersTable.poolId, poolsTable.id))
    .where(and(
      isNull(nflWeeklyTiebreakersTable.actual),
      eq(poolsTable.weeklyBonusEnabled, true),
      inArray(poolsTable.poolType, ["pickem_season", "nfl_confidence"]),
    ));

  let rowsUpdated = 0;
  let groupsFailed = 0;
  const targetIdsByContest = new Map<string, Set<string>>();
  for (const group of unresolvedGroups) {
    const contestKey = `${group.poolId}:${group.week}`;
    const targetIds = targetIdsByContest.get(contestKey) ?? new Set<string>();
    targetIds.add(group.targetGameId);
    targetIdsByContest.set(contestKey, targetIds);
  }

  for (const group of unresolvedGroups) {
    try {
      const targetIds = targetIdsByContest.get(`${group.poolId}:${group.week}`);
      if (targetIds && targetIds.size > 1) {
        throw new Error("Multiple weekly tiebreaker target games exist for one pool/week");
      }

      let targetIsFinal = false;

      if (group.sandboxMode) {
        const [targetGame] = await db
          .select({ gameStatus: sandboxGameScoresTable.gameStatus })
          .from(sandboxGameScoresTable)
          .where(and(
            eq(sandboxGameScoresTable.poolId, group.poolId),
            eq(sandboxGameScoresTable.week, group.week),
            eq(sandboxGameScoresTable.gameId, group.targetGameId),
          ))
          .limit(1);
        targetIsFinal = targetGame?.gameStatus === "final";
      } else {
        const games = await fetchNflGamesByWeek(
          group.week,
          group.season,
          group.isPreseason ? 1 : 2,
        );
        const targetGame = games.find((game) => game.id === group.targetGameId);
        targetIsFinal = targetGame ? isUnambiguousFinalNflGame(targetGame) : false;
      }

      if (!targetIsFinal) continue;

      const actual = await fetchNflWeeklyTiebreakerActual(group.targetGameId);
      if (actual === null) continue;

      const updatedRows = await db
        .update(nflWeeklyTiebreakersTable)
        .set({
          actual,
          updatedAt: new Date(),
        })
        .where(and(
          eq(nflWeeklyTiebreakersTable.poolId, group.poolId),
          eq(nflWeeklyTiebreakersTable.week, group.week),
          eq(nflWeeklyTiebreakersTable.targetGameId, group.targetGameId),
          isNull(nflWeeklyTiebreakersTable.actual),
        ))
        .returning({ id: nflWeeklyTiebreakersTable.id });
      rowsUpdated += updatedRows.length;
    } catch (error) {
      groupsFailed += 1;
      logger.warn(
        {
          err: error,
          poolId: group.poolId,
          week: group.week,
          targetGameId: group.targetGameId,
        },
        "NFL weekly tiebreaker actual resolution failed",
      );
    }
  }

  return { groupsChecked: unresolvedGroups.length, groupsFailed, rowsUpdated };
}