import type { ChampionsLeaguePeriodContext } from "./champions-league-pool-period";

/** Keep the default pick-em view on the last matchday this long after its final day (ET). */
export const CHAMPIONS_LEAGUE_POST_MATCHDAY_GRACE_MS = 5 * 86_400_000;

function weekEndEtUtcMs(weekEnd: string): number {
  const [y, m, d] = weekEnd.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d! + 1, 4, 59, 59, 999);
}

/**
 * Default period for picks UI: linger on the last matchday for a few days after it ends
 * instead of jumping to the next UEFA cluster (often outside the 1-week visibility window).
 */
export function resolveChampionsLeagueDefaultPeriodKey(
  ctx: ChampionsLeaguePeriodContext,
  hasVisibleLiveSlate: boolean,
  now: Date,
): string | null {
  if (ctx.previous) {
    const graceEnds = weekEndEtUtcMs(ctx.previous.weekEnd) + CHAMPIONS_LEAGUE_POST_MATCHDAY_GRACE_MS;
    if (now.getTime() <= graceEnds) {
      return ctx.previous.weekStart;
    }
  }
  if (hasVisibleLiveSlate && ctx.current) {
    return ctx.current.weekStart;
  }
  if (ctx.previous) return ctx.previous.weekStart;
  if (ctx.current) return ctx.current.weekStart;
  return null;
}

/**
 * Whether pool members should be nudged to submit picks (My Picks, leaderboard dots).
 * Mirrors the default picks UI: no open slate, or still lingering on the previous matchday.
 */
export function isChampionsLeaguePoolPicksOpen(
  ctx: ChampionsLeaguePeriodContext,
  hasVisibleLiveSlate: boolean,
  now: Date,
): boolean {
  if (!hasVisibleLiveSlate || !ctx.current) return false;
  const defaultKey = resolveChampionsLeagueDefaultPeriodKey(ctx, hasVisibleLiveSlate, now);
  if (ctx.previous && defaultKey === ctx.previous.weekStart) return false;
  return true;
}
