---
name: Recurring Hit the Ice settlement
description: Lifecycle and race-safety rules for recurring NHL/NBA Crazy 8s periods
---

Recurring live NHL/NBA Crazy 8s periods must persist period standings separately from pool-final entry fields, then reset period tiebreakers and advance the week in one locked transaction. A unique period record is the idempotency claim.

**Why:** Reusing pool-final winner fields closes a recurring pool after one weekend. Concurrent grader polls and the commissioner’s End Recurring action can also race, causing duplicate advancement, partial final awards, or an active pool stranded on an empty newly advanced week.

**How to apply:** Re-read and lock the pool before settlement, require the live row to remain in recurring scope and on the expected week, and make final awards plus closure atomic. If End Recurring lands immediately after rollover, finalize from the preceding persisted period rather than waiting for picks in the empty new week. Keep MLB and sandbox behavior outside this path.