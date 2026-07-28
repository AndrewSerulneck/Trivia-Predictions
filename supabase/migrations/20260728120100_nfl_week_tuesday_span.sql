-- NFL Pick 'Em: recalculate_nfl_user_week must count picks over the week's
-- Tuesday 05:00 UTC → Tuesday 05:00 UTC span, not [week_start_date, week_end_date + 1).
--
-- The old window ended at Tuesday 00:00, but Monday Night Football kicks off at
-- 8:15 PM Eastern Monday — 00:15 UTC TUESDAY. Every MNF pick therefore fell
-- outside the window and was missing from the user's week summary (picks_count,
-- correct_picks, total_points, is_complete). Wednesday games (Christmas weeks)
-- had the mirror problem at the front edge.
--
-- 05:00 rather than 04:00 UTC because 04:00 is midnight Eastern only while the
-- US is on Daylight Time; after 2026-11-01 it lands at 11:00 PM Monday, mid-MNF.
-- Mirrors nflWeekSpanMs / NFL_WEEK_ROLLOVER_UTC_HOUR in lib/nflPickEm.ts —
-- change both together. See docs/nfl-pickem-code-review-fixes-plan.md.
--
-- The bounds are built with an explicit AT TIME ZONE 'UTC', so the result does
-- not depend on the database session's TimeZone setting.

CREATE OR REPLACE FUNCTION recalculate_nfl_user_week(
  p_user_id uuid,
  p_venue_id text,
  p_nfl_week_id uuid
)
RETURNS void AS $$
DECLARE
  v_week_record nfl_pickem_weeks%ROWTYPE;
  v_span_start timestamptz;
  v_span_end timestamptz;
  v_picks_count integer;
  v_correct integer;
  v_incorrect integer;
  v_is_complete boolean;
BEGIN
  -- Get week info
  SELECT * INTO v_week_record
  FROM nfl_pickem_weeks
  WHERE id = p_nfl_week_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- The Tuesday on or before week_start_date, at 05:00 UTC (DOW: 0 = Sunday,
  -- 2 = Tuesday), through the same instant seven days later.
  v_span_start := ((v_week_record.week_start_date
                     - (((EXTRACT(DOW FROM v_week_record.week_start_date)::int - 2 + 7) % 7) || ' days')::interval
                   )::timestamp + INTERVAL '5 hours') AT TIME ZONE 'UTC';
  v_span_end := v_span_start + INTERVAL '7 days';

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
    AND starts_at >= v_span_start
    AND starts_at < v_span_end;

  -- Check if all games are complete
  SELECT COUNT(*) = 0 INTO v_is_complete
  FROM pickem_picks
  WHERE user_id = p_user_id
    AND venue_id = p_venue_id
    AND sport_slug = 'nfl'
    AND starts_at >= v_span_start
    AND starts_at < v_span_end
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

COMMENT ON FUNCTION recalculate_nfl_user_week(uuid, text, uuid) IS
  'Recomputes a user''s NFL week summary over the week''s Tue 05:00 UTC -> Tue 05:00 UTC span (mirrors nflWeekSpanMs in lib/nflPickEm.ts).';
