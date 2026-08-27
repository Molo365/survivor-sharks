import { Router } from "express";
import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchGames, fetchNflGamesByWeek } from "../lib/espn";

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

  // Build teamId -> kickoff Date map by fetching each unique week's games once.
  // A grid must never expose an opponent's pending pick before that team plays.
  const teamKickoffMap = new Map<string, Date>();
  if (!pool.sandboxMode && weekSet.size > 0) {
    const seasonType = pool.isPreseason ? 1 : 2;
    const uniqueWeeks = [...weekSet];
    const weekGamesList = await Promise.all(
      uniqueWeeks.map((week) => pool.sport === "nfl"
        ? fetchNflGamesByWeek(week, pool.season ?? undefined, seasonType)
        : fetchGames(pool.sport, week, pool.season ?? undefined, seasonType)),
    );
    for (const games of weekGamesList) {
      for (const game of games) {
        const kickoff = new Date(game.date);
        teamKickoffMap.set(game.homeTeam.id, kickoff);
        teamKickoffMap.set(game.awayTeam.id, kickoff);
      }
    }
  }

  const now = new Date();

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
