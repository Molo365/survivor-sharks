import { db, entriesTable, picksTable, poolsTable, weekResultsTable } from "@workspace/db";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { isPlatformPromotionAllowedAfterPeriodEnd } from "./platform-period";
import {
  calendarSurvivorNextPeriodOpensAt,
  calendarSurvivorPeriodLastDayEt,
  isCalendarSurvivorSeasonPool,
  isCalendarSurvivorSoloWinnerDeclarationAllowed,
  shouldReconcilePrematureCalendarSurvivorWeek,
  type CalendarSurvivorPeriodPool,
} from "./calendar-survivor-period";
import { resolveSuperLeagueSettlementBounds } from "./survivor-week-settlement";

export type CalendarSurvivorPlatformPool = CalendarSurvivorPeriodPool & {
  id: number;
  currentWeek: number;
};

export {
  calendarSurvivorNextPeriodOpensAt,
  calendarSurvivorPeriodLastDayEt,
  isCalendarSurvivorSeasonPool,
};

async function superLeaguePeriodLastDayEt(
  poolId: number,
  week: number,
): Promise<string | null> {
  const pickRows = await db
    .select({ pickDate: picksTable.pickDate })
    .from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));
  const bounds = resolveSuperLeagueSettlementBounds(pickRows.map((row) => row.pickDate));
  return bounds?.weekEnd ?? null;
}

export async function resolveCalendarSurvivorPeriodLastDayEt(
  pool: CalendarSurvivorPlatformPool,
  week: number,
): Promise<string | null> {
  if (!isCalendarSurvivorSeasonPool(pool)) return null;
  if (pool.sport === "superleague") {
    return superLeaguePeriodLastDayEt(pool.id, week);
  }
  return calendarSurvivorPeriodLastDayEt(pool, week);
}

export async function calendarSurvivorPlatformPromotionDeferred(
  pool: CalendarSurvivorPlatformPool,
  now = new Date(),
): Promise<boolean> {
  if (!isCalendarSurvivorSeasonPool(pool)) return false;
  const [finalized] = await db
    .select({ id: weekResultsTable.id })
    .from(weekResultsTable)
    .where(and(
      eq(weekResultsTable.poolId, pool.id),
      eq(weekResultsTable.week, pool.currentWeek),
    ))
    .limit(1);
  if (!finalized) return false;
  const periodLastDay = await resolveCalendarSurvivorPeriodLastDayEt(pool, pool.currentWeek);
  if (!periodLastDay) return false;
  return calendarSurvivorNextPeriodOpensAt(periodLastDay, now) != null;
}

/** NHL / NBA survivor: block emails until the next pick sheet opens (Tue 6 AM ET). */
/** True while a solo survivor waits until the day after the clinching slate. */
export async function shouldDeferCalendarSurvivorSoloWinnerClose(
  pool: CalendarSurvivorPlatformPool,
  now = new Date(),
): Promise<boolean> {
  if (!isCalendarSurvivorSeasonPool(pool)) return false;
  const [latest] = await db
    .select({ week: weekResultsTable.week })
    .from(weekResultsTable)
    .where(eq(weekResultsTable.poolId, pool.id))
    .orderBy(desc(weekResultsTable.week))
    .limit(1);
  if (!latest) return false;
  const periodLastDay = await resolveCalendarSurvivorPeriodLastDayEt(pool, latest.week);
  if (!periodLastDay) return false;
  return !isCalendarSurvivorSoloWinnerDeclarationAllowed(periodLastDay, now);
}

export async function calendarSurvivorPickRemindersUnblocked(
  pool: typeof poolsTable.$inferSelect,
  now: Date,
): Promise<boolean> {
  if (!isCalendarSurvivorSeasonPool(pool)) return true;
  return !(await calendarSurvivorPlatformPromotionDeferred(
    {
      id: pool.id,
      sport: pool.sport,
      poolType: pool.poolType,
      currentWeek: pool.currentWeek,
      createdAt: pool.createdAt,
      initialPeriodStart: pool.initialPeriodStart,
      sandboxMode: pool.sandboxMode,
    },
    now,
  ));
}

/**
 * Corrects pools the legacy scheduler advanced before Tue 6 AM ET (no picks on the
 * jumped week yet).
 */
export async function reconcilePrematureCalendarSurvivorWeeks(now = new Date()): Promise<number> {
  const pools = await db.select().from(poolsTable).where(and(
    eq(poolsTable.poolType, "season"),
    eq(poolsTable.isActive, true),
    eq(poolsTable.sandboxMode, false),
    inArray(poolsTable.sport, ["nhl", "nba", "superleague"]),
  ));
  let reconciled = 0;
  for (const pool of pools) {
    const currentWeek = pool.currentWeek;
    if (currentWeek <= 1) continue;
    const previousWeek = currentWeek - 1;
    const platformPool: CalendarSurvivorPlatformPool = {
      id: pool.id,
      sport: pool.sport,
      poolType: pool.poolType,
      currentWeek,
      createdAt: pool.createdAt,
      initialPeriodStart: pool.initialPeriodStart,
      sandboxMode: pool.sandboxMode,
    };
    const [prevFinalized, curFinalized, curPick] = await Promise.all([
      db.select({ id: weekResultsTable.id }).from(weekResultsTable).where(and(
        eq(weekResultsTable.poolId, pool.id),
        eq(weekResultsTable.week, previousWeek),
      )).limit(1),
      db.select({ id: weekResultsTable.id }).from(weekResultsTable).where(and(
        eq(weekResultsTable.poolId, pool.id),
        eq(weekResultsTable.week, currentWeek),
      )).limit(1),
      db.select({ id: picksTable.id }).from(picksTable).where(and(
        eq(picksTable.poolId, pool.id),
        eq(picksTable.week, currentWeek),
      )).limit(1),
    ]);
    const periodLastDay = await resolveCalendarSurvivorPeriodLastDayEt(platformPool, previousWeek);
    if (!periodLastDay) continue;
    if (!shouldReconcilePrematureCalendarSurvivorWeek({
      currentWeek,
      previousWeekFinalized: prevFinalized.length > 0,
      currentWeekFinalized: curFinalized.length > 0,
      currentWeekHasAnyPicks: curPick.length > 0,
      promotionAllowedForPreviousPeriod: isPlatformPromotionAllowedAfterPeriodEnd(periodLastDay, now),
    })) continue;
    const updated = await db
      .update(poolsTable)
      .set({ currentWeek: previousWeek })
      .where(and(
        eq(poolsTable.id, pool.id),
        eq(poolsTable.currentWeek, currentWeek),
        eq(poolsTable.sport, pool.sport),
        eq(poolsTable.poolType, "season"),
        eq(poolsTable.isActive, true),
        eq(poolsTable.sandboxMode, false),
      ))
      .returning({ currentWeek: poolsTable.currentWeek });
    if (updated.length > 0) {
      reconciled++;
      logger.info(
        {
          poolId: pool.id,
          sport: pool.sport,
          rolledBackFrom: currentWeek,
          currentWeek: updated[0].currentWeek,
        },
        "Calendar Survivor: rolled back premature week advance (awaiting Tuesday 6:00 AM ET)",
      );
    }
  }
  return reconciled;
}

/**
 * Bumps currentWeek after a finalized slate once Tue 6 AM ET has passed
 * (NHL / NBA / Super League season survivor — same rhythm as NFL promotion).
 */
export async function advanceReadyCalendarSurvivorPeriods(now = new Date()): Promise<number> {
  const pools = await db.select().from(poolsTable).where(and(
    eq(poolsTable.poolType, "season"),
    eq(poolsTable.isActive, true),
    eq(poolsTable.sandboxMode, false),
    inArray(poolsTable.sport, ["nhl", "nba", "superleague"]),
  ));
  let advanced = 0;
  for (const pool of pools) {
    const settledWeek = pool.currentWeek;
    const [aliveCount] = await db
      .select({ n: count() })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.status, "alive")));
    if (Number(aliveCount?.n ?? 0) <= 1) continue;
    const [finalized] = await db
      .select({ id: weekResultsTable.id })
      .from(weekResultsTable)
      .where(and(
        eq(weekResultsTable.poolId, pool.id),
        eq(weekResultsTable.week, settledWeek),
      ))
      .limit(1);
    if (!finalized) continue;
    const periodLastDay = await resolveCalendarSurvivorPeriodLastDayEt(
      {
        id: pool.id,
        sport: pool.sport,
        poolType: pool.poolType,
        currentWeek: settledWeek,
        createdAt: pool.createdAt,
        initialPeriodStart: pool.initialPeriodStart,
        sandboxMode: pool.sandboxMode,
      },
      settledWeek,
    );
    if (!periodLastDay) continue;
    if (!isPlatformPromotionAllowedAfterPeriodEnd(periodLastDay, now)) {
      logger.info(
        {
          poolId: pool.id,
          sport: pool.sport,
          settledWeek,
          periodLastDay,
        },
        "Calendar Survivor: next period opens Tuesday 6:00 AM ET, skipping advancement",
      );
      continue;
    }
    const updated = await db
      .update(poolsTable)
      .set({ currentWeek: settledWeek + 1 })
      .where(and(
        eq(poolsTable.id, pool.id),
        eq(poolsTable.currentWeek, settledWeek),
        eq(poolsTable.sport, pool.sport),
        eq(poolsTable.poolType, "season"),
        eq(poolsTable.isActive, true),
        eq(poolsTable.sandboxMode, false),
      ))
      .returning({ currentWeek: poolsTable.currentWeek });
    if (updated.length > 0) {
      advanced++;
      logger.info(
        {
          poolId: pool.id,
          sport: pool.sport,
          previousWeek: settledWeek,
          nextWeek: updated[0].currentWeek,
        },
        "Live Survivor settled period advanced",
      );
    }
  }
  return advanced;
}