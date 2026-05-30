import { pgTable, text, serial, timestamp, integer, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const pickemResultEnum = pgEnum("pickem_result", ["pending", "correct", "incorrect"]);

export const pickemPicksTable = pgTable(
  "pickem_picks",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    gameId: text("game_id").notNull(),
    gameDate: text("game_date").notNull(),
    week: integer("week").notNull().default(1),
    pickedTeamId: text("picked_team_id").notNull(),
    pickedTeamName: text("picked_team_name").notNull(),
    result: pickemResultEnum("result").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("pickem_picks_uniq").on(t.poolId, t.userId, t.gameId)],
);

export const insertPickemPickSchema = createInsertSchema(pickemPicksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPickemPick = z.infer<typeof insertPickemPickSchema>;
export type PickemPick = typeof pickemPicksTable.$inferSelect;
