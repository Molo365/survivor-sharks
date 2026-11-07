import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { poolsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  buildNbaAtsCommissionerBalanceSheet,
  isNbaAtsCommissionerBalancesPool,
  patchNbaAtsCommissionerLedger,
} from "../lib/nba-ats-commissioner-balances";

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
  if (!isNbaAtsCommissionerBalancesPool(pool)) {
    return { ok: false, status: 400, error: "Not a paid NBA ATS pool" };
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

router.get("/commissioner-balances", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const auth = await loadPoolAndAuthorize(poolId, req.user!.id);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
  const sheet = await buildNbaAtsCommissionerBalanceSheet(auth.pool, poolId);
  res.json(sheet);
});

router.patch("/commissioner-balances", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const auth = await loadPoolAndAuthorize(poolId, req.user!.id);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const body = req.body as Parameters<typeof patchNbaAtsCommissionerLedger>[1];

  try {
    const sheet = await patchNbaAtsCommissionerLedger(poolId, body, auth.pool);
    res.json(sheet);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
