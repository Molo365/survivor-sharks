import { pool } from "@workspace/db";

/**
 * Idempotent SQL on API boot — production Railway has no drizzle migrate step,
 * so schema can lag behind code (e.g. Fast Break Multiplier column).
 */
const STARTUP_SQL_PATCHES: string[] = [
  `ALTER TYPE "pool_type" ADD VALUE IF NOT EXISTS 'fast_break_multiplier'`,
  `CREATE TABLE IF NOT EXISTS "pickem_game_moneylines" (
  "id" serial PRIMARY KEY NOT NULL,
  "pool_id" integer NOT NULL REFERENCES "pools"("id") ON DELETE cascade,
  "game_id" text NOT NULL,
  "week" integer NOT NULL,
  "home_team_id" text NOT NULL,
  "away_team_id" text NOT NULL,
  "home_decimal_odds" real NOT NULL,
  "away_decimal_odds" real NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pickem_game_moneylines_uniq" UNIQUE("pool_id","game_id","week")
)`,
  `ALTER TABLE "pickem_picks" ADD COLUMN IF NOT EXISTS "locked_decimal_odds" real`,
];

let patchesApplied = false;

export async function ensureDbPatches(): Promise<void> {
  if (patchesApplied) return;
  for (const sql of STARTUP_SQL_PATCHES) {
    await pool.query(sql);
  }
  patchesApplied = true;
}
