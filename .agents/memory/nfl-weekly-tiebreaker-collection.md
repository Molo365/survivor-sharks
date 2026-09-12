---
name: NFL weekly tiebreaker collection
description: Design boundary for weekly bonus tiebreaker guesses in NFL Pick-Ems Season and NFL Confidence pools
---

Weekly bonus tiebreakers are a separate, per-pool/user/week record with one combined passing-plus-rushing guess and a target game chosen by the latest scheduled kickoff. Collection is enabled only for the two NFL season pool types when weekly bonuses are enabled; actual totals remain unset until the resolution stage.

**Why:** The existing Week 18 season tiebreaker uses separate entry fields and must not be changed or reused by weekly bonus logic.

**How to apply:** Keep weekly collection, actual-value resolution, weekly winner selection, and season-end/closure prize behavior in separate paths.