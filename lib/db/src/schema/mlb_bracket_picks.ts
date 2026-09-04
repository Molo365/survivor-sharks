import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const mlbBracketPicksTable = pgTable("mlb_bracket_picks", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  seriesId: text("series_id").notNull(),
  round: text("round").notNull(),
  seriesSlot: text("series_slot").notNull(),
  predictedWinner: text("predicted_winner").notNull(),
  predictedLength: integer("predicted_length").notNull(),
  winnerCorrect: boolean("winner_correct"),
  lengthCorrect: boolean("length_correct"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique("mlb_bracket_picks_uniq").on(t.poolId, t.userId, t.seriesId)]);

export const insertMlbBracketPickSchema = createInsertSchema(mlbBracketPicksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMlbBracketPick = z.infer<typeof insertMlbBracketPickSchema>;
export type MlbBracketPick = typeof mlbBracketPicksTable.$inferSelect;