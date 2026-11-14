import {
  db,
  entriesTable,
  multiplierLinesNotifyTable,
  pickRemindersTable,
  pickemPicksTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { MULTIPLIER_MAX_PICKS } from "./crazy-eights-multiplier-submit";
import { isFastBreakMultiplierPool } from "./fast-break-pool";
import { loadNbaMoneylines } from "./nba-ml-odds";
import { fetchNbaWeekendSlateGames, nbaWeekendPickRemindersUnblocked } from "./nba-weekend-pick-reminders";
import { sendMultiplierLinesReadyEmail } from "./mailer";
import { incompleteEligibleUserIds, isReminderEligiblePool, reminderDeliveryState } from "./pick-reminder-windows";
import { logger } from "./logger";
import {
  multiplierLinesNotifyPeriodKey,
  shouldNotifyMultiplierLinesBump,
} from "./nba-multiplier-lines-notify-policy";

export { multiplierLinesNotifyPeriodKey, shouldNotifyMultiplierLinesBump } from "./nba-multiplier-lines-notify-policy";

export async function runMultiplierLinesReadyNotifications(options: {
  now?: Date;
  appUrl?: string;
  poolIds?: number[];
  includeSandbox?: boolean;
  sender?: typeof sendMultiplierLinesReadyEmail;
} = {}): Promise<{ claimed: number; sent: number; failed: number; poolsBumped: number }> {
  const now = options.now ?? new Date();
  const appUrl = (options.appUrl ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const sender = options.sender ?? sendMultiplierLinesReadyEmail;
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let poolsBumped = 0;

  if (options.poolIds && options.poolIds.length === 0) {
    return { claimed, sent, failed, poolsBumped };
  }

  const pools = await db
    .select()
    .from(poolsTable)
    .where(and(
      eq(poolsTable.isActive, true),
      eq(poolsTable.poolType, "fast_break_multiplier"),
      options.poolIds ? inArray(poolsTable.id, options.poolIds) : undefined,
    ));

  for (const pool of pools) {
    if (!isReminderEligiblePool(pool, options.includeSandbox ?? false)) continue;
    if (!isFastBreakMultiplierPool(pool)) continue;
    try {
      if (!(await nbaWeekendPickRemindersUnblocked(pool, now))) continue;

      const { games } = await fetchNbaWeekendSlateGames(pool);
      if (games.length === 0) continue;

      const moneylines = await loadNbaMoneylines({
        poolId: pool.id,
        week: pool.currentWeek,
        sandboxMode: pool.sandboxMode ?? false,
        games: games.map((g) => ({
          id: g.id,
          homeTeamId: g.homeTeam.id,
          awayTeamId: g.awayTeam.id,
        })),
      });
      const linesCount = games.filter((g) => moneylines.has(g.id)).length;

      const [state] = await db
        .select({ lastNotifiedLinesCount: multiplierLinesNotifyTable.lastNotifiedLinesCount })
        .from(multiplierLinesNotifyTable)
        .where(and(
          eq(multiplierLinesNotifyTable.poolId, pool.id),
          eq(multiplierLinesNotifyTable.week, pool.currentWeek),
        ))
        .limit(1);
      const lastNotified = state?.lastNotifiedLinesCount ?? 0;
      if (!shouldNotifyMultiplierLinesBump(lastNotified, linesCount)) continue;

      const members = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          emailVerifiedAt: usersTable.emailVerifiedAt,
          remindersEnabled: usersTable.remindersEnabled,
          status: entriesTable.status,
        })
        .from(entriesTable)
        .innerJoin(usersTable, eq(usersTable.id, entriesTable.userId))
        .where(eq(entriesTable.poolId, pool.id));

      const pickRows = await db
        .select({ userId: pickemPicksTable.userId })
        .from(pickemPicksTable)
        .where(and(
          eq(pickemPicksTable.poolId, pool.id),
          eq(pickemPicksTable.week, pool.currentWeek),
        ));

      const pickCountByUser = new Map<number, number>();
      for (const row of pickRows) {
        pickCountByUser.set(row.userId, (pickCountByUser.get(row.userId) ?? 0) + 1);
      }

      const completed = new Set(
        members
          .filter((m) => (pickCountByUser.get(m.id) ?? 0) >= MULTIPLIER_MAX_PICKS)
          .map((m) => m.id),
      );
      const recipientIds = incompleteEligibleUserIds(
        members.map((m) => ({
          id: m.id,
          emailVerified: m.emailVerifiedAt !== null,
          remindersEnabled: m.remindersEnabled,
          status: m.status,
        })),
        completed,
        false,
      );
      if (recipientIds.length === 0) {
        await db
          .insert(multiplierLinesNotifyTable)
          .values({
            poolId: pool.id,
            week: pool.currentWeek,
            lastNotifiedLinesCount: linesCount,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [multiplierLinesNotifyTable.poolId, multiplierLinesNotifyTable.week],
            set: { lastNotifiedLinesCount: linesCount, updatedAt: now },
          });
        continue;
      }

      const memberById = new Map(members.map((m) => [m.id, m]));
      const periodKey = multiplierLinesNotifyPeriodKey(pool.currentWeek, linesCount);
      const picksUrl = `${appUrl}/pools/${pool.id}`;
      let poolSentAny = false;

      for (const userId of recipientIds) {
        const member = memberById.get(userId);
        if (!member) continue;
        const lockedCount = pickCountByUser.get(userId) ?? 0;
        try {
          const [claim] = await db
            .insert(pickRemindersTable)
            .values({
              userId,
              poolId: pool.id,
              periodKey,
              reminderStage: "24h",
            })
            .onConflictDoNothing()
            .returning({ id: pickRemindersTable.id });
          if (!claim) continue;
          claimed++;
          try {
            const providerMessageId = await sender(member.email, pool.name, picksUrl, {
              linesReadyCount: linesCount,
              slateGameCount: games.length,
              lockedCount,
              cardCap: MULTIPLIER_MAX_PICKS,
            });
            await db
              .update(pickRemindersTable)
              .set({ status: "sent", sentAt: now, providerMessageId })
              .where(eq(pickRemindersTable.id, claim.id));
            sent++;
            poolSentAny = true;
          } catch (error) {
            await db
              .update(pickRemindersTable)
              .set(reminderDeliveryState(error))
              .where(eq(pickRemindersTable.id, claim.id));
            failed++;
          }
        } catch (error) {
          logger.error({ err: error, poolId: pool.id, userId }, "Multiplier lines notify member failed");
        }
      }

      if (poolSentAny || recipientIds.length > 0) {
        await db
          .insert(multiplierLinesNotifyTable)
          .values({
            poolId: pool.id,
            week: pool.currentWeek,
            lastNotifiedLinesCount: linesCount,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [multiplierLinesNotifyTable.poolId, multiplierLinesNotifyTable.week],
            set: { lastNotifiedLinesCount: linesCount, updatedAt: now },
          });
        poolsBumped++;
      }
    } catch (error) {
      logger.error({ err: error, poolId: pool.id }, "Multiplier lines notify pool failed");
    }
  }

  return { claimed, sent, failed, poolsBumped };
}