import { Router } from "express";
import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { isPickLocked } from "../lib/espn";

const router = Router({ mergeParams: true });

function formatPick(pick: typeof picksTable.$inferSelect, username: string) {
  return {
    id: pick.id,
    entryId: pick.entryId,
    poolId: pick.poolId,
    userId: pick.userId,
    username,
    teamId: pick.teamId,
    teamName: pick.teamName,
    teamLogoUrl: pick.teamLogoUrl,
    week: pick.week,
    result: pick.result,
    submittedAt: pick.submittedAt.toISOString(),
  };
}

// GET /api/pools/:poolId/picks  — current user's picks in this pool
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const picks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, userId)));

  res.json(picks.map(p => formatPick(p, req.user!.username)));
});

// POST /api/pools/:poolId/picks
router.post("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;
  const { teamId, week } = req.body;

  if (!teamId || !week) {
    res.status(400).json({ error: "teamId and week are required" });
    return;
  }

  // Load pool
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  // Check entry exists and is alive
  const [entry] = await db.select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);

  if (!entry) {
    res.status(403).json({ error: "Not a member of this pool" });
    return;
  }
  if (entry.status === "eliminated") {
    res.status(400).json({ error: "Eliminated players cannot make picks" });
    return;
  }

  // Check ESPN game-time lock
  const locked = await isPickLocked(pool.sport, teamId, week);
  if (locked) {
    res.status(400).json({ error: "This team's game has already started — pick is locked" });
    return;
  }

  // Check team not already used in a previous week
  const previousPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, userId)));

  const alreadyUsed = previousPicks.some(p => p.teamId === teamId && p.week !== week);
  if (alreadyUsed) {
    res.status(400).json({ error: "You have already used this team in a previous week" });
    return;
  }

  const { teamName, teamLogoUrl } = resolveTeamInfo(teamId, pool.sport);

  // Upsert pick for this week
  const existingPick = previousPicks.find(p => p.week === week);
  let pick: typeof picksTable.$inferSelect;

  if (existingPick) {
    // Changing pick — check new team's game hasn't started either
    const [updated] = await db.update(picksTable).set({
      teamId, teamName, teamLogoUrl, result: "pending",
    }).where(eq(picksTable.id, existingPick.id)).returning();
    pick = updated;
  } else {
    const [inserted] = await db.insert(picksTable).values({
      entryId: entry.id,
      poolId,
      userId,
      teamId,
      teamName,
      teamLogoUrl,
      week,
      result: "pending",
    }).returning();
    pick = inserted;
  }

  res.status(201).json(formatPick(pick, req.user!.username));
});

function resolveTeamInfo(teamId: string, sport: string): { teamName: string; teamLogoUrl: string | null } {
  if (sport === "fifa") {
    return { teamName: teamId, teamLogoUrl: `https://flagcdn.com/w80/${teamId.toLowerCase()}.png` };
  }
  const sportPath: Record<string, string> = { nfl: "nfl", nba: "nba", mlb: "mlb", nhl: "nhl" };
  return {
    teamName: teamId,
    teamLogoUrl: `https://a.espncdn.com/i/teamlogos/${sportPath[sport] ?? sport}/500/${teamId}.png`,
  };
}

export default router;
