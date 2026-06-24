import { pgTable, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const nflDivisionPredictorTiebreakersTable = pgTable(
  "nfl_division_predictor_tiebreakers",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    tb1Guess: integer("tb1_guess"),
    tb1Actual: integer("tb1_actual"),
    tb2Guess: integer("tb2_guess"),
    tb2Actual: integer("tb2_actual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("ndp_tb_pool_user_uniq").on(t.poolId, t.userId)],
);

export const insertNflDivisionPredictorTiebreakerSchema = createInsertSchema(nflDivisionPredictorTiebreakersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNflDivisionPredictorTiebreaker = z.infer<typeof insertNflDivisionPredictorTiebreakerSchema>;
export type NflDivisionPredictorTiebreaker = typeof nflDivisionPredictorTiebreakersTable.$inferSelect;
