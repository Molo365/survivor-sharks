import { Router } from "express";
import { db } from "@workspace/db";
import {
  pickemPicksTable,
  poolsTable,
  usersTable,
  entriesTable,
  nflDivisionPredictorPicksTable,
  nflDivisionResultsTable,
} from "@workspace/db";
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

function scoreNdpDivision(
  actual: [string, string, string, string],
  predicted: [string, string, string, string],
): number {
  let pts = 0;
  for (let i = 0; i < 4; i++) {
    const team = actual[i];
    const predictedPos = predicted.indexOf(team);
    if (predictedPos === i) {
      pts += 3;
    } else if (i < 2 && predictedPos >= 0 && predictedPos < 2) {
      pts += 1;
    }
  }
  return pts;
}

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season"]);
const SUPPORTED_TYPES = ["pickem", "season", "weekly", "mid_season", "pickem_season", "nfl_confidence", "nfl_confidence_weekly", "nfl_division_predictor"];

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
    .where(and(
      inArray(poolsTable.id, allPoolIds),
      inArray(poolsTable.poolType as any, SUPPORTED_TYPES),
    ));

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
      const poolType = pool.poolType as string;

      // ── Survivor pools ──────────────────────────────────────────────────────
      if (SURVIVOR_TYPES.has(poolType)) {
        const [entry] = await db
          .select({ status: entriesTable.status, eliminatedWeek: entriesTable.eliminatedWeek })
          .from(entriesTable)
          .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.userId, userId)))
          .limit(1);
        const status = entry?.status ?? null;
        const eliminatedWeek = entry?.eliminatedWeek ?? null;
        return {
          poolId: pool.id,
          poolType,
          lastWinner: null,
          myStanding: {
            rank: 0, correct: 0, picked: 0,
            hasPicks: !!entry,
            status,
            eliminatedWeek,
            score: null,
            maxScore: null,
          },
        };
      }

      // ── NFL Confidence Picks ────────────────────────────────────────────────
      if (poolType === "nfl_confidence") {
        const week = pool.currentWeek;
        const rows = await db
          .select({
            userId: pickemPicksTable.userId,
            score: sql<string>`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0)`,
          })
          .from(pickemPicksTable)
          .where(and(eq(pickemPicksTable.poolId, pool.id), eq(pickemPicksTable.week, week)))
          .groupBy(pickemPicksTable.userId)
          .orderBy(sql`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0) DESC`);
        const myIdx = rows.findIndex((r) => r.userId === userId);
        const myRow = myIdx >= 0 ? rows[myIdx] : null;
        return {
          poolId: pool.id,
          poolType,
          lastWinner: null,
          myStanding: {
            rank: myRow ? myIdx + 1 : 0,
            correct: 0, picked: 0,
            hasPicks: !!myRow,
            status: null, eliminatedWeek: null,
            score: myRow ? Number(myRow.score) : null,
            maxScore: null,
          },
        };
      }

      // ── NFL Confidence Picks — Weekly ──────────────────────────────────────
      if (poolType === "nfl_confidence_weekly") {
        const week = pool.currentWeek;
        const prevWeek = week - 1;

        let lastWinner = null;
        if (prevWeek >= 1) {
          const prevRows = await db
            .select({
              userId: pickemPicksTable.userId,
              username: usersTable.username,
              displayName: usersTable.displayName,
              weekPoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0)`,
              gradedPicks: sql<string>`COUNT(*) FILTER (WHERE pickem_picks.result != 'pending')`,
            })
            .from(pickemPicksTable)
            .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
            .where(and(eq(pickemPicksTable.poolId, pool.id), eq(pickemPicksTable.week, prevWeek)))
            .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
            .orderBy(
              sql`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0) DESC`,
            );
          const hasGraded = prevRows.some((r) => Number(r.gradedPicks) > 0);
          if (hasGraded && prevRows.length > 0) {
            lastWinner = {
              userId: prevRows[0].userId,
              username: prevRows[0].username,
              displayName: prevRows[0].displayName ?? null,
              correct: 0,
              picked: 0,
              score: Number(prevRows[0].weekPoints),
            };
          }
        }

        const currentRows = await db
          .select({
            userId: pickemPicksTable.userId,
            weekPoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0)`,
          })
          .from(pickemPicksTable)
          .where(and(eq(pickemPicksTable.poolId, pool.id), eq(pickemPicksTable.week, week)))
          .groupBy(pickemPicksTable.userId)
          .orderBy(
            sql`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0) DESC`,
          );

        const myIdx = currentRows.findIndex((r) => r.userId === userId);
        const myRow = myIdx >= 0 ? currentRows[myIdx] : null;

        return {
          poolId: pool.id,
          poolType,
          lastWinner,
          myStanding: {
            rank: myRow ? myIdx + 1 : 0,
            correct: 0,
            picked: 0,
            hasPicks: !!myRow,
            status: null,
            eliminatedWeek: null,
            score: myRow ? Number(myRow.weekPoints) : null,
            maxScore: null,
          },
        };
      }

      // ── NFL Division Predictor ──────────────────────────────────────────────
      if (poolType === "nfl_division_predictor") {
        const [allPicks, allResults] = await Promise.all([
          db.select().from(nflDivisionPredictorPicksTable).where(eq(nflDivisionPredictorPicksTable.poolId, pool.id)),
          db.select().from(nflDivisionResultsTable).where(eq(nflDivisionResultsTable.poolId, pool.id)),
        ]);
        const resultMap = new Map(allResults.map((r) => [r.divisionName, r]));
        const picksByUser = new Map<number, typeof allPicks>();
        for (const pick of allPicks) {
          if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, []);
          picksByUser.get(pick.userId)!.push(pick);
        }
        const scored = Array.from(picksByUser.entries()).map(([uid, picks]) => {
          let total = 0;
          for (const pick of picks) {
            const result = resultMap.get(pick.divisionName);
            if (result) {
              total += scoreNdpDivision(
                [result.pos1Team, result.pos2Team, result.pos3Team, result.pos4Team],
                [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team],
              );
            }
          }
          return { userId: uid, total };
        });
        scored.sort((a, b) => b.total - a.total);
        const myIdx = scored.findIndex((r) => r.userId === userId);
        const myRow = myIdx >= 0 ? scored[myIdx] : null;
        const hasPicks = picksByUser.has(userId);
        return {
          poolId: pool.id,
          poolType,
          lastWinner: null,
          myStanding: {
            rank: myRow ? myIdx + 1 : 0,
            correct: 0, picked: 0,
            hasPicks,
            status: null, eliminatedWeek: null,
            score: myRow ? myRow.total : null,
            maxScore: 96,
          },
        };
      }

      // ── MLB / World Cup pickem (original logic) ─────────────────────────────
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
              status: null, eliminatedWeek: null, score: null, maxScore: null,
            }
          : { rank: 0, correct: 0, picked: 0, hasPicks: false, status: null, eliminatedWeek: null, score: null, maxScore: null };

      return { poolId: pool.id, poolType, lastWinner, myStanding };
    }),
  );

  res.json(results);
});

export default router;
