import { Router } from "express";
import { db } from "@workspace/db";
import { groupStagePredictorPicksTable, poolsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { WC_2026_GROUPS, getWcTeamInfo } from "../lib/wc";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/gsp/groups
router.get("/groups", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "group_stage_predictor") {
    res.status(400).json({ error: "This pool is not a Group Stage Predictor pool" });
    return;
  }

  const existingPicks = await db
    .select()
    .from(groupStagePredictorPicksTable)
    .where(and(
      eq(groupStagePredictorPicksTable.poolId, poolId),
      eq(groupStagePredictorPicksTable.userId, userId),
    ));

  const picksByGroup = new Map(existingPicks.map((p) => [p.groupName, p]));

  const groups = WC_2026_GROUPS.map((group) => {
    const pick = picksByGroup.get(group.name) ?? null;
    return {
      name: group.name,
      teams: group.teams.map((teamName) => getWcTeamInfo(teamName)),
      myPick: pick
        ? {
            groupName: pick.groupName,
            pos1Team: pick.pos1Team,
            pos2Team: pick.pos2Team,
            pos3Team: pick.pos3Team,
            pos4Team: pick.pos4Team,
          }
        : null,
    };
  });

  res.json(groups);
});

// POST /api/pools/:poolId/gsp/picks
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "group_stage_predictor") {
    res.status(400).json({ error: "This pool is not a Group Stage Predictor pool" });
    return;
  }

  const { picks } = req.body as {
    picks: Array<{
      groupName: string;
      pos1Team: string;
      pos2Team: string;
      pos3Team: string;
      pos4Team: string;
    }>;
  };

  if (!Array.isArray(picks) || picks.length === 0) {
    res.status(400).json({ error: "picks array is required" });
    return;
  }

  const validGroupMap = new Map(WC_2026_GROUPS.map((g) => [g.name, new Set(g.teams)]));

  for (const pick of picks) {
    const groupTeams = validGroupMap.get(pick.groupName);
    if (!groupTeams) {
      res.status(400).json({ error: `Invalid group: ${pick.groupName}` });
      return;
    }
    const submitted = [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team];
    if (!submitted.every((t) => groupTeams.has(t))) {
      res.status(400).json({ error: `Invalid teams for group ${pick.groupName}` });
      return;
    }
    if (new Set(submitted).size !== 4) {
      res.status(400).json({ error: `Duplicate teams in group ${pick.groupName}` });
      return;
    }
  }

  const values = picks.map((p) => ({
    poolId,
    userId,
    groupName: p.groupName,
    pos1Team: p.pos1Team,
    pos2Team: p.pos2Team,
    pos3Team: p.pos3Team,
    pos4Team: p.pos4Team,
  }));

  await db
    .insert(groupStagePredictorPicksTable)
    .values(values)
    .onConflictDoUpdate({
      target: [
        groupStagePredictorPicksTable.poolId,
        groupStagePredictorPicksTable.userId,
        groupStagePredictorPicksTable.groupName,
      ],
      set: {
        pos1Team: sql`excluded.pos1_team`,
        pos2Team: sql`excluded.pos2_team`,
        pos3Team: sql`excluded.pos3_team`,
        pos4Team: sql`excluded.pos4_team`,
        updatedAt: new Date(),
      },
    });

  const result = await db
    .select()
    .from(groupStagePredictorPicksTable)
    .where(and(
      eq(groupStagePredictorPicksTable.poolId, poolId),
      eq(groupStagePredictorPicksTable.userId, userId),
    ));

  res.json(result.map((p) => ({
    groupName: p.groupName,
    pos1Team: p.pos1Team,
    pos2Team: p.pos2Team,
    pos3Team: p.pos3Team,
    pos4Team: p.pos4Team,
  })));
});

export default router;
