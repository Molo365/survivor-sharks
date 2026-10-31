import type { poolsTable } from "@workspace/db";
import { getNdpLockState } from "./ndp-lock";
import { getNhlNdpLockState } from "./nhl-ndp-lock";
import { NFL_DIVISIONS } from "./nfl-divisions";
import { NHL_DIVISIONS } from "./nhl-divisions";
import { reminderPeriodKey } from "./pick-reminder-windows";

export const DIVISION_PREDICTOR_POOL_TYPES = new Set([
  "nfl_division_predictor",
  "nhl_division_predictor",
]);

export function isDivisionPredictorPool(poolType: string): boolean {
  return DIVISION_PREDICTOR_POOL_TYPES.has(poolType);
}

export function requiredDivisionPickCount(poolType: string): number {
  if (poolType === "nfl_division_predictor") return NFL_DIVISIONS.length;
  if (poolType === "nhl_division_predictor") return NHL_DIVISIONS.length;
  return 0;
}

/** One reminder window before the season's first regular-season game (same instant as pick lock). */
export async function resolveDivisionPredictorReminderDeadline(
  pool: typeof poolsTable.$inferSelect,
  now: Date = new Date(),
): Promise<{ deadline: Date; periodKey: string } | null> {
  if (!isDivisionPredictorPool(pool.poolType)) return null;
  if (pool.sandboxMode) return null;

  const lock = pool.poolType === "nhl_division_predictor"
    ? await getNhlNdpLockState(pool.season, false, { now })
    : await getNdpLockState(pool.season, false, { now });

  if (!lock.lockAt || lock.locked) return null;

  return {
    deadline: lock.lockAt,
    periodKey: reminderPeriodKey({ season: pool.season, week: 1 }),
  };
}
