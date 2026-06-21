import { pgTable, serial, timestamp, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const weekResultsTable = pgTable("week_results", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  week: integer("week").notNull(),
  losingTeamIds: text("losing_team_ids").array().notNull().default([]),
  isVoided: boolean("is_voided").notNull().default(false),
  processedBy: integer("processed_by").references(() => usersTable.id),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWeekResultSchema = createInsertSchema(weekResultsTable).omit({ id: true, processedAt: true });
export type InsertWeekResult = z.infer<typeof insertWeekResultSchema>;
export type WeekResult = typeof weekResultsTable.$inferSelect;
