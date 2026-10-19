-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) Phase 6.2: the Squares event lifecycle —
-- rehearsal events, late voids, and the columns Phase 6.3 needs (one migration, so one db push).
--
-- Fixes plan §13 F3 (late void never re-graded) and F5 (a rehearsal pays real venues); F4 (archive
-- re-creates the Super Bowl) is fixed in application code (lib/squaresAdmin.ts, lib/squaresSettlement.ts).
--
-- Parts:
--   1. squares_events.purpose: 'super_bowl' (the season's Super Bowl, the real game) or 'rehearsal'
--      (an admin-created event on any other NFL game, plan 6.7). Decided by the application when the
--      event is created (squaresEventPurposeFor in lib/squares.ts). Production had 0 events on
--      2026-10-19, so no backfill; the default keeps any row the old code inserts a real event.
--   2. squares_events.reopened_at: when an admin void last re-opened the event. The settlement keeps
--      reading the feed for SQUARES_POST_FINAL_WATCH_MS after it, even past the 12-hour no-final
--      deadline, so a late void re-grades from the feed as the admin message promises.
--   3. squares_results.credit_blocked_at / credit_blocked_note: a winning result whose credit can
--      never land (its key is already paid to someone else, or the player is gone). Written by Phase
--      6.3's payer; added here so Andrew pushes once. The existing squares_results_unpaid_idx still
--      serves 6.3's read (its extra "credit_blocked_at is null" only narrows the same predicate).
--   4. squares_claim() replaced: on a rehearsal event, a claim (or release) at a venue that is not
--      hidden = true answers 'rehearsal_only' and writes nothing. This is the MAIN guard: boards are
--      created only by a claim, so a rehearsal can never create a board — and so never points, a
--      Prize or a Results row — at a real venue. (Second guard: lib/squaresPrizeAwards.ts.)
--   5. squares_void_moment() replaced: identical except it stamps reopened_at in the same write that
--      clears completed_at.
--
-- No new table, view or sequence, so no new grants (the replaced functions keep theirs; restated
-- below). No users FK, so delete_player_account is unchanged. Never edit 20261019051458.
-- DEPLOY ORDER: apply this BEFORE deploying the 6.2 code (the code selects the new columns).

-- ── 1–2. squares_events ────────────────────────────────────────────────────────────────────

alter table public.squares_events
  add column purpose text not null default 'super_bowl'
    constraint squares_events_purpose_valid check (purpose in ('super_bowl', 'rehearsal')),
  add column reopened_at timestamptz;

comment on column public.squares_events.purpose is
  'super_bowl = the season''s Super Bowl at every venue; rehearsal = an admin test event, playable only at hidden venues (squares_claim).';
comment on column public.squares_events.reopened_at is
  'Last admin void that cleared completed_at. The settlement watches the feed for 3 h after it (lib/squaresSettlement.ts).';

-- ── 3. squares_results: results whose credit can never land (Phase 6.3) ─────────────────────

alter table public.squares_results
  add column credit_blocked_at timestamptz,
  add column credit_blocked_note text
    constraint squares_results_credit_blocked_note_valid check (
      credit_blocked_note is null or (credit_blocked_at is not null and char_length(credit_blocked_note) <= 500)
    );

-- ── 4. squares_claim: rehearsal events play only at hidden venues ──────────────────────────
-- Same as 20261019051458 plus the 'rehearsal_only' outcome. Outcomes: claimed, released,
-- already_yours, taken, cap_reached, not_yours, locked, no_event, user_not_found, wrong_venue,
-- rehearsal_only.

create or replace function public.squares_claim(
  p_event_id uuid,
  p_user_id uuid,
  p_venue_id text,
  p_cell integer,
  p_action text
)
returns table (
  claim_outcome text,
  claim_board_id uuid,
  claim_cells smallint[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- SQUARES_PER_PLAYER_CAP in lib/seasonalGames.ts (Andrew, 2026-10-19: 2). Pinned equal by
  -- tests/squares-engine.test.ts.
  v_cap constant integer := 2;
  v_event squares_events%rowtype;
  v_venue_id text;
  v_venue_hidden boolean;
  v_board_id uuid;
  v_holder uuid;
  v_mine integer;
begin
  if p_action is null or p_action not in ('claim', 'release') then
    raise exception 'squares_claim: action must be claim or release' using errcode = '22023';
  end if;
  if p_cell is null or p_cell < 0 or p_cell > 99 then
    raise exception 'squares_claim: cell must be 0–99' using errcode = '22023';
  end if;

  -- FOR SHARE: the draw's UPDATE waits for in-flight claims, and a claim queued behind the draw
  -- re-reads the drawn row and is refused.
  select * into v_event from squares_events e where e.id = p_event_id for share;
  if not found or v_event.archived_at is not null then
    claim_outcome := 'no_event';
    return next;
    return;
  end if;

  select u.venue_id into v_venue_id from users u where u.id = p_user_id;
  if not found then
    claim_outcome := 'user_not_found';
    return next;
    return;
  end if;
  if p_venue_id is distinct from v_venue_id then
    claim_outcome := 'wrong_venue';
    return next;
    return;
  end if;

  -- A rehearsal never touches a real venue: no board, so no points, Prize or Results row there.
  -- Fails closed: a venue row that can't be read counts as visible.
  if v_event.purpose = 'rehearsal' then
    select v.hidden into v_venue_hidden from venues v where v.id = v_venue_id;
    if v_venue_hidden is not true then
      claim_outcome := 'rehearsal_only';
      claim_cells := array[]::smallint[];
      return next;
      return;
    end if;
  end if;

  if v_event.drawn_at is not null or now() >= v_event.lock_at then
    select b.id into v_board_id from squares_boards b where b.event_id = p_event_id and b.venue_id = v_venue_id;
    claim_outcome := 'locked';
    claim_board_id := v_board_id;
    claim_cells := array(
      select c.cell from squares_claims c where c.board_id = v_board_id and c.user_id = p_user_id order by c.cell
    );
    return next;
    return;
  end if;

  if p_action = 'claim' then
    insert into squares_boards (event_id, venue_id) values (p_event_id, v_venue_id)
    on conflict (event_id, venue_id) do nothing;
  end if;
  select b.id into v_board_id from squares_boards b where b.event_id = p_event_id and b.venue_id = v_venue_id;

  if v_board_id is null then
    -- Releasing on a board nobody has claimed on yet.
    claim_outcome := 'not_yours';
    claim_cells := array[]::smallint[];
    return next;
    return;
  end if;

  -- Serialize every claim/release on this board: the cap count and the cell check below are then
  -- exact. Same pattern as award_cycle_winner.
  perform pg_advisory_xact_lock(hashtextextended('squares-board:' || v_board_id::text, 0));

  select c.user_id into v_holder from squares_claims c where c.board_id = v_board_id and c.cell = p_cell;

  if p_action = 'claim' then
    if v_holder = p_user_id then
      claim_outcome := 'already_yours';
    elsif v_holder is not null then
      claim_outcome := 'taken';
    else
      select count(*) into v_mine from squares_claims c where c.board_id = v_board_id and c.user_id = p_user_id;
      if v_mine >= v_cap then
        claim_outcome := 'cap_reached';
      else
        insert into squares_claims (board_id, cell, user_id) values (v_board_id, p_cell, p_user_id);
        claim_outcome := 'claimed';
      end if;
    end if;
  else
    if v_holder is distinct from p_user_id then
      claim_outcome := 'not_yours';
    else
      delete from squares_claims c where c.board_id = v_board_id and c.cell = p_cell and c.user_id = p_user_id;
      claim_outcome := 'released';
    end if;
  end if;

  claim_board_id := v_board_id;
  claim_cells := array(
    select c.cell from squares_claims c where c.board_id = v_board_id and c.user_id = p_user_id order by c.cell
  );
  return next;
end;
$$;

revoke all on function public.squares_claim(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.squares_claim(uuid, uuid, text, integer, text) to service_role;

-- ── 5. squares_void_moment: stamps reopened_at ─────────────────────────────────────────────
-- Same as 20261019051458 except the event update also sets reopened_at (and the log says so).
-- Outcomes: voided, voided_and_regraded, not_graded, no_event.

create or replace function public.squares_void_moment(
  p_event_id uuid,
  p_moment text,
  p_reason text,
  p_actor text,
  p_col_score integer default null,
  p_row_score integer default null,
  p_points integer default null
)
returns table (
  void_outcome text,
  void_results integer,
  void_reversed integer,
  void_burned integer,
  void_grade_no integer,
  void_winning_cell smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moment squares_event_moments%rowtype;
  v_regrade boolean := p_col_score is not null or p_row_score is not null;
  v_chunk jsonb;
  v_offset integer := 0;
  v_bad integer;
  v_results integer := 0;
  v_reversed integer := 0;
  v_burned integer := 0;
  v_grade record;
begin
  if p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(p_reason) > 400 then
    raise exception 'squares_void_moment: a reason (1–400 chars) is required' using errcode = '22023';
  end if;
  if p_actor is null or char_length(btrim(p_actor)) = 0 or char_length(p_actor) > 100 then
    raise exception 'squares_void_moment: actor is required' using errcode = '22023';
  end if;
  if v_regrade and (p_col_score is null or p_row_score is null or p_points is null) then
    raise exception 'squares_void_moment: a re-grade needs both scores and the points' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('squares-event:' || p_event_id::text, 0));

  if not exists (select 1 from squares_events e where e.id = p_event_id) then
    void_outcome := 'no_event';
    return next;
    return;
  end if;

  select * into v_moment from squares_event_moments m
  where m.event_id = p_event_id and m.moment = p_moment
  for update;
  if not found then
    raise exception 'squares_void_moment: unknown moment %', p_moment using errcode = '22023';
  end if;
  if v_moment.graded_at is null then
    void_outcome := 'not_graded';
    void_grade_no := v_moment.grade_no;
    return next;
    return;
  end if;

  -- Reverse (paid) or burn (unpaid) the grade's credit keys, ≤ 500 per call.
  loop
    select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'source_key', x.credit_key, 'points', x.points))
    into v_chunk
    from (
      select r.user_id, r.credit_key, r.points
      from squares_results r
      where r.event_id = p_event_id and r.moment = p_moment and r.grade_no = v_moment.grade_no
        and r.user_id is not null and r.voided_at is null
      order by r.credit_key
      offset v_offset limit 500
    ) x;
    exit when v_chunk is null;

    select
      count(*) filter (where s.outcome not in ('reversed', 'burned', 'already_reversed', 'user_not_found')),
      count(*) filter (where s.outcome = 'reversed'),
      count(*) filter (where s.outcome = 'burned')
    into v_bad, v_reversed, v_burned
    from (
      select rs.outcome
      from public.reverse_seasonal_points('squares', v_chunk, 'squares void ' || p_moment || ': ' || left(p_reason, 400)) rs
    ) s;
    -- Accumulate across chunks.
    void_reversed := coalesce(void_reversed, 0) + v_reversed;
    void_burned := coalesce(void_burned, 0) + v_burned;
    if v_bad > 0 then
      raise exception 'squares_void_moment: a credit changed while voiding; nothing was changed, try again';
    end if;
    v_offset := v_offset + 500;
  end loop;

  update squares_results r
  set voided_at = now()
  where r.event_id = p_event_id and r.moment = p_moment and r.grade_no = v_moment.grade_no and r.voided_at is null;
  get diagnostics v_results = row_count;

  update squares_event_moments m
  set grade_no = m.grade_no + 1,
      col_score = null,
      row_score = null,
      winning_cell = null,
      score_source = null,
      graded_at = null,
      observed_col_score = null,
      observed_row_score = null,
      observed_at = null,
      mismatch_note = null,
      updated_at = now()
  where m.event_id = p_event_id and m.moment = p_moment;

  -- reopened_at: the settlement re-reads the feed for a while after this, even past the
  -- no-final deadline (plan 6.2, §13 F3).
  update squares_events e set completed_at = null, reopened_at = now(), updated_at = now() where e.id = p_event_id;

  void_outcome := 'voided';
  void_results := v_results;
  void_reversed := coalesce(void_reversed, 0);
  void_burned := coalesce(void_burned, 0);
  void_grade_no := v_moment.grade_no + 1;

  if v_regrade then
    select * into v_grade
    from public.squares_grade_moment(p_event_id, p_moment, p_col_score, p_row_score, p_points, 'admin', v_moment.grade_no + 1);
    if v_grade.grade_outcome <> 'graded' then
      raise exception 'squares_void_moment: re-grade failed (%)', v_grade.grade_outcome;
    end if;
    void_outcome := 'voided_and_regraded';
    void_winning_cell := v_grade.grade_winning_cell;
  end if;

  insert into squares_admin_log (event_id, action, detail, actor)
  values (
    p_event_id,
    'void_moment',
    jsonb_build_object(
      'moment', p_moment,
      'voidedGradeNo', v_moment.grade_no,
      'voidedScores', jsonb_build_object('col', v_moment.col_score, 'row', v_moment.row_score),
      'voidedWinningCell', v_moment.winning_cell,
      'voidedSource', v_moment.score_source,
      'reason', p_reason,
      'results', v_results,
      'reversed', void_reversed,
      'burned', void_burned,
      'reopened', true,
      'regrade', case when v_regrade
        then jsonb_build_object('col', p_col_score, 'row', p_row_score, 'winningCell', void_winning_cell)
        else null end
    ),
    p_actor
  );

  return next;
end;
$$;

revoke all on function public.squares_void_moment(uuid, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.squares_void_moment(uuid, text, text, text, integer, integer, integer) to service_role;
