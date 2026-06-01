-- User analytics event schema.
-- Captures site sessions, game sessions, ad interactions, and cached user geo
-- attributes for the Admin -> Users & Venues -> User Analytics surface.

create table if not exists public.user_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venue_id text not null references public.venues(id) on delete restrict,
  session_start_at timestamptz not null default current_timestamp,
  session_end_at timestamptz null,
  duration_ms bigint null,
  ip_address inet null,
  user_agent text null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint user_sessions_end_after_start
    check (session_end_at is null or session_end_at >= session_start_at),
  constraint user_sessions_duration_non_negative
    check (duration_ms is null or duration_ms >= 0)
);

create index if not exists idx_user_sessions_user_venue_start
  on public.user_sessions(user_id, venue_id, session_start_at desc);

create index if not exists idx_user_sessions_venue_start
  on public.user_sessions(venue_id, session_start_at desc);

create index if not exists idx_user_sessions_start_at
  on public.user_sessions(session_start_at desc);

create table if not exists public.game_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venue_id text not null references public.venues(id) on delete restrict,
  user_session_id uuid null references public.user_sessions(session_id) on delete set null,
  game_type text not null,
  game_start_at timestamptz not null default current_timestamp,
  game_end_at timestamptz null,
  duration_ms bigint null,
  game_outcome text null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint game_sessions_type_valid
    check (game_type in ('trivia', 'bingo', 'pickem', 'fantasy', 'speed-trivia', 'live-trivia')),
  constraint game_sessions_outcome_valid
    check (game_outcome is null or game_outcome in ('won', 'lost', 'abandoned')),
  constraint game_sessions_end_after_start
    check (game_end_at is null or game_end_at >= game_start_at),
  constraint game_sessions_duration_non_negative
    check (duration_ms is null or duration_ms >= 0)
);

create index if not exists idx_game_sessions_user_game_type
  on public.game_sessions(user_id, game_type);

create index if not exists idx_game_sessions_venue_game_start
  on public.game_sessions(venue_id, game_type, game_start_at desc);

create index if not exists idx_game_sessions_user_session
  on public.game_sessions(user_session_id);

create index if not exists idx_game_sessions_start_at
  on public.game_sessions(game_start_at desc);

create table if not exists public.ad_interactions (
  interaction_id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.users(id) on delete set null,
  venue_id text not null references public.venues(id) on delete restrict,
  ad_id uuid not null references public.advertisements(id) on delete cascade,
  ad_campaign_id text null,
  interaction_type text not null,
  interaction_at timestamptz not null default current_timestamp,
  referrer_page text null,
  outcome text null,
  created_at timestamptz not null default current_timestamp,
  constraint ad_interactions_type_valid
    check (interaction_type in ('view', 'click', 'convert'))
);

create index if not exists idx_ad_interactions_ad_time
  on public.ad_interactions(ad_id, interaction_at desc);

create index if not exists idx_ad_interactions_user_time
  on public.ad_interactions(user_id, interaction_at desc);

create index if not exists idx_ad_interactions_venue_time
  on public.ad_interactions(venue_id, interaction_at desc);

create index if not exists idx_ad_interactions_campaign_time
  on public.ad_interactions(ad_campaign_id, interaction_at desc)
  where ad_campaign_id is not null;

create table if not exists public.user_geographic_data (
  user_id uuid primary key references public.users(id) on delete cascade,
  zip_code text null,
  city text null,
  state_code text null,
  region_key text null,
  country text null default 'US',
  last_updated_at timestamptz not null default current_timestamp,
  data_source text not null default 'signup',
  constraint user_geographic_data_source_valid
    check (data_source in ('geolocation', 'signup'))
);

create index if not exists idx_user_geographic_data_zip_code
  on public.user_geographic_data(zip_code);

create index if not exists idx_user_geographic_data_city
  on public.user_geographic_data(city);

create index if not exists idx_user_geographic_data_state_code
  on public.user_geographic_data(state_code);

create index if not exists idx_user_geographic_data_region_key
  on public.user_geographic_data(region_key);

create or replace function public.set_user_session_duration_ms()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.session_end_at is not null then
    new.duration_ms := greatest(
      0,
      floor(extract(epoch from (new.session_end_at - new.session_start_at)) * 1000)::bigint
    );
  end if;

  return new;
end;
$$;

create or replace function public.set_game_session_duration_ms()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.game_end_at is not null then
    new.duration_ms := greatest(
      0,
      floor(extract(epoch from (new.game_end_at - new.game_start_at)) * 1000)::bigint
    );
  end if;

  return new;
end;
$$;

drop trigger if exists user_sessions_set_duration_ms on public.user_sessions;
create trigger user_sessions_set_duration_ms
  before insert or update of session_start_at, session_end_at
  on public.user_sessions
  for each row execute function public.set_user_session_duration_ms();

drop trigger if exists user_sessions_set_updated_at on public.user_sessions;
create trigger user_sessions_set_updated_at
  before update on public.user_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists game_sessions_set_duration_ms on public.game_sessions;
create trigger game_sessions_set_duration_ms
  before insert or update of game_start_at, game_end_at
  on public.game_sessions
  for each row execute function public.set_game_session_duration_ms();

drop trigger if exists game_sessions_set_updated_at on public.game_sessions;
create trigger game_sessions_set_updated_at
  before update on public.game_sessions
  for each row execute function public.set_updated_at();

create or replace function public.set_user_geographic_data_last_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.last_updated_at := current_timestamp;
  return new;
end;
$$;

drop trigger if exists user_geographic_data_set_last_updated_at on public.user_geographic_data;
create trigger user_geographic_data_set_last_updated_at
  before update on public.user_geographic_data
  for each row execute function public.set_user_geographic_data_last_updated_at();

create or replace function public.current_admin_venue_ids()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct u.venue_id), array[]::text[])
  from public.users u
  where u.auth_id = auth.uid()
    and u.is_admin = true
    and u.venue_id is not null;
$$;

create or replace function public.is_current_user_for_analytics(
  target_user_id uuid,
  target_venue_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = target_user_id
      and u.venue_id = target_venue_id
      and u.auth_id = auth.uid()
  );
$$;

create or replace function public.is_current_admin_for_analytics_venue(target_venue_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_venue_id = any(public.current_admin_venue_ids());
$$;

alter table public.user_sessions enable row level security;
alter table public.game_sessions enable row level security;
alter table public.ad_interactions enable row level security;
alter table public.user_geographic_data enable row level security;

drop policy if exists "Users can read own analytics sessions" on public.user_sessions;
create policy "Users can read own analytics sessions"
  on public.user_sessions for select
  using (public.is_current_user_for_analytics(user_id, venue_id));

drop policy if exists "Users can create own analytics sessions" on public.user_sessions;
create policy "Users can create own analytics sessions"
  on public.user_sessions for insert
  with check (public.is_current_user_for_analytics(user_id, venue_id));

drop policy if exists "Users can update own analytics sessions" on public.user_sessions;
create policy "Users can update own analytics sessions"
  on public.user_sessions for update
  using (public.is_current_user_for_analytics(user_id, venue_id))
  with check (public.is_current_user_for_analytics(user_id, venue_id));

drop policy if exists "Admins can read venue analytics sessions" on public.user_sessions;
create policy "Admins can read venue analytics sessions"
  on public.user_sessions for select
  using (public.is_current_admin_for_analytics_venue(venue_id));

drop policy if exists "Users can read own game sessions" on public.game_sessions;
create policy "Users can read own game sessions"
  on public.game_sessions for select
  using (public.is_current_user_for_analytics(user_id, venue_id));

drop policy if exists "Users can create own game sessions" on public.game_sessions;
create policy "Users can create own game sessions"
  on public.game_sessions for insert
  with check (public.is_current_user_for_analytics(user_id, venue_id));

drop policy if exists "Users can update own game sessions" on public.game_sessions;
create policy "Users can update own game sessions"
  on public.game_sessions for update
  using (public.is_current_user_for_analytics(user_id, venue_id))
  with check (public.is_current_user_for_analytics(user_id, venue_id));

drop policy if exists "Admins can read venue game sessions" on public.game_sessions;
create policy "Admins can read venue game sessions"
  on public.game_sessions for select
  using (public.is_current_admin_for_analytics_venue(venue_id));

drop policy if exists "Users can create own ad interactions" on public.ad_interactions;
create policy "Users can create own ad interactions"
  on public.ad_interactions for insert
  with check (
    user_id is null
    or public.is_current_user_for_analytics(user_id, venue_id)
  );

drop policy if exists "Users can read own ad interactions" on public.ad_interactions;
create policy "Users can read own ad interactions"
  on public.ad_interactions for select
  using (
    user_id is not null
    and public.is_current_user_for_analytics(user_id, venue_id)
  );

drop policy if exists "Admins can read venue ad interactions" on public.ad_interactions;
create policy "Admins can read venue ad interactions"
  on public.ad_interactions for select
  using (public.is_current_admin_for_analytics_venue(venue_id));

drop policy if exists "Users can read own geographic data" on public.user_geographic_data;
create policy "Users can read own geographic data"
  on public.user_geographic_data for select
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_geographic_data.user_id
        and u.auth_id = auth.uid()
    )
  );

drop policy if exists "Users can upsert own geographic data" on public.user_geographic_data;
create policy "Users can upsert own geographic data"
  on public.user_geographic_data for insert
  with check (
    exists (
      select 1
      from public.users u
      where u.id = user_geographic_data.user_id
        and u.auth_id = auth.uid()
    )
  );

drop policy if exists "Users can update own geographic data" on public.user_geographic_data;
create policy "Users can update own geographic data"
  on public.user_geographic_data for update
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_geographic_data.user_id
        and u.auth_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = user_geographic_data.user_id
        and u.auth_id = auth.uid()
    )
  );

drop policy if exists "Admins can read venue geographic data" on public.user_geographic_data;
create policy "Admins can read venue geographic data"
  on public.user_geographic_data for select
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_geographic_data.user_id
        and public.is_current_admin_for_analytics_venue(u.venue_id)
    )
  );

create or replace function public.prune_user_analytics_raw_events(
  raw_retention interval default interval '90 days'
)
returns table (
  user_sessions_deleted bigint,
  game_sessions_deleted bigint,
  ad_interactions_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.game_sessions
  where game_start_at < current_timestamp - raw_retention;
  get diagnostics game_sessions_deleted = row_count;

  delete from public.ad_interactions
  where interaction_at < current_timestamp - raw_retention;
  get diagnostics ad_interactions_deleted = row_count;

  delete from public.user_sessions
  where session_start_at < current_timestamp - raw_retention;
  get diagnostics user_sessions_deleted = row_count;

  return next;
end;
$$;

revoke all on function public.prune_user_analytics_raw_events(interval) from public;
grant execute on function public.prune_user_analytics_raw_events(interval) to service_role;

comment on table public.user_sessions is 'Raw per-user site session analytics. Retain for 90 days; roll up before pruning.';
comment on table public.game_sessions is 'Raw per-user game session analytics with game duration and outcome. Retain for 90 days; roll up before pruning.';
comment on table public.ad_interactions is 'Raw per-user and venue-scoped ad interaction events. Retain for 90 days; roll up before pruning.';
comment on table public.user_geographic_data is 'Cached user geography for analytics grouping by venue, zip, city, state, region, and country.';
comment on function public.prune_user_analytics_raw_events(interval) is 'Deletes raw user analytics older than the supplied retention window. Intended schedule: daily after aggregate refresh; default keeps 90 days.';
