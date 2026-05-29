import { Router } from "express";
import { db } from "@workspace/db";
import { entriesTable, picksTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/eliminations
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const eliminated = await db.select({
    userId: entriesTable.userId,
    username: usersTable.username,
    displayName: usersTable.displayName,
    eliminatedWeek: entriesTable.eliminatedWeek,
    joinedAt: entriesTable.joinedAt,
  }).from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "eliminated")));

  const elimList = await Promise.all(eliminated.map(async (member) => {
    const week = member.eliminatedWeek ?? 0;
    const [pick] = await db.select().from(picksTable)
      .where(and(
        eq(picksTable.poolId, poolId),
        eq(picksTable.userId, member.userId),
        eq(picksTable.week, week),
      ))
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
