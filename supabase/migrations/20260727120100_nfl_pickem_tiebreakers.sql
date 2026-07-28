-- NFL Pick 'Em reward — tiebreaker guesses.
--
-- The week-winner reward ("most correct picks at this venue this week") is decided
-- by correct picks; ties are broken by a prediction question: "How many total
-- points will be scored in this week's last game?" Closest guess wins. See
-- docs/nfl-pickem-reward-plan.md and docs/nfl-pickem-reward-phase1.md.
--
-- The week's last game is the game with the latest kickoff in that NFL week
-- (ties broken by game_id ascending), resolved by getWeekTiebreakerGame in
-- lib/nflPickEmTiebreaker.ts. game_id is stored on the row so a settled guess
-- stays attached to the game it was actually made against, even if a schedule
-- change later moves which game is last.
--
-- venue_id is on the row deliberately: the same user at two venues is two
-- independent contests, mirroring how pickem_picks is scoped.
--
-- actual_total is NULL until the tiebreaker game is final; settleWeekTiebreaker
-- backfills it from the final score (home + away).

CREATE TABLE IF NOT EXISTS nfl_pickem_tiebreakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships (venues.id is text in this schema, matching nfl_pickem_user_weeks)
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id text NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES nfl_pickem_weeks(id) ON DELETE CASCADE,

  -- The tiebreaker game this guess was made against
  game_id text NOT NULL,

  -- The guess, and the settled result
  predicted_total integer NOT NULL,
  actual_total integer,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT nfl_pickem_tiebreakers_unique UNIQUE (user_id, venue_id, week_id),
  CONSTRAINT nfl_pickem_tiebreakers_predicted_total_range
    CHECK (predicted_total >= 0 AND predicted_total <= 200),
  CONSTRAINT nfl_pickem_tiebreakers_actual_total_range
    CHECK (actual_total IS NULL OR actual_total >= 0)
);

-- Indexes
-- The winner resolver reads exactly this way: every guess at one venue for one week.
CREATE INDEX IF NOT EXISTS idx_nfl_pickem_tiebreakers_venue_week
  ON nfl_pickem_tiebreakers(venue_id, week_id);

-- Settlement sweeps the week's rows for one game.
CREATE INDEX IF NOT EXISTS idx_nfl_pickem_tiebreakers_week_game
  ON nfl_pickem_tiebreakers(week_id, game_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS nfl_pickem_tiebreakers_set_updated_at ON nfl_pickem_tiebreakers;
CREATE TRIGGER nfl_pickem_tiebreakers_set_updated_at
BEFORE UPDATE ON nfl_pickem_tiebreakers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================
-- Same shape as nfl_pickem_user_weeks: users may read only their own row,
-- service_role writes. Another player's guess must never be readable through the
-- anon key before the tiebreaker game kicks off; the reveal rule for server-side
-- reads lives in listTiebreakerGuesses (lib/nflPickEmTiebreaker.ts).

ALTER TABLE nfl_pickem_tiebreakers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own nfl_pickem_tiebreakers" ON nfl_pickem_tiebreakers;
CREATE POLICY "Users can read own nfl_pickem_tiebreakers"
  ON nfl_pickem_tiebreakers FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "Service role can modify nfl_pickem_tiebreakers" ON nfl_pickem_tiebreakers;
CREATE POLICY "Service role can modify nfl_pickem_tiebreakers"
  ON nfl_pickem_tiebreakers FOR ALL
  TO service_role
  USING (true);

COMMENT ON TABLE nfl_pickem_tiebreakers IS
  'NFL Pick ''Em week-winner tiebreaker: per-user guess at the total points scored in the week''s last game. actual_total is NULL until that game is final.';
