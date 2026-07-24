---
name: Season pool closure pattern
description: Season-long pool types need explicit closure wiring in both sandbox and live loops; grading working does not imply closure exists.
---

Grading and closure are fully decoupled in the auto-eliminator: a pool type can grade picks perfectly (pending → correct/incorrect) yet never close, declare winners, or set prizes, because each pool type needs its own explicit season-closure block.

**Why:** nfl_confidence (season-long) pools graded fine for a full season but never closed — no closure code existed anywhere; only pickem_season and nfl_confidence_weekly had blocks. Diagnosed via prod diagnostic logging.

**How to apply:** When adding or debugging a season-long pool type, verify FOUR things: (1) a closure function exists with the correct ranking metric (pickem counts correct picks; confidence sums confidence_points on correct picks — sharing the wrong metric silently declares wrong winners), (2) a sandbox closure block in the replay loop, (3) a live closure block in the live grading loop, (4) guards `poolType === X && currentWeek === NFL_TOTAL_WEEKS && isActive` plus a pendingCount===0 check. Closure functions live in pickem-season-closure.ts as a shared parameterized core (score SQL expression is the parameter).
