import {
  fetchGamesForDate,
  getNbaWeekendBounds,
  NBA_SANDBOX_ANCHOR,
  type EspnGame,
} from "./espn";
import { formatShortMonthDayEt } from "./nhl-survivor-slate";

const easternWeekday = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
});

const NBA_SURVIVOR_WEEKEND_DAYS = new Set(["Friday", "Saturday", "Sunday"]);

/** Keep only Fri/Sat/Sun games by Eastern calendar day. */
export function weekendGamesEt<T extends { date: string }>(games: T[]): T[] {
  return games.filter((game) => NBA_SURVIVOR_WEEKEND_DAYS.has(easternWeekday.format(new Date(game.date))));
}

/** Settlement slate for NBA survivor — weekend games only, with full-week fallback. */
export function nbaSurvivorSlateForSettlement<T extends { date: string }>(games: T[]): T[] {
  const weekend = weekendGamesEt(games);
  return weekend.length > 0 ? weekend : games;
}

/** Friday ET date for an NBA survivor pool week (first day of Fri–Sun slate). */
export function nbaSurvivorFridayDateEt(
  poolCreatedAt: Date,
  weekNumber: number,
  sandboxMode?: boolean,
): string {
  const anchor = sandboxMode ? NBA_SANDBOX_ANCHOR : poolCreatedAt;
  const { days } = getNbaWeekendBounds(anchor, weekNumber);
  return days[0]!;
}

/** User-facing period label — Fri–Sun range (e.g. Oct 24 – Oct 26). */
export function nbaSurvivorWeekLabel(
  poolCreatedAt: Date,
  weekNumber: number,
  sandboxMode?: boolean,
): string {
  const anchor = sandboxMode ? NBA_SANDBOX_ANCHOR : poolCreatedAt;
  return getNbaWeekendBounds(anchor, weekNumber).weekLabel;
}

/** Compact single-date label (Friday anchor) when a short label is needed. */
export function nbaSurvivorWeekShortLabel(
  poolCreatedAt: Date,
  weekNumber: number,
  sandboxMode?: boolean,
): string {
  return formatShortMonthDayEt(nbaSurvivorFridayDateEt(poolCreatedAt, weekNumber, sandboxMode));
}

export async function fetchNbaSurvivorGamesByWeek(
  poolCreatedAt: Date,
  weekNumber: number,
  seasonType = 2,
): Promise<EspnGame[]> {
  const { espnDates } = getNbaWeekendBounds(poolCreatedAt, weekNumber);
  const results = await Promise.all(espnDates.map((d) => fetchGamesForDate("nba", d, seasonType)));
  const seen = new Set<string>();
  const games: EspnGame[] = [];
  for (const dayGames of results) {
    for (const g of dayGames) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        games.push(g);
      }
    }
  }
  return games;
}
