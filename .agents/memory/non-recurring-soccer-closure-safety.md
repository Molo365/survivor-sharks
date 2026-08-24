---
name: Non-recurring soccer closure safety
description: Prevents incorrect payouts when a stale weekly pool accepts picks for more than one calendar week.
---

Non-recurring MLS and Super League weekly Pick-Ems must not automatically settle if picks in the same numeric week cover multiple Monday–Sunday calendar windows.

**Why:** A missed closure can leave `currentWeek` unchanged while the calendar-driven schedule accepts a new slate. Grouping all rows solely by the numeric week would combine distinct contests and produce an incorrect payout.

**How to apply:** Before calculating standings or writing winner/prize fields, derive the closing calendar window from the earliest pick date. If any pick lies outside that window, skip settlement and require a manual review of the affected picks.