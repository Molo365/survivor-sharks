import { Router } from "express";
import { db } from "@workspace/db";
import { weekResultsTable, picksTable, entriesTable, poolsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCompletedGameResults, getGameMarginsByTeam } from "../lib/espn";
import { ESPN_TEAMS, type Sport } from "../lib/teams-data";

const router = Router({ mergeParams: true });

// ── SOV helper ────────────────────────────────────────────────────────────────
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
    await db.update(entriesTable)
      .set({ sovTotal: sovByUser.get(entry.userId) ?? 0 })
      .where(eq(entriesTable.id, entry.id));
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
    isVoided: r.isVoided,
    processedAt: r.processedAt.toISOString(),
    processedBy: r.processedBy,
  })));
});

// POST /api/pools/:poolId/results
// Commissioner submits week results. Pass { week, autoFetch: true } to auto-fetch
// from ESPN, or { week, losingTeamIds: string[] } to submit manually.
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

  // ── Min-entries auto-cancel (week 1 only) ────────────────────────────────
  // If the pool requires a minimum number of entries and week 1 is being
  // processed for the first time, cancel instead of running results.
  if (week === 1 && pool.currentWeek === 1 && pool.minEntries != null) {
    const [{ actualCount }] = await db
      .select({ actualCount: count() })
      .from(entriesTable)
      .where(eq(entriesTable.poolId, poolId));
    const actualEntries = Number(actualCount);
    if (actualEntries < pool.minEntries) {
      await db.update(poolsTable)
        .set({ isActive: false, endedAt: new Date(), closureReason: "min_entries_not_met" })
        .where(eq(poolsTable.id, poolId));
      req.log.info({ poolId, actualEntries, minEntries: pool.minEntries }, "Pool cancelled — min entries not met");
      res.status(409).json({
        error: `Pool cancelled — only ${actualEntries} of the required ${pool.minEntries} minimum entries joined.`,
        cancelled: true,
        actualEntries,
        minEntries: pool.minEntries,
      });
      return;
    }
  }

  const sportTeams = ESPN_TEAMS[pool.sport as Sport] ?? [];
  const abbrevToId = new Map(sportTeams.map(t => [t.abbreviation.toUpperCase(), t.id]));
  const idToAbbrev = new Map(sportTeams.map(t => [t.id, t.abbreviation.toUpperCase()]));

  let losingSet: Set<string>;
  let inputTokens: string[] = [];

  if (autoFetch) {
    const { losers } = await getCompletedGameResults(pool.sport, week, pool.createdAt);
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
    req.log.info({ inputTokens, resolvedIds, unrecognized, sport: pool.sport }, "Processing week results — input normalization");
    losingSet = new Set(resolvedIds);
  }

  // Best-effort ESPN margins for SOV storage
  let marginByTeamId = new Map<string, number>();
  try {
    marginByTeamId = await getGameMarginsByTeam(pool.sport, week, pool.createdAt);
  } catch {
    req.log.warn({ poolId, week }, "Could not fetch game margins from ESPN — marginOfVictory will be null for this week");
  }

  // ── Phase 1: snapshot alive entries BEFORE grading ────────────────────────
  // Required so the void/co-winner check can compare who was alive at week start.
  const aliveAtStart = await db
    .select({ id: entriesTable.id, userId: entriesTable.userId })
    .from(entriesTable)
    .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
  const aliveUserIds = new Set(aliveAtStart.map(e => e.userId));

  // ── Phase 2: grade all picks (result + margin — NO entry status changes yet) ──
  const weekPicks = await db.select().from(picksTable)
    .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));

  req.log.info(
    { losingTeamIds: [...losingSet].map(id => `${id}(${idToAbbrev.get(id) ?? "?"})`),
      picks: weekPicks.map(p => `userId=${p.userId} teamId=${p.teamId}(${idToAbbrev.get(p.teamId) ?? "?"}) teamName="${p.teamName}"`),
      week, poolId, poolType: pool.poolType },
    "Grading picks against losing set",
  );

  const pickedUserIds = new Set<number>();
  const resultByPickId = new Map<number, "win" | "loss">();
  const pickDebug: { userId: number; teamId: string; teamName: string; abbreviation: string; result: string; marginOfVictory: number | null }[] = [];

  for (const pick of weekPicks) {
    const result: "win" | "loss" = losingSet.has(pick.teamId) ? "loss" : "win";
    const marginOfVictory = marginByTeamId.get(pick.teamId) ?? null;
    await db.update(picksTable).set({ result, marginOfVictory }).where(eq(picksTable.id, pick.id));
    resultByPickId.set(pick.id, result);
    pickedUserIds.add(pick.userId);
    pickDebug.push({
      userId: pick.userId, teamId: pick.teamId, teamName: pick.teamName,
      abbreviation: idToAbbrev.get(pick.teamId) ?? pick.teamId, result, marginOfVictory,
    });
  }

  // ── Phase 3: identify losers + forfeits among alive-at-start players ──────
  const losersThisWeek = new Set<number>(); // userId
  const forfeits: number[] = [];

  for (const pick of weekPicks) {
    if (aliveUserIds.has(pick.userId) && resultByPickId.get(pick.id) === "loss") {
      losersThisWeek.add(pick.userId);
    }
  }
  for (const entry of aliveAtStart) {
    if (!pickedUserIds.has(entry.userId)) {
      losersThisWeek.add(entry.userId);
      forfeits.push(entry.userId);
    }
  }

  // ── Phase 4: void / co-winner check (Classic Season pools only) ───────────
  // Void:       week < 18 and every alive player at week-start lost/forfeited.
  // Co-winners: week === 18 and every alive player at week-start lost/forfeited.
  const allAliveAtStartLost =
    aliveAtStart.length > 0 && losersThisWeek.size === aliveAtStart.length;
  let voidFired = false;
  let coWinnersTriggered = false;
  let coWinnerPrize: number | null = null;

  if (pool.poolType === "season" && allAliveAtStartLost) {
    if (week < 18) {
      voidFired = true;
      req.log.info(
        { poolId, week, aliveCount: aliveAtStart.length },
        "Season wipeout void — all alive players lost this week, voiding eliminations",
      );
    } else {
      coWinnersTriggered = true;
      const ps = pool.prizeStructure as Array<{ place: number; amount: number }> | null;
      if (ps && ps.length > 0) {
        coWinnerPrize = Math.floor(ps.reduce((sum, p) => sum + p.amount, 0) / aliveAtStart.length);
      } else if (pool.prizePot && pool.prizePot > 0) {
        coWinnerPrize = Math.floor(pool.prizePot / aliveAtStart.length);
      }
      req.log.info(
        { poolId, week, aliveCount: aliveAtStart.length, prizeEach: coWinnerPrize },
        "Season Week 18 co-winner — all alive players lost, declaring co-champions",
      );
    }
  }

  // ── Phase 5: conditionally apply eliminations ─────────────────────────────
  // Void and co-winner scenarios: picks stay as "loss" (team is used), but
  // entry status stays "alive" — nobody is eliminated this week.
  const eliminated: string[] = [];
  const survived: string[] = [];

  if (!voidFired && !coWinnersTriggered) {
    for (const pick of weekPicks) {
      const result = resultByPickId.get(pick.id)!;
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
    // Forfeit eliminations
    if (pool.poolType !== "weekly") {
      for (const userId of forfeits) {
        const entry = aliveAtStart.find(e => e.userId === userId);
        if (entry) {
          await db.update(entriesTable)
            .set({ status: "eliminated", eliminatedWeek: week })
            .where(eq(entriesTable.id, entry.id));
        }
        eliminated.push(userId.toString());
      }
    }
  }

  // ── Phase 6: weekly pool reset ────────────────────────────────────────────
  if (pool.poolType === "weekly") {
    const allEntries = await db.select().from(entriesTable).where(eq(entriesTable.poolId, poolId));
    for (const entry of allEntries) {
      await db.update(entriesTable).set({ status: "alive", eliminatedWeek: null }).where(eq(entriesTable.id, entry.id));
    }
    req.log.info({ poolId, week, poolType: "weekly" }, "Weekly pool — all entries reset to alive for next week");
  }

  // ── Phase 7: insert week_results (isVoided reflects the void decision) ────
  await db.insert(weekResultsTable).values({
    poolId,
    week,
    losingTeamIds: [...losingSet],
    isVoided: voidFired,
    processedBy: req.user!.id,
  });

  // ── Phase 8: pool closure logic ───────────────────────────────────────────
  if (!voidFired && pool.poolType !== "weekly") {
    if (coWinnersTriggered) {
      // All alive players lost Week 18 → co-champions, pool closes
      // Mark all alive entries as final winners before closing
      await db.update(entriesTable)
        .set({ finalWinner: true })
        .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
      await db.update(poolsTable)
        .set({ isActive: false, endedAt: new Date(), closureReason: "co_winners" })
        .where(eq(poolsTable.id, poolId));
    } else {
      const [{ remaining }] = await db
        .select({ remaining: count() })
        .from(entriesTable)
        .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
      const remainingCount = Number(remaining);

      if (remainingCount <= 1) {
        // 0 or 1 survivors → close immediately (normal path)
        // Mark survivor(s) as final winner(s) before closing
        await db.update(entriesTable)
          .set({ finalWinner: true })
          .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
        await db.update(poolsTable)
          .set({ isActive: false, endedAt: new Date() })
          .where(eq(poolsTable.id, poolId));
      } else if (pool.poolType === "season" && week === 18) {
        // Multiple survivors after Week 18 → resolve via SOV tiebreaker
        req.log.info(
          { poolId, week, remaining: remainingCount },
          "Season Week 18 ended with multiple survivors — resolving via SOV tiebreaker",
        );
        // Mark all Week-18 survivors as final winners, then resolve SOV for ranking
        await db.update(entriesTable)
          .set({ finalWinner: true })
          .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
        await resolveSOV(poolId);
        await db.update(poolsTable)
          .set({ isActive: false, endedAt: new Date(), closureReason: "sov_tiebreaker" })
          .where(eq(poolsTable.id, poolId));
      }
      // remaining > 1 and week < 18 → pool stays open, season continues
    }
  }

  res.json({
    week,
    eliminated,
    survived,
    processedAt: new Date().toISOString(),
    poolType: pool.poolType,
    voidFired,
    coWinners: coWinnersTriggered,
    coWinnerPrize,
    debug: {
      inputEntered: inputTokens,
      resolvedLosingIds: [...losingSet].map(id => ({ id, abbreviation: idToAbbrev.get(id) ?? "?" })),
      picks: pickDebug,
      forfeits,
    },
  });
});

export default router;
