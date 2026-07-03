import { Router } from "express";
import { db } from "@workspace/db";
import {
  pickemPicksTable,
  poolsTable,
  usersTable,
  entriesTable,
  nflDivisionPredictorPicksTable,
  nflDivisionResultsTable,
  groupStagePredictorPicksTable,
  groupStageResultsTable,
  wcBracketPicksTable,
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

// Returns the prize per winner, scaled for actual entries vs max capacity.
// Mirrors the scaledPrizePot() logic already used on the client for "Prize Pot (Est.)".
function computeSplitPrize(
  pool: {
    prizeStructure?: Array<{ place: number; amount: number }> | null;
    prizePot?: number | null;
    maxEntries?: number | null;
    prizeMode?: string | null;
    entryFee?: number | null;
  },
  winnerCount: number,
  memberCount: number,
): number | null {
  // Pct mode: amounts in prizeStructure are percentages, not dollars.
  // Mirror the exact formula used in calculatePayouts.ts lines 15–22.
  if (pool.prizeMode === "pct") {
    if (!pool.entryFee || pool.entryFee <= 0 || memberCount <= 0) return null;
    if (!pool.prizeStructure || pool.prizeStructure.length === 0) return null;
    const entryFee = pool.entryFee;
    const pctAmounts = pool.prizeStructure.map((p) =>
      Math.floor((p.amount / 100) * entryFee * memberCount / 5) * 5,
    );
    const pctFirst = pctAmounts[0] ?? 0;
    const pctTotal = pctAmounts.reduce((s, a) => s + a, 0);
    return winnerCount === 1 ? pctFirst : Math.floor(pctTotal / winnerCount);
  }

  // Fixed mode: scale down proportionally when fewer members than max capacity.
  const scale =
    pool.maxEntries && pool.maxEntries > 0 && memberCount > 0 && memberCount < pool.maxEntries
      ? memberCount / pool.maxEntries
      : 1;

  if (pool.prizeStructure && pool.prizeStructure.length > 0) {
    const total = pool.prizeStructure.reduce((sum, p) => sum + p.amount, 0);
    const scaledTotal = Math.round(total * scale);
    const scaledFirst = Math.round(pool.prizeStructure[0].amount * scale);
    return winnerCount === 1 ? scaledFirst : Math.floor(scaledTotal / winnerCount);
  }
  if (pool.prizePot && pool.prizePot > 0) {
    return Math.floor(pool.prizePot * scale / winnerCount);
  }
  return null;
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
const SUPPORTED_TYPES = ["pickem", "season", "weekly", "mid_season", "pickem_season", "nfl_confidence", "nfl_confidence_weekly", "nfl_division_predictor", "group_stage_predictor", "wc_bracket"];

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
    .select({
      id: poolsTable.id,
      name: poolsTable.name,
      sport: poolsTable.sport,
      poolType: poolsTable.poolType,
      currentWeek: poolsTable.currentWeek,
      isActive: poolsTable.isActive,
      closureReason: poolsTable.closureReason,
      prizeStructure: poolsTable.prizeStructure,
      prizePot: poolsTable.prizePot,
      maxEntries: poolsTable.maxEntries,
      prizeMode: poolsTable.prizeMode,
      entryFee: poolsTable.entryFee,
      pickFrequency: poolsTable.pickFrequency,
    })
    .from(poolsTable)
    .where(and(
      inArray(poolsTable.id, allPoolIds),
      inArray(poolsTable.poolType as any, SUPPORTED_TYPES),
    ));

  if (pools.length === 0) {
    res.json([]);
    return;
  }

  // Batch-fetch actual member counts for all pools in one query so every
  // computeSplitPrize call can scale the prize for real vs max entries.
  const poolIds = pools.map((p) => p.id);
  const memberCountRows = await db
    .select({ poolId: entriesTable.poolId, cnt: sql<string>`COUNT(*)` })
    .from(entriesTable)
    .where(inArray(entriesTable.poolId, poolIds))
    .groupBy(entriesTable.poolId);
  const memberCountMap = new Map(memberCountRows.map((r) => [r.poolId, Number(r.cnt)]));

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
          .select({ status: entriesTable.status, eliminatedWeek: entriesTable.eliminatedWeek, sovTotal: entriesTable.sovTotal, finalWinner: entriesTable.finalWinner })
          .from(entriesTable)
          .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.userId, userId)))
          .limit(1);
        // For ended pools, a finalWinner entry is treated as "alive" regardless of
        // the live status field (which the auto-eliminator may have flipped to "eliminated").
        const isFinalWinner = entry?.finalWinner ?? false;
        const status: string | null = isFinalWinner ? "alive" : (entry?.status ?? null);
        const eliminatedWeek = isFinalWinner ? null : (entry?.eliminatedWeek ?? null);

        let closureReason: string | null = null;
        let sovRank: number | null = null;
        let sovPrizeWon: number | null = null;
        let coWinnerCount: number | null = null;
        let coWinnerPrize: number | null = null;

        if (!pool.isActive && poolType === "season" && status === "alive") {
          closureReason = pool.closureReason ?? null;

          if (pool.closureReason === "sov_tiebreaker") {
            // Use finalWinner flag — live status may have been flipped by auto-eliminator
            const winnerEntries = await db
              .select({ userId: entriesTable.userId, sovTotal: entriesTable.sovTotal })
              .from(entriesTable)
              .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true)));
            winnerEntries.sort((a, b) => (b.sovTotal ?? 0) - (a.sovTotal ?? 0));
            const idx = winnerEntries.findIndex((e) => e.userId === userId);
            sovRank = idx >= 0 ? idx + 1 : null;

            // Compute this player's actual payout from their rank in the prize structure.
            // Scale by (actualMembers / maxEntries) so partially-filled pools pay correctly.
            if (sovRank != null) {
              const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
              const memberCount = memberCountMap.get(pool.id) ?? 0;
              const scale = pool.maxEntries && pool.maxEntries > 0 ? memberCount / pool.maxEntries : 1;
              if (ps && ps.length > 0) {
                const placeEntry = ps.find(p => p.place === sovRank) ?? null;
                if (placeEntry) {
                  sovPrizeWon = Math.round(placeEntry.amount * scale * 100) / 100;
                }
              } else if (sovRank === 1 && pool.prizePot && pool.prizePot > 0) {
                sovPrizeWon = Math.round(pool.prizePot * scale * 100) / 100;
              }
            }
          } else if (pool.closureReason === "co_winners") {
            // Use finalWinner flag — live status may have been flipped by auto-eliminator
            const winnerEntries = await db
              .select({ id: entriesTable.id })
              .from(entriesTable)
              .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true)));
            coWinnerCount = winnerEntries.length;
            if (coWinnerCount > 0 && pool.prizePot && pool.prizePot > 0) {
              coWinnerPrize = Math.floor(pool.prizePot / coWinnerCount);
            }
          }
        }

        const allEntries = await db
          .select({ userId: entriesTable.userId })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, pool.id))
          .orderBy(
            sql`CASE WHEN ${entriesTable.status} = 'alive' THEN 0 ELSE 1 END`,
            entriesTable.joinedAt,
          );
        const survivorRank = allEntries.findIndex((e) => e.userId === userId) + 1;

        return {
          poolId: pool.id,
          poolName: pool.name,
          poolType,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
          lastWinners: null,
          myStanding: {
            rank: survivorRank, correct: 0, picked: 0,
            hasPicks: !!entry,
            status,
            eliminatedWeek,
            score: null,
            maxScore: null,
            closureReason,
            sovRank,
            sovPrizeWon,
            coWinnerCount,
            coWinnerPrize,
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
          lastWinners: null,
          myStanding: {
            rank: myRow ? myIdx + 1 : 0,
            correct: 0, picked: 0,
            hasPicks: !!myRow,
            status: null, eliminatedWeek: null,
            score: myRow ? Number(myRow.score) : null,
            maxScore: null,
          },
          poolName: pool.name,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
        };
      }

      // ── NFL Confidence Picks — Weekly ──────────────────────────────────────
      if (poolType === "nfl_confidence_weekly") {
        const week = pool.currentWeek;
        const prevWeek = week - 1;

        let lastWinners = null;
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
            const topScore = Number(prevRows[0].weekPoints);
            const tiedRows = prevRows.filter(r => Number(r.weekPoints) === topScore);
            lastWinners = tiedRows.map(r => ({
              userId: r.userId,
              username: r.username,
              displayName: r.displayName ?? null,
              correct: 0,
              picked: 0,
              score: Number(r.weekPoints),
              prizeWon: computeSplitPrize(pool, tiedRows.length, memberCountMap.get(pool.id) ?? 0),
            }));
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
          lastWinners,
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
          poolName: pool.name,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
        };
      }

      // ── NFL Pick-Em Season ──────────────────────────────────────────────────
      if (poolType === "pickem_season") {
        const week = pool.currentWeek;
        const prevWeek = week - 1;

        let lastWinners = null;
        if (prevWeek >= 1) {
          const prevRows = await db
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
            .where(and(eq(pickemPicksTable.poolId, pool.id), eq(pickemPicksTable.week, prevWeek)))
            .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
            .orderBy(
              sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
              sql`COUNT(*) DESC`,
            );
          const hasGraded = prevRows.some((r) => Number(r.graded) > 0);
          if (hasGraded && prevRows.length > 0) {
            const topCorrect = Number(prevRows[0].correct);
            const tiedRows = prevRows.filter(r => Number(r.correct) === topCorrect);
            lastWinners = tiedRows.map(r => ({
              userId: r.userId,
              username: r.username,
              displayName: r.displayName ?? null,
              correct: Number(r.correct),
              picked: Number(r.picked),
              score: null,
              // Only show the dollar amount once the season is fully closed — no real
              // payout exists mid-season. Mirrors the !pool.isActive gate already used
              // by nfl_division_predictor and group_stage_predictor.
              prizeWon: pool.isActive ? null : computeSplitPrize(pool, tiedRows.length, memberCountMap.get(pool.id) ?? 0),
            }));
          }
        }

        const currentRows = await db
          .select({
            userId: pickemPicksTable.userId,
            correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
            picked: sql<string>`COUNT(*)`,
          })
          .from(pickemPicksTable)
          .where(and(eq(pickemPicksTable.poolId, pool.id), eq(pickemPicksTable.week, week)))
          .groupBy(pickemPicksTable.userId)
          .orderBy(
            sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
            sql`COUNT(*) DESC`,
          );

        const myIdx = currentRows.findIndex((r) => r.userId === userId);
        const myRow = myIdx >= 0 ? currentRows[myIdx] : null;

        return {
          poolId: pool.id,
          poolType,
          lastWinners,
          myStanding: {
            rank: myRow ? myIdx + 1 : 0,
            correct: myRow ? Number(myRow.correct) : 0,
            picked: myRow ? Number(myRow.picked) : 0,
            hasPicks: !!myRow,
            status: null,
            eliminatedWeek: null,
            score: null,
            maxScore: null,
          },
          poolName: pool.name,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
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
        const scoringStarted = allResults.length > 0;

        let lastWinners = null;
        if (!pool.isActive) {
          const winnerRows = await db
            .select({ userId: entriesTable.userId, username: usersTable.username, displayName: usersTable.displayName })
            .from(entriesTable)
            .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
            .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true)));
          if (winnerRows.length > 0) {
            const scoreMap = new Map(scored.map((s) => [s.userId, s.total]));
            lastWinners = winnerRows.map((w) => ({
              userId: w.userId,
              username: w.username,
              displayName: w.displayName ?? null,
              score: scoreMap.get(w.userId) ?? null,
              correct: null,
              picked: null,
              prizeWon: computeSplitPrize(pool, winnerRows.length, memberCountMap.get(pool.id) ?? 0),
            }));
          }
        }

        return {
          poolId: pool.id,
          poolType,
          lastWinners,
          myStanding: {
            rank: (scoringStarted && myRow) ? myIdx + 1 : 0,
            correct: 0, picked: 0,
            hasPicks,
            status: null, eliminatedWeek: null,
            score: myRow ? myRow.total : null,
            maxScore: 96,
          },
          poolName: pool.name,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
        };
      }

      // ── World Cup Group Stage Predictor ──────────────────────────────────
      if (poolType === "group_stage_predictor") {
        const [allPicks, allResults] = await Promise.all([
          db.select().from(groupStagePredictorPicksTable).where(eq(groupStagePredictorPicksTable.poolId, pool.id)),
          db.select().from(groupStageResultsTable).where(eq(groupStageResultsTable.poolId, pool.id)),
        ]);
        const resultMap = new Map(allResults.map((r) => [r.groupName, r]));
        const picksByUser = new Map<number, typeof allPicks>();
        for (const pick of allPicks) {
          if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, []);
          picksByUser.get(pick.userId)!.push(pick);
        }
        const scored = Array.from(picksByUser.entries()).map(([uid, picks]) => {
          let total = 0;
          for (const pick of picks) {
            const result = resultMap.get(pick.groupName);
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

        let lastWinners = null;
        if (!pool.isActive) {
          const winnerRows = await db
            .select({ userId: entriesTable.userId, username: usersTable.username, displayName: usersTable.displayName })
            .from(entriesTable)
            .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
            .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true)));
          if (winnerRows.length > 0) {
            const scoreMap = new Map(scored.map((s) => [s.userId, s.total]));
            lastWinners = winnerRows.map((w) => ({
              userId: w.userId,
              username: w.username,
              displayName: w.displayName ?? null,
              score: scoreMap.get(w.userId) ?? null,
              correct: null,
              picked: null,
              prizeWon: computeSplitPrize(pool, winnerRows.length, memberCountMap.get(pool.id) ?? 0),
            }));
          }
        }

        return {
          poolId: pool.id,
          poolType,
          lastWinners,
          myStanding: {
            rank: myRow ? myIdx + 1 : 0,
            correct: 0, picked: 0,
            hasPicks,
            status: null, eliminatedWeek: null,
            score: myRow ? myRow.total : null,
            maxScore: 144,
          },
          poolName: pool.name,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
        };
      }

      // ── WC Bracket ──────────────────────────────────────────────────────────
      if (poolType === "wc_bracket") {
        const allPickRows = await db
          .select({
            userId: wcBracketPicksTable.userId,
            correct: sql<string>`COUNT(*) FILTER (WHERE ${wcBracketPicksTable.isCorrect} = true)`,
            picked: sql<string>`COUNT(*)`,
          })
          .from(wcBracketPicksTable)
          .where(eq(wcBracketPicksTable.poolId, pool.id))
          .groupBy(wcBracketPicksTable.userId)
          .orderBy(
            sql`COUNT(*) FILTER (WHERE ${wcBracketPicksTable.isCorrect} = true) DESC`,
            sql`COUNT(*) DESC`,
          );

        const myIdx = allPickRows.findIndex((r) => r.userId === userId);
        const myRow = myIdx >= 0 ? allPickRows[myIdx] : null;

        return {
          poolId: pool.id,
          poolType,
          lastWinners: null,
          myStanding: {
            rank: myRow ? myIdx + 1 : 0,
            correct: myRow ? Number(myRow.correct) : 0,
            picked: myRow ? Number(myRow.picked) : 0,
            hasPicks: !!myRow && Number(myRow.picked) > 0,
            status: null,
            eliminatedWeek: null,
            score: null,
            maxScore: null,
          },
          poolName: pool.name,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
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

      const allGradedPrev = prevRows.length > 0 && prevRows.every((r) => Number(r.graded) === Number(r.picked));
      const topCorrect = prevRows.length > 0 ? Number(prevRows[0].correct) : 0;
      const tiedPrevRows = allGradedPrev ? prevRows.filter(r => Number(r.correct) === topCorrect) : [];
      const lastWinners =
        tiedPrevRows.length > 0
          ? tiedPrevRows.map(r => ({
              userId: r.userId,
              username: r.username,
              displayName: r.displayName ?? null,
              correct: Number(r.correct),
              picked: Number(r.picked),
              prizeWon: computeSplitPrize(pool, tiedPrevRows.length, memberCountMap.get(pool.id) ?? 0),
            }))
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

      return {
        poolId: pool.id,
        poolName: pool.name,
        poolType,
        sport: pool.sport as string,
        totalPlayers: memberCountMap.get(pool.id) ?? 0,
        lastWinners,
        myStanding,
      };
    }),
  );

  res.json(results);
});

export default router;
