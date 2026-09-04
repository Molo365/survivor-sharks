import { pgTable, text, serial, timestamp, integer, pgEnum, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const reminderStageEnum = pgEnum("pick_reminder_stage", ["24h", "final"]);
export const reminderStatusEnum = pgEnum("pick_reminder_status", ["sent", "failed"]);

export const pickRemindersTable = pgTable(
  "pick_reminders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    periodKey: text("period_key").notNull(),
    reminderStage: reminderStageEnum("reminder_stage").notNull(),
    // Null means this worker has claimed the reminder and is attempting delivery.
    status: reminderStatusEnum("status"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("pick_reminders_user_pool_period_stage_uniq").on(t.userId, t.poolId, t.periodKey, t.reminderStage)],
);