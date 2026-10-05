DO $$ BEGIN
  CREATE TYPE "pickem_scoring_mode" AS ENUM('straight', 'ats');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "pools" ADD COLUMN IF NOT EXISTS "pickem_scoring_mode" "pickem_scoring_mode" DEFAULT 'straight' NOT NULL;
