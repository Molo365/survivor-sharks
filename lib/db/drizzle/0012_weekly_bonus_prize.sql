ALTER TABLE "pools" ADD COLUMN "weekly_bonus_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "weekly_bonus_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "weekly_bonus_min_players" integer;