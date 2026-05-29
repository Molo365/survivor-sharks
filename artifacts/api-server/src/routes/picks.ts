import { Router } from "express";
import { db } from "@workspace/db";
import { picksTable, entriesTable, poolsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { isPickLocked } from "../lib/espn";
import { resolveTeam } from "../lib/teams-data";

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
  const { teamId, week, teamName: clientTeamName, teamLogoUrl: clientTeamLogoUrl } = req.body;

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

  // Load all user's picks for this pool
  const previousPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, userId)));

  // Team re-use rules depend on pool type:
  // - season:     can never reuse a team across any week
  // - weekly:     no restriction — each week is independent
  // - mid_season: same as season but only from startWeek onwards
  if (pool.poolType !== "weekly") {
    const relevantPicks = pool.poolType === "mid_season" && pool.startWeek
      ? previousPicks.filter(p => p.week >= pool.startWeek!)
      : previousPicks;

    const alreadyUsed = relevantPicks.some(p => p.teamId === teamId && p.week !== week);
    if (alreadyUsed) {
      res.status(400).json({ error: "You have already used this team in a previous week" });
      return;
    }
  }

  // Prefer the client-supplied name/logo (sourced from the live ESPN schedule) so
  // the stored value exactly matches what the user saw on the matchup card.
  // Fall back to static resolveTeam only if the client didn't send them.
  const resolved = resolveTeam(pool.sport, teamId);
  const teamName = (typeof clientTeamName === "string" && clientTeamName.trim())
    ? clientTeamName.trim()
    : resolved.teamName;
  const teamLogoUrl = (typeof clientTeamLogoUrl === "string" && clientTeamLogoUrl)
    ? clientTeamLogoUrl
    : resolved.teamLogoUrl;

  // Upsert pick for this week
  const existingPick = previousPicks.find(p => p.week === week);
  let pick: typeof picksTable.$inferSelect;

  if (existingPick) {
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

export default router;
