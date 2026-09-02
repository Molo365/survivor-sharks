---
name: High Heat weekly closure
description: Correct lifecycle boundaries for MLB weekly Crazy 8s pools
---

MLB High Heat weekly pools are recurring week-long competitions. Their daily pick grading must not call the pool-closing winner declaration, and all slate, pick, and tiebreaker mutation paths must honor `isActive`.

**Why:** The current architecture has separate MLB daily and weekly flows, but the Crazy 8s resolver is period-based and its MLB path resolves one day at a time. Reusing it unchanged for weekly High Heat can declare a daily winner, write finish/prize fields, and close the entire pool while the UI still offers the next day's slate.

**How to apply:** Keep daily High Heat closure distinct from weekly aggregation. Before reading or submitting a Crazy 8s period, use the pool lifecycle state; after closure, expose results/leaderboards only and reject new pick or tiebreaker writes.