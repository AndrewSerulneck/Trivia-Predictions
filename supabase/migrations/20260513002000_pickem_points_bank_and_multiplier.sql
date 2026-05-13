alter table if exists pickem_picks
  add column if not exists home_team_id text,
  add column if not exists away_team_id text,
  add column if not exists selected_team_id text,
  add column if not exists winning_team_id text;

create index if not exists idx_pickem_picks_user_venue_starts
  on pickem_picks(user_id, venue_id, starts_at);

create table if not exists pickem_daily_snapshots (
  user_id uuid not null references users(id) on delete cascade,
  venue_id text not null references venues(id) on delete restrict,
  local_date date not null,
  total_picks integer not null default 0,
  settled_picks integer not null default 0,
  pending_picks integer not null default 0,
  correct_picks integer not null default 0,
  incorrect_picks integer not null default 0,
  unclaimed_correct_picks integer not null default 0,
  pending_points integer not null default 0,
  collected_points integer not null default 0,
  multiplier_eligible boolean not null default true,
  multiplier_if_settled_now integer not null default 1,
  collected_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pickem_daily_snapshots_pk primary key (user_id, venue_id, local_date),
  constraint pickem_daily_snapshots_multiplier_valid check (multiplier_if_settled_now in (1, 2, 3))
);

create index if not exists idx_pickem_daily_snapshots_user_date
  on pickem_daily_snapshots(user_id, local_date desc);

drop trigger if exists pickem_daily_snapshots_set_updated_at on pickem_daily_snapshots;
create trigger pickem_daily_snapshots_set_updated_at
before update on pickem_daily_snapshots
for each row execute function set_updated_at();

alter table pickem_daily_snapshots enable row level security;

drop policy if exists "Users can read own pickem daily snapshots" on pickem_daily_snapshots;
create policy "Users can read own pickem daily snapshots"
  on pickem_daily_snapshots for select
  using (user_id in (select id from users where auth_id = auth.uid()));

create or replace function public.claim_pickem_points(
  p_user_id uuid,
  p_venue_id text,
  p_local_date date,
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns table (
  claimed_pick_count integer,
  points_awarded integer,
  multiplier_applied integer,
  multiplier_eligible boolean,
  total_picks integer,
  settled_picks integer,
  correct_picks integer,
  pending_picks integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_multiplier_eligible boolean := true;
  v_total_picks integer := 0;
  v_settled_picks integer := 0;
  v_correct_picks integer := 0;
  v_pending_picks integer := 0;
  v_incorrect_picks integer := 0;
  v_unclaimed_correct integer := 0;
  v_multiplier integer := 1;
  v_points_awarded integer := 0;
  v_claimed_count integer := 0;
begin
  if p_user_id is null or p_venue_id is null or p_local_date is null then
    raise exception 'p_user_id, p_venue_id, and p_local_date are required';
  end if;

  perform 1 from users where id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;

  insert into pickem_daily_snapshots (user_id, venue_id, local_date)
  values (p_user_id, p_venue_id, p_local_date)
  on conflict (user_id, venue_id, local_date) do nothing;

  select s.multiplier_eligible
  into v_multiplier_eligible
  from pickem_daily_snapshots s
  where s.user_id = p_user_id
    and s.venue_id = p_venue_id
    and s.local_date = p_local_date
  for update;

  select
    count(*)::integer,
    count(*) filter (where status <> 'pending')::integer,
    count(*) filter (where status = 'won')::integer,
    count(*) filter (where status = 'pending')::integer,
    count(*) filter (where status = 'lost')::integer,
    count(*) filter (where status = 'won' and reward_claimed_at is null)::integer
  into
    v_total_picks,
    v_settled_picks,
    v_correct_picks,
    v_pending_picks,
    v_incorrect_picks,
    v_unclaimed_correct
  from pickem_picks
  where user_id = p_user_id
    and venue_id = p_venue_id
    and starts_at >= p_day_start
    and starts_at <= p_day_end;

  if v_pending_picks > 0 and v_multiplier_eligible then
    v_multiplier_eligible := false;
  end if;

  if v_multiplier_eligible and v_pending_picks = 0 and v_total_picks = 10 then
    if v_correct_picks >= 10 then
      v_multiplier := 3;
    elsif v_correct_picks >= 7 then
      v_multiplier := 2;
    else
      v_multiplier := 1;
    end if;
  else
    v_multiplier := 1;
  end if;

  if v_unclaimed_correct > 0 then
    update pickem_picks
    set reward_claimed_at = now(),
        reward_points = 10
    where user_id = p_user_id
      and venue_id = p_venue_id
      and starts_at >= p_day_start
      and starts_at <= p_day_end
      and status = 'won'
      and reward_claimed_at is null;

    get diagnostics v_claimed_count = row_count;

    v_points_awarded := greatest(0, v_claimed_count) * 10 * v_multiplier;

    if v_points_awarded > 0 then
      update users
      set points = coalesce(points, 0) + v_points_awarded
      where id = p_user_id;
    end if;
  end if;

  update pickem_daily_snapshots
  set
    total_picks = v_total_picks,
    settled_picks = v_settled_picks,
    pending_picks = v_pending_picks,
    correct_picks = v_correct_picks,
    incorrect_picks = v_incorrect_picks,
    unclaimed_correct_picks = greatest(0, v_unclaimed_correct - v_claimed_count),
    pending_points = greatest(0, v_unclaimed_correct - v_claimed_count) * 10,
    collected_points = coalesce(collected_points, 0) + v_points_awarded,
    multiplier_eligible = v_multiplier_eligible,
    multiplier_if_settled_now = case
      when v_multiplier_eligible and v_pending_picks = 0 and v_total_picks = 10 and v_correct_picks >= 10 then 3
      when v_multiplier_eligible and v_pending_picks = 0 and v_total_picks = 10 and v_correct_picks >= 7 then 2
      else 1
    end,
    collected_at = case when v_points_awarded > 0 then now() else collected_at end,
    updated_at = now()
  where user_id = p_user_id
    and venue_id = p_venue_id
    and local_date = p_local_date;

  return query
  select
    v_claimed_count,
    v_points_awarded,
    v_multiplier,
    v_multiplier_eligible,
    v_total_picks,
    v_settled_picks,
    v_correct_picks,
    v_pending_picks;
end;
$$;

grant execute on function public.claim_pickem_points(uuid, text, date, timestamptz, timestamptz)
  to anon, authenticated, service_role;
