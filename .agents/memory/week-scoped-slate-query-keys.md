---
name: Week-scoped slate query keys
description: Cache-key rule for pool views whose server endpoint derives the active week from pool.currentWeek.
---

Any child query whose endpoint derives its response from a pool's server-side `currentWeek` must include the current week in its query key, and should force a mount refetch when the pool detail can change outside the client.

**Why:** A pool detail refetch can update `currentWeek` while a child query keyed only by `poolId` remains fresh and continues rendering the previous week's games or scores.

**How to apply:** Use keys such as `[resource, poolId, currentWeek]` for slates and current-week picks. Keep mutation invalidation at `[resource, poolId]` when prefix invalidation is intended.