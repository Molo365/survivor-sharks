const MINUTE = 60_000;

/** The non-overlapping delivery window for a pick deadline. */
export function reminderStageForDeadline(now: Date, deadline: Date): "24h" | "final" | null {
  const remaining = deadline.getTime() - now.getTime();
  if (remaining > 3 * 60 * MINUTE && remaining <= 24 * 60 * MINUTE) return "24h";
  if (remaining >= 2 * 60 * MINUTE && remaining <= 3 * 60 * MINUTE) return "final";
  return null;
}

export function reminderPeriodKey(input: { daily?: boolean; date?: string; start?: string; end?: string; season?: number; week: number }): string {
  if (input.daily && input.date) return input.date;
  if (input.start && input.end) return `${input.start}/${input.end}`;
  return `${input.season ?? "calendar"}-week-${input.week}`;
}

export function nextUnpickedGameReminderTiming(input: {
  games: Array<{ id: string; date: string }>;
  submittedGameIds: Set<string>;
  now: Date;
  lockOffsetMs: number;
  basePeriodKey: string;
}): { deadline: Date; periodKey: string } | null {
  const scheduled = input.games
    .map((game) => ({
      id: game.id,
      deadlineMs: new Date(game.date).getTime() - input.lockOffsetMs,
    }))
    .filter((game) => Number.isFinite(game.deadlineMs));

  const next = scheduled
    .filter((game) => game.deadlineMs > input.now.getTime() && !input.submittedGameIds.has(game.id))
    .sort((a, b) => a.deadlineMs - b.deadlineMs || a.id.localeCompare(b.id))[0];
  if (!next) return null;

  const kickoffDate = new Date(next.deadlineMs + input.lockOffsetMs);
  const etDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(kickoffDate);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    etDateParts.find((item) => item.type === type)?.value;
  const pickDate = `${part("year")}-${part("month")}-${part("day")}`;

  return {
    deadline: new Date(next.deadlineMs),
    // One reminder per pick-day/stage prevents same-day schedule changes or
    // partial picks from producing duplicate claims, while Thursday and Sunday
    // can still have independent reminder cycles in the same weekly period.
    periodKey: `${input.basePeriodKey}|pick-date:${pickDate}`,
  };
}

export function isReminderEligiblePool(
  pool: { isActive: boolean; isRecurring: boolean; sandboxMode?: boolean; poolType: string },
  includeSandbox = false,
): boolean {
  return pool.isActive && pool.isRecurring && (includeSandbox || !pool.sandboxMode) && new Set([
    "pickem", "pickem_season", "nba_ats", "season", "weekly", "mid_season", "dirty_dozen", "nfl_confidence", "nfl_confidence_weekly",
  ]).has(pool.poolType);
}

export function incompleteEligibleUserIds(
  members: Array<{ id: number; emailVerified: boolean; remindersEnabled: boolean; status: string }>,
  completed: Set<number>,
  survivor: boolean,
): number[] {
  return members.filter((member) => member.emailVerified && member.remindersEnabled && (!survivor || member.status === "alive") && !completed.has(member.id)).map((member) => member.id);
}

/** Existing claimed/sent/failed rows are terminal and must never be retried. */
export function shouldClaimReminder(existing: boolean): boolean {
  return !existing;
}

export function reminderDeliveryState(error?: unknown): { status: "sent" | "failed"; lastError: string | null } {
  return error === undefined
    ? { status: "sent", lastError: null }
    : { status: "failed", lastError: error instanceof Error ? error.message : String(error) };
}

export function canStartReminderPass(running: boolean, advisoryLockAcquired: boolean): boolean {
  return !running && advisoryLockAcquired;
}

export function reminderTimingFromGames(input: {
  kind: "pickem" | "survivor" | "confidence";
  daily?: boolean;
  season?: number;
  week: number;
  games: Array<{ date: string }>;
  date?: string;
  start?: string;
  end?: string;
  dailyDeadline?: Date | null;
}): { deadline: Date; periodKey: string } | null {
  const first = Math.min(...input.games.map((game) => new Date(game.date).getTime()).filter(Number.isFinite));
  const deadline = input.daily ? input.dailyDeadline ?? null : Number.isFinite(first)
    ? new Date(first - (input.kind === "pickem" ? 5 * 60_000 : 0))
    : null;
  if (!deadline) return null;
  return { deadline, periodKey: reminderPeriodKey({ daily: input.daily, date: input.date, start: input.start, end: input.end, season: input.season, week: input.week }) };
}