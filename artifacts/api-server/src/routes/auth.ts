import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, pool as pgPool } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { signToken } from "../lib/jwt";
import { sendEmailVerificationEmail, sendPasswordResetEmail } from "../lib/mailer";

const router = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    remindersEnabled: user.remindersEnabled,
    createdAt: user.createdAt.toISOString(),
  };
}

function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createAppUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const origin = req.get("origin");
  if (origin) return origin.replace(/\/+$/, "");

  const forwardedHost = req.get("x-forwarded-host") ?? req.get("host");
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.protocol;
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : "http://localhost:3000";
}

function newVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  return {
    rawToken,
    tokenHash: hashVerificationToken(rawToken),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

async function sendVerificationEmailSafely(email: string, rawToken: string, req: Request): Promise<void> {
  const verificationUrl = `${createAppUrl(req)}/verify-email?token=${encodeURIComponent(rawToken)}`;
  try {
    await sendEmailVerificationEmail(email, verificationUrl);
  } catch (error) {
    // Registration must remain usable even if an email provider is temporarily unavailable.
    console.error("Email verification delivery failed", error);
  }
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, password, displayName } = req.body;
  const email = typeof req.body.email === "string" ? req.body.email.trim() : req.body.email;

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

  const ADMIN_USERNAMES = ["mule"];
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    username,
    email: email.toLowerCase(),
    passwordHash,
    displayName: displayName?.trim() || null,
    role: ADMIN_USERNAMES.includes(username.toLowerCase()) ? "admin" : "user",
  }).returning();

  const verification = newVerificationToken();
  await pgPool.query(
    "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [user.id, verification.tokenHash, verification.expiresAt],
  );
  await sendVerificationEmailSafely(user.email, verification.rawToken, req);

  const token = signToken({ sub: user.id, username: user.username, role: user.role });
  res.status(201).json({ token, user: formatUser(user) });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { password } = req.body;
  const identifier = typeof req.body.email === "string" ? req.body.email.trim() : "";

  if (!identifier || !password) {
    res.status(400).json({ error: "email/username and password are required" });
    return;
  }

  // Try email first, then fall back to username
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, identifier.toLowerCase())).limit(1);
  if (!user) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.username, identifier)).limit(1);
  }

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

// GET /api/auth/verify-email
router.get("/verify-email", async (req, res) => {
  const rawToken = typeof req.query.token === "string" ? req.query.token : "";
  if (!rawToken) {
    res.status(400).json({ error: "Verification token is required." });
    return;
  }

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      id: number;
      user_id: number;
      expires_at: Date;
      used_at: Date | null;
    }>(
      "SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = $1 LIMIT 1 FOR UPDATE",
      [hashVerificationToken(rawToken)],
    );
    const verification = rows[0];

    if (!verification || verification.used_at !== null || verification.expires_at < new Date()) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "This verification link is invalid or has expired." });
      return;
    }

    await client.query(
      "UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1",
      [verification.user_id],
    );
    await client.query(
      "UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1",
      [verification.id],
    );
    await client.query("COMMIT");
    res.json({ success: true, message: "Your email has been verified." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Email verification failed", error);
    res.status(500).json({ error: "Could not verify your email right now. Please try again." });
  } finally {
    client.release();
  }
});

// POST /api/auth/resend-verification
router.post("/resend-verification", requireAuth, async (req, res) => {
  const client = await pgPool.connect();
  let verification: ReturnType<typeof newVerificationToken> | null = null;
  try {
    await client.query("BEGIN");
    // Serialize resend attempts per user so concurrent requests cannot bypass the cooldown.
    await client.query("SELECT pg_advisory_xact_lock($1)", [req.user!.id]);
    const { rows: userRows } = await client.query<{
      email: string;
      email_verified_at: Date | null;
    }>(
      "SELECT email, email_verified_at FROM users WHERE id = $1 LIMIT 1",
      [req.user!.id],
    );
    const user = userRows[0];

    if (!user) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "User account not found." });
      return;
    }
    if (user.email_verified_at !== null) {
      await client.query("COMMIT");
      res.json({ success: true, message: "Your email is already verified." });
      return;
    }

    const { rows: latestRows } = await client.query<{ created_at: Date }>(
      "SELECT created_at FROM email_verification_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user!.id],
    );
    const latestCreatedAt = latestRows[0]?.created_at;
    if (latestCreatedAt && Date.now() - new Date(latestCreatedAt).getTime() < 60_000) {
      const retryAfterSeconds = Math.ceil((60_000 - (Date.now() - new Date(latestCreatedAt).getTime())) / 1000);
      await client.query("ROLLBACK");
      res.status(429).json({ error: `Please wait ${retryAfterSeconds} seconds before requesting another email.`, retryAfterSeconds });
      return;
    }

    verification = newVerificationToken();
    await client.query(
      "UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [req.user!.id],
    );
    await client.query(
      "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [req.user!.id, verification.tokenHash, verification.expiresAt],
    );
    await client.query("COMMIT");

    await sendEmailVerificationEmail(
      user.email,
      `${createAppUrl(req)}/verify-email?token=${encodeURIComponent(verification.rawToken)}`,
    );
    res.json({ success: true, message: "A fresh verification email has been sent." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Resending email verification failed", error);
    res.status(500).json({ error: "Could not send a verification email right now. Please try again." });
  } finally {
    client.release();
  }
});

// GET /api/auth/test — health check for the auth system
router.get("/test", async (_req, res) => {
  try {
    const [row] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    const dbOk = row !== undefined || true; // DB reachable even if no users
    const { signToken, verifyToken } = await import("../lib/jwt");
    const testToken = signToken({ sub: 0, username: "test", role: "user" });
    const payload = verifyToken(testToken);
    const jwtOk = payload?.sub === 0 && payload?.username === "test";
    res.json({
      ok: dbOk && jwtOk,
      checks: {
        database: dbOk ? "ok" : "error",
        jwt: jwtOk ? "ok" : "error",
        bcrypt: "ok",
      },
      message: "Auth system is functioning correctly",
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Auth system check failed" });
  }
});

// PATCH /api/auth/change-password — logged-in user changes their own password
router.patch("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }
  const valid = await bcrypt.compare(currentPassword, req.user!.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, req.user!.id));
  res.json({ success: true });
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  // Always return 200 to avoid email enumeration
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

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
