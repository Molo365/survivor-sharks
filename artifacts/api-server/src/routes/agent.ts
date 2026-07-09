import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, poolsTable, entriesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
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
    })
    .from(entriesTable)
    .innerJoin(poolsTable, eq(entriesTable.poolId, poolsTable.id))
    .where(inArray(entriesTable.userId, playerIds))
    .orderBy(poolsTable.name);

  // 3. Build per-player balance objects
  const result = players.map((player) => {
    const pools = rows
      .filter((r) => r.userId === player.id)
      .map((r) => ({
        poolId: r.poolId,
        poolName: r.poolName,
        sport: r.sport,
        entryFee: r.entryFee ?? 0,
        isActive: r.isActive,
        prizeWon: 0,   // not settled yet
        settled: false,
      }));

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
