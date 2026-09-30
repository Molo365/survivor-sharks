---
name: MLB live series slot matching
description: How ESPN postseason series map to persisted bracket slots.
---

When attaching ESPN postseason live-game data to a saved bracket row, match by round and the unordered pair of participating teams. Do not assume the ESPN-derived `seriesId` equals the persisted bracket slot ID.

**Why:** ESPN series IDs are synthesized from the order of groups in the fetched feed, while saved bracket rows use fixed slot IDs. Those two orderings can differ and attach a live game to the wrong pick.

**How to apply:** Resolve the live series against the bracket card's round and both team names. Keep tab-specific live data outside shared card objects when only one view should render it.