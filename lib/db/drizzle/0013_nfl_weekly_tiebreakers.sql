CREATE TABLE "nfl_weekly_tiebreakers" (
  "id" serial PRIMARY KEY NOT NULL,
  "pool_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "week" integer NOT NULL,
  "guess" integer NOT NULL,
  "actual" integer,
  "target_game_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "nfl_weekly_tiebreakers_pool_user_week_uniq" UNIQUE("pool_id","user_id","week")
);
--> statement-breakpoint
ALTER TABLE "nfl_weekly_tiebreakers"
  ADD CONSTRAINT "nfl_weekly_tiebreakers_pool_id_pools_id_fk"
  FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "nfl_weekly_tiebreakers"
  ADD CONSTRAINT "nfl_weekly_tiebreakers_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;