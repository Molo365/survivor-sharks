import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

export const sandboxGameScoresTable = pgTable(
  "sandbox_game_scores",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    gameId: text("game_id").notNull(),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    q1Home: integer("q1_home"),
    q1Away: integer("q1_away"),
    q2Home: integer("q2_home"),
    q2Away: integer("q2_away"),
    q3Home: integer("q3_home"),
    q3Away: integer("q3_away"),
    q4Home: integer("q4_home"),
    q4Away: integer("q4_away"),
    gameStatus: text("game_status"),
    replayKickoff: timestamp("replay_kickoff", { withTimezone: true }),
  },
  (t) => [unique("sgs_pool_week_game_uniq").on(t.poolId, t.week, t.gameId)],
);

export type SandboxGameScore = typeof sandboxGameScoresTable.$inferSelect;
