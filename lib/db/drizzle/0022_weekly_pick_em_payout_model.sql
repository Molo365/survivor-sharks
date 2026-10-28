ALTER TABLE "pools" ADD COLUMN IF NOT EXISTS "weekly_pick_em_payout_model" text;--> statement-breakpoint
UPDATE "pools"
SET "weekly_pick_em_payout_model" = 'season_budget'
WHERE "weekly_pick_em_payout_model" IS NULL
  AND "weekly_bonus_enabled" = true
  AND "pool_type_col" = 'pickem'
  AND "pick_frequency" = 'weekly'
  AND "is_recurring" = true
  AND "sport" IN ('mlb', 'nhl', 'mls', 'superleague');--> statement-breakpoint
UPDATE "pools"
SET "weekly_pick_em_payout_model" = 'period_pot'
WHERE "weekly_pick_em_payout_model" IS NULL
  AND "pool_type_col" = 'pickem'
  AND "pick_frequency" = 'weekly'
  AND "is_recurring" = true
  AND "sport" IN ('mlb', 'nhl', 'mls', 'superleague');
