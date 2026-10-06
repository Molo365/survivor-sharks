import {
  fetchGamesForDateChecked,
  formatCalendarDateEt,
  getNbaWeekendBounds,
  type EspnGame,
} from "./espn";
import {
  computeNbaAtsWeeklyLeaderGroups,
  nbaAtsWeeklyPeriodReason,
} from "./nba-ats-weekly-groups";

export interface NbaAtsRolloverPool {
  id: number;
  sport: string;
  poolType: string;
  currentWeek: number;
  createdAt: Date;
  isRecurring: boolean;
  isActive: boolean;
  sandboxMode: boolean;
  pickFrequency?: string | null;
}

export interface NbaAtsRolloverStore {
  listPools(): Promise<NbaAtsRolloverPool[]>;
  countPendingPicks(poolId: number, week: number): Promise<number>;
  recordPeriodAndAdvance(
    pool: NbaAtsRolloverPool,
    groups: number[][],
    reason: string,
  ): Promise<boolean>;
}

type RolloverLogLevel = "info" | "warn" | "error";
type RolloverLogger = (
  level: RolloverLogLevel,
  context: Record<string, unknown>,
  message: string,
) => void;

export interface NbaAtsRolloverDependencies {
  store: NbaAtsRolloverStore;
  fetchChecked: typeof fetchGamesForDateChecked;
  now: Date;
  log: RolloverLogger;
}

function isEligiblePool(pool: NbaAtsRolloverPool): boolean {
  return pool.sport === "nba"
    && pool.poolType === "nba_ats"
    && pool.isRecurring
    && pool.isActive
    && !pool.sandboxMode
    && (pool.pickFrequency == null || pool.pickFrequency === "weekly");
}

function buildNbaAtsGameScoreMap(weekendGames: EspnGame[]): Map<string, number> {
  const gameScoreMap = new Map<string, number>();
  for (const game of weekendGames) {
    if (game.isCompleted && game.homeScore != null && game.awayScore != null) {
      gameScoreMap.set(game.id, Math.abs(game.homeScore - game.awayScore));
    }
  }
  return gameScoreMap;
}

/** Settle completed live NBA ATS weekends (period payout row) and advance currentWeek. */
export async function advanceRecurringNbaAtsPools({
  store,
  fetchChecked,
  now,
  log,
}: NbaAtsRolloverDependencies): Promise<void> {
  let pools: NbaAtsRolloverPool[];
  try {
    pools = await store.listPools();
  } catch (err) {
    log("error", { err }, "NBA ATS recurring rollover: failed to load pools");
    return;
  }

  const todayEt = formatCalendarDateEt(now);
  for (const pool of pools) {
    if (!isEligiblePool(pool)) {
      log(
        "info",
        { poolId: pool.id, sport: pool.sport, poolType: pool.poolType, currentWeek: pool.currentWeek },
        "NBA ATS recurring rollover: pool is outside the live weekly scope, skipping",
      );
      continue;
    }

    try {
      const bounds = getNbaWeekendBounds(pool.createdAt, pool.currentWeek);
      const sundayEt = bounds.days[bounds.days.length - 1]!;
      if (todayEt <= sundayEt) {
        log(
          "info",
          { poolId: pool.id, currentWeek: pool.currentWeek, sundayEt, todayEt },
          "NBA ATS recurring rollover: Sunday has not passed, skipping",
        );
        continue;
      }

      const pendingCount = await store.countPendingPicks(pool.id, pool.currentWeek);
      if (pendingCount > 0) {
        log(
          "info",
          { poolId: pool.id, currentWeek: pool.currentWeek, pendingCount },
          "NBA ATS recurring rollover: current-week picks are still pending, skipping",
        );
        continue;
      }

      const daySlates = await Promise.all(
        bounds.espnDates.map((date) => fetchChecked("nba", date, 2, true)),
      );
      const unavailableDates = bounds.espnDates.filter((_, index) => daySlates[index] === null);
      if (unavailableDates.length > 0) {
        log(
          "warn",
          { poolId: pool.id, currentWeek: pool.currentWeek, unavailableDates },
          "NBA ATS recurring rollover: one or more weekend schedules are unavailable, skipping",
        );
        continue;
      }

      const weekendDates = new Set(bounds.days);
      const weekendGames = (daySlates as EspnGame[][]).flat()
        .filter((game) => game.seasonType === 2
          && weekendDates.has(formatCalendarDateEt(new Date(game.date))));
      // ESPN also sets isPostponed for suspended games. Only a true postponed/
      // canceled status is terminal here; suspended games must still block rollover.
      const unfinishedGames = weekendGames.filter(
        (game) => !game.isCompleted && game.status !== "postponed",
      );
      if (unfinishedGames.length > 0) {
        log(
          "info",
          {
            poolId: pool.id,
            currentWeek: pool.currentWeek,
            unfinishedGameIds: unfinishedGames.map((game) => game.id),
          },
          "NBA ATS recurring rollover: unfinished weekend games remain, skipping",
        );
        continue;
      }

      const gameScoreMap = buildNbaAtsGameScoreMap(weekendGames);
      const { groups } = await computeNbaAtsWeeklyLeaderGroups(
        pool.id,
        pool.currentWeek,
        gameScoreMap,
      );
      const reason = nbaAtsWeeklyPeriodReason(groups);
      const settled = await store.recordPeriodAndAdvance(pool, groups, reason);
      if (!settled) {
        log(
          "info",
          { poolId: pool.id, currentWeek: pool.currentWeek, reason },
          "NBA ATS recurring settlement: period already recorded or pool changed, skipping",
        );
        continue;
      }

      log(
        "info",
        {
          poolId: pool.id,
          previousWeek: pool.currentWeek,
          nextWeek: pool.currentWeek + 1,
          days: bounds.days,
          gameCount: weekendGames.length,
          reason,
          placeGroups: groups.length,
        },
        "NBA ATS recurring settlement: recorded weekly payout and advanced after Fri–Sun slate",
      );
    } catch (err) {
      log(
        "error",
        { poolId: pool.id, currentWeek: pool.currentWeek, err },
        "NBA ATS recurring rollover: failed while checking or advancing pool",
      );
    }
  }
}