import { Router } from "express";
import { db } from "@workspace/db";
import {
  wcBracketPicksTable,
  wcBracketResultsTable,
  poolsTable,
  entriesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchWcBracketMatches, getWcTeamInfo } from "../lib/wc";

const router = Router({ mergeParams: true });

// ── Round constants ──────────────────────────────────────────────────────────

const ROUND_ORDER = [
  "round_of_32",
  "round_of_16",
  "quarterfinals",
  "semifinals",
  "final",
] as const;
type BracketRound = (typeof ROUND_ORDER)[number];

const ROUND_POINTS: Record<string, number> = {
  round_of_32: 10,
  round_of_16: 20,
  quarterfinals: 40,
  semifinals: 80,
  final: 160,
};

const ROUND_LABEL: Record<string, string> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinals: "Quarterfinals",
  semifinals: "Semifinals",
  final: "Final",
};

function isTbdName(name: string): boolean {
  return (
    name === "TBD" ||
    name.includes("Winner") ||
    name.includes("Loser") ||
    name.toLowerCase().includes("tbd")
  );
}

// Determine the current open/active bracket round.
// A round is "open"          if it has real-team games AND ≥1 game hasn't kicked off.
// A round is "in_progress"   if all games kicked off but ≥1 hasn't been graded in DB.
// A round is "graded_waiting"if all games are graded — returns the last graded round
//                            while we wait for the next round's teams to be announced.
// Returns null only if ESPN returned zero bracket events.
function resolveCurrentRound(
  allMatches: Awaited<ReturnType<typeof fetchWcBracketMatches>>,
  gradedEventIds: Set<string>,
  now: Date,
): {
  round: BracketRound;
  status: "open" | "in_progress" | "graded_waiting";
  games: typeof allMatches;
} | null {
  const byRound = new Map<string, typeof allMatches>();
  for (const m of allMatches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }

  let lastRoundWithGames: BracketRound | null = null;
  let lastGames: typeof allMatches = [];

  for (const round of ROUND_ORDER) {
    const games = (byRound.get(round) ?? []).filter(
      (g) => !isTbdName(g.team1) && !isTbdName(g.team2),
    );
    if (games.length === 0) continue;

    lastRoundWithGames = round;
    lastGames = games;

    const hasUnlocked = games.some((g) => now < new Date(g.matchDate));
    if (hasUnlocked) return { round, status: "open", games };

    const allGraded = games.every((g) => gradedEventIds.has(g.espnEventId));
    if (!allGraded) return { round, status: "in_progress", games };
    // Fully graded → advance to next round
  }

  // All available rounds are fully graded (or no round is open yet)
  if (lastRoundWithGames) {
    return { round: lastRoundWithGames, status: "graded_waiting", games: lastGames };
  }

  // ESPN returned no bracket events with real teams at all
  return null;
}

// ── GET /api/pools/:poolId/bracket ───────────────────────────────────────────
// Returns current round's matchups enriched with the requesting user's picks + results.
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

  const [allMatches, userPicks, dbResults] = await Promise.all([
    fetchWcBracketMatches(),
    db.select().from(wcBracketPicksTable).where(
      and(eq(wcBracketPicksTable.poolId, poolId), eq(wcBracketPicksTable.userId, userId)),
    ),
    db.select().from(wcBracketResultsTable).where(eq(wcBracketResultsTable.poolId, poolId)),
  ]);

  if (allMatches.length === 0) {
    res.status(503).json({ error: "Bracket data unavailable — ESPN API unreachable" });
    return;
  }

  const gradedEventIds = new Set(dbResults.map((r) => r.espnEventId));
  const now = new Date();
  const current = resolveCurrentRound(allMatches, gradedEventIds, now);

  // Fallback: if no round resolved, show R32 with whatever ESPN has
  const activeRound: BracketRound = current?.round ?? "round_of_32";
  const roundStatus = current?.status ?? "open";
  const activeGames = current?.games ?? allMatches.filter((m) => m.round === "round_of_32");

  const picksByEvent = new Map(userPicks.map((p) => [p.espnEventId, p]));
  const resultsByEvent = new Map(dbResults.map((r) => [r.espnEventId, r]));

  const matches = activeGames.map((match) => {
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
      isCompleted: result !== null,
      pickedTeam: pick?.pickedTeam ?? null,
      isCorrect: pick?.isCorrect ?? null,
      result: result
        ? { winner: result.winner, winType: result.winType, gradedAt: result.gradedAt }
        : null,
    };
  });

  res.json({
    currentRound: activeRound,
    roundLabel: ROUND_LABEL[activeRound] ?? activeRound,
    roundStatus,
    roundPoints: ROUND_POINTS[activeRound] ?? 10,
    matches,
  });
});

// ── POST /api/pools/:poolId/bracket/picks ────────────────────────────────────
// Accepts an array of { espnEventId, pickedTeam } objects.
// Only accepts picks for games in the current open round.
// Per-match lock is checked independently — locked games in the batch are skipped.
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

  const [allMatches, dbResults] = await Promise.all([
    fetchWcBracketMatches(),
    db.select().from(wcBracketResultsTable).where(eq(wcBracketResultsTable.poolId, poolId)),
  ]);

  if (allMatches.length === 0) {
    res.status(503).json({ error: "Bracket data unavailable — ESPN API unreachable" }); return;
  }

  const gradedEventIds = new Set(dbResults.map((r) => r.espnEventId));
  const now = new Date();
  const current = resolveCurrentRound(allMatches, gradedEventIds, now);

  if (!current || current.status !== "open") {
    const label = current ? ROUND_LABEL[current.round] ?? current.round : "the bracket";
    res.status(400).json({
      error: current?.status === "in_progress"
        ? `${label} is in progress — picks are locked until results are in`
        : "No round is currently open for picking",
    });
    return;
  }

  const openRound = current.round;
  const openEventIds = new Set(current.games.map((g) => g.espnEventId));
  const matchByEvent = new Map(allMatches.map((m) => [m.espnEventId, m]));

  const toInsert: Array<typeof wcBracketPicksTable.$inferInsert> = [];
  const rejectedEventIds: string[] = [];

  for (const p of picks) {
    const espnEventId = String(p.espnEventId ?? "");
    const pickedTeam = String(p.pickedTeam ?? "");

    const match = matchByEvent.get(espnEventId);
    if (!match) {
      res.status(400).json({ error: `Unknown event ID: ${espnEventId}` }); return;
    }
    if (!openEventIds.has(espnEventId)) {
      res.status(400).json({
        error: `Picks for ${ROUND_LABEL[match.round] ?? match.round} are not currently accepted — only ${ROUND_LABEL[openRound]} picks are open`,
      }); return;
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

// ── GET /api/pools/:poolId/bracket/leaderboard ───────────────────────────────
// Points-based scoring: R32=10, R16=20, QF=40, SF=80, Final=160.
// Existing R32 picks automatically score at 10 pts each.
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

  // Fetch correct picks grouped by userId + round for points calculation
  const correctByRound = await db
    .select({
      userId: wcBracketPicksTable.userId,
      round: wcBracketPicksTable.round,
      correct: sql<number>`count(*)::integer`,
    })
    .from(wcBracketPicksTable)
    .where(
      and(
        eq(wcBracketPicksTable.poolId, poolId),
        eq(wcBracketPicksTable.isCorrect, true),
      ),
    )
    .groupBy(wcBracketPicksTable.userId, wcBracketPicksTable.round);

  // Build points map: userId → { total, breakdown per round }
  type BreakdownEntry = { round: string; roundLabel: string; correct: number; points: number };
  const pointsMap = new Map<number, { total: number; breakdown: BreakdownEntry[] }>();

  for (const row of correctByRound) {
    const pts = ROUND_POINTS[row.round] ?? 0;
    const earned = pts * row.correct;
    if (!pointsMap.has(row.userId)) {
      pointsMap.set(row.userId, { total: 0, breakdown: [] });
    }
    const entry = pointsMap.get(row.userId)!;
    entry.total += earned;
    entry.breakdown.push({
      round: row.round,
      roundLabel: ROUND_LABEL[row.round] ?? row.round,
      correct: row.correct,
      points: earned,
    });
  }

  // Sort breakdown by round order
  for (const entry of pointsMap.values()) {
    entry.breakdown.sort(
      (a, b) => ROUND_ORDER.indexOf(a.round as BracketRound) - ROUND_ORDER.indexOf(b.round as BracketRound),
    );
  }

  const scored = members.map((m) => {
    const pts = pointsMap.get(m.userId);
    return {
      userId: m.userId,
      username: m.username,
      displayName: m.displayName ?? null,
      points: pts?.total ?? 0,
      breakdown: pts?.breakdown ?? [],
    };
  });

  scored.sort((a, b) => b.points - a.points);

  let rank = 1;
  const ranked = scored.map((e, i) => {
    if (i > 0 && e.points < scored[i - 1].points) rank = i + 1;
    return { ...e, rank };
  });

  res.json(ranked);
});

// ── GET /api/pools/:poolId/bracket/members/:userId/picks ─────────────────────
// Returns all bracket rounds' matchups enriched with the specified member's picks + results.
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

  const [allMatches, memberPicks, dbResults] = await Promise.all([
    fetchWcBracketMatches(),
    db.select().from(wcBracketPicksTable).where(
      and(eq(wcBracketPicksTable.poolId, poolId), eq(wcBracketPicksTable.userId, targetUserId)),
    ),
    db.select().from(wcBracketResultsTable).where(eq(wcBracketResultsTable.poolId, poolId)),
  ]);

  if (allMatches.length === 0) {
    res.status(503).json({ error: "Bracket data unavailable — ESPN API unreachable" });
    return;
  }

  // Return all rounds with real teams (the full pick history view)
  const realMatches = allMatches.filter(
    (m) => !isTbdName(m.team1) && !isTbdName(m.team2),
  );

  const picksByEvent = new Map(memberPicks.map((p) => [p.espnEventId, p]));
  const resultsByEvent = new Map(dbResults.map((r) => [r.espnEventId, r]));
  const now = new Date();

  const payload = realMatches.map((match) => {
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
      isCompleted: result !== null,
      pickedTeam: pick?.pickedTeam ?? null,
      isCorrect: pick?.isCorrect ?? null,
      result: result
        ? { winner: result.winner, winType: result.winType, gradedAt: result.gradedAt }
        : null,
    };
  });

  // Sort by round order then matchSlot
  payload.sort((a, b) => {
    const ri = ROUND_ORDER.indexOf(a.round as BracketRound) - ROUND_ORDER.indexOf(b.round as BracketRound);
    return ri !== 0 ? ri : a.matchSlot - b.matchSlot;
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
        const pick   = espn ? (pickById.get(espn.espnEventId)   ?? null) : null;
        if (result?.winner) winners.set(`${round}:${side}:${pos}`, result.winner);

        slots.push({
          round, bracketPos: pos, side,
          team1, team2,
          team1Logo: logoFor(team1, espn?.team1Logo), team2Logo: logoFor(team2, espn?.team2Logo),
          matchDate: espn?.matchDate ?? null,
          isCompleted: result !== null, winner: result?.winner ?? null, winType: result?.winType ?? null,
          pickedTeam: pick?.pickedTeam ?? null, isCorrect: pick?.isCorrect ?? null,
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
  const finalPick   = finalEspn ? (pickById.get(finalEspn.espnEventId)   ?? null) : null;
  slots.push({
    round: "final", bracketPos: 1, side: "left",
    team1: finalTeam1, team2: finalTeam2,
    team1Logo: logoFor(finalTeam1, finalEspn?.team1Logo),
    team2Logo: logoFor(finalTeam2, finalEspn?.team2Logo),
    matchDate: finalEspn?.matchDate ?? null,
    isCompleted: finalResult !== null, winner: finalResult?.winner ?? null,
    winType: finalResult?.winType ?? null,
    pickedTeam: finalPick?.pickedTeam ?? null, isCorrect: finalPick?.isCorrect ?? null,
  });

  res.json(slots);
});

// ── GET /api/pools/:poolId/bracket/current-round/all-picks ───────────────────
// Returns the current active round's matches + every pool member's pick per match.
router.get("/current-round/all-picks", requireAuth, async (req, res) => {
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

  const [allMatches, dbResults] = await Promise.all([
    fetchWcBracketMatches(),
    db.select().from(wcBracketResultsTable).where(eq(wcBracketResultsTable.poolId, poolId)),
  ]);

  if (allMatches.length === 0) {
    res.status(503).json({ error: "Bracket data unavailable — ESPN API unreachable" });
    return;
  }

  const gradedEventIds = new Set(dbResults.map((r) => r.espnEventId));
  const now = new Date();
  const current = resolveCurrentRound(allMatches, gradedEventIds, now);
  const activeRound: BracketRound = current?.round ?? "round_of_32";
  const activeGames = current?.games ?? allMatches.filter((m) => m.round === "round_of_32");
  const activeEventIds = activeGames.map((g) => g.espnEventId);
  const resultsByEvent = new Map(dbResults.map((r) => [r.espnEventId, r]));

  const [members, allPicks] = await Promise.all([
    db
      .select({ userId: entriesTable.userId, displayName: usersTable.displayName })
      .from(entriesTable)
      .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
      .where(eq(entriesTable.poolId, poolId)),
    activeEventIds.length > 0
      ? db
          .select()
          .from(wcBracketPicksTable)
          .where(
            and(
              eq(wcBracketPicksTable.poolId, poolId),
              inArray(wcBracketPicksTable.espnEventId, activeEventIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  // Group picks: userId → espnEventId → { pickedTeam, isCorrect }
  const picksByUser = new Map<number, Map<string, { pickedTeam: string; isCorrect: boolean | null }>>();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, new Map());
    picksByUser.get(pick.userId)!.set(pick.espnEventId, {
      pickedTeam: pick.pickedTeam,
      isCorrect: pick.isCorrect ?? null,
    });
  }

  const matches = activeGames.map((match) => {
    const result = resultsByEvent.get(match.espnEventId) ?? null;
    return {
      espnEventId: match.espnEventId,
      team1: match.team1,
      team1Logo: match.team1Logo ?? null,
      team2: match.team2,
      team2Logo: match.team2Logo ?? null,
      matchDate: match.matchDate,
      isCompleted: result !== null,
      result: result?.winner ?? null,
    };
  });

  const membersPayload = members.map((m) => {
    const userPickMap = picksByUser.get(m.userId) ?? new Map();
    const picks: Record<string, { pickedTeam: string; isCorrect: boolean | null }> = {};
    for (const [eventId, pick] of userPickMap) {
      picks[eventId] = pick;
    }
    return { userId: m.userId, displayName: m.displayName ?? null, picks };
  });

  res.json({ round: activeRound, roundLabel: ROUND_LABEL[activeRound] ?? activeRound, matches, members: membersPayload });
});

export default router;
