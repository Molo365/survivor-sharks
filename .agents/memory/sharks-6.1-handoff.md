# Sharks 6.1 — agent handoff (Oct 22, 2026)

Read this first when picking up **Survivor Sharks** for **Molo**. He tests on **production test accounts** (not a separate sandbox ritual). He is **not a developer** — plain language, Eastern times, **Railway deploy logs + copy-paste SQL** when columns are missing (he has done this successfully).

---

## How Molo likes to work

- **Sport order:** **Basketball (NBA) first** when ready; NFL stable is the baseline.
- **Testing:** His test pools on prod; “testing as we go.”
- **Incidents:** **Deploy logs first** — `500` + `column "…" does not exist` → SQL from `lib/db/drizzle/` immediately. Do **not** burn hours on ESPN until DB errors are gone. See **`production-incident-triage.md`**.
- **Agents:** Branches `cursor/<name>-b582`, PRs via tooling. Base `main`.
- **Railway Hobby ($20):** Builds can lag; redeploy ≠ pull latest commit — need new merge/push to `main` for fresh SHA.

---

## Production state (end of Oct 22, 2026)

| What | Status |
|------|--------|
| **NFL pick-em** | Working after prod SQL for `locked_decimal_odds` + merges below |
| **#130** | NFL preseason → regular ESPN when week > 4 |
| **#131** | API startup applies migration **0021** SQL idempotently |
| **#132** | **Restored** Oct 22 fixes (#120–#126) after #129 revert — **deployed; Molo confirmed NFL pick-em still OK** |
| **#119 Fast Break Multiplier** | Still on `main` (never part of #129 revert). Live multiplier pools need full **0021** (column + `pickem_game_moneylines` + enum). |
| **Oct 22 revert #129** | Superseded by #132 — login `returnTo`, CL slates, healthz, maintenance path, NFL ESPN resilience are **back on main** |

**Reminder login:** Logged out → login should **`returnTo` pool** (not dashboard) — restored with #132; worth a quick smoke when Molo cares.

**Secret rotation** after Railway security email: **deferred by Molo** until he chooses — not blocking current work.

---

## What broke today (teach the next agent)

1. **Fast Break schema on `main` (#119)** without prod migration → every `pickem_picks` read **500** → UI said “no games.”
2. Fix: `ALTER TABLE "pickem_picks" ADD COLUMN IF NOT EXISTS "locked_decimal_odds" real;` (+ #131 on deploy).
3. **Revert #129** was correct during chaos; **#132** put fixes back once NFL + DB were stable.

Classic **Fast Break** = `crazy_8s`. **Multiplier** = `fast_break_multiplier` — separate pool type.

---

## Basketball next (when Molo says go)

- Finish **Fast Break Multiplier** on test pools only.
- Checklist style: `nba-ats-pool-type.md`, `predictor-pool-type-checklist.md`.
- **DB before routes** — prod already has column; ensure `pickem_game_moneylines` exists (#131 startup or manual 0021).

---

## Pointers in repo

- `.agents/memory/production-incident-triage.md` — SQL-first playbook (Molo-approved).
- `.agents/memory/drizzle-migration-drift.md` — no auto-migrate on Railway deploy.
- `replit.md` — Railway build/deploy gotchas.

---

## First actions in a new 6.1 chat

1. Read this file + `production-incident-triage.md`.
2. `git fetch origin main` — confirm HEAD matches what Railway deployed.
3. Ask Molo: **basketball now or NFL-only maintenance?**
4. On any “empty slate”: **deploy logs for 500** before ESPN theories.

---

*Last updated: Oct 22, 2026 (~4:40 PM Eastern) after #132 deploy + NFL pick-em confirmed.*
