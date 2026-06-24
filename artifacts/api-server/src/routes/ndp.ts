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
import { closePredictorPool, scorePositions } from "../lib/closePredictorPool";
import { fetchNflGamesByWeek } from "../lib/espn";
import { getSandboxGamesForWeek, NFL_TEAM_INFO } from "../lib/nfl2025Schedule";

const router = Router({ mergeParams: true });

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

  // ── Closure detection ────────────────────────────────────────────────────
  // Threshold: NFL_DIVISIONS.length (static = 8 for NFL).
  // Any failure surfaces in closureWarning rather than being swallowed.
  let closedPool = false;
  let closureWarning: string | undefined;

  if (pool.isActive) {
    try {
      const countRows = await db
        .select({ count: sql<number>`COUNT(DISTINCT division_name)` })
        .from(nflDivisionResultsTable)
        .where(eq(nflDivisionResultsTable.poolId, poolId));
      const distinctCount = Number(countRows[0]?.count ?? 0);

      if (distinctCount >= NFL_DIVISIONS.length) {
        const [allPicks, members] = await Promise.all([
          db.select().from(nflDivisionPredictorPicksTable).where(eq(nflDivisionPredictorPicksTable.poolId, poolId)),
          db.select({ userId: entriesTable.userId }).from(entriesTable).where(eq(entriesTable.poolId, poolId)),
        ]);

        const resultMap = new Map(saved.map((r) => [r.divisionName, r]));
        const outcome = await closePredictorPool({
          poolId,
          resultMap,
          allPicks,
          memberUserIds: members.map((m) => m.userId),
          getPickKey: (pick) => pick.divisionName,
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
      req.log.error({ err, poolId }, "NDP closure detection failed — results saved but pool not closed");
      closureWarning = `Pool closure check failed: ${detail}. Results were saved — please retry or contact support.`;
    }
  }

  const savedRows = saved.map((r) => ({
    divisionName: r.divisionName,
    pos1Team: r.pos1Team,
    pos2Team: r.pos2Team,
    pos3Team: r.pos3Team,
    pos4Team: r.pos4Team,
  }));
  res.json(closureWarning
    ? { saved: savedRows, closedPool, closureWarning }
    : { saved: savedRows, closedPool });
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
        finalWinner: entriesTable.finalWinner,
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

      const score = scorePositions(
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
      finalWinner: member.finalWinner ?? false,
    };
  });

  entries.sort((a, b) => b.totalScore - a.totalScore);

  let rank = 1;
  const ranked = entries.map((entry, i) => {
    if (i > 0 && entries[i].totalScore < entries[i - 1].totalScore) rank = i + 1;
    return { ...entry, rank };
  });

  const winnerCount = ranked.filter((e) => e.finalWinner).length;
  const prizePerWinner: number | null = (() => {
    if (winnerCount === 0) return null;
    const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null | undefined;
    if (ps && ps.length > 0) {
      const total = ps.reduce((s, p) => s + p.amount, 0);
      return winnerCount === 1 ? ps[0].amount : Math.floor(total / winnerCount);
    }
    if (pool.prizePot && pool.prizePot > 0) return Math.floor(pool.prizePot / winnerCount);
    return null;
  })();

  res.json(ranked.map((e) => ({ ...e, prizeWon: e.finalWinner ? prizePerWinner : null })));
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

// GET /api/pools/:poolId/ndp/week18-games
router.get("/week18-games", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "nfl_division_predictor") {
    res.status(400).json({ error: "This pool is not an NFL Division Predictor pool" }); return;
  }

  if ((pool as any).sandboxMode) {
    const games = getSandboxGamesForWeek(18);
    res.json(games.map(g => ({
      id: g.id,
      awayTeam: NFL_TEAM_INFO[g.awayAbbr]?.displayName ?? g.awayAbbr,
      homeTeam: NFL_TEAM_INFO[g.homeAbbr]?.displayName ?? g.homeAbbr,
      startTime: g.gameTime,
    })));
    return;
  }

  try {
    const liveGames = await fetchNflGamesByWeek(18, pool.season);
    if (liveGames.length > 0) {
      res.json(liveGames.map(g => ({
        id: g.id,
        awayTeam: g.awayTeam.displayName,
        homeTeam: g.homeTeam.displayName,
        startTime: g.date,
      })));
      return;
    }
  } catch (err) {
    req.log.warn({ poolId, err }, "ESPN week 18 fetch failed, falling back to hardcoded schedule");
  }

  const games = getSandboxGamesForWeek(18);
  res.json(games.map(g => ({
    id: g.id,
    awayTeam: NFL_TEAM_INFO[g.awayAbbr]?.displayName ?? g.awayAbbr,
    homeTeam: NFL_TEAM_INFO[g.homeAbbr]?.displayName ?? g.homeAbbr,
    startTime: g.gameTime,
  })));
});

export default router;
