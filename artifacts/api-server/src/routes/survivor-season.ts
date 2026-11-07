import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { poolsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { applyWeeklyPickEmCommissionerLedgerPatch } from "../lib/weekly-pickem-commissioner-ledger";
import {
  buildSurvivorSeasonCommissionerBalanceSheet,
  isSurvivorSeasonCommissionerBalancesPool,
} from "../lib/survivor-season-commissioner-balances";

const router: IRouter = Router({ mergeParams: true });

async function loadPoolAndAuthorize(
  poolId: number,
  userId: number,
): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; pool: typeof poolsTable.$inferSelect }
> {
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) return { ok: false, status: 404, error: "Pool not found" };
  if (!isSurvivorSeasonCommissionerBalancesPool(pool)) {
    return { ok: false, status: 400, error: "Not a paid Survivor Season pool" };
  }

  const isCommissioner = pool.commissionerId === userId;
  const [userRow] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!isCommissioner && userRow?.role !== "admin") {
    return { ok: false, status: 403, error: "Commissioner or admin only" };
  }

  return { ok: true, pool };
}

// GET /api/pools/:poolId/survivor-season/commissioner-balances
router.get("/commissioner-balances", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const auth = await loadPoolAndAuthorize(poolId, req.user!.id);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const sheet = await buildSurvivorSeasonCommissionerBalanceSheet(auth.pool, poolId);
  res.json(sheet);
});

// PATCH /api/pools/:poolId/survivor-season/commissioner-balances
router.patch("/commissioner-balances", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const auth = await loadPoolAndAuthorize(poolId, req.user!.id);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const body = req.body as {
    entryPaid?: { userId: number; paid: boolean };
    periodPaid?: { periodKey: string; paid: boolean };
    mergeDeviceState?: { entryUserIds?: number[]; periodKeys?: string[] };
  };

  const hasPatch =
    body?.entryPaid != null ||
    body?.periodPaid != null ||
    (body?.mergeDeviceState != null &&
      ((body.mergeDeviceState.entryUserIds?.length ?? 0) > 0 ||
        (body.mergeDeviceState.periodKeys?.length ?? 0) > 0));

  if (!hasPatch) {
    res.status(400).json({ error: "No ledger update provided" });
    return;
  }

  try {
    await applyWeeklyPickEmCommissionerLedgerPatch(poolId, body, { maxEntryWeeks: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid ledger update";
    res.status(400).json({ error: message });
    return;
  }

  const sheet = await buildSurvivorSeasonCommissionerBalanceSheet(auth.pool, poolId);
  res.json(sheet);
});

export default router;
