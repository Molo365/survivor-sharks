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
import { loadNbaAtsSpreads } from "./nba-ats-spreads";
import { loadNbaMoneylines } from "./nba-ml-odds";
import {
  isNbaWeekendOfficePool,
  nbaSaturdaySixPmLockInstant,
} from "./nba-slate-reveal";
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
 * or before at least one line/spread exists for ATS / Multiplier pools.
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
    if (games.length === 0) return false;
    const gameMeta = games.map((g) => ({
      id: g.id,
      homeTeamId: g.homeTeam.id,
      awayTeamId: g.awayTeam.id,
    }));

    if (isFastBreakMultiplierPool(pool)) {
      const moneylines = await loadNbaMoneylines({
        poolId: pool.id,
        week: pool.currentWeek,
        games: gameMeta,
        sandboxMode: false,
      });
      return games.some((g) => moneylines.has(g.id));
    }

    const spreads = await loadNbaAtsSpreads({
      poolId: pool.id,
      week: pool.currentWeek,
      games: gameMeta,
    });
    return games.some((g) => spreads.has(g.id));
  }

  return true;
}

export async function resolveNbaAtsReminderDeadline(
  pool: typeof poolsTable.$inferSelect,
): Promise<{ deadline: Date; periodKey: string; period: CrazyEightsPickemPeriod } | null> {
  if (!isNbaAtsPool(pool)) return null;

  const { games, satDate, weekStart, weekEnd } = await fetchNbaWeekendSlateGames(pool);
  const deadline = nbaSaturdaySixPmLockInstant(
    games.map((game) => game.date),
    satDate,
  );
  if (!deadline) return null;

  const gameIds = new Set(games.map((g) => g.id));
  return {
    deadline,
    periodKey: reminderPeriodKey({
      start: weekStart,
      end: weekEnd,
      season: pool.season,
      week: pool.currentWeek,
    }),
    period: {
      kind: "week",
      games,
      gameIds,
      confidenceRequired: false,
    },
  };
}
