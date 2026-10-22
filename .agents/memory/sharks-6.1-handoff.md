# Sharks 6.1 — agent handoff (Oct 22, 2026)

Read this first when picking up **Survivor Sharks** work for **Molo** (product owner). He uses **test accounts on production** (not a separate sandbox ritual). He is **not a developer** — explain outcomes in plain language, avoid assuming comfort with git/Railway/SQL unless he asks.

---

## How Molo likes to work

- **Sport order:** Basketball (NBA) first when expanding parity/features; other sports follow agreed matrices.
- **Testing:** Pools on **his test accounts**, “testing as we go.” Skip heavy sandbox smoke unless he asks.
- **Communication:** Concise, blog-quality prose; **America/Toronto (Eastern)** for times. No engagement bait.
- **Agents / git:** Cloud agent branches `cursor/<name>-b582`, push, **draft PRs** via tooling (not `gh pr create`). Base branch usually `main`.
- **Scope:** Small correct diffs; match existing code style; read `.agents/memory/*.md` for pool-type checklists before big changes.
- **Platform patience:** **Railway Hobby ($20)** — during Oct 2026 incident, **builds/deploys lag Pro**; he may **wait** rather than fight the queue. **Secret rotation** after Railway breach email was **deferred** by choice (accept risk until redeploy).

---

## Product snapshot

- **Repo:** `Molo365/survivor-sharks` — monorepo: `artifacts/api-server`, `artifacts/survivor-sharks` (Vite/React), `lib/db` (Drizzle).
- **Hosting:** **Railway** — Postgres + API + static frontend. **Custom main domain not live yet** (`*.up.railway.app` or similar). Custom domain **does not** reduce Railway outage exposure.
- **Classic Fast Break** = `crazy_8s` + NBA. **Do not remove** when adding variants.

---

## Recent shipped / in-flight (check GitHub for merge state)

| Item | Branch / PR | Notes |
|------|-------------|--------|
| **NBA ATS Dirty Dozen** | Merged **#117**; copy **#118** | Up to 12 spread picks, ESPN lines |
| **Fast Break Multiplier** | Merged **#119** | `fast_break_multiplier`: ML required, score = Σ(conf × locked decimal) on correct picks. Migration **`0021_fast_break_multiplier.sql`** must run in prod before live pools work. |
| **Login → pool after reminder** | `cursor/login-return-to-pool-b582`, **draft #120** | `returnTo` query + post-login redirect; protected routes send `/login?returnTo=/pools/:id`. Shared allowlist in `lib/api-client-react/src/return-to.ts`. |

If deploy was blocked by Railway, **main in GitHub may be ahead of what’s running** — compare Railway deployment **commit SHA** to `main`.

---

## Fast Break Multiplier — technical anchors

- **Patterns mirror NBA ATS:** `nba-ml-odds.ts`, `pickem_game_moneylines`, freeze line at pick like `pickem_game_spreads`.
- **Scoring:** `crazy-eights-scoring.ts` (`crazyEightsCorrectPickPoints`); UI mirror `survivor-sharks/src/lib/crazyEightsScoring.ts`.
- **NBA weekend lock/reveal:** `nba-slate-reveal.ts` — include `fast_break_multiplier` in `isNbaWeekendOfficePool`.
- **Crazy 8s family:** `fast-break-pool.ts` → `isCrazyEightsFamilyPoolType`.
- **Docs:** See `nba-ats-pool-type.md` for checklist style; multiplier doc may still be worth adding like ATS.

---

## Parity / roadmap (from earlier agent todos — not all done)

- **Done:** Cross-sport parity matrix doc; NFL tiebreaker reveal + weekly bonus column.
- **Pending / later:** Lock-reveal + rules copy beyond NFL where defined; weekly bonus expansion; **NBA/NHL lock times + reveal rules** (after NFL TB work).
- **Cancelled:** Some tiebreaker visibility phase that was superseded.

---

## Pick reminder emails

- Links: `{APP_URL}/pools/{poolId}` (`pick-reminders.ts`).
- **Logged in:** works. **Logged out → login → dashboard** was the bug; **#120** fixes via `returnTo` (see `post-auth-redirect.ts`).

---

## Railway incident (Oct 22, 2026) — operator notes

- **Status:** [status.railway.com](https://status.railway.com) — incident **Major Outage**; **Hobby builds enabled after Pro** (check latest post).
- **Queued deploys:** May complete without re-click; **failed / never started** → **one** manual “Deploy latest commit” when Hobby builds work. **Don’t spam redeploy.**
- **Env var change:** Does **not** apply until a **new deploy** succeeds.
- **Security email:** Assume Railway-stored secrets **may be leaked**; rotation recommended: `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY` / SMTP, admin env vars. **Molo chose to wait** on rotation until deploy is viable.
- **Railway API tokens** (CLI/Public API) issued **before** incident are **invalid** — create new in dashboard if used. **Unrelated** to app `RESEND_*` / `DATABASE_URL`.

**App env vars (typical):** `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `APP_URL`, `SMTP_*`, optional `API_FOOTBALL_KEY`, `ADMIN_PANEL_*`, `POOL_CREATION_OPEN`, beta banner vars. No OpenRouter in repo.

---

## Commands agents use (Molo usually doesn’t)

```bash
pnpm run typecheck          # root; survivor-sharks alone: cd artifacts/survivor-sharks && pnpm run typecheck
# API unit tests often: cd artifacts/api-server && pnpm exec esbuild src/lib/foo.test.ts ... && node --test /tmp/foo.mjs
```

Pre-existing typecheck failure in `nfl-platform-promotion.test.ts` may still exist on `main` — don’t blame new work without checking.

---

## Transcript / prior run

Full cloud-agent transcript (Fast Break Multiplier arc):  
`cursor-cloud batch-fetch` bcId `bc-3520da92-1870-467c-882b-392f0582b582` with `includeTranscripts: true`.

---

## First actions for Sharks 6.1

1. `git fetch origin main` — see what merged vs draft PRs **#119**, **#120**.
2. Ask Molo: **Railway Hobby builds green?** **Rotate secrets now or deploy first?**
3. If deploying multiplier: confirm migration **0021** applied; smoke **one test pool** on prod.
4. Respect **basketball-first** unless he redirects.

---

*Last updated: handoff from cursor agent run, Oct 22, 2026 (Eastern).*
