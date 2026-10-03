import {
  fetchGamesForDateChecked,
  formatCalendarDateEt,
  getNbaWeekendBounds,
  type EspnGame,
} from "./espn";

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
  advanceWeekIfCurrent(
    pool: NbaAtsRolloverPool,
    expectedWeek: number,
    nextWeek: number,
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

/** Advance completed live NBA ATS weekends without closing or paying out the pool. */
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

      const nextWeek = pool.currentWeek + 1;
      const advanced = await store.advanceWeekIfCurrent(pool, pool.currentWeek, nextWeek);
      if (!advanced) {
        log(
          "info",
          { poolId: pool.id, currentWeek: pool.currentWeek },
          "NBA ATS recurring rollover: pool changed before compare-and-set, skipping",
        );
        continue;
      }

      log(
        "info",
        {
          poolId: pool.id,
          previousWeek: pool.currentWeek,
          nextWeek,
          days: bounds.days,
          gameCount: weekendGames.length,
        },
        "NBA ATS recurring rollover: advanced after the completed Fri–Sun slate",
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