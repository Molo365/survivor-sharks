import { db, pickemPicksTable, entriesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { getNhlWeekBounds, getTodayEtDate, NHL_SANDBOX_ANCHOR } from "./espn";
import { fetchPoolSlateGames, openSlateGames, type PoolSlateContext } from "./pool-slate-live";
import { isFastBreakMultiplierPool } from "./fast-break-pool";

export type PoolMemberPickStatus = {
  userId: number;
  pickStatus: "submitted" | "pending" | "incomplete" | "not_required";
  submittedCount: number;
  requiredCount: number;
};

export function toCrazyEightsSlateContext(pool: {
  id: number;
  sport: string;
  poolType: string;
  pickFrequency: string;
  currentWeek: number;
  season: number;
  isPreseason: boolean | null;
  sandboxMode: boolean | null;
  isActive: boolean;
  createdAt: Date;
  initialPeriodStart: string | null;
}): PoolSlateContext {
  return {
    id: pool.id,
    sport: pool.sport,
    poolType: pool.poolType,
    pickFrequency: pool.pickFrequency,
    currentWeek: pool.currentWeek,
    season: pool.season,
    isPreseason: pool.isPreseason,
    sandboxMode: pool.sandboxMode,
    isActive: pool.isActive,
    createdAt: pool.createdAt,
    initialPeriodStart: pool.initialPeriodStart,
  };
}

/** Per-member pick card status for crazy_8s / fast_break_multiplier (mirrors picks-summary). */
export async function buildCrazyEightsPoolPickStatuses(
  pool: Parameters<typeof toCrazyEightsSlateContext>[0],
): Promise<PoolMemberPickStatus[]> {
  const members = await db
    .select({ userId: entriesTable.userId })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, pool.id));

  const todayEt = getTodayEtDate();
  const isWeekly = pool.pickFrequency === "weekly";

  let periodFilter;
  if (isWeekly && pool.sport === "nhl") {
    const anchor = pool.sandboxMode ? NHL_SANDBOX_ANCHOR : pool.createdAt;
    const initialPeriodStart = pool.sandboxMode ? null : pool.initialPeriodStart;
    const { days } = getNhlWeekBounds(anchor, pool.currentWeek, initialPeriodStart);
    periodFilter = inArray(pickemPicksTable.gameDate, days);
  } else {
    periodFilter = isWeekly
      ? eq(pickemPicksTable.week, pool.currentWeek)
      : eq(pickemPicksTable.gameDate, todayEt);
  }

  const pickRows = await db
    .select({ userId: pickemPicksTable.userId, gameId: pickemPicksTable.gameId })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, pool.id), periodFilter));

  const picksByUser = new Map<number, Set<string>>();
  for (const row of pickRows) {
    if (!picksByUser.has(row.userId)) picksByUser.set(row.userId, new Set());
    picksByUser.get(row.userId)!.add(row.gameId);
  }

  const slateGames = await fetchPoolSlateGames(toCrazyEightsSlateContext(pool));
  const openGames = openSlateGames(slateGames);
  const isWeekendCrazyEights = isWeekly && (pool.sport === "nhl" || pool.sport === "nba");
  const isMultiplier = isFastBreakMultiplierPool(pool);
  const cardTarget = isMultiplier
    ? 8
    : isWeekendCrazyEights
      ? Math.min(8, slateGames.length)
      : openGames.length;
  const slateOpen = openGames.length > 0;

  return members.map((member) => {
    const gameIds = picksByUser.get(member.userId) ?? new Set<string>();
    const submittedCount = gameIds.size;

    let requiredCount = cardTarget;
    let pickStatus: PoolMemberPickStatus["pickStatus"];

    if (submittedCount === 0) {
      pickStatus = slateOpen ? "pending" : "not_required";
    } else if (isMultiplier) {
      pickStatus = submittedCount >= cardTarget ? "submitted" : "incomplete";
    } else if (isWeekendCrazyEights && submittedCount >= cardTarget) {
      pickStatus = "submitted";
    } else if (openGames.some((game) => !gameIds.has(game.id))) {
      pickStatus = "incomplete";
    } else {
      pickStatus = "submitted";
    }

    if (pickStatus === "incomplete" || pickStatus === "pending") {
      requiredCount = isWeekendCrazyEights || isMultiplier ? cardTarget : openGames.length;
    }

    return {
      userId: member.userId,
      pickStatus,
      submittedCount,
      requiredCount,
    };
  });
}