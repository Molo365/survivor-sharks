import { Router } from "express";
import { db, entriesTable, mlbBracketPicksTable, mlbBracketResultsTable, mlbBracketSlotsTable, poolsTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { processMlbBracketResults } from "../lib/auto-eliminator";
import { fetchMlbPostseasonSeries, getMlbTeamLogoUrl, MLB_BRACKET_SLOTS, MLB_ROUND_LENGTHS, MLB_ROUND_POINTS, resolveMlbBracketSlotTeams, SANDBOX_MLB_FIELD } from "../lib/mlb-bracket";

const router = Router({ mergeParams: true });
const ROUND_LABELS: Record<string, string> = { wild_card: "Wild Card", division_series: "Division Series", league_championship: "League Championship", world_series: "World Series" };
type Context = { poolId: number; pool: typeof poolsTable.$inferSelect };

async function getContext(req: any, res: any): Promise<Context | null> {
  const poolId = Number(req.params.poolId);
  const pool = (await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1))[0];
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return null; }
  if (pool.poolType !== "mlb_bracket") { res.status(400).json({ error: "Not an MLB bracket pool" }); return null; }
  const entry = (await db.select({ id: entriesTable.id }).from(entriesTable).where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, req.user.id))).limit(1))[0];
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return null; }
  return { poolId, pool };
}
async function pickLocked(ctx: Context, series?: Awaited<ReturnType<typeof fetchMlbPostseasonSeries>>): Promise<boolean> {
  if (ctx.pool.sandboxMode) {
    const result = await db.select({ id: mlbBracketResultsTable.id }).from(mlbBracketResultsTable).where(eq(mlbBracketResultsTable.poolId, ctx.poolId)).limit(1);
    return result.length > 0;
  }
  const slate = series ?? await fetchMlbPostseasonSeries(ctx.pool.season);
  const firstPitch = slate.filter(s => s.round === "wild_card").map(s => s.startsAt.getTime()).sort((a, b) => a - b)[0];
  return firstPitch !== undefined && Date.now() >= firstPitch;
}
function cards(slots: Array<typeof mlbBracketSlotsTable.$inferSelect>, picks: Array<typeof mlbBracketPicksTable.$inferSelect>, series: Awaited<ReturnType<typeof fetchMlbPostseasonSeries>>, results: Array<typeof mlbBracketResultsTable.$inferSelect>) {
  const saved = new Map(results.map(r => [r.seriesSlot, r]));
  const pickMap = new Map(picks.map(p => [p.seriesSlot, p.predictedWinner]));
  const resultMap = new Map(results.map(r => [r.seriesSlot, r.winner]));
  return slots.map(slot => {
    const { round, seriesSlot } = slot;
    const result = saved.get(seriesSlot);
    const [slotTeam1, slotTeam2] = resolveMlbBracketSlotTeams(slot, resultMap);
    const resolvedTeam1 = result?.team1 ?? slotTeam1;
    const resolvedTeam2 = result?.team2 ?? slotTeam2;
    const current = resolvedTeam1 && resolvedTeam2
      ? series.find(candidate =>
          candidate.round === round &&
          new Set([candidate.team1, candidate.team2]).size === 2 &&
          [candidate.team1, candidate.team2].includes(resolvedTeam1) &&
          [candidate.team1, candidate.team2].includes(resolvedTeam2))
      : undefined;
    const matchupResolved = Boolean(result || current || (resolvedTeam1 && resolvedTeam2));
    const team1 = matchupResolved ? current?.team1 ?? result?.team1 ?? resolvedTeam1 : null;
    const team2 = matchupResolved ? current?.team2 ?? result?.team2 ?? resolvedTeam2 : null;
    const logoFor = (team: string | null) => {
      if (!team) return null;
      if (current?.team1 === team) return current.team1LogoUrl;
      if (current?.team2 === team) return current.team2LogoUrl;
      return getMlbTeamLogoUrl(team);
    };
    const eligibleTeams = [slot.fixedTeam1, slot.fixedTeam2, slot.feederSlot1 ? pickMap.get(slot.feederSlot1) : null, slot.feederSlot2 ? pickMap.get(slot.feederSlot2) : null].filter((team): team is string => Boolean(team));
    return {
      seriesId: seriesSlot, seriesSlot, round, roundLabel: ROUND_LABELS[round],
      team1, team2, team1LogoUrl: logoFor(team1), team2LogoUrl: logoFor(team2),
      eligibleTeams, allowedLengths: MLB_ROUND_LENGTHS[round], points: MLB_ROUND_POINTS[round],
      completed: Boolean(result), winner: result?.winner ?? null, actualLength: result?.actualLength ?? null,
      visuallyLocked: !current && round !== "wild_card",
    };
  });
}
router.get("/", requireAuth, async (req, res) => {
  const ctx = await getContext(req, res); if (!ctx) return;
  const [series, picks, results, slots] = await Promise.all([
    ctx.pool.sandboxMode ? Promise.resolve([]) : fetchMlbPostseasonSeries(ctx.pool.season),
    db.select().from(mlbBracketPicksTable).where(and(eq(mlbBracketPicksTable.poolId, ctx.poolId), eq(mlbBracketPicksTable.userId, req.user!.id))),
    db.select().from(mlbBracketResultsTable).where(eq(mlbBracketResultsTable.poolId, ctx.poolId)),
    db.select().from(mlbBracketSlotsTable).where(eq(mlbBracketSlotsTable.poolId, ctx.poolId)),
  ]);
  const field = slots.flatMap(slot => [slot.fixedTeam1, slot.fixedTeam2]).filter((team): team is string => Boolean(team));
  const liveLogos = new Map(series.flatMap(item => [
    [item.team1, item.team1LogoUrl] as const,
    [item.team2, item.team2LogoUrl] as const,
  ]));
  const teamLogos = Object.fromEntries(field.map(team => [
    team,
    liveLogos.get(team) ?? getMlbTeamLogoUrl(team),
  ]));
  const picksBySeries = new Map(picks.map(p => [p.seriesId, p]));
  res.json({ field, teamLogos, isLocked: await pickLocked(ctx, series), rounds: cards(slots, picks, series, results).map(card => ({ ...card, pick: picksBySeries.get(card.seriesId) ?? null })) });
});
async function submitPicks(req: any, res: any) {
  const ctx = await getContext(req, res); if (!ctx) return;
  const picks = (req.body as { picks?: unknown }).picks;
  if (!Array.isArray(picks) || !picks.length) { res.status(400).json({ error: "picks must be a non-empty array" }); return; }
  const series = await fetchMlbPostseasonSeries(ctx.pool.season);
  if (await pickLocked(ctx, series)) { res.status(400).json({ error: "The MLB bracket is locked; all picks were due before the first Wild Card pitch" }); return; }
  const slots = await db.select().from(mlbBracketSlotsTable).where(eq(mlbBracketSlotsTable.poolId, ctx.poolId));
  if (picks.length !== 11 || new Set(picks.map((pick: any) => pick.seriesId)).size !== 11) { res.status(400).json({ error: "Submit exactly one pick for each of the 11 canonical series" }); return; }
  const saved = await db.select().from(mlbBracketPicksTable).where(and(eq(mlbBracketPicksTable.poolId, ctx.poolId), eq(mlbBracketPicksTable.userId, req.user.id)));
  const predicted = new Map(saved.map(p => [p.seriesSlot, p.predictedWinner]));
  for (const pick of picks as Array<any>) predicted.set(pick.seriesId, pick.predictedWinner);
  for (const pick of picks as Array<any>) {
    const slot = slots.find(slot => slot.seriesSlot === pick.seriesId);
    const teams = [slot?.fixedTeam1, slot?.fixedTeam2, slot?.feederSlot1 ? predicted.get(slot.feederSlot1) : null, slot?.feederSlot2 ? predicted.get(slot.feederSlot2) : null].filter(Boolean);
    if (!slot || !teams.includes(pick.predictedWinner) || !MLB_ROUND_LENGTHS[slot.round].includes(Number(pick.predictedLength))) {
      res.status(400).json({ error: "Each pick must use an eligible team and valid series length for a canonical slot" }); return;
    }
  }
  await db.insert(mlbBracketPicksTable).values((picks as Array<any>).map(pick => {
    const slot = slots.find(slot => slot.seriesSlot === pick.seriesId)!;
    return { poolId: ctx.poolId, userId: req.user!.id, seriesId: slot.seriesSlot, round: slot.round, seriesSlot: slot.seriesSlot, predictedWinner: pick.predictedWinner, predictedLength: Number(pick.predictedLength) };
  })).onConflictDoUpdate({ target: [mlbBracketPicksTable.poolId, mlbBracketPicksTable.userId, mlbBracketPicksTable.seriesId], set: { predictedWinner: sql`excluded.predicted_winner`, predictedLength: sql`excluded.predicted_length`, winnerCorrect: null, lengthCorrect: null, updatedAt: new Date() } });
  res.json({ saved: picks.length });
}
router.post("/", requireAuth, submitPicks);
router.post("/picks", requireAuth, submitPicks);
router.get("/leaderboard", requireAuth, async (req, res) => {
  const ctx = await getContext(req, res); if (!ctx) return;
  const members = await db.select({ userId: entriesTable.userId, username: usersTable.username, displayName: usersTable.displayName }).from(entriesTable).innerJoin(usersTable, eq(entriesTable.userId, usersTable.id)).where(eq(entriesTable.poolId, ctx.poolId));
  const picks = await db.select().from(mlbBracketPicksTable).where(eq(mlbBracketPicksTable.poolId, ctx.poolId));
  const rows = members.map(member => { const own = picks.filter(p => p.userId === member.userId); return { ...member, points: own.filter(p => p.winnerCorrect).reduce((sum, p) => sum + MLB_ROUND_POINTS[p.round], 0), correctLengths: own.filter(p => p.lengthCorrect).length }; }).sort((a, b) => b.points - a.points || b.correctLengths - a.correctLengths);
  let rank = 0; res.json(rows.map((row, index) => { if (!index || row.points !== rows[index - 1].points || row.correctLengths !== rows[index - 1].correctLengths) rank = index + 1; return { ...row, rank }; }));
});
router.get("/members/:userId/picks", requireAuth, async (req, res) => {
  const ctx = await getContext(req, res); if (!ctx) return;
  const userId = Number(req.params.userId);
  const exists = await db.select({ id: entriesTable.id }).from(entriesTable).where(and(eq(entriesTable.poolId, ctx.poolId), eq(entriesTable.userId, userId))).limit(1);
  if (!exists.length) { res.status(404).json({ error: "Member not found" }); return; }
  const [picks, results] = await Promise.all([
    db.select().from(mlbBracketPicksTable).where(and(eq(mlbBracketPicksTable.poolId, ctx.poolId), eq(mlbBracketPicksTable.userId, userId))),
    db.select().from(mlbBracketResultsTable).where(eq(mlbBracketResultsTable.poolId, ctx.poolId)),
  ]);
  const picksBySlot = new Map(picks.map(pick => [pick.seriesSlot, pick]));
  const resultsBySlot = new Map(results.map(result => [result.seriesSlot, result]));
  res.json(MLB_BRACKET_SLOTS.map(([round, seriesSlot]) => {
    const pick = picksBySlot.get(seriesSlot);
    const result = resultsBySlot.get(seriesSlot);
    return {
      seriesId: seriesSlot,
      seriesSlot,
      round,
      roundLabel: ROUND_LABELS[round],
      predictedWinner: pick?.predictedWinner ?? null,
      predictedLength: pick?.predictedLength ?? null,
      actualWinner: result?.winner ?? null,
      actualLength: result?.actualLength ?? null,
      winnerCorrect: pick?.winnerCorrect ?? null,
      lengthCorrect: pick?.lengthCorrect ?? null,
      pointsEarned: pick?.winnerCorrect ? MLB_ROUND_POINTS[round] : 0,
      possiblePoints: MLB_ROUND_POINTS[round],
    };
  }));
});
async function simulate(ctx: Context, full: boolean) {
  const results = await db.select().from(mlbBracketResultsTable).where(eq(mlbBracketResultsTable.poolId, ctx.poolId));
  const slots = await db.select().from(mlbBracketSlotsTable).where(eq(mlbBracketSlotsTable.poolId, ctx.poolId));
  const winners = new Map(results.map(result => [result.seriesSlot, result.winner]));
  const completedSlots = new Set(results.map(result => result.seriesSlot));
  const rounds = ["wild_card", "division_series", "league_championship", "world_series"];
  let simulated = 0;

  for (const round of rounds) {
    const unresolved = slots.filter(slot => slot.round === round && !completedSlots.has(slot.seriesSlot));
    if (unresolved.length === 0) continue;
    for (const slot of unresolved) {
      const [team1, team2] = resolveMlbBracketSlotTeams(slot, winners);
      if (!team1 || !team2) continue;
      await db.insert(mlbBracketResultsTable).values({
        poolId: ctx.poolId,
        seriesId: slot.seriesSlot,
        round: slot.round,
        seriesSlot: slot.seriesSlot,
        team1,
        team2,
        winner: team1,
        actualLength: MLB_ROUND_LENGTHS[slot.round][0],
        completedAt: new Date(),
        source: "sandbox",
      }).onConflictDoNothing();
      winners.set(slot.seriesSlot, team1);
      completedSlots.add(slot.seriesSlot);
      simulated++;
    }
    if (!full) break;
  }
  return simulated;
}
function sandboxOnly(ctx: Context, req: any, res: any) { if (ctx.pool.sandboxMode && (ctx.pool.commissionerId === req.user.id || req.user.role === "admin")) return true; res.status(403).json({ error: "Sandbox commissioner only" }); return false; }
router.post("/sandbox/simulate-next-round", requireAuth, async (req, res) => { const ctx = await getContext(req, res); if (!ctx || !sandboxOnly(ctx, req, res)) return; const simulated = await simulate(ctx, false); const graded = await processMlbBracketResults(); res.json({ simulated, picksGraded: graded.picksGraded }); });
router.post("/sandbox/simulate-full", requireAuth, async (req, res) => { const ctx = await getContext(req, res); if (!ctx || !sandboxOnly(ctx, req, res)) return; const simulated = await simulate(ctx, true); const graded = await processMlbBracketResults(); res.json({ simulated, picksGraded: graded.picksGraded }); });
export default router;