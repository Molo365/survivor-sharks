import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

export const sandboxGameScoresTable = pgTable(
  "sandbox_game_scores",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    gameId: text("game_id").notNull(),
    homeScore: integer("home_score").notNull(),
    awayScore: integer("away_score").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("sgs_pool_week_game_uniq").on(t.poolId, t.week, t.gameId)],
);

export type SandboxGameScore = typeof sandboxGameScoresTable.$inferSelect;
