import { Router } from "express";
import { db } from "@workspace/db";
import { picksTable, poolMembersTable, poolsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router({ mergeParams: true });

function formatPick(pick: typeof picksTable.$inferSelect, username: string) {
  return {
    id: pick.id,
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

// GET /api/pools/:poolId/picks
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

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  // Check member is active
  const [member] = await db.select().from(poolMembersTable)
    .where(and(eq(poolMembersTable.poolId, poolId), eq(poolMembersTable.userId, userId)))
    .limit(1);

  if (!member) {
    res.status(403).json({ error: "Not a member of this pool" });
    return;
  }
  if (member.status === "eliminated") {
    res.status(400).json({ error: "Eliminated players cannot make picks" });
    return;
  }

  // Check team not already used
  const previousPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, userId)));

  const alreadyUsed = previousPicks.some(p => p.teamId === teamId && p.week !== week);
  if (alreadyUsed) {
    res.status(400).json({ error: "You have already used this team in a previous week" });
    return;
  }

  // Resolve team name + logo from ESPN-style data
  const { teamName, teamLogoUrl } = resolveTeamInfo(teamId, pool.sport);

  // Upsert pick for this week
  const existingPick = previousPicks.find(p => p.week === week);
  let pick: typeof picksTable.$inferSelect;

  if (existingPick) {
    const [updated] = await db.update(picksTable).set({
      teamId,
      teamName,
      teamLogoUrl,
      result: "pending",
    }).where(eq(picksTable.id, existingPick.id)).returning();
    pick = updated;
  } else {
    const [inserted] = await db.insert(picksTable).values({
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

// GET /api/pools/:poolId/grid
router.get("/grid", requireAuth, async (req, res) => {
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

  const allPicks = await db.select().from(picksTable).where(eq(picksTable.poolId, poolId));

  const weeks = [...new Set(allPicks.map(p => p.week))].sort((a, b) => a - b);
  if (weeks.length === 0) {
    for (let i = 1; i <= pool.currentWeek; i++) weeks.push(i);
  }

  // Build per-user pick map
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
    picks: picksWithUsername.map(({ pick, username }) => formatPick(pick, username)),
  });
});

function resolveTeamInfo(teamId: string, sport: string): { teamName: string; teamLogoUrl: string | null } {
  const sportLogoPaths: Record<string, string> = {
    nfl: "nfl",
    nba: "nba",
    mlb: "mlb",
    nhl: "nhl",
  };

  if (sport === "fifa") {
    return {
      teamName: teamId,
      teamLogoUrl: `https://flagcdn.com/w80/${teamId.toLowerCase()}.png`,
    };
  }

  return {
    teamName: teamId,
    teamLogoUrl: `https://a.espncdn.com/i/teamlogos/${sportLogoPaths[sport] ?? sport}/500/${teamId}.png`,
  };
}

export default router;
