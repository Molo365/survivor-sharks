import { Router } from "express";
import { db } from "@workspace/db";
import { weekResultsTable, picksTable, entriesTable, poolsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCompletedGameResults, getGameMarginsByTeam } from "../lib/espn";
import { ESPN_TEAMS, type Sport } from "../lib/teams-data";

const router = Router({ mergeParams: true });

// ── SOV helper ────────────────────────────────────────────────────────────────
// Sums each alive player's marginOfVictory across all their picks and
// persists the result to entries.sovTotal.  Called only when multiple
// survivors remain after the final regular-season week (Week 18).
async function resolveSOV(poolId: number): Promise<void> {
  const aliveEntries = await db
    .select({ id: entriesTable.id, userId: entriesTable.userId })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

  const allPicks = await db
    .select({ userId: picksTable.userId, marginOfVictory: picksTable.marginOfVictory })
    .from(picksTable)
    .where(eq(picksTable.poolId, poolId));

  const sovByUser = new Map<number, number>();
  for (const pick of allPicks) {
    if (pick.marginOfVictory == null) continue;
    sovByUser.set(pick.userId, (sovByUser.get(pick.userId) ?? 0) + pick.marginOfVictory);
  }

  for (const entry of aliveEntries) {
    const sovTotal = sovByUser.get(entry.userId) ?? 0;
    await db.update(entriesTable).set({ sovTotal }).where(eq(entriesTable.id, entry.id));
  }
}

// GET /api/pools/:poolId/results
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const results = await db.select().from(weekResultsTable)
    .where(eq(weekResultsTable.poolId, poolId))
    .orderBy(weekResultsTable.week);

  res.json(results.map(r => ({
    id: r.id,
    poolId: r.poolId,
    week: r.week,
    losingTeamIds: r.losingTeamIds,
    processedAt: r.processedAt.toISOString(),
    processedBy: r.processedBy,
  })));
});

// POST /api/pools/:poolId/results
// Commissioner submits week results. Optionally can auto-fetch from ESPN
// by passing { week, autoFetch: true } instead of providing losingTeamIds.
router.post("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));
  const { week, losingTeamIds, autoFetch } = req.body;

  if (!week) {
    res.status(400).json({ error: "week is required" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.commissionerId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "Only the commissioner can process results" });
    return;
  }

  const sportTeams = ESPN_TEAMS[pool.sport as Sport] ?? [];
  const abbrevToId = new Map(sportTeams.map(t => [t.abbreviation.toUpperCase(), t.id]));
  const idToAbbrev = new Map(sportTeams.map(t => [t.id, t.abbreviation.toUpperCase()]));

  let losingSet: Set<string>;
  let inputTokens: string[] = [];

  if (autoFetch) {
    const { losers } = await getCompletedGameResults(pool.sport, week);
    if (losers.length === 0) {
      res.status(400).json({ error: "No completed games found on ESPN for this week yet. Try again later or submit results manually." });
      return;
    }
    losingSet = new Set(losers);
  } else {
    if (!losingTeamIds || !Array.isArray(losingTeamIds)) {
      res.status(400).json({ error: "losingTeamIds array is required when not using autoFetch" });
      return;
    }

    const resolvedIds: string[] = [];
    const unrecognized: string[] = [];

    for (const raw of losingTeamIds as string[]) {
      const upper = raw.trim().toUpperCase();
      if (abbrevToId.has(upper)) {
        resolvedIds.push(abbrevToId.get(upper)!);
      } else if (sportTeams.some(t => t.id === raw.trim())) {
        resolvedIds.push(raw.trim());
      } else {
        unrecognized.push(raw);
      }
    }

    inputTokens = losingTeamIds as string[];
    req.log.info({ inputTokens, resolvedIds, unrecognized, sport: pool.sport },
      "Processing week results — input normalization");

    losingSet = new Set(resolvedIds);
  }

  // Best-effort: fetch game margins from ESPN for SOV storage.
  // Works for both autoFetch and manual submission; margin stays null if ESPN
  // data is unavailable (e.g. pre-season test pools).
  let marginByTeamId = new Map<string, number>();
  try {
    marginByTeamId = await getGameMarginsByTeam(pool.sport, week);
  } catch {
    req.log.warn({ poolId, week }, "Could not fetch game margins from ESPN — marginOfVictory will be null for this week");
  }

  const weekPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));

  req.log.info(
    { losingTeamIds: [...losingSet].map(id => `${id}(${idToAbbrev.get(id) ?? "?"})`),
      picks: weekPicks.map(p => `userId=${p.userId} teamId=${p.teamId}(${idToAbbrev.get(p.teamId) ?? "?"}) teamName="${p.teamName}"`),
      week, poolId, poolType: pool.poolType },
    "Grading picks against losing set"
  );

  const eliminated: string[] = [];
  const survived: string[] = [];
  const pickDebug: {
    userId: number; teamId: string; teamName: string;
    abbreviation: string; result: string; marginOfVictory: number | null;
  }[] = [];

  for (const pick of weekPicks) {
    const result = losingSet.has(pick.teamId) ? "loss" : "win";
    const marginOfVictory = marginByTeamId.get(pick.teamId) ?? null;
    await db.update(picksTable).set({ result, marginOfVictory }).where(eq(picksTable.id, pick.id));

    pickDebug.push({
      userId: pick.userId,
      teamId: pick.teamId,
      teamName: pick.teamName,
      abbreviation: idToAbbrev.get(pick.teamId) ?? pick.teamId,
      result,
      marginOfVictory,
    });

    if (result === "loss") {
      eliminated.push(pick.userId.toString());
      if (pool.poolType !== "weekly") {
        await db.update(entriesTable)
          .set({ status: "eliminated", eliminatedWeek: week })
          .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, pick.userId)));
      }
    } else {
      survived.push(pick.userId.toString());
    }
  }

  const pickedUserIds = new Set(weekPicks.map(p => p.userId));
  const aliveEntries = await db.select().from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

  const forfeits: number[] = [];
  for (const entry of aliveEntries) {
    if (!pickedUserIds.has(entry.userId)) {
      if (pool.poolType !== "weekly") {
        await db.update(entriesTable)
          .set({ status: "eliminated", eliminatedWeek: week })
          .where(eq(entriesTable.id, entry.id));
      }
      eliminated.push(entry.userId.toString());
      forfeits.push(entry.userId);
    }
  }

  if (pool.poolType === "weekly") {
    const allEntries = await db.select().from(entriesTable)
      .where(eq(entriesTable.poolId, poolId));
    for (const entry of allEntries) {
      await db.update(entriesTable)
        .set({ status: "alive", eliminatedWeek: null })
        .where(eq(entriesTable.id, entry.id));
    }
    req.log.info({ poolId, week, poolType: "weekly" }, "Weekly pool — all entries reset to alive for next week");
  }

  await db.insert(weekResultsTable).values({
    poolId,
    week,
    losingTeamIds: [...losingSet],
    processedBy: req.user!.id,
  });

  // ── Winner detection (season / mid-season only) ───────────────────────────
  if (pool.poolType !== "weekly") {
    const [{ remaining }] = await db
      .select({ remaining: count() })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));

    const remainingCount = Number(remaining);

    if (remainingCount <= 1) {
      // 0 or 1 survivors — close the pool immediately (normal path)
      await db.update(poolsTable)
        .set({ isActive: false, endedAt: new Date() })
        .where(eq(poolsTable.id, poolId));
    } else if (pool.poolType === "season" && week === 18) {
      // Multiple survivors after the final regular-season week →
      // resolve via Strength of Victory (sum of signed margins across all picks).
      req.log.info(
        { poolId, week, remaining: remainingCount },
        "Season Week 18 ended with multiple survivors — resolving via SOV tiebreaker",
      );
      await resolveSOV(poolId);
      await db.update(poolsTable)
        .set({ isActive: false, endedAt: new Date() })
        .where(eq(poolsTable.id, poolId));
    }
    // remaining > 1 and week < 18 → pool stays open, season continues
  }

  res.json({
    week,
    eliminated,
    survived,
    processedAt: new Date().toISOString(),
    poolType: pool.poolType,
    debug: {
      inputEntered: inputTokens,
      resolvedLosingIds: [...losingSet].map(id => ({ id, abbreviation: idToAbbrev.get(id) ?? "?" })),
      picks: pickDebug,
      forfeits,
    },
  });
});

export default router;
