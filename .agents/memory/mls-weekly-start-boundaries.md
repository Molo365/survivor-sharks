---
name: MLS weekly start boundaries
description: Classification rule for sharing Monday–Sunday start logic without crossing into MLB High Heat.
---

MLS weekly Pick-Em may share the canonical Monday–Sunday date calculations with MLB weekly Pick-Em, but its sport predicate and pre-start gate must remain separate from the MLB weekly pool classifier that also includes High Heat.

**Why:** The MLB weekly pool classifier intentionally covers both Pick-Em and High Heat. Broadening it to MLS would make shared call sites capable of treating MLS as an MLB High Heat pool.

**How to apply:** Reuse `getWeekBoundsEt` for MLS date math, but keep MLS Pick-Em recognition separate. Legacy MLS pools with no initial anchor remain active in the current calendar week.