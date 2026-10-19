-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) Phase 2: the Super Bowl Squares engine.
--
-- One event (the Super Bowl) → one 10×10 board per venue (created by the first claim) → up to
-- SQUARES_PER_PLAYER_CAP (2, lib/seasonalGames.ts) claimed cells per player → numbers drawn once at
-- lock → each scoring moment (q1, half, q3, final) graded for EVERY board in one statement →
-- venue points paid by lib/seasonalPointsCredit.ts (creditSeasonalPoints → credit_seasonal_points).
--
-- Grid convention (lib/squares.ts mirrors it): cell = row * 10 + col, 0–99. Columns belong to the
-- event's col team (the AFC team in a Super Bowl), rows to the row team (NFC). col_digits[i + 1] is
-- the score digit printed above column i (Postgres arrays are 1-based).
--
-- Parts:
--   0. seasonal_points_credits gains a logged reversal (reversed_at / reversal_reason / kind) and
--      reverse_seasonal_points(): Phase 1 had none, and "void and re-grade a moment" needs one.
--   1. Tables: squares_events, squares_event_moments, squares_boards, squares_claims,
--      squares_results, squares_admin_log. RLS on + forced, service_role grants only (the browser
--      never reads them directly; every read goes through an API route).
--   2. squares_claim()        — claim / release, count-guarded under a per-board advisory lock.
--   3. squares_draw()         — the one-time draw; never re-draws.
--   4. squares_grade_moment() — set-based grading of one moment for every board.
--   5. squares_void_moment()  — admin fix-up: void the current grade (reverse or burn its credits),
--                               optionally re-grade at once with admin-entered scores. Logged.
--
-- Account deletion: every users FK here is ON DELETE CASCADE, so delete_player_account
-- (20261008044524) needs no change (Andrew: REMOVE, don't anonymise). A deleted winner's result row
-- goes with them; its moment stays graded, so nothing re-awards it.

-- ── 0. Reversal on the seasonal points ledger ──────────────────────────────────────────────

alter table public.seasonal_points_credits
  add column reversed_at timestamptz,
  add column reversal_reason text,
  add column reversal_kind text;

alter table public.seasonal_points_credits
  add constraint seasonal_points_credits_reversal_complete check (
    (reversed_at is null and reversal_reason is null and reversal_kind is null)
    or (reversed_at is not null and reversal_reason is not null and reversal_kind is not null)
  ),
  add constraint seasonal_points_credits_reversal_reason_length check (
    reversal_reason is null or char_length(reversal_reason) between 1 and 500
  ),
  -- 'reversed': it was paid and the points were taken back. 'burned': it was never paid, and the
  -- key is now spent so a late or retried credit can't pay it.
  add constraint seasonal_points_credits_reversal_kind_valid check (
    reversal_kind is null or reversal_kind in ('reversed', 'burned')
  );

-- p_credits: the same shape credit_seasonal_points takes, [{user_id, source_key, points}].
-- A reversed or burned key stays in the ledger forever, so it can never be paid again — a re-grade
-- pays under a NEW key (Squares: board:moment:grade_no). Returns one row per input, in order:
--   'reversed'         — was paid; points subtracted (never below 0, users_points_non_negative).
--   'burned'           — was never paid; a spent ledger row now blocks any later credit.
--   'already_reversed' — nothing to do.
--   'user_not_found'   — never paid and no users row to burn it against (nothing can pay it).
-- Raises (changing nothing) on malformed input, > 500 entries or a concurrent conflicting credit.

create or replace function public.reverse_seasonal_points(p_source text, p_credits jsonb, p_reason text)
returns table (
  reversal_source_key text,
  outcome text,
  reversal_user_id uuid,
  reversal_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_source is null or p_source not in ('squares', 'bracket') then
    raise exception 'reverse_seasonal_points: unknown source %', p_source using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(p_reason) > 500 then
    raise exception 'reverse_seasonal_points: a reason (1–500 chars) is required' using errcode = '22023';
  end if;
  if p_credits is null or jsonb_typeof(p_credits) <> 'array' then
    raise exception 'reverse_seasonal_points: p_credits must be a JSON array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_credits);
  if v_count = 0 then
    return;
  end if;
  if v_count > 500 then
    raise exception 'reverse_seasonal_points: % entries in one call (max 500)', v_count using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_credits) as e(item)
    where jsonb_typeof(e.item) <> 'object'
       or coalesce(e.item ->> 'user_id', '') = ''
       or coalesce(e.item ->> 'source_key', '') = ''
       or char_length(e.item ->> 'source_key') > 200
       or jsonb_typeof(e.item -> 'points') is distinct from 'number'
       or (e.item ->> 'points')::numeric <> trunc((e.item ->> 'points')::numeric)
       or (e.item ->> 'points')::numeric < 1
       or (e.item ->> 'points')::numeric > 1000
  ) then
    raise exception 'reverse_seasonal_points: every entry needs user_id, source_key and whole points 1–1000'
      using errcode = '22023';
  end if;
  if (select count(distinct e.item ->> 'source_key') from jsonb_array_elements(p_credits) as e(item)) <> v_count then
    raise exception 'reverse_seasonal_points: duplicate source_key in one batch' using errcode = '22023';
  end if;

  -- Same lock order as credit_seasonal_points (users rows, id order): a credit for one of these
  -- players either committed before this point (the next statement sees it) or waits behind us.
  perform 1
  from users u
  where u.id in (
    select (e.item ->> 'user_id')::uuid from jsonb_array_elements(p_credits) as e(item)
    union
    select c.user_id
    from seasonal_points_credits c
    where c.source = p_source
      and c.source_key in (select e.item ->> 'source_key' from jsonb_array_elements(p_credits) as e(item))
  )
  order by u.id
  for update;

  return query
  with input as (
    select
      (e.item ->> 'user_id')::uuid as in_user_id,
      e.item ->> 'source_key' as in_source_key,
      (e.item ->> 'points')::integer as in_points,
      e.ord
    from jsonb_array_elements(p_credits) with ordinality as e(item, ord)
  ),
  existing as (
    select c.source_key as ex_key, c.user_id as ex_user_id, c.points as ex_points
    from seasonal_points_credits c
    join input i on c.source = p_source and c.source_key = i.in_source_key
  ),
  reversed as (
    update seasonal_points_credits c
    set reversed_at = now(), reversal_reason = p_reason, reversal_kind = 'reversed'
    from input i
    where c.source = p_source and c.source_key = i.in_source_key and c.reversed_at is null
    returning c.source_key as r_key, c.user_id as r_user_id, c.points as r_points
  ),
  debited as (
    update users u
    set points = greatest(0, coalesce(u.points, 0) - t.total)
    from (select r_user_id, sum(r_points)::integer as total from reversed group by r_user_id) t
    where u.id = t.r_user_id
    returning u.id
  ),
  burned as (
    insert into seasonal_points_credits as c (
      source, source_key, user_id, points, reversed_at, reversal_reason, reversal_kind
    )
    select p_source, i.in_source_key, i.in_user_id, i.in_points, now(), p_reason, 'burned'
    from input i
    where not exists (select 1 from existing ex where ex.ex_key = i.in_source_key)
      and exists (select 1 from users u where u.id = i.in_user_id)
    on conflict (source, source_key) do nothing
    returning c.source_key as b_key, c.user_id as b_user_id, c.points as b_points
  )
  select
    i.in_source_key,
    case
      when r.r_key is not null then 'reversed'
      when b.b_key is not null then 'burned'
      when ex.ex_key is not null then 'already_reversed'
      when not exists (select 1 from users u where u.id = i.in_user_id) then 'user_not_found'
      else 'conflict'
    end,
    coalesce(r.r_user_id, b.b_user_id, ex.ex_user_id, i.in_user_id),
    coalesce(r.r_points, b.b_points, ex.ex_points, i.in_points)
  from input i
  left join reversed r on r.r_key = i.in_source_key
  left join burned b on b.b_key = i.in_source_key
  left join existing ex on ex.ex_key = i.in_source_key
  order by i.ord;
end;
$$;

revoke all on function public.reverse_seasonal_points(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.reverse_seasonal_points(text, jsonb, text) to service_role;

-- ── 1. Tables ──────────────────────────────────────────────────────────────────────────────

-- A drawn digit row/column must be 0–9 each exactly once.
create or replace function public.squares_is_digit_permutation(p smallint[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p is not null
    and cardinality(p) = 10
    and (select array_agg(d order by d) from unnest(p) as d) = array[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[];
$$;

grant execute on function public.squares_is_digit_permutation(smallint[]) to service_role;

create table public.squares_events (
  id uuid primary key default gen_random_uuid(),
  -- The NFL season the game belongs to (the year it STARTED: the Feb 2027 Super Bowl is 2026).
  season integer not null check (season between 2000 and 2100),
  bdl_game_id bigint not null check (bdl_game_id > 0),
  -- Which side of the feed record ('home' / 'visitor') is the column team. A Super Bowl's column
  -- team is the AFC team, never "home" (the designated home team alternates by year).
  col_side text not null check (col_side in ('home', 'visitor')),
  -- Team snapshots for the axes: {id, abbreviation, full_name, name, conference}.
  col_team jsonb not null check (jsonb_typeof(col_team) = 'object'),
  row_team jsonb not null check (jsonb_typeof(row_team) = 'object'),
  kickoff_at timestamptz not null,
  -- Claims close and the numbers are drawn here (kickoff − 30 min unless an admin moved it).
  lock_at timestamptz not null,
  lock_at_set_by text not null default 'auto' check (lock_at_set_by in ('auto', 'admin')),
  col_digits smallint[],
  row_digits smallint[],
  drawn_at timestamptz,
  -- Last score the settlement saw ({col, row, status, statusState, at}); a shared score endpoint
  -- can read this instead of the provider.
  live_score jsonb check (live_score is null or jsonb_typeof(live_score) = 'object'),
  -- When the settlement last read the provider for this event (throttles pre-lock refreshes).
  feed_checked_at timestamptz,
  -- Every moment graded and the game final. Cleared by a void.
  completed_at timestamptz,
  -- An archived event is history: no claims, no settlement. At most one event is NOT archived.
  archived_at timestamptz,
  created_by text not null default 'auto' check (char_length(created_by) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint squares_events_lock_not_after_kickoff check (lock_at <= kickoff_at),
  constraint squares_events_draw_complete check (
    (drawn_at is null and col_digits is null and row_digits is null)
    or (
      drawn_at is not null
      and public.squares_is_digit_permutation(col_digits)
      and public.squares_is_digit_permutation(row_digits)
    )
  )
);

-- The one current event.
create unique index squares_events_one_current on public.squares_events ((true)) where archived_at is null;

create table public.squares_event_moments (
  event_id uuid not null references public.squares_events(id) on delete cascade,
  moment text not null check (moment in ('q1', 'half', 'q3', 'final')),
  -- Bumped by every void. Results and credit keys carry it, so a re-grade pays under new keys.
  grade_no integer not null default 1 check (grade_no >= 1),
  -- The 60-second hold: the score the feed first showed for this moment, and when. Grading waits
  -- until the same score has been seen for SQUARES_CONFIRMATION_MS (lib/squares.ts).
  observed_col_score integer check (observed_col_score is null or observed_col_score >= 0),
  observed_row_score integer check (observed_row_score is null or observed_row_score >= 0),
  observed_at timestamptz,
  col_score integer check (col_score is null or col_score >= 0),
  row_score integer check (row_score is null or row_score >= 0),
  winning_cell smallint check (winning_cell is null or winning_cell between 0 and 99),
  score_source text check (score_source is null or score_source in ('feed', 'admin')),
  graded_at timestamptz,
  -- Set when the final record disagrees with a graded quarter (report-only; an admin decides).
  mismatch_note text check (mismatch_note is null or char_length(mismatch_note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (event_id, moment),
  constraint squares_event_moments_observation_complete check (
    (observed_at is null and observed_col_score is null and observed_row_score is null)
    or (observed_at is not null and observed_col_score is not null and observed_row_score is not null)
  ),
  constraint squares_event_moments_grade_complete check (
    (graded_at is null and col_score is null and row_score is null and winning_cell is null and score_source is null)
    or (graded_at is not null and col_score is not null and row_score is not null and winning_cell is not null and score_source is not null)
  )
);

create table public.squares_boards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.squares_events(id) on delete cascade,
  venue_id text not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint squares_boards_event_venue_unique unique (event_id, venue_id)
);

create index squares_boards_venue_id_idx on public.squares_boards (venue_id);

create table public.squares_claims (
  board_id uuid not null references public.squares_boards(id) on delete cascade,
  cell smallint not null check (cell between 0 and 99),
  user_id uuid not null references public.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (board_id, cell)
);

create index squares_claims_board_user_idx on public.squares_claims (board_id, user_id);
create index squares_claims_user_id_idx on public.squares_claims (user_id);

create table public.squares_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.squares_events(id) on delete cascade,
  board_id uuid not null references public.squares_boards(id) on delete cascade,
  moment text not null check (moment in ('q1', 'half', 'q3', 'final')),
  grade_no integer not null check (grade_no >= 1),
  winning_cell smallint not null check (winning_cell between 0 and 99),
  -- Null = nobody held the winning square (Andrew: nobody wins that moment).
  user_id uuid references public.users(id) on delete cascade,
  points integer not null default 0 check (points between 0 and 1000),
  -- seasonal_points_credits source_key ('squares', board:moment:grade_no).
  credit_key text check (credit_key is null or char_length(credit_key) between 1 and 200),
  credited_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint squares_results_board_moment_grade_unique unique (board_id, moment, grade_no),
  constraint squares_results_winner_complete check (
    (user_id is null and credit_key is null and points = 0 and credited_at is null)
    or (user_id is not null and credit_key is not null and points > 0)
  )
);

create index squares_results_event_moment_idx on public.squares_results (event_id, moment, grade_no);
create index squares_results_user_id_idx on public.squares_results (user_id);
-- The settlement's "still to pay" read.
create index squares_results_unpaid_idx on public.squares_results (event_id)
  where user_id is not null and credited_at is null and voided_at is null;

create table public.squares_admin_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.squares_events(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 60),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  actor text not null check (char_length(actor) between 1 and 100),
  created_at timestamptz not null default now()
);

create index squares_admin_log_event_idx on public.squares_admin_log (event_id, created_at desc);

alter table public.squares_events enable row level security;
alter table public.squares_events force row level security;
alter table public.squares_event_moments enable row level security;
alter table public.squares_event_moments force row level security;
alter table public.squares_boards enable row level security;
alter table public.squares_boards force row level security;
alter table public.squares_claims enable row level security;
alter table public.squares_claims force row level security;
alter table public.squares_results enable row level security;
alter table public.squares_results force row level security;
alter table public.squares_admin_log enable row level security;
alter table public.squares_admin_log force row level security;

revoke all on table public.squares_events from anon, authenticated;
revoke all on table public.squares_event_moments from anon, authenticated;
revoke all on table public.squares_boards from anon, authenticated;
revoke all on table public.squares_claims from anon, authenticated;
revoke all on table public.squares_results from anon, authenticated;
revoke all on table public.squares_admin_log from anon, authenticated;

-- Server only (lib/squares*.ts via lib/supabaseAdmin.ts). Claims are written only by squares_claim,
-- grades only by squares_grade_moment / squares_void_moment; the plain grants are for reads, the
-- event's own bookkeeping columns and marking a result paid.
grant select, insert, update, delete on table public.squares_events to service_role;
grant select, insert, update, delete on table public.squares_event_moments to service_role;
grant select, insert, update, delete on table public.squares_boards to service_role;
grant select, insert, update, delete on table public.squares_claims to service_role;
grant select, insert, update, delete on table public.squares_results to service_role;
grant select, insert, update, delete on table public.squares_admin_log to service_role;

-- ── 2. squares_claim ───────────────────────────────────────────────────────────────────────
-- The board is the one for the player's users row (a venue profile); p_venue_id must match it, so
-- a claim can only ever land on the player's own venue's board. Outcomes: claimed, released,
-- already_yours, taken, cap_reached, not_yours, locked, no_event, user_not_found, wrong_venue.
-- Always returns the player's held cells (empty for the refusals before the board is known).

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

-- ── 3. squares_draw ────────────────────────────────────────────────────────────────────────
-- The digits come from the server (lib/squaresSettlement.ts, node:crypto). Writes only when the
-- event is not yet drawn and the DATABASE clock has reached lock_at, so a fast app clock can't open
-- the numbers while claims are still accepted. Always returns what is stored.

create or replace function public.squares_draw(p_event_id uuid, p_col_digits smallint[], p_row_digits smallint[])
returns table (
  draw_happened boolean,
  draw_col_digits smallint[],
  draw_row_digits smallint[],
  draw_drawn_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if not public.squares_is_digit_permutation(p_col_digits) or not public.squares_is_digit_permutation(p_row_digits) then
    raise exception 'squares_draw: digits must each be a permutation of 0–9' using errcode = '22023';
  end if;

  update squares_events e
  set col_digits = p_col_digits, row_digits = p_row_digits, drawn_at = now(), updated_at = now()
  where e.id = p_event_id and e.drawn_at is null and e.archived_at is null and now() >= e.lock_at;
  get diagnostics v_rows = row_count;

  return query
  select v_rows > 0, e.col_digits, e.row_digits, e.drawn_at from squares_events e where e.id = p_event_id;
end;
$$;

revoke all on function public.squares_draw(uuid, smallint[], smallint[]) from public, anon, authenticated;
grant execute on function public.squares_draw(uuid, smallint[], smallint[]) to service_role;

-- ── 4. squares_grade_moment ────────────────────────────────────────────────────────────────
-- Grades one moment for EVERY board of the event in one INSERT … SELECT (a board whose winning
-- cell is empty gets a no-winner row). p_points comes from SQUARES_MOMENT_POINTS
-- (lib/seasonalPoints.ts, the one home of the scale). p_grade_no must equal the moment's current
-- grade_no, so a stale observation can't grade after a void. Paying is a separate step
-- (creditSeasonalPoints), retried from the unpaid rows until done.
-- Outcomes: graded, already_graded, stale, not_drawn, no_event.

create or replace function public.squares_grade_moment(
  p_event_id uuid,
  p_moment text,
  p_col_score integer,
  p_row_score integer,
  p_points integer,
  p_source text,
  p_grade_no integer
)
returns table (
  grade_outcome text,
  grade_winning_cell smallint,
  grade_boards integer,
  grade_winners integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event squares_events%rowtype;
  v_moment squares_event_moments%rowtype;
  v_col integer;
  v_row integer;
  v_cell smallint;
begin
  if p_moment is null or p_moment not in ('q1', 'half', 'q3', 'final') then
    raise exception 'squares_grade_moment: unknown moment %', p_moment using errcode = '22023';
  end if;
  if p_col_score is null or p_row_score is null or p_col_score < 0 or p_row_score < 0 then
    raise exception 'squares_grade_moment: scores must be whole numbers ≥ 0' using errcode = '22023';
  end if;
  if p_points is null or p_points < 1 or p_points > 1000 then
    raise exception 'squares_grade_moment: points must be 1–1000' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('feed', 'admin') then
    raise exception 'squares_grade_moment: source must be feed or admin' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('squares-event:' || p_event_id::text, 0));

  select * into v_event from squares_events e where e.id = p_event_id;
  if not found then
    grade_outcome := 'no_event';
    return next;
    return;
  end if;
  if v_event.drawn_at is null then
    grade_outcome := 'not_drawn';
    return next;
    return;
  end if;

  select * into v_moment from squares_event_moments m
  where m.event_id = p_event_id and m.moment = p_moment
  for update;
  if not found then
    raise exception 'squares_grade_moment: event % has no % moment row', p_event_id, p_moment;
  end if;
  if v_moment.graded_at is not null then
    grade_outcome := 'already_graded';
    grade_winning_cell := v_moment.winning_cell;
    return next;
    return;
  end if;
  if p_grade_no is distinct from v_moment.grade_no then
    grade_outcome := 'stale';
    return next;
    return;
  end if;

  v_col := array_position(v_event.col_digits, (p_col_score % 10)::smallint) - 1;
  v_row := array_position(v_event.row_digits, (p_row_score % 10)::smallint) - 1;
  v_cell := (v_row * 10 + v_col)::smallint;

  insert into squares_results (event_id, board_id, moment, grade_no, winning_cell, user_id, points, credit_key)
  select
    p_event_id,
    b.id,
    p_moment,
    v_moment.grade_no,
    v_cell,
    c.user_id,
    case when c.user_id is null then 0 else p_points end,
    case when c.user_id is null then null else b.id::text || ':' || p_moment || ':' || v_moment.grade_no end
  from squares_boards b
  left join squares_claims c on c.board_id = b.id and c.cell = v_cell
  where b.event_id = p_event_id
  on conflict (board_id, moment, grade_no) do nothing;

  update squares_event_moments m
  set col_score = p_col_score,
      row_score = p_row_score,
      winning_cell = v_cell,
      score_source = p_source,
      graded_at = now(),
      updated_at = now()
  where m.event_id = p_event_id and m.moment = p_moment;

  grade_outcome := 'graded';
  grade_winning_cell := v_cell;
  select count(*)::integer, count(r.user_id)::integer into grade_boards, grade_winners
  from squares_results r
  where r.event_id = p_event_id and r.moment = p_moment and r.grade_no = v_moment.grade_no;
  return next;
end;
$$;

revoke all on function public.squares_grade_moment(uuid, text, integer, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.squares_grade_moment(uuid, text, integer, integer, integer, text, integer) to service_role;

-- ── 5. squares_void_moment ─────────────────────────────────────────────────────────────────
-- Admin fix-up (lib/squaresAdmin.ts). In ONE transaction, under the event lock grading also takes:
-- reverse every paid credit of the moment's current grade and burn every unpaid one (so a late
-- payment can't land), mark those results void, bump grade_no, and either return the moment to
-- pending (the settlement re-reads the feed) or — when p_col_score/p_row_score are given — grade
-- it at once with those scores (source 'admin'). Writes a squares_admin_log row.
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

  update squares_events e set completed_at = null, updated_at = now() where e.id = p_event_id;

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
