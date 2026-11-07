import { Router } from "express";
import { db } from "@workspace/db";
import { entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq, inArray, sql, desc, and, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { normalizeDisplayName } from "../lib/display-name";
import { normalizeRealName } from "../lib/real-name";
import { getCrazyEightsPlayerWeeklyLedger } from "../lib/crazy-eights-commissioner-balances";
import { getNflConfidenceWeeklyPlayerWeeklyLedger } from "../lib/nfl-confidence-weekly-commissioner-balances";
import {
  getWeeklyPickEmPlayerWeeklyLedger,
  isPickemWeeklyCommissionerBalancesPool,
} from "../lib/weekly-pickem-commissioner-balances";
import { getPickemSeasonPlayerWeeklyLedger } from "../lib/pickem-season-commissioner-balances";
import {
  getNflConfidencePlayerWeeklyLedger,
  isNflConfidenceCommissionerBalancesPool,
} from "../lib/nfl-confidence-commissioner-balances";
import { getSurvivorSeasonPlayerWeeklyLedger } from "../lib/survivor-season-commissioner-balances";
import {
  getNbaAtsPlayerWeeklyLedger,
  isNbaAtsCommissionerBalancesPool,
} from "../lib/nba-ats-commissioner-balances";

const router = Router();

// PATCH /api/users/me/reminders
router.patch("/me/reminders", requireAuth, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  const [user] = await db.update(usersTable)
    .set({ remindersEnabled: enabled })
    .where(eq(usersTable.id, req.user!.id))
    .returning({ remindersEnabled: usersTable.remindersEnabled });
  res.json({ remindersEnabled: user!.remindersEnabled });
});

// PATCH /api/users/me/display-name
router.patch("/me/display-name", requireAuth, async (req, res) => {
  const normalized = normalizeDisplayName(req.body?.displayName);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const [conflict] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      ne(usersTable.id, req.user!.id),
      sql`(
        lower(${usersTable.displayName}) = lower(${normalized.value})
        OR lower(${usersTable.username}) = lower(${normalized.value})
      )`,
    ))
    .limit(1);

  if (conflict) {
    res.status(409).json({
      error: "That name is already taken. Please choose another.",
    });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ displayName: normalized.value })
    .where(eq(usersTable.id, req.user!.id))
    .returning({ displayName: usersTable.displayName });

  res.json({ displayName: user?.displayName ?? normalized.value });
});

// PATCH /api/users/me/real-name
router.patch("/me/real-name", requireAuth, async (req, res) => {
  const normalized = normalizeRealName(req.body?.realName);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ realName: normalized.value })
    .where(eq(usersTable.id, req.user!.id))
    .returning({ realName: usersTable.realName });

  res.json({ realName: user?.realName ?? null });
});

// GET /api/users/me/balance
router.get("/me/balance", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const rows = await db
    .select({
      entryId: entriesTable.id,
      poolId: entriesTable.poolId,
      status: entriesTable.status,
      finalWinner: entriesTable.finalWinner,
      finishPosition: entriesTable.finishPosition,
      prizeAmount: entriesTable.prizeAmount,
      eliminatedWeek: entriesTable.eliminatedWeek,
      poolName: poolsTable.name,
      sport: poolsTable.sport,
      poolType: poolsTable.poolType,
      entryFee: poolsTable.entryFee,
      isActive: poolsTable.isActive,
      isRecurring: poolsTable.isRecurring,
      startWeek: poolsTable.startWeek,
      currentWeek: poolsTable.currentWeek,
      commissionerName: usersTable.displayName,
      commissionerUsername: usersTable.username,
    })
    .from(entriesTable)
    .innerJoin(poolsTable, eq(poolsTable.id, entriesTable.poolId))
    .innerJoin(usersTable, eq(usersTable.id, poolsTable.commissionerId))
    .where(eq(entriesTable.userId, userId))
    .orderBy(desc(poolsTable.isActive), desc(entriesTable.id));

  if (rows.length === 0) {
    res.json({ activePools: [], pastPools: [] });
    return;
  }

  // Fetch winner names for past pools
  const pastPoolIds = [...new Set(rows.filter((r) => !r.isActive).map((r) => r.poolId))];
  const winnersByPool = new Map<number, string[]>();
  if (pastPoolIds.length > 0) {
    const winnerRows = await db
      .select({
        poolId: entriesTable.poolId,
        winnerName: sql<string>`COALESCE(${usersTable.displayName}, ${usersTable.username})`,
      })
      .from(entriesTable)
      .innerJoin(usersTable, eq(usersTable.id, entriesTable.userId))
      .where(and(
        inArray(entriesTable.poolId, pastPoolIds),
        eq(entriesTable.finalWinner, true),
      ));
    for (const r of winnerRows) {
      const arr = winnersByPool.get(r.poolId) ?? [];
      arr.push(r.winnerName);
      winnersByPool.set(r.poolId, arr);
    }
  }

  function formatWinnerName(names: string[] | undefined): string | null {
    if (!names || names.length === 0) return null;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names[0]} +${names.length - 1} more`;
  }

  const activePools: Array<{
    poolId: number;
    poolName: string;
    sport: string;
    poolType: string;
    entryFee: number | null;
    commissionerName: string;
    status: string;
    isRecurring?: boolean | null;
    weeklyLedger?: {
      completedWeekCount: number;
      entryFee: number;
      entryWeeksCollected: number;
      entryFeeTotal: number;
      entryFeeRemaining: number;
      weeklyWon: number;
      outstandingNet: number;
    };
  }> = [];

  const pastPools: Array<{
    poolId: number;
    poolName: string;
    sport: string;
    poolType: string;
    entryFee: number | null;
    commissionerName: string;
    result: "won" | "lost" | "unknown";
    finishPosition: number | null;
    prizeAmount: number | null;
    netResult: number;
    winnerName: string | null;
  }> = [];

  for (const row of rows) {
    const commissionerName = row.commissionerName ?? row.commissionerUsername;

    if (row.isActive) {
      const activePool: (typeof activePools)[number] = {
        poolId: row.poolId,
        poolName: row.poolName,
        sport: row.sport as string,
        poolType: row.poolType as string,
        entryFee: row.entryFee ?? null,
        commissionerName,
        status: row.status,
        isRecurring: row.isRecurring,
      };
      const c8Ledger = await getCrazyEightsPlayerWeeklyLedger(
        {
          sport: row.sport as string,
          poolType: row.poolType as string,
          isRecurring: row.isRecurring,
          entryFee: row.entryFee,
          currentWeek: row.currentWeek,
        },
        row.poolId,
        userId,
      );
      const nflWeeklyLedger = await getNflConfidenceWeeklyPlayerWeeklyLedger(
        {
          poolType: row.poolType as string,
          isRecurring: row.isRecurring,
          entryFee: row.entryFee,
          startWeek: row.startWeek,
          currentWeek: row.currentWeek,
        },
        row.poolId,
        userId,
      );
      let pickemWeeklyLedger = null;
      let pickemSeasonLedger = null;
      let nflConfidenceSeasonLedger = null;
      let survivorSeasonLedger = null;
      let nbaAtsLedger = null;
      if (!c8Ledger && !nflWeeklyLedger) {
        const [fullPool] = await db.select().from(poolsTable).where(eq(poolsTable.id, row.poolId)).limit(1);
        if (
          fullPool
          && isPickemWeeklyCommissionerBalancesPool({
            sport: fullPool.sport,
            poolType: fullPool.poolType,
            pickFrequency: fullPool.pickFrequency,
            isRecurring: fullPool.isRecurring,
            entryFee: fullPool.entryFee,
          })
        ) {
          pickemWeeklyLedger = await getWeeklyPickEmPlayerWeeklyLedger(fullPool, row.poolId, userId);
        } else if (
          fullPool
          && (fullPool.poolType as string) === "pickem_season"
          && fullPool.entryFee != null
          && fullPool.entryFee > 0
        ) {
          pickemSeasonLedger = await getPickemSeasonPlayerWeeklyLedger(fullPool, row.poolId, userId);
        } else if (fullPool && isNflConfidenceCommissionerBalancesPool(fullPool)) {
          nflConfidenceSeasonLedger = await getNflConfidencePlayerWeeklyLedger(
            fullPool,
            row.poolId,
            userId,
          );
        } else if (fullPool && isNbaAtsCommissionerBalancesPool(fullPool)) {
          nbaAtsLedger = await getNbaAtsPlayerWeeklyLedger(fullPool, row.poolId, userId);
        } else if (fullPool) {
          survivorSeasonLedger = await getSurvivorSeasonPlayerWeeklyLedger(fullPool, row.poolId, userId);
        }
      }
      const weeklyLedger =
        c8Ledger
        ?? nflWeeklyLedger
        ?? pickemWeeklyLedger
        ?? pickemSeasonLedger
        ?? nflConfidenceSeasonLedger
        ?? nbaAtsLedger
        ?? survivorSeasonLedger;
      if (weeklyLedger) activePool.weeklyLedger = weeklyLedger;
      activePools.push(activePool);
    } else {
      let result: "won" | "lost" | "unknown" = "unknown";
      if (row.finalWinner) result = "won";
      else if (row.status === "eliminated") result = "lost";

      const prizeAmount = row.prizeAmount ?? null;
      const entryFee = row.entryFee ?? null;
      const netResult = (prizeAmount ?? 0) - (entryFee ?? 0);

      pastPools.push({
        poolId: row.poolId,
        poolName: row.poolName,
        sport: row.sport as string,
        poolType: row.poolType as string,
        entryFee,
        commissionerName,
        result,
        finishPosition: row.finishPosition ?? null,
        prizeAmount,
        netResult,
        winnerName: formatWinnerName(winnersByPool.get(row.poolId)),
      });
    }
  }

  res.json({ activePools, pastPools });
});

export default router;
