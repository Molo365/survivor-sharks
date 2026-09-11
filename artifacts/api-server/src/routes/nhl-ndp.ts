import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, entriesTable, nhlDivisionPredictorPicksTable, nhlDivisionPredictorTiebreakersTable, nhlDivisionResultsTable, poolsTable, usersTable } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { NHL_DIVISIONS, NHL_DIVISION_MAP, nhlTeamPresentation } from "../lib/nhl-divisions";
import { getNhlNdpLockState } from "../lib/nhl-ndp-lock";
import { fetchNhlDivisionStandings } from "../lib/espn";
import { closePredictorPool, scoreNhlDivisionPositions } from "../lib/closePredictorPool";
import { SubmitNhlNdpPicksBody, SubmitNhlNdpResultsBody } from "@workspace/api-zod";

const router = Router({ mergeParams: true });
// Atlantic is competitive and familiar to the app's Canadian audience; one
// combined-points guess is enough to narrow score ties without changing points.
export const NHL_NDP_TIEBREAKER_DIVISION = "Atlantic";
const id = (v: string | string[]) => Number(Array.isArray(v) ? v[0] : v);
type PositionRow = { divisionName: string } & Record<`pos${number}Team`, string>;
const teams = (value: PositionRow): string[] =>
  Array.from({ length: 8 }, (_, index) => value[`pos${index + 1}Team`]);
async function poolFor(req: any, res: any) {
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, id(req.params.poolId))).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return null; }
  if (String(pool.poolType) !== "nhl_division_predictor") { res.status(400).json({ error: "Not an NHL Division Predictor pool" }); return null; }
  if (req.user?.role !== "admin") {
    const [member] = await db.select({ userId: entriesTable.userId }).from(entriesTable).where(and(
      eq(entriesTable.poolId, pool.id),
      eq(entriesTable.userId, req.user!.id),
    )).limit(1);
    if (!member) { res.status(403).json({ error: "Not a member of this pool" }); return null; }
  }
  return pool;
}
function validateDivision(name: string, list: string[]) {
  const division = NHL_DIVISION_MAP.get(name as never);
  if (!division || list.length !== 8 || new Set(list).size !== 8 || list.some((t) => !division.teams.some((x) => x.name === t))) return "Exactly eight unique teams from the selected division are required";
  return null;
}
function row(value: PositionRow) {
  return {
    divisionName: value.divisionName,
    pos1Team: value.pos1Team,
    pos2Team: value.pos2Team,
    pos3Team: value.pos3Team,
    pos4Team: value.pos4Team,
    pos5Team: value.pos5Team,
    pos6Team: value.pos6Team,
    pos7Team: value.pos7Team,
    pos8Team: value.pos8Team,
  };
}

router.get("/divisions", requireAuth, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  const [picks, results] = await Promise.all([
    db.select().from(nhlDivisionPredictorPicksTable).where(and(eq(nhlDivisionPredictorPicksTable.poolId, pool.id), eq(nhlDivisionPredictorPicksTable.userId, req.user!.id))),
    db.select().from(nhlDivisionResultsTable).where(eq(nhlDivisionResultsTable.poolId, pool.id)),
  ]);
  const pm = new Map(picks.map((p) => [p.divisionName, p])); const rm = new Map(results.map((r) => [r.divisionName, r]));
  res.json(NHL_DIVISIONS.map((name) => {
    const pick = pm.get(name);
    const result = rm.get(name);
    return {
      name,
      shortName: name,
      teams: NHL_DIVISION_MAP.get(name)!.teams.map(nhlTeamPresentation),
      myPick: pick ? row(pick) : null,
      actualResult: result ? row(result) : null,
    };
  }));
});

router.get("/lock-state", requireAuth, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  const state = await getNhlNdpLockState(pool.season, pool.sandboxMode);
  res.json({ poolId: pool.id, season: pool.season, locked: state.locked, lockAt: state.lockAt?.toISOString() ?? null, source: state.source });
});

router.post("/picks", requireAuth, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  const state = await getNhlNdpLockState(pool.season, pool.sandboxMode);
  if (state.locked) { res.status(423).json({ error: "Picks are locked", lockAt: state.lockAt?.toISOString(), locked: true }); return; }
  const parsed = SubmitNhlNdpPicksBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid NHL Division Predictor picks payload" }); return; }
  const { picks, tbGuess } = parsed.data;
  if (!pool.isActive) { res.status(409).json({ error: "This pool is closed" }); return; }
  if (!Number.isInteger(tbGuess)) { res.status(400).json({ error: "Tiebreaker guess must be a whole number" }); return; }
  if (new Set(picks.map((pick) => pick.divisionName)).size !== NHL_DIVISIONS.length) {
    res.status(400).json({ error: "Each NHL division must be submitted exactly once" });
    return;
  }
  for (const pick of picks) { const error = validateDivision(pick.divisionName, teams(pick)); if (error) { res.status(400).json({ error: `${pick.divisionName}: ${error}` }); return; } }
  const poolId = pool.id, userId = req.user!.id;
  await db.insert(nhlDivisionPredictorPicksTable).values(picks.map((pick) => ({ poolId, userId, ...pick }))).onConflictDoUpdate({
    target: [nhlDivisionPredictorPicksTable.poolId, nhlDivisionPredictorPicksTable.userId, nhlDivisionPredictorPicksTable.divisionName],
    set: {
      pos1Team: sql`excluded.pos1_team`, pos2Team: sql`excluded.pos2_team`,
      pos3Team: sql`excluded.pos3_team`, pos4Team: sql`excluded.pos4_team`,
      pos5Team: sql`excluded.pos5_team`, pos6Team: sql`excluded.pos6_team`,
      pos7Team: sql`excluded.pos7_team`, pos8Team: sql`excluded.pos8_team`,
      updatedAt: new Date(),
    },
  });
  await db.insert(nhlDivisionPredictorTiebreakersTable).values({ poolId, userId, tbGuess }).onConflictDoUpdate({
    target: [nhlDivisionPredictorTiebreakersTable.poolId, nhlDivisionPredictorTiebreakersTable.userId],
    set: { tbGuess, updatedAt: new Date() },
  });
  res.json(picks);
});

router.get("/results", requireAuth, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  res.json((await db.select().from(nhlDivisionResultsTable).where(eq(nhlDivisionResultsTable.poolId, pool.id))).map(row));
});

router.post("/results", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  const parsed = SubmitNhlNdpResultsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid NHL Division Predictor results payload" }); return; }
  const { results, tbActual } = parsed.data;
  if (results.length === 0 && tbActual === undefined) {
    res.status(400).json({ error: "At least one division result or the tiebreaker actual is required" });
    return;
  }
  if (!pool.isActive) { res.status(409).json({ error: "This pool is closed and cannot be regraded" }); return; }
  if (tbActual !== undefined && !Number.isInteger(tbActual)) {
    res.status(400).json({ error: "Tiebreaker actual must be a whole number" });
    return;
  }
  if (new Set(results.map((result) => result.divisionName)).size !== results.length) {
    res.status(400).json({ error: "A results batch cannot contain the same division more than once" });
    return;
  }
  for (const result of results) { const error = validateDivision(result.divisionName, teams(result)); if (error) { res.status(400).json({ error: `${result.divisionName}: ${error}` }); return; } }
  if (results.length > 0) {
    await db.insert(nhlDivisionResultsTable).values(results.map((result) => ({ poolId: pool.id, ...result, enteredByUserId: req.user!.id }))).onConflictDoUpdate({
      target: [nhlDivisionResultsTable.poolId, nhlDivisionResultsTable.divisionName],
      set: {
        pos1Team: sql`excluded.pos1_team`, pos2Team: sql`excluded.pos2_team`,
        pos3Team: sql`excluded.pos3_team`, pos4Team: sql`excluded.pos4_team`,
        pos5Team: sql`excluded.pos5_team`, pos6Team: sql`excluded.pos6_team`,
        pos7Team: sql`excluded.pos7_team`, pos8Team: sql`excluded.pos8_team`,
        enteredAt: new Date(),
        enteredByUserId: req.user!.id,
      },
    });
  }
  if (tbActual !== undefined) {
    const members = await db.select({ userId: entriesTable.userId }).from(entriesTable).where(eq(entriesTable.poolId, pool.id));
    for (const member of members) await db.insert(nhlDivisionPredictorTiebreakersTable).values({ poolId: pool.id, userId: member.userId, tbActual }).onConflictDoUpdate({
      target: [nhlDivisionPredictorTiebreakersTable.poolId, nhlDivisionPredictorTiebreakersTable.userId],
      set: { tbActual, updatedAt: new Date() },
    });
  }
  const saved = await db.select().from(nhlDivisionResultsTable).where(eq(nhlDivisionResultsTable.poolId, pool.id));
  let closedPool = false;
  let closureWarning: string | undefined;
  if (new Set(saved.map((r) => r.divisionName)).size >= 4 && pool.isActive) {
    const [allPicks, members] = await Promise.all([
      db.select().from(nhlDivisionPredictorPicksTable).where(eq(nhlDivisionPredictorPicksTable.poolId, pool.id)),
      db.select({ userId: entriesTable.userId }).from(entriesTable).where(eq(entriesTable.poolId, pool.id)),
    ]);
    const resultMap = new Map(saved.map((r) => [r.divisionName, r]));
    const tbRows = await db.select().from(nhlDivisionPredictorTiebreakersTable).where(eq(nhlDivisionPredictorTiebreakersTable.poolId, pool.id));
    const actual = tbRows.find((r) => r.tbActual != null)?.tbActual ?? null;
    if (actual === null) {
      closureWarning = "All division results are saved, but the Atlantic combined-points actual is required before the pool can close.";
      res.json({ saved: saved.map(row), closedPool, closureWarning });
      return;
    }
    const resolveTie = async (ids: number[]) => {
      const guesses = new Map(tbRows.map((r) => [r.userId, r.tbGuess]));
      const diffs = ids.map((userId) => ({ userId, diff: guesses.get(userId) == null ? Infinity : Math.abs(guesses.get(userId)! - actual) }));
      const min = Math.min(...diffs.map((x) => x.diff));
      return diffs.filter((x) => x.diff === min).map((x) => x.userId);
    };
    const outcome = await closePredictorPool({
      poolId: pool.id, resultMap, allPicks, memberUserIds: members.map((m) => m.userId),
      getPickKey: (pick) => pick.divisionName, log: req.log, resolveTie, scorer: scoreNhlDivisionPositions,
    });
    if (outcome.closed) closedPool = true;
    else closureWarning = outcome.detail ?? `Closure skipped (${outcome.reason})`;
  }
  res.json({ saved: saved.map(row), closedPool, ...(closureWarning ? { closureWarning } : {}) });
});

router.get("/members/:userId/picks", requireAuth, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  const target = id(req.params.userId); const [mine] = await db.select().from(entriesTable).where(and(eq(entriesTable.poolId, pool.id), eq(entriesTable.userId, req.user!.id))).limit(1);
  if (!mine) { res.status(403).json({ error: "Not a member of this pool" }); return; }
  const picks = await db.select().from(nhlDivisionPredictorPicksTable).where(and(eq(nhlDivisionPredictorPicksTable.poolId, pool.id), eq(nhlDivisionPredictorPicksTable.userId, target)));
  res.json(picks.length === 4 || target === req.user!.id ? picks.map(row) : []);
});

router.get("/leaderboard", requireAuth, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  const [members, picks, results, tb] = await Promise.all([
    db.select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      finalWinner: entriesTable.finalWinner,
      finishPosition: entriesTable.finishPosition,
      prizeAmount: entriesTable.prizeAmount,
    }).from(entriesTable).innerJoin(usersTable, eq(entriesTable.userId, usersTable.id)).where(eq(entriesTable.poolId, pool.id)),
    db.select().from(nhlDivisionPredictorPicksTable).where(eq(nhlDivisionPredictorPicksTable.poolId, pool.id)), db.select().from(nhlDivisionResultsTable).where(eq(nhlDivisionResultsTable.poolId, pool.id)), db.select().from(nhlDivisionPredictorTiebreakersTable).where(eq(nhlDivisionPredictorTiebreakersTable.poolId, pool.id)),
  ]);
  const rm = new Map(results.map((r) => [r.divisionName, r])); const pm = new Map(picks.map((p) => [`${p.userId}:${p.divisionName}`, p])); const tm = new Map(tb.map((t) => [t.userId, t]));
  const actual = tb.find((t) => t.tbActual != null)?.tbActual ?? null;
  const entries = members.map((m) => { let totalScore = 0; const divisionScores = NHL_DIVISIONS.map((d) => { const r = rm.get(d), p = pm.get(`${m.userId}:${d}`); const score = r && p ? scoreNhlDivisionPositions(teams(r), teams(p)) : 0; totalScore += score; return { divisionName: d, score, hasResult: !!r }; }); const t = tm.get(m.userId); return { ...m, displayName: m.displayName ?? null, totalScore, maxScore: 96, divisionScores, tbGuess: t?.tbGuess ?? null, tbActual: actual, tiebreakerDiff: t?.tbGuess != null && actual != null ? Math.abs(t.tbGuess - actual) : null }; }).sort((a, b) =>
    pool.isActive
      ? b.totalScore - a.totalScore
      : (a.finishPosition ?? Number.MAX_SAFE_INTEGER) - (b.finishPosition ?? Number.MAX_SAFE_INTEGER)
        || b.totalScore - a.totalScore
  );
  res.json({ entries: entries.map((e, i) => ({ ...e, rank: e.finishPosition ?? i + 1 })), tbActual: actual });
});

router.get("/my-tiebreaker", requireAuth, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  const [t] = await db.select().from(nhlDivisionPredictorTiebreakersTable).where(and(eq(nhlDivisionPredictorTiebreakersTable.poolId, pool.id), eq(nhlDivisionPredictorTiebreakersTable.userId, req.user!.id))).limit(1);
  res.json({ tbGuess: t?.tbGuess ?? null, tbActual: t?.tbActual ?? null });
});

router.get("/live-standings", requireAuth, async (req, res): Promise<void> => {
  const pool = await poolFor(req, res); if (!pool) return;
  const [member] = await db.select({ userId: entriesTable.userId }).from(entriesTable).where(and(
    eq(entriesTable.poolId, pool.id),
    eq(entriesTable.userId, req.user!.id),
  )).limit(1);
  if (!member) { res.status(403).json({ error: "Not a pool member" }); return; }
  try {
    res.json(await fetchNhlDivisionStandings());
  } catch (err) {
    req.log.error({ err, poolId: pool.id }, "Unable to fetch NHL division standings");
    res.status(503).json({ error: "NHL standings are unavailable" });
  }
});
export default router;