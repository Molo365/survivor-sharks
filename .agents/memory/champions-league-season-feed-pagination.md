---
name: Champions League season-feed pagination
description: ESPN’s range-query failure and season-feed limit can make a Champions League period appear to contain one game.
---

When the Champions League scoreboard range request fails, the season-feed fallback must retrieve enough events to cover the lookahead window. ESPN’s default 100-event response can end at the first fixture of the next matchday, so compact-date grouping cannot recover the omitted games.

**Why:** The 2026 feed with limit 100 ended at the first October 13 league-phase event, while the same feed with limit 200 contained all 18 October 13–14 fixtures. The grouping algorithm was not the cause.

**How to apply:** Treat a one-fixture period at a feed boundary as a retrieval/pagination problem first. Validate the fallback response count and date coverage before changing period clustering.