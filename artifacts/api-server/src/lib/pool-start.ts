/**
 * Centralized, side-effect-free join/start policy. Route code supplies database
 * evidence and schedule providers, which keeps the policy deterministic in tests
 * and prevents invite previews from having subtly different rules than joins.
 */
export const SURVIVOR_POOL_TYPES = ["season", "weekly", "mid_season", "dirty_dozen"] as const;

export type PoolStartPool = {
  id: number;
  sport: string;
  poolType: string;
  currentWeek: number;
  startWeek: number | null;
  season: number;
  isPreseason: boolean;
  pickFrequency: "daily" | "weekly";
  sandboxMode: boolean;
  createdAt: Date;
};

export type StartGame = { date: string; hasStarted: boolean };
export type PoolStartDependencies = {
  now: () => Date;
  /** Returns null when the provider could not establish a slate. */
  gamesFor: (pool: PoolStartPool, kind: "nfl" | "week" | "daily" | "superleague") => Promise<StartGame[] | null>;
  /** Pool-scoped replay state, never a live-provider substitute for sandbox. */
  sandboxStarted: (pool: PoolStartPool) => Promise<boolean>;
  /** A persisted pick/result/progression proves a pool has begun during outages. */
  persistedStarted: (pool: PoolStartPool) => Promise<boolean>;
  /** Existing NDP lock resolver; null means no applicable NDP deadline. */
  ndpStarted?: (pool: PoolStartPool) => Promise<boolean | null>;
  mlbWeeklyDeadline?: (pool: PoolStartPool) => Date;
};

export type PoolStartState = {
  hasStarted: boolean;
  joinBlockedReason: "survivor_started" | null;
};

export function isSurvivorPoolType(poolType: string): boolean {
  return (SURVIVOR_POOL_TYPES as readonly string[]).includes(poolType);
}

export function joinBlockedByStart(poolType: string, hasStarted: boolean): boolean {
  return isSurvivorPoolType(poolType) && hasStarted;
}

/** Pending selections are editable pre-start and are never progression evidence. */
export function isFinalizedPickResult(result: string): boolean {
  return result !== "pending";
}

function gameHasStarted(games: StartGame[] | null, now: Date): boolean {
  return games?.some((game) => game.hasStarted || new Date(game.date).getTime() <= now.getTime()) ?? false;
}

/** Resolve informational start state for every pool type. Provider failure alone
 * never blocks a brand-new pool; persisted progression always wins. */
export async function resolvePoolStart(
  pool: PoolStartPool,
  deps: PoolStartDependencies,
): Promise<PoolStartState> {
  let hasStarted = await deps.persistedStarted(pool);

  if (!hasStarted && pool.sandboxMode) {
    hasStarted = await deps.sandboxStarted(pool);
  } else if (!hasStarted && pool.poolType === "nfl_division_predictor" && deps.ndpStarted) {
    hasStarted = (await deps.ndpStarted(pool)) ?? false;
  } else if (!hasStarted && pool.sport === "mlb" && pool.pickFrequency === "weekly" && deps.mlbWeeklyDeadline) {
    // Weekly MLB's authoritative lock is Monday 10PM ET. Daily pools are
    // intentionally not warned until a real game has actually started.
    hasStarted = deps.now().getTime() >= deps.mlbWeeklyDeadline(pool).getTime();
  } else if (!hasStarted) {
    const kind = pool.sport === "nfl"
      ? "nfl"
      : pool.sport === "superleague"
        ? "superleague"
        : pool.pickFrequency === "daily"
          ? "daily"
          : "week";
    try {
      hasStarted = gameHasStarted(await deps.gamesFor(pool, kind), deps.now());
    } catch {
      // A provider outage is unknown, not started. persistedStarted above is
      // deliberately checked first so it cannot reopen an already-progressed pool.
    }
  }

  return {
    hasStarted,
    joinBlockedReason: joinBlockedByStart(pool.poolType, hasStarted) ? "survivor_started" : null,
  };
}