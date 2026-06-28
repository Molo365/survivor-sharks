import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

export const wcBracketResultsTable = pgTable(
  "wc_bracket_results",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    espnEventId: text("espn_event_id").notNull(),
    round: text("round").notNull(),
    matchSlot: integer("match_slot").notNull(),
    team1: text("team1").notNull(),
    team2: text("team2").notNull(),
    winner: text("winner").notNull(),
    winType: text("win_type").notNull(),
    matchDate: timestamp("match_date", { withTimezone: true }).notNull(),
    gradedAt: timestamp("graded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("wc_bracket_results_uniq").on(t.poolId, t.espnEventId)],
);

export type WcBracketResult = typeof wcBracketResultsTable.$inferSelect;
