---
name: Predictor pool type checklist
description: Steps required to add a new predictor pool type (e.g. GSP, NDP) end-to-end.
---

When adding a predictor pool type (like NDP), these 7 touch points must all be done in order:

1. **DB schema** — two new tables: `*_picks` and `*_results` in `lib/db/src/schema/`. Export both from `lib/db/src/schema/index.ts`.
2. **poolTypeEnum** — add new value to `pgEnum` in `lib/db/src/schema/pools.ts`. Run `pnpm run typecheck:libs` to rebuild lib types.
3. **Static data** — write team/group data to `artifacts/api-server/src/lib/<name>.ts`.
4. **API routes** — write route file under `artifacts/api-server/src/routes/<name>.ts` (use `mergeParams: true`). Mount in `routes/index.ts`.
5. **OpenAPI spec** — add new tag, all endpoints, all schemas, update the `pool_type` enum in all 4 occurrences. Run `pnpm --filter @workspace/api-spec run codegen`. Then `pnpm run typecheck:libs` again.
6. **DB push** — `pnpm --filter @workspace/db run push` to apply new tables and enum value.
7. **Frontend** — write `*View.tsx` component (mirror GSP pattern). Wire into `CreatePool.tsx` (SPORT_POOL_TYPES map, POOL_TYPES array, formSchema enum, setValue cast). Wire into `PoolHome.tsx` (import, is* flag, badge chip, conditional render).

**Why:** Missing any step causes silent failures (type errors, 404s, missing UI options). The order matters: libs must typecheck before artifacts can import them; DB push before routes can query; codegen before hooks exist in frontend.
