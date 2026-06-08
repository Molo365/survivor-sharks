import { Router } from "express";
import { db } from "@workspace/db";
import {
  groupStagePredictorPicksTable,
  groupStageResultsTable,
  poolsTable,
  entriesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { WC_2026_GROUPS, getWcTeamInfo } from "../lib/wc";

const router = Router({ mergeParams: true });

function scoreGroup(
  actual: [string, string, string, string],
  predicted: [string, string, string, string],
): number {
  let pts = 0;
  for (let i = 0; i < 4; i++) {
    const team = actual[i];
    const predictedPos = predicted.indexOf(team);
    if (predictedPos === i) {
      pts += 3;
    } else if (i < 2 && predictedPos >= 0 && predictedPos < 2) {
      pts += 1;
    }
  }
  return pts;
}

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

// GET /api/pools/:poolId/gsp/results
router.get("/results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const results = await db
    .select()
    .from(groupStageResultsTable)
    .where(eq(groupStageResultsTable.poolId, poolId));

  res.json(results.map((r) => ({
    groupName: r.groupName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
  })));
});

// POST /api/pools/:poolId/gsp/results (admin only)
router.post("/results", requireAuth, requireAdmin, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "group_stage_predictor") {
    res.status(400).json({ error: "Not a Group Stage Predictor pool" });
    return;
  }

  const { results } = req.body as {
    results: Array<{
      groupName: string;
      pos1Team: string;
      pos2Team: string;
      pos3Team: string;
      pos4Team: string;
    }>;
  };

  if (!Array.isArray(results) || results.length === 0) {
    res.status(400).json({ error: "results array is required" });
    return;
  }

  const validGroupMap = new Map(WC_2026_GROUPS.map((g) => [g.name, new Set(g.teams)]));

  for (const result of results) {
    const groupTeams = validGroupMap.get(result.groupName);
    if (!groupTeams) {
      res.status(400).json({ error: `Invalid group: ${result.groupName}` });
      return;
    }
    const submitted = [result.pos1Team, result.pos2Team, result.pos3Team, result.pos4Team];
    if (!submitted.every((t) => groupTeams.has(t))) {
      res.status(400).json({ error: `Invalid teams for group ${result.groupName}` });
      return;
    }
    if (new Set(submitted).size !== 4) {
      res.status(400).json({ error: `Duplicate teams in group ${result.groupName}` });
      return;
    }
  }

  const values = results.map((r) => ({
    poolId,
    groupName: r.groupName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
    enteredByUserId: userId,
  }));

  await db
    .insert(groupStageResultsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [groupStageResultsTable.poolId, groupStageResultsTable.groupName],
      set: {
        pos1Team: sql`excluded.pos1_team`,
        pos2Team: sql`excluded.pos2_team`,
        pos3Team: sql`excluded.pos3_team`,
        pos4Team: sql`excluded.pos4_team`,
        enteredAt: sql`now()`,
        enteredByUserId: userId,
      },
    });

  const saved = await db
    .select()
    .from(groupStageResultsTable)
    .where(eq(groupStageResultsTable.poolId, poolId));

  req.log.info({ poolId, count: saved.length }, "Admin entered GSP actual results");

  res.json(saved.map((r) => ({
    groupName: r.groupName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
  })));
});

// GET /api/pools/:poolId/gsp/leaderboard
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const actualResults = await db
    .select()
    .from(groupStageResultsTable)
    .where(eq(groupStageResultsTable.poolId, poolId));

  const resultsByGroup = new Map(actualResults.map((r) => [r.groupName, r]));

  const members = await db
    .select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
    })
    .from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId));

  if (members.length === 0) {
    res.json([]);
    return;
  }

  const allPicks = await db
    .select()
    .from(groupStagePredictorPicksTable)
    .where(eq(groupStagePredictorPicksTable.poolId, poolId));

  const picksByUser = new Map<number, Map<string, typeof allPicks[0]>>();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.userId)) {
      picksByUser.set(pick.userId, new Map());
    }
    picksByUser.get(pick.userId)!.set(pick.groupName, pick);
  }

  const MAX_SCORE = 144;

  const entries = members.map((member) => {
    const userPicks = picksByUser.get(member.userId);
    let totalScore = 0;

    const groupScores = WC_2026_GROUPS.map((group) => {
      const actual = resultsByGroup.get(group.name);
      const pick = userPicks?.get(group.name);

      if (!actual) {
        return { groupName: group.name, score: 0, hasResult: false };
      }
      if (!pick) {
        return { groupName: group.name, score: 0, hasResult: true };
      }

      const score = scoreGroup(
        [actual.pos1Team, actual.pos2Team, actual.pos3Team, actual.pos4Team],
        [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team],
      );
      totalScore += score;
      return { groupName: group.name, score, hasResult: true };
    });

    return {
      userId: member.userId,
      username: member.username,
      displayName: member.displayName ?? null,
      totalScore,
      maxScore: MAX_SCORE,
      groupScores,
    };
  });

  entries.sort((a, b) => b.totalScore - a.totalScore);

  let rank = 1;
  const ranked = entries.map((entry, i) => {
    if (i > 0 && entries[i].totalScore < entries[i - 1].totalScore) {
      rank = i + 1;
    }
    return { ...entry, rank };
  });

  res.json(ranked);
});

export default router;
