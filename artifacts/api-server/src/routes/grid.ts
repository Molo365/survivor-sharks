import { Router } from "express";
import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/grid
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

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
    joinedAt: entriesTable.joinedAt,
  }).from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId));

  const allPicks = await db.select().from(picksTable).where(eq(picksTable.poolId, poolId));

  const weekSet = new Set(allPicks.map(p => p.week));
  const weeks: number[] = weekSet.size > 0
    ? [...weekSet].sort((a, b) => a - b)
    : Array.from({ length: pool.currentWeek }, (_, i) => i + 1);

  const picksWithUsername = await db.select({
    pick: picksTable,
    username: usersTable.username,
  }).from(picksTable)
    .innerJoin(usersTable, eq(picksTable.userId, usersTable.id))
    .where(eq(picksTable.poolId, poolId));

  res.json({
    poolId,
    weeks,
    members: members.map(m => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    picks: picksWithUsername.map(({ pick, username }) => {
      // Always show the requesting user's own pick.
      // For other players, hide the team selection until the game has a result
      // (win or loss) — i.e. the game has completed and been graded. This
      // prevents counter-picking based on others' choices before kickoff.
      // In-progress games remain hidden (result still "pending") which is
      // acceptable since picks are already locked at that point.
      const isOwnPick = pick.userId === userId;
      const isGraded = pick.result !== "pending";
      const showTeam = isOwnPick || isGraded;

      return {
        id: pick.id,
        entryId: pick.entryId,
        poolId: pick.poolId,
        userId: pick.userId,
        username,
        teamId: showTeam ? pick.teamId : null,
        teamName: showTeam ? pick.teamName : null,
        teamLogoUrl: showTeam ? pick.teamLogoUrl : null,
        week: pick.week,
        result: pick.result,
        submittedAt: pick.submittedAt.toISOString(),
      };
    }),
  });
});

export default router;
