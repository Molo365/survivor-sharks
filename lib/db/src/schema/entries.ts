import { pgTable, serial, timestamp, integer, pgEnum, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const entryStatusEnum = pgEnum("entry_status", ["alive", "eliminated"]);

export const entriesTable = pgTable("entries", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: entryStatusEnum("status").notNull().default("alive"),
  eliminatedWeek: integer("eliminated_week"),
  strikeCount: integer("strike_count").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  tiebreakerPrediction: integer("tiebreaker_prediction"),
  tiebreakerRuns: integer("tiebreaker_runs"),
  tiebreakerStrikeouts: integer("tiebreaker_strikeouts"),
  tiebreakerPassingYards: integer("tiebreaker_passing_yards"),
  tiebreakerRushingYards: integer("tiebreaker_rushing_yards"),
  tiebreakerShotsOnGoal: integer("tiebreaker_shots_on_goal"),
  tiebreakerPenaltyMinutes: integer("tiebreaker_penalty_minutes"),
  sovTotal: integer("sov_total"),
  finalWinner: boolean("final_winner").notNull().default(false),
  finishPosition: integer("finish_position"),
  prizeAmount: real("prize_amount"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEntrySchema = createInsertSchema(entriesTable).omit({ id: true, joinedAt: true });
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type Entry = typeof entriesTable.$inferSelect;
