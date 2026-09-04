ALTER TYPE "pool_type" ADD VALUE IF NOT EXISTS 'mlb_bracket';
--> statement-breakpoint
CREATE TABLE "mlb_bracket_picks" (
  "id" serial PRIMARY KEY NOT NULL, "pool_id" integer NOT NULL, "user_id" integer NOT NULL,
  "series_id" text NOT NULL, "round" text NOT NULL, "series_slot" text NOT NULL,
  "predicted_winner" text NOT NULL, "predicted_length" integer NOT NULL,
  "winner_correct" boolean, "length_correct" boolean,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mlb_bracket_picks_uniq" UNIQUE("pool_id","user_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "mlb_bracket_results" (
  "id" serial PRIMARY KEY NOT NULL, "pool_id" integer NOT NULL, "series_id" text NOT NULL,
  "round" text NOT NULL, "series_slot" text NOT NULL, "team1" text NOT NULL, "team2" text NOT NULL,
  "winner" text NOT NULL, "actual_length" integer NOT NULL, "completed_at" timestamp with time zone NOT NULL,
  "source" text DEFAULT 'espn' NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mlb_bracket_results_uniq" UNIQUE("pool_id","series_id")
);
--> statement-breakpoint
ALTER TABLE "mlb_bracket_picks" ADD CONSTRAINT "mlb_bracket_picks_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE cascade;
ALTER TABLE "mlb_bracket_picks" ADD CONSTRAINT "mlb_bracket_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id");
ALTER TABLE "mlb_bracket_results" ADD CONSTRAINT "mlb_bracket_results_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE cascade;