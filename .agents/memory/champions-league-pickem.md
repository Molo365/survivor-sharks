---
name: Champions League Pick-Em semantics
description: Durable grouping and grading rules for UEFA Champions League Pick-Em pools.
---

Treat every Champions League event as an independent home/draw/away pick. Group slates by ESPN competition phase plus matchday or leg metadata, never by `week.number`, aggregate score, or advancement winner. The final is one match and must not display a leg.

**Why:** League-phase events do not reliably expose a week or matchday number, and ESPN may provide only a hyphenated `season.slug` such as `league-phase`. Knockout ties expose aggregate and advancement metadata that would produce the wrong game if reused for Pick-Em. ESPN final scores can also include extra time or penalties. Missing Champions League registration in the normal grader left picks pending, while two-way catch-up classification risked grading every outcome-option pick incorrectly.

**How to apply:** Normalize both human labels and hyphenated `season.slug` values. When matchday is absent, keep same-phase events in the fetched competition window together rather than discarding them. Preserve competition leg and series metadata for display/grouping. Grade from the score after the two regulation periods; when ESPN cannot provide that safely for an extra-time match, leave it ungraded rather than falling back to the final or aggregate score. Keep scheduled, catch-up, commissioner, and admin grading on one shared three-way sport classifier and outcome resolver; never compare `home_win` / `draw` / `away_win` values with ESPN team IDs.