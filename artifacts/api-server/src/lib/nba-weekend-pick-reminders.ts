import type { poolsTable } from "@workspace/db";
import {
  fetchGamesForDate,
  type EspnGame,
} from "./espn";
import {
  getNbaAtsPicksOpenInstant,
  getNbaAtsSlateBoundsForPool,
  isNbaAtsPool,
  isNbaAtsPreStart,
  type NbaAtsPool,
} from "./nba-ats-period";
import { isNbaWeekendOfficePool, nbaSaturdaySixPmLockInstant } from "./nba-slate-reveal";
import { reminderPeriodKey } from "./pick-reminder-windows";
import { isFastBreakMultiplierPool } from "./fast-break-pool";
import type { CrazyEightsPickemPeriod } from "./crazy-eights-reminder";

function selectableGames(games: EspnGame[]): EspnGame[] {
  return games.filter(
    (game) => !game.isPostponed && game.status !== "suspended" && game.status !== "postponed",
  );
}

function toNbaAtsPool(pool: typeof poolsTable.$inferSelect): NbaAtsPool {
  return {
    sport: pool.sport,
    poolType: pool.poolType,
    initialPeriodStart: pool.initialPeriodStart ?? null,
    createdAt: pool.createdAt instanceof Date ? pool.createdAt : new Date(pool.createdAt),
    sandboxMode: pool.sandboxMode ?? false,
    currentWeek: pool.currentWeek,
  };
}

/** Fri–Sun games for an NBA weekend office pool (ATS, Multiplier, Crazy 8s). */
export async function fetchNbaWeekendSlateGames(
  pool: typeof poolsTable.$inferSelect,
  weekNumber = pool.currentWeek,
): Promise<{ games: EspnGame[]; satDate: string; weekStart: string; weekEnd: string }> {
  const atsPool = toNbaAtsPool(pool);
  const { espnDates, days } = getNbaAtsSlateBoundsForPool(atsPool, weekNumber);
  const results = await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d)));
  const seen = new Set<string>();
  const games: EspnGame[] = [];
  for (const dayGames of results) {
    for (const game of dayGames) {
      if (!seen.has(game.id)) {
        seen.add(game.id);
        games.push(game);
      }
    }
  }
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const satDate = days[1] ?? days[0]!;
  return {
    games: selectableGames(games),
    satDate,
    weekStart: days[0]!,
    weekEnd: days.at(-1)!,
  };
}

/**
 * Do not send NBA weekend pick reminders before the pick sheet opens (Tue 6 AM ET)
 * once the Fri–Sun slate has scheduled games (lines/spreads not required for email).
 */
export async function nbaWeekendPickRemindersUnblocked(
  pool: typeof poolsTable.$inferSelect,
  now: Date,
): Promise<boolean> {
  if (!isNbaWeekendOfficePool(pool)) return true;
  if (pool.sandboxMode) return true;

  const atsPool = toNbaAtsPool(pool);
  if (isNbaAtsPool(pool) && isNbaAtsPreStart(atsPool, now)) return false;

  const picksOpenAt = getNbaAtsPicksOpenInstant(atsPool, now);
  if (now.getTime() < picksOpenAt.getTime()) return false;

  if (isFastBreakMultiplierPool(pool) || isNbaAtsPool(pool)) {
    const { games } = await fetchNbaWeekendSlateGames(pool);
    return games.length > 0;
  }

  return true;
}

export function firstWeekendKickoff(games: EspnGame[]): Date | null {
  const kickoffs = games
    .map((game) => new Date(game.date).getTime())
    .filter(Number.isFinite);
  if (kickoffs.length === 0) return null;
  return new Date(Math.min(...kickoffs));
}

function firstTipEtYmd(kickoff: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(kickoff);
}

/** NBA ATS + Fast Break Multiplier: 24h / final reminders before Saturday 6 PM ET lock. */
export function buildNbaWeekendSaturdayLockPickReminderResolution(
  pool: typeof poolsTable.$inferSelect,
  games: EspnGame[],
  weekStart: string,
  weekEnd: string,
  period: CrazyEightsPickemPeriod,
): {
  deadline: Date;
  periodKey: string;
  period: CrazyEightsPickemPeriod;
} | null {
  const atsPool = toNbaAtsPool(pool);
  const { days } = getNbaAtsSlateBoundsForPool(atsPool, pool.currentWeek);
  const saturdayEt = days[1] ?? days[0] ?? null;
  const lockAt = nbaSaturdaySixPmLockInstant(
    games.map((game) => game.date),
    saturdayEt,
  );
  if (!lockAt) return null;
  return {
    deadline: lockAt,
    periodKey: reminderPeriodKey({
      start: weekStart,
      end: weekEnd,
      season: pool.season,
      week: pool.currentWeek,
    }),
    period,
  };
}

/** NBA Crazy 8s + NHL Crazy 8s: email 3–5 hours before the slate's first puck/tip. */
export function buildWeekendFirstKickoffPickReminderResolution(
  pool: typeof poolsTable.$inferSelect,
  games: EspnGame[],
  weekStart: string,
  weekEnd: string,
  period: CrazyEightsPickemPeriod,
): {
  deadline: Date;
  periodKey: string;
  period: CrazyEightsPickemPeriod;
  weekendFirstKickoff: Date;
} | null {
  const firstKickoff = firstWeekendKickoff(games);
  if (!firstKickoff) return null;
  const baseKey = reminderPeriodKey({
    start: weekStart,
    end: weekEnd,
    season: pool.season,
    week: pool.currentWeek,
  });
  return {
    deadline: firstKickoff,
    periodKey: `${baseKey}|first-tip:${firstTipEtYmd(firstKickoff)}`,
    period,
    weekendFirstKickoff: firstKickoff,
  };
}

/** @deprecated Use buildWeekendFirstKickoffPickReminderResolution */
export const buildNbaWeekendPickReminderResolution = buildWeekendFirstKickoffPickReminderResolution;

export async function resolveNbaAtsReminderDeadline(
  pool: typeof poolsTable.$inferSelect,
): Promise<{
  deadline: Date;
  periodKey: string;
  period: CrazyEightsPickemPeriod;
} | null> {
  if (!isNbaAtsPool(pool)) return null;

  const { games, weekStart, weekEnd } = await fetchNbaWeekendSlateGames(pool);
  const gameIds = new Set(games.map((g) => g.id));
  return buildNbaWeekendSaturdayLockPickReminderResolution(pool, games, weekStart, weekEnd, {
    kind: "week",
    games,
    gameIds,
    confidenceRequired: false,
  });
}
