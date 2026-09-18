import { db } from "@workspace/db";
import {
  entriesTable,
  nflConfidenceResultsTable,
  nflDivisionPredictorPicksTable,
  nflDivisionResultsTable,
  nhlDivisionPredictorPicksTable,
  nhlDivisionResultsTable,
  pickemPicksTable,
  pickemSeasonWeekGameCountsTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { NFL_DIVISIONS } from "./nfl-divisions";
import { scorePositions } from "./closePredictorPool";
import { scoreNhlDivisionPositions } from "./nhl-scoring";

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
export type BroadcastRequestContext = {
  authorization?: string;
  cookie?: string;
};

export class UnsupportedBroadcastPoolError extends Error {
  readonly code = "UNSUPPORTED_BROADCAST_POOL";
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedBroadcastPoolError";
  }
}

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season", "dirty_dozen"]);
const PICKEM_LEADERBOARD_POOL_KEYS = new Set([
  "nhl:pickem",
  "mlb:pickem",
  "mls:pickem",
  "superleague:pickem",
  "championsleague:pickem",
  "worldcup:pickem",
  "nba:nba_ats",
]);
const SEASON_LEADERBOARD_POOL_KEYS = new Set([
  "nhl:season",
  "nba:season",
  "superleague:season",
]);
const MESSAGE_ONLY_BROADCAST_POOL_KEYS = new Set([
  "nhl:crazy_8s",
  "mlb:crazy_8s",
  "nba:crazy_8s",
]);
export function isSupportedNflBroadcastPool(pool: Pick<BroadcastPool, "sport" | "poolType">): boolean {
  return pool.sport === "nfl" && (
    SURVIVOR_TYPES.has(String(pool.poolType)) ||
    ["pickem_season", "nfl_confidence", "nfl_confidence_weekly", "nfl_division_predictor"].includes(String(pool.poolType))
  );
}
export function isSupportedBroadcastPool(pool: Pick<BroadcastPool, "sport" | "poolType">): boolean {
  return isSupportedNflBroadcastPool(pool)
    || (pool.sport === "nhl" && String(pool.poolType) === "nhl_division_predictor")
    || PICKEM_LEADERBOARD_POOL_KEYS.has(`${pool.sport}:${pool.poolType}`)
    || SEASON_LEADERBOARD_POOL_KEYS.has(`${pool.sport}:${pool.poolType}`)
    || MESSAGE_ONLY_BROADCAST_POOL_KEYS.has(`${pool.sport}:${pool.poolType}`);
}
export function isMessageOnlyBroadcastPool(pool: Pick<BroadcastPool, "sport" | "poolType">): boolean {
  return MESSAGE_ONLY_BROADCAST_POOL_KEYS.has(`${pool.sport}:${pool.poolType}`);
}

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

export class BroadcastStandingsFetchError extends Error {
  readonly code = "BROADCAST_STANDINGS_FETCH_FAILED";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BroadcastStandingsFetchError";
  }
}

type PickemLeaderboardEntry = {
  rank?: number;
  displayName?: string | null;
  correct?: number;
  picked?: number;
  tiebreakerRunsGuess?: number | null;
  tiebreakerRunsDiff?: number | null;
  tiebreakerShotsOnGoalGuess?: number | null;
  tiebreakerNhlDiff?: number | null;
  atsTiebreakerMargin?: number | null;
};

type PickemLeaderboardResponse = {
  week?: number;
  isWeekly?: boolean;
  weekStart?: string | null;
  weekEnd?: string | null;
  phase?: string | null;
  poolNotStarted?: boolean;
  startsAt?: string | null;
  entries?: PickemLeaderboardEntry[];
};

type SeasonLeaderboardEntry = {
  rank?: number;
  displayName?: string | null;
  status?: string;
  weeksAlive?: number;
  eliminatedWeek?: number | null;
  streak?: number | null;
  sovTotal?: number | null;
};

type SeasonLeaderboardResponse = {
  currentWeek?: number;
  viewWeek?: number;
  isHistorical?: boolean;
  active?: SeasonLeaderboardEntry[];
  eliminated?: SeasonLeaderboardEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchInternalLeaderboard<T>(
  path: string,
  requestContext: BroadcastRequestContext,
): Promise<T> {
  const port = process.env.PORT?.trim();
  if (!port) {
    throw new BroadcastStandingsFetchError("PORT must be configured for broadcast standings");
  }

  const headers: Record<string, string> = {};
  if (requestContext.authorization) headers.Authorization = requestContext.authorization;
  if (requestContext.cookie) headers.Cookie = requestContext.cookie;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Leaderboard endpoint returned HTTP ${response.status}`);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof BroadcastStandingsFetchError) throw error;
    throw new BroadcastStandingsFetchError(`Unable to load leaderboard: ${path}`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function sportLabel(sport: string): string {
  switch (sport) {
    case "mlb": return "MLB";
    case "nba": return "NBA";
    case "nhl": return "NHL";
    case "mls": return "MLS";
    case "superleague": return "Super League";
    case "championsleague": return "Champions League";
    case "worldcup": return "World Cup";
    default: return sport.toUpperCase();
  }
}

function pickemPeriodLabel(pool: BroadcastPool, response: PickemLeaderboardResponse): string {
  if (response.poolNotStarted && response.startsAt) {
    return `starts ${response.startsAt}`;
  }
  if (response.phase) {
    return `${response.phase.replace(/_/g, " ")} phase`;
  }
  if (response.weekStart && response.weekEnd) {
    return `${response.weekStart} to ${response.weekEnd}`;
  }
  if (response.isWeekly) {
    return `Week ${response.week ?? pool.currentWeek}`;
  }
  return "today";
}

function pickemTiebreaker(entry: PickemLeaderboardEntry, sport: string, poolType: string): {
  value: number | null;
  label: string | undefined;
} {
  if (poolType === "nba_ats" && entry.atsTiebreakerMargin != null) {
    return { value: entry.atsTiebreakerMargin, label: "Margin tiebreaker" };
  }
  if (sport === "mlb" && entry.tiebreakerRunsDiff != null) {
    return { value: entry.tiebreakerRunsDiff, label: "Tiebreaker difference" };
  }
  if (sport === "nhl" && entry.tiebreakerNhlDiff != null) {
    return { value: entry.tiebreakerNhlDiff, label: "Tiebreaker difference" };
  }
  if (sport === "mlb" && entry.tiebreakerRunsGuess != null) {
    return { value: entry.tiebreakerRunsGuess, label: "Runs guess" };
  }
  if (sport === "nhl" && entry.tiebreakerShotsOnGoalGuess != null) {
    return { value: entry.tiebreakerShotsOnGoalGuess, label: "Shots on goal guess" };
  }
  return { value: null, label: undefined };
}

async function pickem(pool: BroadcastPool, requestContext: BroadcastRequestContext): Promise<BroadcastStandings> {
  const response = await fetchInternalLeaderboard<PickemLeaderboardResponse>(
    `/api/pools/${pool.id}/pickem/leaderboard`,
    requestContext,
  );
  if (!isRecord(response) || !Array.isArray(response.entries)) {
    throw new BroadcastStandingsFetchError("Pick-Em leaderboard response was invalid");
  }

  const rows = response.entries.map((entry, index) => {
    const tiebreaker = pickemTiebreaker(entry, String(pool.sport), String(pool.poolType));
    return {
      rank: typeof entry.rank === "number" ? entry.rank : index + 1,
      displayName: entry.displayName?.trim() || "Player",
      status: pool.isActive ? "Active" as const : "Final" as const,
      primaryValue: Number(entry.correct ?? 0),
      primaryLabel: "Correct picks",
      secondaryValue: tiebreaker.value ?? Number(entry.picked ?? 0),
      secondaryLabel: tiebreaker.label ?? "Picks",
    };
  });

  return {
    summary: {
      title: `${sportLabel(String(pool.sport))} Pick'em standings — ${pickemPeriodLabel(pool, response)}`,
      asOf: new Date().toISOString(),
    },
    rows,
  };
}

async function seasonLeaderboard(pool: BroadcastPool, requestContext: BroadcastRequestContext): Promise<BroadcastStandings> {
  const response = await fetchInternalLeaderboard<SeasonLeaderboardResponse>(
    `/api/pools/${pool.id}/leaderboard`,
    requestContext,
  );
  if (!isRecord(response) || !Array.isArray(response.active) || !Array.isArray(response.eliminated)) {
    throw new BroadcastStandingsFetchError("Season leaderboard response was invalid");
  }

  const rows = [...response.active, ...response.eliminated].map((entry, index) => {
    const hasSov = entry.sovTotal != null;
    return {
      rank: typeof entry.rank === "number" ? entry.rank : index + 1,
      displayName: entry.displayName?.trim() || "Player",
      status: entry.status === "eliminated"
        ? "Eliminated" as const
        : pool.isActive ? "Active" as const : "Winner" as const,
      primaryValue: Number(hasSov ? entry.sovTotal : entry.weeksAlive ?? 0),
      primaryLabel: hasSov ? "Strength of victory" : "Weeks alive",
      secondaryValue: entry.streak ?? null,
      secondaryLabel: entry.streak != null ? "Streak" : undefined,
    };
  });

  return {
    summary: {
      title: `${sportLabel(String(pool.sport))} Survivor standings — Week ${response.viewWeek ?? response.currentWeek ?? pool.currentWeek}`,
      asOf: new Date().toISOString(),
    },
    rows,
  };
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

async function nflPickem(pool: BroadcastPool): Promise<BroadcastStandings> {
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

async function nhlNdp(pool: BroadcastPool): Promise<BroadcastStandings> {
  const [actuals, members, picks] = await Promise.all([
    db.select().from(nhlDivisionResultsTable).where(eq(nhlDivisionResultsTable.poolId, pool.id)),
    db.select({ userId: entriesTable.userId, username: usersTable.username, displayName: usersTable.displayName, finalWinner: entriesTable.finalWinner })
      .from(entriesTable).innerJoin(usersTable, eq(entriesTable.userId, usersTable.id)).where(eq(entriesTable.poolId, pool.id)),
    db.select().from(nhlDivisionPredictorPicksTable).where(eq(nhlDivisionPredictorPicksTable.poolId, pool.id)),
  ]);
  const actual = new Map(actuals.map((result) => [result.divisionName, result]));
  const byUser = new Map<number, typeof picks>();
  for (const pick of picks) byUser.set(pick.userId, [...(byUser.get(pick.userId) ?? []), pick]);
  const positions = (value: typeof picks[number] | typeof actuals[number]) => [
    value.pos1Team, value.pos2Team, value.pos3Team, value.pos4Team,
    value.pos5Team, value.pos6Team, value.pos7Team, value.pos8Team,
  ];
  const ranked = rankRows(members.map((member) => ({
    m: member,
    score: (byUser.get(member.userId) ?? []).reduce((total, pick) => {
      const result = actual.get(pick.divisionName);
      return total + (result ? scoreNhlDivisionPositions(positions(result), positions(pick)) : 0);
    }, 0),
  })));
  return {
    summary: { title: "NHL Division Predictor standings", asOf: new Date().toISOString() },
    rows: ranked.map((entry) => ({
      rank: entry.rank,
      displayName: name(entry.m.displayName, entry.m.username),
      status: statusFor(pool, entry.m.finalWinner),
      primaryValue: entry.score,
      primaryLabel: "Points",
      secondaryValue: 96,
      secondaryLabel: "Maximum",
    })),
  };
}

export async function getBroadcastStandings(
  pool: BroadcastPool,
  requestContext: BroadcastRequestContext = {},
): Promise<BroadcastStandings> {
  const type = String(pool.poolType);
  const poolKey = `${pool.sport}:${type}`;
  if (PICKEM_LEADERBOARD_POOL_KEYS.has(poolKey)) return pickem(pool, requestContext);
  if (SEASON_LEADERBOARD_POOL_KEYS.has(poolKey)) return seasonLeaderboard(pool, requestContext);
  if (pool.sport === "nhl" && type === "nhl_division_predictor") return nhlNdp(pool);
  if (pool.sport !== "nfl") throw new UnsupportedBroadcastPoolError(`Unsupported broadcast sport: ${pool.sport}.`);
  if (!isSupportedNflBroadcastPool(pool)) throw new UnsupportedBroadcastPoolError(`Unsupported NFL broadcast pool type: ${type}.`);
  if (SURVIVOR_TYPES.has(type)) return survivor(pool);
  if (type === "pickem_season") return nflPickem(pool);
  if (type === "nfl_confidence") return confidence(pool, false);
  if (type === "nfl_confidence_weekly") return confidence(pool, true);
  return ndp(pool);
}