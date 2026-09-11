ALTER TYPE "pool_type" ADD VALUE IF NOT EXISTS 'nhl_division_predictor';
CREATE TABLE IF NOT EXISTS "nhl_division_predictor_picks" (
 "id" serial PRIMARY KEY NOT NULL, "pool_id" integer NOT NULL REFERENCES "pools"("id") ON DELETE CASCADE,
 "user_id" integer NOT NULL REFERENCES "users"("id"), "division_name" text NOT NULL,
 "pos1_team" text NOT NULL, "pos2_team" text NOT NULL, "pos3_team" text NOT NULL, "pos4_team" text NOT NULL,
 "pos5_team" text NOT NULL, "pos6_team" text NOT NULL, "pos7_team" text NOT NULL, "pos8_team" text NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "nhl_ndp_picks_pool_user_div_uniq" UNIQUE("pool_id","user_id","division_name")
);
CREATE TABLE IF NOT EXISTS "nhl_division_results" (
 "id" serial PRIMARY KEY NOT NULL, "pool_id" integer NOT NULL REFERENCES "pools"("id") ON DELETE CASCADE,
 "division_name" text NOT NULL, "pos1_team" text NOT NULL, "pos2_team" text NOT NULL, "pos3_team" text NOT NULL, "pos4_team" text NOT NULL,
 "pos5_team" text NOT NULL, "pos6_team" text NOT NULL, "pos7_team" text NOT NULL, "pos8_team" text NOT NULL,
 "entered_at" timestamptz DEFAULT now() NOT NULL, "entered_by_user_id" integer REFERENCES "users"("id"),
 CONSTRAINT "nhl_ndp_results_pool_div_uniq" UNIQUE("pool_id","division_name")
);
CREATE TABLE IF NOT EXISTS "nhl_division_predictor_tiebreakers" (
 "id" serial PRIMARY KEY NOT NULL, "pool_id" integer NOT NULL REFERENCES "pools"("id") ON DELETE CASCADE,
 "user_id" integer NOT NULL REFERENCES "users"("id"), "tb_guess" integer, "tb_actual" integer,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "nhl_ndp_tb_pool_user_uniq" UNIQUE("pool_id","user_id")
);