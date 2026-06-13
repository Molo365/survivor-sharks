import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const nflDivisionPredictorPicksTable = pgTable(
  "nfl_division_predictor_picks",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    divisionName: text("division_name").notNull(),
    pos1Team: text("pos1_team").notNull(),
    pos2Team: text("pos2_team").notNull(),
    pos3Team: text("pos3_team").notNull(),
    pos4Team: text("pos4_team").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("ndp_picks_uniq").on(t.poolId, t.userId, t.divisionName)],
);

export const insertNflDivisionPredictorPickSchema = createInsertSchema(nflDivisionPredictorPicksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNflDivisionPredictorPick = z.infer<typeof insertNflDivisionPredictorPickSchema>;
export type NflDivisionPredictorPick = typeof nflDivisionPredictorPicksTable.$inferSelect;
