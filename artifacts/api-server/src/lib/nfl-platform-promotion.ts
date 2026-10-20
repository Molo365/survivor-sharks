import type { EspnGame } from "./espn";
import {
  evaluateNflAutoAdvanceSlate,
  isCompleteNflSurvivorSlate,
} from "./nfl-auto-advance";
const NFL_TOTAL_WEEKS = 18;
const NFL_PRESEASON_TOTAL_WEEKS = 4;
import {
  getTuesdaySixAmOpensAfterPeriodEnd,
  isPlatformPromotionAllowedAfterPeriodEnd,
  periodLastDayEtFromGameStartIsos,
} from "./platform-period";

export type NflPlatformPromotionPool = {
  poolType: string;
  currentWeek: number;
  season: number | null;
  isPreseason: boolean;
};

export function nflWeekSlateReadyForPromotion(
  pool: NflPlatformPromotionPool,
  games: EspnGame[],
): boolean {
  const seasonType: 1 | 2 = pool.isPreseason ? 1 : 2;
  const terminalWeek = pool.isPreseason ? NFL_PRESEASON_TOTAL_WEEKS : NFL_TOTAL_WEEKS;
  const expectedSeason = pool.season ?? new Date().getFullYear();
  const expected = {
    expectedSeason,
    expectedSeasonType: seasonType,
    expectedWeek: pool.currentWeek,
  };

  if (pool.poolType === "season") {
    return pool.currentWeek < terminalWeek && isCompleteNflSurvivorSlate(games, expected);
  }
  if (pool.poolType === "pickem_season" || pool.poolType === "nfl_confidence" || pool.poolType === "nfl_confidence_weekly") {
    return evaluateNflAutoAdvanceSlate({
      games,
      currentWeek: pool.currentWeek,
      expectedSeason,
      expectedSeasonType: seasonType,
      terminalWeek,
    }).canAdvance;
  }
  return false;
}

export function nflPlatformNextPeriodOpensAt(
  pool: NflPlatformPromotionPool,
  games: EspnGame[],
  now = new Date(),
): string | null {
  if (!nflWeekSlateReadyForPromotion(pool, games)) return null;
  const periodLastDay = periodLastDayEtFromGameStartIsos(games.map((g) => g.date));
  if (!periodLastDay || isPlatformPromotionAllowedAfterPeriodEnd(periodLastDay, now)) return null;
  return getTuesdaySixAmOpensAfterPeriodEnd(periodLastDay).toISOString();
}

export function nflPlatformPromotionDeferred(
  pool: NflPlatformPromotionPool,
  games: EspnGame[],
  now = new Date(),
): boolean {
  return nflPlatformNextPeriodOpensAt(pool, games, now) != null;
}
