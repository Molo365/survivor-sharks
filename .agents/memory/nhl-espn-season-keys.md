---
name: NHL ESPN season keys
description: How to map an NHL pool season to ESPN's schedule season when resolving season boundaries.
---

NHL pools identify a season by its start year, while ESPN's NHL schedule endpoint identifies it by its ending year. Query ESPN with `pool season + 1`.

**Why:** Querying a 2026 pool with ESPN `season=2026` returns the 2025–26 schedule and can make a new pool appear already locked.

**How to apply:** Use this mapping for NHL schedule lookups that establish openers or terminal dates. Do not apply it to NFL or other sports without validating their season convention.