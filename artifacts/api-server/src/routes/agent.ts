import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import {
  db, usersTable, poolsTable, entriesTable,
  nflDivisionPredictorPicksTable, nflDivisionResultsTable,
  wcBracketPicksTable, pickemPicksTable,
} from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { scorePositions } from "../lib/closePredictorPool";

const router = Router();

function requireAgent(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "agent") {
    res.status(403).json({ error: "Agent access required" });
    return;
  }
  next();
}

router.use(requireAuth, requireAgent);

// GET /api/agent/players — list players belonging to the logged-in agent
router.get("/players", async (req, res) => {
  const players = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.agentId, req.user!.id))
    .orderBy(usersTable.createdAt);
  res.json(players.map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    createdAt: p.createdAt.toISOString(),
  })));
});

// PATCH /api/agent/players/:playerId/password — reset a player's password
router.patch("/players/:playerId/password", async (req, res) => {
  const playerId = parseInt(String(req.params.playerId));
  if (isNaN(playerId)) {
    res.status(400).json({ error: "Invalid player ID" });
    return;
  }
  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const [player] = await db
    .select({ id: usersTable.id, agentId: usersTable.agentId })
    .from(usersTable)
    .where(eq(usersTable.id, playerId))
    .limit(1);
  if (!player || player.agentId !== req.user!.id) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, playerId));
  res.json({ success: true });
});

// GET /api/agent/balances — per-player pool balance sheet for the logged-in agent
router.get("/balances", async (req, res) => {
  const agentId = req.user!.id;

  // 1. All players belonging to this agent
  const players = await db
    .select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.agentId, agentId))
    .orderBy(usersTable.createdAt);

  if (!players.length) {
    res.json([]);
    return;
  }

  const playerIds = players.map((p) => p.id);

  // 2. All entries for those players, joined with pool info
  const rows = await db
    .select({
      userId: entriesTable.userId,
      poolId: poolsTable.id,
      poolName: poolsTable.name,
      sport: poolsTable.sport,
      poolType: poolsTable.poolType,
      entryFee: poolsTable.entryFee,
      isActive: poolsTable.isActive,
      prizeStructure: poolsTable.prizeStructure,
      prizePot: poolsTable.prizePot,
      prizeMode: poolsTable.prizeMode,
      finalWinner: entriesTable.finalWinner,
    })
    .from(entriesTable)
    .innerJoin(poolsTable, eq(entriesTable.poolId, poolsTable.id))
    .where(inArray(entriesTable.userId, playerIds))
    .orderBy(poolsTable.name);

  const uniquePoolIds = [...new Set(rows.map((r) => r.poolId))];

  // 3. Member counts and co-winner counts per pool
  const [memberCountRows, coWinnerCountRows] = uniquePoolIds.length > 0
    ? await Promise.all([
        db.select({ poolId: entriesTable.poolId, cnt: sql<string>`COUNT(*)` })
          .from(entriesTable)
          .where(inArray(entriesTable.poolId, uniquePoolIds))
          .groupBy(entriesTable.poolId),
        db.select({ poolId: entriesTable.poolId, cnt: sql<string>`COUNT(*)` })
          .from(entriesTable)
          .where(and(inArray(entriesTable.poolId, uniquePoolIds), eq(entriesTable.finalWinner, true)))
          .groupBy(entriesTable.poolId),
      ])
    : [[], []];

  const memberCountMap = new Map(memberCountRows.map((r) => [r.poolId, Number(r.cnt)]));
  const coWinnerCountMap = new Map(coWinnerCountRows.map((r) => [r.poolId, Number(r.cnt)]));

  // 4. Rank-based prize lookup for closed predictor/scored pools.
  //    rankMap key: `${poolId}:${userId}` → 1-based rank
  const RANK_BASED_TYPES = new Set([
    "nfl_division_predictor", "wc_bracket", "pickem", "pickem_season",
    "nfl_confidence", "nfl_confidence_weekly", "crazy_8s",
  ]);

  const WC_ROUND_POINTS: Record<string, number> = {
    round_of_32: 10, round_of_16: 20, quarterfinals: 40, semifinals: 80, final: 160,
  };

  const rankMap = new Map<string, number>();

  const closedRows = rows.filter((r) => !r.isActive);

  function poolIdsOfType(...types: string[]): number[] {
    return [...new Set(closedRows.filter((r) => types.includes(r.poolType as string)).map((r) => r.poolId))];
  }

  const ndpPoolIds  = poolIdsOfType("nfl_division_predictor");
  const wcPoolIds   = poolIdsOfType("wc_bracket");
  const pkPoolIds   = poolIdsOfType("pickem", "pickem_season");
  const confPoolIds = poolIdsOfType("nfl_confidence", "nfl_confidence_weekly", "crazy_8s");

  const [ndpData, wcData, pkData, confData] = await Promise.all([
    // NDP: division results + all picks + all member entries per pool
    ndpPoolIds.length > 0
      ? Promise.all([
          db.select().from(nflDivisionResultsTable).where(inArray(nflDivisionResultsTable.poolId, ndpPoolIds)),
          db.select().from(nflDivisionPredictorPicksTable).where(inArray(nflDivisionPredictorPicksTable.poolId, ndpPoolIds)),
          db.select({ userId: entriesTable.userId, poolId: entriesTable.poolId })
            .from(entriesTable).where(inArray(entriesTable.poolId, ndpPoolIds)),
        ])
      : Promise.resolve(null),

    // WC Bracket: correct picks per userId/round per pool + all member entries
    wcPoolIds.length > 0
      ? Promise.all([
          db.select({
            poolId: wcBracketPicksTable.poolId,
            userId: wcBracketPicksTable.userId,
            round: wcBracketPicksTable.round,
            correct: sql<string>`COUNT(*)`,
          })
            .from(wcBracketPicksTable)
            .where(and(inArray(wcBracketPicksTable.poolId, wcPoolIds), eq(wcBracketPicksTable.isCorrect, true)))
            .groupBy(wcBracketPicksTable.poolId, wcBracketPicksTable.userId, wcBracketPicksTable.round),
          db.select({ userId: entriesTable.userId, poolId: entriesTable.poolId })
            .from(entriesTable).where(inArray(entriesTable.poolId, wcPoolIds)),
        ])
      : Promise.resolve(null),

    // Pickem / pickem_season: count correct picks per userId per pool + all member entries
    pkPoolIds.length > 0
      ? Promise.all([
          db.select({
            poolId: pickemPicksTable.poolId,
            userId: pickemPicksTable.userId,
            correct: sql<string>`COUNT(*)`,
          })
            .from(pickemPicksTable)
            .where(and(inArray(pickemPicksTable.poolId, pkPoolIds), eq(pickemPicksTable.result, "correct")))
            .groupBy(pickemPicksTable.poolId, pickemPicksTable.userId),
          db.select({ userId: entriesTable.userId, poolId: entriesTable.poolId })
            .from(entriesTable).where(inArray(entriesTable.poolId, pkPoolIds)),
        ])
      : Promise.resolve(null),

    // NFL Confidence: sum confidence_points for correct picks per userId per pool + all member entries
    confPoolIds.length > 0
      ? Promise.all([
          db.select({
            poolId: pickemPicksTable.poolId,
            userId: pickemPicksTable.userId,
            points: sql<string>`COALESCE(SUM(CASE WHEN ${pickemPicksTable.result} = 'correct' THEN COALESCE(${pickemPicksTable.confidencePoints}::integer, 0) ELSE 0 END), 0)`,
          })
            .from(pickemPicksTable)
            .where(inArray(pickemPicksTable.poolId, confPoolIds))
            .groupBy(pickemPicksTable.poolId, pickemPicksTable.userId),
          db.select({ userId: entriesTable.userId, poolId: entriesTable.poolId })
            .from(entriesTable).where(inArray(entriesTable.poolId, confPoolIds)),
        ])
      : Promise.resolve(null),
  ]);

  // Shared rank-assignment helper
  function assignRanks(poolId: number, scores: { userId: number; score: number }[]) {
    scores.sort((a, b) => b.score - a.score);
    let rank = 1;
    scores.forEach((s, i) => {
      if (i > 0 && s.score < scores[i - 1].score) rank = i + 1;
      rankMap.set(`${poolId}:${s.userId}`, rank);
    });
  }

  // NDP ranks
  if (ndpData) {
    const [allResults, allPicks, allEntries] = ndpData;
    for (const poolId of ndpPoolIds) {
      const results = allResults.filter((r) => r.poolId === poolId);
      if (results.length === 0) continue;
      const picks = allPicks.filter((p) => p.poolId === poolId);
      const entries = allEntries.filter((e) => e.poolId === poolId);
      const resultsByDiv = new Map(results.map((r) => [r.divisionName, r]));
      const picksByUser = new Map<number, Map<string, typeof picks[0]>>();
      for (const pick of picks) {
        if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, new Map());
        picksByUser.get(pick.userId)!.set(pick.divisionName, pick);
      }
      assignRanks(poolId, entries.map(({ userId }) => {
        let totalScore = 0;
        const userPicks = picksByUser.get(userId);
        for (const [divName, actual] of resultsByDiv) {
          const pick = userPicks?.get(divName);
          if (!pick) continue;
          totalScore += scorePositions(
            [actual.pos1Team, actual.pos2Team, actual.pos3Team, actual.pos4Team],
            [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team],
          );
        }
        return { userId, score: totalScore };
      }));
    }
  }

  // WC Bracket ranks
  if (wcData) {
    const [correctByRound, wcEntries] = wcData;
    for (const poolId of wcPoolIds) {
      const entries = wcEntries.filter((e) => e.poolId === poolId);
      const pointsMap = new Map<number, number>();
      for (const row of correctByRound.filter((r) => r.poolId === poolId)) {
        const earned = (WC_ROUND_POINTS[row.round] ?? 0) * Number(row.correct);
        pointsMap.set(row.userId, (pointsMap.get(row.userId) ?? 0) + earned);
      }
      assignRanks(poolId, entries.map((e) => ({ userId: e.userId, score: pointsMap.get(e.userId) ?? 0 })));
    }
  }

  // Pickem ranks
  if (pkData) {
    const [correctRows, pkEntries] = pkData;
    for (const poolId of pkPoolIds) {
      const correctMap = new Map(
        correctRows.filter((r) => r.poolId === poolId).map((r) => [r.userId, Number(r.correct)]),
      );
      assignRanks(poolId, pkEntries.filter((e) => e.poolId === poolId)
        .map((e) => ({ userId: e.userId, score: correctMap.get(e.userId) ?? 0 })));
    }
  }

  // NFL Confidence ranks
  if (confData) {
    const [pointsRows, confEntries] = confData;
    for (const poolId of confPoolIds) {
      const pointsMap = new Map(
        pointsRows.filter((r) => r.poolId === poolId).map((r) => [r.userId, Number(r.points)]),
      );
      assignRanks(poolId, confEntries.filter((e) => e.poolId === poolId)
        .map((e) => ({ userId: e.userId, score: pointsMap.get(e.userId) ?? 0 })));
    }
  }

  // 5. Build per-player balance objects
  const result = players.map((player) => {
    const pools = rows
      .filter((r) => r.userId === player.id)
      .map((r) => {
        const poolType = r.poolType as string;
        const ps = r.prizeStructure as Array<{ place: number; amount: number }> | null;
        const entryFee = r.entryFee ?? 0;
        const memberCount = memberCountMap.get(r.poolId) ?? 0;

        // Build prize-by-place map from prizeStructure (or fallback to prizePot)
        const prizeByPlace = new Map<number, number>();
        if (ps && ps.length > 0) {
          for (const p of ps) {
            const amount = r.prizeMode === "pct" && entryFee > 0 && memberCount > 0
              ? Math.floor((p.amount / 100) * entryFee * memberCount / 5) * 5
              : p.amount;
            if (amount > 0) prizeByPlace.set(p.place, amount);
          }
        } else if (r.prizePot && r.prizePot > 0) {
          prizeByPlace.set(1, Math.floor(r.prizePot));
        }

        let prizeWon = 0;

        if (RANK_BASED_TYPES.has(poolType) && !r.isActive) {
          // Scored/predictor pool: use computed rank
          const rank = rankMap.get(`${r.poolId}:${r.userId}`);
          if (rank !== undefined) {
            prizeWon = prizeByPlace.get(rank) ?? 0;
            // Co-winner split only applies to 1st place
            if (rank === 1) {
              const coWinnerCount = coWinnerCountMap.get(r.poolId) ?? 1;
              if (coWinnerCount > 1 && prizeByPlace.has(1)) {
                prizeWon = Math.floor(prizeByPlace.get(1)! / coWinnerCount);
              }
            }
          }
        } else if (r.finalWinner) {
          // Survivor / other pool types: 1st place via finalWinner flag
          const firstPrize = prizeByPlace.get(1) ?? 0;
          const coWinnerCount = coWinnerCountMap.get(r.poolId) ?? 1;
          prizeWon = coWinnerCount > 1 ? Math.floor(firstPrize / coWinnerCount) : firstPrize;
        }

        return {
          poolId: r.poolId,
          poolName: r.poolName,
          sport: r.sport,
          entryFee,
          isActive: r.isActive,
          prizeWon,
          settled: false,
        };
      });

    const totalOwed = pools.reduce((s, p) => s + p.entryFee, 0);
    const totalWon  = pools.reduce((s, p) => s + p.prizeWon, 0);

    return {
      id: player.id,
      username: player.username,
      displayName: player.displayName,
      pools,
      totalOwed,
      totalWon,
      netBalance: totalOwed - totalWon,
    };
  });

  res.json(result);
});

export default router;
