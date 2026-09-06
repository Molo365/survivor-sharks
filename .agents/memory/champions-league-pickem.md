---
name: Champions League Pick-Em semantics
description: Durable grouping and grading rules for UEFA Champions League Pick-Em pools.
---

Treat every Champions League event as an independent home/draw/away pick. Group slates by ESPN competition phase plus matchday or leg metadata, never by `week.number`, aggregate score, or advancement winner. The final is one match and must not display a leg.

**Why:** League-phase events do not reliably expose a week number, while knockout ties expose aggregate and advancement metadata that would produce the wrong game if reused for Pick-Em. ESPN final scores can also include extra time or penalties.

**How to apply:** Preserve `season.slug`, competition leg, and series metadata for display/grouping. Grade from the score after the two regulation periods; when ESPN cannot provide that safely for an extra-time match, leave it ungraded rather than falling back to the final or aggregate score.