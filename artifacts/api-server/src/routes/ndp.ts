import { Router } from "express";
import { db } from "@workspace/db";
import {
  nflDivisionPredictorPicksTable,
  nflDivisionResultsTable,
  poolsTable,
  entriesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { NFL_DIVISIONS, NFL_DIVISION_MAP } from "../lib/nfl-divisions";

const router = Router({ mergeParams: true });

function scoreDivision(
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

// GET /api/pools/:poolId/ndp/divisions
router.get("/divisions", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_division_predictor") {
    res.status(400).json({ error: "This pool is not an NFL Division Predictor pool" });
    return;
  }

  const [existingPicks, actualResults] = await Promise.all([
    db
      .select()
      .from(nflDivisionPredictorPicksTable)
      .where(and(
        eq(nflDivisionPredictorPicksTable.poolId, poolId),
        eq(nflDivisionPredictorPicksTable.userId, userId),
      )),
    db
      .select()
      .from(nflDivisionResultsTable)
      .where(eq(nflDivisionResultsTable.poolId, poolId)),
  ]);

  const picksByDivision = new Map(existingPicks.map((p) => [p.divisionName, p]));
  const resultsByDivision = new Map(actualResults.map((r) => [r.divisionName, r]));

  const divisions = NFL_DIVISIONS.map((div) => {
    const pick = picksByDivision.get(div.name) ?? null;
    const result = resultsByDivision.get(div.name) ?? null;
    return {
      name: div.name,
      shortName: div.shortName,
      teams: div.teams.map((t) => ({
        name: t.name,
        abbr: t.abbr,
        logoUrl: t.logoUrl,
      })),
      myPick: pick
        ? {
            divisionName: pick.divisionName,
            pos1Team: pick.pos1Team,
            pos2Team: pick.pos2Team,
            pos3Team: pick.pos3Team,
            pos4Team: pick.pos4Team,
          }
        : null,
      actualResult: result
        ? {
            divisionName: result.divisionName,
            pos1Team: result.pos1Team,
            pos2Team: result.pos2Team,
            pos3Team: result.pos3Team,
            pos4Team: result.pos4Team,
          }
        : null,
    };
  });

  res.json(divisions);
});

// POST /api/pools/:poolId/ndp/picks
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_division_predictor") {
    res.status(400).json({ error: "This pool is not an NFL Division Predictor pool" });
    return;
  }

  const { picks } = req.body as {
    picks: Array<{
      divisionName: string;
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

  for (const pick of picks) {
    const div = NFL_DIVISION_MAP.get(pick.divisionName);
    if (!div) {
      res.status(400).json({ error: `Invalid division: ${pick.divisionName}` });
      return;
    }
    const validTeams = new Set(div.teams.map((t) => t.name));
    const submitted = [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team];
    if (!submitted.every((t) => validTeams.has(t))) {
      res.status(400).json({ error: `Invalid teams for division ${pick.divisionName}` });
      return;
    }
    if (new Set(submitted).size !== 4) {
      res.status(400).json({ error: `Duplicate teams in division ${pick.divisionName}` });
      return;
    }
  }

  const values = picks.map((p) => ({
    poolId,
    userId,
    divisionName: p.divisionName,
    pos1Team: p.pos1Team,
    pos2Team: p.pos2Team,
    pos3Team: p.pos3Team,
    pos4Team: p.pos4Team,
  }));

  await db
    .insert(nflDivisionPredictorPicksTable)
    .values(values)
    .onConflictDoUpdate({
      target: [
        nflDivisionPredictorPicksTable.poolId,
        nflDivisionPredictorPicksTable.userId,
        nflDivisionPredictorPicksTable.divisionName,
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
    .from(nflDivisionPredictorPicksTable)
    .where(and(
      eq(nflDivisionPredictorPicksTable.poolId, poolId),
      eq(nflDivisionPredictorPicksTable.userId, userId),
    ));

  res.json(result.map((p) => ({
    divisionName: p.divisionName,
    pos1Team: p.pos1Team,
    pos2Team: p.pos2Team,
    pos3Team: p.pos3Team,
    pos4Team: p.pos4Team,
  })));
});

// GET /api/pools/:poolId/ndp/results
router.get("/results", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const results = await db
    .select()
    .from(nflDivisionResultsTable)
    .where(eq(nflDivisionResultsTable.poolId, poolId));

  res.json(results.map((r) => ({
    divisionName: r.divisionName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
  })));
});

// POST /api/pools/:poolId/ndp/results (admin only)
router.post("/results", requireAuth, requireAdmin, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_division_predictor") {
    res.status(400).json({ error: "Not an NFL Division Predictor pool" });
    return;
  }

  const { results } = req.body as {
    results: Array<{
      divisionName: string;
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

  for (const result of results) {
    const div = NFL_DIVISION_MAP.get(result.divisionName);
    if (!div) {
      res.status(400).json({ error: `Invalid division: ${result.divisionName}` });
      return;
    }
    const validTeams = new Set(div.teams.map((t) => t.name));
    const submitted = [result.pos1Team, result.pos2Team, result.pos3Team, result.pos4Team];
    if (!submitted.every((t) => validTeams.has(t))) {
      res.status(400).json({ error: `Invalid teams for division ${result.divisionName}` });
      return;
    }
    if (new Set(submitted).size !== 4) {
      res.status(400).json({ error: `Duplicate teams in division ${result.divisionName}` });
      return;
    }
  }

  const values = results.map((r) => ({
    poolId,
    divisionName: r.divisionName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
    enteredByUserId: userId,
  }));

  await db
    .insert(nflDivisionResultsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [nflDivisionResultsTable.poolId, nflDivisionResultsTable.divisionName],
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
    .from(nflDivisionResultsTable)
    .where(eq(nflDivisionResultsTable.poolId, poolId));

  req.log.info({ poolId, count: saved.length }, "Admin entered NDP actual results");

  res.json(saved.map((r) => ({
    divisionName: r.divisionName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
  })));
});

// GET /api/pools/:poolId/ndp/members/:userId/picks
router.get("/members/:userId/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const targetUserId = parseInt(String(req.params.userId));
  const requesterId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_division_predictor") {
    res.status(400).json({ error: "This pool is not an NFL Division Predictor pool" });
    return;
  }

  const [requesterEntry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, requesterId)))
    .limit(1);
  if (!requesterEntry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const [targetPicks, actualResults] = await Promise.all([
    db
      .select()
      .from(nflDivisionPredictorPicksTable)
      .where(and(
        eq(nflDivisionPredictorPicksTable.poolId, poolId),
        eq(nflDivisionPredictorPicksTable.userId, targetUserId),
      )),
    db
      .select()
      .from(nflDivisionResultsTable)
      .where(eq(nflDivisionResultsTable.poolId, poolId)),
  ]);

  const picksByDivision = new Map(targetPicks.map((p) => [p.divisionName, p]));
  const resultsByDivision = new Map(actualResults.map((r) => [r.divisionName, r]));

  const divisions = NFL_DIVISIONS.map((div) => {
    const pick = picksByDivision.get(div.name) ?? null;
    const result = resultsByDivision.get(div.name) ?? null;
    return {
      name: div.name,
      shortName: div.shortName,
      teams: div.teams.map((t) => ({
        name: t.name,
        abbr: t.abbr,
        logoUrl: t.logoUrl,
      })),
      myPick: pick
        ? {
            divisionName: pick.divisionName,
            pos1Team: pick.pos1Team,
            pos2Team: pick.pos2Team,
            pos3Team: pick.pos3Team,
            pos4Team: pick.pos4Team,
          }
        : null,
      actualResult: result
        ? {
            divisionName: result.divisionName,
            pos1Team: result.pos1Team,
            pos2Team: result.pos2Team,
            pos3Team: result.pos3Team,
            pos4Team: result.pos4Team,
          }
        : null,
    };
  });

  res.json(divisions);
});

// GET /api/pools/:poolId/ndp/leaderboard
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [actualResults, members] = await Promise.all([
    db.select().from(nflDivisionResultsTable).where(eq(nflDivisionResultsTable.poolId, poolId)),
    db
      .select({
        userId: entriesTable.userId,
        username: usersTable.username,
        displayName: usersTable.displayName,
      })
      .from(entriesTable)
      .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
      .where(eq(entriesTable.poolId, poolId)),
  ]);

  if (members.length === 0) { res.json([]); return; }

  const resultsByDivision = new Map(actualResults.map((r) => [r.divisionName, r]));

  const allPicks = await db
    .select()
    .from(nflDivisionPredictorPicksTable)
    .where(eq(nflDivisionPredictorPicksTable.poolId, poolId));

  const picksByUser = new Map<number, Map<string, typeof allPicks[0]>>();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, new Map());
    picksByUser.get(pick.userId)!.set(pick.divisionName, pick);
  }

  // 8 divisions × 12 pts/division = 96 max
  const MAX_SCORE = 96;
  const divisionNames = NFL_DIVISIONS.map((d) => d.name);

  const entries = members.map((member) => {
    const userPicks = picksByUser.get(member.userId);
    let totalScore = 0;

    const divisionScores = divisionNames.map((divName) => {
      const actual = resultsByDivision.get(divName);
      const pick = userPicks?.get(divName);

      if (!actual) return { divisionName: divName, score: 0, hasResult: false };
      if (!pick)   return { divisionName: divName, score: 0, hasResult: true };

      const score = scoreDivision(
        [actual.pos1Team, actual.pos2Team, actual.pos3Team, actual.pos4Team],
        [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team],
      );
      totalScore += score;
      return { divisionName: divName, score, hasResult: true };
    });

    return {
      userId: member.userId,
      username: member.username,
      displayName: member.displayName ?? null,
      totalScore,
      maxScore: MAX_SCORE,
      divisionScores,
    };
  });

  entries.sort((a, b) => b.totalScore - a.totalScore);

  let rank = 1;
  const ranked = entries.map((entry, i) => {
    if (i > 0 && entries[i].totalScore < entries[i - 1].totalScore) rank = i + 1;
    return { ...entry, rank };
  });

  res.json(ranked);
});

// POST /api/pools/:poolId/ndp/simulate-standings — sandbox: random division orderings
router.post("/simulate-standings", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_division_predictor") {
    res.status(400).json({ error: "Not an NFL Division Predictor pool" }); return;
  }

  const [userRow] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (pool.commissionerId !== userId && userRow?.role !== "admin") {
    res.status(403).json({ error: "Commissioner or admin only" }); return;
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const values = NFL_DIVISIONS.map(div => {
    const shuffled = shuffle(div.teams.map(t => t.name));
    return {
      poolId,
      divisionName: div.name,
      pos1Team: shuffled[0],
      pos2Team: shuffled[1],
      pos3Team: shuffled[2],
      pos4Team: shuffled[3],
      enteredByUserId: userId,
    };
  });

  await db.insert(nflDivisionResultsTable).values(values).onConflictDoUpdate({
    target: [nflDivisionResultsTable.poolId, nflDivisionResultsTable.divisionName],
    set: {
      pos1Team: sql`excluded.pos1_team`,
      pos2Team: sql`excluded.pos2_team`,
      pos3Team: sql`excluded.pos3_team`,
      pos4Team: sql`excluded.pos4_team`,
      enteredAt: sql`now()`,
      enteredByUserId: userId,
    },
  });

  req.log.info({ poolId, divisions: values.length }, "Simulated NDP standings for sandbox");
  res.json({ simulated: values.length, divisions: values.map(v => ({ divisionName: v.divisionName, pos1Team: v.pos1Team, pos2Team: v.pos2Team, pos3Team: v.pos3Team, pos4Team: v.pos4Team })) });
});

export default router;
