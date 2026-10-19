import { formatCalendarDateEt } from "./espn";
import { etWallClockToUtc } from "./nfl-slate-reveal";

/** NHL weekend office pools lock and reveal at 7:00 PM ET on the primary Saturday. */
export function isNhlWeekendOfficePool(pool: {
  sport: string;
  poolType: string;
  pickFrequency?: string | null;
}): boolean {
  if (pool.sport !== "nhl") return false;
  if (pool.poolType === "crazy_8s") return true;
  return pool.poolType === "pickem" && pool.pickFrequency === "weekly";
}

function dayOfWeekSaturdayEt(instant: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(instant);
  return weekday === "Sat";
}

/** Saturday (ET) with the most games in the slate; ties pick the earliest date. */
export function primaryNhlSaturdayEtDate(gameStartIsos: string[]): string | null {
  const saturdayCounts = new Map<string, number>();
  for (const iso of gameStartIsos) {
    if (!iso) continue;
    const instant = new Date(iso);
    if (!dayOfWeekSaturdayEt(instant)) continue;
    const etDate = formatCalendarDateEt(instant);
    saturdayCounts.set(etDate, (saturdayCounts.get(etDate) ?? 0) + 1);
  }
  if (saturdayCounts.size === 0) return null;
  return [...saturdayCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

/** Saturday ET date from pool week bounds (first day in getNhlWeekBounds.days). */
export function nhlSaturdayEtDateFromBounds(saturdayEtDate: string): string {
  return saturdayEtDate;
}

export function nhlSaturdaySevenPmLockInstant(
  gameStartIsos: string[],
  saturdayEtFallback?: string | null,
): Date | null {
  const saturday = primaryNhlSaturdayEtDate(gameStartIsos) ?? saturdayEtFallback ?? null;
  if (!saturday) return null;
  return etWallClockToUtc(saturday, 19, 0);
}

export function nhlSaturdaySevenPmLockActive(
  gameStartIsos: string[],
  nowMs: number = Date.now(),
  saturdayEtFallback?: string | null,
): boolean {
  const lockAt = nhlSaturdaySevenPmLockInstant(gameStartIsos, saturdayEtFallback);
  if (!lockAt) return false;
  return nowMs >= lockAt.getTime();
}

/**
 * Pick submission: game locks at puck drop, or at Saturday 7 PM for any game not yet started.
 */
export function nhlWeekendPoolGameSubmissionLocked(opts: {
  pool: { sport: string; poolType: string; pickFrequency?: string | null; sandboxMode?: boolean | null };
  gameStartIso: string;
  slateGameStartIsos: string[];
  saturdayEtFallback?: string | null;
  nowMs?: number;
}): boolean {
  if (opts.pool.sandboxMode) return false;
  if (!isNhlWeekendOfficePool(opts.pool) || opts.pool.poolType !== "pickem") {
    return false;
  }
  const now = opts.nowMs ?? Date.now();
  const kickoff = new Date(opts.gameStartIso).getTime();
  if (!Number.isFinite(kickoff)) return false;
  if (now >= kickoff) return true;
  return nhlSaturdaySevenPmLockActive(
    opts.slateGameStartIsos,
    now,
    opts.saturdayEtFallback,
  );
}

export function nhlWeekendPoolPeriodLocked(
  pool: { sport: string; poolType: string; pickFrequency?: string | null; sandboxMode?: boolean | null },
  slateGameStartIsos: string[],
  saturdayEtFallback?: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (pool.sandboxMode || !isNhlWeekendOfficePool(pool)) return false;
  return nhlSaturdaySevenPmLockActive(slateGameStartIsos, nowMs, saturdayEtFallback);
}

export function nhlWeekendPoolOpponentPickRevealed(opts: {
  pool: { sport: string; poolType: string; pickFrequency?: string | null; sandboxMode?: boolean | null };
  isOwnPick: boolean;
  result: string | null | undefined;
  gameStartIso: string | null | undefined;
  slateGameStartIsos: string[];
  saturdayEtFallback?: string | null;
  gameStarted?: boolean;
  nowMs?: number;
}): boolean {
  if (opts.isOwnPick) return true;
  if (opts.pool.sandboxMode) return opts.result != null && opts.result !== "pending";
  if (opts.result != null && opts.result !== "pending") return true;
  const now = opts.nowMs ?? Date.now();
  const started =
    opts.gameStarted ??
    (opts.gameStartIso != null && new Date(opts.gameStartIso).getTime() <= now);
  if (started) return true;
  if (!isNhlWeekendOfficePool(opts.pool) || opts.pool.poolType !== "pickem") return false;
  return nhlSaturdaySevenPmLockActive(
    opts.slateGameStartIsos,
    now,
    opts.saturdayEtFallback,
  );
}

export function nhlWeekendPoolTiebreakerGuessRevealed(opts: {
  pool: { sport: string; poolType: string; pickFrequency?: string | null; sandboxMode?: boolean | null; isActive?: boolean };
  requesterUserId: number;
  rowUserId: number;
  slateGameStartIsos: string[];
  saturdayEtFallback?: string | null;
  actualsKnown?: boolean;
  nowMs?: number;
}): boolean {
  if (opts.requesterUserId === opts.rowUserId) return true;
  if (opts.actualsKnown) return true;
  if (opts.pool.isActive === false) return true;
  if (opts.pool.sandboxMode) return true;
  if (!isNhlWeekendOfficePool(opts.pool) || opts.pool.poolType !== "pickem") return false;
  return nhlSaturdaySevenPmLockActive(
    opts.slateGameStartIsos,
    opts.nowMs ?? Date.now(),
    opts.saturdayEtFallback,
  );
}
