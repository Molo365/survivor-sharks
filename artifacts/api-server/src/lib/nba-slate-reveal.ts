import { etWallClockToUtc, primaryNflSundayEtDate } from "./nfl-slate-reveal";

/** NBA weekend office pools lock and reveal at 1:00 PM ET on the primary Sunday (Fri–Sun slate). */
export function isNbaWeekendOfficePool(pool: {
  sport: string;
  poolType: string;
}): boolean {
  if (pool.sport !== "nba") return false;
  if (pool.poolType === "nba_ats") return true;
  return pool.poolType === "crazy_8s";
}

export function nbaSundayOnePmLockInstant(
  gameStartIsos: string[],
  sundayEtFallback?: string | null,
): Date | null {
  const sunday = primaryNflSundayEtDate(gameStartIsos) ?? sundayEtFallback ?? null;
  if (!sunday) return null;
  return etWallClockToUtc(sunday, 13, 0);
}

export function nbaSundayOnePmLockActive(
  gameStartIsos: string[],
  nowMs: number = Date.now(),
  sundayEtFallback?: string | null,
): boolean {
  const lockAt = nbaSundayOnePmLockInstant(gameStartIsos, sundayEtFallback);
  if (!lockAt) return false;
  return nowMs >= lockAt.getTime();
}

const NBA_ATS_PREGAME_LOCK_MS = 5 * 60 * 1000;

/**
 * Pick submission for NBA ATS: locks at tip (5-minute pregame) or Sunday 1 PM for unstarted games.
 */
export function nbaWeekendPoolGameSubmissionLocked(opts: {
  pool: { sport: string; poolType: string; sandboxMode?: boolean | null };
  gameStartIso: string;
  slateGameStartIsos: string[];
  sundayEtFallback?: string | null;
  nowMs?: number;
}): boolean {
  if (opts.pool.sandboxMode) return false;
  if (!isNbaWeekendOfficePool(opts.pool) || opts.pool.poolType !== "nba_ats") {
    return false;
  }
  const now = opts.nowMs ?? Date.now();
  const kickoff = new Date(opts.gameStartIso).getTime();
  if (!Number.isFinite(kickoff)) return false;
  if (now >= kickoff - NBA_ATS_PREGAME_LOCK_MS) return true;
  return nbaSundayOnePmLockActive(
    opts.slateGameStartIsos,
    now,
    opts.sundayEtFallback,
  );
}

export function nbaWeekendPoolPeriodLocked(
  pool: { sport: string; poolType: string; sandboxMode?: boolean | null },
  slateGameStartIsos: string[],
  sundayEtFallback?: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (pool.sandboxMode || !isNbaWeekendOfficePool(pool)) return false;
  return nbaSundayOnePmLockActive(slateGameStartIsos, nowMs, sundayEtFallback);
}

export function nbaWeekendPoolOpponentPickRevealed(opts: {
  pool: { sport: string; poolType: string; sandboxMode?: boolean | null };
  isOwnPick: boolean;
  result: string | null | undefined;
  gameStartIso: string | null | undefined;
  slateGameStartIsos: string[];
  sundayEtFallback?: string | null;
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
  if (!isNbaWeekendOfficePool(opts.pool) || opts.pool.poolType !== "nba_ats") return false;
  return nbaSundayOnePmLockActive(
    opts.slateGameStartIsos,
    now,
    opts.sundayEtFallback,
  );
}

export function nbaWeekendPoolTiebreakerGuessRevealed(opts: {
  pool: { sport: string; poolType: string; sandboxMode?: boolean | null; isActive?: boolean };
  requesterUserId: number;
  rowUserId: number;
  slateGameStartIsos: string[];
  sundayEtFallback?: string | null;
  actualsKnown?: boolean;
  nowMs?: number;
}): boolean {
  if (opts.requesterUserId === opts.rowUserId) return true;
  if (opts.actualsKnown) return true;
  if (opts.pool.isActive === false) return true;
  if (opts.pool.sandboxMode) return true;
  if (!isNbaWeekendOfficePool(opts.pool)) return false;
  return nbaSundayOnePmLockActive(
    opts.slateGameStartIsos,
    opts.nowMs ?? Date.now(),
    opts.sundayEtFallback,
  );
}
