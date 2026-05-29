# Survivor Sharks

A full-stack NFL/multi-sport survivor pool web app where players pick one team per week to win — pick wrong and you're eliminated.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/survivor-sharks run dev` — run the frontend (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — session signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Wouter (routing), TanStack Query, shadcn/ui, Tailwind CSS
- API: Express 5, session-based auth (bcryptjs + express-session + connect-pg-simple)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth OpenAPI spec
- `lib/api-client-react/src/generated/` — generated hooks + schemas (do not edit manually)
- `lib/db/src/schema/` — Drizzle ORM schema (users, sessions, pools, pool_members, picks, week_results)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — requireAuth middleware
- `artifacts/survivor-sharks/src/pages/` — React page components
- `artifacts/survivor-sharks/src/components/` — shared React components
- `artifacts/survivor-sharks/src/contexts/AuthContext.tsx` — global auth state

## Architecture decisions

- **Contract-first API**: OpenAPI spec defined first, hooks + schemas codegen'd via Orval. Never edit generated files.
- **Session auth**: Custom bcrypt+session (not JWT) — simpler for a pool app, persisted in PostgreSQL via connect-pg-simple.
- **mergeParams: true** on pool-scoped routers (picks, grid, results, eliminations, leaderboard) so `:poolId` from parent is available.
- **ESPN API**: Live schedule data fetched server-side from ESPN public APIs; static team data is embedded in `teams.ts`.
- **Ad slots**: Geofenced by timezone — US/Canada gets sportsbook affiliate placeholder, others get AdSense placeholder.

## Product

- **Auth**: Register, login, logout with persistent sessions
- **Pools**: Create pools (NFL/MLB/NBA/NHL/FIFA), join via invite code, commissioner controls
- **Weekly picks**: Pick one team per week, locked after game start; can't reuse teams
- **Survivor grid**: Visual matrix of all members × weeks showing pick history
- **Leaderboard**: Active survivors ranked, eliminated players listed below
- **Kill History**: Chronological log of eliminations with team picked
- **Pool Stats**: Aggregate stats per pool (pick rate, most picked team, survivor %)
- **Commissioner panel**: Process week results, manage invite code, adjust settings
- **Admin dashboard**: Super admin view of all pools and users

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm run typecheck:libs` after changing `lib/db/src/schema/` before typechecking artifacts — the composite lib must rebuild first.
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`.
- Express 5 types `req.params` as `string | string[]` — always wrap with `String(req.params.xxx)` before parsing.
- Pool-scoped routers need `{ mergeParams: true }` to access `:poolId` from the parent router.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
