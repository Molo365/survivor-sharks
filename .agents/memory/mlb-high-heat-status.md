---
name: MLB High Heat status
description: Daily submission status for MLB Crazy 8s pools must be separate from weekly scoring.
---

MLB High Heat submission status is daily: resolve the current ET MLB slate, count only the user's picks for that slate date, and require up to eight currently unstarted games. Weekly pick rows remain for scoring and leaderboard calculations.

**Why:** A weekly existence check makes yesterday's High Heat picks incorrectly satisfy today's requirement, and the dashboard's historical fallback can hide the missing submission entirely.

**How to apply:** Keep `/api/dashboard/pickem-stats` and `/api/picks/summary` on the same shared daily resolver; do not reuse `pool.currentWeek` for active MLB High Heat completeness.