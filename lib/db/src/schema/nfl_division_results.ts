import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const nflDivisionResultsTable = pgTable(
  "nfl_division_results",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    divisionName: text("division_name").notNull(),
    pos1Team: text("pos1_team").notNull(),
    pos2Team: text("pos2_team").notNull(),
    pos3Team: text("pos3_team").notNull(),
    pos4Team: text("pos4_team").notNull(),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
    enteredByUserId: integer("entered_by_user_id").references(() => usersTable.id),
  },
  (t) => [unique("ndr_pool_div_uniq").on(t.poolId, t.divisionName)],
);

export type NflDivisionResult = typeof nflDivisionResultsTable.$inferSelect;
