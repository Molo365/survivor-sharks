---
name: Survivor mass-elimination paths
description: Live auto-elimination and manual/sandbox Survivor grading do not share the same all-alive-loss handling.
---

The manual/sandbox Survivor grading routes explicitly void a pre-terminal season when every genuinely-alive player loses, but the live auto-eliminator uses separate per-sport closure blocks that generally only react to exactly one alive entry. NFL, NHL, and Super League can therefore reach zero alive entries without a live void record; MLB uses separate revival logic.

**Why:** A shared season closure helper handles winner/SOV settlement but is called after route-level void decisions and does not itself detect an all-player wipeout.

**How to apply:** When changing Survivor elimination behavior, trace both `processCompletedGames`/MLB batch loops and the manual/sandbox grading routes; do not assume the route void rule covers live polling.