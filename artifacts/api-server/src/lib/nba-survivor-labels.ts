import { getNbaWeekBounds, NBA_SANDBOX_ANCHOR } from "./espn";
import { formatShortMonthDayEt } from "./nhl-survivor-slate";

/** Monday ET (week start) for an NBA survivor pool week. */
export function nbaSurvivorWeekStartDateEt(
  poolCreatedAt: Date,
  weekNumber: number,
  sandboxMode?: boolean,
): string {
  const anchor = sandboxMode ? NBA_SANDBOX_ANCHOR : poolCreatedAt;
  const { days } = getNbaWeekBounds(anchor, weekNumber);
  return days[0]!;
}

/** User-facing period label — Monday of the Mon–Sun scoring week (e.g. Oct 22). */
export function nbaSurvivorWeekLabel(
  poolCreatedAt: Date,
  weekNumber: number,
  sandboxMode?: boolean,
): string {
  return formatShortMonthDayEt(nbaSurvivorWeekStartDateEt(poolCreatedAt, weekNumber, sandboxMode));
}
