import { pgTable, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const nhlDivisionPredictorTiebreakersTable = pgTable("nhl_division_predictor_tiebreakers", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  tbGuess: integer("tb_guess"), tbActual: integer("tb_actual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique("nhl_ndp_tb_pool_user_uniq").on(t.poolId, t.userId)]);
export const insertNhlDivisionPredictorTiebreakerSchema = createInsertSchema(nhlDivisionPredictorTiebreakersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNhlDivisionPredictorTiebreaker = z.infer<typeof insertNhlDivisionPredictorTiebreakerSchema>;
export type NhlDivisionPredictorTiebreaker = typeof nhlDivisionPredictorTiebreakersTable.$inferSelect;