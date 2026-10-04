CREATE TABLE IF NOT EXISTS "pickem_game_spreads" (
  "id" serial PRIMARY KEY NOT NULL,
  "pool_id" integer NOT NULL REFERENCES "pools"("id") ON DELETE cascade,
  "game_id" text NOT NULL,
  "week" integer NOT NULL,
  "spread" real NOT NULL,
  "favorite_team_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pickem_game_spreads_uniq" UNIQUE("pool_id","game_id","week")
);
