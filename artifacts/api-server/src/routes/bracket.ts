import { Router } from "express";
import { db } from "@workspace/db";
import {
  wcBracketPicksTable,
  wcBracketResultsTable,
  poolsTable,
  entriesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchWcBracketMatches, getWcTeamInfo } from "../lib/wc";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/bracket
// Returns all R32 matchups enriched with the requesting user's picks + any results.
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "wc_bracket") {
    res.status(400).json({ error: "Not a WC bracket pool" }); return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const [matches, userPicks, results] = await Promise.all([
    fetchWcBracketMatches(),
    db.select().from(wcBracketPicksTable).where(
      and(eq(wcBracketPicksTable.poolId, poolId), eq(wcBracketPicksTable.userId, userId)),
    ),
    db.select().from(wcBracketResultsTable).where(eq(wcBracketResultsTable.poolId, poolId)),
  ]);

  if (matches.length === 0) {
    res.status(503).json({ error: "Bracket data unavailable — ESPN API unreachable" });
    return;
  }

  const r32 = matches.filter((m) => m.round === "round_of_32");
  const picksByEvent = new Map(userPicks.map((p) => [p.espnEventId, p]));
  const resultsByEvent = new Map(results.map((r) => [r.espnEventId, r]));
  const now = new Date();

  const payload = r32.map((match) => {
    const pick = picksByEvent.get(match.espnEventId) ?? null;
    const result = resultsByEvent.get(match.espnEventId) ?? null;
    const isLocked = now >= new Date(match.matchDate);

    return {
      espnEventId: match.espnEventId,
      round: match.round,
      matchSlot: match.matchSlot,
      team1: match.team1,
      team2: match.team2,
      team1Logo: match.team1Logo,
      team2Logo: match.team2Logo,
      matchDate: match.matchDate,
      isLocked,
      isCompleted: match.isCompleted,
      pickedTeam: pick?.pickedTeam ?? null,
      isCorrect: pick?.isCorrect ?? null,
      result: result
        ? { winner: result.winner, winType: result.winType, gradedAt: result.gradedAt }
        : null,
    };
  });

  res.json(payload);
});

// POST /api/pools/:poolId/bracket/picks
// Accepts an array of { espnEventId, pickedTeam } objects.
// Each match's lock is checked independently against its own kickoff time.
// Already-locked matches in the batch are skipped (rejectedEventIds returned),
// not treated as an error — so a bulk submission can save valid picks even if
// some have already kicked off.
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "wc_bracket") {
    res.status(400).json({ error: "Not a WC bracket pool" }); return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const body = req.body as { picks?: unknown };
  if (!Array.isArray(body.picks) || body.picks.length === 0) {
    res.status(400).json({ error: "picks must be a non-empty array" }); return;
  }

  const picks = body.picks as Array<{ espnEventId?: unknown; pickedTeam?: unknown }>;

  const matches = await fetchWcBracketMatches();
  if (matches.length === 0) {
    res.status(503).json({ error: "Bracket data unavailable — ESPN API unreachable" }); return;
  }

  const matchByEvent = new Map(matches.map((m) => [m.espnEventId, m]));
  const now = new Date();

  const toInsert: Array<typeof wcBracketPicksTable.$inferInsert> = [];
  const rejectedEventIds: string[] = [];

  for (const p of picks) {
    const espnEventId = String(p.espnEventId ?? "");
    const pickedTeam = String(p.pickedTeam ?? "");

    const match = matchByEvent.get(espnEventId);
    if (!match) {
      res.status(400).json({ error: `Unknown event ID: ${espnEventId}` }); return;
    }
    if (match.round !== "round_of_32") {
      res.status(400).json({ error: `Only Round of 32 picks accepted at this time` }); return;
    }
    if (pickedTeam !== match.team1 && pickedTeam !== match.team2) {
      res.status(400).json({
        error: `"${pickedTeam}" is not a participant in event ${espnEventId}`,
      }); return;
    }

    if (now >= new Date(match.matchDate)) {
      rejectedEventIds.push(espnEventId);
      continue;
    }

    toInsert.push({
      poolId,
      userId,
      espnEventId: match.espnEventId,
      round: match.round,
      matchSlot: match.matchSlot,
      pickedTeam,
      isCorrect: null,
    });
  }

  if (toInsert.length > 0) {
    await db
      .insert(wcBracketPicksTable)
      .values(toInsert)
      .onConflictDoUpdate({
        target: [
          wcBracketPicksTable.poolId,
          wcBracketPicksTable.userId,
          wcBracketPicksTable.espnEventId,
        ],
        set: {
          pickedTeam: sql`excluded.picked_team`,
          isCorrect: null,
          updatedAt: new Date(),
        },
      });
  }

  res.json({
    saved: toInsert.length,
    rejected: rejectedEventIds.length,
    rejectedEventIds,
  });
});

// GET /api/pools/:poolId/bracket/leaderboard
// Sum of is_correct=true picks per player (1 pt each, max 16).
router.get("/leaderboard", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "wc_bracket") {
    res.status(400).json({ error: "Not a WC bracket pool" }); return;
  }

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

  const correctPicks = await db
    .select({ userId: wcBracketPicksTable.userId })
    .from(wcBracketPicksTable)
    .where(
      and(
        eq(wcBracketPicksTable.poolId, poolId),
        eq(wcBracketPicksTable.isCorrect, true),
      ),
    );

  const correctByUser = new Map<number, number>();
  for (const row of correctPicks) {
    correctByUser.set(row.userId, (correctByUser.get(row.userId) ?? 0) + 1);
  }

  const totalPicks = await db
    .select({ userId: wcBracketPicksTable.userId })
    .from(wcBracketPicksTable)
    .where(eq(wcBracketPicksTable.poolId, poolId));

  const totalByUser = new Map<number, number>();
  for (const row of totalPicks) {
    totalByUser.set(row.userId, (totalByUser.get(row.userId) ?? 0) + 1);
  }

  const scored = members.map((m) => ({
    userId: m.userId,
    username: m.username,
    displayName: m.displayName ?? null,
    correct: correctByUser.get(m.userId) ?? 0,
    total: totalByUser.get(m.userId) ?? 0,
  }));

  scored.sort((a, b) => b.correct - a.correct || b.total - a.total);

  let rank = 1;
  const ranked = scored.map((e, i) => {
    if (i > 0 && e.correct < scored[i - 1].correct) rank = i + 1;
    return { ...e, rank };
  });

  res.json(ranked);
});

// GET /api/pools/:poolId/bracket/members/:userId/picks
// Returns all R32 matchups enriched with the specified member's picks + results.
// Any authenticated pool member can view any other member's picks.
router.get("/members/:userId/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const targetUserId = parseInt(String(req.params.userId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "wc_bracket") {
    res.status(400).json({ error: "Not a WC bracket pool" }); return;
  }

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, req.user!.id)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a member of this pool" }); return; }

  const [matches, memberPicks, results] = await Promise.all([
    fetchWcBracketMatches(),
    db.select().from(wcBracketPicksTable).where(
      and(eq(wcBracketPicksTable.poolId, poolId), eq(wcBracketPicksTable.userId, targetUserId)),
    ),
    db.select().from(wcBracketResultsTable).where(eq(wcBracketResultsTable.poolId, poolId)),
  ]);

  if (matches.length === 0) {
    res.status(503).json({ error: "Bracket data unavailable — ESPN API unreachable" });
    return;
  }

  const r32 = matches.filter((m) => m.round === "round_of_32");
  const picksByEvent = new Map(memberPicks.map((p) => [p.espnEventId, p]));
  const resultsByEvent = new Map(results.map((r) => [r.espnEventId, r]));
  const now = new Date();

  const payload = r32.map((match) => {
    const pick = picksByEvent.get(match.espnEventId) ?? null;
    const result = resultsByEvent.get(match.espnEventId) ?? null;
    const isLocked = now >= new Date(match.matchDate);

    return {
      espnEventId: match.espnEventId,
      round: match.round,
      matchSlot: match.matchSlot,
      team1: match.team1,
      team2: match.team2,
      team1Logo: match.team1Logo,
      team2Logo: match.team2Logo,
      matchDate: match.matchDate,
      isLocked,
      isCompleted: match.isCompleted,
      pickedTeam: pick?.pickedTeam ?? null,
      isCorrect: pick?.isCorrect ?? null,
      result: result
        ? { winner: result.winner, winType: result.winType, gradedAt: result.gradedAt }
        : null,
    };
  });

  res.json(payload);
});

// ── Bracket tree: all rounds with auto-advancement ───────────────────────────
// Static WC 2026 R32 bracket positions (FOX Sports / ESPN visual order)
const WC2026_R32 = [
  // Left side (positions 1–8, top → bottom)
  { bracketPos: 1, side: "left"  as const, team1: "Germany",     team2: "Paraguay" },
  { bracketPos: 2, side: "left"  as const, team1: "France",       team2: "Sweden" },
  { bracketPos: 3, side: "left"  as const, team1: "South Africa", team2: "Canada" },
  { bracketPos: 4, side: "left"  as const, team1: "Netherlands",  team2: "Morocco" },
  { bracketPos: 5, side: "left"  as const, team1: "Portugal",     team2: "Croatia" },
  { bracketPos: 6, side: "left"  as const, team1: "Spain",        team2: "Austria" },
  { bracketPos: 7, side: "left"  as const, team1: "USA",          team2: "Bosnia & Herzegovina" },
  { bracketPos: 8, side: "left"  as const, team1: "Belgium",      team2: "Senegal" },
  // Right side (positions 1–8, top → bottom, mirrored toward center)
  { bracketPos: 1, side: "right" as const, team1: "Brazil",       team2: "Japan" },
  { bracketPos: 2, side: "right" as const, team1: "Ivory Coast",  team2: "Norway" },
  { bracketPos: 3, side: "right" as const, team1: "Mexico",       team2: "Ecuador" },
  { bracketPos: 4, side: "right" as const, team1: "England",      team2: "DR Congo" },
  { bracketPos: 5, side: "right" as const, team1: "Argentina",    team2: "Cape Verde" },
  { bracketPos: 6, side: "right" as const, team1: "Australia",    team2: "Egypt" },
  { bracketPos: 7, side: "right" as const, team1: "Switzerland",  team2: "Algeria" },
  { bracketPos: 8, side: "right" as const, team1: "Colombia",     team2: "Ghana" },
];

// Advancement: bracketPos N → Math.ceil(N/2) in next round (per side independently)

// GET /api/pools/:poolId/bracket/tree
router.get("/tree", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }
  if ((pool.poolType as string) !== "wc_bracket") {
    res.status(400).json({ error: "Not a WC bracket pool" }); return;
  }
  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) { res.status(403).json({ error: "Not a pool member" }); return; }

  const [espnMatches, dbResults, userPicks] = await Promise.all([
    fetchWcBracketMatches(),
    db.select().from(wcBracketResultsTable).where(eq(wcBracketResultsTable.poolId, poolId)),
    db.select().from(wcBracketPicksTable).where(
      and(eq(wcBracketPicksTable.poolId, poolId), eq(wcBracketPicksTable.userId, userId)),
    ),
  ]);

  // Build fast lookups
  const espnByPair = new Map<string, (typeof espnMatches)[0]>();
  for (const m of espnMatches) {
    espnByPair.set(`${m.team1}|${m.team2}`, m);
    espnByPair.set(`${m.team2}|${m.team1}`, m);
  }
  const resultById  = new Map(dbResults.map((r) => [r.espnEventId, r]));
  const pickById    = new Map(userPicks.map((p) => [p.espnEventId, p]));

  function logoFor(name: string, espnLogo: string | null | undefined): string | null {
    if (name === "TBD" || !name) return null;
    if (espnLogo) return espnLogo;
    return getWcTeamInfo(name).flagUrl || null;
  }

  // winners["round:side:pos"] = winning team name
  const winners = new Map<string, string>();

  interface BracketTreeSlot {
    round: string; bracketPos: number; side: string;
    team1: string; team2: string; team1Logo: string | null; team2Logo: string | null;
    matchDate: string | null; isCompleted: boolean;
    winner: string | null; winType: string | null;
    pickedTeam: string | null; isCorrect: boolean | null;
  }
  const slots: BracketTreeSlot[] = [];

  // ── Round of 32 ──────────────────────────────────────────────────────────
  for (const pos of WC2026_R32) {
    const espn   = espnByPair.get(`${pos.team1}|${pos.team2}`);
    const result = espn ? (resultById.get(espn.espnEventId) ?? null) : null;
    const pick   = espn ? (pickById.get(espn.espnEventId)   ?? null) : null;
    if (result?.winner) winners.set(`round_of_32:${pos.side}:${pos.bracketPos}`, result.winner);
    slots.push({
      round: "round_of_32", bracketPos: pos.bracketPos, side: pos.side,
      team1: pos.team1, team2: pos.team2,
      team1Logo: logoFor(pos.team1, espn?.team1Logo), team2Logo: logoFor(pos.team2, espn?.team2Logo),
      matchDate: espn?.matchDate ?? null,
      isCompleted: result !== null, winner: result?.winner ?? null, winType: result?.winType ?? null,
      pickedTeam: pick?.pickedTeam ?? null, isCorrect: pick?.isCorrect ?? null,
    });
  }

  // ── Higher rounds (derived from winner chain) ─────────────────────────────
  const higherRounds = [
    { round: "round_of_16",  parentCount: 4, prevRound: "round_of_32" },
    { round: "quarterfinals", parentCount: 2, prevRound: "round_of_16" },
    { round: "semifinals",    parentCount: 1, prevRound: "quarterfinals" },
  ];

  for (const { round, parentCount, prevRound } of higherRounds) {
    for (const side of ["left", "right"] as const) {
      for (let pos = 1; pos <= parentCount; pos++) {
        const child1Key = `${prevRound}:${side}:${2 * pos - 1}`;
        const child2Key = `${prevRound}:${side}:${2 * pos}`;
        const team1 = winners.get(child1Key) ?? "TBD";
        const team2 = winners.get(child2Key) ?? "TBD";

        const espn = (team1 !== "TBD" && team2 !== "TBD")
          ? (espnByPair.get(`${team1}|${team2}`) ?? espnByPair.get(`${team2}|${team1}`))
          : undefined;
        const result = espn ? (resultById.get(espn.espnEventId) ?? null) : null;
        if (result?.winner) winners.set(`${round}:${side}:${pos}`, result.winner);

        slots.push({
          round, bracketPos: pos, side,
          team1, team2,
          team1Logo: logoFor(team1, espn?.team1Logo), team2Logo: logoFor(team2, espn?.team2Logo),
          matchDate: espn?.matchDate ?? null,
          isCompleted: result !== null, winner: result?.winner ?? null, winType: result?.winType ?? null,
          pickedTeam: null, isCorrect: null,
        });
      }
    }
  }

  // ── Final ─────────────────────────────────────────────────────────────────
  const finalTeam1 = winners.get("semifinals:left:1")  ?? "TBD";
  const finalTeam2 = winners.get("semifinals:right:1") ?? "TBD";
  const finalEspn  = (finalTeam1 !== "TBD" && finalTeam2 !== "TBD")
    ? (espnByPair.get(`${finalTeam1}|${finalTeam2}`) ?? espnByPair.get(`${finalTeam2}|${finalTeam1}`))
    : undefined;
  const finalResult = finalEspn ? (resultById.get(finalEspn.espnEventId) ?? null) : null;
  slots.push({
    round: "final", bracketPos: 1, side: "left",
    team1: finalTeam1, team2: finalTeam2,
    team1Logo: logoFor(finalTeam1, finalEspn?.team1Logo),
    team2Logo: logoFor(finalTeam2, finalEspn?.team2Logo),
    matchDate: finalEspn?.matchDate ?? null,
    isCompleted: finalResult !== null, winner: finalResult?.winner ?? null,
    winType: finalResult?.winType ?? null, pickedTeam: null, isCorrect: null,
  });

  res.json(slots);
});

export default router;
