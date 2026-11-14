import { integer, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

/** Pool-week throttle for “more money lines posted” emails (Fast Break Multiplier). */
export const multiplierLinesNotifyTable = pgTable(
  "multiplier_lines_notify",
  {
    poolId: integer("pool_id")
      .notNull()
      .references(() => poolsTable.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    lastNotifiedLinesCount: integer("last_notified_lines_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.poolId, t.week] })],
);