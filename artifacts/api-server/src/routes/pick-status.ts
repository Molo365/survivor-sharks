import { Router } from "express";
import { db } from "@workspace/db";
import {
  entriesTable,
  pickemPicksTable,
  picksTable,
  poolsTable,
  sandboxGameScoresTable,
} from "@workspace/db";
import { and, eq, gte, lte, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  fetchGamesForDate,
  fetchNbaGamesByWeek,
  fetchNhlGamesByWeek,
  fetchNflGamesByWeek,
  fetchSuperLeagueGamesForDate,
  getNbaWeekendBounds,
  getSuperLeagueWeekBoundsEt,
  getTodayEtDate,
  getWeekBoundsEt,
  NBA_SANDBOX_ANCHOR,
  NHL_SANDBOX_ANCHOR,
  type EspnGame,
} from "../lib/espn";
import {
  getSandboxGamesForWeek,
  replayRowToPickEmShape,
} from "../lib/nfl2025Schedule";

const router = Router({ mergeParams: true });

export type PickStatus = "submitted" | "pending" | "not_required";

type Member = {
  userId: number;
  status: string;
};

type StatusRecord = {
  userId: number;
  pickStatus: PickStatus;
  submittedCount: number;
  requiredCount: number;
};

export type PickemPeriod =
  | { kind: "week"; games: EspnGame[]; gameIds: Set<string>; confidenceRequired: boolean }
  | { kind: "date"; date: string; games: EspnGame[]; gameIds: Set<string>; confidenceRequired: boolean }
  | { kind: "range"; start: string; end: string; games: EspnGame[]; gameIds: Set<string>; confidenceRequired: boolean };

function selectableGameIds(
  games: Array<{ id: string; status?: string; isPostponed?: boolean }>,
): Set<string> {
  return new Set(
    games
      .filter((game) => game.status !== "suspended" && game.status !== "postponed" && !game.isPostponed)
      .map((game) => game.id),
  );
}

function selectableGames(games: EspnGame[]): EspnGame[] {
  return games.filter((game) => selectableGameIds([game]).has(game.id));
}

function datesFromRange(start: string, end: string): string[] {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startDate = new Date(Date.UTC(startYear!, startMonth! - 1, startDay!));
  const endDate = new Date(Date.UTC(endYear!, endMonth! - 1, endDay!));
  const dates: string[] = [];

  for (let date = startDate; date <= endDate; date = new Date(date.getTime() + 86_400_000)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

async function fetchGamesForDates(
  sport: string,
  dates: string[],
  fetcher: (date: string) => Promise<EspnGame[]> = (date) => fetchGamesForDate(sport, date.replace(/-/g, "")),
): Promise<EspnGame[]> {
  const results = await Promise.all(dates.map(fetcher));
  const seen = new Set<string>();
  return results.flat().filter((game) => {
    if (seen.has(game.id)) return false;
    seen.add(game.id);
    return true;
  });
}

export async function resolvePickemPeriod(pool: typeof poolsTable.$inferSelect): Promise<PickemPeriod | null> {
  const sport = pool.sport as string;
  const todayEt = getTodayEtDate();

  if (pool.pickFrequency === "daily") {
    const games = await fetchGamesForDate("mlb", todayEt.replace(/-/g, ""));
    return {
      kind: "date",
      date: todayEt,
      games: selectableGames(games),
      gameIds: selectableGameIds(games),
      confidenceRequired: false,
    };
  }

  if (pool.poolType === "nba_ats") {
    let dates: string[];
    if (pool.sandboxMode) {
      const bounds = getNbaWeekendBounds(NBA_SANDBOX_ANCHOR, pool.currentWeek);
      dates = bounds.espnDates.map((date) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`);
    } else {
      const full = getWeekBoundsEt(todayEt);
      const [year, month, day] = full.weekStart.split("-").map(Number);
      const friday = new Date(Date.UTC(year!, month! - 1, day! + 4));
      const sunday = new Date(Date.UTC(year!, month! - 1, day! + 6));
      dates = datesFromRange(friday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10));
    }
    const games = await fetchGamesForDates("nba", dates);
    return {
      kind: "week",
      games: selectableGames(games),
      gameIds: selectableGameIds(games),
      confidenceRequired: false,
    };
  }

  if (pool.poolType !== "pickem") return null;

  if (sport === "nhl") {
    const anchor = pool.sandboxMode
      ? NHL_SANDBOX_ANCHOR
      : pool.createdAt instanceof Date
        ? pool.createdAt
        : new Date(pool.createdAt);
    const games = await fetchNhlGamesByWeek(anchor, pool.currentWeek);
    return { kind: "week", games: selectableGames(games), gameIds: selectableGameIds(games), confidenceRequired: false };
  }

  if (sport === "nba") {
    const anchor = pool.sandboxMode
      ? NBA_SANDBOX_ANCHOR
      : pool.createdAt instanceof Date
        ? pool.createdAt
        : new Date(pool.createdAt);
    const games = await fetchNbaGamesByWeek(anchor, pool.currentWeek);
    return { kind: "week", games: selectableGames(games), gameIds: selectableGameIds(games), confidenceRequired: false };
  }

  if (sport === "mlb") {
    const [start, end] = (() => {
      const full = getWeekBoundsEt(todayEt);
      return [full.weekStart, full.weekEnd] as const;
    })();
    const games = await fetchGamesForDates("mlb", datesFromRange(start, end));
    return { kind: "range", start, end, games: selectableGames(games), gameIds: selectableGameIds(games), confidenceRequired: false };
  }

  if (sport === "mls") {
    const { weekStart, weekEnd } = getWeekBoundsEt(todayEt);
    const games = await fetchGamesForDates("mls", datesFromRange(weekStart, weekEnd));
    return { kind: "range", start: weekStart, end: weekEnd, games: selectableGames(games), gameIds: selectableGameIds(games), confidenceRequired: false };
  }

  if (sport === "superleague") {
    const { weekStart, weekEnd } = getSuperLeagueWeekBoundsEt(todayEt);
    const games = await fetchGamesForDates(
      "superleague",
      datesFromRange(weekStart, weekEnd),
      (date) => fetchSuperLeagueGamesForDate(date.replace(/-/g, "")),
    );
    return { kind: "range", start: weekStart, end: weekEnd, games: selectableGames(games), gameIds: selectableGameIds(games), confidenceRequired: false };
  }

  return null;
}

export async function resolveNflSelectableGames(
  pool: typeof poolsTable.$inferSelect,
): Promise<Array<{ id: string; date: string }>> {
  const week = pool.currentWeek;
  if (pool.sandboxMode) {
    const replayRows = await db
      .select()
      .from(sandboxGameScoresTable)
      .where(and(
        eq(sandboxGameScoresTable.poolId, pool.id),
        eq(sandboxGameScoresTable.week, week),
        isNotNull(sandboxGameScoresTable.gameStatus),
      ));
    if (replayRows.length > 0) {
      return replayRows.map(replayRowToPickEmShape).map((game) => ({ id: game.id, date: game.startTime }));
    }
    return getSandboxGamesForWeek(week).map((game) => ({ id: game.id, date: game.gameTime }));
  }

  const seasonType = pool.isPreseason ? 1 : 2;
  const games = await fetchNflGamesByWeek(week, pool.season, seasonType);
  return selectableGames(games).map((game) => ({ id: game.id, date: game.date }));
}

export async function resolveNflGameIds(pool: typeof poolsTable.$inferSelect): Promise<Set<string>> {
  return new Set((await resolveNflSelectableGames(pool)).map((game) => game.id));
}

export function buildStatuses(
  members: Member[],
  requiredCount: number,
  submittedByUser: Map<number, number>,
  eliminatedUsers = new Set<number>(),
): StatusRecord[] {
  return members.map((member) => {
    if (requiredCount === 0 || eliminatedUsers.has(member.userId)) {
      return {
        userId: member.userId,
        pickStatus: "not_required",
        submittedCount: 0,
        requiredCount: 0,
      };
    }

    const submittedCount = submittedByUser.get(member.userId) ?? 0;
    return {
      userId: member.userId,
      pickStatus: submittedCount >= requiredCount ? "submitted" : "pending",
      submittedCount,
      requiredCount,
    };
  });
}

export function countSubmittedPickemGames(
  rows: Array<{ userId: number; gameId: string; confidencePoints: number | null }>,
  gameIds: Set<string>,
  confidenceRequired: boolean,
): Map<number, number> {
  const submittedByUser = new Map<number, Set<string>>();
  for (const row of rows) {
    if (!gameIds.has(row.gameId) || (confidenceRequired && row.confidencePoints == null)) continue;
    if (!submittedByUser.has(row.userId)) submittedByUser.set(row.userId, new Set());
    submittedByUser.get(row.userId)!.add(row.gameId);
  }
  return new Map([...submittedByUser].map(([id, games]) => [id, games.size]));
}

// GET /api/pools/:poolId/pick-status
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId), 10);
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [viewerMembership, members] = await Promise.all([
    db.select({ userId: entriesTable.userId })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
      .limit(1),
    db.select({ userId: entriesTable.userId, status: entriesTable.status })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, poolId)),
  ]);
  if (!viewerMembership[0]) {
    res.status(403).json({ error: "Not a member of this pool" });
    return;
  }

  if (!pool.isActive) {
    res.json(members.map((member) => ({
      userId: member.userId,
      pickStatus: "not_required" as const,
      submittedCount: 0,
      requiredCount: 0,
    })));
    return;
  }

  const survivorPool = ["season", "weekly", "mid_season", "dirty_dozen"].includes(pool.poolType as string);
  if (survivorPool) {
    const todayEt = getTodayEtDate();
    const pickRows = await db
      .select({ userId: picksTable.userId })
      .from(picksTable)
      .where(and(
        eq(picksTable.poolId, poolId),
        eq(picksTable.week, pool.currentWeek),
        pool.pickFrequency === "daily" ? eq(picksTable.pickDate, todayEt) : undefined,
      ));
    const submittedByUser = new Map<number, number>();
    for (const row of pickRows) submittedByUser.set(row.userId, 1);
    const eliminatedUsers = new Set(
      members.filter((member) => member.status === "eliminated").map((member) => member.userId),
    );
    res.json(buildStatuses(members, 1, submittedByUser, eliminatedUsers));
    return;
  }

  if (["nfl_confidence", "nfl_confidence_weekly", "pickem_season"].includes(pool.poolType as string)) {
    const gameIds = await resolveNflGameIds(pool);
    const pickRows = await db
      .select({
        userId: pickemPicksTable.userId,
        gameId: pickemPicksTable.gameId,
        confidencePoints: pickemPicksTable.confidencePoints,
      })
      .from(pickemPicksTable)
      .where(and(
        eq(pickemPicksTable.poolId, poolId),
        eq(pickemPicksTable.week, pool.currentWeek),
      ));
    res.json(buildStatuses(
      members,
      gameIds.size,
      countSubmittedPickemGames(pickRows, gameIds, pool.poolType !== "pickem_season"),
    ));
    return;
  }

  const period = await resolvePickemPeriod(pool);
  if (!period) {
    res.status(400).json({ error: "Pick status is not supported for this pool type" });
    return;
  }

  const pickCondition = period.kind === "week"
    ? eq(pickemPicksTable.week, pool.currentWeek)
    : period.kind === "date"
    ? eq(pickemPicksTable.gameDate, period.date)
    : and(gte(pickemPicksTable.gameDate, period.start), lte(pickemPicksTable.gameDate, period.end));
  const pickRows = await db
    .select({
      userId: pickemPicksTable.userId,
      gameId: pickemPicksTable.gameId,
      confidencePoints: pickemPicksTable.confidencePoints,
    })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, poolId), pickCondition));

  res.json(buildStatuses(
    members,
    period.gameIds.size,
    countSubmittedPickemGames(pickRows, period.gameIds, period.confidenceRequired),
  ));
});

export default router;