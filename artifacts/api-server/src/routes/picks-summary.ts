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
} from "@workspace/db";
import { eq, and, count, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getTodayEtDate } from "../lib/espn";
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
    })
    .from(poolsTable)
    .where(inArray(poolsTable.id, poolIds));

  const pools = allPools.filter((p) => p.isActive);

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
      };

      // ── Survivor (season / weekly / mid_season) ────────────────────────────
      if (SURVIVOR_TYPES.has(poolType)) {
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
        const [countRow] = await db
          .select({ cnt: count() })
          .from(pickemPicksTable)
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.userId, userId),
              isDaily
                ? eq(pickemPicksTable.gameDate, todayEt)
                : eq(pickemPicksTable.week, pool.currentWeek),
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
        const isDaily = pool.pickFrequency === "daily";
        const [countRow] = await db
          .select({ cnt: count() })
          .from(pickemPicksTable)
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.userId, userId),
              isDaily
                ? eq(pickemPicksTable.gameDate, todayEt)
                : eq(pickemPicksTable.week, pool.currentWeek),
            ),
          );

        const picked = countRow?.cnt ?? 0;
        return {
          ...base,
          pickStatus: (picked > 0 ? "submitted" : "pending") as PickStatus,
          summary: picked > 0 ? `${picked} picks ${isDaily ? "today" : "this week"}` : null,
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
