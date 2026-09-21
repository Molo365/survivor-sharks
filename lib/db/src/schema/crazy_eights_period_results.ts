import { pgTable, serial, timestamp, integer, jsonb, text, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

export type CrazyEightsPeriodResultGroup = {
  position: number;
  userIds: number[];
  prize: number;
};

export const crazyEightsPeriodResultsTable = pgTable(
  "crazy_eights_period_results",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    groups: jsonb("groups").notNull().$type<CrazyEightsPeriodResultGroup[]>(),
    reason: text("reason").notNull(),
    resolvedAt: timestamp("resolved_at").notNull().defaultNow(),
  },
  (t) => [unique("crazy_eights_period_results_pool_week_uniq").on(t.poolId, t.week)],
);
