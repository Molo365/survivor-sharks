---
name: Non-recurring soccer closure safety
description: Prevents incorrect payouts when soccer weekly picks span more than one intended slate window.
---

Non-recurring weekly soccer pools must settle against their sport-specific slate window: MLS uses Monday–Sunday, while Super League uses Friday–Monday and cannot settle until Tuesday. Super League settlement additionally requires every eligible game in the full four-day slate to be final or postponed and every ESPN league feed to be available.

**Why:** A missed closure can leave `currentWeek` unchanged while the calendar-driven schedule accepts a new slate. Grouping rows solely by the numeric week can combine distinct contests and produce an incorrect payout; treating an unavailable feed as an empty slate can close a pool before Monday fixtures are known.

**How to apply:** Before calculating standings or writing winner/prize fields, derive the closing window from the earliest pick date using the sport-specific boundary. If any pick lies outside it, or Super League slate data is unavailable or unfinished, skip settlement and require a manual review.