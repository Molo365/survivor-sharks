---
name: MLB postseason bracket data
description: Non-obvious ESPN constraints for stable MLB postseason bracket creation and grading.
---

ESPN scoreboard round notes use abbreviations such as `ALWC`, `NLDS`, `ALCS`, and `NLCS`; long-form round-name matching is insufficient. A postseason scoreboard alone is also not a safe creation gate because bye teams may not yet have fully named matchups.

**Why:** Initial implementations that inferred the field and canonical slot IDs from scoreboard matchup order either blocked creation until games began or assigned completed series to the wrong bracket slot.

**How to apply:** Confirm the 12-team field from league standings playoff seeds, persist the seeded feeder graph when the pool is created, and map completed game-level series back through that graph rather than trusting ESPN event order.

Division Series slots must treat the advancing Wild Card winner as the opponent of the fixed bye team. New slots place that source in feeder side 2, but readers must remain compatible with older persisted slots that put it in feeder side 1.

**Why:** A resolver that always assigned feeder side 1 to matchup team 1 let the fixed bye team overwrite the feeder winner, leaving matchup team 2 unresolved and also preventing later live-series mapping.

**How to apply:** Use one shared slot-team resolver for display, sandbox simulation, and live grading; do not independently combine fixed teams and feeder winners in those paths.

Bracket points are awarded when the predicted team wins that round; predicting the wrong opponent does not invalidate the team pick. A future pick is dead only after that picked team actually loses a completed postseason series.

**Why:** Opponent projections describe bracket paths, but scoring and remaining point potential follow the real team’s postseason survival independently.

**How to apply:** Derive eliminated teams from losers in persisted completed-series results. For display precedence, show graded correct/incorrect first, then processing, then future eliminated versus still alive.