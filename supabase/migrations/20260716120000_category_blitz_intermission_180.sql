-- Migration: Category Blitz — 3-minute intermission between rounds
-- Purpose: Align the DB with the new 180s intermission default in code
-- (CONTINUOUS_DEFAULT_INTERMISSION_SECONDS). Rounds stay 180s; the gap
-- between rounds drops from 300s to 180s.

-- 1b. Column default for future override rows now matches code (180s).
ALTER TABLE category_blitz_continuous_config
  ALTER COLUMN intermission_seconds SET DEFAULT 180;

-- 2. Backfill existing override rows still on the old 300s intermission.
UPDATE category_blitz_continuous_config
  SET intermission_seconds = 180
  WHERE intermission_seconds = 300;
