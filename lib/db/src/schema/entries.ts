import { pgTable, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
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
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEntrySchema = createInsertSchema(entriesTable).omit({ id: true, joinedAt: true });
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type Entry = typeof entriesTable.$inferSelect;
