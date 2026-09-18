---
name: MLB boundary range limit
description: ESPN scoreboard date-range behavior affecting the recurring MLB season-end detector
---

The ESPN MLB scoreboard endpoint currently rejects the multi-month September–December range used by the season-boundary detector, while individual daily requests work. A fail-open detector therefore remains safe against premature closure but cannot detect the season end until the range strategy is changed.

**Why:** A live 2026 check returned HTTP 400 for the boundary range, while daily September–December queries returned valid regular-season and postseason events.

**How to apply:** Treat a zero wind-down count as inconclusive when the boundary range request fails; validate the boundary with checked daily requests or another bounded-range strategy before relying on automatic recurring-pool closure.