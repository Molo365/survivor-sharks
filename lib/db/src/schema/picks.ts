import { pgTable, text, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";
import { entriesTable } from "./entries";

export const pickResultEnum = pgEnum("pick_result", ["win", "loss", "pending"]);

export const picksTable = pgTable("picks", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().references(() => entriesTable.id, { onDelete: "cascade" }),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull(),
  teamLogoUrl: text("team_logo_url"),
  week: integer("week").notNull(),
  pickDate: text("pick_date"),
  result: pickResultEnum("result").notNull().default("pending"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPickSchema = createInsertSchema(picksTable).omit({ id: true, submittedAt: true });
export type InsertPick = z.infer<typeof insertPickSchema>;
export type Pick = typeof picksTable.$inferSelect;
