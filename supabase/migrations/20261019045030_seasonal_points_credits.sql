-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) Phase 1: the shared venue-points credit.
--
-- Super Bowl Squares and March Madness both pay venue points (users.points, the venue-scoped
-- profile) when a moment or game is settled. Settlement runs from crons that retry, so a credit must
-- pay ONCE no matter how often it is sent. One ledger row per (source, source_key) is that guarantee,
-- and the users.points bump happens in the same statement as the ledger insert.
--
-- Three parts:
--   1. public.seasonal_points_credits — the ledger. Reached only through the function below.
--   2. public.credit_seasonal_points(p_source, p_credits) — set-based: one call credits a whole
--      settlement batch (≤ 500), so Phase 2/7 never loop one RPC per winner. Service role only.
--   3. game_sessions_type_valid gains 'squares' and 'bracket' (play-session analytics,
--      lib/analytics.ts startGameSession — Category Blitz was silently rejected for months by
--      exactly this constraint, see 20260709200000).
--
-- Account deletion: user_id is ON DELETE CASCADE, so delete_player_account (20261008044524)
-- removes a player's ledger rows with their users rows and needs no change (Andrew: REMOVE, don't
-- anonymise). A cascaded row frees its key, but a retried settlement then names a users row that no
-- longer exists and gets 'user_not_found' — nothing is paid to anyone else.

-- ── 1. Ledger ───────────────────────────────────────────────────────────────────────────────

create table public.seasonal_points_credits (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('squares', 'bracket')),
  source_key text not null check (char_length(source_key) between 1 and 200),
  user_id uuid not null references public.users(id) on delete cascade,
  points integer not null check (points between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint seasonal_points_credits_source_key_unique unique (source, source_key)
);

-- The cascade from users, and "what has this player been paid".
create index seasonal_points_credits_user_id_idx on public.seasonal_points_credits (user_id);

alter table public.seasonal_points_credits enable row level security;
alter table public.seasonal_points_credits force row level security;

revoke all on table public.seasonal_points_credits from anon, authenticated;
-- Server reads (admin panels, Results) go through service_role; writes only via the function.
grant select, insert, update, delete on table public.seasonal_points_credits to service_role;

-- ── 2. credit_seasonal_points ───────────────────────────────────────────────────────────────
-- p_credits: a JSON array of {"user_id": uuid, "source_key": text, "points": integer 1–1000}.
-- Returns one row per input, in input order:
--   outcome 'credited'         — ledger row written and users.points raised, in this call.
--   outcome 'already_credited' — the key was paid before (existing_user_id / existing_points say
--                                to whom, when visible); nothing changed. A caller that sees a
--                                different user here has a settlement bug to log, not to "fix".
--   outcome 'user_not_found'   — no users row with that id; nothing written.
-- Any malformed entry, a duplicate key inside one batch, an unknown source or > 500 entries raises
-- and changes nothing.

create or replace function public.credit_seasonal_points(p_source text, p_credits jsonb)
returns table (
  credit_user_id uuid,
  credit_source_key text,
  credit_points integer,
  outcome text,
  existing_user_id uuid,
  existing_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_source is null or p_source not in ('squares', 'bracket') then
    raise exception 'credit_seasonal_points: unknown source %', p_source using errcode = '22023';
  end if;
  if p_credits is null or jsonb_typeof(p_credits) <> 'array' then
    raise exception 'credit_seasonal_points: p_credits must be a JSON array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_credits);
  if v_count = 0 then
    return;
  end if;
  if v_count > 500 then
    raise exception 'credit_seasonal_points: % credits in one call (max 500)', v_count using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_credits) as e(item)
    where jsonb_typeof(e.item) <> 'object'
       or coalesce(e.item ->> 'user_id', '') = ''
       or coalesce(e.item ->> 'source_key', '') = ''
       or char_length(e.item ->> 'source_key') > 200
       or jsonb_typeof(e.item -> 'points') is distinct from 'number'
  ) then
    raise exception 'credit_seasonal_points: every credit needs user_id, source_key (≤ 200 chars) and numeric points'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_credits) as e(item)
    where (e.item ->> 'points')::numeric <> trunc((e.item ->> 'points')::numeric)
       or (e.item ->> 'points')::numeric < 1
       or (e.item ->> 'points')::numeric > 1000
  ) then
    raise exception 'credit_seasonal_points: points must be a whole number from 1 to 1000' using errcode = '22023';
  end if;

  if (select count(distinct e.item ->> 'source_key') from jsonb_array_elements(p_credits) as e(item)) <> v_count then
    raise exception 'credit_seasonal_points: duplicate source_key in one batch' using errcode = '22023';
  end if;

  -- Lock the players' rows in id order, so two overlapping batches can't deadlock and a concurrent
  -- account deletion waits for (or wins against) the whole credit.
  perform 1
  from users u
  where u.id in (select (e.item ->> 'user_id')::uuid from jsonb_array_elements(p_credits) as e(item))
  order by u.id
  for update;

  -- One statement: the ledger insert, the points bump (only for rows this call inserted) and the
  -- per-input answer. A data-modifying CTE runs exactly once even though nothing reads `bumped`.
  -- The final SELECT's snapshot predates the insert, so `existing` sees only rows paid earlier.
  return query
  with input as (
    select
      (e.item ->> 'user_id')::uuid as in_user_id,
      e.item ->> 'source_key' as in_source_key,
      (e.item ->> 'points')::integer as in_points,
      e.ord
    from jsonb_array_elements(p_credits) with ordinality as e(item, ord)
  ),
  inserted as (
    insert into seasonal_points_credits as c (source, source_key, user_id, points)
    select p_source, i.in_source_key, i.in_user_id, i.in_points
    from input i
    where exists (select 1 from users u where u.id = i.in_user_id)
    on conflict (source, source_key) do nothing
    returning c.source_key as ins_key, c.user_id as ins_user_id, c.points as ins_points
  ),
  bumped as (
    update users u
    set points = coalesce(u.points, 0) + t.total
    from (
      select ins_user_id, sum(ins_points)::integer as total
      from inserted
      group by ins_user_id
    ) t
    where u.id = t.ins_user_id
    returning u.id
  )
  select
    i.in_user_id,
    i.in_source_key,
    i.in_points,
    case
      when ins.ins_key is not null then 'credited'
      when not exists (select 1 from users u where u.id = i.in_user_id) then 'user_not_found'
      else 'already_credited'
    end,
    ex.user_id,
    ex.points
  from input i
  left join inserted ins on ins.ins_key = i.in_source_key
  left join seasonal_points_credits ex
    on ins.ins_key is null and ex.source = p_source and ex.source_key = i.in_source_key
  order by i.ord;
end;
$$;

-- Server only (lib/seasonalPointsCredit.ts). Players never call it.
revoke all on function public.credit_seasonal_points(text, jsonb) from public, anon, authenticated;
grant execute on function public.credit_seasonal_points(text, jsonb) to service_role;

-- ── 3. Play-session analytics accept the two new games ──────────────────────────────────────
-- Same list as 20260715000200_add_nfl_pickem_game_types.sql, plus 'squares' and 'bracket'.

alter table public.game_sessions drop constraint if exists game_sessions_type_valid;
alter table public.game_sessions
  add constraint game_sessions_type_valid
  check (game_type in (
    'trivia',
    'bingo',
    'pickem',
    'fantasy',
    'speed-trivia',
    'live-trivia',
    'category-blitz',
    'nfl-pickem',
    'squares',
    'bracket'
  ));
