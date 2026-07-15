-- Migration: Add preseason support to NFL Pick 'Em
-- Purpose: Support NFL preseason games (August) in addition to regular season

-- ============================================
-- ADD PRESEASON SUPPORT COLUMNS
-- ============================================

-- Add week type to distinguish preseason/regular/postseason
ALTER TABLE nfl_pickem_weeks 
ADD COLUMN IF NOT EXISTS week_type text NOT NULL DEFAULT 'regular'
CHECK (week_type IN ('preseason', 'regular', 'postseason'));

-- Add display label for custom week naming (e.g., "Preseason Week 1")
ALTER TABLE nfl_pickem_weeks 
ADD COLUMN IF NOT EXISTS display_label text;

-- Remove the strict date range constraint for preseason flexibility
-- Preseason weeks may have different day ranges (Thursday-Sunday vs Thursday-Monday)
ALTER TABLE nfl_pickem_weeks 
DROP CONSTRAINT IF EXISTS nfl_pickem_weeks_valid_range;

-- Add a more flexible constraint that allows different ranges based on week type
-- Preseason: Thursday to Sunday (3 days after start)
-- Regular: Thursday to Monday (4 days after start)
ALTER TABLE nfl_pickem_weeks
ADD CONSTRAINT nfl_pickem_weeks_valid_range 
CHECK (
  (week_type = 'preseason' AND week_end_date = week_start_date + 3) OR
  (week_type IN ('regular', 'postseason') AND week_end_date = week_start_date + 4)
);

-- Create index for week type queries
CREATE INDEX IF NOT EXISTS idx_nfl_pickem_weeks_type 
ON nfl_pickem_weeks(season, week_type, week_number);

-- ============================================
-- UPDATE EXISTING DATA
-- ============================================

-- Set display_label for existing rows
UPDATE nfl_pickem_weeks
SET display_label = 'Week ' || week_number
WHERE display_label IS NULL;

-- ============================================
-- UPDATE WEEK STATUS FUNCTION
-- ============================================

-- Update function to handle preseason status
CREATE OR REPLACE FUNCTION update_nfl_week_status()
RETURNS void AS $$
BEGIN
  UPDATE nfl_pickem_weeks
  SET status = CASE
    WHEN thursday_kickoff IS NOT NULL AND now() >= thursday_kickoff THEN 'locked'
    WHEN week_start_date <= CURRENT_DATE AND week_end_date >= CURRENT_DATE THEN 'open'
    WHEN week_end_date < CURRENT_DATE THEN 'complete'
    ELSE 'upcoming'
  END,
  updated_at = now()
  WHERE status != CASE
    WHEN thursday_kickoff IS NOT NULL AND now() >= thursday_kickoff THEN 'locked'
    WHEN week_start_date <= CURRENT_DATE AND week_end_date >= CURRENT_DATE THEN 'open'
    WHEN week_end_date < CURRENT_DATE THEN 'complete'
    ELSE 'upcoming'
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- UPDATE UNIQUE CONSTRAINT
-- ============================================

-- Add unique constraint that includes week_type
-- This allows having Preseason Week 1 AND Regular Season Week 1 in the same season
ALTER TABLE nfl_pickem_weeks
DROP CONSTRAINT IF EXISTS nfl_pickem_weeks_season_week_unique;

ALTER TABLE nfl_pickem_weeks
ADD CONSTRAINT nfl_pickem_weeks_season_week_type_unique 
UNIQUE (season, week_number, week_type);

COMMENT ON COLUMN nfl_pickem_weeks.week_type IS 'Type of NFL week: preseason, regular, or postseason';
COMMENT ON COLUMN nfl_pickem_weeks.display_label IS 'Human-readable label for the week (e.g., "Preseason Week 1")';
