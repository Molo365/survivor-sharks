import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

export const mlbBracketResultsTable = pgTable("mlb_bracket_results", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  seriesId: text("series_id").notNull(),
  round: text("round").notNull(),
  seriesSlot: text("series_slot").notNull(),
  team1: text("team1").notNull(),
  team2: text("team2").notNull(),
  winner: text("winner").notNull(),
  actualLength: integer("actual_length").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  source: text("source").notNull().default("espn"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("mlb_bracket_results_uniq").on(t.poolId, t.seriesId)]);
export type MlbBracketResult = typeof mlbBracketResultsTable.$inferSelect;