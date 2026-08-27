---
name: Pick visibility timing
description: Privacy rule for every player-facing pick grid and pick drill-down.
---

Opponent picks must remain hidden until their individual game has actually started or the pick has been graded. A player can always see their own picks.

**Why:** A five-minute pregame submission lock prevents last-minute edits, but it is not a consent point for exposing opponents' selections. Using it as a visibility gate leaks strategy before kickoff.

**How to apply:** Enforce this on the server for every response that includes player picks. Treat unavailable game metadata and sandbox replay data as unrevealed unless the pick is graded; client-side redaction can only be a defense-in-depth safeguard.