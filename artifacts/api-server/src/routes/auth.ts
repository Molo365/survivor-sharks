import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { signToken } from "../lib/jwt";

const router = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: "username, email, and password are required" });
    return;
  }
  if (username.length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const existing = await db.select().from(usersTable)
    .where(or(eq(usersTable.username, username), eq(usersTable.email, email)))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Username or email already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    username,
    email,
    passwordHash,
    displayName: displayName ?? null,
    role: "user",
  }).returning();

  const token = signToken({ sub: user.id, username: user.username, role: user.role });
  res.status(201).json({ token, user: formatUser(user) });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ sub: user.id, username: user.username, role: user.role });
  res.json({ token, user: formatUser(user) });
});

// POST /api/auth/logout  (client just discards token — no server state)
router.post("/logout", (_req, res) => {
  res.json({ success: true, message: "Logged out" });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json(formatUser(req.user!));
});

export default router;
