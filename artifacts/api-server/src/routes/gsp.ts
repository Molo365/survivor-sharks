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
import { fetchWcStandings } from "../lib/wc";
import { closePredictorPool, GSP_GROUP_COUNT, scorePositions } from "../lib/closePredictorPool";

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

  const [standings, existingPicks, actualResults] = await Promise.all([
    fetchWcStandings(),
    db
      .select()
      .from(groupStagePredictorPicksTable)
      .where(and(
        eq(groupStagePredictorPicksTable.poolId, poolId),
        eq(groupStagePredictorPicksTable.userId, userId),
      )),
    db
      .select()
      .from(groupStageResultsTable)
      .where(eq(groupStageResultsTable.poolId, poolId)),
  ]);

  if (standings.length === 0) {
    res.status(503).json({ error: "Group data unavailable — ESPN API unreachable" });
    return;
  }

  const picksByGroup = new Map(existingPicks.map((p) => [p.groupName, p]));
  const resultsByGroup = new Map(actualResults.map((r) => [r.groupName, r]));

  const groups = standings.map((group) => {
    const pick = picksByGroup.get(group.groupLetter) ?? null;
    const actual = resultsByGroup.get(group.groupLetter) ?? null;

    let groupScore: number | null = null;
    if (actual && pick) {
      groupScore = scorePositions(
        [actual.pos1Team, actual.pos2Team, actual.pos3Team, actual.pos4Team],
        [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team],
      );
    }

    return {
      name: group.groupLetter,
      teams: group.teams.map((t) => ({
        name: t.displayName,
        abbr: t.abbreviation,
        flagUrl: t.logo ?? "",
      })),
      myPick: pick
        ? {
            groupName: pick.groupName,
            pos1Team: pick.pos1Team,
            pos2Team: pick.pos2Team,
            pos3Team: pick.pos3Team,
            pos4Team: pick.pos4Team,
          }
        : null,
      result: actual
        ? {
            groupName: actual.groupName,
            pos1Team: actual.pos1Team,
            pos2Team: actual.pos2Team,
            pos3Team: actual.pos3Team,
            pos4Team: actual.pos4Team,
          }
        : null,
      groupScore,
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

  const standings = await fetchWcStandings();
  if (standings.length === 0) {
    res.status(503).json({ error: "Cannot validate picks — ESPN API unreachable" });
    return;
  }

  const validGroupMap = new Map(
    standings.map((g) => [g.groupLetter, new Set(g.teams.map((t) => t.displayName))]),
  );

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

  const standings = await fetchWcStandings();
  if (standings.length === 0) {
    res.status(503).json({ error: "Cannot validate results — ESPN API unreachable" });
    return;
  }

  const validGroupMap = new Map(
    standings.map((g) => [g.groupLetter, new Set(g.teams.map((t) => t.displayName))]),
  );

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

  // ── Closure detection ────────────────────────────────────────────────────
  // Threshold: GSP_GROUP_COUNT (fixed constant = 12 for FIFA 2026).
  // Never use standings.length here — the ESPN API may be unavailable or
  // return a different count at closure time, silently preventing closure.
  // Any failure surfaces in closureWarning rather than being swallowed.
  let closedPool = false;
  let closureWarning: string | undefined;

  if (pool.isActive) {
    try {
      const countRows = await db
        .select({ count: sql<number>`COUNT(DISTINCT group_name)` })
        .from(groupStageResultsTable)
        .where(eq(groupStageResultsTable.poolId, poolId));
      const distinctCount = Number(countRows[0]?.count ?? 0);

      if (distinctCount >= GSP_GROUP_COUNT) {
        const [allPicks, members] = await Promise.all([
          db.select().from(groupStagePredictorPicksTable).where(eq(groupStagePredictorPicksTable.poolId, poolId)),
          db.select({ userId: entriesTable.userId }).from(entriesTable).where(eq(entriesTable.poolId, poolId)),
        ]);

        const resultMap = new Map(saved.map((r) => [r.groupName, r]));
        const outcome = await closePredictorPool({
          poolId,
          resultMap,
          allPicks,
          memberUserIds: members.map((m) => m.userId),
          getPickKey: (pick) => pick.groupName,
          log: req.log,
        });

        if (outcome.closed) {
          closedPool = true;
        } else {
          closureWarning = outcome.detail ?? `Closure skipped (${outcome.reason})`;
        }
      }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      req.log.error({ err, poolId }, "GSP closure detection failed — results saved but pool not closed");
      closureWarning = `Pool closure check failed: ${detail}. Results were saved — please retry or contact support.`;
    }
  }

  const savedRows = saved.map((r) => ({
    groupName: r.groupName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
  }));
  res.json(closureWarning
    ? { saved: savedRows, closedPool, closureWarning }
    : { saved: savedRows, closedPool });
});

// GET /api/pools/:poolId/gsp/members/:userId/picks
router.get("/members/:userId/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const targetUserId = parseInt(String(req.params.userId));
  const requesterId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "group_stage_predictor") {
    res.status(400).json({ error: "This pool is not a Group Stage Predictor pool" });
    return;
  }

  // Requester must be a member of the pool
  const [requesterEntry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, requesterId)))
    .limit(1);
  if (!requesterEntry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const [standings, targetPicks, actualResults] = await Promise.all([
    fetchWcStandings(),
    db
      .select()
      .from(groupStagePredictorPicksTable)
      .where(and(
        eq(groupStagePredictorPicksTable.poolId, poolId),
        eq(groupStagePredictorPicksTable.userId, targetUserId),
      )),
    db
      .select()
      .from(groupStageResultsTable)
      .where(eq(groupStageResultsTable.poolId, poolId)),
  ]);

  if (standings.length === 0) {
    res.status(503).json({ error: "Group data unavailable — ESPN API unreachable" });
    return;
  }

  const picksByGroup = new Map(targetPicks.map((p) => [p.groupName, p]));
  const resultsByGroup = new Map(actualResults.map((r) => [r.groupName, r]));

  // Visibility rule: another player's picks are hidden until they've submitted all group rankings.
  const picksVisible = targetUserId === requesterId || targetPicks.length >= standings.length;

  const groups = standings.map((group) => {
    const pick = picksVisible ? (picksByGroup.get(group.groupLetter) ?? null) : null;
    const actual = resultsByGroup.get(group.groupLetter) ?? null;

    let groupScore: number | null = null;
    if (actual && pick) {
      groupScore = scorePositions(
        [actual.pos1Team, actual.pos2Team, actual.pos3Team, actual.pos4Team],
        [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team],
      );
    }

    return {
      name: group.groupLetter,
      teams: group.teams.map((t) => ({
        name: t.displayName,
        abbr: t.abbreviation,
        flagUrl: t.logo ?? "",
      })),
      myPick: pick
        ? {
            groupName: pick.groupName,
            pos1Team: pick.pos1Team,
            pos2Team: pick.pos2Team,
            pos3Team: pick.pos3Team,
            pos4Team: pick.pos4Team,
          }
        : null,
      result: actual
        ? {
            groupName: actual.groupName,
            pos1Team: actual.pos1Team,
            pos2Team: actual.pos2Team,
            pos3Team: actual.pos3Team,
            pos4Team: actual.pos4Team,
          }
        : null,
      groupScore,
    };
  });

  res.json(groups);
});

// GET /api/pools/:poolId/gsp/leaderboard
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [standings, actualResults, members] = await Promise.all([
    fetchWcStandings(),
    db.select().from(groupStageResultsTable).where(eq(groupStageResultsTable.poolId, poolId)),
    db
      .select({
        userId: entriesTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
        finalWinner: entriesTable.finalWinner,
      })
      .from(entriesTable)
      .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
      .where(eq(entriesTable.poolId, poolId)),
  ]);

  if (members.length === 0) {
    res.json([]);
    return;
  }

  const resultsByGroup = new Map(actualResults.map((r) => [r.groupName, r]));

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
  const groupLetters = standings.length > 0
    ? standings.map((g) => g.groupLetter)
    : Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));

  const entries = members.map((member) => {
    const userPicks = picksByUser.get(member.userId);
    let totalScore = 0;

    const groupScores = groupLetters.map((letter) => {
      const actual = resultsByGroup.get(letter);
      const pick = userPicks?.get(letter);

      if (!actual) {
        return { groupName: letter, score: 0, hasResult: false };
      }
      if (!pick) {
        return { groupName: letter, score: 0, hasResult: true };
      }

      const score = scorePositions(
        [actual.pos1Team, actual.pos2Team, actual.pos3Team, actual.pos4Team],
        [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team],
      );
      totalScore += score;
      return { groupName: letter, score, hasResult: true };
    });

    return {
      userId: member.userId,
      username: member.username,
      displayName: member.displayName ?? null,
      totalScore,
      maxScore: MAX_SCORE,
      groupScores,
      finalWinner: member.finalWinner ?? false,
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

  const winnerCount = ranked.filter((e) => e.finalWinner).length;
  const memberCount = members.length;
  let prizePerWinner: number | null = null;
  if (winnerCount > 0) {
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null | undefined;
    if (ps && ps.length > 0) {
      if (pool.prizeMode === "pct") {
        if (pool.entryFee && pool.entryFee > 0 && memberCount > 0) {
          const pctAmounts = ps.map((p) =>
            Math.floor((p.amount / 100) * pool.entryFee! * memberCount / 5) * 5,
          );
          const pctFirst = pctAmounts[0] ?? 0;
          const pctTotal = pctAmounts.reduce((s, a) => s + a, 0);
          prizePerWinner = winnerCount === 1 ? pctFirst : Math.floor(pctTotal / winnerCount);
        }
      } else {
        const total = ps.reduce((s, p) => s + p.amount, 0);
        prizePerWinner = winnerCount === 1 ? ps[0].amount : Math.floor(total / winnerCount);
      }
    } else if (pool.prizePot && pool.prizePot > 0) {
      prizePerWinner = Math.floor(pool.prizePot / winnerCount);
    }
  }

  res.json(ranked.map((e) => ({ ...e, prizeWon: e.finalWinner ? prizePerWinner : null })));
});

// GET /api/pools/:poolId/gsp/live-standings
router.get("/live-standings", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [member] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!member) { res.status(403).json({ error: "Not a pool member" }); return; }

  const groups = await fetchWcStandings();
  res.json(groups);
});

export default router;
