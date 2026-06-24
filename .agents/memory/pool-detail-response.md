---
name: Pool detail GET vs list GET divergence
description: GET /api/pools/:poolId has its own manual response object, separate from formatPool(). New pool-level fields must be added to both.
---

## The Rule

Any new column added to `poolsTable` that the frontend needs must be added to **two** places in `artifacts/api-server/src/routes/pools.ts`:

1. `formatPool()` — used by `GET /api/pools` (list) and the PATCH response
2. The inline `res.json({...})` block inside `GET /api/pools/:poolId` (line ~290)

## Why

The two routes were written independently. `GET /api/pools/:poolId` returns a richer shape (members array, sandboxMode, etc.) than the list, so it was never refactored to use `formatPool()`. When `ndpTb1GameId`/`ndpTb2GameId` were added to `formatPool()` and the DB schema, the detail route was missed — the frontend's `useGetPool(poolId)` hook always returned `null` for those fields even after the PATCH saved them.

## How to Apply

After adding a column to `lib/db/src/schema/pools.ts` and running `pnpm run typecheck:libs`, grep for both locations:

```
grep -n "ndpTb1GameId\|<new_field>" artifacts/api-server/src/routes/pools.ts
```

Expect hits in `formatPool()` (line ~39) AND in the `GET /:poolId` handler (line ~290-318). If the detail handler is missing the field, add it.
