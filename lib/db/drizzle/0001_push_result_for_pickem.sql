-- Add "push" to the pickem_result enum to handle tied-game picks (e.g. NFL ties).
-- A push counts as neither correct nor incorrect — leaderboard scoring ignores it.
-- Postgres requires ADD VALUE outside a transaction for older versions;
-- Postgres 12+ allows it inside a transaction, which drizzle-kit uses by default.
ALTER TYPE "public"."pickem_result" ADD VALUE 'push';
