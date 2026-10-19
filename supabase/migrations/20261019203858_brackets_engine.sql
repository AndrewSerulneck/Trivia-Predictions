-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) Phase 7: the March Madness bracket engine.
--
-- One TOURNAMENT row per real tournament (men's / women's, per season) holds its games (the feed's
-- 67–79 records) and the winning seat of each of the 63 bracket slots. Players fill ENTRIES against
-- it, of two kinds: 'main' (63 picks, locks at the first Round-of-64 tip) and 'second' (the 15 picks
-- from the Sweet 16 on, opens when the Round of 32 is over, locks at the first Sweet 16 tip). That
-- is the plan's four brackets: 2 tournaments × 2 kinds. One entry per venue profile (users row) per
-- tournament per kind (Andrew, decision 5).
--
-- Slot / seat numbering is lib/brackets/tree.ts's (the ONE definition; this file mirrors it):
--   slots 0–62 round by round (round r starts at 64 − 2^(7−r)); seats 0–63 = the round-1 positions
--   (round-1 location k: home seat 2(k−1), away 2(k−1)+1); slot s of round r, location k covers seats
--   (k−1)·2^r … k·2^r − 1. A pick is the seat whose team wins the slot, so picks are ONE smallint[63]
--   per entry (plan §4: ~20k entry rows at 100 venues instead of 1.3M pick rows) and grading is
--   picks[s] = winner_seats[s]. Postgres arrays are 1-based: slot s is element s + 1.
--
-- Venue points (decision 11: bracket points ÷ 10) are paid per entry per ROUND once the whole round
-- is decided, by lib/bracketsSync.ts through creditSeasonalPoints (the only caller of
-- credit_seasonal_points), key '<entry id>:r<round>:<grade_no>' — at most 6 ledger rows per entry.
-- bracket_rounds.grade_no is bumped when an admin changes a result in a round that was already
-- complete; bracket_record_results reverses (or burns) that round's credits first, in the same
-- transaction, so a re-grade pays under new keys and the old ones stay spent.
--
-- Parts:
--   1. Helpers: bracket_slot_round, bracket_picks_problem, bracket_round_correct, bracket_score_of.
--   2. Tables: bracket_tournaments, bracket_games, bracket_rounds, bracket_entries, bracket_admin_log.
--      RLS on + forced, service_role grants only (every read goes through an API route).
--   3. bracket_save_entry()     — the only entry writer: open / lock (database clock, minus a
--                                  rehearsal's clock offset), own venue, rehearsal = hidden venues
--                                  only, picks re-checked.
--   4. bracket_record_results() — the only writer of winner_seats and entry scores: set-based
--                                  grading of every entry; a changed decided result needs
--                                  p_allow_change (admin) and reverses the affected rounds' credits.
--
-- Account deletion: bracket_entries.user_id is ON DELETE CASCADE, so delete_player_account
-- (20261008044524) needs no change (Andrew: REMOVE, don't anonymise). Its ledger rows cascade too.

-- ── 1. Helpers ─────────────────────────────────────────────────────────────────────────────

create or replace function public.bracket_slot_round(p_slot integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_slot >= 62 then 6
    when p_slot >= 60 then 5
    when p_slot >= 56 then 4
    when p_slot >= 48 then 3
    when p_slot >= 32 then 2
    else 1
  end;
$$;

-- Why p_picks is not a storable bracket of p_kind, or null when it is (drafts with gaps are fine).
-- Mirrors bracketPicksProblem in lib/brackets/picks.ts.
create or replace function public.bracket_picks_problem(p_picks smallint[], p_kind text, p_winner_seats smallint[])
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_base integer := case when p_kind = 'second' then 3 else 1 end;
  v_slot integer;
  v_round integer;
  v_location integer;
  v_width integer;
  v_pick integer;
  v_c0 integer;
  v_c1 integer;
  v_from smallint[];
begin
  if p_kind is null or p_kind not in ('main', 'second') then
    return 'kind must be main or second';
  end if;
  if p_picks is null or cardinality(p_picks) <> 63 or array_lower(p_picks, 1) <> 1 then
    return 'picks must be an array of 63';
  end if;
  for v_slot in 0..62 loop
    v_pick := p_picks[v_slot + 1];
    continue when v_pick is null;
    v_round := bracket_slot_round(v_slot);
    if v_round < v_base then
      return format('slot %s is not part of this bracket', v_slot);
    end if;
    v_width := 1 << v_round;
    v_location := v_slot - (64 - (1 << (7 - v_round))) + 1;
    if v_pick < (v_location - 1) * v_width or v_pick > v_location * v_width - 1 then
      return format('slot %s: seat %s can''t play there', v_slot, v_pick);
    end if;
    if v_round > 1 then
      v_c0 := (64 - (1 << (8 - v_round))) + 2 * v_location - 2;
      v_c1 := v_c0 + 1;
      v_from := case when v_round = v_base then p_winner_seats else p_picks end;
      if v_pick is distinct from v_from[v_c0 + 1] and v_pick is distinct from v_from[v_c1 + 1] then
        return format('slot %s: seat %s doesn''t follow from the picks before it', v_slot, v_pick);
      end if;
    end if;
  end loop;
  return null;
end;
$$;

-- Correct picks per round (element 1 = round 1). Mirrors bracketRoundCorrect in lib/brackets/scoring.ts.
create or replace function public.bracket_round_correct(p_picks smallint[], p_kind text, p_winner_seats smallint[])
returns smallint[]
language sql
immutable
set search_path = public
as $$
  select array_agg(coalesce(c.n, 0)::smallint order by r.r)
  from generate_series(1, 6) as r(r)
  left join (
    select public.bracket_slot_round(s) as rr, count(*) as n
    from generate_series(0, 62) as s
    where p_picks[s + 1] is not null
      and p_picks[s + 1] = p_winner_seats[s + 1]
      and (p_kind = 'main' or public.bracket_slot_round(s) >= 3)
    group by 1
  ) c on c.rr = r.r;
$$;

-- Bracket points from per-round counts: BRACKET_ROUND_POINTS (lib/seasonalPoints.ts) = 10 · 2^(r−1).
create or replace function public.bracket_score_of(p_round_correct smallint[])
returns integer
language sql
immutable
set search_path = public
as $$
  select coalesce(sum(p_round_correct[r] * 10 * (1 << (r - 1))), 0)::integer
  from generate_series(1, 6) as r;
$$;

revoke all on function public.bracket_slot_round(integer) from public, anon, authenticated;
revoke all on function public.bracket_picks_problem(smallint[], text, smallint[]) from public, anon, authenticated;
revoke all on function public.bracket_round_correct(smallint[], text, smallint[]) from public, anon, authenticated;
revoke all on function public.bracket_score_of(smallint[]) from public, anon, authenticated;
grant execute on function public.bracket_slot_round(integer) to service_role;
grant execute on function public.bracket_picks_problem(smallint[], text, smallint[]) to service_role;
grant execute on function public.bracket_round_correct(smallint[], text, smallint[]) to service_role;
grant execute on function public.bracket_score_of(smallint[]) to service_role;

-- Four names (null element = "Region n"), each 1–40 characters. A function because a CHECK
-- constraint can't hold a subquery.
create or replace function public.bracket_region_names_valid(p_names text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_names is null
    or (
      cardinality(p_names) = 4
      and array_lower(p_names, 1) = 1
      and not exists (select 1 from unnest(p_names) as n where n is not null and char_length(n) not between 1 and 40)
    );
$$;

revoke all on function public.bracket_region_names_valid(text[]) from public, anon, authenticated;
grant execute on function public.bracket_region_names_valid(text[]) to service_role;

-- ── 2. Tables ──────────────────────────────────────────────────────────────────────────────

create table public.bracket_tournaments (
  id uuid primary key default gen_random_uuid(),
  gender text not null check (gender in ('men', 'women')),
  -- The feed's season = the year the season STARTED: the March 2027 tournament is 2026.
  season integer not null check (season between 2000 and 2100),
  -- 'live' = the real tournament at every venue; 'rehearsal' = an admin replay, playable only at
  -- hidden venues (bracket_save_entry's 'rehearsal_only'), never auto-created.
  purpose text not null default 'live' check (purpose in ('live', 'rehearsal')),
  -- Rehearsals replay a finished season: the tournament's clock = now() − this. Always 0 when live.
  clock_offset_seconds integer not null default 0,
  -- Region names typed by an admin on Selection Sunday (plan §8); null element = "Region n".
  region_names text[],
  -- The winning seat of each slot (null = undecided). Written only by bracket_record_results.
  winner_seats smallint[] not null default array_fill(null::smallint, array[63]),
  -- The championship game's total points (the tiebreaker's answer), once decided.
  championship_total integer check (championship_total is null or championship_total between 0 and 400),
  -- Main locks at the first Round-of-64 tip; second chance at the first Sweet 16 tip. 'auto' = the
  -- sync keeps it equal to the feed's earliest tip until it passes; 'admin' = moved by hand.
  main_lock_at timestamptz,
  main_lock_set_by text not null default 'auto' check (main_lock_set_by in ('auto', 'admin')),
  second_lock_at timestamptz,
  second_lock_set_by text not null default 'auto' check (second_lock_set_by in ('auto', 'admin')),
  -- Sync pace (lib/bracketsSync.ts): when the feed was last read, and when to read it next
  -- (real time). Null next = never again (championship decided).
  feed_checked_at timestamptz,
  next_sync_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_by text not null default 'auto' check (char_length(created_by) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bracket_tournaments_clock_offset_valid check (
    clock_offset_seconds >= 0 and (purpose = 'rehearsal' or clock_offset_seconds = 0)
  ),
  constraint bracket_tournaments_winner_seats_shape check (
    cardinality(winner_seats) = 63 and array_lower(winner_seats, 1) = 1
  ),
  constraint bracket_tournaments_region_names_shape check (public.bracket_region_names_valid(region_names))
);

-- One current tournament per gender, season and purpose.
create unique index bracket_tournaments_one_current
  on public.bracket_tournaments (gender, season, purpose) where archived_at is null;

create table public.bracket_games (
  tournament_id uuid not null references public.bracket_tournaments(id) on delete cascade,
  -- 0 = opening round, 1–6 = the bracket. (round, location) is the feed's (round, bracket_location).
  round smallint not null check (round between 0 and 6),
  location smallint not null check (location between 1 and 32),
  slot smallint,
  feed_game_id bigint check (feed_game_id is null or feed_game_id > 0),
  tip_at timestamptz,
  status_state text check (status_state is null or char_length(status_state) <= 40),
  status_detail text check (status_detail is null or char_length(status_detail) <= 80),
  -- Team snapshots {id, name, fullName, college, abbreviation, seed}; null = not known yet (TBD).
  home_team jsonb check (home_team is null or jsonb_typeof(home_team) = 'object'),
  away_team jsonb check (away_team is null or jsonb_typeof(away_team) = 'object'),
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  winner_side text check (winner_side is null or winner_side in ('home', 'away')),
  result_source text check (result_source is null or result_source in ('feed', 'admin')),
  teams_set_by text not null default 'feed' check (teams_set_by in ('feed', 'admin')),
  -- Opening round only: the round-1 seat its winner fills.
  feeds_seat smallint check (feeds_seat is null or feeds_seat between 0 and 63),
  feeds_seat_set_by text check (feeds_seat_set_by is null or feeds_seat_set_by in ('auto', 'admin')),
  -- The feed disagreed with the stored result (report-only; an admin decides).
  mismatch_note text check (mismatch_note is null or char_length(mismatch_note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, round, location),
  constraint bracket_games_slot_matches check (
    (round = 0 and slot is null)
    or (
      round between 1 and 6
      and location <= (1 << (6 - round))
      and slot = (64 - (1 << (7 - round))) + location - 1
    )
  ),
  constraint bracket_games_result_complete check ((winner_side is null) = (result_source is null)),
  constraint bracket_games_feeds_seat_opening_only check (
    round = 0 or (feeds_seat is null and feeds_seat_set_by is null)
  )
);

create table public.bracket_rounds (
  tournament_id uuid not null references public.bracket_tournaments(id) on delete cascade,
  round smallint not null check (round between 1 and 6),
  -- Bumped when an admin changes a result in this round after it was complete; credit keys carry it.
  grade_no integer not null default 1 check (grade_no >= 1),
  -- Every entry's credit for this round has been sent at this grade_no (lib/bracketsSync.ts).
  paid_grade_no integer check (paid_grade_no is null or paid_grade_no >= 1),
  paid_at timestamptz,
  primary key (tournament_id, round)
);

-- Six rounds per tournament, created with it.
create or replace function public.bracket_tournaments_create_rounds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into bracket_rounds (tournament_id, round)
  select new.id, r from generate_series(1, 6) as r
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.bracket_tournaments_create_rounds() from public, anon, authenticated;

create trigger bracket_tournaments_create_rounds
  after insert on public.bracket_tournaments
  for each row execute function public.bracket_tournaments_create_rounds();

create table public.bracket_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.bracket_tournaments(id) on delete cascade,
  kind text not null check (kind in ('main', 'second')),
  -- The venue profile (users row). venue_id is that row's venue, stored for the standings read.
  user_id uuid not null references public.users(id) on delete cascade,
  venue_id text not null references public.venues(id) on delete cascade,
  picks smallint[] not null default array_fill(null::smallint, array[63]),
  pick_count smallint not null default 0 check (pick_count between 0 and 63),
  -- Championship game total points (BRACKET_TIEBREAKER_MAX in lib/brackets/picks.ts).
  tiebreaker integer check (tiebreaker is null or tiebreaker between 0 and 400),
  -- Written only by bracket_record_results (and zeroed by a save, which happens before any of the
  -- kind's games are decided).
  round_correct smallint[] not null default array[0, 0, 0, 0, 0, 0]::smallint[],
  score integer not null default 0 check (score between 0 and 1920),
  -- Last save; standings' last tiebreak (earliest first).
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bracket_entries_one_per_player unique (tournament_id, kind, user_id),
  constraint bracket_entries_picks_shape check (cardinality(picks) = 63 and array_lower(picks, 1) = 1),
  constraint bracket_entries_round_correct_shape check (
    cardinality(round_correct) = 6 and array_lower(round_correct, 1) = 1
  )
);

create index bracket_entries_standings_idx on public.bracket_entries (tournament_id, kind, venue_id, score desc);
create index bracket_entries_user_id_idx on public.bracket_entries (user_id);
create index bracket_entries_venue_id_idx on public.bracket_entries (venue_id);

create table public.bracket_admin_log (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.bracket_tournaments(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 60),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  actor text not null check (char_length(actor) between 1 and 100),
  created_at timestamptz not null default now()
);

create index bracket_admin_log_tournament_idx on public.bracket_admin_log (tournament_id, created_at desc);

alter table public.bracket_tournaments enable row level security;
alter table public.bracket_tournaments force row level security;
alter table public.bracket_games enable row level security;
alter table public.bracket_games force row level security;
alter table public.bracket_rounds enable row level security;
alter table public.bracket_rounds force row level security;
alter table public.bracket_entries enable row level security;
alter table public.bracket_entries force row level security;
alter table public.bracket_admin_log enable row level security;
alter table public.bracket_admin_log force row level security;

revoke all on table public.bracket_tournaments from anon, authenticated;
revoke all on table public.bracket_games from anon, authenticated;
revoke all on table public.bracket_rounds from anon, authenticated;
revoke all on table public.bracket_entries from anon, authenticated;
revoke all on table public.bracket_admin_log from anon, authenticated;

-- Server only (lib/brackets*.ts via lib/supabaseAdmin.ts). Entries are written only by
-- bracket_save_entry, winner seats and scores only by bracket_record_results; the plain grants are
-- for reads, the sync's game rows and bookkeeping, and marking a round paid.
grant select, insert, update, delete on table public.bracket_tournaments to service_role;
grant select, insert, update, delete on table public.bracket_games to service_role;
grant select, insert, update, delete on table public.bracket_rounds to service_role;
grant select, insert, update, delete on table public.bracket_entries to service_role;
grant select, insert, update, delete on table public.bracket_admin_log to service_role;

-- ── 3. bracket_save_entry ──────────────────────────────────────────────────────────────────
-- Saves (creates or replaces) the player's entry. Outcomes: saved, not_open, locked, no_tournament,
-- user_not_found, wrong_venue, rehearsal_only, invalid_picks (save_problem says why),
-- invalid_tiebreaker. The lock is the DATABASE clock (minus a rehearsal's offset), never the app's.

create or replace function public.bracket_save_entry(
  p_tournament_id uuid,
  p_kind text,
  p_user_id uuid,
  p_venue_id text,
  p_picks smallint[],
  p_tiebreaker integer
)
returns table (
  save_outcome text,
  save_entry_id uuid,
  save_saved_at timestamptz,
  save_problem text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t bracket_tournaments%rowtype;
  v_venue_id text;
  v_hidden boolean;
  v_now timestamptz;
  v_lock timestamptz;
  v_ready boolean;
  v_problem text;
  v_count integer;
begin
  if p_kind is null or p_kind not in ('main', 'second') then
    raise exception 'bracket_save_entry: kind must be main or second' using errcode = '22023';
  end if;

  -- FOR SHARE: an admin lock move (UPDATE) waits for in-flight saves and vice versa.
  select * into v_t from bracket_tournaments t where t.id = p_tournament_id for share;
  if not found or v_t.archived_at is not null then
    save_outcome := 'no_tournament';
    return next;
    return;
  end if;

  select u.venue_id into v_venue_id from users u where u.id = p_user_id;
  if not found then
    save_outcome := 'user_not_found';
    return next;
    return;
  end if;
  if p_venue_id is distinct from v_venue_id then
    save_outcome := 'wrong_venue';
    return next;
    return;
  end if;

  -- A rehearsal never touches a real venue. Fails closed: an unreadable venue counts as visible.
  if v_t.purpose = 'rehearsal' then
    select v.hidden into v_hidden from venues v where v.id = v_venue_id;
    if v_hidden is not true then
      save_outcome := 'rehearsal_only';
      return next;
      return;
    end if;
  end if;

  v_now := now() - make_interval(secs => v_t.clock_offset_seconds);
  if p_kind = 'main' then
    v_lock := v_t.main_lock_at;
    select count(*) = 32 into v_ready from bracket_games g where g.tournament_id = p_tournament_id and g.round = 1;
  else
    v_lock := v_t.second_lock_at;
    v_ready := not exists (select 1 from generate_series(33, 48) as i where v_t.winner_seats[i] is null);
  end if;
  if v_t.winner_seats[63] is not null or (v_lock is not null and v_now >= v_lock) then
    save_outcome := 'locked';
    return next;
    return;
  end if;
  if not v_ready or v_lock is null then
    save_outcome := 'not_open';
    return next;
    return;
  end if;

  if p_tiebreaker is not null and (p_tiebreaker < 0 or p_tiebreaker > 400) then
    save_outcome := 'invalid_tiebreaker';
    return next;
    return;
  end if;
  v_problem := bracket_picks_problem(p_picks, p_kind, v_t.winner_seats);
  if v_problem is not null then
    save_outcome := 'invalid_picks';
    save_problem := v_problem;
    return next;
    return;
  end if;

  select count(*) into v_count from unnest(p_picks) as p where p is not null;

  insert into bracket_entries as e (
    tournament_id, kind, user_id, venue_id, picks, pick_count, tiebreaker,
    round_correct, score, submitted_at, updated_at
  )
  values (
    p_tournament_id, p_kind, p_user_id, v_venue_id, p_picks, v_count, p_tiebreaker,
    bracket_round_correct(p_picks, p_kind, v_t.winner_seats),
    bracket_score_of(bracket_round_correct(p_picks, p_kind, v_t.winner_seats)),
    now(), now()
  )
  on conflict (tournament_id, kind, user_id) do update
    set picks = excluded.picks,
        pick_count = excluded.pick_count,
        tiebreaker = excluded.tiebreaker,
        round_correct = excluded.round_correct,
        score = excluded.score,
        submitted_at = excluded.submitted_at,
        updated_at = excluded.updated_at
  returning e.id, e.submitted_at into save_entry_id, save_saved_at;

  save_outcome := 'saved';
  return next;
end;
$$;

revoke all on function public.bracket_save_entry(uuid, text, uuid, text, smallint[], integer) from public, anon, authenticated;
grant execute on function public.bracket_save_entry(uuid, text, uuid, text, smallint[], integer) to service_role;

-- ── 4. bracket_record_results ──────────────────────────────────────────────────────────────
-- Writes the tournament's winner seats + championship total and re-grades EVERY entry in one
-- statement. p_winner_seats must be a consistent result set (each decided slot's seat is one of its
-- two feeding slots' winners). Changing or clearing an already-decided slot needs p_allow_change
-- (admin override; the sync only ever fills undecided slots) and then, for every round that was
-- complete before the change, spends that round's key at its current grade_no for every entry that
-- scores the round (reverses a paid credit, burns an unpaid one) and bumps grade_no — all in this
-- transaction. reversed_credits counts those keys. Returns what it did.

create or replace function public.bracket_record_results(
  p_tournament_id uuid,
  p_winner_seats smallint[],
  p_championship_total integer,
  p_allow_change boolean,
  p_reason text,
  p_actor text
)
returns table (
  changed_slots integer,
  regraded_rounds integer[],
  reversed_credits integer,
  graded_entries integer
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
  return next;
end;
$$;

revoke all on function public.bracket_record_results(uuid, smallint[], integer, boolean, text, text) from public, anon, authenticated;
grant execute on function public.bracket_record_results(uuid, smallint[], integer, boolean, text, text) to service_role;
