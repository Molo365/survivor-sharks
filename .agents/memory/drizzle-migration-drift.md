---
name: Drizzle migration drift
description: Development schema can be ahead of checked-in Drizzle migration history, with no __drizzle_migrations table.
---

The development database may be maintained by Drizzle schema push while checked-in migrations and snapshots lag behind; generated migrations can therefore bundle unrelated already-applied changes.

**Why:** A migration replay against this database can fail on existing tables or enum values, while blindly applying the generated diff to production can include unrelated schema changes.

**How to apply:** Inspect both the database and migration bookkeeping before generating/applying migrations. Scope a migration to the intended change, use the established push flow for development when migration history is absent, and separately verify external production databases.

**Production symptom:** After a `main` deploy, pick-em pools show “no games” but Railway logs show `500` and `column "…" does not exist` — run the matching idempotent SQL from `lib/db/drizzle/` in Railway Postgres (see `production-incident-triage.md`). Do not treat as an ESPN slate issue until those errors are gone.