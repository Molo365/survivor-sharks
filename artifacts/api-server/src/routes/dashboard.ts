import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, usersTable, entriesTable } from "@workspace/db";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getTodayEtDate } from "../lib/espn";
import { WC_PHASES, getWcPhase } from "../lib/wc";

const router = Router();

function getWeekBoundsEt(dateStr: string): { weekStart: string; weekEnd: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : -(dow - 1);
  const monday = new Date(Date.UTC(y, m - 1, d + diffToMonday));
  const sunday = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6),
  );
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

function offsetDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// GET /api/dashboard/pickem-stats
router.get("/pickem-stats", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const todayEt = getTodayEtDate();

  const memberships = await db
    .select({ poolId: entriesTable.poolId })
    .from(entriesTable)
    .where(eq(entriesTable.userId, userId));

  const allPoolIds = memberships.map((m) => m.poolId);
  if (allPoolIds.length === 0) {
    res.json([]);
    return;
  }

  const pools = await db
    .select()
    .from(poolsTable)
    .where(and(inArray(poolsTable.id, allPoolIds), eq(poolsTable.poolType, "pickem")));

  if (pools.length === 0) {
    res.json([]);
    return;
  }

  const currentWeekBounds = getWeekBoundsEt(todayEt);
  const prevWeekSunday = offsetDateStr(currentWeekBounds.weekStart, -1);
  const prevWeekBounds = getWeekBoundsEt(prevWeekSunday);
  const yesterdayEt = offsetDateStr(todayEt, -1);
  const currentWcPhase = getWcPhase(todayEt) ?? "group_stage";

  const results = await Promise.all(
    pools.map(async (pool) => {
      const sport = pool.sport as string;
      const isWc = sport === "worldcup";
      const isIntl = sport === "intl";
      const isWeekly = pool.pickFrequency === "weekly" && !isWc && !isIntl;

      const currentStart = isWc
        ? WC_PHASES[currentWcPhase].start
        : isWeekly
        ? currentWeekBounds.weekStart
        : todayEt;
      const currentEnd = isWc
        ? WC_PHASES[currentWcPhase].end
        : isWeekly
        ? currentWeekBounds.weekEnd
        : todayEt;
      const prevStart = isWeekly ? prevWeekBounds.weekStart : yesterdayEt;
      const prevEnd = isWeekly ? prevWeekBounds.weekEnd : yesterdayEt;

      const currentWhere = and(
        eq(pickemPicksTable.poolId, pool.id),
        gte(pickemPicksTable.gameDate, currentStart),
        lte(pickemPicksTable.gameDate, currentEnd),
      );
      const prevWhere = and(
        eq(pickemPicksTable.poolId, pool.id),
        gte(pickemPicksTable.gameDate, prevStart),
        lte(pickemPicksTable.gameDate, prevEnd),
      );

      const [prevRows, currentRows] = await Promise.all([
        db
          .select({
            userId: pickemPicksTable.userId,
            username: usersTable.username,
            displayName: usersTable.displayName,
            correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
            picked: sql<string>`COUNT(*)`,
            graded: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} IN ('correct','incorrect','postponed'))`,
          })
          .from(pickemPicksTable)
          .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
          .where(prevWhere)
          .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
          .orderBy(
            sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
            sql`COUNT(*) DESC`,
          ),
        db
          .select({
            userId: pickemPicksTable.userId,
            correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
            picked: sql<string>`COUNT(*)`,
          })
          .from(pickemPicksTable)
          .where(currentWhere)
          .groupBy(pickemPicksTable.userId)
          .orderBy(
            sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
            sql`COUNT(*) DESC`,
          ),
      ]);

      const hasGradedPrev = prevRows.some((r) => Number(r.graded) > 0);
      const lastWinner =
        hasGradedPrev && prevRows.length > 0
          ? {
              userId: prevRows[0].userId,
              username: prevRows[0].username,
              displayName: prevRows[0].displayName ?? null,
              correct: Number(prevRows[0].correct),
              picked: Number(prevRows[0].picked),
            }
          : null;

      const myIdx = currentRows.findIndex((r) => r.userId === userId);
      const myStanding =
        myIdx >= 0
          ? {
              rank: myIdx + 1,
              correct: Number(currentRows[myIdx].correct),
              picked: Number(currentRows[myIdx].picked),
              hasPicks: Number(currentRows[myIdx].picked) > 0,
            }
          : { rank: 0, correct: 0, picked: 0, hasPicks: false };

      return { poolId: pool.id, lastWinner, myStanding };
    }),
  );

  res.json(results);
});

export default router;
