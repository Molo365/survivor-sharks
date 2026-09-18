---
name: Broadcast standings source
description: Broadcast email standings must reuse existing leaderboard endpoints instead of duplicating ranking logic.
---

Broadcast standings for supported non-NFL pools must call the existing authenticated leaderboard endpoint over the local API, forwarding the commissioner’s auth headers and omitting period parameters so the endpoint’s default period is preserved. Fetch failures must fail closed and never fall back to message-only delivery.

**Why:** The leaderboard handlers contain sport-specific period, sandbox, tiebreaker, and ranking behavior that must remain the single source of truth.

**How to apply:** When adding a broadcast standings source, adapt only the endpoint response into the email row shape; do not reimplement or extract leaderboard ranking behavior unless explicitly authorized.