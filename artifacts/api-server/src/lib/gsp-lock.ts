export type GspLockSource = "fallback" | "sandbox";

export interface GspLockState {
  lockAt: Date | null;
  locked: boolean;
  source: GspLockSource;
}

/**
 * FIFA World Cup 2026 Group Stage Predictor lock.
 *
 * Keep this as a per-season fallback map so a future ESPN-backed resolver can
 * replace the lookup without changing route consumers.
 */
export const GSP_LOCK_FALLBACKS: Readonly<Record<number, Date>> = {
  2026: new Date("2026-06-11T12:00:00.000Z"),
};

export function resolveGspLock(season: number, options: { now?: Date } = {}): GspLockState {
  const lockAt = GSP_LOCK_FALLBACKS[season] ?? GSP_LOCK_FALLBACKS[2026];
  const now = options.now ?? new Date();
  return {
    lockAt,
    locked: now.getTime() >= lockAt.getTime(),
    source: "fallback",
  };
}

/** Sandbox pools remain editable and never use the tournament deadline. */
export function getGspLockState(
  season: number,
  sandboxMode: boolean | null,
  options: { now?: Date } = {},
): GspLockState {
  if (sandboxMode) return { lockAt: null, locked: false, source: "sandbox" };
  return resolveGspLock(season, options);
}