function offsetDateYmd(dateYmd: string, days: number): string {
  const value = new Date(`${dateYmd}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Calendar Friday of the Fri–Sun window that contains `todayEt` (ET YYYY-MM-DD). */
export function calendarNbaWeekendFriday(todayEt: string): string {
  const today = new Date(`${todayEt}T12:00:00Z`);
  const daysSinceFriday = (today.getUTCDay() + 2) % 7;
  const daysToFriday = daysSinceFriday <= 3 ? -daysSinceFriday : 7 - daysSinceFriday;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() + daysToFriday);
  return start.toISOString().slice(0, 10);
}

/**
 * First Fri–Sun weekend that has not fully ended in ET (Sunday still today or in the future).
 * On Monday after games, this is the upcoming Friday, not the weekend that just finished.
 */
export function upcomingNbaWeekendFriday(todayEt: string): string {
  let friday = calendarNbaWeekendFriday(todayEt);
  let sunday = offsetDateYmd(friday, 2);
  while (todayEt > sunday) {
    friday = offsetDateYmd(friday, 7);
    sunday = offsetDateYmd(friday, 2);
  }
  return friday;
}

function formatWeekendLabel(fridayYmd: string): string {
  const start = new Date(`${fridayYmd}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 2);
  const label = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  return `${label(start)}–${label(end)}`;
}

export type NbaWeekendCreateOption = { start: string; label: string };

/** `offsetWeekends`: 0 = upcoming actionable weekend, 1 = the following weekend. */
export function getNbaWeekendCreateOption(
  todayEt: string,
  offsetWeekends: number,
): NbaWeekendCreateOption {
  const friday = offsetDateYmd(upcomingNbaWeekendFriday(todayEt), offsetWeekends * 7);
  return { start: friday, label: formatWeekendLabel(friday) };
}

export function todayEtYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
