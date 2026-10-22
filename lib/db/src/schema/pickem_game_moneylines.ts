import { pgTable, serial, integer, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

/** Frozen ESPN moneyline (decimal) per team for Fast Break Multiplier pools. */
export const pickemGameMoneylinesTable = pgTable(
  "pickem_game_moneylines",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    week: integer("week").notNull(),
    homeTeamId: text("home_team_id").notNull(),
    awayTeamId: text("away_team_id").notNull(),
    homeDecimalOdds: real("home_decimal_odds").notNull(),
    awayDecimalOdds: real("away_decimal_odds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("pickem_game_moneylines_uniq").on(t.poolId, t.gameId, t.week)],
);

export type PickemGameMoneyline = typeof pickemGameMoneylinesTable.$inferSelect;
