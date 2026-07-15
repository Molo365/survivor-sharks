import { Router } from "express";
import { db } from "@workspace/db";
import {
  entriesTable,
  poolsTable,
  picksTable,
  pickemPicksTable,
  nflDivisionPredictorPicksTable,
  wcBracketPicksTable,
  groupStagePredictorPicksTable,
  pickemSeasonWeekGameCountsTable,
  sandboxGameScoresTable,
} from "@workspace/db";
import { eq, and, count, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getTodayEtDate, fetchGamesForDate } from "../lib/espn";
import { getCurrentBracketRoundEventIds } from "../lib/bracketRound";

const router = Router();

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season"]);
const PICKEM_TYPES = new Set(["pickem", "nfl_confidence", "nfl_confidence_weekly", "pickem_season"]);

type PickStatus = "submitted" | "pending" | "not_required";
const STATUS_ORDER: Record<PickStatus, number> = { pending: 0, submitted: 1, not_required: 2 };

// GET /api/picks/summary — returns pick status across all of the user's active pools
router.get("/summary", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const todayEt = getTodayEtDate();

  const memberships = await db
    .select({ poolId: entriesTable.poolId })
    .from(entriesTable)
    .where(eq(entriesTable.userId, userId));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const poolIds = memberships.map((m) => m.poolId);

  const allPools = await db
    .select({
      id: poolsTable.id,
      name: poolsTable.name,
      sport: poolsTable.sport,
      poolType: poolsTable.poolType,
      currentWeek: poolsTable.currentWeek,
      pickFrequency: poolsTable.pickFrequency,
      isActive: poolsTable.isActive,
      sandboxMode: poolsTable.sandboxMode,
    })
    .from(poolsTable)
    .where(inArray(poolsTable.id, poolIds));

  const pools = allPools.filter((p) => p.isActive);

  // ── Compute hasLiveGames for each pool ──────────────────────────────────
  const todayDateStr = todayEt.replace(/-/g, "");

  const sandboxPoolIds2 = pools.filter((p) => p.sandboxMode).map((p) => p.id);
  const sandboxLiveSet2 = new Set<number>();
  if (sandboxPoolIds2.length > 0) {
    const liveRows = await db
      .select({ poolId: sandboxGameScoresTable.poolId })
      .from(sandboxGameScoresTable)
      .where(and(
        inArray(sandboxGameScoresTable.poolId, sandboxPoolIds2),
        inArray(sandboxGameScoresTable.gameStatus, ["q1", "q2", "half", "q3", "q4", "in_progress"]),
      ));
    for (const r of liveRows) sandboxLiveSet2.add(r.poolId);
  }

  const uniqueSports2 = [...new Set(pools.filter((p) => !p.sandboxMode).map((p) => p.sport))];
  const sportsWithLive2 = new Set<string>();
  await Promise.all(uniqueSports2.map(async (sport) => {
    const games = await fetchGamesForDate(sport, todayDateStr);
    if (games.some((g) => g.status === "in_progress")) sportsWithLive2.add(sport);
  }));

  const hasLiveGamesFor2 = (pool: { id: number; sandboxMode: boolean | null; sport: string }): boolean => {
    if (pool.sandboxMode) return sandboxLiveSet2.has(pool.id);
    return sportsWithLive2.has(pool.sport);
  };

  const results = await Promise.all(
    pools.map(async (pool) => {
      const poolType = pool.poolType as string;
      const base = {
        poolId: pool.id,
        poolName: pool.name,
        poolType,
        sport: pool.sport,
        currentWeek: pool.currentWeek,
        poolUrl: `/pools/${pool.id}`,
        hasLiveGames: hasLiveGamesFor2(pool),
      };

      // ── Survivor (season / weekly / mid_season) ────────────────────────────
      if (SURVIVOR_TYPES.has(poolType)) {
        const [entry] = await db
          .select({ status: entriesTable.status })
          .from(entriesTable)
          .where(
            and(
              eq(entriesTable.poolId, pool.id),
              eq(entriesTable.userId, userId),
            ),
          )
          .limit(1);

        if (entry?.status === "eliminated") {
          return {
            ...base,
            pickStatus: "not_required" as PickStatus,
            summary: "Eliminated",
          };
        }

        const [pick] = await db
          .select({ teamName: picksTable.teamName })
          .from(picksTable)
          .where(
            and(
              eq(picksTable.poolId, pool.id),
              eq(picksTable.userId, userId),
              eq(picksTable.week, pool.currentWeek),
            ),
          )
          .limit(1);

        return {
          ...base,
          pickStatus: (pick ? "submitted" : "pending") as PickStatus,
          summary: pick ? pick.teamName : null,
        };
      }

      // ── Pickem / Confidence / Pick-Em Season ──────────────────────────────
      if (PICKEM_TYPES.has(poolType)) {
        const isDaily = pool.pickFrequency === "daily";
        // For ended daily pools (pool.isActive === false): omit the date filter
        // so any historical picks count — the game date has already passed.
        // For active daily pools: restrict to today's date.
        // For weekly/season pools: restrict to the current week number.
        const dateFilter = isDaily
          ? (pool.isActive ? eq(pickemPicksTable.gameDate, todayEt) : undefined)
          : eq(pickemPicksTable.week, pool.currentWeek);
        const [countRow] = await db
          .select({ cnt: count() })
          .from(pickemPicksTable)
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.userId, userId),
              dateFilter,
            ),
          );

        const picked = countRow?.cnt ?? 0;
        let total: number | null = null;

        if (poolType === "pickem_season") {
          const [gameCountRow] = await db
            .select({ gameCount: pickemSeasonWeekGameCountsTable.gameCount })
            .from(pickemSeasonWeekGameCountsTable)
            .where(
              and(
                eq(pickemSeasonWeekGameCountsTable.poolId, pool.id),
                eq(pickemSeasonWeekGameCountsTable.week, pool.currentWeek),
              ),
            )
            .limit(1);
          total = gameCountRow?.gameCount ?? null;
        }

        const summary =
          total !== null ? `${picked}/${total} picked` : `${picked} picked`;

        return {
          ...base,
          pickStatus: (picked > 0 ? "submitted" : "pending") as PickStatus,
          summary: picked > 0 || total !== null ? summary : null,
        };
      }

      // ── NFL Division Predictor ─────────────────────────────────────────────
      if (poolType === "nfl_division_predictor") {
        const [countRow] = await db
          .select({ cnt: count() })
          .from(nflDivisionPredictorPicksTable)
          .where(
            and(
              eq(nflDivisionPredictorPicksTable.poolId, pool.id),
              eq(nflDivisionPredictorPicksTable.userId, userId),
            ),
          );

        const hasAny = (countRow?.cnt ?? 0) > 0;
        return {
          ...base,
          pickStatus: (hasAny ? "submitted" : "pending") as PickStatus,
          summary: hasAny ? "All divisions predicted" : "Divisions not yet predicted",
        };
      }

      // ── Group Stage Predictor ──────────────────────────────────────────────
      if (poolType === "group_stage_predictor") {
        const [countRow] = await db
          .select({ cnt: count() })
          .from(groupStagePredictorPicksTable)
          .where(
            and(
              eq(groupStagePredictorPicksTable.poolId, pool.id),
              eq(groupStagePredictorPicksTable.userId, userId),
            ),
          );

        const hasAny = (countRow?.cnt ?? 0) > 0;
        return {
          ...base,
          pickStatus: (hasAny ? "submitted" : "pending") as PickStatus,
          summary: hasAny ? "All groups predicted" : null,
        };
      }

      // ── WC Bracket ────────────────────────────────────────────────────────
      if (poolType === "wc_bracket") {
        // Resolve the current active round's ESPN event IDs so we only count
        // picks for the round that is actually open/in-progress, not stale
        // picks from prior rounds (e.g. R32 picks when QF is now active).
        const currentRoundEventIds = await getCurrentBracketRoundEventIds(pool.id);

        if (!currentRoundEventIds || currentRoundEventIds.length === 0) {
          return {
            ...base,
            pickStatus: "pending" as PickStatus,
            summary: null,
          };
        }

        const [countRow] = await db
          .select({ cnt: count() })
          .from(wcBracketPicksTable)
          .where(
            and(
              eq(wcBracketPicksTable.poolId, pool.id),
              eq(wcBracketPicksTable.userId, userId),
              inArray(wcBracketPicksTable.espnEventId, currentRoundEventIds),
            ),
          );

        const picked = countRow?.cnt ?? 0;
        return {
          ...base,
          pickStatus: (picked > 0 ? "submitted" : "pending") as PickStatus,
          summary: picked > 0 ? `${picked}/${currentRoundEventIds.length} picked` : null,
        };
      }

      // ── Crazy 8s (daily or weekly — respects pickFrequency) ──────────────
      if (poolType === "crazy_8s" || poolType === "crazy_eights") {
        const isWeekly = pool.pickFrequency === "weekly";
        const [countRow] = await db
          .select({ cnt: count() })
          .from(pickemPicksTable)
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.userId, userId),
              isWeekly
                ? eq(pickemPicksTable.week, pool.currentWeek)
                : eq(pickemPicksTable.gameDate, todayEt),
            ),
          );

        const picked = countRow?.cnt ?? 0;
        return {
          ...base,
          pickStatus: (picked > 0 ? "submitted" : "pending") as PickStatus,
          summary: picked > 0 ? `${picked} ${isWeekly ? "picks this week" : "picks today"}` : null,
        };
      }

      // ── Unsupported pool type ──────────────────────────────────────────────
      return {
        ...base,
        pickStatus: "not_required" as PickStatus,
        summary: null,
      };
    }),
  );

  results.sort(
    (a, b) =>
      STATUS_ORDER[a.pickStatus as PickStatus] -
      STATUS_ORDER[b.pickStatus as PickStatus],
  );

  res.json(results);
});

export default router;
