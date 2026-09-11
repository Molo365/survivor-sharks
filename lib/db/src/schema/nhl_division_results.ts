import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const nhlDivisionResultsTable = pgTable("nhl_division_results", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  divisionName: text("division_name").notNull(),
  pos1Team: text("pos1_team").notNull(), pos2Team: text("pos2_team").notNull(),
  pos3Team: text("pos3_team").notNull(), pos4Team: text("pos4_team").notNull(),
  pos5Team: text("pos5_team").notNull(), pos6Team: text("pos6_team").notNull(),
  pos7Team: text("pos7_team").notNull(), pos8Team: text("pos8_team").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  enteredByUserId: integer("entered_by_user_id").references(() => usersTable.id),
}, (t) => [unique("nhl_ndp_results_pool_div_uniq").on(t.poolId, t.divisionName)]);
export const insertNhlDivisionResultSchema = createInsertSchema(nhlDivisionResultsTable).omit({ id: true, enteredAt: true });
export type InsertNhlDivisionResult = z.infer<typeof insertNhlDivisionResultSchema>;
export type NhlDivisionResult = typeof nhlDivisionResultsTable.$inferSelect;