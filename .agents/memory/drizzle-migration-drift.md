---
name: Drizzle migration drift
description: Development schema can be ahead of checked-in Drizzle migration history, with no __drizzle_migrations table.
---

The development database may be maintained by Drizzle schema push while checked-in migrations and snapshots lag behind; generated migrations can therefore bundle unrelated already-applied changes.

**Why:** A migration replay against this database can fail on existing tables or enum values, while blindly applying the generated diff to production can include unrelated schema changes.

**How to apply:** Inspect both the database and migration bookkeeping before generating/applying migrations. Scope a migration to the intended change, use the established push flow for development when migration history is absent, and separately verify external production databases.