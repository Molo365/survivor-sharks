---
name: Daily Pick Frequency for MLB
description: How daily MLB pools differ from weekly — DB columns, API design, auto-eliminator, and frontend Game type quirks.
---

## Rule
For daily MLB pools (`pool.pickFrequency === "daily"`):
- Server derives `week` (= `pool.currentWeek`) and `pickDate` (= `getTodayEtDate()`, YYYY-MM-DD) — client never sends these.
- Deadline = 5 min before first game of day; lock = when picked team's game starts (before deadline is never relevant since deadline is always first).
- Team re-use tracked across entire pool history by `pickDate` mismatch.
- Auto-eliminator: `processMlbDailyResults()` runs in parallel with weekly and non-MLB passes; closes the day only when all ESPN games return `isCompleted`.

## Why
The standard picks route assumes `week` is sent by the client. Daily pools can't rely on this because "the day" is a server-side concept (ET timezone, current pool day counter).

## How to apply
- Weekly query in `processMlbWeeklyResults` must filter `eq(poolsTable.pickFrequency, "weekly")` to exclude daily pools.
- The `Game` OpenAPI schema uses `startTime` (ISO string, not `date`) and `status` (string: "final"/"in_progress"/"scheduled") — NOT `isCompleted` or `date` directly.
- Frontend checks `game.status === "final"` for completed, `game.startTime` for formatting.
- `(pool as any).pickFrequency` needed in PoolHome/Leaderboard until codegen is re-run after spec changes.
