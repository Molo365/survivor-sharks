import { Router } from "express";
import { pool as pgPool } from "@workspace/db";

const router = Router();

const ADMIN_KEY = process.env.ADMIN_HTML_KEY ?? "sharks2026";

// GET /admin/users?key=sharks2026
router.get("/users", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    res.status(401).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Unauthorized</title></head>
        <body style="font-family:monospace;background:#0a0e1a;color:#ef4444;padding:40px">
          <h2>401 — Invalid or missing key</h2>
          <p>Access this page with <code>?key=YOUR_KEY</code></p>
        </body>
      </html>
    `);
    return;
  }

  const { rows } = await pgPool.query<{
    id: number;
    username: string;
    email: string;
    display_name: string | null;
    role: string;
    created_at: Date;
  }>(
    "SELECT id, username, email, display_name, role, created_at FROM users ORDER BY id ASC"
  );

  const rows2 = await pgPool.query<{ user_id: number; pool_count: string }>(
    "SELECT user_id, COUNT(*)::int as pool_count FROM entries GROUP BY user_id"
  );
  const poolCountMap = new Map(rows2.rows.map(r => [r.user_id, Number(r.pool_count)]));

  const tableRows = rows.map(u => `
    <tr>
      <td>${u.id}</td>
      <td><strong>${esc(u.username)}</strong></td>
      <td>${esc(u.display_name ?? "—")}</td>
      <td>${esc(u.email)}</td>
      <td>
        <span style="
          display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:bold;letter-spacing:1px;
          ${u.role === "admin"
            ? "background:rgba(30,144,255,.15);color:#1e90ff;border:1px solid rgba(30,144,255,.3)"
            : "background:rgba(255,255,255,.06);color:#94a3b8;border:1px solid rgba(255,255,255,.1)"}
        ">${u.role.toUpperCase()}</span>
      </td>
      <td>${poolCountMap.get(u.id) ?? 0}</td>
      <td style="color:#64748b">${new Date(u.created_at).toISOString().replace("T", " ").slice(0, 19)} UTC</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Survivor Sharks — User DB</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0a0e1a;
      color: #e2e8f0;
      padding: 40px 24px;
      min-height: 100vh;
    }
    header {
      display: flex;
      align-items: baseline;
      gap: 16px;
      margin-bottom: 32px;
      border-bottom: 1px solid rgba(30,144,255,.2);
      padding-bottom: 20px;
    }
    h1 {
      font-size: 24px;
      letter-spacing: 4px;
      color: #1e90ff;
      text-transform: uppercase;
    }
    .meta { font-size: 13px; color: #64748b; }
    .badge-total {
      margin-left: auto;
      background: rgba(30,144,255,.12);
      border: 1px solid rgba(30,144,255,.25);
      color: #1e90ff;
      padding: 4px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
    }
    .table-wrap {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,.08);
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    thead tr { background: rgba(30,144,255,.07); }
    thead th {
      padding: 12px 16px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #64748b;
      border-bottom: 1px solid rgba(255,255,255,.08);
      white-space: nowrap;
    }
    tbody tr { border-bottom: 1px solid rgba(255,255,255,.05); transition: background .1s; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: rgba(30,144,255,.05); }
    td { padding: 12px 16px; vertical-align: middle; }
    td:first-child { color: #475569; font-family: monospace; font-size: 12px; }
    .no-data { text-align: center; padding: 48px; color: #475569; }
    footer { margin-top: 24px; text-align: center; font-size: 12px; color: #334155; }
  </style>
</head>
<body>
  <header>
    <h1>🦈 Survivor Sharks</h1>
    <span class="meta">User Database</span>
    <span class="badge-total">${rows.length} user${rows.length !== 1 ? "s" : ""}</span>
  </header>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Username</th>
          <th>Display Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Pools</th>
          <th>Registered</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0
          ? `<tr><td colspan="7" class="no-data">No users registered yet.</td></tr>`
          : tableRows}
      </tbody>
    </table>
  </div>

  <footer>
    Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC &nbsp;·&nbsp; passwords never shown
  </footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default router;
