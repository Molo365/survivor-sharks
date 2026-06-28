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
import { fetchWcBracketMatches } from "../lib/wc";

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

export default router;
