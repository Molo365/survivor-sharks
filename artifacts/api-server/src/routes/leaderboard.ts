import { Router } from "express";
import { db } from "@workspace/db";
import { entriesTable, poolsTable, picksTable, usersTable, weekResultsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getMlbWeekBounds } from "../lib/espn";

const router = Router({ mergeParams: true });

// GET /api/pools/:poolId/leaderboard
router.get("/", requireAuth, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId));

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [members, weekResultRows] = await Promise.all([
    db.select({
      userId: entriesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      status: entriesTable.status,
      eliminatedWeek: entriesTable.eliminatedWeek,
      strikeCount: entriesTable.strikeCount,
      streak: entriesTable.streak,
      sovTotal: entriesTable.sovTotal,
      finalWinner: entriesTable.finalWinner,
      joinedAt: entriesTable.joinedAt,
    }).from(entriesTable)
      .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
      .where(eq(entriesTable.poolId, poolId)),

    db.select({ week: weekResultsTable.week, isVoided: weekResultsTable.isVoided })
      .from(weekResultsTable)
      .where(eq(weekResultsTable.poolId, poolId)),
  ]);

  const voidedWeeks = weekResultRows
    .filter(r => r.isVoided)
    .map(r => r.week)
    .sort((a, b) => a - b);

  // MLB: compute deadline info for this week
  let deadlinePassed = false;
  if (pool.sport === "mlb") {
    const bounds = getMlbWeekBounds(pool.createdAt, pool.currentWeek);
    deadlinePassed = bounds.deadlinePassed;
  }

  const prizeStructure = (pool.prizeStructure as Array<{ place: number; amount: number }> | null) ?? null;
  const memberCount = members.length;

  const entries = await Promise.all(members.map(async (member) => {
    const userPicks = await db.select().from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, member.userId)));

    // For ended pools, use finalWinner flag instead of live status so the
    // auto-eliminator cannot retroactively flip winners to "eliminated".
    const isWinner = !pool.isActive && member.finalWinner;
    const isAliveInDisplay = isWinner || (pool.isActive && member.status === "alive");

    const weeksAlive = isAliveInDisplay
      ? pool.currentWeek
      : (member.eliminatedWeek ?? 0);

    const sortedPicks = userPicks.sort((a, b) => b.week - a.week);
    const lastPick = sortedPicks[0];

    const currentWeekPick = userPicks.find(p => p.week === pool.currentWeek);
    const hasWonThisWeek = currentWeekPick?.result === "win";

    // SOV breakdown: week-by-week margin for display when SOV resolved a tie
    const sovBreakdown = userPicks
      .filter(p => p.marginOfVictory != null)
      .sort((a, b) => a.week - b.week)
      .map(p => ({
        week: p.week,
        teamName: p.teamName,
        marginOfVictory: p.marginOfVictory!,
      }));

    return {
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      status: isAliveInDisplay ? "active" : "eliminated",
      weeksAlive,
      eliminatedWeek: member.eliminatedWeek,
      lastPickTeam: lastPick?.teamName ?? null,
      lastPickResult: lastPick?.result ?? null,
      streak: member.streak,
      strikeCount: member.strikeCount,
      hasWonThisWeek,
      sovTotal: member.sovTotal ?? null,
      sovBreakdown,
    };
  }));

  const sortedActive = entries
    .filter(e => e.status === "active")
    .sort((a, b) => {
      // When SOV was used, sort active players by sovTotal DESC
      if (a.sovTotal != null && b.sovTotal != null) return b.sovTotal - a.sovTotal;
      return b.weeksAlive - a.weeksAlive;
    });
  const scoredActive = sortedActive.map(e => ({ ...e, score: e.sovTotal ?? e.weeksAlive }));

  const active = scoredActive.map((entry, i) => ({
    rank: scoredActive.filter(x => x.score > entry.score).length + 1,
    // Only surface prize amounts once the pool has actually resolved.
    // While the pool is active, rank positions are interim — assigning prize
    // values would show dollar badges to players who haven't won anything yet.
    prizeWon: !pool.isActive
      ? (() => {
          const tier = prizeStructure?.find(p => p.place === i + 1);
          if (!tier) return null;
          if (pool.prizeMode === "pct") {
            if (!pool.entryFee || pool.entryFee <= 0 || memberCount <= 0) return null;
            return Math.floor((tier.amount / 100) * pool.entryFee * memberCount / 5) * 5;
          }
          return tier.amount;
        })()
      : null,
    ...entry,
  }));

  const sortedEliminated = entries
    .filter(e => e.status === "eliminated")
    .sort((a, b) => (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0));
  const eliminated = sortedEliminated.map((e) => ({
    rank: active.length + sortedEliminated.filter(x => (x.eliminatedWeek ?? 0) > (e.eliminatedWeek ?? 0)).length + 1,
    prizeWon: null as number | null,
    ...e,
  }));

  // ── NHL Survivor Season: re-rank eliminated players with SOV tiebreaker and assign prize tiers ──
  // Scoped strictly to pool.sport === "nhl" && pool.poolType === "season".
  // results.ts, picks.ts, and the active-winner prize assignment above are untouched.
  if (!pool.isActive && pool.sport === "nhl" && pool.poolType === "season") {
    // 1. Re-sort: eliminatedWeek DESC primary, sovTotal DESC secondary
    eliminated.sort((a, b) => {
      const weekDiff = (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0);
      if (weekDiff !== 0) return weekDiff;
      return (b.sovTotal ?? 0) - (a.sovTotal ?? 0);
    });
    // 2. Re-number ranks to reflect the new order
    eliminated.forEach((e, i) => { e.rank = active.length + i + 1; });

    // 3. Walk in tied groups and assign remaining prize tiers
    if (prizeStructure && prizeStructure.length > 0) {
      let pos = 0;
      while (pos < eliminated.length) {
        const thisWeek = eliminated[pos].eliminatedWeek;
        const thisSov  = eliminated[pos].sovTotal; // null === null is true in JS

        // Extend group while both eliminatedWeek AND sovTotal match (genuine tie)
        let end = pos + 1;
        while (
          end < eliminated.length &&
          eliminated[end].eliminatedWeek === thisWeek &&
          eliminated[end].sovTotal        === thisSov
        ) { end++; }

        const groupSize  = end - pos;
        const placeIndex = active.length + pos; // 0-based index into prizeStructure
        const tiers      = prizeStructure.slice(placeIndex, placeIndex + groupSize);

        if (tiers.length > 0) {
          let shareEach: number;
          if (pool.prizeMode === "pct" && pool.entryFee && pool.entryFee > 0 && memberCount > 0) {
            const pctAmounts = tiers.map((t) =>
              Math.floor((t.amount / 100) * pool.entryFee! * memberCount / 5) * 5,
            );
            const total = pctAmounts.reduce((s, a) => s + a, 0);
            shareEach = total > 0 ? Math.floor(total / groupSize) : 0;
          } else {
            const total = tiers.reduce((s, t) => s + t.amount, 0);
            shareEach = total > 0 ? Math.floor(total / groupSize) : 0;
          }
          if (shareEach > 0) {
            for (let g = pos; g < end; g++) eliminated[g].prizeWon = shareEach;
          }
        }

        pos = end;
      }
    }
  }

  // ── Derived flags ─────────────────────────────────────────────────────────
  // sovTiebreaker: SOV was used to break a Week 18 multi-survivor tie
  const sovTiebreaker =
    !pool.isActive &&
    (pool.closureReason === "sov_tiebreaker" || (!pool.closureReason && active.some(e => e.sovTotal != null)));

  // coWinners: all alive Week-18 players lost → declared co-champions
  const coWinners = !pool.isActive && pool.closureReason === "co_winners";

  // coWinnerPrizeEach: equal prize share per co-winner
  let coWinnerPrizeEach: number | null = null;
  if (coWinners && active.length > 0) {
    if (prizeStructure && prizeStructure.length > 0) {
      if (pool.prizeMode === "pct" && pool.entryFee && pool.entryFee > 0 && memberCount > 0) {
        const pctAmounts = prizeStructure.map((p) =>
          Math.floor((p.amount / 100) * pool.entryFee! * memberCount / 5) * 5,
        );
        const total = pctAmounts.reduce((s, a) => s + a, 0);
        coWinnerPrizeEach = Math.floor(total / active.length);
      } else {
        const total = prizeStructure.reduce((sum, p) => sum + p.amount, 0);
        coWinnerPrizeEach = Math.floor(total / active.length);
      }
    } else if (pool.prizePot && pool.prizePot > 0) {
      coWinnerPrizeEach = Math.floor(pool.prizePot / active.length);
    }
  }

  // Override rank-based prizeWon with the actual split amount for co-champion pools.
  // prizeWon is already null for active pools, so this only runs on ended pools.
  if (coWinners && coWinnerPrizeEach !== null) {
    for (const entry of active) {
      entry.prizeWon = coWinnerPrizeEach;
    }
  }

  const maxLives = (pool.sport === "nhl" && pool.poolType === "season")
    ? 3
    : pool.doubleElimination ? 2 : 1;

  res.json({
    poolId,
    currentWeek: pool.currentWeek,
    doubleElimination: pool.doubleElimination,
    maxLives,
    pickFrequency: pool.pickFrequency,
    deadlinePassed,
    prizeStructure,
    sovTiebreaker,
    coWinners,
    coWinnerPrizeEach,
    voidedWeeks,
    active,
    eliminated,
  });
});

export default router;
