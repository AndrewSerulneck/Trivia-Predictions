# Phase 2: Database Schema & Data Model

## 2.1 Existing Schema Reference

### Current Pick 'Em Tables

**Table**: `pickem_picks` (from [`supabase/migrations/20260427113000_add_pickem_tables.sql`](supabase/migrations/20260427113000_add_pickem_tables.sql:1))

```sql
CREATE TABLE IF NOT EXISTS pickem_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id text NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  sport_slug text NOT NULL CHECK (sport_slug IN ('nba', 'mlb', 'nhl', 'soccer', 'nfl', 'mma', 'tennis')),
  sport_key text NOT NULL,
  league text NOT NULL,
  game_id text NOT NULL,
  home_team_id text,
  away_team_id text,
  selected_team_id text,
  winning_team_id text,
  game_label text NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  starts_at timestamptz NOT NULL,
  selected_team text NOT NULL,
  selected_side text NOT NULL CHECK (selected_side IN ('home', 'away')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'push', 'canceled')),
  home_score integer,
  away_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  reward_points integer NOT NULL DEFAULT 10,
  reward_claimed_at timestamptz
);
```

**Code Review**: This table already supports NFL picks via `sport_slug = 'nfl'`. No modifications needed.

**Indexes** (lines 26-39):
```sql
CREATE UNIQUE INDEX idx_pickem_picks_user_game_unique ON pickem_picks(user_id, game_id);
CREATE INDEX idx_pickem_picks_status_starts_at ON pickem_picks(status, starts_at);
CREATE INDEX idx_pickem_picks_user_status ON pickem_picks(user_id, status);
CREATE INDEX idx_pickem_picks_sport_key_game_id ON pickem_picks(sport_key, game_id);
CREATE INDEX idx_pickem_picks_venue_created ON pickem_picks(venue_id, created_at desc);
```

**RLS Policies** (lines 48-61):
```sql
-- Users can read own picks
CREATE POLICY "Users can read own pickem picks"
  ON pickem_picks FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Users can insert own picks
CREATE POLICY "Users can insert own pickem picks"
  ON pickem_picks FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Users can update own picks
CREATE POLICY "Users can update own pickem picks"
  ON pickem_picks FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
```

**Table**: `pickem_daily_snapshots` (from [`supabase/migrations/20260513002000_pickem_points_bank_and_multiplier.sql`](supabase/migrations/20260513002000_pickem_points_bank_and_multiplier.sql:10))

```sql
CREATE TABLE IF NOT EXISTS pickem_daily_snapshots (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id text NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  total_picks integer NOT NULL DEFAULT 0,
  settled_picks integer NOT NULL DEFAULT 0,
  pending_picks integer NOT NULL DEFAULT 0,
  correct_picks integer NOT NULL DEFAULT 0,
  incorrect_picks integer NOT NULL DEFAULT 0,
  unclaimed_correct_picks integer NOT NULL DEFAULT 0,
  pending_points integer NOT NULL DEFAULT 0,
  collected_points integer NOT NULL DEFAULT 0,
  multiplier_eligible boolean NOT NULL DEFAULT true,
  multiplier_if_settled_now integer NOT NULL DEFAULT 1,
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, venue_id, local_date),
  CONSTRAINT pickem_daily_snapshots_multiplier_valid 
    CHECK (multiplier_if_settled_now IN (1, 2, 3))
);
```

## 2.2 New Migrations

### Migration 1: NFL Week Metadata

**File**: `supabase/migrations/20260715000000_add_nfl_pickem_weeks.sql`

```sql
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
```

### Migration 2: Add NFL Pick 'Em to Game Types

**File**: `supabase/migrations/20260715000200_add_nfl_pickem_game_types.sql`

```sql
-- Migration: Add NFL Pick 'Em to game type constraints
-- Purpose: Enable NFL Pick 'Em across the application

-- Update game_sessions constraint
ALTER TABLE game_sessions 
  DROP CONSTRAINT IF EXISTS game_sessions_type_valid;

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_type_valid
  CHECK (game_type IN (
    'trivia', 
    'bingo', 
    'pickem', 
    'fantasy', 
    'speed-trivia', 
    'live-trivia', 
    'category-blitz',
    'nfl-pickem'
  ));

-- Update challenge_invites constraint
ALTER TABLE challenge_invites
  DROP CONSTRAINT IF EXISTS challenge_invites_game_type_valid;

ALTER TABLE challenge_invites
  ADD CONSTRAINT challenge_invites_game_type_valid
  CHECK (game_type IN (
    'pickem', 
    'fantasy', 
    'trivia', 
    'bingo',
    'nfl-pickem'
  ));

-- Update challenge_campaigns game_types constraint
ALTER TABLE challenge_campaigns
  DROP CONSTRAINT IF EXISTS challenge_campaigns_game_types_valid;

ALTER TABLE challenge_campaigns
  ADD CONSTRAINT challenge_campaigns_game_types_valid
  CHECK (
    array_length(game_types, 1) IS NULL
    OR game_types <@ ARRAY[
      'pickem','fantasy','trivia','bingo','nfl-pickem'
    ]::text[]
  );

-- Update ad_events page_key constraint
ALTER TABLE ad_events
  DROP CONSTRAINT IF EXISTS ad_events_page_key_valid;

ALTER TABLE ad_events
  ADD CONSTRAINT ad_events_page_key_valid
  CHECK (page_key IS NULL OR page_key IN (
    'global', 'join', 'venue', 'trivia', 
    'sports-bingo', 'pickem', 'fantasy', 'nfl-pickem'
  ));

-- Update advertisements page_key constraint  
ALTER TABLE advertisements
  DROP CONSTRAINT IF EXISTS ads_page_key_valid;

ALTER TABLE advertisements
  ADD CONSTRAINT ads_page_key_valid
  CHECK (page_key IN (
    'global', 'join', 'venue', 'trivia', 
    'sports-bingo', 'pickem', 'fantasy', 'nfl-pickem'
  ));
```

## 2.3 Entity Relationship Diagram

```
┌─────────────────────┐       ┌─────────────────────┐
│     users           │       │     venues          │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ auth_id             │       │ name                │
│ username            │       │ ...                 │
└──────────┬──────────┘       └──────────┬──────────┘
           │                             │
           │    ┌─────────────────────┐  │
           └───►│  pickem_picks       │◄─┘
                ├─────────────────────┤
                │ id (PK)             │
                │ user_id (FK)        │
                │ venue_id (FK)       │
                │ sport_slug = 'nfl'  │
                │ game_id             │
                │ selected_team       │
                │ status              │
                │ starts_at           │
                └─────────────────────┘
                          │
                          │ (references games by date range)
                          ▼
                ┌─────────────────────┐
                │ nfl_pickem_weeks    │
                ├─────────────────────┤
                │ id (PK)             │
                │ season              │
                │ week_number         │
                │ week_start_date     │
                │ week_end_date       │
                │ thursday_kickoff    │
                │ status              │
                └──────────┬──────────┘
                           │
                           │
                ┌──────────▼──────────┐
                │ nfl_pickem_user_    │
                │ weeks               │
                ├─────────────────────┤
                │ id (PK)             │
                │ user_id (FK)        │
                │ venue_id (FK)       │
                │ nfl_week_id (FK)    │
                │ picks_count         │
                │ correct_picks       │
                │ total_points        │
                └─────────────────────┘
```

## 2.4 Schema Validation Checklist

After running migrations, verify:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('nfl_pickem_weeks', 'nfl_pickem_user_weeks');

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('nfl_pickem_weeks', 'nfl_pickem_user_weeks');

-- Check RLS policies
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename IN ('nfl_pickem_weeks', 'nfl_pickem_user_weeks');

-- Check constraints
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (
  'nfl_pickem_weeks'::regclass,
  'nfl_pickem_user_weeks'::regclass
);

-- Test functions exist
SELECT proname, proargnames, prosrc
FROM pg_proc
WHERE proname IN ('update_nfl_week_status', 'recalculate_nfl_user_week');
```

## 2.5 Sample Data

```sql
-- Insert sample NFL weeks for 2024 season
INSERT INTO nfl_pickem_weeks (season, week_number, week_start_date, week_end_date, thursday_kickoff, status, games_count)
VALUES
  (2024, 1, '2024-09-05', '2024-09-09', '2024-09-05T20:20:00-04:00', 'complete', 16),
  (2024, 2, '2024-09-12', '2024-09-16', '2024-09-12T20:15:00-04:00', 'complete', 16),
  (2024, 3, '2024-09-19', '2024-09-23', '2024-09-19T20:15:00-04:00', 'complete', 16),
  (2024, 4, '2024-09-26', '2024-09-30', '2024-09-26T20:15:00-04:00', 'locked', 15),
  (2024, 5, '2024-10-03', '2024-10-07', '2024-10-03T20:15:00-04:00', 'open', 14),
  (2024, 6, '2024-10-10', '2024-10-14', '2024-10-10T20:15:00-04:00', 'upcoming', 14)
ON CONFLICT (season, week_number) DO NOTHING;

-- Verify insert
SELECT * FROM nfl_pickem_weeks ORDER BY week_number;
```

## 2.6 Code Review Checklist

Before proceeding to Phase 3:

- [ ] Migrations run successfully locally
- [ ] All indexes created for query performance
- [ ] RLS policies appropriate for data access
- [ ] Constraints validate data integrity
- [ ] Functions compile without errors
- [ ] Sample data inserts correctly
- [ ] Foreign key relationships work
- [ ] Constraints prevent invalid data
- [ ] Ready for production deployment

## 2.7 Performance Considerations

### Query Patterns

**Frequent Reads** (needs indexes):
```sql
-- Get weeks for a season
SELECT * FROM nfl_pickem_weeks WHERE season = 2024 ORDER BY week_number;

-- Get current week
SELECT * FROM nfl_pickem_weeks 
WHERE week_start_date <= CURRENT_DATE AND week_end_date >= CURRENT_DATE;

-- Get user week summary
SELECT * FROM nfl_pickem_user_weeks 
WHERE user_id = ? AND nfl_week_id = ?;
```

**Write Patterns**:
```sql
-- Upsert user week (after pick submission)
INSERT INTO nfl_pickem_user_weeks (...) VALUES (...)
ON CONFLICT (user_id, venue_id, nfl_week_id) DO UPDATE ...;
```

### Index Strategy

| Query Pattern | Index | Purpose |
|--------------|-------|---------|
| Week listing | `idx_nfl_pickem_weeks_season` | Season filter |
| Current week | `idx_nfl_pickem_weeks_status` | Status filter |
| Combined | `idx_nfl_pickem_weeks_season_status` | Dashboard query |
| User stats | `idx_nfl_pickem_user_weeks_user` | User lookup |
| Week stats | `idx_nfl_pickem_user_weeks_week` | Aggregate stats |
| Incomplete | `idx_nfl_pickem_user_weeks_incomplete` | Grading job |

---

**Next**: Proceed to [Phase 3: Backend API](docs/NFL_PICKEM_PHASE3_BACKEND.md)
