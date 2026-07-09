import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, poolsTable, entriesTable } from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

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

  // 3. Member counts and co-winner counts per pool (needed for prize computation)
  const uniquePoolIds = [...new Set(rows.map((r) => r.poolId))];
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

  // 4. Build per-player balance objects
  const result = players.map((player) => {
    const pools = rows
      .filter((r) => r.userId === player.id)
      .map((r) => {
        let prizeWon = 0;
        if (r.finalWinner) {
          const ps = r.prizeStructure as Array<{ place: number; amount: number }> | null;
          const entryFee = r.entryFee ?? 0;
          const memberCount = memberCountMap.get(r.poolId) ?? 0;
          const coWinnerCount = coWinnerCountMap.get(r.poolId) ?? 1;

          let firstPrize = 0;
          if (ps && ps.length > 0) {
            const first = ps.find((p) => p.place === 1);
            if (first) {
              if (r.prizeMode === "pct") {
                if (entryFee > 0 && memberCount > 0) {
                  firstPrize = Math.floor((first.amount / 100) * entryFee * memberCount / 5) * 5;
                }
              } else {
                firstPrize = first.amount;
              }
            }
          } else if (r.prizePot && r.prizePot > 0) {
            firstPrize = Math.floor(r.prizePot);
          }

          prizeWon = coWinnerCount > 1 ? Math.floor(firstPrize / coWinnerCount) : firstPrize;
        }

        return {
          poolId: r.poolId,
          poolName: r.poolName,
          sport: r.sport,
          entryFee: r.entryFee ?? 0,
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
