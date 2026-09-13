---
name: Champions League Pick-Em semantics
description: Durable grouping and grading rules for UEFA Champions League Pick-Em pools.
---

Treat every Champions League event as an independent home/draw/away pick. Search far enough ahead to cross UEFA scheduling gaps, then group slates by phase-aware compact date clusters, using explicit matchday or leg metadata when available. Never group by `week.number`, aggregate score, or advancement winner. The final is one match and must not display a leg.

**Why:** League-phase events may omit week, matchday, notes, series, and leg metadata, while UEFA can leave more than a month between matchdays. ESPN may provide only a hyphenated `season.slug` such as `league-phase`. Knockout ties expose aggregate and advancement metadata that would produce the wrong game if reused for Pick-Em. ESPN final scores can also include extra time or penalties. Missing Champions League registration in the normal grader left picks pending, while two-way catch-up classification risked grading every outcome-option pick incorrectly.

**How to apply:** Normalize both human labels and hyphenated `season.slug` values. Use a 60-day lookahead and split same-phase fixtures when ET match dates are more than three calendar days apart; explicit conflicting matchday or leg metadata must also split periods. Select the earliest unfinished cluster so a completed period advances immediately. Preserve competition leg and series metadata for display/grouping. Grade from the score after the two regulation periods; when ESPN cannot provide that safely for an extra-time match, leave it ungraded rather than falling back to the final or aggregate score. Keep scheduled, catch-up, commissioner, and admin grading on one shared three-way sport classifier and outcome resolver; never compare `home_win` / `draw` / `away_win` values with ESPN team IDs.

Champions League Pick-Em currently has no corresponding weekly or tournament-end settlement path: grading pending picks does not declare winners, assign prizes, close the pool, or advance a recurring period. The current-period leaderboard/slate display is not settlement.

**Why:** The auto-grader and commissioner `process-results` route include Champions League grading, but their closure branches target other pool types. The recurring weekly advancement block is specific to Super League, while the shared weekly close block is limited to MLS and non-recurring Super League.

**How to apply:** Treat any future Champions League settlement work as a separate closure design. Define whether the competition settles by phase/matchday or at tournament end, then add guarded ranking, prize, winner, and pool-state updates to both scheduled and commissioner paths; do not infer settlement from leaderboard period changes.