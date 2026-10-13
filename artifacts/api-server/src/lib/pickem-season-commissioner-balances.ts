import { db } from "@workspace/db";
import {
  entriesTable,
  nflWeeklyTiebreakersTable,
  pickemPicksTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { resolveWeeklyBonusThreshold } from "./pool-start";
import { resolveWeeklyTiebreaker } from "./nfl-weekly-tiebreaker";
import { NFL_TOTAL_WEEKS } from "./pickem-season-closure";

export type WeeklyWinLine = { week: number; amount: number };

export type CommissionerBalancePlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  entryFeeOwed: number;
  weeklyBonusWon: number;
  seasonPrizeWon: number;
  totalWon: number;
  /** Positive = player owes commissioner (entry minus winnings). */
  netBalance: number;
  weeklyWins: WeeklyWinLine[];
};

export type CommissionerBalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
  memberCount: number;
  weeklyBonusEnabled: boolean;
  poolIsActive: boolean;
  summary: {
    totalEntryExpected: number;
    totalWeeklyOwed: number;
    totalSeasonOwed: number;
    totalOwedToPlayers: number;
    netToCommissioner: number;
  };
  players: CommissionerBalancePlayer[];
};

async function weeklyBonusWinsForPool(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<Map<number, { total: number; weeks: WeeklyWinLine[] }>> {
  const out = new Map<number, { total: number; weeks: WeeklyWinLine[] }>();

  if (!pool.weeklyBonusEnabled || pool.weeklyBonusAmount == null) {
    return out;
  }

  const weeklyBonusAmount = Number(pool.weeklyBonusAmount);
  const [{ playerCount }] = await db
    .select({ playerCount: sql<string>`COUNT(*)` })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, poolId));

  const enrolled = Number(playerCount);
  const thresholdMetBase = resolveWeeklyBonusThreshold({
    poolType: pool.poolType,
    weeklyBonusEnabled: true,
    weeklyBonusMinPlayers: pool.weeklyBonusMinPlayers,
    playerCount: enrolled,
    isResolved: true,
    persistedThreshold: pool.weeklyBonusLockedActive,
  });

  if (!thresholdMetBase) {
    return out;
  }

  const weekRows = await db
    .select({ week: pickemPicksTable.week })
    .from(pickemPicksTable)
    .where(
      and(
        eq(pickemPicksTable.poolId, poolId),
        sql`${pickemPicksTable.result} IN ('correct', 'incorrect')`,
      ),
    )
    .groupBy(pickemPicksTable.week);

  const lastResolvableWeek = pool.isActive ? pool.currentWeek - 1 : NFL_TOTAL_WEEKS;

  for (const { week } of weekRows) {
    if (week > lastResolvableWeek || week < 1) continue;

    const correctByUser = await db
      .select({
        userId: pickemPicksTable.userId,
        correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
      })
      .from(pickemPicksTable)
      .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.week, week)))
      .groupBy(pickemPicksTable.userId);

    if (correctByUser.length === 0) continue;

    const maxCorrect = Math.max(...correctByUser.map((r) => Number(r.correct)));
    if (maxCorrect <= 0) continue;

    const scoreWinners = correctByUser
      .filter((r) => Number(r.correct) === maxCorrect)
      .map((r) => ({ userId: r.userId }));

    const weeklyTiebreakerRows =
      scoreWinners.length > 1
        ? await db
            .select({
              userId: nflWeeklyTiebreakersTable.userId,
              guess: nflWeeklyTiebreakersTable.guess,
              actual: nflWeeklyTiebreakersTable.actual,
            })
            .from(nflWeeklyTiebreakersTable)
            .where(
              and(
                eq(nflWeeklyTiebreakersTable.poolId, poolId),
                eq(nflWeeklyTiebreakersTable.week, week),
                inArray(
                  nflWeeklyTiebreakersTable.userId,
                  scoreWinners.map((w) => w.userId),
                ),
              ),
            )
        : [];

    const resolution = resolveWeeklyTiebreaker(scoreWinners, weeklyTiebreakerRows);
    if (resolution.status === "pending" || resolution.winners.length === 0) continue;

    const perWinner = Math.round((weeklyBonusAmount / resolution.winners.length) * 100) / 100;
    for (const winner of resolution.winners) {
      const uid = winner.userId;
      if (!out.has(uid)) out.set(uid, { total: 0, weeks: [] });
      const row = out.get(uid)!;
      row.total += perWinner;
      row.weeks.push({ week, amount: perWinner });
    }
  }

  return out;
}

export async function buildPickemSeasonCommissionerBalanceSheet(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<CommissionerBalanceSheet> {
  const members = await db
    .select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      prizeAmount: entriesTable.prizeAmount,
    })
    .from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId))
    .orderBy(usersTable.username);

  const entryFee = pool.entryFee ?? 0;
  const weeklyWinsByUser = await weeklyBonusWinsForPool(pool, poolId);

  const players: CommissionerBalancePlayer[] = members.map((m) => {
    const weekly = weeklyWinsByUser.get(m.userId);
    const weeklyBonusWon = weekly?.total ?? 0;
    const seasonPrizeWon = m.prizeAmount != null ? Math.round(Number(m.prizeAmount) * 100) / 100 : 0;
    const totalWon = weeklyBonusWon + seasonPrizeWon;
    const entryFeeOwed = entryFee;
    const netBalance = entryFeeOwed - totalWon;

    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      entryFeeOwed,
      weeklyBonusWon,
      seasonPrizeWon,
      totalWon,
      netBalance,
      weeklyWins: weekly?.weeks ?? [],
    };
  });

  const totalEntryExpected = entryFee * members.length;
  const totalWeeklyOwed = players.reduce((s, p) => s + p.weeklyBonusWon, 0);
  const totalSeasonOwed = players.reduce((s, p) => s + p.seasonPrizeWon, 0);
  const totalOwedToPlayers = totalWeeklyOwed + totalSeasonOwed;
  const netToCommissioner = totalEntryExpected - totalOwedToPlayers;

  return {
    poolId,
    poolName: pool.name,
    entryFee,
    memberCount: members.length,
    weeklyBonusEnabled: pool.weeklyBonusEnabled,
    poolIsActive: pool.isActive,
    summary: {
      totalEntryExpected,
      totalWeeklyOwed,
      totalSeasonOwed,
      totalOwedToPlayers,
      netToCommissioner,
    },
    players,
  };
}
