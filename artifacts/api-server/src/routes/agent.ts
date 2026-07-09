import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export default router;
