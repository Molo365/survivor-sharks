import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

/** Commissioner-marked entry fees collected (recurring weekly pick-em). */
export const weeklyPickEmEntryPaidTable = pgTable(
  "weekly_pick_em_entry_paid",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id")
      .notNull()
      .references(() => poolsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weekly_pick_em_entry_paid_pool_user").on(t.poolId, t.userId)],
);

/** Commissioner-marked weekly period payouts sent (recurring weekly pick-em). */
export const weeklyPickEmPeriodPaidTable = pgTable(
  "weekly_pick_em_period_paid",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id")
      .notNull()
      .references(() => poolsTable.id, { onDelete: "cascade" }),
    periodKey: text("period_key").notNull(),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weekly_pick_em_period_paid_pool_period").on(t.poolId, t.periodKey)],
);
