-- WC Bracket pool type migration
-- Run manually on Railway production before deploying wc_bracket feature.

-- 1. Add new pool type value
ALTER TYPE pool_type ADD VALUE IF NOT EXISTS 'wc_bracket';

-- 2. Create wc_bracket_picks table
CREATE TABLE IF NOT EXISTS wc_bracket_picks (
  id           SERIAL PRIMARY KEY,
  pool_id      INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  espn_event_id TEXT NOT NULL,
  round        TEXT NOT NULL,
  match_slot   INTEGER NOT NULL,
  picked_team  TEXT NOT NULL,
  is_correct   BOOLEAN,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wc_bracket_picks_uniq UNIQUE (pool_id, user_id, espn_event_id)
);

-- 3. Create wc_bracket_results table
CREATE TABLE IF NOT EXISTS wc_bracket_results (
  id            SERIAL PRIMARY KEY,
  pool_id       INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  espn_event_id TEXT NOT NULL,
  round         TEXT NOT NULL,
  match_slot    INTEGER NOT NULL,
  team1         TEXT NOT NULL,
  team2         TEXT NOT NULL,
  winner        TEXT NOT NULL,
  win_type      TEXT NOT NULL,
  match_date    TIMESTAMPTZ NOT NULL,
  graded_at     TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wc_bracket_results_uniq UNIQUE (pool_id, espn_event_id)
);
