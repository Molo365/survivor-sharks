---
name: MLB boundary range limit
description: ESPN scoreboard date-selector behavior used by the recurring MLB season-end detector
---

The ESPN MLB scoreboard endpoint rejects hyphenated `start-end` date selectors, even for short spans, but accepts compact `YYYYMM` month selectors. Season-boundary fetches should aggregate September–December month responses and treat any failed or malformed month as unavailable.

**Why:** Live 2026 checks returned HTTP 400 for every hyphenated range tested, while four monthly requests returned the complete regular-season and postseason boundary data.

**How to apply:** Preserve all-or-nothing checked aggregation and event-ID deduplication; never interpret a partial month set as proof that the regular season ended.