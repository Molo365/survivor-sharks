import { getNhlWeekBounds, NHL_SANDBOX_ANCHOR } from "./espn";

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