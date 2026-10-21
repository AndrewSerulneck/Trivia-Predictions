-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) 10.1: admin corrections reach players
-- and stick (findings §17 B2, B3). Builds on 20261019203858_brackets_engine.sql (never edited).
--
--   1. bracket_games.result_held — "No result" an admin chose. A held game has no winner and the sync
--      never fills it from the feed (lib/brackets/games.ts mergeOne); a winner override or the admin
--      action "Let the feed decide" clears it. A new column because the engine's check
--      (winner_side is null) = (result_source is null) forbids an admin-sourced empty result.
--   2. bracket_save_feed_games() — the sync's ONLY game writer. It writes the feed-owned columns
--      (feed id, tip, status, scores) and, per column group, only what an admin hasn't taken over
--      in the CURRENT row: teams unless teams_set_by = 'admin'; an opening-round link only as an
--      'auto' link over a non-admin one; a winner only into an empty, unheld game; the mismatch note
--      only when the row's result is still the one the sync merged against (seen_winner_side /
--      seen_result_held). So an admin write between the sync's read and its write always survives.
--      Chosen over "two upsert batches" because PostgREST upserts whole rows: only a conditional
--      write against the current row can keep an admin's result (decided 2026-10-21, 10.1).
--      Admin actions write only their own columns (lib/bracketsStore.ts updateBracketGameColumns).
--   3. bracket_record_results() gains p_expected_winner_seats (the seats the sync read). If the
--      stored seats differ (an admin recorded something since), it changes nothing and answers
--      stale = true; the sync stops that run and the next one starts from fresh rows. Admin calls
--      pass null (unchanged behaviour). Same body otherwise; dropped and re-created because the
--      return type gains `stale`.

-- ── 1. result_held ─────────────────────────────────────────────────────────────────────────

alter table public.bracket_games
  add column result_held boolean not null default false;

alter table public.bracket_games
  add constraint bracket_games_held_has_no_winner check (not result_held or winner_side is null);

-- ── 2. bracket_save_feed_games ─────────────────────────────────────────────────────────────
-- p_games: a JSON array of the sync's changed games (≤ 79), each with the bracket_games columns in
-- snake_case plus seen_winner_side / seen_result_held (the stored result the merge started from).
-- Returns the number of rows written.

create or replace function public.bracket_save_feed_games(p_tournament_id uuid, p_games jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g record;
  v_written integer := 0;
  v_n integer;
begin
  if p_games is null or jsonb_typeof(p_games) <> 'array' then
    raise exception 'bracket_save_feed_games: games must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_games) > 100 then
    raise exception 'bracket_save_feed_games: at most 100 games' using errcode = '22023';
  end if;

  for v_g in
    select * from jsonb_to_recordset(p_games) as x(
      round smallint,
      location smallint,
      slot smallint,
      feed_game_id bigint,
      tip_at timestamptz,
      status_state text,
      status_detail text,
      home_team jsonb,
      away_team jsonb,
      home_score integer,
      away_score integer,
      winner_side text,
      result_source text,
      feeds_seat smallint,
      feeds_seat_set_by text,
      mismatch_note text,
      seen_winner_side text,
      seen_result_held boolean
    )
  loop
    -- A game the table doesn't have yet: insert it with only what the sync may decide.
    insert into bracket_games (
      tournament_id, round, location, slot, feed_game_id, tip_at, status_state, status_detail,
      home_team, away_team, home_score, away_score, winner_side, result_source,
      feeds_seat, feeds_seat_set_by, mismatch_note, updated_at
    )
    values (
      p_tournament_id, v_g.round, v_g.location, v_g.slot, v_g.feed_game_id, v_g.tip_at, v_g.status_state, v_g.status_detail,
      v_g.home_team, v_g.away_team, v_g.home_score, v_g.away_score,
      case when v_g.result_source = 'feed' then v_g.winner_side end,
      case when v_g.result_source = 'feed' and v_g.winner_side is not null then 'feed' end,
      case when v_g.feeds_seat_set_by = 'auto' then v_g.feeds_seat end,
      case when v_g.feeds_seat_set_by = 'auto' and v_g.feeds_seat is not null then 'auto' end,
      v_g.mismatch_note, now()
    )
    on conflict (tournament_id, round, location) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      v_written := v_written + 1;
      continue;
    end if;

    update bracket_games g
    set feed_game_id = v_g.feed_game_id,
        tip_at = v_g.tip_at,
        status_state = v_g.status_state,
        status_detail = v_g.status_detail,
        home_score = v_g.home_score,
        away_score = v_g.away_score,
        home_team = case when g.teams_set_by = 'admin' then g.home_team else v_g.home_team end,
        away_team = case when g.teams_set_by = 'admin' then g.away_team else v_g.away_team end,
        feeds_seat = case
          when g.feeds_seat_set_by is distinct from 'admin' and v_g.feeds_seat_set_by = 'auto' and v_g.feeds_seat is not null
          then v_g.feeds_seat else g.feeds_seat end,
        feeds_seat_set_by = case
          when g.feeds_seat_set_by is distinct from 'admin' and v_g.feeds_seat_set_by = 'auto' and v_g.feeds_seat is not null
          then 'auto' else g.feeds_seat_set_by end,
        winner_side = case
          when g.winner_side is null and not g.result_held and v_g.result_source = 'feed' and v_g.winner_side is not null
          then v_g.winner_side else g.winner_side end,
        result_source = case
          when g.winner_side is null and not g.result_held and v_g.result_source = 'feed' and v_g.winner_side is not null
          then 'feed' else g.result_source end,
        mismatch_note = case
          when g.winner_side is not distinct from v_g.seen_winner_side and g.result_held = coalesce(v_g.seen_result_held, false)
          then v_g.mismatch_note else g.mismatch_note end,
        updated_at = now()
    where g.tournament_id = p_tournament_id and g.round = v_g.round and g.location = v_g.location;
    get diagnostics v_n = row_count;
    v_written := v_written + v_n;
  end loop;
  return v_written;
end;
$$;

revoke all on function public.bracket_save_feed_games(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bracket_save_feed_games(uuid, jsonb) to service_role;

-- ── 3. bracket_record_results, with p_expected_winner_seats ────────────────────────────────

drop function public.bracket_record_results(uuid, smallint[], integer, boolean, text, text);

create or replace function public.bracket_record_results(
  p_tournament_id uuid,
  p_winner_seats smallint[],
  p_championship_total integer,
  p_allow_change boolean,
  p_reason text,
  p_actor text,
  p_expected_winner_seats smallint[] default null
)
returns table (
  changed_slots integer,
  regraded_rounds integer[],
  reversed_credits integer,
  graded_entries integer,
  stale boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t bracket_tournaments%rowtype;
  v_slot integer;
  v_round integer;
  v_location integer;
  v_width integer;
  v_seat integer;
  v_c0 integer;
  v_old integer;
  v_changed integer := 0;
  v_changed_decided boolean := false;
  v_rounds integer[] := array[]::integer[];
  v_regraded integer[] := array[]::integer[];
  v_grade integer;
  v_batch jsonb;
  v_n integer;
  v_reversed integer := 0;
  v_graded integer := 0;
  v_rec record;
begin
  if p_winner_seats is null or cardinality(p_winner_seats) <> 63 or array_lower(p_winner_seats, 1) <> 1 then
    raise exception 'bracket_record_results: winner seats must be an array of 63' using errcode = '22023';
  end if;
  if p_championship_total is not null and (p_championship_total < 0 or p_championship_total > 400) then
    raise exception 'bracket_record_results: championship total must be 0–400' using errcode = '22023';
  end if;
  for v_slot in 0..62 loop
    v_seat := p_winner_seats[v_slot + 1];
    continue when v_seat is null;
    v_round := bracket_slot_round(v_slot);
    v_width := 1 << v_round;
    v_location := v_slot - (64 - (1 << (7 - v_round))) + 1;
    if v_seat < (v_location - 1) * v_width or v_seat > v_location * v_width - 1 then
      raise exception 'bracket_record_results: slot % can''t be won by seat %', v_slot, v_seat using errcode = '22023';
    end if;
    if v_round > 1 then
      v_c0 := (64 - (1 << (8 - v_round))) + 2 * v_location - 2;
      if v_seat is distinct from p_winner_seats[v_c0 + 1] and v_seat is distinct from p_winner_seats[v_c0 + 2] then
        raise exception 'bracket_record_results: slot % winner % did not win a game feeding it', v_slot, v_seat
          using errcode = '22023';
      end if;
    end if;
  end loop;

  select * into v_t from bracket_tournaments t where t.id = p_tournament_id for update;
  if not found then
    raise exception 'bracket_record_results: no tournament %', p_tournament_id using errcode = 'P0002';
  end if;

  -- 10.1: the sync passes the winner seats it read at the start of its run. If anything (an admin
  -- override) changed them since, it records nothing; the next run starts from fresh rows.
  if p_expected_winner_seats is not null and v_t.winner_seats is distinct from p_expected_winner_seats then
    changed_slots := 0;
    regraded_rounds := array[]::integer[];
    reversed_credits := 0;
    graded_entries := 0;
    stale := true;
    return next;
    return;
  end if;

  for v_slot in 0..62 loop
    v_old := v_t.winner_seats[v_slot + 1];
    if v_old is distinct from p_winner_seats[v_slot + 1] then
      v_changed := v_changed + 1;
      if v_old is not null then
        v_changed_decided := true;
        v_round := bracket_slot_round(v_slot);
        if not (v_round = any (v_rounds)) then
          v_rounds := v_rounds || v_round;
        end if;
      end if;
    end if;
  end loop;

  if v_changed_decided and not coalesce(p_allow_change, false) then
    raise exception 'bracket_record_results: changing a decided result needs an admin override' using errcode = '22023';
  end if;
  if v_changed_decided and (p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(p_reason) > 500) then
    raise exception 'bracket_record_results: a reason (1–500 chars) is required to change a result' using errcode = '22023';
  end if;

  -- Rounds that were complete before the change may have been paid (payment starts only once a
  -- round is complete): take their credits back, then re-grade under a new grade_no.
  insert into bracket_rounds (tournament_id, round)
  select p_tournament_id, r from generate_series(1, 6) as r
  on conflict do nothing;
  foreach v_round in array v_rounds loop
    continue when exists (
      select 1 from generate_series(64 - (1 << (7 - v_round)), 64 - (1 << (7 - v_round)) + (1 << (6 - v_round)) - 1) as s
      where v_t.winner_seats[s + 1] is null
    );
    select r.grade_no into v_grade from bracket_rounds r
    where r.tournament_id = p_tournament_id and r.round = v_round for update;
    v_batch := '[]'::jsonb;
    v_n := 0;
    for v_rec in
      select e.id, e.user_id, e.round_correct[v_round] as correct
      from bracket_entries e
      where e.tournament_id = p_tournament_id
        and (e.kind = 'main' or v_round >= 3)
      order by e.id
    loop
      -- EVERY entry that scores this round, not only those with correct picks: the sync may be
      -- paying this round right now from round_correct it read before this change, and an entry
      -- with 0 correct before and > 0 after would otherwise be paid under the old key AND the new
      -- one. A spent key (reversed, or burned when it was never paid) can never pay. (The points
      -- of a burn row are only a record; ≥ 1 is the ledger's rule.)
      v_batch := v_batch || jsonb_build_array(jsonb_build_object(
        'user_id', v_rec.user_id,
        'source_key', v_rec.id::text || ':r' || v_round || ':' || v_grade,
        'points', greatest(1, coalesce(v_rec.correct, 0) * (1 << (v_round - 1)))
      ));
      v_n := v_n + 1;
      if v_n = 500 then
        if exists (select 1 from reverse_seasonal_points('bracket', v_batch, p_reason) x where x.outcome = 'conflict') then
          raise exception 'bracket_record_results: a credit raced the reversal; retry' using errcode = '40001';
        end if;
        v_reversed := v_reversed + v_n;
        v_batch := '[]'::jsonb;
        v_n := 0;
      end if;
    end loop;
    if v_n > 0 then
      if exists (select 1 from reverse_seasonal_points('bracket', v_batch, p_reason) x where x.outcome = 'conflict') then
        raise exception 'bracket_record_results: a credit raced the reversal; retry' using errcode = '40001';
      end if;
      v_reversed := v_reversed + v_n;
    end if;
    update bracket_rounds r
    set grade_no = r.grade_no + 1, paid_grade_no = null, paid_at = null
    where r.tournament_id = p_tournament_id and r.round = v_round;
    v_regraded := v_regraded || v_round;
  end loop;

  update bracket_tournaments t
  set winner_seats = p_winner_seats,
      championship_total = p_championship_total,
      completed_at = case when p_winner_seats[63] is null then null else coalesce(t.completed_at, now()) end,
      updated_at = now()
  where t.id = p_tournament_id;

  if v_changed > 0 then
    update bracket_entries e
    set round_correct = g.rc, score = bracket_score_of(g.rc), updated_at = now()
    from (
      select e2.id, bracket_round_correct(e2.picks, e2.kind, p_winner_seats) as rc
      from bracket_entries e2
      where e2.tournament_id = p_tournament_id
    ) g
    where e.id = g.id and e.round_correct is distinct from g.rc;
    get diagnostics v_graded = row_count;
  end if;

  if v_changed_decided then
    insert into bracket_admin_log (tournament_id, action, detail, actor)
    values (
      p_tournament_id,
      'results_changed',
      jsonb_build_object('reason', p_reason, 'rounds', to_jsonb(v_rounds), 'regraded', to_jsonb(v_regraded), 'reversed', v_reversed),
      coalesce(nullif(btrim(p_actor), ''), 'admin')
    );
  end if;

  changed_slots := v_changed;
  regraded_rounds := v_regraded;
  reversed_credits := v_reversed;
  graded_entries := v_graded;
  stale := false;
  return next;
end;
$$;

revoke all on function public.bracket_record_results(uuid, smallint[], integer, boolean, text, text, smallint[]) from public, anon, authenticated;
grant execute on function public.bracket_record_results(uuid, smallint[], integer, boolean, text, text, smallint[]) to service_role;
