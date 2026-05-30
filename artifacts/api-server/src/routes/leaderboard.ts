import { Router } from "express";
import { db } from "@workspace/db";
import { entriesTable, poolsTable, picksTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getMlbWeekBounds } from "../lib/espn";

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
    userId: entriesTable.userId,
    username: usersTable.username,
    displayName: usersTable.displayName,
    status: entriesTable.status,
    eliminatedWeek: entriesTable.eliminatedWeek,
    strikeCount: entriesTable.strikeCount,
    streak: entriesTable.streak,
    joinedAt: entriesTable.joinedAt,
  }).from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId));

  // MLB: compute deadline info for this week
  let deadlinePassed = false;
  if (pool.sport === "mlb") {
    const bounds = getMlbWeekBounds(pool.createdAt, pool.currentWeek);
    deadlinePassed = bounds.deadlinePassed;
  }

  const entries = await Promise.all(members.map(async (member) => {
    const userPicks = await db.select().from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, member.userId)));

    const weeksAlive = member.status === "eliminated"
      ? (member.eliminatedWeek ?? 0)
      : pool.currentWeek;

    const sortedPicks = userPicks.sort((a, b) => b.week - a.week);
    const lastPick = sortedPicks[0];

    // hasWonThisWeek: current week pick result is "win"
    const currentWeekPick = userPicks.find(p => p.week === pool.currentWeek);
    const hasWonThisWeek = currentWeekPick?.result === "win";

    return {
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      status: member.status === "alive" ? "active" : "eliminated",
      weeksAlive,
      eliminatedWeek: member.eliminatedWeek,
      lastPickTeam: lastPick?.teamName ?? null,
      lastPickResult: lastPick?.result ?? null,
      streak: member.streak,
      strikeCount: member.strikeCount,
      hasWonThisWeek,
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
    doubleElimination: pool.doubleElimination,
    deadlinePassed,
    active,
    eliminated,
  });
});

export default router;
