import { pgTable, text, serial, timestamp, integer, boolean, real, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sportEnum = pgEnum("sport_type", ["nfl", "mlb", "nba", "nhl", "fifa", "worldcup", "intl"]);
export const poolTypeEnum = pgEnum("pool_type", ["season", "weekly", "mid_season", "pickem", "group_stage_predictor", "pickem_season"]);
export const pickFrequencyEnum = pgEnum("pick_frequency", ["weekly", "daily"]);

export const poolsTable = pgTable("pools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sport: sportEnum("sport").notNull().default("nfl"),
  poolType: poolTypeEnum("pool_type_col").notNull().default("season"),
  startWeek: integer("start_week"),
  description: text("description"),
  inviteCode: text("invite_code").notNull().unique(),
  currentWeek: integer("current_week").notNull().default(1),
  season: integer("season").notNull().default(2025),
  isActive: boolean("is_active").notNull().default(true),
  commissionerId: integer("commissioner_id").notNull().references(() => usersTable.id),
  maxEntries: integer("max_entries"),
  entryFee: real("entry_fee"),
  prizePot: real("prize_pot"),
  prizeStructure: jsonb("prize_structure").$type<Array<{ place: number; amount: number }>>(),
  doubleElimination: boolean("double_elimination").notNull().default(false),
  pickFrequency: pickFrequencyEnum("pick_frequency").notNull().default("weekly"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPoolSchema = createInsertSchema(poolsTable).omit({ id: true, createdAt: true, updatedAt: true, inviteCode: true });
export type InsertPool = z.infer<typeof insertPoolSchema>;
export type Pool = typeof poolsTable.$inferSelect;
