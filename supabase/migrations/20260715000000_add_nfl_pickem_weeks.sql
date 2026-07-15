-- Migration: Add NFL Pick 'Em week tracking
-- Purpose: Store NFL season weeks, lock times, and status
-- Dependencies: None (new table)

-- ============================================
-- TABLE: nfl_pickem_weeks
-- ============================================
-- Stores metadata for each NFL week of the season
-- Week defined as Thursday 00:00 UTC through Monday 23:59 UTC

CREATE TABLE IF NOT EXISTS nfl_pickem_weeks (
  -- Primary Key
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Season Information
  season integer NOT NULL,
  week_number integer NOT NULL,
  
  -- Week Date Range (Thursday -> Monday)
  week_start_date date NOT NULL,  -- Always a Thursday
  week_end_date date NOT NULL,    -- Always a Monday
  
  -- Lock Time (when picks can no longer be changed)
  -- Typically the earliest Thursday Night Football kickoff
  thursday_kickoff timestamptz,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'upcoming' 
    CHECK (status IN ('upcoming', 'open', 'locked', 'complete')),
  
  -- Game count for validation
  games_count integer NOT NULL DEFAULT 0,
  
  -- Sync tracking
  synced_at timestamptz,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT nfl_pickem_weeks_season_week_unique UNIQUE (season, week_number),
  CONSTRAINT nfl_pickem_weeks_start_is_thursday 
    CHECK (EXTRACT(DOW FROM week_start_date) = 4),  -- 4 = Thursday
  CONSTRAINT nfl_pickem_weeks_end_is_monday 
    CHECK (EXTRACT(DOW FROM week_end_date) = 1),     -- 1 = Monday
  CONSTRAINT nfl_pickem_weeks_valid_range 
    CHECK (week_end_date = week_start_date + 4)      -- Exactly 4 days apart
);

-- Indexes
CREATE INDEX idx_nfl_pickem_weeks_season 
  ON nfl_pickem_weeks(season);

CREATE INDEX idx_nfl_pickem_weeks_status 
  ON nfl_pickem_weeks(status);

CREATE INDEX idx_nfl_pickem_weeks_season_status 
  ON nfl_pickem_weeks(season, status);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS nfl_pickem_weeks_set_updated_at ON nfl_pickem_weeks;
CREATE TRIGGER nfl_pickem_weeks_set_updated_at
BEFORE UPDATE ON nfl_pickem_weeks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- TABLE: nfl_pickem_user_weeks
-- ============================================
-- Tracks per-user statistics for each NFL week

CREATE TABLE IF NOT EXISTS nfl_pickem_user_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id text NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  nfl_week_id uuid NOT NULL REFERENCES nfl_pickem_weeks(id) ON DELETE CASCADE,
  
  -- Pick statistics
  picks_count integer NOT NULL DEFAULT 0,
  correct_picks integer NOT NULL DEFAULT 0,
  incorrect_picks integer NOT NULL DEFAULT 0,
  total_points integer NOT NULL DEFAULT 0,
  
  -- Status
  is_complete boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT nfl_pickem_user_weeks_unique UNIQUE (user_id, venue_id, nfl_week_id),
  CONSTRAINT nfl_pickem_user_weeks_non_negative 
    CHECK (picks_count >= 0 AND correct_picks >= 0 AND incorrect_picks >= 0),
  CONSTRAINT nfl_pickem_user_weeks_correct_not_exceed_total 
    CHECK (correct_picks + incorrect_picks <= picks_count)
);

-- Indexes
CREATE INDEX idx_nfl_pickem_user_weeks_user 
  ON nfl_pickem_user_weeks(user_id);

CREATE INDEX idx_nfl_pickem_user_weeks_week 
  ON nfl_pickem_user_weeks(nfl_week_id);

CREATE INDEX idx_nfl_pickem_user_weeks_incomplete 
  ON nfl_pickem_user_weeks(is_complete) 
  WHERE is_complete = false;

CREATE INDEX idx_nfl_pickem_user_weeks_user_venue 
  ON nfl_pickem_user_weeks(user_id, venue_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS nfl_pickem_user_weeks_set_updated_at ON nfl_pickem_user_weeks;
CREATE TRIGGER nfl_pickem_user_weeks_set_updated_at
BEFORE UPDATE ON nfl_pickem_user_weeks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================

-- nfl_pickem_weeks: Public read, admin write
ALTER TABLE nfl_pickem_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read nfl_pickem_weeks" ON nfl_pickem_weeks;
CREATE POLICY "Public can read nfl_pickem_weeks"
  ON nfl_pickem_weeks FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role can modify weeks
DROP POLICY IF EXISTS "Service role can modify nfl_pickem_weeks" ON nfl_pickem_weeks;
CREATE POLICY "Service role can modify nfl_pickem_weeks"
  ON nfl_pickem_weeks FOR ALL
  TO service_role
  USING (true);

-- nfl_pickem_user_weeks: Users read own, service_role writes
ALTER TABLE nfl_pickem_user_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own nfl_pickem_user_weeks" ON nfl_pickem_user_weeks;
CREATE POLICY "Users can read own nfl_pickem_user_weeks"
  ON nfl_pickem_user_weeks FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "Service role can modify nfl_pickem_user_weeks" ON nfl_pickem_user_weeks;
CREATE POLICY "Service role can modify nfl_pickem_user_weeks"
  ON nfl_pickem_user_weeks FOR ALL
  TO service_role
  USING (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function: Update week status based on lock time
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

-- Function: Recalculate user week summary
CREATE OR REPLACE FUNCTION recalculate_nfl_user_week(
  p_user_id uuid,
  p_venue_id text,
  p_nfl_week_id uuid
)
RETURNS void AS $$
DECLARE
  v_week_record nfl_pickem_weeks%ROWTYPE;
  v_picks_count integer;
  v_correct integer;
  v_incorrect integer;
  v_is_complete boolean;
BEGIN
  -- Get week info
  SELECT * INTO v_week_record
  FROM nfl_pickem_weeks
  WHERE id = p_nfl_week_id;
  
  -- Count picks for this week
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'won'),
    COUNT(*) FILTER (WHERE status = 'lost')
  INTO v_picks_count, v_correct, v_incorrect
  FROM pickem_picks
  WHERE user_id = p_user_id
    AND venue_id = p_venue_id
    AND sport_slug = 'nfl'
    AND starts_at >= v_week_record.week_start_date::timestamptz
    AND starts_at < (v_week_record.week_end_date + 1)::timestamptz;
  
  -- Check if all games are complete
  SELECT COUNT(*) = 0 INTO v_is_complete
  FROM pickem_picks
  WHERE user_id = p_user_id
    AND venue_id = p_venue_id
    AND sport_slug = 'nfl'
    AND starts_at >= v_week_record.week_start_date::timestamptz
    AND starts_at < (v_week_record.week_end_date + 1)::timestamptz
    AND status = 'pending';
  
  -- Upsert user week record
  INSERT INTO nfl_pickem_user_weeks (
    user_id, venue_id, nfl_week_id,
    picks_count, correct_picks, incorrect_picks,
    total_points, is_complete, completed_at
  )
  VALUES (
    p_user_id, p_venue_id, p_nfl_week_id,
    v_picks_count, v_correct, v_incorrect,
    v_correct * 10, v_is_complete, CASE WHEN v_is_complete THEN now() END
  )
  ON CONFLICT (user_id, venue_id, nfl_week_id)
  DO UPDATE SET
    picks_count = EXCLUDED.picks_count,
    correct_picks = EXCLUDED.correct_picks,
    incorrect_picks = EXCLUDED.incorrect_picks,
    total_points = EXCLUDED.total_points,
    is_complete = EXCLUDED.is_complete,
    completed_at = EXCLUDED.completed_at,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE nfl_pickem_weeks IS 'NFL season weeks for Pick Em game';
COMMENT ON TABLE nfl_pickem_user_weeks IS 'User statistics per NFL week';
