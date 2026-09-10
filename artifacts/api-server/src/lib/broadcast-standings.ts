import { db } from "@workspace/db";
import {
  entriesTable,
  nflConfidenceResultsTable,
  nflDivisionPredictorPicksTable,
  nflDivisionResultsTable,
  pickemPicksTable,
  pickemSeasonWeekGameCountsTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { NFL_DIVISIONS } from "./nfl-divisions";
import { scorePositions } from "./closePredictorPool";

export type BroadcastStatus = "Active" | "Eliminated" | "Winner" | "Final" | "Pending";
export type BroadcastRow = {
  rank: number;
  displayName: string;
  status: BroadcastStatus;
  primaryValue: number;
  primaryLabel: string;
  secondaryValue?: number | null;
  secondaryLabel?: string;
};
export type BroadcastSummary = { title: string; asOf: string };
export type BroadcastStandings = { summary: BroadcastSummary; rows: BroadcastRow[] };
/** Compatibility name used by the mail delivery layer. */
export type BroadcastStandingsSnapshot = BroadcastStandings;

export type BroadcastPool = Pick<typeof poolsTable.$inferSelect, "id" | "sport" | "poolType" | "currentWeek" | "isActive">;

export class UnsupportedBroadcastPoolError extends Error {
  readonly code = "UNSUPPORTED_BROADCAST_POOL";
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedBroadcastPoolError";
  }
}

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season", "dirty_dozen"]);
export function isSupportedNflBroadcastPool(pool: Pick<BroadcastPool, "sport" | "poolType">): boolean {
  return pool.sport === "nfl" && (
    SURVIVOR_TYPES.has(String(pool.poolType)) ||
    ["pickem_season", "nfl_confidence", "nfl_confidence_weekly", "nfl_division_predictor"].includes(String(pool.poolType))
  );
}
export const isSupportedBroadcastPool = isSupportedNflBroadcastPool;

function name(displayName: string | null, username: string): string {
  return displayName?.trim() || username;
}
function statusFor(pool: BroadcastPool, finalWinner: boolean | null | undefined): BroadcastStatus {
  if (pool.isActive) return "Active";
  return finalWinner ? "Winner" : "Final";
}
function rankRows<T extends { score: number }>(items: T[]): Array<T & { rank: number }> {
  let rank = 1;
  return [...items].sort((a, b) => b.score - a.score).map((item, i, sorted) => {
    if (i > 0 && item.score < sorted[i - 1].score) rank = i + 1;
    return { ...item, rank };
  });
}

async function survivor(pool: BroadcastPool): Promise<BroadcastStandings> {
  const members = await db.select({
    userId: entriesTable.userId, username: usersTable.username, displayName: usersTable.displayName,
    status: entriesTable.status, eliminatedWeek: entriesTable.eliminatedWeek, streak: entriesTable.streak,
    sovTotal: entriesTable.sovTotal, finalWinner: entriesTable.finalWinner,
  }).from(entriesTable).innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, pool.id));
  const active = members.filter((m) => pool.isActive ? m.status === "alive" : m.finalWinner)
    .map((m) => ({ m, score: m.sovTotal ?? pool.currentWeek }));
  const eliminated = members.filter((m) => !active.some((a) => a.m.userId === m.userId))
    .map((m) => ({ m, score: m.eliminatedWeek ?? 0 }));
  const rankedActive = rankRows(active);
  const activeCount = rankedActive.length;
  const rankedEliminated = [...eliminated].sort((a, b) => b.score - a.score)
    .map((x, i, all) => ({ ...x, rank: activeCount + all.filter((y) => y.score > x.score).length + 1 }));
  const rows: BroadcastRow[] = [
    ...rankedActive.map(({ m, rank, score }) => ({
      rank, displayName: name(m.displayName, m.username), status: (pool.isActive ? "Active" : "Winner") as BroadcastStatus,
      primaryValue: score, primaryLabel: m.sovTotal != null ? "Strength of victory" : "Weeks alive",
    })),
    ...rankedEliminated.map(({ m, rank, score }) => ({
      rank, displayName: name(m.displayName, m.username), status: "Eliminated" as const,
      primaryValue: score, primaryLabel: "Week eliminated",
    })),
  ];
  return { summary: { title: "NFL Survivor standings", asOf: new Date().toISOString() }, rows };
}

async function pickem(pool: BroadcastPool): Promise<BroadcastStandings> {
  const [rows, weeklyRows, tiebreakers, actualRows, storedGameCounts, fallbackDistinctCounts] = await Promise.all([db.select({
    userId: pickemPicksTable.userId, username: usersTable.username, displayName: usersTable.displayName,
    correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
    total: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} IN ('correct', 'incorrect'))`,
  }).from(pickemPicksTable).innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
    .where(eq(pickemPicksTable.poolId, pool.id))
    .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName), db.select({
      userId: pickemPicksTable.userId,
      week: pickemPicksTable.week,
    }).from(pickemPicksTable)
      .where(eq(pickemPicksTable.poolId, pool.id))
      .groupBy(pickemPicksTable.userId, pickemPicksTable.week), db.select({
      userId: entriesTable.userId, finalWinner: entriesTable.finalWinner,
      passing: entriesTable.tiebreakerPassingYards, rushing: entriesTable.tiebreakerRushingYards,
    }).from(entriesTable).where(eq(entriesTable.poolId, pool.id)), db.select({
      passing: nflConfidenceResultsTable.actualPassingYards, rushing: nflConfidenceResultsTable.actualRushingYards,
    }).from(nflConfidenceResultsTable).where(and(
      eq(nflConfidenceResultsTable.poolId, pool.id), eq(nflConfidenceResultsTable.week, 18),
    )).limit(1), db.select({
      week: pickemSeasonWeekGameCountsTable.week,
      gameCount: pickemSeasonWeekGameCountsTable.gameCount,
    }).from(pickemSeasonWeekGameCountsTable)
      .where(eq(pickemSeasonWeekGameCountsTable.poolId, pool.id)), db.select({
      week: pickemPicksTable.week,
      gameCount: sql<string>`COUNT(DISTINCT ${pickemPicksTable.gameId})`,
    }).from(pickemPicksTable)
      .where(and(
        eq(pickemPicksTable.poolId, pool.id),
        sql`${pickemPicksTable.result} IN ('correct', 'incorrect')`,
      ))
      .groupBy(pickemPicksTable.week)]);
  const guesses = new Map(tiebreakers.map((r) => [r.userId, r]));
  const actual = actualRows[0] ?? null;
  const weekGameCounts = new Map<number, number>();
  for (const row of storedGameCounts) weekGameCounts.set(row.week, row.gameCount);
  for (const row of fallbackDistinctCounts) {
    if (!weekGameCounts.has(row.week)) weekGameCounts.set(row.week, Number(row.gameCount));
  }
  const seasonTotals = new Map<number, number>();
  for (const row of weeklyRows) {
    const gameCount = weekGameCounts.get(row.week);
    if (gameCount !== undefined) {
      seasonTotals.set(row.userId, (seasonTotals.get(row.userId) ?? 0) + gameCount);
    }
  }
  const delta = (userId: number, field: "passing" | "rushing"): number => {
    const value = guesses.get(userId)?.[field];
    const target = actual?.[field];
    return value == null || target == null ? Infinity : Math.abs(value - target);
  };
  const groups = new Map<number, typeof rows>();
  for (const row of rows) {
    const key = Number(row.correct);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const ranked: Array<(typeof rows)[number] & { rank: number }> = [];
  let currentRank = 1;
  for (const key of [...groups.keys()].sort((a, b) => b - a)) {
    const group = groups.get(key)!;
    if (actual?.passing == null || group.length === 1) {
      ranked.push(...group.map((r) => ({ ...r, rank: currentRank })));
    } else {
      group.sort((a, b) => delta(a.userId, "passing") - delta(b.userId, "passing") ||
        delta(a.userId, "rushing") - delta(b.userId, "rushing"));
      ranked.push(...group.map((r) => ({ ...r, rank: currentRank })));
    }
    currentRank += group.length;
  }
  return { summary: { title: "NFL Pick'em season standings", asOf: new Date().toISOString() },
    rows: ranked.map((r) => ({ rank: r.rank, displayName: name(r.displayName, r.username),
      status: statusFor(pool, guesses.get(r.userId)?.finalWinner), primaryValue: Number(r.correct), primaryLabel: "Correct picks",
      secondaryValue: seasonTotals.get(r.userId) ?? Number(r.total), secondaryLabel: "Graded picks" })) };
}

async function confidence(pool: BroadcastPool, weekly: boolean): Promise<BroadcastStandings> {
  const week = weekly ? pool.currentWeek : undefined;
  const [rows, entryRows, actualRows] = await Promise.all([db.select({
    userId: pickemPicksTable.userId, username: usersTable.username, displayName: usersTable.displayName,
    points: sql<string>`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE(${pickemPicksTable.confidencePoints}::integer, 0) ELSE 0 END), 0)`,
    picks: sql<string>`COUNT(*)`,
  }).from(pickemPicksTable).innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
    .where(week === undefined ? eq(pickemPicksTable.poolId, pool.id) :
      and(eq(pickemPicksTable.poolId, pool.id), eq(pickemPicksTable.week, week)))
    .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName), db.select({
      userId: entriesTable.userId, finalWinner: entriesTable.finalWinner,
      passing: entriesTable.tiebreakerPassingYards, rushing: entriesTable.tiebreakerRushingYards,
    }).from(entriesTable).where(eq(entriesTable.poolId, pool.id)), weekly ? db.select({
      passing: nflConfidenceResultsTable.actualPassingYards, rushing: nflConfidenceResultsTable.actualRushingYards,
    }).from(nflConfidenceResultsTable).where(and(
      eq(nflConfidenceResultsTable.poolId, pool.id), eq(nflConfidenceResultsTable.week, pool.currentWeek),
    )).limit(1) : Promise.resolve([])]);
  const entryMap = new Map(entryRows.map((r) => [r.userId, r]));
  const actual = actualRows[0] ?? null;
  const diff = (userId: number, field: "passing" | "rushing"): number => {
    const guess = entryMap.get(userId)?.[field];
    const target = actual?.[field];
    return guess == null || target == null ? Infinity : Math.abs(guess - target);
  };
  const groups = new Map<number, typeof rows>();
  for (const row of rows) groups.set(Number(row.points), [...(groups.get(Number(row.points)) ?? []), row]);
  const ranked: Array<(typeof rows)[number] & { rank: number }> = [];
  let currentRank = 1;
  for (const key of [...groups.keys()].sort((a, b) => b - a)) {
    const group = groups.get(key)!;
    if (!weekly || group.length === 1 || actual?.passing == null) {
      ranked.push(...group.map((r) => ({ ...r, rank: currentRank })));
    } else {
      group.sort((a, b) => diff(a.userId, "passing") - diff(b.userId, "passing") ||
        diff(a.userId, "rushing") - diff(b.userId, "rushing"));
      // The weekly route deliberately gives each tiebreak-ordered player a
      // distinct rank (even when their two deltas are equal).
      ranked.push(...group.map((r, i) => ({ ...r, rank: currentRank + i })));
    }
    currentRank += group.length;
  }
  return { summary: { title: weekly ? `NFL Confidence — Week ${pool.currentWeek}` : "NFL Confidence season standings", asOf: new Date().toISOString() },
    rows: ranked.map((r) => ({ rank: r.rank, displayName: name(r.displayName, r.username),
      status: statusFor(pool, entryMap.get(r.userId)?.finalWinner),
      primaryValue: Number(r.points), primaryLabel: "Confidence points", secondaryValue: Number(r.picks), secondaryLabel: "Picks" })) };
}

async function ndp(pool: BroadcastPool): Promise<BroadcastStandings> {
  const [actuals, members, picks] = await Promise.all([
    db.select().from(nflDivisionResultsTable).where(eq(nflDivisionResultsTable.poolId, pool.id)),
    db.select({ userId: entriesTable.userId, username: usersTable.username, displayName: usersTable.displayName, finalWinner: entriesTable.finalWinner })
      .from(entriesTable).innerJoin(usersTable, eq(entriesTable.userId, usersTable.id)).where(eq(entriesTable.poolId, pool.id)),
    db.select().from(nflDivisionPredictorPicksTable).where(eq(nflDivisionPredictorPicksTable.poolId, pool.id)),
  ]);
  const actual = new Map(actuals.map((r) => [r.divisionName, r]));
  const byUser = new Map<number, typeof picks>();
  for (const p of picks) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
  const ranked = rankRows(members.map((m) => {
    let score = 0;
    for (const d of NFL_DIVISIONS) {
      const a = actual.get(d.name), p = byUser.get(m.userId)?.find((x) => x.divisionName === d.name);
      if (a && p) score += scorePositions([a.pos1Team, a.pos2Team, a.pos3Team, a.pos4Team], [p.pos1Team, p.pos2Team, p.pos3Team, p.pos4Team]);
    }
    return { m, score };
  }));
  return { summary: { title: "NFL Division Predictor standings", asOf: new Date().toISOString() },
    rows: ranked.map((r) => ({ rank: r.rank, displayName: name(r.m.displayName, r.m.username),
      status: statusFor(pool, r.m.finalWinner), primaryValue: r.score, primaryLabel: "Points", secondaryValue: 96, secondaryLabel: "Maximum" })) };
}

export async function getBroadcastStandings(pool: BroadcastPool): Promise<BroadcastStandings> {
  if (pool.sport !== "nfl") throw new UnsupportedBroadcastPoolError(`Broadcast standings support NFL only (received ${pool.sport}).`);
  const type = String(pool.poolType);
  if (!isSupportedNflBroadcastPool(pool)) throw new UnsupportedBroadcastPoolError(`Unsupported NFL broadcast pool type: ${type}.`);
  if (SURVIVOR_TYPES.has(type)) return survivor(pool);
  if (type === "pickem_season") return pickem(pool);
  if (type === "nfl_confidence") return confidence(pool, false);
  if (type === "nfl_confidence_weekly") return confidence(pool, true);
  return ndp(pool);
}