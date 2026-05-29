import { Router } from "express";
import { db } from "@workspace/db";
import { weekResultsTable, picksTable, entriesTable, poolsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCompletedGameResults } from "../lib/espn";
import { ESPN_TEAMS, type Sport } from "../lib/teams-data";

const router = Router({ mergeParams: true });

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

  // Build abbreviation → teamId lookup for this sport so the commissioner can
  // enter abbreviations (BAL, NYY) OR numeric IDs — both work.
  const sportTeams = ESPN_TEAMS[pool.sport as Sport] ?? [];
  const abbrevToId = new Map(sportTeams.map(t => [t.abbreviation.toUpperCase(), t.id]));
  const idToAbbrev = new Map(sportTeams.map(t => [t.id, t.abbreviation.toUpperCase()]));

  // Resolve losing teams — either from ESPN or from the request body
  let losingSet: Set<string>; // always contains numeric teamIds
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

    // Normalize each entry: abbreviation → numeric ID, or keep as-is if already an ID
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

  // Grade all picks for this week
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
  const pickDebug: { userId: number; teamId: string; teamName: string; abbreviation: string; result: string }[] = [];

  for (const pick of weekPicks) {
    const result = losingSet.has(pick.teamId) ? "loss" : "win";
    await db.update(picksTable).set({ result }).where(eq(picksTable.id, pick.id));

    pickDebug.push({
      userId: pick.userId,
      teamId: pick.teamId,
      teamName: pick.teamName,
      abbreviation: idToAbbrev.get(pick.teamId) ?? pick.teamId,
      result,
    });

    if (result === "loss") {
      eliminated.push(pick.userId.toString());
      // For weekly pools eliminations don't carry over — we'll restore below
      if (pool.poolType !== "weekly") {
        await db.update(entriesTable)
          .set({ status: "eliminated", eliminatedWeek: week })
          .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.userId, pick.userId)));
      }
    } else {
      survived.push(pick.userId.toString());
    }
  }

  // Eliminate alive members who submitted no pick this week (forfeit)
  // Weekly pools: only mark for the current grading, won't carry forward
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

  // For weekly pools: reset everyone back to "alive" for next week
  // The weekly format has no carry-over — it's a fresh contest each week.
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

  // Record result
  await db.insert(weekResultsTable).values({
    poolId,
    week,
    losingTeamIds: [...losingSet],
    processedBy: req.user!.id,
  });

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
