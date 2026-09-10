---
name: Pick visibility timing
description: Privacy rule for every player-facing pick grid and pick drill-down.
---

Reveal timing is pool-path specific. NFL Survivor opponent picks reveal when the selected team's game has actually started or the pick has been graded. NFL Pick-Em Season reveals each opponent pick at that game's actual kickoff; before the first game starts, incomplete-slate players are additionally hidden at the slate level. A player can always see their own picks.

**Why:** Player-facing copy promises game-by-game reveal at kickoff. An earlier five-minute reveal diverged from submission locking and other Pick-Em Season views.

**How to apply:** Check the response route before assessing visibility. Enforce the route's reveal rule on the server for every player-pick response. Treat unavailable game metadata and sandbox replay data as unrevealed unless the pick is graded; client-side redaction can only be a defense-in-depth safeguard.
