import { Router } from "express";
import { db } from "@workspace/db";
import { poolMembersTable, poolsTable, picksTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/leaderboard
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const members = await db.select({
    userId: poolMembersTable.userId,
    username: usersTable.username,
    displayName: usersTable.displayName,
    status: poolMembersTable.status,
    eliminatedWeek: poolMembersTable.eliminatedWeek,
    joinedAt: poolMembersTable.joinedAt,
  }).from(poolMembersTable)
    .innerJoin(usersTable, eq(poolMembersTable.userId, usersTable.id))
    .where(eq(poolMembersTable.poolId, poolId));

  const entries = await Promise.all(members.map(async (member) => {
    const userPicks = await db.select().from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, member.userId)));

    const weeksAlive = member.status === "eliminated"
      ? (member.eliminatedWeek ?? 0)
      : pool.currentWeek;

    const lastPick = userPicks.sort((a, b) => b.week - a.week)[0];

    return {
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      status: member.status,
      weeksAlive,
      eliminatedWeek: member.eliminatedWeek,
      lastPickTeam: lastPick?.teamName ?? null,
      lastPickResult: lastPick?.result ?? null,
    };
  }));

  const active = entries
    .filter(e => e.status === "active")
    .sort((a, b) => b.weeksAlive - a.weeksAlive)
    .map((e, i) => ({ rank: i + 1, ...e }));

  const eliminated = entries
    .filter(e => e.status === "eliminated")
    .sort((a, b) => (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0))
    .map((e, i) => ({ rank: active.length + i + 1, ...e }));

  res.json({
    poolId,
    currentWeek: pool.currentWeek,
    active,
    eliminated,
  });
});

export default router;
