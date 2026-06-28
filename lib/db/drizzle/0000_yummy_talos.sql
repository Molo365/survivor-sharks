CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."pick_frequency" AS ENUM('weekly', 'daily');--> statement-breakpoint
CREATE TYPE "public"."pool_type" AS ENUM('season', 'weekly', 'mid_season', 'pickem', 'group_stage_predictor', 'pickem_season', 'nfl_division_predictor', 'dirty_dozen', 'crazy_8s', 'nfl_confidence', 'nfl_confidence_weekly', 'wc_bracket');--> statement-breakpoint
CREATE TYPE "public"."sport_type" AS ENUM('nfl', 'mlb', 'nba', 'nhl', 'fifa', 'worldcup', 'intl');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('alive', 'eliminated');--> statement-breakpoint
CREATE TYPE "public"."pick_result" AS ENUM('win', 'loss', 'pending');--> statement-breakpoint
CREATE TYPE "public"."pickem_result" AS ENUM('pending', 'correct', 'incorrect', 'postponed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sport" "sport_type" DEFAULT 'nfl' NOT NULL,
	"pool_type_col" "pool_type" DEFAULT 'season' NOT NULL,
	"start_week" integer,
	"description" text,
	"invite_code" text NOT NULL,
	"current_week" integer DEFAULT 1 NOT NULL,
	"season" integer DEFAULT 2025 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"commissioner_id" integer NOT NULL,
	"max_entries" integer,
	"min_entries" integer,
	"entry_fee" real,
	"prize_pot" real,
	"prize_structure" jsonb,
	"double_elimination" boolean DEFAULT false NOT NULL,
	"pick_frequency" "pick_frequency" DEFAULT 'weekly' NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"sandbox_mode" boolean DEFAULT false NOT NULL,
	"sandbox_week" integer DEFAULT 1 NOT NULL,
	"ndp_tb1_game_id" text,
	"ndp_tb2_game_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"closure_reason" text,
	CONSTRAINT "pools_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" "entry_status" DEFAULT 'alive' NOT NULL,
	"eliminated_week" integer,
	"strike_count" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"tiebreaker_prediction" integer,
	"tiebreaker_runs" integer,
	"tiebreaker_strikeouts" integer,
	"tiebreaker_passing_yards" integer,
	"tiebreaker_rushing_yards" integer,
	"tiebreaker_shots_on_goal" integer,
	"tiebreaker_penalty_minutes" integer,
	"sov_total" integer,
	"final_winner" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"pool_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"team_logo_url" text,
	"week" integer NOT NULL,
	"pick_date" text,
	"result" "pick_result" DEFAULT 'pending' NOT NULL,
	"margin_of_victory" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"week" integer NOT NULL,
	"losing_team_ids" text[] DEFAULT '{}' NOT NULL,
	"is_voided" boolean DEFAULT false NOT NULL,
	"processed_by" integer,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_results_pool_week_unique" UNIQUE("pool_id","week")
);
--> statement-breakpoint
CREATE TABLE "pickem_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"game_id" text NOT NULL,
	"game_date" text NOT NULL,
	"week" integer DEFAULT 1 NOT NULL,
	"picked_team_id" text NOT NULL,
	"picked_team_name" text NOT NULL,
	"result" "pickem_result" DEFAULT 'pending' NOT NULL,
	"confidence_points" smallint,
	"away_score" integer,
	"home_score" integer,
	"winner_team_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_picks_uniq" UNIQUE("pool_id","user_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "group_stage_predictor_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"group_name" text NOT NULL,
	"pos1_team" text NOT NULL,
	"pos2_team" text NOT NULL,
	"pos3_team" text NOT NULL,
	"pos4_team" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gsp_picks_uniq" UNIQUE("pool_id","user_id","group_name")
);
--> statement-breakpoint
CREATE TABLE "group_stage_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"group_name" text NOT NULL,
	"pos1_team" text NOT NULL,
	"pos2_team" text NOT NULL,
	"pos3_team" text NOT NULL,
	"pos4_team" text NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entered_by_user_id" integer,
	CONSTRAINT "gsr_pool_group_uniq" UNIQUE("pool_id","group_name")
);
--> statement-breakpoint
CREATE TABLE "nfl_division_predictor_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"division_name" text NOT NULL,
	"pos1_team" text NOT NULL,
	"pos2_team" text NOT NULL,
	"pos3_team" text NOT NULL,
	"pos4_team" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ndp_picks_uniq" UNIQUE("pool_id","user_id","division_name")
);
--> statement-breakpoint
CREATE TABLE "nfl_division_predictor_tiebreakers" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tb1_guess" integer,
	"tb1_actual" integer,
	"tb2_guess" integer,
	"tb2_actual" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ndp_tb_pool_user_uniq" UNIQUE("pool_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "nfl_division_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"division_name" text NOT NULL,
	"pos1_team" text NOT NULL,
	"pos2_team" text NOT NULL,
	"pos3_team" text NOT NULL,
	"pos4_team" text NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entered_by_user_id" integer,
	CONSTRAINT "ndr_pool_div_uniq" UNIQUE("pool_id","division_name")
);
--> statement-breakpoint
CREATE TABLE "nfl_confidence_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"week" integer NOT NULL,
	"actual_passing_yards" integer NOT NULL,
	"actual_rushing_yards" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ncr_pool_week_uniq" UNIQUE("pool_id","week")
);
--> statement-breakpoint
CREATE TABLE "sandbox_game_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"week" integer NOT NULL,
	"game_id" text NOT NULL,
	"home_score" integer NOT NULL,
	"away_score" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sgs_pool_week_game_uniq" UNIQUE("pool_id","week","game_id")
);
--> statement-breakpoint
CREATE TABLE "pickem_season_week_game_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"week" integer NOT NULL,
	"game_count" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_season_week_game_counts_uniq" UNIQUE("pool_id","week")
);
--> statement-breakpoint
CREATE TABLE "wc_bracket_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"espn_event_id" text NOT NULL,
	"round" text NOT NULL,
	"match_slot" integer NOT NULL,
	"picked_team" text NOT NULL,
	"is_correct" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wc_bracket_picks_uniq" UNIQUE("pool_id","user_id","espn_event_id")
);
--> statement-breakpoint
CREATE TABLE "wc_bracket_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"espn_event_id" text NOT NULL,
	"round" text NOT NULL,
	"match_slot" integer NOT NULL,
	"team1" text NOT NULL,
	"team2" text NOT NULL,
	"winner" text NOT NULL,
	"win_type" text NOT NULL,
	"match_date" timestamp with time zone NOT NULL,
	"graded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wc_bracket_results_uniq" UNIQUE("pool_id","espn_event_id")
);
--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_commissioner_id_users_id_fk" FOREIGN KEY ("commissioner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_results" ADD CONSTRAINT "week_results_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_results" ADD CONSTRAINT "week_results_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_picks" ADD CONSTRAINT "pickem_picks_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_picks" ADD CONSTRAINT "pickem_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_stage_predictor_picks" ADD CONSTRAINT "group_stage_predictor_picks_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_stage_predictor_picks" ADD CONSTRAINT "group_stage_predictor_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_stage_results" ADD CONSTRAINT "group_stage_results_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_stage_results" ADD CONSTRAINT "group_stage_results_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfl_division_predictor_picks" ADD CONSTRAINT "nfl_division_predictor_picks_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfl_division_predictor_picks" ADD CONSTRAINT "nfl_division_predictor_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfl_division_predictor_tiebreakers" ADD CONSTRAINT "nfl_division_predictor_tiebreakers_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfl_division_predictor_tiebreakers" ADD CONSTRAINT "nfl_division_predictor_tiebreakers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfl_division_results" ADD CONSTRAINT "nfl_division_results_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfl_division_results" ADD CONSTRAINT "nfl_division_results_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfl_confidence_results" ADD CONSTRAINT "nfl_confidence_results_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_game_scores" ADD CONSTRAINT "sandbox_game_scores_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_season_week_game_counts" ADD CONSTRAINT "pickem_season_week_game_counts_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wc_bracket_picks" ADD CONSTRAINT "wc_bracket_picks_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wc_bracket_picks" ADD CONSTRAINT "wc_bracket_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wc_bracket_results" ADD CONSTRAINT "wc_bracket_results_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;