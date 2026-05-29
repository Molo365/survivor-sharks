import { Router } from "express";
import { db } from "@workspace/db";
import { weekResultsTable, picksTable, entriesTable, poolsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCompletedGameResults } from "../lib/espn";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/results
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const results = await db.select().from(weekResultsTable)
    .where(eq(weekResultsTable.poolId, poolId))
    .orderBy(weekResultsTable.week);

  res.json(results.map(r => ({
    id: r.id,
    poolId: r.poolId,
    week: r.week,
    losingTeamIds: r.losingTeamIds,
    processedAt: r.processedAt.toISOString(),
    processedBy: r.processedBy,
  })));
});

// POST /api/pools/:poolId/results
// Commissioner submits week results. Optionally can auto-fetch from ESPN
// by passing { week, autoFetch: true } instead of providing losingTeamIds.
router.post("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const { week, losingTeamIds, autoFetch } = req.body;

  if (!week) {
    res.status(400).json({ error: "week is required" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.commissionerId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Only the commissioner can process results" });
    return;
  }

  // Resolve losing teams — either from ESPN or from the request body
  let losingSet: Set<string>;

  if (autoFetch) {
    const { losers } = await getCompletedGameResults(pool.sport, week);
    if (losers.length === 0) {
      res.status(400).json({ error: "No completed games found on ESPN for this week yet. Try again later or submit results manually." });
      return;
    }
    losingSet = new Set(losers);
  } else {
    if (!losingTeamIds || !Array.isArray(losingTeamIds)) {
      res.status(400).json({ error: "losingTeamIds array is required when not using autoFetch" });
      return;
    }
    losingSet = new Set<string>(losingTeamIds);
  }

  // Grade all picks for this week
  const weekPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));

  const eliminated: string[] = [];
  const survived: string[] = [];

  for (const pick of weekPicks) {
    const result = losingSet.has(pick.teamId) ? "loss" : "win";
    await db.update(picksTable).set({ result }).where(eq(picksTable.id, pick.id));

    if (result === "loss") {
      eliminated.push(pick.userId.toString());
      await db.update(entriesTable)
        .set({ status: "eliminated", eliminatedWeek: week })
        .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, pick.userId)));
    } else {
      survived.push(pick.userId.toString());
    }
  }

  // Eliminate alive members who submitted no pick this week (forfeit)
  const pickedUserIds = new Set(weekPicks.map(p => p.userId));
  const aliveEntries = await db.select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

  for (const entry of aliveEntries) {
    if (!pickedUserIds.has(entry.userId)) {
      await db.update(entriesTable)
        .set({ status: "eliminated", eliminatedWeek: week })
        .where(eq(entriesTable.id, entry.id));
      eliminated.push(entry.userId.toString());
    }
  }

  // Record result
  await db.insert(weekResultsTable).values({
    poolId,
    week,
    losingTeamIds: [...losingSet],
    processedBy: req.user!.id,
  });

  res.json({ week, eliminated, survived, processedAt: new Date().toISOString() });
});

export default router;
