import { formatCalendarDateEt } from "./espn";

/** NFL office pools reveal the full weekly slate at 1:00 PM ET on the primary Sunday. */
export function isNflOfficePool(pool: { sport: string; poolType: string }): boolean {
  return pool.sport === "nfl" && pool.poolType !== "nfl_division_predictor";
}

/** Convert an ET calendar date (YYYY-MM-DD) and wall-clock time to a UTC instant. */
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

/** Sunday (ET) with the most games in the slate; ties pick the earliest date. */
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
  const revealAt = etWallClockToUtc(sunday, 13, 0).getTime();
  return nowMs >= revealAt;
}

export function nflOfficePoolOpponentPickRevealed(opts: {
  pool: { sport: string; poolType: string; sandboxMode?: boolean | null };
  isOwnPick: boolean;
  result: string | null | undefined;
  gameStartIso: string | null | undefined;
  slateGameStartIsos: string[];
  gameStarted?: boolean;
  nowMs?: number;
}): boolean {
  if (opts.isOwnPick) return true;
  if (opts.pool.sandboxMode) return opts.result != null && opts.result !== "pending";
  if (opts.result != null && opts.result !== "pending") return true;
  const started =
    opts.gameStarted ??
    (opts.gameStartIso != null && new Date(opts.gameStartIso).getTime() <= (opts.nowMs ?? Date.now()));
  if (started) return true;
  if (!isNflOfficePool(opts.pool) || opts.pool.sandboxMode) return false;
  return nflSundayOnePmRevealActive(opts.slateGameStartIsos, opts.nowMs);
}

/** Full-slate visibility gate used by confidence / pickem-season grids. */
export function isNflOfficeSlateLive(opts: {
  pool: { sport: string; poolType: string; sandboxMode?: boolean | null };
  games: Array<{ startTime: string; status?: string | null }>;
  nowMs?: number;
}): boolean {
  const now = opts.nowMs ?? Date.now();
  if (opts.games.length === 0) return true;
  const anyLive = opts.games.some(
    (g) =>
      new Date(g.startTime).getTime() <= now ||
      (g.status != null && g.status !== "scheduled" && g.status !== "pre"),
  );
  if (anyLive) return true;
  if (!isNflOfficePool(opts.pool) || opts.pool.sandboxMode) return false;
  return nflSundayOnePmRevealActive(opts.games.map((g) => g.startTime), now);
}

export function nflSundayOnePmRevealActiveForSurvivorWeek(
  teamKickoffMap: Map<string, Date>,
  week: number,
  nowMs: number = Date.now(),
): boolean {
  const prefix = `${week}:`;
  const starts: string[] = [];
  for (const [key, kickoff] of teamKickoffMap) {
    if (key.startsWith(prefix)) starts.push(kickoff.toISOString());
  }
  return nflSundayOnePmRevealActive(starts, nowMs);
}
