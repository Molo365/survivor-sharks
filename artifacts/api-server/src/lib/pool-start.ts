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
  initialPeriodStart: string | null;
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
  /** Division-predictor lock resolver; null means no applicable deadline. */
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

export type WeeklyBonusPool = {
  poolType: string;
  sport?: string;
  pickFrequency?: string | null;
  isRecurring?: boolean | null;
};

export function isWeeklyBonusPoolType(pool: WeeklyBonusPool): boolean {
  if (pool.poolType === "pickem_season" || pool.poolType === "nfl_confidence") return true;
  return (
    pool.poolType === "pickem" &&
    pool.sport === "nhl" &&
    pool.pickFrequency === "weekly" &&
    pool.isRecurring === true
  );
}

export type WeeklyBonusThresholdInput = {
  poolType: string;
  sport?: string;
  pickFrequency?: string | null;
  isRecurring?: boolean | null;
  weeklyBonusEnabled: boolean;
  weeklyBonusMinPlayers: number | null;
  playerCount: number;
  isResolved: boolean;
  persistedThreshold: boolean | null;
};

/**
 * Uses current enrollment for open-week evaluation. Resolved historical weeks
 * use the legacy pool-wide decision so later enrollment cannot change old results.
 * This compatibility value is read-only; it is not a per-week snapshot.
 *
 * NHL recurring weekly pick-em pools re-check enrollment for each closed week.
 */
export function resolveWeeklyBonusThreshold(input: WeeklyBonusThresholdInput): boolean {
  const poolContext: WeeklyBonusPool = {
    poolType: input.poolType,
    sport: input.sport,
    pickFrequency: input.pickFrequency,
    isRecurring: input.isRecurring,
  };
  if (
    !input.weeklyBonusEnabled ||
    input.weeklyBonusMinPlayers === null ||
    !isWeeklyBonusPoolType(poolContext)
  ) {
    return false;
  }
  const recurringWeekly =
    poolContext.poolType === "pickem" && poolContext.sport === "nhl" && poolContext.isRecurring === true;
  if (input.isResolved && !recurringWeekly) return input.persistedThreshold === true;
  return input.playerCount >= input.weeklyBonusMinPlayers;
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
  } else if (
    !hasStarted
    && (pool.poolType === "nfl_division_predictor" || pool.poolType === "nhl_division_predictor")
    && deps.ndpStarted
  ) {
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