import { GSP_GROUP_COUNT } from "./gsp-lock";
import { getGspLockState } from "./gsp-lock";
import { MLB_BRACKET_SLOTS } from "./mlb-bracket";
import { resolveMlbBracketLockAt } from "./mlb-bracket-lock";
import { reminderPeriodKey } from "./pick-reminder-windows";

type OneShotReminderPool = {
  id: number;
  poolType: string;
  season: number;
  sandboxMode: boolean | null;
  currentWeek: number;
};

export const ONE_SHOT_POOL_REMINDER_TYPES = new Set([
  "group_stage_predictor",
  "wc_bracket",
  "mlb_bracket",
]);

export function isOneShotPoolReminderType(poolType: string): boolean {
  return ONE_SHOT_POOL_REMINDER_TYPES.has(poolType);
}

export function requiredOneShotPickCount(poolType: string, wcBracketRoundGames = 0): number {
  if (poolType === "group_stage_predictor") return GSP_GROUP_COUNT;
  if (poolType === "mlb_bracket") return MLB_BRACKET_SLOTS.length;
  if (poolType === "wc_bracket") return wcBracketRoundGames;
  return 0;
}

export async function resolveOneShotPoolReminderDeadline(
  pool: OneShotReminderPool,
  now: Date = new Date(),
): Promise<{ deadline: Date; periodKey: string; wcRoundEventIds?: string[] } | null> {
  if (!isOneShotPoolReminderType(pool.poolType) || pool.sandboxMode) return null;

  if (pool.poolType === "group_stage_predictor") {
    const lock = getGspLockState(pool.season, pool.sandboxMode, { now });
    if (!lock.lockAt || lock.locked) return null;
    return {
      deadline: lock.lockAt,
      periodKey: reminderPeriodKey({ season: pool.season, week: 1 }),
    };
  }

  if (pool.poolType === "mlb_bracket") {
    const lockAt = await resolveMlbBracketLockAt(pool.season);
    if (!lockAt) return null;
    return {
      deadline: lockAt,
      periodKey: `${pool.season}-mlb-bracket-pre-wild-card`,
    };
  }

  if (pool.poolType === "wc_bracket") {
    const { resolveWcBracketOpenRound } = await import("./bracketRound");
    const openRound = await resolveWcBracketOpenRound(pool.id, now);
    if (!openRound || openRound.status !== "open") return null;
    return {
      deadline: openRound.firstKickoff,
      periodKey: `${pool.season}-wc-bracket-${openRound.round}`,
      wcRoundEventIds: openRound.eventIds,
    };
  }

  return null;
}
