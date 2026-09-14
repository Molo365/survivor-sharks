---
name: MLB recurring postseason cutoff
description: Product and safety rules for ending live recurring MLB Pick-Em and High Heat at the regular-season boundary.
---

Live recurring MLB Pick-Em and High Heat pools must finish their final regular-season period and stop before postseason play. Reuse the same `isRecurring=false` wind-down semantics as the commissioner’s End Recurring action rather than inventing immediate closure.

**Why:** ESPN’s MLB scoreboard ignores its requested season-type parameter and may expose postseason placeholders before the regular season ends. Date guesses can close pools early, while a short rolling window can permanently miss the transition after an outage.

**How to apply:** Trust parsed event metadata, require affirmative same-season postseason evidence plus no unfinished same-season regular-season games in a durable bounded season range, and fail open on missing/malformed data. Filter regular-product slates locally to season type 2. Exclude sandbox pools, other sports, and the MLB bracket.