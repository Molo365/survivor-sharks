---
name: NFL week advancement
description: NFL preseason and regular-season safety rules for automatic pool week selection.
---

NFL preseason uses ESPN weeks 1–4: Week 1 is the Hall of Fame slate and Weeks 2–4 are the remaining preseason weeks. The regular season uses Weeks 1–18. Automatic advancement stops at preseason Week 4 and regular-season Week 18.

**Why:** Fixed weekday progression can move a pool before a late, suspended, or postponed game has been graded. ESPN's event-level season year, season type, and week number protect grading and advancement against stale responses. A full-state compare-and-set prevents an in-flight scheduler pass from overwriting commissioner changes.

**How to apply:** For live NFL Survivor, season-long Confidence, and Season Pick-Em pools, validate every ESPN event against the requested year/type/week before grading. Advance only after every game is unambiguously final and no picks remain pending. Exclude sandbox/replay pools, run after grading/elimination, and condition the update on all scheduling-relevant pool state.