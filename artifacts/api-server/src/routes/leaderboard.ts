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

  const entries = await Promise.all(members.map(async (member) => {
    const userPicks = await db.select().from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.userId, member.userId)));

    const weeksAlive = member.status === "eliminated"
      ? (member.eliminatedWeek ?? 0)
      : pool.currentWeek;

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
      status: member.status === "alive" ? "active" : "eliminated",
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

  const active = entries
    .filter(e => e.status === "active")
    .sort((a, b) => {
      // When SOV was used, sort active players by sovTotal DESC
      if (a.sovTotal != null && b.sovTotal != null) return b.sovTotal - a.sovTotal;
      return b.weeksAlive - a.weeksAlive;
    })
    .map((e, i) => ({
      rank: i + 1,
      prizeWon: prizeStructure?.find(p => p.place === i + 1)?.amount ?? null,
      ...e,
    }));

  const eliminated = entries
    .filter(e => e.status === "eliminated")
    .sort((a, b) => (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0))
    .map((e, i) => ({ rank: active.length + i + 1, prizeWon: null as number | null, ...e }));

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
      const total = prizeStructure.reduce((sum, p) => sum + p.amount, 0);
      coWinnerPrizeEach = Math.floor(total / active.length);
    } else if (pool.prizePot && pool.prizePot > 0) {
      coWinnerPrizeEach = Math.floor(pool.prizePot / active.length);
    }
  }

  res.json({
    poolId,
    currentWeek: pool.currentWeek,
    doubleElimination: pool.doubleElimination,
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
