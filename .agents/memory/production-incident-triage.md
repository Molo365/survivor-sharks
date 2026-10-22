---
name: Production incident triage (Railway)
description: First moves when prod “breaks alone” — especially empty pick-em slates after a deploy. Molo has fixed these with one SQL line before; do not burn hours on ESPN until logs rule out DB/code mismatch.
---

## Owner context (Molo)

- Limited dev background; **comfortable running copy-paste SQL** in Railway Postgres when an agent gives the exact statement (has done this successfully with Claude before).
- Wants **minutes, not half a day**, when the issue is schema drift.

## Golden rule

**Railway Deploy Logs first.** Search for `500`, `column`, `does not exist`, `Failed query`.

| Log pattern | Likely cause | First action |
|-------------|--------------|--------------|
| `column "…" does not exist` | Code deployed; **production DB not migrated** | Find SQL in `lib/db/drizzle/*.sql` (or schema in `lib/db/src/schema/`); give Molo **idempotent** `ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` to run in Railway → Postgres → Query. |
| `500` on `/pickem-season/games`, `/pickem/games`, `/dashboard/pickem-stats` | Same — pick queries select full Drizzle row | Fix DB **before** debugging ESPN or preseason flags. |
| `200` but empty `games: []` | Schedule / week / `isPreseason` / ESPN | Then use ESPN + pool flags (`resolveNflEspnSeasonType`, etc.). |
| Whole site down / health fails | Railway outage or bad deploy | Railway status + deployment SHA vs `main`. |

## Why the UI lies

**“No games this week”** often means the **games API errored** (500), not that ESPN returned zero games. Confirm status code in logs.

## Why it “worked for weeks then broke today”

Railway **auto-deploys `main`**; there is **no automatic drizzle migrate** on deploy (`replit.md`, `railway.toml`). A feature merge can add columns to `lib/db/src/schema/` weeks after the pool started working; **the break aligns with the deploy**, not with NFL week advancement.

Example (Oct 2026): `locked_decimal_odds` on `pickem_picks` shipped with Fast Break Multiplier; prod DB never got `lib/db/drizzle/0021_fast_break_multiplier.sql` → instant 500 on all pick-em reads.

Quick unblock SQL (when that column is missing):

```sql
ALTER TABLE "pickem_picks" ADD COLUMN IF NOT EXISTS "locked_decimal_odds" real;
```

Full 0021 also adds `fast_break_multiplier` enum + `pickem_game_moneylines` table — apply from that file if creating multiplier pools.

## Agent workflow (do this in order)

1. Ask for or read **Deploy Logs** snippet around the failing route (30 seconds).
2. If missing column/table → **grep** `lib/db/drizzle/` and **paste SQL for Molo** immediately; mention PR/startup patch only as follow-up hardening (`ensure-db-patches.ts` on API boot if present on `main`).
3. After SQL (or patch deploy), **re-hit the same route** — expect `200` and non-empty games for a live NFL week.
4. Only then chase ESPN preseason (`isPreseason` + week > 4), rollback narratives, etc.

## Do not

- Spend hours on calendar/ESPN theory while logs show SQL errors.
- Assume “revert main” fixes DB drift — revert changes **code**, not missing columns.
- Rely on dev/Replit DB to prove prod schema (see `railway-database-inspection.md`).

## Related

- `drizzle-migration-drift.md` — dev push vs migration files.
- `nba-ats-pool-type.md` — `pickem_game_spreads` needed manual prod SQL before live.
- `predictor-pool-type-checklist.md` — **DB push/SQL before** shipping routes that query new tables.
