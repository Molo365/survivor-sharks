import { Router } from "express";
import { signAdminToken, requireAdminAuth } from "../middlewares/adminAuth";

const router = Router();

function getAdminCreds() {
  const username = (process.env.ADMIN_PANEL_USER ?? process.env.ADMIN_USERNAME ?? "admin").trim();
  const password = (process.env.ADMIN_PANEL_PASS ?? process.env.ADMIN_PASSWORD ?? "sharks2026").trim();
  return { username, password };
}

// POST /api/admin-auth/login
router.post("/login", (req, res) => {
  const body = req.body as { username?: string; password?: string };
  const submitted = {
    username: (body.username ?? "").trim(),
    password: (body.password ?? "").trim(),
  };
  const expected = getAdminCreds();

  req.log.info({
    submitted_username: submitted.username,
    submitted_password_length: submitted.password.length,
    expected_username: expected.username,
    expected_password_length: expected.password.length,
    username_match: submitted.username === expected.username,
    password_match: submitted.password === expected.password,
    env_ADMIN_PANEL_USER: process.env.ADMIN_PANEL_USER ?? "(unset)",
    env_ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? "(unset)",
  }, "Admin login attempt");

  if (!submitted.username || !submitted.password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  if (submitted.username !== expected.username || submitted.password !== expected.password) {
    res.status(401).json({ error: "Invalid admin credentials" });
    return;
  }

  const token = signAdminToken();
  res.json({ token });
});

// GET /api/admin-auth/me
router.get("/me", requireAdminAuth, (_req, res) => {
  const { username } = getAdminCreds();
  res.json({ authenticated: true, username });
});

// POST /api/admin-auth/logout
router.post("/logout", (_req, res) => {
  res.json({ success: true });
});

export default router;
