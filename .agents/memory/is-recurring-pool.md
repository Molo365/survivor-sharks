---
name: isRecurring pool lifecycle
description: How non-recurring MLB Daily Pick-Em pools behave vs recurring ones; where each branch lives.
---

## Rule
MLB Daily pools have `isRecurring: boolean` (DB default `true` for backward compat).

- **Recurring** (`isRecurring=true`): after day closes, `currentWeek += 1`. Pool auto-advances indefinitely.
- **Non-recurring** (`isRecurring=false`): after day closes, `isActive = false`. Pool stops permanently.

**Why:** User-requested feature so commissioners can run one-off "today only" MLB daily contests without the pool perpetually rolling forward.

## Key touch points
1. `lib/db/src/schema/pools.ts` — `isRecurring` column, default `true`
2. `artifacts/api-server/src/lib/auto-eliminator.ts` — branch after inserting weekResultsTable row
3. `artifacts/api-server/src/routes/pickem.ts` — `poolClosed` flag in GET /games response; also forces `deadlinePassed: true`
4. `artifacts/api-server/src/routes/pools.ts` — `formatPool` exposes it; create handler reads it from body
5. `artifacts/survivor-sharks/src/pages/CreatePool.tsx` — Recurring toggle (default OFF), MLB Pick-Em only
6. `artifacts/survivor-sharks/src/components/PickEmView.tsx` — "Pool Ended" banner on `slate.poolClosed`
7. `artifacts/survivor-sharks/src/components/PoolCard.tsx` — "Completed" badge for stopped non-recurring pools

## CreatePool defaults
- DB column default: `true` (backward compat for existing pools)
- Form toggle default: `false` (new pools are one-off by default)
- Toggle only visible for `sport=mlb && poolType=pickem`
