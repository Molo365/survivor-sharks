# Domain beta launch (handoff)

## Strategy

- **Goal:** Domain beta on custom domain (free beta), not soft-launch-only on `*.railway.app`.
- **Same** Postgres + accounts whether users hit custom domain or Railway hostname; set **`APP_URL`** to the canonical domain so verify/reset/invite links match.
- **Growth:** family/school commissioners; marketing later (Brand & Butter affiliates + community/blog). Monetization: commissioner SaaS later; affiliates secondary; no house rake yet.
- **Preference:** Care about new users on the domain; family can be told the URL manually. Hide fake ad placeholders before go-live (`AdSlot` returns null — PR #73).

## Railway env checklist

- [ ] Custom domain + DNS + HTTPS
- [ ] `APP_URL` = `https://<canonical-domain>` (no trailing slash)
- [ ] `DATABASE_URL`, `SESSION_SECRET`, `BASE_PATH=/`
- [ ] `RESEND_API_KEY` (or SMTP); sending domain `noreply@survivorsharks.com` (`artifacts/api-server/src/lib/mailer.ts`)
- [ ] `FEEDBACK_RECIPIENT_EMAIL`
- [ ] `ADMIN_PANEL_USER` / `ADMIN_PANEL_PASS` (not defaults)
- [ ] `POOL_CREATION_OPEN=true` if new commissioners should create pools (default off → “COMING SOON” on create — `pools.ts` / `CreatePool.tsx`)

## Product / legal (mostly not implemented)

- [ ] Privacy Policy + Terms + register checkbox
- [ ] Beta banner in UI
- [ ] Fix `artifacts/survivor-sharks/index.html` meta (still Replit placeholder)
- [ ] Public support email on landing/footer (feedback is login-only at `/feedback`)
- [ ] Admin sport status `open` vs `coming_soon` per offered sports

## Production smoke (on domain)

Register, login, password reset (links use domain), create pool → invite → join → submit picks.

## Post–domain beta

- Affiliate creatives in `AdSlot.tsx` (dashboard/pool/past pools; keep picks/live clean)
- Analytics, Sentry
- **Sport audit** when user lists open sports/pool types (code trace + tests)

## Technical pointers

- **Auth:** Client JWT in `localStorage` (`auth_token`); routes in `artifacts/api-server/src/routes/auth.ts`. Email verification **not** required to join a pool.
- **Join:** `/pools/join` → `/join/:inviteCode` → `POST /api/pools/join`
- **Recurring UI:** `poolRecurring.ts` + `pool-recurring.ts`; brackets forced non-recurring in API
- **Deploy:** `railway.toml` — nixpacks, single service serves API + built SPA

## Suggested implementation prompts (next agent)

1. Domain beta UI: Terms, Privacy, beta banner, index.html meta, footer support email
2. `LAUNCH.md` or `.env.example` with Railway env checklist
3. Sport audit for user-provided sport/pool-type list
4. Wire `AdSlot` when affiliate URLs exist
