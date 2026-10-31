import type { poolsTable } from "@workspace/db";
import {
  fetchGamesForDate,
  fetchNbaGamesByWeek,
  fetchNhlGamesByWeek,
  getDailyPickDeadline,
  getMlbWeekBounds,
  getTodayEtDate,
  NBA_SANDBOX_ANCHOR,
  NHL_SANDBOX_ANCHOR,
  type EspnGame,
} from "./espn";
import {
  resolveCrazyEightsPeriod,
  type CrazyEightsPeriodPool,
} from "./crazy-eights-periods";
import { isCrazyEightsFamilyPoolType } from "./fast-break-pool";
import { nbaSaturdaySixPmLockInstant } from "./nba-slate-reveal";
import { nhlSaturdayEtDateFromBounds, nhlSaturdaySevenPmLockInstant } from "./nhl-slate-reveal";
import { reminderPeriodKey } from "./pick-reminder-windows";

export type CrazyEightsPickemPeriod =
  | { kind: "week"; games: EspnGame[]; gameIds: Set<string>; confidenceRequired: boolean }
  | { kind: "date"; date: string; games: EspnGame[]; gameIds: Set<string>; confidenceRequired: boolean }
  | { kind: "range"; start: string; end: string; games: EspnGame[]; gameIds: Set<string>; confidenceRequired: boolean };

function selectableGames(games: EspnGame[]): EspnGame[] {
  return games.filter(
    (game) => !game.isPostponed && game.status !== "suspended" && game.status !== "postponed",
  );
}

function selectableGameIds(games: EspnGame[]): Set<string> {
  return new Set(selectableGames(games).map((game) => game.id));
}

export function toCrazyEightsPeriodPool(
  pool: typeof poolsTable.$inferSelect,
): CrazyEightsPeriodPool {
  return {
    sport: pool.sport,
    poolType: pool.poolType,
    isRecurring: pool.isRecurring,
    sandboxMode: pool.sandboxMode ?? false,
    createdAt: pool.createdAt instanceof Date ? pool.createdAt : new Date(pool.createdAt),
    currentWeek: pool.currentWeek,
    initialPeriodStart: pool.initialPeriodStart ?? null,
  };
}

export function crazyEightsRequiredPickCount(
  pool: typeof poolsTable.$inferSelect,
  period: CrazyEightsPickemPeriod | undefined,
  gameIds: Set<string>,
): number {
  if (!isCrazyEightsFamilyPoolType(pool.poolType) || !period) return gameIds.size;
  if (pool.pickFrequency === "weekly" && (pool.sport === "nba" || pool.sport === "nhl")) {
    return Math.min(8, period.games.length);
  }
  if (pool.pickFrequency === "weekly" && pool.sport === "mlb") {
    return Math.min(8, period.games.length);
  }
  return gameIds.size;
}

export function crazyEightsConfidenceRequired(pool: typeof poolsTable.$inferSelect): boolean {
  return isCrazyEightsFamilyPoolType(pool.poolType);
}

export async function resolveCrazyEightsPickemPeriod(
  pool: typeof poolsTable.$inferSelect,
): Promise<CrazyEightsPickemPeriod | null> {
  if (!isCrazyEightsFamilyPoolType(pool.poolType)) return null;

  const todayEt = getTodayEtDate();

  if (pool.sport === "mlb" && pool.pickFrequency === "daily") {
    const games = await fetchGamesForDate("mlb", todayEt.replace(/-/g, ""));
    const selectable = selectableGames(games);
    return {
      kind: "date",
      date: todayEt,
      games: selectable,
      gameIds: selectableGameIds(games),
      confidenceRequired: true,
    };
  }

  if (pool.sport === "mlb" && pool.pickFrequency === "weekly") {
    const bounds = getMlbWeekBounds(pool.createdAt, pool.currentWeek);
    const games = (
      await Promise.all(
        bounds.days.map((date) => fetchGamesForDate("mlb", date.replace(/-/g, ""))),
      )
    ).flat();
    const selectable = selectableGames(games);
    return {
      kind: "range",
      start: bounds.days[0]!,
      end: bounds.days.at(-1)!,
      games: selectable,
      gameIds: selectableGameIds(games),
      confidenceRequired: true,
    };
  }

  if (pool.pickFrequency === "weekly" && (pool.sport === "nba" || pool.sport === "nhl")) {
    const period = resolveCrazyEightsPeriod(toCrazyEightsPeriodPool(pool), undefined);
    if (!period) return null;

    let games: EspnGame[] = [];
    if (pool.sport === "nba") {
      const anchor = pool.sandboxMode
        ? NBA_SANDBOX_ANCHOR
        : pool.createdAt instanceof Date
          ? pool.createdAt
          : new Date(pool.createdAt);
      games = await fetchNbaGamesByWeek(anchor, pool.currentWeek);
    } else {
      const anchor = pool.sandboxMode
        ? NHL_SANDBOX_ANCHOR
        : pool.createdAt instanceof Date
          ? pool.createdAt
          : new Date(pool.createdAt);
      games = await fetchNhlGamesByWeek(
        anchor,
        pool.currentWeek,
        pool.isPreseason ? 1 : 2,
        pool.sandboxMode ? null : pool.initialPeriodStart,
      );
    }

    const selectable = selectableGames(games);
    if (pool.sport === "nhl") {
      return {
        kind: "range",
        start: period.weekStart,
        end: period.weekEnd,
        games: selectable,
        gameIds: selectableGameIds(games),
        confidenceRequired: true,
      };
    }
    return {
      kind: "week",
      games: selectable,
      gameIds: selectableGameIds(games),
      confidenceRequired: true,
    };
  }

  return null;
}

export async function resolveCrazyEightsReminderDeadline(
  pool: typeof poolsTable.$inferSelect,
): Promise<{ deadline: Date; periodKey: string; period: CrazyEightsPickemPeriod } | null> {
  const period = await resolveCrazyEightsPickemPeriod(pool);
  if (!period) return null;

  if (period.kind === "date") {
    const deadline = getDailyPickDeadline(period.games);
    if (!deadline) return null;
    return {
      deadline,
      periodKey: reminderPeriodKey({ daily: true, date: period.date, week: pool.currentWeek }),
      period,
    };
  }

  if (period.kind === "range" && pool.sport === "mlb") {
    const bounds = getMlbWeekBounds(pool.createdAt, pool.currentWeek);
    return {
      deadline: bounds.deadline,
      periodKey: reminderPeriodKey({
        start: bounds.days[0],
        end: bounds.days.at(-1),
        season: pool.season,
        week: pool.currentWeek,
      }),
      period,
    };
  }

  if (period.kind === "range" || period.kind === "week") {
    const slateIsos = period.games.map((game) => game.date);
    const periodMeta = resolveCrazyEightsPeriod(toCrazyEightsPeriodPool(pool), undefined);
    if (!periodMeta || periodMeta.viewingPastPeriod) return null;

    const saturdayFallback = pool.sport === "nhl"
      ? nhlSaturdayEtDateFromBounds(periodMeta.weekStart)
      : periodMeta.weekStart;

    const deadline = pool.sport === "nba"
      ? nbaSaturdaySixPmLockInstant(slateIsos, saturdayFallback)
      : nhlSaturdaySevenPmLockInstant(slateIsos, saturdayFallback);

    if (!deadline) return null;

    return {
      deadline,
      periodKey: reminderPeriodKey({
        start: periodMeta.weekStart,
        end: periodMeta.weekEnd,
        season: pool.season,
        week: pool.currentWeek,
      }),
      period,
    };
  }

  return null;
}
