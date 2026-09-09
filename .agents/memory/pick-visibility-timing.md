---
name: Pick visibility timing
description: Privacy rule for every player-facing pick grid and pick drill-down.
---

Reveal timing is pool-path specific. NFL Survivor opponent picks reveal when the selected team's game has actually started or the pick has been graded. NFL Pick-Em Season's weekly-grid endpoint reveals an opponent's pick once that game's five-minute pre-kickoff lock has passed or it has been graded; before the first game starts, incomplete-slate players are additionally hidden at the slate level. A player can always see their own picks.

**Why:** Survivor and standard Pick-Em use actual kickoff as the reveal boundary, but the dedicated NFL Pick-Em Season endpoint currently couples visibility to its five-minute game lock and has a pre-slate incomplete-entry privacy guard. Assuming one shared rule produces incorrect investigations.

**How to apply:** Check the response route before assessing visibility. Enforce the route's reveal rule on the server for every player-pick response. Treat unavailable game metadata and sandbox replay data as unrevealed unless the pick is graded; client-side redaction can only be a defense-in-depth safeguard.