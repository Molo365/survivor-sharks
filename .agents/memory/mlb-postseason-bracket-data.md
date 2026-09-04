---
name: MLB postseason bracket data
description: Non-obvious ESPN constraints for stable MLB postseason bracket creation and grading.
---

ESPN scoreboard round notes use abbreviations such as `ALWC`, `NLDS`, `ALCS`, and `NLCS`; long-form round-name matching is insufficient. A postseason scoreboard alone is also not a safe creation gate because bye teams may not yet have fully named matchups.

**Why:** Initial implementations that inferred the field and canonical slot IDs from scoreboard matchup order either blocked creation until games began or assigned completed series to the wrong bracket slot.

**How to apply:** Confirm the 12-team field from league standings playoff seeds, persist the seeded feeder graph when the pool is created, and map completed game-level series back through that graph rather than trusting ESPN event order.