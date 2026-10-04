ALTER TABLE "sport_pool_status"
  DROP CONSTRAINT "sport_pool_status_status_check",
  ADD CONSTRAINT "sport_pool_status_status_check"
  CHECK ("status" IN ('open', 'coming_soon', 'paused', 'season_over'));