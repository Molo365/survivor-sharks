import { Router } from "express";
import { db } from "@workspace/db";
import { weekResultsTable, picksTable, poolMembersTable, poolsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

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
router.post("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const { week, losingTeamIds } = req.body;

  if (!week || !losingTeamIds) {
    res.status(400).json({ error: "week and losingTeamIds are required" });
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

  const losingSet = new Set<string>(losingTeamIds);

  // Update all picks for this week
  const weekPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));

  const eliminated: string[] = [];
  const survived: string[] = [];

  for (const pick of weekPicks) {
    const result = losingSet.has(pick.teamId) ? "loss" : "win";
    await db.update(picksTable).set({ result }).where(eq(picksTable.id, pick.id));

    if (result === "loss") {
      eliminated.push(pick.userId.toString());
      await db.update(poolMembersTable)
        .set({ status: "eliminated", eliminatedWeek: week })
        .where(and(eq(poolMembersTable.poolId, poolId), eq(poolMembersTable.userId, pick.userId)));
    } else {
      survived.push(pick.userId.toString());
    }
  }

  // Eliminate members who did NOT submit a pick this week (they forfeit)
  const pickedUserIds = weekPicks.map(p => p.userId);
  const activeMembers = await db.select().from(poolMembersTable)
    .where(and(eq(poolMembersTable.poolId, poolId), eq(poolMembersTable.status, "active")));

  const noPickMembers = activeMembers.filter(m => !pickedUserIds.includes(m.userId));
  for (const m of noPickMembers) {
    await db.update(poolMembersTable)
      .set({ status: "eliminated", eliminatedWeek: week })
      .where(eq(poolMembersTable.id, m.id));
    eliminated.push(m.userId.toString());
  }

  // Store the week result record
  await db.insert(weekResultsTable).values({
    poolId,
    week,
    losingTeamIds,
    processedBy: req.user!.id,
  });

  res.json({
    week,
    eliminated,
    survived,
    processedAt: new Date().toISOString(),
  });
});

// GET /api/pools/:poolId/eliminations
router.get("/eliminations", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const eliminated = await db.select({
    userId: poolMembersTable.userId,
    username: usersTable.username,
    displayName: usersTable.displayName,
    eliminatedWeek: poolMembersTable.eliminatedWeek,
    joinedAt: poolMembersTable.joinedAt,
  }).from(poolMembersTable)
    .innerJoin(usersTable, eq(poolMembersTable.userId, usersTable.id))
    .where(and(eq(poolMembersTable.poolId, poolId), eq(poolMembersTable.status, "eliminated")));

  const elimList = await Promise.all(eliminated.map(async (member) => {
    const week = member.eliminatedWeek ?? 0;
    const [pick] = await db.select().from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, member.userId), eq(picksTable.week, week)))
      .limit(1);

    return {
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      week,
      teamId: pick?.teamId ?? "",
      teamName: pick?.teamName ?? "No pick",
      teamLogoUrl: pick?.teamLogoUrl ?? null,
      eliminatedAt: member.joinedAt.toISOString(),
    };
  }));

  res.json(elimList);
});

export default router;
