---
name: Crazy 8s sport addition checklist
description: Touch points required when adding a new sport to crazy_8s pools, plus the ET game-date bucketing rule.
---

# Adding a sport to crazy_8s (pattern: NBA "Fast Break", Fri+Sat+Sun weekend)

Touch points (backend):
1. espn.ts — week/weekend bounds wrapper (slice full Mon–Sun `days`/`espnDates` to the sport's window) + sandbox anchor constant.
2. `<sport>-stats.ts` — tiebreaker stats fetcher from ESPN boxscore (soft-fail to null).
3. entries schema — per-sport tiebreaker columns (existing convention; push with db package).
4. auto-eliminator.ts — `resolve<Sport>TiebreakerForPeriod`, widen tiebreaker branch, pool-filter exclusion in the MLB filter, and a full grading block (window, sandbox anchor, grade/postpone/resolve).
5. routes/crazy-eights.ts — slate helper + branches in GET /slate, GET /grid, GET/POST /picks, widen PATCH /tiebreaker and GET /yesterday-winner.

Touch points (frontend): CrazyEightsView (sport gates, tiebreaker inputs both in dialog and LockedPicksView), CrazyEightsGrid + CrazyEightsLeaderboard (weekend date nav, current-anchor helper), CreatePool (SPORT_POOL_TYPES allowlist, labels/pageTitle/subtitle/type-card, sandbox toggle condition AND submit-payload sandbox condition — they must stay in sync).

**Critical rule — game_date bucketing:** store `pickem_picks.gameDate` as the ET slate day the game was fetched under (ESPN date-scoped scoreboard buckets by ET day), NEVER `game.date.slice(0,10)` (UTC). Sunday-evening ET games are Monday in UTC and fall out of every weekend-window query (picks/grid/grading/resolution). NBA slate helper returns a `gameDates: Map<gameId, day>` for this. Note: the NHL crazy_8s POST branch still uses the UTC slice (pre-existing, left untouched per scope).

**Why:** caught by code review after NBA implementation; smoke test confirmed Sunday games bucket correctly with the map approach.

Other quirks: ESPN NBA boxscore has no plain "points" stat — total points come from `header.competitions[0].competitors[].score`; threes from stat `threePointFieldGoalsMade-threePointFieldGoalsAttempted` displayValue ("M-A", parse made). tsc `--noEmit` in api-server does NOT rebuild lib/db project references — run `tsc -b` in lib/db after schema changes or typecheck reads stale .d.ts.
