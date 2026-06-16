import { Router } from "express";
import { db } from "@workspace/db";
import { pickemPicksTable, poolsTable, entriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { fetchGamesForDate, getTodayEtDate, formatDateEt } from "../lib/espn";

const router = Router({ mergeParams: true });

// POST /api/pools/:poolId/crazy-eights/picks
router.post("/picks", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const userId = req.user!.id;

  const { picks, tiebreakerRuns, tiebreakerStrikeouts } = req.body as {
    picks: Array<{ gameId: string; pickedTeam?: string; confidencePoints: number }>;
    tiebreakerRuns: number;
    tiebreakerStrikeouts: number;
  };

  // ── Basic shape validation ───────────────────────────────────────────────────

  if (!Array.isArray(picks) || picks.length !== 8) {
    res.status(400).json({ error: "Exactly 8 picks are required" });
    return;
  }

  for (const p of picks) {
    if (!p.gameId || typeof p.confidencePoints !== "number") {
      res.status(400).json({ error: "Each pick must have gameId and confidencePoints" });
      return;
    }
  }

  // Confidence points 1-8, each used exactly once
  const cpSorted = picks.map((p) => p.confidencePoints).sort((a, b) => a - b);
  if (!cpSorted.every((v, i) => v === i + 1)) {
    res.status(400).json({ error: "Confidence points 1-8 must each be used exactly once" });
    return;
  }

  if (typeof tiebreakerRuns !== "number" || typeof tiebreakerStrikeouts !== "number") {
    res.status(400).json({ error: "tiebreakerRuns and tiebreakerStrikeouts are required" });
    return;
  }

  // ── Pool validation ──────────────────────────────────────────────────────────

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if ((pool.poolType as string) !== "crazy_8s") {
    res.status(400).json({ error: "This pool is not a Crazy 8's pool" });
    return;
  }

  // ── Membership check ────────────────────────────────────────────────────────

  const [entry] = await db
    .select()
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, userId)))
    .limit(1);
  if (!entry) {
    res.status(403).json({ error: "You are not a member of this pool" });
    return;
  }

  // ── Game validation against today's MLB slate ────────────────────────────────

  const todayEspn = formatDateEt(new Date());
  const todayEt = getTodayEtDate();
  const games = await fetchGamesForDate("mlb", todayEspn);
  const gameMap = new Map(games.map((g) => [g.id, g]));

  for (const pick of picks) {
    if (!gameMap.has(pick.gameId)) {
      res.status(400).json({ error: `Unknown game: ${pick.gameId}` });
      return;
    }
  }

  // ── Lock check: earliest selected game must not have started ─────────────────

  const selectedGames = picks.map((p) => gameMap.get(p.gameId)!);
  const earliestStartMs = Math.min(...selectedGames.map((g) => new Date(g.date).getTime()));
  if (Date.now() >= earliestStartMs) {
    res.status(400).json({ error: "Picks are locked — the earliest selected game has already started" });
    return;
  }

  // ── Upsert picks ─────────────────────────────────────────────────────────────

  let saved = 0;
  for (const pick of picks) {
    const teamLabel = pick.pickedTeam ?? "";
    await db
      .insert(pickemPicksTable)
      .values({
        poolId,
        userId,
        gameId: pick.gameId,
        gameDate: todayEt,
        week: pool.currentWeek,
        pickedTeamId: teamLabel,
        pickedTeamName: teamLabel,
        confidencePoints: pick.confidencePoints,
        result: "pending",
      })
      .onConflictDoUpdate({
        target: [pickemPicksTable.poolId, pickemPicksTable.userId, pickemPicksTable.gameId],
        set: {
          pickedTeamId: teamLabel,
          pickedTeamName: teamLabel,
          confidencePoints: pick.confidencePoints,
          result: "pending",
          updatedAt: new Date(),
        },
      });
    saved++;
  }

  // ── Save tiebreaker on pool entry ────────────────────────────────────────────

  await db
    .update(entriesTable)
    .set({
      tiebreakerRuns,
      tiebreakerStrikeouts,
    })
    .where(eq(entriesTable.id, entry.id));

  res.status(201).json({ ok: true, saved, message: "Crazy 8's picks submitted successfully" });
});

export default router;
