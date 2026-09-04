import { db, entriesTable, pickemPicksTable, pickRemindersTable, picksTable, pool as pgPool, poolsTable, usersTable } from "@workspace/db";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDailyPickDeadline, getMlbWeekBounds, getTodayEtDate, fetchGamesForDate, fetchNbaGamesByWeek, fetchNflGamesByWeek, fetchNhlGamesByWeek, NBA_SANDBOX_ANCHOR, NHL_SANDBOX_ANCHOR, type EspnGame } from "./espn";
import { sendPickReminderEmail } from "./mailer";
import { countSubmittedPickemGames, resolveNflGameIds, resolveNflSelectableGames, resolvePickemPeriod, type PickemPeriod } from "../routes/pick-status";
import { logger } from "./logger";
export { canStartReminderPass, incompleteEligibleUserIds, isReminderEligiblePool, reminderDeliveryState, reminderPeriodKey, reminderStageForDeadline, reminderTimingFromGames, shouldClaimReminder } from "./pick-reminder-windows";
import { canStartReminderPass, incompleteEligibleUserIds, isReminderEligiblePool, reminderDeliveryState, reminderPeriodKey, reminderStageForDeadline, reminderTimingFromGames } from "./pick-reminder-windows";

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season", "dirty_dozen"]);
const MINUTE = 60_000;
type ReminderLockClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Array<{ locked?: boolean }> }>;
  release: () => void;
};

function selectable(games: EspnGame[]) {
  return games.filter((game) => !game.isPostponed && game.status !== "suspended" && game.status !== "postponed");
}

async function gamesForPool(pool: typeof poolsTable.$inferSelect): Promise<EspnGame[]> {
  const today = getTodayEtDate();
  if (pool.poolType === "nfl_confidence" || pool.poolType === "nfl_confidence_weekly") {
    return fetchNflGamesByWeek(pool.currentWeek, pool.season, pool.isPreseason ? 1 : 2);
  }
  if (pool.pickFrequency === "daily") return fetchGamesForDate("mlb", today.replace(/-/g, ""));
  if (pool.sport === "nhl") return fetchNhlGamesByWeek(pool.sandboxMode ? NHL_SANDBOX_ANCHOR : pool.createdAt, pool.currentWeek);
  if (pool.sport === "nba") return fetchNbaGamesByWeek(pool.sandboxMode ? NBA_SANDBOX_ANCHOR : pool.createdAt, pool.currentWeek);
  if (pool.sport === "nfl") return fetchNflGamesByWeek(pool.currentWeek, pool.season, pool.isPreseason ? 1 : 2);
  const period = await resolvePickemPeriod(pool);
  if (!period) return [];
  const dates = period.kind === "date" ? [period.date] : period.kind === "range" ? dateRange(period.start, period.end) : [];
  return (await Promise.all(dates.map((date) => fetchGamesForDate(pool.sport, date.replace(/-/g, ""))))).flat();
}

function dateRange(start: string, end: string): string[] {
  const output: string[] = [];
  for (let current = new Date(`${start}T12:00:00Z`), finish = new Date(`${end}T12:00:00Z`); current <= finish; current = new Date(current.getTime() + 86_400_000)) output.push(current.toISOString().slice(0, 10));
  return output;
}

export type ReminderEligibilityContext = { period?: PickemPeriod; nflGameIds?: Set<string> };
export type ReminderResolution = { deadline: Date; periodKey: string; context: ReminderEligibilityContext };

async function incompleteUsers(pool: typeof poolsTable.$inferSelect, context: ReminderEligibilityContext = {}, onlyUserId?: number): Promise<Array<{ id: number; email: string }>> {
  const members = await db.select({ id: usersTable.id, email: usersTable.email, status: entriesTable.status, emailVerifiedAt: usersTable.emailVerifiedAt, remindersEnabled: usersTable.remindersEnabled })
    .from(entriesTable).innerJoin(usersTable, eq(usersTable.id, entriesTable.userId))
    .where(and(eq(entriesTable.poolId, pool.id), onlyUserId === undefined ? undefined : eq(usersTable.id, onlyUserId)));
  const memberById = new Map(members.map((member) => [member.id, member]));
  if (members.length === 0) return [];
  if (SURVIVOR_TYPES.has(pool.poolType)) {
    const rows = await db.select({ userId: picksTable.userId }).from(picksTable).where(and(eq(picksTable.poolId, pool.id), eq(picksTable.week, pool.currentWeek), pool.pickFrequency === "daily" ? eq(picksTable.pickDate, getTodayEtDate()) : undefined));
    const ids = incompleteEligibleUserIds(members.map((member) => ({ ...member, emailVerified: member.emailVerifiedAt !== null })), new Set(rows.map((row) => row.userId)), true);
    return ids.map((id) => ({ id, email: memberById.get(id)!.email }));
  }
  const period = pool.poolType === "nfl_confidence" || pool.poolType === "nfl_confidence_weekly" ? null : context.period ?? await resolvePickemPeriod(pool);
  const gameIds = period?.gameIds ?? context.nflGameIds ?? await resolveNflGameIds(pool);
  const condition = !period || period.kind === "week" ? eq(pickemPicksTable.week, pool.currentWeek)
    : period.kind === "date" ? eq(pickemPicksTable.gameDate, period.date)
    : and(gte(pickemPicksTable.gameDate, period.start), lte(pickemPicksTable.gameDate, period.end));
  const rows = await db.select({ userId: pickemPicksTable.userId, gameId: pickemPicksTable.gameId, confidencePoints: pickemPicksTable.confidencePoints })
    .from(pickemPicksTable).where(and(eq(pickemPicksTable.poolId, pool.id), condition));
  const submitted = countSubmittedPickemGames(
    rows,
    gameIds,
    pool.poolType === "nfl_confidence" || pool.poolType === "nfl_confidence_weekly",
  );
  const completed = new Set(members.filter((member) => (submitted.get(member.id) ?? 0) >= gameIds.size).map((member) => member.id));
  const ids = incompleteEligibleUserIds(members.map((member) => ({ ...member, emailVerified: member.emailVerifiedAt !== null })), completed, false);
  return ids.map((id) => ({ id, email: memberById.get(id)!.email }));
}

async function isStillEligible(pool: typeof poolsTable.$inferSelect, userId: number, context: ReminderEligibilityContext): Promise<boolean> {
  return (await incompleteUsers(pool, context, userId)).length > 0;
}

export async function resolveReminderDeadline(pool: typeof poolsTable.$inferSelect): Promise<ReminderResolution | null> {
  if (pool.poolType === "nfl_confidence" || pool.poolType === "nfl_confidence_weekly") {
    const games = await resolveNflSelectableGames(pool);
    const timing = reminderTimingFromGames({ kind: "confidence", season: pool.season, week: pool.currentWeek, games });
    return timing && { ...timing, context: { nflGameIds: new Set(games.map((game) => game.id)) } };
  }
  if (SURVIVOR_TYPES.has(pool.poolType)) {
    if (pool.pickFrequency === "daily") {
      const deadline = getDailyPickDeadline(await gamesForPool(pool));
      const timing = reminderTimingFromGames({ kind: "survivor", daily: true, week: pool.currentWeek, date: getTodayEtDate(), games: [], dailyDeadline: deadline });
      return timing && { ...timing, context: {} };
    }
    if (pool.sport === "mlb") {
      const bounds = getMlbWeekBounds(pool.createdAt, pool.currentWeek);
      return { deadline: bounds.deadline, periodKey: reminderPeriodKey({ start: bounds.days[0], end: bounds.days.at(-1), season: pool.season, week: pool.currentWeek }), context: {} };
    }
    const games = selectable(await gamesForPool(pool));
    const first = Math.min(...games.map((game) => new Date(game.date).getTime()));
    const timing = reminderTimingFromGames({ kind: "survivor", season: pool.season, week: pool.currentWeek, games });
    return timing && { ...timing, context: {} };
  }
  const period = await resolvePickemPeriod(pool);
  if (!period) return null;
  const weeklyDates = period.kind === "week"
    ? period.games.map((game) => game.date.slice(0, 10)).sort()
    : [];
  const timing = reminderTimingFromGames({ kind: "pickem", daily: period.kind === "date", date: period.kind === "date" ? period.date : undefined, start: period.kind === "range" ? period.start : weeklyDates[0], end: period.kind === "range" ? period.end : weeklyDates.at(-1), season: pool.season, week: pool.currentWeek, games: period.games });
  return timing && { ...timing, context: { period } };
}

let passRunning = false;
const REMINDER_ADVISORY_LOCK = 710_824_003;

export async function runPickReminders(options: { now?: Date; sender?: typeof sendPickReminderEmail; appUrl?: string; poolIds?: number[]; includeSandbox?: boolean; resolver?: (pool: typeof poolsTable.$inferSelect) => Promise<ReminderResolution | null> } = {}): Promise<{ claimed: number; sent: number; failed: number }> {
  if (!canStartReminderPass(passRunning, true)) {
    logger.info("Pick reminder pass skipped: already running in this process");
    return { claimed: 0, sent: 0, failed: 0 };
  }
  passRunning = true;
  let client: ReminderLockClient | null = null;
  try {
    client = await pgPool.connect() as unknown as ReminderLockClient;
    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [REMINDER_ADVISORY_LOCK]);
    if (!canStartReminderPass(false, lock.rows[0]?.locked === true)) {
      logger.info("Pick reminder pass skipped: another replica holds advisory lock");
      return { claimed: 0, sent: 0, failed: 0 };
    }
    return await runPickRemindersLocked(options);
  } finally {
    if (client) {
      await client.query("SELECT pg_advisory_unlock($1)", [REMINDER_ADVISORY_LOCK]).catch((err: unknown) => logger.error({ err }, "Pick reminder advisory unlock failed"));
      client.release();
    }
    passRunning = false;
  }
}

async function runPickRemindersLocked(options: { now?: Date; sender?: typeof sendPickReminderEmail; appUrl?: string; poolIds?: number[]; includeSandbox?: boolean; resolver?: (pool: typeof poolsTable.$inferSelect) => Promise<ReminderResolution | null> }): Promise<{ claimed: number; sent: number; failed: number }> {
  const now = options.now ?? new Date();
  const sender = options.sender ?? sendPickReminderEmail;
  const appUrl = (options.appUrl ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  let claimed = 0, sent = 0, failed = 0;
  if (options.poolIds && options.poolIds.length === 0) return { claimed, sent, failed };
  const pools = await db.select().from(poolsTable).where(and(eq(poolsTable.isActive, true), eq(poolsTable.isRecurring, true), options.poolIds ? inArray(poolsTable.id, options.poolIds) : undefined));
  for (const pool of pools) {
    // Sandbox schedules are historical and their UIs may bypass timing locks. Never
    // email them by default; only explicit development/test callers may opt in.
    if (!isReminderEligiblePool(pool, options.includeSandbox ?? false)) continue;
    try {
      const resolved = await (options.resolver ?? resolveReminderDeadline)(pool);
      if (!resolved) continue;
      const stage = reminderStageForDeadline(now, resolved.deadline);
      if (!stage) continue;
      for (const user of await incompleteUsers(pool, resolved.context)) {
        try {
          // Re-read immediately before claim: status/picks may have changed after initial resolution.
          if (!await isStillEligible(pool, user.id, resolved.context)) continue;
          const [claim] = await db.insert(pickRemindersTable).values({ userId: user.id, poolId: pool.id, periodKey: resolved.periodKey, reminderStage: stage }).onConflictDoNothing().returning({ id: pickRemindersTable.id });
          if (!claim) continue;
          claimed++;
          try {
            const providerMessageId = await sender(user.email, pool.name, `${appUrl}/pools/${pool.id}`, stage);
            await db.update(pickRemindersTable).set({ status: "sent", sentAt: now, providerMessageId }).where(eq(pickRemindersTable.id, claim.id));
            sent++;
          } catch (error) {
            const state = reminderDeliveryState(error);
            await db.update(pickRemindersTable).set(state).where(eq(pickRemindersTable.id, claim.id));
            failed++;
          }
        } catch (error) { logger.error({ err: error, poolId: pool.id }, "Pick reminder member processing failed"); }
      }
    } catch (error) { logger.error({ err: error, poolId: pool.id }, "Pick reminder pool processing failed"); }
  }
  return { claimed, sent, failed };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startPickReminderScheduler(): void {
  if (timer) return;
  const run = () => runPickReminders()
    .then((result) => logger.info(result, "Pick reminder pass complete"))
    .catch((err) => logger.error({ err }, "Pick reminder pass failed"));
  run();
  timer = setInterval(run, 5 * MINUTE);
}