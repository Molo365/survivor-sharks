---
name: NFL weekly tiebreaker collection
description: Design boundary for weekly bonus tiebreaker guesses in NFL Pick-Ems Season and NFL Confidence pools
---

Weekly bonus tiebreakers are a separate, per-pool/user/week record with one combined passing-plus-rushing guess and a canonical target game chosen by the latest scheduled kickoff. Collection and resolution are enabled only for the two NFL season pool types when weekly bonuses are enabled.

**Why:** The existing Week 18 season tiebreaker uses separate entry fields and must not be changed or reused by weekly bonus logic.

**How to apply:** GET and POST must use the same canonical target; freeze guesses at target kickoff; write actual only after an unambiguous final and a complete two-team passing+rushing box score. Tied score leaders remain pending until then, closest guess wins, and equal distance keeps co-winners. Keep season-end/closure paths separate.