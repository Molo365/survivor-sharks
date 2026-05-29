import { pgTable, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const memberStatusEnum = pgEnum("member_status", ["active", "eliminated"]);

export const poolMembersTable = pgTable("pool_members", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: memberStatusEnum("status").notNull().default("active"),
  eliminatedWeek: integer("eliminated_week"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPoolMemberSchema = createInsertSchema(poolMembersTable).omit({ id: true, joinedAt: true });
export type InsertPoolMember = z.infer<typeof insertPoolMemberSchema>;
export type PoolMember = typeof poolMembersTable.$inferSelect;
