---
name: Champions League Pick-Em semantics
description: Durable grouping and grading rules for UEFA Champions League Pick-Em pools.
---

Treat every Champions League event as an independent home/draw/away pick. Search far enough ahead to cross UEFA scheduling gaps, then group slates by phase-aware compact date clusters, using explicit matchday or leg metadata when available. Never group by `week.number`, aggregate score, or advancement winner. The final is one match and must not display a leg.

**Why:** League-phase events may omit week, matchday, notes, series, and leg metadata, while UEFA can leave more than a month between matchdays. ESPN may provide only a hyphenated `season.slug` such as `league-phase`. Knockout ties expose aggregate and advancement metadata that would produce the wrong game if reused for Pick-Em. ESPN final scores can also include extra time or penalties. Missing Champions League registration in the normal grader left picks pending, while two-way catch-up classification risked grading every outcome-option pick incorrectly.

**How to apply:** Normalize both human labels and hyphenated `season.slug` values. Use a 60-day lookahead and split same-phase fixtures when ET match dates are more than three calendar days apart; explicit conflicting matchday or leg metadata must also split periods. Select the earliest unfinished cluster so a completed period advances immediately. Preserve competition leg and series metadata for display/grouping. Grade from the score after the two regulation periods; when ESPN cannot provide that safely for an extra-time match, leave it ungraded rather than falling back to the final or aggregate score. Keep scheduled, catch-up, commissioner, and admin grading on one shared three-way sport classifier and outcome resolver; never compare `home_win` / `draw` / `away_win` values with ESPN team IDs.

Champions League Pick-Em settles once per tournament, after ESPN identifies one completed no-leg Final and all pool picks are graded. Rank every entry by cumulative correct picks across the tournament; top ties are co-winners and split the occupied prize places through the shared prize calculator.

**Why:** Schedule gaps and off-season windows cannot prove tournament completion. ESPN's exact `season.slug === "final"` is structured terminal evidence; free-form notes mentioning a final are not. Historical Final evidence must remain independently fetchable after pending picks disappear.

**How to apply:** Require structured Final provenance, one completed event with no leg, known final scores, a season match, and zero pending pool picks. Claim pool closure transactionally before reading final standings, and serialize membership joins against that pool-state lock.