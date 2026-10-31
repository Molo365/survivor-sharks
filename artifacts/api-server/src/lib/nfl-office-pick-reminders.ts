import type { poolsTable } from "@workspace/db";
import { fetchNflGamesByWeek, type EspnGame } from "./espn";
import {
  etWallClockToUtc,
  isNflOfficePool,
  primaryNflSundayEtDate,
} from "./nfl-slate-reveal";
import { reminderPeriodKey, reminderTimingFromGames } from "./pick-reminder-windows";

export type NflOfficeReminderContext = {
  nflWeekOpenReminder?: boolean;
  nflFirstGameId?: string;
  nflSundayOfficeLock?: boolean;
  nflGameIds?: Set<string>;
};

export type NflOfficeReminderResolution = {
  deadline: Date;
  periodKey: string;
  context: NflOfficeReminderContext;
};

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season", "dirty_dozen"]);
const PICKEM_NFL_TYPES = new Set(["pickem", "pickem_season", "nfl_confidence", "nfl_confidence_weekly"]);

const MINUTE = 60_000;

export function isNflOfficeWeeklyReminderPool(
  pool: { sport: string; poolType: string; sandboxMode?: boolean | null; pickFrequency?: string | null },
): boolean {
  if (pool.sandboxMode || pool.sport !== "nfl" || !isNflOfficePool(pool)) return false;
  if (pool.pickFrequency === "daily") return false;
  return SURVIVOR_TYPES.has(pool.poolType) || PICKEM_NFL_TYPES.has(pool.poolType);
}

function selectableGames(games: EspnGame[]): EspnGame[] {
  return games.filter(
    (game) => !game.isPostponed && game.status !== "suspended" && game.status !== "postponed",
  );
}

export async function fetchNflOfficeWeekGames(
  pool: typeof poolsTable.$inferSelect,
): Promise<EspnGame[]> {
  const seasonType = pool.isPreseason ? 1 : 2;
  return selectableGames(
    await fetchNflGamesByWeek(pool.currentWeek, pool.season, seasonType),
  );
}

function firstKickoffGame(games: EspnGame[]): EspnGame | null {
  if (games.length === 0) return null;
  return [...games].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id.localeCompare(b.id),
  )[0]!;
}

function officeWeekPeriodKey(pool: typeof poolsTable.$inferSelect, suffix: string): string {
  return `${reminderPeriodKey({ season: pool.season, week: pool.currentWeek })}|${suffix}`;
}

/** ~2 hours before primary Sunday 1:00 PM ET slate lock (uses 24h email stage). */
export function reminderStageBeforeNflSundayOfficeLock(now: Date, lockAt: Date): "24h" | null {
  const remaining = lockAt.getTime() - now.getTime();
  const twoHours = 2 * 60 * MINUTE;
  const slack = 5 * MINUTE;
  if (remaining >= twoHours && remaining <= twoHours + slack) return "24h";
  return null;
}

/** Week opens at the first kickoff (usually Thursday night). */
export async function resolveNflOfficeWeekOpenReminder(
  pool: typeof poolsTable.$inferSelect,
  now: Date = new Date(),
): Promise<NflOfficeReminderResolution | null> {
  if (!isNflOfficeWeeklyReminderPool(pool)) return null;

  const games = await fetchNflOfficeWeekGames(pool);
  const first = firstKickoffGame(games);
  if (!first) return null;

  const kickoffMs = new Date(first.date).getTime();
  if (!Number.isFinite(kickoffMs) || now.getTime() >= kickoffMs) return null;

  const survivor = SURVIVOR_TYPES.has(pool.poolType);
  const timing = reminderTimingFromGames({
    kind: survivor ? "survivor" : "pickem",
    season: pool.season,
    week: pool.currentWeek,
    games: [first],
  });
  if (!timing) return null;

  const gameIds = new Set(games.map((game) => game.id));
  const context: NflOfficeReminderContext = {
    nflWeekOpenReminder: true,
    nflFirstGameId: first.id,
    ...(survivor
      ? {}
      : {
          nflGameIds: gameIds,
        }),
  };

  return {
    deadline: timing.deadline,
    periodKey: officeWeekPeriodKey(pool, "nfl-week-open"),
    context,
  };
}

/** Office pools lock weekly picks at 1:00 PM ET on the primary Sunday. */
export async function resolveNflSundayOfficeLockReminder(
  pool: typeof poolsTable.$inferSelect,
  now: Date = new Date(),
): Promise<NflOfficeReminderResolution | null> {
  if (!isNflOfficeWeeklyReminderPool(pool)) return null;

  const games = await fetchNflOfficeWeekGames(pool);
  const slateIsos = games.map((game) => game.date);
  const sundayEt = primaryNflSundayEtDate(slateIsos);
  if (!sundayEt) return null;

  const lockAt = etWallClockToUtc(sundayEt, 13, 0);
  if (now.getTime() >= lockAt.getTime()) return null;

  const gameIds = new Set(games.map((game) => game.id));
  return {
    deadline: lockAt,
    periodKey: officeWeekPeriodKey(pool, "nfl-sunday-lock"),
    context: {
      nflSundayOfficeLock: true,
      nflGameIds: gameIds,
    },
  };
}
