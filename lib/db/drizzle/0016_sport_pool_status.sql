CREATE TABLE IF NOT EXISTS "sport_pool_status" (
  "sport" text PRIMARY KEY NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sport_pool_status_status_check" CHECK ("sport_pool_status"."status" IN ('open', 'coming_soon', 'paused'))
);
--> statement-breakpoint
INSERT INTO "sport_pool_status" ("sport", "status") VALUES
  ('nfl', 'open'),
  ('mlb', 'open'),
  ('nba', 'open'),
  ('nhl', 'open'),
  ('fifa', 'open'),
  ('worldcup', 'open'),
  ('intl', 'open'),
  ('mls', 'open'),
  ('superleague', 'open'),
  ('championsleague', 'open')
ON CONFLICT ("sport") DO NOTHING;