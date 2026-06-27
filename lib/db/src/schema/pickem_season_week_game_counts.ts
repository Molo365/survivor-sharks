import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

export const pickemSeasonWeekGameCountsTable = pgTable(
  "pickem_season_week_game_counts",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    gameCount: integer("game_count").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("pickem_season_week_game_counts_uniq").on(t.poolId, t.week)],
);

export type PickemSeasonWeekGameCount = typeof pickemSeasonWeekGameCountsTable.$inferSelect;
