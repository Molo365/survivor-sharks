import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const groupStagePredictorPicksTable = pgTable(
  "group_stage_predictor_picks",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    groupName: text("group_name").notNull(),
    pos1Team: text("pos1_team").notNull(),
    pos2Team: text("pos2_team").notNull(),
    pos3Team: text("pos3_team").notNull(),
    pos4Team: text("pos4_team").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("gsp_picks_uniq").on(t.poolId, t.userId, t.groupName)],
);

export const insertGroupStagePredictorPickSchema = createInsertSchema(groupStagePredictorPicksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGroupStagePredictorPick = z.infer<typeof insertGroupStagePredictorPickSchema>;
export type GroupStagePredictorPick = typeof groupStagePredictorPicksTable.$inferSelect;
