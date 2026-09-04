import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

/** Immutable bracket blueprint created with each pool; results/picks never alter it. */
export const mlbBracketSlotsTable = pgTable("mlb_bracket_slots", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  seriesSlot: text("series_slot").notNull(),
  round: text("round").notNull(),
  fixedTeam1: text("fixed_team1"),
  fixedTeam2: text("fixed_team2"),
  feederSlot1: text("feeder_slot_1"),
  feederSlot2: text("feeder_slot_2"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [unique("mlb_bracket_slots_uniq").on(table.poolId, table.seriesSlot)]);