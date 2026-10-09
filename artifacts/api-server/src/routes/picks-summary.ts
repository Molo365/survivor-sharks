import { Router } from "express";
import { db } from "@workspace/db";
import {
  entriesTable,
  poolsTable,
  picksTable,
  pickemPicksTable,
  nflDivisionPredictorPicksTable,
  nhlDivisionPredictorPicksTable,
  wcBracketPicksTable,
  mlbBracketPicksTable,
  groupStagePredictorPicksTable,
  pickemSeasonWeekGameCountsTable,
} from "@workspace/db";
import { eq, and, count, inArray, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  getTodayEtDate,
  fetchGamesForDate,
  fetchNflGamesByWeek,
  fetchNhlGamesByWeek,
  getNbaWeekendBounds,
  fetchSuperLeagueGamesForDate,
  getWeekBoundsEt,
  getSuperLeagueWeekBoundsEt,
  getNhlWeekBounds,
  NHL_SANDBOX_ANCHOR,
} from "../lib/espn";
import { getCurrentBracketRoundEventIds } from "../lib/bracketRound";
import { getMlbHighHeatDailyStatus } from "../lib/mlb-high-heat-status";
import { getSuperLeagueConfiguredPeriod, isSuperLeaguePreStart } from "../lib/superleague-period";
import { isMlsWeeklyPreStart } from "../lib/mls-weekly-period";
import { NFL_DIVISIONS } from "../lib/nfl-divisions";
import { getNdpLockState } from "../lib/ndp-lock";
import { getNhlNdpLockState } from "../lib/nhl-ndp-lock";
import { isMlbBracketLocked } from "../lib/mlb-bracket-lock";
import { GSP_GROUP_COUNT } from "../lib/closePredictorPool";
import { getGspLockState } from "../lib/gsp-lock";
import {
  fetchPoolSlateGames,
  loadSandboxLivePoolIds,
  openSlateGames,
  poolSlateHasLiveGames,
} from "../lib/pool-slate-live";

const router = Router();

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season"]);
const PICKEM_TYPES = new Set(["pickem", "nfl_confidence", "nfl_confidence_weekly", "pickem_season", "nba_ats"]);

type PickStatus = "submitted" | "incomplete" | "pending" | "closed" | "not_required";
const STATUS_ORDER: Record<PickStatus, number> = { pending: 0, incomplete: 1, closed: 2, submitted: 3, not_required: 4 };

function datesInRange(start: string, end: string): string[] {
  const cursor = new Date(`${start}T00:00:00Z`);
  const finish = new Date(`${end}T00:00:00Z`);
  const dates: string[] = [];
  while (cursor <= finish) {
    dates.push(cursor.toISOString().slice(0, 10).replace(/-/g, ""));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function isGameLocked(game: { date: string; hasStarted: boolean }): boolean {
  return game.hasStarted || new Date(game.date).getTime() <= Date.now();
}

/** Align My Picks tab with dashboard pool cards (slate loaded, games not started yet). */
async function pickStatusFromOpenSlate(
  pool: Parameters<typeof fetchPoolSlateGames>[0],
  pickedGameIds: string[],
): Promise<PickStatus> {
  const games = await fetchPoolSlateGames(pool);
  const openGames = openSlateGames(games);
  if (pickedGameIds.length === 0) {
    return openGames.length === 0 ? "not_required" : "pending";
  }
  const pickedSet = new Set(pickedGameIds);
  return openGames.some((game) => !pickedSet.has(game.id)) ? "incomplete" : "submitted";
}

function allowsPartialPeriodStatus(pool: {
  poolType: string;
  sport: string;
  pickFrequency: string;
}): boolean {
  return pool.poolType === "pickem_season"
    || pool.poolType === "nfl_confidence"
    || pool.poolType === "nfl_confidence_weekly"
    || pool.poolType === "nba_ats"
    || (pool.sport === "superleague" && pool.pickFrequency === "weekly")
    || (pool.sport === "nhl" && pool.pickFrequency === "weekly");
}

async function getPartialPeriodGames(pool: {
  poolType: string;
  sport: string;
  pickFrequency: string;
  currentWeek: number;
  season: number;
  isPreseason: boolean | null;
  sandboxMode: boolean | null;
  createdAt: Date;
  initialPeriodStart: string | null;
}): Promise<Awaited<ReturnType<typeof fetchGamesForDate>>> {
  if (pool.poolType === "pickem_season"
    || pool.poolType === "nfl_confidence"
    || pool.poolType === "nfl_confidence_weekly") {
    return fetchNflGamesByWeek(pool.currentWeek, pool.season, pool.isPreseason ? 1 : 2);
  }

  if (pool.poolType === "nba_ats") {
    const dates = getNbaWeekendBounds(pool.createdAt, pool.currentWeek).espnDates;
    const results = await Promise.all(dates.map((date) => fetchGamesForDate("nba", date)));
    const seen = new Set<string>();
    return results.flat().filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    });
  }

  if (pool.sport === "superleague" && pool.pickFrequency === "weekly") {
    const bounds = getSuperLeagueConfiguredPeriod(pool);
    const results = await Promise.all(
      datesInRange(bounds.weekStart, bounds.weekEnd).map(fetchSuperLeagueGamesForDate),
    );
    const seen = new Set<string>();
    return results.flat().filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    });
  }

  return fetchNhlGamesByWeek(
    pool.createdAt,
    pool.currentWeek,
    pool.isPreseason ? 1 : 2,
    pool.initialPeriodStart,
  );
}

// GET /api/picks/summary — returns pick status across all of the user's active pools
router.get("/summary", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const todayEt = getTodayEtDate();
  const { weekStart, weekEnd } = getWeekBoundsEt(todayEt);

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
      initialPeriodStart: poolsTable.initialPeriodStart,
      season: poolsTable.season,
      isPreseason: poolsTable.isPreseason,
      createdAt: poolsTable.createdAt,
    })
    .from(poolsTable)
    .where(inArray(poolsTable.id, poolIds));

  const pools = allPools.filter((p) => p.isActive);

  // ── Compute hasLiveGames for each pool ──────────────────────────────────
  const todayDateStr = todayEt.replace(/-/g, "");

  const sandboxPoolIds2 = pools.filter((p) => p.sandboxMode).map((p) => p.id);
  const sandboxLiveSet2 = await loadSandboxLivePoolIds(sandboxPoolIds2);

  const dailyPickemSports = [...new Set(
    pools.filter((p) => p.poolType === "pickem" && p.pickFrequency === "daily").map((p) => p.sport as string),
  )];
  const sportsWithGamesTodaySet = new Set<string>();
  await Promise.all(dailyPickemSports.map(async (sport) => {
    const games = sport === "superleague"
      ? await fetchSuperLeagueGamesForDate(todayDateStr)
      : await fetchGamesForDate(sport, todayDateStr);
    if (games.length > 0) sportsWithGamesTodaySet.add(sport);
  }));

  const slateContext = (pool: typeof pools[number]) => ({
    id: pool.id,
    sport: pool.sport as string,
    poolType: pool.poolType as string,
    pickFrequency: pool.pickFrequency as string,
    currentWeek: pool.currentWeek,
    season: pool.season,
    isPreseason: pool.isPreseason,
    sandboxMode: pool.sandboxMode,
    isActive: pool.isActive,
    createdAt: pool.createdAt instanceof Date ? pool.createdAt : new Date(pool.createdAt),
    initialPeriodStart: pool.initialPeriodStart,
  });

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
        hasLiveGames: await poolSlateHasLiveGames(slateContext(pool), sandboxLiveSet2),
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
        if (isMlsWeeklyPreStart(pool) || isSuperLeaguePreStart(pool)) {
          return { ...base, pickStatus: "pending" as PickStatus, summary: null };
        }
        const isDaily = pool.pickFrequency === "daily";
        // MLS weekly pools use Mon–Sun; Super League uses its dedicated Fri–Mon
        // window, mirroring the /week-games endpoint.
        // pool.currentWeek is unreliable for recurring pools (may lag the calendar),
        // so we use gameDate BETWEEN weekStart AND weekEnd instead.
        const isMlsOrSlWeekly =
          (pool.sport === "mls" || pool.sport === "superleague") &&
          pool.pickFrequency === "weekly";
        // For ended daily pools (pool.isActive === false): omit the date filter
        // so any historical picks count — the game date has already passed.
        // For active daily pools: restrict to today's date.
        // For MLS/Super League weekly: restrict to their sport-specific current window.
        // For all other weekly/season pools: restrict to the current week number.
        const weeklyBounds = pool.sport === "superleague"
          ? getSuperLeagueConfiguredPeriod(pool)
          : { weekStart, weekEnd };
        const dateFilter = isDaily
          ? (pool.isActive ? eq(pickemPicksTable.gameDate, todayEt) : undefined)
          : isMlsOrSlWeekly
            ? and(
                gte(pickemPicksTable.gameDate, weeklyBounds.weekStart),
                lte(pickemPicksTable.gameDate, weeklyBounds.weekEnd),
              )
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
        let pickedGameIds = new Set<string>();

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

        if (picked > 0 && allowsPartialPeriodStatus(pool)) {
          const pickRows = await db
            .select({ gameId: pickemPicksTable.gameId })
            .from(pickemPicksTable)
            .where(
              and(
                eq(pickemPicksTable.poolId, pool.id),
                eq(pickemPicksTable.userId, userId),
                dateFilter,
              ),
            );
          pickedGameIds = new Set(pickRows.map((row) => row.gameId));
        }

        const summary =
          total !== null ? `${picked}/${total} picked` : `${picked} picked`;

        // MLB weekly: games play daily so the week-level pick count hides the
        // case where earlier days were picked but today has new unpicked games.
        // If ESPN shows games today for this sport and the user has zero picks
        // for today specifically, override the status to "pending".
        if (!isDaily && pool.sport === "mlb" && !pool.sandboxMode && sportsWithGamesTodaySet.has(pool.sport)) {
          const [todayCountRow] = await db
            .select({ cnt: count() })
            .from(pickemPicksTable)
            .where(and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.userId, userId),
              eq(pickemPicksTable.gameDate, todayEt),
            ));
          const pickedToday = todayCountRow?.cnt ?? 0;
          if (pickedToday === 0) {
            return {
              ...base,
              pickStatus: "pending" as PickStatus,
              summary: picked > 0 ? summary : null,
            };
          }
        }

        let pickStatus: PickStatus = picked > 0 ? "submitted" : "pending";
        if (allowsPartialPeriodStatus(pool)) {
          const games = await getPartialPeriodGames(pool);
          const openGames = openSlateGames(games);
          if (picked === 0) {
            if (openGames.length === 0) {
              pickStatus = "not_required";
            }
          } else {
            const pickedOpenGames = openGames.filter((game) => pickedGameIds.has(game.id));
            if (pickedOpenGames.length < openGames.length) {
              pickStatus = "incomplete";
            }
          }
        }

        const summaryText =
          pickStatus === "not_required" && (poolType === "pickem_season" || poolType === "nfl_confidence" || poolType === "nfl_confidence_weekly")
            ? `Week ${pool.currentWeek} · slate not open yet`
            : picked > 0 || total !== null
              ? summary
              : null;

        return {
          ...base,
          pickStatus,
          summary: summaryText,
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

        const picked = Number(countRow?.cnt ?? 0);
        const required = NFL_DIVISIONS.length;
        const complete = picked >= required;
        const lockState = await getNdpLockState(pool.season, pool.sandboxMode);
        const pickStatus: PickStatus = complete
          ? "submitted"
          : lockState.locked
            ? "closed"
            : picked > 0
              ? "incomplete"
              : "pending";
        return {
          ...base,
          pickStatus,
          summary: complete
            ? "All divisions predicted"
            : lockState.locked
              ? "Predictions closed - season started"
              : picked > 0
                ? `${picked}/${required} divisions predicted`
                : "Divisions not yet predicted",
        };
      }

      // ── NHL Division Predictor ─────────────────────────────────────────────
      if (poolType === "nhl_division_predictor") {
        const [countRow] = await db
          .select({ cnt: count() })
          .from(nhlDivisionPredictorPicksTable)
          .where(
            and(
              eq(nhlDivisionPredictorPicksTable.poolId, pool.id),
              eq(nhlDivisionPredictorPicksTable.userId, userId),
            ),
          );

        const picked = Number(countRow?.cnt ?? 0);
        const complete = picked >= 4;
        const lockState = await getNhlNdpLockState(pool.season, pool.sandboxMode);
        const pickStatus: PickStatus = complete
          ? "submitted"
          : lockState.locked
            ? "closed"
            : "pending";
        return {
          ...base,
          pickStatus,
          summary: complete
            ? "All divisions predicted"
            : lockState.locked
              ? "Predictions closed - season started"
              : "Divisions not yet predicted",
        };
      }

      // ── Group Stage Predictor ──────────────────────────────────────────────
      if (poolType === "group_stage_predictor") {
        const [[countRow], lockState] = await Promise.all([
          db
            .select({ cnt: count() })
            .from(groupStagePredictorPicksTable)
            .where(
              and(
                eq(groupStagePredictorPicksTable.poolId, pool.id),
                eq(groupStagePredictorPicksTable.userId, userId),
              ),
            ),
          Promise.resolve(getGspLockState(pool.season, pool.sandboxMode)),
        ]);

        const picked = Number(countRow?.cnt ?? 0);
        const complete = picked >= GSP_GROUP_COUNT;
        const pickStatus: PickStatus = complete
          ? "submitted"
          : lockState.locked
            ? "closed"
            : picked > 0
              ? "incomplete"
              : "pending";
        return {
          ...base,
          pickStatus,
          summary: complete
            ? "All groups predicted"
            : lockState.locked
              ? "Predictions closed - tournament started"
              : picked > 0
                ? `${picked}/${GSP_GROUP_COUNT} groups predicted`
                : null,
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

      if (poolType === "mlb_bracket") {
        const [[countRow], locked] = await Promise.all([
          db.select({ cnt: count() }).from(mlbBracketPicksTable)
            .where(and(eq(mlbBracketPicksTable.poolId, pool.id), eq(mlbBracketPicksTable.userId, userId))),
          isMlbBracketLocked(pool.id, pool.season, pool.sandboxMode),
        ]);
        const picked = Number(countRow?.cnt ?? 0);
        const complete = picked >= 11;
        return {
          ...base,
          pickStatus: (complete ? "submitted" : locked ? "closed" : "pending") as PickStatus,
          summary: complete
            ? `${picked}/11 series picked`
            : locked
              ? "Bracket closed - Wild Card started"
              : picked
                ? `${picked}/11 series picked`
                : null,
        };
      }

      // ── Crazy 8s (daily or weekly — respects pickFrequency) ──────────────
      if (poolType === "crazy_8s" || poolType === "crazy_eights") {
        if (pool.sport === "mlb") {
          const status = await getMlbHighHeatDailyStatus(pool.id, userId);
          return {
            ...base,
            pickStatus: (!status.hasRequirement
              ? "not_required"
              : status.isComplete
                ? "submitted"
                : "pending") as PickStatus,
            summary: status.hasRequirement
              ? `${status.pickedCount}/${status.requiredPickCount} picks today`
              : null,
          };
        }

        const isWeekly = pool.pickFrequency === "weekly";
        const ctx = slateContext(pool);

        let periodFilter;
        if (isWeekly && pool.sport === "nhl") {
          const anchor = pool.sandboxMode ? NHL_SANDBOX_ANCHOR : pool.createdAt;
          const initialPeriodStart = pool.sandboxMode ? null : pool.initialPeriodStart;
          const { days } = getNhlWeekBounds(anchor, pool.currentWeek, initialPeriodStart);
          periodFilter = inArray(pickemPicksTable.gameDate, days);
        } else {
          periodFilter = isWeekly
            ? eq(pickemPicksTable.week, pool.currentWeek)
            : eq(pickemPicksTable.gameDate, todayEt);
        }

        const pickRows = await db
          .select({ gameId: pickemPicksTable.gameId })
          .from(pickemPicksTable)
          .where(
            and(
              eq(pickemPicksTable.poolId, pool.id),
              eq(pickemPicksTable.userId, userId),
              periodFilter,
            ),
          );

        const picked = pickRows.length;
        const pickedGameIds = pickRows.map((row) => row.gameId);
        const slateGames = await fetchPoolSlateGames(ctx);
        const openGames = openSlateGames(slateGames);
        const pickStatus: PickStatus = pickedGameIds.length === 0
          ? (openGames.length === 0 ? "not_required" : "pending")
          : openGames.some((game) => !pickedGameIds.includes(game.id))
            ? "incomplete"
            : "submitted";
        const requiredPicks = isWeekly && (pool.sport === "nhl" || pool.sport === "nba")
          ? Math.min(8, openGames.length)
          : openGames.length;

        let summary: string | null = null;
        if (pickStatus === "not_required") {
          summary = openGames.length === 0
            ? `Week ${pool.currentWeek} · slate not open yet`
            : null;
        } else if (isWeekly && (pool.sport === "nhl" || pool.sport === "nba") && requiredPicks > 0) {
          summary = `${picked}/${requiredPicks} picked`;
        } else if (picked > 0) {
          summary = `${picked} ${isWeekly ? "picks this week" : "picks today"}`;
        }

        return {
          ...base,
          pickStatus,
          summary,
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
