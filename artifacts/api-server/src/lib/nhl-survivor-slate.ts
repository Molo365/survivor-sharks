import { getNhlWeekBounds, NHL_SANDBOX_ANCHOR } from "./espn";
import { nhlSaturdaySevenPmLockActive } from "./nhl-slate-reveal";

const easternWeekday = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
});

const shortMonthDayEt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});

/** ET calendar date (YYYY-MM-DD) → e.g. "Oct 24". */
export function formatShortMonthDayEt(dateStr: string): string {
  return shortMonthDayEt.format(new Date(`${dateStr}T12:00:00Z`));
}

/** Saturday ET date for an NHL survivor pool week (Sat/Sun bounds from getNhlWeekBounds). */
export function nhlSurvivorSaturdayDateEt(
  poolCreatedAt: Date,
  weekNumber: number,
  initialPeriodStart?: string | null,
  sandboxMode?: boolean,
): string {
  const anchor = sandboxMode ? NHL_SANDBOX_ANCHOR : poolCreatedAt;
  const initial = sandboxMode ? null : initialPeriodStart;
  const { days } = getNhlWeekBounds(anchor, weekNumber, initial);
  return days[0] ?? days[days.length - 1]!;
}

/** User-facing period label for NHL survivor — Saturday slate date only. */
export function nhlSurvivorWeekLabel(
  poolCreatedAt: Date,
  weekNumber: number,
  initialPeriodStart?: string | null,
  sandboxMode?: boolean,
): string {
  return formatShortMonthDayEt(
    nhlSurvivorSaturdayDateEt(poolCreatedAt, weekNumber, initialPeriodStart, sandboxMode),
  );
}

export function saturdayGamesEt<T extends { date: string }>(games: T[]): T[] {
  return games.filter((game) => easternWeekday.format(new Date(game.date)) === "Saturday");
}

export function nhlSurvivorSlateForSettlement<T extends { date: string }>(games: T[]): T[] {
  const saturdayGames = saturdayGamesEt(games);
  return saturdayGames.length > 0 ? saturdayGames : games;
}

export function isNhlSurvivorSeasonPool(pool: { sport: string; poolType: string }): boolean {
  return pool.sport === "nhl" && pool.poolType === "season";
}

/** Saturday 7 PM ET — same office lock as NHL weekly pick'em / Hit the Ice. */
export function nhlSurvivorSeasonWeekSubmissionLocked(
  pool: {
    createdAt: Date;
    initialPeriodStart?: string | null;
    sandboxMode?: boolean | null;
  },
  week: number,
  slateGames: { date: string }[],
  nowMs = Date.now(),
): boolean {
  if (pool.sandboxMode) return false;
  const saturdayEt = nhlSurvivorSaturdayDateEt(
    pool.createdAt,
    week,
    pool.initialPeriodStart,
    pool.sandboxMode,
  );
  const slateIsos = slateGames.map((g) => g.date);
  return nhlSaturdaySevenPmLockActive(slateIsos, nowMs, saturdayEt);
}

export function nhlSurvivorSeasonSlateRevealed(
  pool: {
    createdAt: Date;
    initialPeriodStart?: string | null;
    sandboxMode?: boolean | null;
  },
  week: number,
  slateGameStartIsos: string[],
  nowMs = Date.now(),
): boolean {
  if (pool.sandboxMode) return true;
  const saturdayEt = nhlSurvivorSaturdayDateEt(
    pool.createdAt,
    week,
    pool.initialPeriodStart,
    pool.sandboxMode,
  );
  return nhlSaturdaySevenPmLockActive(slateGameStartIsos, nowMs, saturdayEt);
}

/** Distinct game kickoff ISOs for one survivor week from the grid kickoff map. */
export function survivorGridSlateIsosForWeek(teamKickoffMap: Map<string, Date>, week: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const prefix = `${week}:`;
  for (const [key, kickoff] of teamKickoffMap) {
    if (!key.startsWith(prefix)) continue;
    const iso = kickoff.toISOString();
    if (!seen.has(iso)) {
      seen.add(iso);
      out.push(iso);
    }
  }
  return out;
}