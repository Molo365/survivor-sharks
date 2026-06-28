import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const wcBracketPicksTable = pgTable(
  "wc_bracket_picks",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    espnEventId: text("espn_event_id").notNull(),
    round: text("round").notNull(),
    matchSlot: integer("match_slot").notNull(),
    pickedTeam: text("picked_team").notNull(),
    isCorrect: boolean("is_correct"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("wc_bracket_picks_uniq").on(t.poolId, t.userId, t.espnEventId)],
);

export const insertWcBracketPickSchema = createInsertSchema(wcBracketPicksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWcBracketPick = z.infer<typeof insertWcBracketPickSchema>;
export type WcBracketPick = typeof wcBracketPicksTable.$inferSelect;
