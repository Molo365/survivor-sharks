---
name: Weekly bonus threshold lifecycle
description: Live enrollment checks for current weeks and compatibility handling for resolved weekly bonus results.
---

Current and future NFL Pick-Em Season and NFL Confidence evaluations use the current count of enrolled entry rows. Resolved historical weeks use the pool-wide `weekly_bonus_locked_active` when it is explicitly `true` or `false`. When that column is still `null` (season lock never persisted), resolved weeks fall back to current enrollment — same as live weeks — so closed weeks are not stuck showing “threshold not met” forever.

**Why:** The existing storage is one pool-wide boolean, not a week-keyed threshold or payout snapshot. Recomputing resolved results from today's enrollment could retroactively award a bonus to a week that closed without one. Exact preservation of newly resolved per-week decisions requires week-scoped persistence.

**How to apply:** Keep live counts on open/current/future evaluations and use the legacy value for settled results. Do not repurpose or update the pool boolean during reads. If per-week bonus decisions must survive future week transitions exactly, first scope and approve a schema change for week-keyed snapshots.