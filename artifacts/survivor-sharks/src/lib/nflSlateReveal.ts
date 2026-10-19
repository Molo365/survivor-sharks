/** Client mirror of api-server `nfl-slate-reveal` for PDF/export pick guards. */

function formatCalendarDateEt(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function etWallClockToUtc(
  calendarDateEt: string,
  hourEt: number,
  minuteEt: number,
  secondEt = 0,
): Date {
  const [year, month, day] = calendarDateEt.split("-").map(Number);
  const targetMs = Date.UTC(year!, month! - 1, day!, hourEt, minuteEt, secondEt);
  let instantMs = targetMs;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = formatter.formatToParts(new Date(instantMs));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((value) => value.type === type)!.value);
    const localMs = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    );
    const correction = targetMs - localMs;
    instantMs += correction;
    if (correction === 0) break;
  }
  return new Date(instantMs);
}

function dayOfWeekSundayEt(instant: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(instant);
  return weekday === "Sun";
}

export function primaryNflSundayEtDate(gameStartIsos: string[]): string | null {
  const sundayCounts = new Map<string, number>();
  for (const iso of gameStartIsos) {
    if (!iso) continue;
    const instant = new Date(iso);
    if (!dayOfWeekSundayEt(instant)) continue;
    const etDate = formatCalendarDateEt(instant);
    sundayCounts.set(etDate, (sundayCounts.get(etDate) ?? 0) + 1);
  }
  if (sundayCounts.size === 0) return null;
  return [...sundayCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

export function nflSundayOnePmRevealActive(
  gameStartIsos: string[],
  nowMs: number = Date.now(),
): boolean {
  const sunday = primaryNflSundayEtDate(gameStartIsos);
  if (!sunday) return false;
  return nowMs >= etWallClockToUtc(sunday, 13, 0).getTime();
}

export function isNflOfficePool(pool: { sport?: string; poolType?: string }): boolean {
  return pool.sport === "nfl" && pool.poolType !== "nfl_division_predictor";
}

export const NFL_OFFICE_CONFIDENCE_PREGAME_LOCK_MS = 5 * 60 * 1000;

export type NflOfficePoolSubmissionLockStyle = "five_minute" | "kickoff";

export function nflOfficePoolGameSubmissionLocked(opts: {
  pool: { sport?: string; poolType?: string; sandboxMode?: boolean | null };
  gameStartIso: string;
  slateGameStartIsos: string[];
  lockStyle: NflOfficePoolSubmissionLockStyle;
  nowMs?: number;
}): boolean {
  if (opts.pool.sandboxMode) return false;
  const now = opts.nowMs ?? Date.now();
  const kickoff = new Date(opts.gameStartIso).getTime();
  if (!Number.isFinite(kickoff)) return false;

  if (opts.lockStyle === "five_minute") {
    if (now >= kickoff - NFL_OFFICE_CONFIDENCE_PREGAME_LOCK_MS) return true;
  } else if (now >= kickoff) {
    return true;
  }

  if (!isNflOfficePool(opts.pool)) return false;
  if (kickoff <= now) return false;
  return nflSundayOnePmRevealActive(opts.slateGameStartIsos, now);
}

export function nflOfficePoolWeekSubmissionLocked(
  pool: { sport?: string; poolType?: string; sandboxMode?: boolean | null },
  slateGameStartIsos: string[],
  nowMs: number = Date.now(),
): boolean {
  if (pool.sandboxMode || !isNflOfficePool(pool)) return false;
  return nflSundayOnePmRevealActive(slateGameStartIsos, nowMs);
}
