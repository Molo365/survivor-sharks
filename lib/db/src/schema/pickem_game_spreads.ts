import { pgTable, serial, integer, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

/**
 * Commissioner-entered ATS spreads for NBA Weekend Pick-Ems (nba_ats pool type).
 * One row per game per pool per week. The spread is stored as an absolute value
 * (e.g. 6.5) and favoriteTeamId identifies which team is giving the points.
 */
export const pickemGameSpreadsTable = pgTable(
  "pickem_game_spreads",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    week: integer("week").notNull(),
    /** Absolute spread value, e.g. 6.5. Stored as entered by commissioner. */
    spread: real("spread").notNull(),
    /** ESPN team ID of the favored team (the one giving points). */
    favoriteTeamId: text("favorite_team_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("pickem_game_spreads_uniq").on(t.poolId, t.gameId, t.week)],
);

export type PickemGameSpread = typeof pickemGameSpreadsTable.$inferSelect;
export type InsertPickemGameSpread = typeof pickemGameSpreadsTable.$inferInsert;
