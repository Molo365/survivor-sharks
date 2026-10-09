import { Router } from "express";
import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { buildSurvivorGridTeamKickoffMap } from "../lib/survivor-grid-kickoff";

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
    strikeCount: entriesTable.strikeCount,
    joinedAt: entriesTable.joinedAt,
  }).from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId));

  const allPicks = await db.select().from(picksTable).where(eq(picksTable.poolId, poolId));

  const weekSet = new Set(allPicks.map(p => p.week));
  const weeks: number[] = weekSet.size > 0
    ? [...weekSet].sort((a, b) => a - b)
    : Array.from({ length: pool.currentWeek }, (_, i) => i + 1);

  // Build teamId -> kickoff Date map by fetching each unique week's games once.
  // A grid must never expose an opponent's pending pick before that team plays.
  const teamKickoffMap = !pool.sandboxMode && weekSet.size > 0
    ? await buildSurvivorGridTeamKickoffMap(pool, [...weekSet])
    : new Map<string, Date>();

  const now = new Date();

  const picksWithUsername = await db.select({
    pick: picksTable,
    username: usersTable.username,
  }).from(picksTable)
    .innerJoin(usersTable, eq(picksTable.userId, usersTable.id))
    .where(eq(picksTable.poolId, poolId));

  const maxLives =
    (pool.sport === "nhl" || pool.sport === "nba") && pool.poolType === "season"
      ? 3
      : pool.doubleElimination
        ? 2
        : 1;

  res.json({
    poolId,
    maxLives,
    weeks,
    members: members.map(m => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    picks: picksWithUsername.map(({ pick, username }) => {
      // Own picks are always visible.
      // Other players' picks reveal at kickoff (picks are locked by then, so
      // revealing during an in-progress game is fine). isGraded is kept as a
      // safe fallback in case the team/kickoff lookup ever misses.
      const isOwnPick = pick.userId === userId;
      const isGraded  = pick.result !== "pending";

      let kickoffPassed = false;
       if (pick.teamId) {
        const kickoff = teamKickoffMap.get(pick.teamId);
        kickoffPassed = kickoff !== undefined && now >= kickoff;
      }

      const showTeam = isOwnPick || kickoffPassed || isGraded;

      return {
        id: pick.id,
        entryId: pick.entryId,
        poolId: pick.poolId,
        userId: pick.userId,
        username,
        teamId:      showTeam ? pick.teamId      : null,
        teamName:    showTeam ? pick.teamName     : null,
        teamLogoUrl: showTeam ? pick.teamLogoUrl  : null,
        week: pick.week,
        result: pick.result,
        submittedAt: pick.submittedAt.toISOString(),
      };
    }),
  });
});

export default router;
