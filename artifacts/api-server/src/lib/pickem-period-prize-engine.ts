import { db } from "@workspace/db";
import { entriesTable, pickemPicksTable, poolsTable, usersTable } from "@workspace/db";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { calcPrize } from "./prizeCalc";
import { fetchGamesForDate, fetchGamesForDateChecked, formatCalendarDateEt, getNhlWeekBounds, getWeekBoundsEt, getSuperLeagueWeekBoundsEt, NHL_SANDBOX_ANCHOR } from "./espn";
import { fetchDailyStrikeouts } from "./mlb-stats";
import { fetchNhlTiebreakerStats } from "./nhl-stats";
import { offsetPickemDateStr } from "./pickem-prev-week";
import { getMlbWeeklyInitialPeriodStart } from "./mlb-weekly-period";
import { resolveWeeklyBonusThreshold } from "./pool-start";
import { resolveSequentialTiebreaker } from "./tiebreaker";
import {
  shouldUsePeriodPotWeeklyPrizes,
  shouldUseSeasonBudgetFixedWeeklyPayout,
} from "./weekly-pickem-payout-model";

export type PickEmPeriodPrizeTarget =
  | { kind: "nhl_week"; week: number }
  | { kind: "date_range"; weekStart: string; weekEnd: string };

type AggregateRow = {
  userId: number;
  correct: number;
  picked: number;
  graded: number;
};

async function loadAggregates(
  poolId: number,
  picksWhere: ReturnType<typeof and>,
): Promise<AggregateRow[]> {
  const rows = await db
    .select({
      userId: pickemPicksTable.userId,
      correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
      picked: sql<string>`COUNT(*)`,
      graded: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} IN ('correct', 'incorrect', 'postponed'))`,
    })
    .from(pickemPicksTable)
    .where(picksWhere)
    .groupBy(pickemPicksTable.userId)
    .orderBy(
      sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
      sql`COUNT(*) DESC`,
    );
  return rows.map((r) => ({
    userId: r.userId,
    correct: Number(r.correct),
    picked: Number(r.picked),
    graded: Number(r.graded),
  }));
}

export async function computePickEmPeriodPrizeByUser(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
  target: PickEmPeriodPrizeTarget,
): Promise<Map<number, number> | null> {
  const sport = pool.sport as string;
  const isMlb = sport === "mlb";
  const isNhl = sport === "nhl";

  const picksWhere =
    target.kind === "nhl_week"
      ? and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, target.week))
      : and(
          eq(pickemPicksTable.poolId, poolId),
          gte(pickemPicksTable.gameDate, target.weekStart),
          lte(pickemPicksTable.gameDate, target.weekEnd),
        );

  const [aggregates, memberCountRow, tbMlbEntries, tbNhlEntries] = await Promise.all([
    loadAggregates(poolId, picksWhere!),
    db.select({ value: count() }).from(entriesTable).where(eq(entriesTable.poolId, poolId)),
    isMlb
      ? db
          .select({
            userId: entriesTable.userId,
            tiebreakerRuns: entriesTable.tiebreakerRuns,
            tiebreakerStrikeouts: entriesTable.tiebreakerStrikeouts,
          })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, poolId))
      : Promise.resolve(null),
    isNhl
      ? db
          .select({
            userId: entriesTable.userId,
            tiebreakerShotsOnGoal: entriesTable.tiebreakerShotsOnGoal,
            tiebreakerPenaltyMinutes: entriesTable.tiebreakerPenaltyMinutes,
          })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, poolId))
      : Promise.resolve(null),
  ]);

  if (aggregates.length === 0) return null;
  const allGraded = aggregates.every((r) => r.graded === r.picked && r.picked > 0);
  if (!allGraded) return null;

  const weekTopCorrect = aggregates[0]?.correct ?? -1;
  if (weekTopCorrect < 0) return null;

  let tiebreakerActualRuns: number | null = null;
  let tiebreakerActualStrikeouts: number | null = null;
  let tiebreakerActualShotsOnGoal: number | null = null;
  let tiebreakerActualPenaltyMinutes: number | null = null;

  if (isMlb && target.kind === "date_range") {
    const prevSundayGames = await fetchGamesForDate(sport, target.weekEnd.replace(/-/g, ""));
    if (prevSundayGames.length > 0) {
      const sorted = [...prevSundayGames].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const tiebreakerGame = sorted[sorted.length - 1]!;
      if (tiebreakerGame.isCompleted) {
        tiebreakerActualRuns = (tiebreakerGame.homeScore ?? 0) + (tiebreakerGame.awayScore ?? 0);
        tiebreakerActualStrikeouts = await fetchDailyStrikeouts([tiebreakerGame], target.weekEnd);
      }
    }
  }

  if (isNhl && !pool.sandboxMode && target.kind === "nhl_week") {
    const anchor = pool.sandboxMode ? NHL_SANDBOX_ANCHOR : pool.createdAt;
    const { days } = getNhlWeekBounds(
      anchor,
      target.week,
      pool.sandboxMode ? null : pool.initialPeriodStart,
    );
    const prevSundayGames = (
      await Promise.all(
        days.map((day) =>
          fetchGamesForDateChecked("nhl", day.replace(/-/g, ""), pool.isPreseason ? 1 : 2, true),
        ),
      )
    )
      .flatMap((games) => games ?? [])
      .filter((game) =>
        days.includes(formatCalendarDateEt(new Date(game.date))),
      );
    if (prevSundayGames.length > 0) {
      const sorted = [...prevSundayGames].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const tiebreakerGame = sorted[sorted.length - 1]!;
      if (tiebreakerGame.isCompleted) {
        const stats = await fetchNhlTiebreakerStats(tiebreakerGame.id);
        tiebreakerActualShotsOnGoal = stats.shotsOnGoal;
        tiebreakerActualPenaltyMinutes = stats.penaltyMinutes;
      }
    }
  }

  let tiebreakWinnerIds: Set<number> | null = null;
  const tiedAggregates = aggregates.filter((r) => r.correct === weekTopCorrect);
  if (tiedAggregates.length > 1) {
    if (isMlb) {
      tiebreakWinnerIds = resolveSequentialTiebreaker(
        tiedAggregates.map((r) => r.userId),
        new Map(
          tiedAggregates.map((r) => {
            const tb = tbMlbEntries?.find((e) => e.userId === r.userId);
            return [r.userId, tb?.tiebreakerRuns ?? null];
          }),
        ),
        new Map(
          tiedAggregates.map((r) => {
            const tb = tbMlbEntries?.find((e) => e.userId === r.userId);
            return [r.userId, tb?.tiebreakerStrikeouts ?? null];
          }),
        ),
        tiebreakerActualRuns,
        tiebreakerActualStrikeouts,
      );
    } else if (isNhl) {
      tiebreakWinnerIds = resolveSequentialTiebreaker(
        tiedAggregates.map((r) => r.userId),
        new Map(
          tiedAggregates.map((r) => {
            const tb = tbNhlEntries?.find((e) => e.userId === r.userId);
            return [r.userId, tb?.tiebreakerShotsOnGoal ?? null];
          }),
        ),
        new Map(
          tiedAggregates.map((r) => {
            const tb = tbNhlEntries?.find((e) => e.userId === r.userId);
            return [r.userId, tb?.tiebreakerPenaltyMinutes ?? null];
          }),
        ),
        tiebreakerActualShotsOnGoal,
        tiebreakerActualPenaltyMinutes,
      );
    }
  }

  const prizeWonByUser = new Map<number, number>();
  const payoutPool = {
    sport,
    poolType: pool.poolType,
    pickFrequency: pool.pickFrequency,
    isRecurring: pool.isRecurring,
    weeklyPickEmPayoutModel: pool.weeklyPickEmPayoutModel,
    weeklyBonusEnabled: pool.weeklyBonusEnabled,
  };

  if (shouldUsePeriodPotWeeklyPrizes(payoutPool)) {
    const totalEntries = memberCountRow[0]?.value ?? aggregates.length;
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
    const rankGroups: number[][] = [];
    let prevCorrect = -1;
    for (const row of aggregates) {
      const c = row.correct;
      if (tiebreakWinnerIds != null && c === weekTopCorrect) {
        const slot = tiebreakWinnerIds.has(row.userId) ? 0 : 1;
        while (rankGroups.length <= slot) rankGroups.push([]);
        rankGroups[slot].push(row.userId);
      } else {
        if (c !== prevCorrect) rankGroups.push([]);
        rankGroups[rankGroups.length - 1].push(row.userId);
        prevCorrect = c;
      }
    }
    let placeIndex = 0;
    for (const group of rankGroups) {
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
      if (prize != null && prize > 0) {
        for (const uid of group) prizeWonByUser.set(uid, prize);
      }
      placeIndex += group.length;
    }
  }

  if (shouldUseSeasonBudgetFixedWeeklyPayout(payoutPool)) {
    const weeklyBonusAmount =
      pool.weeklyBonusAmount != null ? Number(pool.weeklyBonusAmount) : null;
    const enrolled = Number(memberCountRow[0]?.value ?? 0);
    const weekNum = target.kind === "nhl_week" ? target.week : pool.currentWeek - 1;
    const thresholdMet = resolveWeeklyBonusThreshold({
      poolType: pool.poolType,
      sport: pool.sport,
      pickFrequency: pool.pickFrequency,
      isRecurring: pool.isRecurring,
      weeklyBonusEnabled: true,
      weeklyBonusMinPlayers: pool.weeklyBonusMinPlayers,
      playerCount: enrolled,
      isResolved: weekNum < pool.currentWeek,
      persistedThreshold: pool.weeklyBonusLockedActive,
    });
    const weeklyWinnerIds: number[] = [];
    const topScorers = aggregates.filter((r) => r.correct === weekTopCorrect);
    if (tiebreakWinnerIds != null) {
      for (const row of topScorers) {
        if (tiebreakWinnerIds.has(row.userId)) weeklyWinnerIds.push(row.userId);
      }
    } else {
      for (const row of topScorers) weeklyWinnerIds.push(row.userId);
    }
    if (
      thresholdMet &&
      weeklyBonusAmount != null &&
      weeklyWinnerIds.length > 0
    ) {
      const perWinner = Math.round((weeklyBonusAmount / weeklyWinnerIds.length) * 100) / 100;
      for (const uid of weeklyWinnerIds) prizeWonByUser.set(uid, perWinner);
    }
  }

  return prizeWonByUser;
}

export function mlbPickEmWeekBounds(
  pool: typeof poolsTable.$inferSelect,
  weekNumber: number,
): { weekStart: string; weekEnd: string } {
  const anchorStart = getMlbWeeklyInitialPeriodStart({
    sport: pool.sport,
    poolType: pool.poolType,
    pickFrequency: pool.pickFrequency,
    initialPeriodStart: pool.initialPeriodStart,
    createdAt: pool.createdAt,
  });
  const weekStart = offsetPickemDateStr(anchorStart, (weekNumber - 1) * 7);
  const bounds = getWeekBoundsEt(weekStart);
  return { weekStart: bounds.weekStart, weekEnd: bounds.weekEnd };
}

export function genericWeekBoundsFromCurrentWeek(
  pool: typeof poolsTable.$inferSelect,
  weekNumber: number,
  todayEt: string,
): { weekStart: string; weekEnd: string } {
  const currentWeekBounds =
    pool.sport === "superleague"
      ? getSuperLeagueWeekBoundsEt(todayEt)
      : getWeekBoundsEt(todayEt);
  const weeksBack = pool.currentWeek - weekNumber;
  const weekNStart = offsetPickemDateStr(currentWeekBounds.weekStart, -(weeksBack * 7));
  return pool.sport === "superleague"
    ? getSuperLeagueWeekBoundsEt(weekNStart)
    : getWeekBoundsEt(weekNStart);
}
