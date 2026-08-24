---
name: NFL preseason advancement
description: NFL preseason calendar semantics and safety rule for automatic pool week selection.
---

NFL preseason uses ESPN weeks 1–4: Week 1 is the Hall of Fame slate and Weeks 2–4 are the remaining preseason weeks. Automatic advancement must stay within those four weeks and must require all events returned for the requested ESPN preseason week to be final.

**Why:** Fixed weekday progression can move a pool before a late, suspended, or postponed game has been graded. ESPN's event-level season type and week number protect against a stale response from another season phase or week.

**How to apply:** For automatic preseason selection only, restrict to pools explicitly marked `isPreseason`, validate every ESPN event is season type 1 for the active week, and leave postponed or suspended games on the current week until a final result exists. Do not apply this advancement to regular-season or sandbox pools.