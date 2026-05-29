import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, pool as pgPool } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { signToken } from "../lib/jwt";
import { sendPasswordResetEmail } from "../lib/mailer";

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

  const [takenUsername] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (takenUsername) {
    res.status(409).json({ error: `Username "${username}" is already taken. Please choose a different one.` });
    return;
  }

  const [takenEmail] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (takenEmail) {
    res.status(409).json({ error: "An account with that email address already exists. Try logging in instead." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    username,
    email: email.toLowerCase(),
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

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

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

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.json({ success: true, message: "Logged out" });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json(formatUser(req.user!));
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  // Always return 200 to avoid email enumeration
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing tokens for this user
    await pgPool.query("UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [user.id]);

    // Insert new token
    await pgPool.query(
      "INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.id, token, expiresAt],
    );

    const appBase = process.env.APP_URL ?? (req.headers.origin as string | undefined) ?? "http://localhost:3000";
    const resetUrl = `${appBase}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }

  res.json({ success: true, message: "If that email is registered, a reset link has been sent." });
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    res.status(400).json({ error: "token and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const { rows } = await pgPool.query<{ id: number; user_id: number; expires_at: Date; used_at: Date | null }>(
    "SELECT * FROM password_resets WHERE token = $1 LIMIT 1",
    [token],
  );

  const reset = rows[0];
  if (!reset || reset.used_at !== null || reset.expires_at < new Date()) {
    res.status(400).json({ error: "Reset link is invalid or has expired." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, reset.user_id));
  await pgPool.query("UPDATE password_resets SET used_at = NOW() WHERE id = $1", [reset.id]);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, reset.user_id)).limit(1);
  const jwtToken = signToken({ sub: user.id, username: user.username, role: user.role });

  res.json({ token: jwtToken, user: formatUser(user) });
});

export default router;
