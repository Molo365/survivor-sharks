---
name: NBA ATS pool type
description: Architecture and touch-point checklist for the nba_ats pool type (Weekend ATS Pick-Ems).
---

## Rule
`nba_ats` is a pick-em variant where players pick each NBA Fri/Sat/Sun game to cover a commissioner-set spread. It reuses `PickEmView` with an `isNbaAts` branch, not a separate view.

## Touch points (all required when adding nba_ats or modifying its paths)

1. **`lib/db/src/schema/pools.ts`** — `poolTypeEnum` must include `"nba_ats"`.
2. **`lib/db/src/schema/pickem_game_spreads.ts`** — New table `(poolId, gameId, week, spread, favoriteTeamId)`. Unique on `(poolId, gameId, week)`.
3. **`artifacts/api-server/src/routes/pickem.ts`** — Six route-level guards changed from `pool.poolType !== "pickem"` to also allow `"nba_ats"`: GET /games, POST /picks, GET /daily-results, GET /leaderboard, POST /process-results, plus two new routes: GET /ats-spreads and POST /ats-spreads.
4. **`artifacts/api-server/src/routes/pools.ts`** — `PICKEM_TYPES` Set must include `"nba_ats"`.
5. **`artifacts/survivor-sharks/src/pages/CreatePool.tsx`** — Zod enum, `SPORT_POOL_TYPES[nba]`, `POOL_TYPES` card.
6. **`artifacts/survivor-sharks/src/pages/PoolHome.tsx`** — `isNbaAts` flag, redirect to `/pickem`, badge, render branch.
7. **`artifacts/survivor-sharks/src/components/PickEmView.tsx`** — `isNbaAts` from `poolDetail?.poolType`, `handleAtsSubmit`, picks tab rendering branch, commissioner tab `AtsCommissionerSpreads` section.

## Key design decisions

- **Full weekend slate**: GET /games for `nba_ats` ignores the `?date` param and fetches all Fri+Sat+Sun games via `getNbaWeekendBounds`. Each game gets `etDate: string`, `spread: number | null`, `favoriteTeamId: string | null` fields in the response.
- **Week-based pick query**: existingPicks queried by `week` (not `gameDate`) so Fri/Sat/Sun picks are all returned in one query.
- **gameDate per pick**: client sends `gameDate: (game as any).etDate` per pick; server stores it via `(is3way || isAts) && pick.gameDate ? pick.gameDate : ...`.
- **ATS grading**: favourite covers if `favouriteMargin > spread`. Underdog covers if `favouriteMargin < spread`. Exact ties grade as incorrect (rare with half-point lines). Picks for games with no spread set are skipped until commissioner enters a line.
- **slateDeadlinePassed** for ATS: `games.every(g => isGameLocked(g.date))` — slate locked only when ALL games have started.
- **No sandbox mode** for nba_ats in v1 (not exposed in the UI).

## Commissioner spread entry
`AtsCommissionerSpreads.tsx` fetches from `GET /api/pools/:id/pickem/ats-spreads` (commissioner only), pre-populates spread inputs, and saves via `POST /api/pools/:id/pickem/ats-spreads`.

## Production migration requirement
`pickem_game_spreads` table must be applied to the production DB (via drizzle-kit or manual SQL) before any nba_ats pool can be used live. It does NOT exist in production until explicitly migrated.

**Why:** New DB table was added in dev only — drizzle-kit push applies to the dev DB. Production requires a separate migration step. Same category as the ESL `"push"` enum addition.
