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
import { eq, and, sql, gte, lte, inArray, or, isNotNull, gt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getTodayEtDate } from "../lib/espn";
import { WC_PHASES, getWcPhase } from "../lib/wc";
import { getCurrentBracketRoundEventIds } from "../lib/bracketRound";
import { calcPrize } from "../lib/prizeCalc";

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
  return calcPrize({
    prizeStructure: pool.prizeStructure,
    prizeMode: pool.prizeMode,
    entryFee: pool.entryFee,
    prizePot: pool.prizePot,
    totalEntries: memberCount,
    maxEntries: pool.maxEntries,
    placeIndex: 0,
    coWinners: winnerCount,
  });
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
const SUPPORTED_TYPES = ["pickem", "season", "weekly", "mid_season", "pickem_season", "nfl_confidence", "nfl_confidence_weekly", "nfl_division_predictor", "group_stage_predictor", "wc_bracket", "crazy_8s"];

function computeRank<T extends { score: number }>(rows: T[], userId: number): number {
  if (rows.length === 0) return 0;
  const myRow = rows.find((r) => (r as any).userId === userId);
  if (!myRow) return 0;
  return rows.filter((r) => r.score > myRow.score).length + 1;
}

function computeIsTied<T extends { score: number }>(rows: T[], userId: number): boolean {
  if (rows.length === 0) return false;
  const myRow = rows.find((r) => (r as any).userId === userId);
  if (!myRow) return false;
  return rows.filter((r) => r.score === myRow.score).length > 1;
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

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

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
      or(
        eq(poolsTable.isActive, true),
        and(eq(poolsTable.isActive, false), isNotNull(poolsTable.endedAt), gt(poolsTable.endedAt, twoDaysAgo)),
      ),
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
          .select({ userId: entriesTable.userId, status: entriesTable.status, eliminatedWeek: entriesTable.eliminatedWeek, finalWinner: entriesTable.finalWinner })
          .from(entriesTable)
          .where(eq(entriesTable.poolId, pool.id));
        const survivorScored = allEntries.map((e) => ({
          userId: e.userId,
          score: (e.finalWinner || e.status === "alive") ? pool.currentWeek : (e.eliminatedWeek ?? 0),
        }));
        const survivorRank = computeRank(survivorScored, userId);

        return {
          poolId: pool.id,
          isActive: pool.isActive,
          poolName: pool.name,
          poolType,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
          lastWinners: null,
          myStanding: {
            rank: survivorRank, isTied: computeIsTied(survivorScored, userId), correct: 0, picked: 0,
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
        const rows = await db
          .select({
            userId: pickemPicksTable.userId,
            score: sql<string>`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0)`,
          })
          .from(pickemPicksTable)
          .where(eq(pickemPicksTable.poolId, pool.id))
          .groupBy(pickemPicksTable.userId)
          .orderBy(sql`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0) DESC`);
        const myRow = rows.find((r) => r.userId === userId) ?? null;
        return {
          poolId: pool.id,
          isActive: pool.isActive,
          poolType,
          lastWinners: null,
          myStanding: {
            rank: computeRank(rows.map((r) => ({ ...r, score: Number(r.score) })), userId),
            isTied: computeIsTied(rows.map((r) => ({ ...r, score: Number(r.score) })), userId),
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
        if (!pool.isActive) {
          // Pool ended — read the settled finalWinner flag and prizeAmount from
          // the entries table. Also fetch the winning week's confidence score
          // from pickemPicksTable (week = pool.currentWeek, the last graded week).
          const winnerRows = await db
            .select({
              userId: entriesTable.userId,
              username: usersTable.username,
              displayName: usersTable.displayName,
              prizeAmount: entriesTable.prizeAmount,
            })
            .from(entriesTable)
            .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
            .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true)));
          if (winnerRows.length > 0) {
            const winnerUserIds = winnerRows.map(w => w.userId);
            const scoreRows = await db
              .select({
                userId: pickemPicksTable.userId,
                weekPoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE((pickem_picks.confidence_points)::integer, 0) ELSE 0 END), 0)`,
              })
              .from(pickemPicksTable)
              .where(and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.week, week),
                inArray(pickemPicksTable.userId, winnerUserIds),
              ))
              .groupBy(pickemPicksTable.userId);
            const scoreMap = new Map(scoreRows.map(s => [s.userId, Number(s.weekPoints)]));
            lastWinners = winnerRows.map(w => ({
              userId: w.userId,
              username: w.username,
              displayName: w.displayName ?? null,
              correct: 0,
              picked: 0,
              score: scoreMap.get(w.userId) ?? null,
              prizeWon: w.prizeAmount != null ? Number(w.prizeAmount) : null,
            }));
          }
        } else if (prevWeek >= 1) {
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

        const myRow = currentRows.find((r) => r.userId === userId) ?? null;

        return {
          poolId: pool.id,
          isActive: pool.isActive,
          poolType,
          lastWinners,
          myStanding: {
            rank: computeRank(currentRows.map((r) => ({ ...r, score: Number(r.weekPoints) })), userId),
            isTied: computeIsTied(currentRows.map((r) => ({ ...r, score: Number(r.weekPoints) })), userId),
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
        if (!pool.isActive) {
          // Pool is closed — read the settled finalWinner flag and prizeAmount
          // from the entries table, exactly like nfl_division_predictor and the
          // ended-weekly-pickem branch do.  Do NOT recompute from prevWeek scores;
          // the tiebreaker may have resolved a sole winner among players who were
          // score-tied across the whole season.
          const winnerRows = await db
            .select({
              userId: entriesTable.userId,
              username: usersTable.username,
              displayName: usersTable.displayName,
              prizeAmount: entriesTable.prizeAmount,
            })
            .from(entriesTable)
            .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
            .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true)));
          if (winnerRows.length > 0) {
            lastWinners = winnerRows.map((w) => ({
              userId: w.userId,
              username: w.username,
              displayName: w.displayName ?? null,
              correct: null,
              picked: null,
              score: null,
              prizeWon: w.prizeAmount != null ? Number(w.prizeAmount) : null,
            }));
          }
        } else if (prevWeek >= 1) {
          // Pool is still active — show last week's top scorer(s) as a preview.
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
              prizeWon: null,
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
          .where(eq(pickemPicksTable.poolId, pool.id))
          .groupBy(pickemPicksTable.userId)
          .orderBy(
            sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
            sql`COUNT(*) DESC`,
          );

        const myRow = currentRows.find((r) => r.userId === userId) ?? null;

        return {
          poolId: pool.id,
          isActive: pool.isActive,
          poolType,
          lastWinners,
          myStanding: {
            rank: computeRank(currentRows.map((r) => ({ ...r, score: Number(r.correct) })), userId),
            isTied: computeIsTied(currentRows.map((r) => ({ ...r, score: Number(r.correct) })), userId),
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

        const myRank = (scoringStarted && myRow) ? computeRank(scored.map((s) => ({ ...s, score: s.total })), userId) : 0;
        let myPrizeWon: number | null = null;
        if (!pool.isActive && myRank > 0) {
          const ndpMemberCount = memberCountMap.get(pool.id) ?? 0;
          if (ndpMemberCount > 0) {
            myPrizeWon = calcPrize({
              prizeStructure: pool.prizeStructure as Array<{ place: number; amount: number }> | null,
              prizeMode: pool.prizeMode,
              entryFee: pool.entryFee,
              prizePot: pool.prizePot,
              totalEntries: ndpMemberCount,
              maxEntries: pool.maxEntries,
              placeIndex: myRank - 1,
              coWinners: 1,
            });
            if (myPrizeWon != null && myPrizeWon <= 0) myPrizeWon = null;
          }
        }

        return {
          poolId: pool.id,
          isActive: pool.isActive,
          poolType,
          lastWinners,
          myStanding: {
            rank: myRank,
            isTied: scoringStarted && myRow ? computeIsTied(scored.map((s) => ({ ...s, score: s.total })), userId) : false,
            correct: 0, picked: 0,
            hasPicks,
            status: null, eliminatedWeek: null,
            score: myRow ? myRow.total : null,
            maxScore: 96,
            prizeWon: myPrizeWon,
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
        const myRow = scored.find((r) => r.userId === userId) ?? null;
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
          isActive: pool.isActive,
          poolType,
          lastWinners,
          myStanding: {
            rank: computeRank(scored.map((s) => ({ ...s, score: s.total })), userId),
            isTied: computeIsTied(scored.map((s) => ({ ...s, score: s.total })), userId),
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
        // Resolve current-round event IDs to determine hasPicks correctly.
        // The all-time score/correct query below remains unfiltered — that
        // drives the leaderboard and must include all historical rounds.
        const currentRoundEventIds = await getCurrentBracketRoundEventIds(pool.id);

        const [allPickRows, currentRoundPickRows] = await Promise.all([
          // All-time picks: used for leaderboard score + correct count
          db
            .select({
              userId: wcBracketPicksTable.userId,
              score: sql<string>`COALESCE(SUM(CASE WHEN ${wcBracketPicksTable.isCorrect} IS TRUE THEN CASE ${wcBracketPicksTable.round} WHEN 'round_of_32' THEN 10 WHEN 'round_of_16' THEN 20 WHEN 'quarterfinals' THEN 40 WHEN 'semifinals' THEN 80 WHEN 'final' THEN 160 ELSE 0 END ELSE 0 END), 0)`,
              correct: sql<string>`COUNT(*) FILTER (WHERE ${wcBracketPicksTable.isCorrect} IS TRUE)`,
              picked: sql<string>`COUNT(*)`,
            })
            .from(wcBracketPicksTable)
            .where(eq(wcBracketPicksTable.poolId, pool.id))
            .groupBy(wcBracketPicksTable.userId),
          // Current-round picks only: used for hasPicks so stale prior-round
          // picks don't falsely mark the player as having submitted this round.
          currentRoundEventIds && currentRoundEventIds.length > 0
            ? db
                .select({
                  userId: wcBracketPicksTable.userId,
                  cnt: sql<string>`COUNT(*)`,
                })
                .from(wcBracketPicksTable)
                .where(
                  and(
                    eq(wcBracketPicksTable.poolId, pool.id),
                    inArray(wcBracketPicksTable.espnEventId, currentRoundEventIds),
                  ),
                )
                .groupBy(wcBracketPicksTable.userId)
            : Promise.resolve([] as { userId: number; cnt: string }[]),
        ]);

        const myRow = allPickRows.find((r) => r.userId === userId) ?? null;
        const currentRoundPickMap = new Map(currentRoundPickRows.map((r) => [r.userId, Number(r.cnt)]));
        const hasPicks =
          (currentRoundEventIds?.length ?? 0) > 0 &&
          (currentRoundPickMap.get(userId) ?? 0) > 0;

        return {
          poolId: pool.id,
          isActive: pool.isActive,
          poolType,
          lastWinners: null,
          myStanding: {
            rank: computeRank(allPickRows.map((r) => ({ ...r, score: Number(r.score) })), userId),
            isTied: computeIsTied(allPickRows.map((r) => ({ ...r, score: Number(r.score) })), userId),
            correct: myRow ? Number(myRow.correct) : 0,
            picked: myRow ? Number(myRow.picked) : 0,
            hasPicks,
            status: null,
            eliminatedWeek: null,
            score: myRow ? Number(myRow.score) : null,
            maxScore: null,
          },
          poolName: pool.name,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
        };
      }

      // ── Crazy 8's (weekly scoring, MLB) ─────────────────────────────────────
      if (poolType === "crazy_8s") {
        const weekStart = currentWeekBounds.weekStart;
        const weekEnd = currentWeekBounds.weekEnd;
        const prevStart = prevWeekBounds.weekStart;
        const prevEnd = prevWeekBounds.weekEnd;

        const c8WeeklyPointsSql = sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0)`;

        const [initialCurrentRows, prevRows] = await Promise.all([
          db
            .select({
              userId: pickemPicksTable.userId,
              weeklyPoints: c8WeeklyPointsSql,
              picked: sql<string>`COUNT(*)`,
              correctCount: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct' AND ${pickemPicksTable.gameDate} BETWEEN ${weekStart} AND ${weekEnd})`,
            })
            .from(pickemPicksTable)
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                gte(pickemPicksTable.gameDate, weekStart),
                lte(pickemPicksTable.gameDate, weekEnd),
              )
            )
            .groupBy(pickemPicksTable.userId)
            .orderBy(
              sql`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0) DESC`
            ),
          db
            .select({
              userId: pickemPicksTable.userId,
              username: usersTable.username,
              displayName: usersTable.displayName,
              weeklyPoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0)`,
              picked: sql<string>`COUNT(*)`,
            })
            .from(pickemPicksTable)
            .innerJoin(usersTable, eq(pickemPicksTable.userId, usersTable.id))
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                gte(pickemPicksTable.gameDate, prevStart),
                lte(pickemPicksTable.gameDate, prevEnd),
              )
            )
            .groupBy(pickemPicksTable.userId, usersTable.username, usersTable.displayName)
            .orderBy(
              sql`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0) DESC`
            ),
        ]);

        // BUG 2 fix: if no picks in the current week, fall back to the most
        // recent week that has picks for this user (e.g. NHL off-season).
        let currentRows = initialCurrentRows;
        if (currentRows.length === 0) {
          const [latestPickRow] = await db
            .select({ gameDate: pickemPicksTable.gameDate })
            .from(pickemPicksTable)
            .where(and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.userId, userId),
              sql`${pickemPicksTable.gameDate} IS NOT NULL`,
            ))
            .orderBy(sql`${pickemPicksTable.gameDate} DESC NULLS LAST`)
            .limit(1);
          if (latestPickRow?.gameDate) {
            const fallbackBounds = getWeekBoundsEt(latestPickRow.gameDate);
            currentRows = await db
              .select({
                userId: pickemPicksTable.userId,
                weeklyPoints: sql<string>`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0)`,
                picked: sql<string>`COUNT(*)`,
                correctCount: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct' AND ${pickemPicksTable.gameDate} BETWEEN ${fallbackBounds.weekStart} AND ${fallbackBounds.weekEnd})`,
              })
              .from(pickemPicksTable)
              .where(and(
                eq(pickemPicksTable.poolId, pool.id),
                gte(pickemPicksTable.gameDate, fallbackBounds.weekStart),
                lte(pickemPicksTable.gameDate, fallbackBounds.weekEnd),
              ))
              .groupBy(pickemPicksTable.userId)
              .orderBy(sql`COALESCE(SUM(CASE WHEN pickem_picks.result = 'correct' THEN COALESCE(pickem_picks.confidence_points::integer, 0) ELSE 0 END), 0) DESC`);
          }
        }

        const myIdx = currentRows.findIndex((r) => r.userId === userId);
        const myRow = myIdx >= 0 ? currentRows[myIdx] : null;

        const prevWeekEnded = prevWeekBounds.weekEnd < todayEt;
        const topPrevPts = prevRows.length > 0 ? Number(prevRows[0].weeklyPoints) : 0;
        const tiedPrevRows =
          prevWeekEnded && topPrevPts > 0
            ? prevRows.filter((r) => Number(r.weeklyPoints) === topPrevPts)
            : [];
        const lastWinners =
          tiedPrevRows.length > 0
            ? tiedPrevRows.map((r) => ({
                userId: r.userId,
                username: r.username,
                displayName: r.displayName ?? null,
                score: Number(r.weeklyPoints),
                correct: null,
                picked: null,
                prizeWon: computeSplitPrize(pool, tiedPrevRows.length, memberCountMap.get(pool.id) ?? 0),
              }))
            : null;

        return {
          poolId: pool.id,
          isActive: pool.isActive,
          poolName: pool.name,
          poolType,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
          lastWinners,
          myStanding: {
            rank: myRow ? myIdx + 1 : 0,
            isTied: myRow ? currentRows.filter(r => Number(r.weeklyPoints) === Number(myRow!.weeklyPoints)).length > 1 : false,
            correct: myRow ? Number(myRow.correctCount) : 0,
            picked: myRow ? Number(myRow.picked) : 0,
            hasPicks: myRow ? Number(myRow.picked) > 0 : false,
            status: null,
            eliminatedWeek: null,
            score: myRow ? Number(myRow.weeklyPoints) : null,
            maxScore: null,
          },
        };
      }

      // ── MLB / World Cup pickem (original logic) ─────────────────────────────
      const sport = pool.sport as string;
      const isWc = sport === "worldcup";
      const isIntl = sport === "intl";
      const isWeekly = pool.pickFrequency === "weekly" && !isWc && !isIntl;

      // ── Ended daily pickem: use actual game date and entries.finalWinner ─────
      // The standard path below uses todayEt / yesterdayEt which are wrong once
      // the pool's game day has passed. For ended non-recurring daily pools we
      // look up the most recent game_date in the picks table and read lastWinners
      // directly from the entries.final_winner flag set by process-results.
      if (!isWeekly && !isWc && !isIntl && !pool.isActive) {
        const [latestDateRow] = await db
          .select({ gameDate: pickemPicksTable.gameDate })
          .from(pickemPicksTable)
          .where(eq(pickemPicksTable.poolId, pool.id))
          .orderBy(sql`${pickemPicksTable.gameDate} DESC`)
          .limit(1);

        const actualGameDate = latestDateRow?.gameDate ?? null;

        const [currentRows, winnerRows] = await Promise.all([
          actualGameDate
            ? db
                .select({
                  userId: pickemPicksTable.userId,
                  correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
                  picked: sql<string>`COUNT(*)`,
                })
                .from(pickemPicksTable)
                .where(and(
                  eq(pickemPicksTable.poolId, pool.id),
                  eq(pickemPicksTable.gameDate, actualGameDate),
                ))
                .groupBy(pickemPicksTable.userId)
                .orderBy(
                  sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
                  sql`COUNT(*) DESC`,
                )
            : Promise.resolve([] as { userId: number; correct: string; picked: string }[]),
          db
            .select({
              userId: entriesTable.userId,
              username: usersTable.username,
              displayName: usersTable.displayName,
            })
            .from(entriesTable)
            .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
            .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true))),
        ]);

        const myIdx = currentRows.findIndex((r) => r.userId === userId);
        const myRow = myIdx >= 0 ? currentRows[myIdx] : null;

        const lastWinners =
          winnerRows.length > 0
            ? winnerRows.map((w) => {
                const scoreRow = currentRows.find((r) => r.userId === w.userId);
                return {
                  userId: w.userId,
                  username: w.username,
                  displayName: w.displayName ?? null,
                  correct: scoreRow ? Number(scoreRow.correct) : null,
                  picked: scoreRow ? Number(scoreRow.picked) : null,
                  score: null,
                  prizeWon: computeSplitPrize(pool, winnerRows.length, memberCountMap.get(pool.id) ?? 0),
                };
              })
            : null;

        const myStanding =
          myRow != null
            ? {
                rank: myIdx + 1,
                isTied: currentRows.filter(r => Number(r.correct) === Number(myRow!.correct)).length > 1,
                correct: Number(myRow.correct),
                picked: Number(myRow.picked),
                hasPicks: Number(myRow.picked) > 0,
                status: null, eliminatedWeek: null, score: null, maxScore: null,
              }
            : { rank: 0, isTied: false, correct: 0, picked: 0, hasPicks: false, status: null, eliminatedWeek: null, score: null, maxScore: null };

        return {
          poolId: pool.id,
          isActive: pool.isActive,
          poolName: pool.name,
          poolType,
          sport: pool.sport as string,
          totalPlayers: memberCountMap.get(pool.id) ?? 0,
          lastWinners,
          myStanding,
        };
      }

      // ── Ended weekly pickem: use the actual game week, not the current week ──
      // The active path below uses currentWeekBounds which is wrong once the
      // pool's game week has passed. Detect this case and look up the actual
      // game week from the picks table, mirroring the ended-daily guard above.
      if (isWeekly && !pool.isActive) {
        const [latestWeeklyRow] = await db
          .select({ gameDate: pickemPicksTable.gameDate })
          .from(pickemPicksTable)
          .where(and(
            eq(pickemPicksTable.poolId, pool.id),
            sql`${pickemPicksTable.gameDate} IS NOT NULL`,
          ))
          .orderBy(sql`${pickemPicksTable.gameDate} DESC NULLS LAST`)
          .limit(1);

        if (latestWeeklyRow?.gameDate) {
          const actualWeekBounds = getWeekBoundsEt(latestWeeklyRow.gameDate);
          const [currentRows, winnerRows] = await Promise.all([
            db
              .select({
                userId: pickemPicksTable.userId,
                correct: sql<string>`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct')`,
                picked: sql<string>`COUNT(*)`,
              })
              .from(pickemPicksTable)
              .where(and(
                eq(pickemPicksTable.poolId, pool.id),
                gte(pickemPicksTable.gameDate, actualWeekBounds.weekStart),
                lte(pickemPicksTable.gameDate, actualWeekBounds.weekEnd),
              ))
              .groupBy(pickemPicksTable.userId)
              .orderBy(
                sql`COUNT(*) FILTER (WHERE ${pickemPicksTable.result} = 'correct') DESC`,
                sql`COUNT(*) DESC`,
              ),
            db
              .select({
                userId: entriesTable.userId,
                username: usersTable.username,
                displayName: usersTable.displayName,
              })
              .from(entriesTable)
              .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
              .where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.finalWinner, true))),
          ]);

          const myIdx = currentRows.findIndex((r) => r.userId === userId);
          const myRow = myIdx >= 0 ? currentRows[myIdx] : null;

          const lastWinners =
            winnerRows.length > 0
              ? winnerRows.map((w) => {
                  const scoreRow = currentRows.find((r) => r.userId === w.userId);
                  return {
                    userId: w.userId,
                    username: w.username,
                    displayName: w.displayName ?? null,
                    correct: scoreRow ? Number(scoreRow.correct) : null,
                    picked: scoreRow ? Number(scoreRow.picked) : null,
                    score: null,
                    prizeWon: computeSplitPrize(pool, winnerRows.length, memberCountMap.get(pool.id) ?? 0),
                  };
                })
              : null;

          const myStanding =
            myRow != null
              ? {
                  rank: myIdx + 1,
                  isTied: currentRows.filter(r => Number(r.correct) === Number(myRow!.correct)).length > 1,
                  correct: Number(myRow.correct),
                  picked: Number(myRow.picked),
                  hasPicks: Number(myRow.picked) > 0,
                  status: null, eliminatedWeek: null, score: null, maxScore: null,
                }
              : { rank: 0, isTied: false, correct: 0, picked: 0, hasPicks: false, status: null, eliminatedWeek: null, score: null, maxScore: null };

          return {
            poolId: pool.id,
            isActive: pool.isActive,
            poolName: pool.name,
            poolType,
            sport: pool.sport as string,
            totalPlayers: memberCountMap.get(pool.id) ?? 0,
            lastWinners,
            myStanding,
          };
        }
      }

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
              isTied: currentRows.filter(r => Number(r.correct) === Number(currentRows[myIdx].correct)).length > 1,
              correct: Number(currentRows[myIdx].correct),
              picked: Number(currentRows[myIdx].picked),
              hasPicks: Number(currentRows[myIdx].picked) > 0,
              status: null, eliminatedWeek: null, score: null, maxScore: null,
            }
          : { rank: 0, isTied: false, correct: 0, picked: 0, hasPicks: false, status: null, eliminatedWeek: null, score: null, maxScore: null };

      return {
        poolId: pool.id,
        isActive: pool.isActive,
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
