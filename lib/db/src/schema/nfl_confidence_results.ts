import { pgTable, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

export const nflConfidenceResultsTable = pgTable(
  "nfl_confidence_results",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    actualPassingYards: integer("actual_passing_yards").notNull(),
    actualRushingYards: integer("actual_rushing_yards").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("ncr_pool_week_uniq").on(t.poolId, t.week)],
);

export type NflConfidenceResult = typeof nflConfidenceResultsTable.$inferSelect;
