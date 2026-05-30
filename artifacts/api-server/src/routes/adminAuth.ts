import { Router } from "express";
import { signAdminToken, verifyAdminToken, requireAdminAuth } from "../middlewares/adminAuth";

const router = Router();

const ADMIN_USERNAME = process.env.ADMIN_PANEL_USER ?? process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PANEL_PASS ?? process.env.ADMIN_PASSWORD ?? "sharks2026";

// POST /api/admin-auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin credentials" });
    return;
  }

  const token = signAdminToken();
  res.json({ token });
});

// GET /api/admin-auth/me
router.get("/me", requireAdminAuth, (_req, res) => {
  res.json({ authenticated: true, username: process.env.ADMIN_USERNAME ?? "admin" });
});

// POST /api/admin-auth/logout
router.post("/logout", (_req, res) => {
  res.json({ success: true });
});

export default router;
