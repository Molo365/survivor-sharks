import { pgTable, serial, timestamp, integer, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const nflWeeklyTiebreakersTable = pgTable(
  "nfl_weekly_tiebreakers",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    week: integer("week").notNull(),
    guess: integer("guess").notNull(),
    actual: integer("actual"),
    targetGameId: text("target_game_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("nfl_weekly_tiebreakers_pool_user_week_uniq").on(t.poolId, t.userId, t.week)],
);

export const insertNflWeeklyTiebreakerSchema = createInsertSchema(nflWeeklyTiebreakersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNflWeeklyTiebreaker = z.infer<typeof insertNflWeeklyTiebreakerSchema>;
export type NflWeeklyTiebreaker = typeof nflWeeklyTiebreakersTable.$inferSelect;