import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sportPoolStatusTable = pgTable("sport_pool_status", {
  sport: text("sport").primaryKey(),
  status: text("status", { enum: ["open", "coming_soon", "paused", "season_over"] }).notNull().default("open"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("sport_pool_status_status_check", sql`${table.status} IN ('open', 'coming_soon', 'paused', 'season_over')`),
]);

export const insertSportPoolStatusSchema = createInsertSchema(sportPoolStatusTable);
export type InsertSportPoolStatus = z.infer<typeof insertSportPoolStatusSchema>;
export type SportPoolStatus = typeof sportPoolStatusTable.$inferSelect;