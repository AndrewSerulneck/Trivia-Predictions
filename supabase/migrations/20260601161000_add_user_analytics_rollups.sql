-- User analytics rollups.
-- Materialized views are service-role only because PostgreSQL RLS does not
-- protect materialized views. Admin-facing SQL views filter by the admin
-- user's venue scope before exposing aggregate rows to authenticated clients.

create materialized view if not exists public.analytics_hourly_venue_game_rollups as
select
  gs.venue_id,
  gs.game_type,
  date_trunc('hour', gs.game_start_at) as hour_start,
  count(*)::bigint as game_sessions,
  count(distinct gs.user_id)::bigint as unique_users,
  count(*) filter (where gs.game_outcome = 'won')::bigint as won_sessions,
  count(*) filter (where gs.game_outcome = 'lost')::bigint as lost_sessions,
  count(*) filter (where gs.game_outcome = 'abandoned')::bigint as abandoned_sessions,
  coalesce(sum(gs.duration_ms), 0)::bigint as total_duration_ms,
  coalesce(avg(gs.duration_ms), 0)::numeric(12, 2) as avg_duration_ms,
  (row_number() over (
    partition by gs.venue_id, date_trunc('hour', gs.game_start_at)
    order by count(*) desc, count(distinct gs.user_id) desc, gs.game_type asc
  ))::integer as venue_hour_popularity_rank
from public.game_sessions gs
where gs.game_start_at >= current_timestamp - interval '1 year'
group by gs.venue_id, gs.game_type, date_trunc('hour', gs.game_start_at)
with no data;

create unique index if not exists analytics_hourly_venue_game_rollups_unique
  on public.analytics_hourly_venue_game_rollups(venue_id, game_type, hour_start);

create index if not exists idx_analytics_hourly_venue_game_rollups_hour
  on public.analytics_hourly_venue_game_rollups(hour_start desc);

create table if not exists public.analytics_hourly_venue_game_rollups_history (
  venue_id text not null references public.venues(id) on delete cascade,
  game_type text not null,
  hour_start timestamptz not null,
  game_sessions bigint not null default 0,
  unique_users bigint not null default 0,
  won_sessions bigint not null default 0,
  lost_sessions bigint not null default 0,
  abandoned_sessions bigint not null default 0,
  total_duration_ms bigint not null default 0,
  avg_duration_ms numeric(12, 2) not null default 0,
  venue_hour_popularity_rank integer not null default 0,
  updated_at timestamptz not null default current_timestamp,
  constraint analytics_hourly_venue_game_rollups_history_pk
    primary key (venue_id, game_type, hour_start)
);

create index if not exists idx_analytics_hourly_venue_game_rollups_history_hour
  on public.analytics_hourly_venue_game_rollups_history(hour_start desc);

create materialized view if not exists public.analytics_daily_geographic_rollups as
with session_activity as (
  select
    us.venue_id,
    us.user_id,
    date_trunc('day', us.session_start_at)::date as activity_date,
    null::text as game_type,
    count(*)::bigint as site_sessions,
    0::bigint as game_sessions,
    0::bigint as ad_views,
    0::bigint as ad_clicks,
    0::bigint as ad_conversions,
    coalesce(sum(us.duration_ms), 0)::bigint as site_duration_ms,
    0::bigint as game_duration_ms
  from public.user_sessions us
  where us.session_start_at >= current_timestamp - interval '1 year'
  group by us.venue_id, us.user_id, date_trunc('day', us.session_start_at)::date
),
game_activity as (
  select
    gs.venue_id,
    gs.user_id,
    date_trunc('day', gs.game_start_at)::date as activity_date,
    gs.game_type,
    0::bigint as site_sessions,
    count(*)::bigint as game_sessions,
    0::bigint as ad_views,
    0::bigint as ad_clicks,
    0::bigint as ad_conversions,
    0::bigint as site_duration_ms,
    coalesce(sum(gs.duration_ms), 0)::bigint as game_duration_ms
  from public.game_sessions gs
  where gs.game_start_at >= current_timestamp - interval '1 year'
  group by gs.venue_id, gs.user_id, date_trunc('day', gs.game_start_at)::date, gs.game_type
),
ad_activity as (
  select
    ai.venue_id,
    ai.user_id,
    date_trunc('day', ai.interaction_at)::date as activity_date,
    null::text as game_type,
    0::bigint as site_sessions,
    0::bigint as game_sessions,
    count(*) filter (where ai.interaction_type = 'view')::bigint as ad_views,
    count(*) filter (where ai.interaction_type = 'click')::bigint as ad_clicks,
    count(*) filter (where ai.interaction_type = 'convert')::bigint as ad_conversions,
    0::bigint as site_duration_ms,
    0::bigint as game_duration_ms
  from public.ad_interactions ai
  where ai.interaction_at >= current_timestamp - interval '1 year'
  group by ai.venue_id, ai.user_id, date_trunc('day', ai.interaction_at)::date
),
activity as (
  select * from session_activity
  union all
  select * from game_activity
  union all
  select * from ad_activity
),
activity_with_geo as (
  select
    a.*,
    v.name as venue_name,
    coalesce(nullif(ugd.zip_code, ''), nullif(v.zip_code, '')) as zip_code,
    coalesce(nullif(ugd.city, ''), nullif(v.city, '')) as city,
    coalesce(nullif(ugd.state_code, ''), nullif(v.state, '')) as state_code,
    coalesce(nullif(ugd.region_key, ''), nullif(v.region, '')) as region_key,
    coalesce(nullif(ugd.country, ''), nullif(v.country, ''), 'US') as country
  from activity a
  join public.venues v on v.id = a.venue_id
  left join public.user_geographic_data ugd on ugd.user_id = a.user_id
),
dimensioned as (
  select
    awg.venue_id,
    awg.activity_date,
    awg.game_type,
    awg.user_id,
    awg.site_sessions,
    awg.game_sessions,
    awg.ad_views,
    awg.ad_clicks,
    awg.ad_conversions,
    awg.site_duration_ms,
    awg.game_duration_ms,
    dims.dimension_level,
    dims.dimension_key,
    dims.dimension_label
  from activity_with_geo awg
  cross join lateral (
    values
      ('venue', awg.venue_id, awg.venue_name),
      ('zip_code', awg.zip_code, awg.zip_code),
      ('city', lower(awg.city), awg.city),
      ('state', upper(awg.state_code), upper(awg.state_code)),
      ('region', lower(awg.region_key), awg.region_key),
      ('country', upper(awg.country), upper(awg.country))
  ) as dims(dimension_level, dimension_key, dimension_label)
  where dims.dimension_key is not null
    and btrim(dims.dimension_key) <> ''
)
select
  venue_id,
  activity_date,
  dimension_level,
  dimension_key,
  max(dimension_label) as dimension_label,
  game_type,
  count(distinct user_id) filter (where user_id is not null)::bigint as unique_users,
  sum(site_sessions)::bigint as site_sessions,
  sum(game_sessions)::bigint as game_sessions,
  sum(ad_views)::bigint as ad_views,
  sum(ad_clicks)::bigint as ad_clicks,
  sum(ad_conversions)::bigint as ad_conversions,
  sum(site_duration_ms)::bigint as site_duration_ms,
  sum(game_duration_ms)::bigint as game_duration_ms,
  (row_number() over (
    partition by venue_id, activity_date, dimension_level, dimension_key
    order by sum(game_sessions) desc, count(distinct user_id) filter (where user_id is not null) desc, game_type asc nulls last
  ))::integer as game_popularity_rank
from dimensioned
group by venue_id, activity_date, dimension_level, dimension_key, game_type
with no data;

create unique index if not exists analytics_daily_geographic_rollups_unique
  on public.analytics_daily_geographic_rollups(
    venue_id,
    activity_date,
    dimension_level,
    dimension_key,
    coalesce(game_type, '')
  );

create index if not exists idx_analytics_daily_geographic_rollups_dimension
  on public.analytics_daily_geographic_rollups(dimension_level, dimension_key, activity_date desc);

create index if not exists idx_analytics_daily_geographic_rollups_venue_date
  on public.analytics_daily_geographic_rollups(venue_id, activity_date desc);

create table if not exists public.analytics_daily_geographic_rollups_history (
  venue_id text not null references public.venues(id) on delete cascade,
  activity_date date not null,
  dimension_level text not null,
  dimension_key text not null,
  dimension_label text null,
  game_type text null,
  game_type_key text generated always as (coalesce(game_type, '')) stored,
  unique_users bigint not null default 0,
  site_sessions bigint not null default 0,
  game_sessions bigint not null default 0,
  ad_views bigint not null default 0,
  ad_clicks bigint not null default 0,
  ad_conversions bigint not null default 0,
  site_duration_ms bigint not null default 0,
  game_duration_ms bigint not null default 0,
  game_popularity_rank integer not null default 0,
  updated_at timestamptz not null default current_timestamp,
  constraint analytics_daily_geographic_rollups_history_unique
    unique (venue_id, activity_date, dimension_level, dimension_key, game_type_key)
);

create index if not exists idx_analytics_daily_geographic_rollups_history_dimension
  on public.analytics_daily_geographic_rollups_history(dimension_level, dimension_key, activity_date desc);

create index if not exists idx_analytics_daily_geographic_rollups_history_venue_date
  on public.analytics_daily_geographic_rollups_history(venue_id, activity_date desc);

create materialized view if not exists public.analytics_venue_user_daily_cohorts as
with activity as (
  select
    user_id,
    venue_id,
    date_trunc('day', session_start_at)::date as activity_date,
    count(*)::bigint as site_sessions,
    0::bigint as game_sessions,
    0::bigint as ad_clicks,
    coalesce(sum(duration_ms), 0)::bigint as site_duration_ms,
    0::bigint as game_duration_ms
  from public.user_sessions
  where session_start_at >= current_timestamp - interval '1 year'
  group by user_id, venue_id, date_trunc('day', session_start_at)::date
  union all
  select
    user_id,
    venue_id,
    date_trunc('day', game_start_at)::date as activity_date,
    0::bigint as site_sessions,
    count(*)::bigint as game_sessions,
    0::bigint as ad_clicks,
    0::bigint as site_duration_ms,
    coalesce(sum(duration_ms), 0)::bigint as game_duration_ms
  from public.game_sessions
  where game_start_at >= current_timestamp - interval '1 year'
  group by user_id, venue_id, date_trunc('day', game_start_at)::date
  union all
  select
    user_id,
    venue_id,
    date_trunc('day', interaction_at)::date as activity_date,
    0::bigint as site_sessions,
    0::bigint as game_sessions,
    count(*) filter (where interaction_type = 'click')::bigint as ad_clicks,
    0::bigint as site_duration_ms,
    0::bigint as game_duration_ms
  from public.ad_interactions
  where interaction_at >= current_timestamp - interval '1 year'
    and user_id is not null
  group by user_id, venue_id, date_trunc('day', interaction_at)::date
),
daily as (
  select
    user_id,
    venue_id,
    activity_date,
    sum(site_sessions)::bigint as site_sessions,
    sum(game_sessions)::bigint as game_sessions,
    sum(ad_clicks)::bigint as ad_clicks,
    sum(site_duration_ms)::bigint as site_duration_ms,
    sum(game_duration_ms)::bigint as game_duration_ms
  from activity
  group by user_id, venue_id, activity_date
),
ranked as (
  select
    daily.*,
    min(activity_date) over (partition by venue_id, user_id) as cohort_date,
    lag(activity_date) over (partition by venue_id, user_id order by activity_date) as previous_activity_date
  from daily
)
select
  venue_id,
  user_id,
  activity_date,
  cohort_date,
  (activity_date - cohort_date)::integer as days_since_cohort,
  previous_activity_date,
  (previous_activity_date = activity_date - 1) as retained_from_previous_day,
  site_sessions,
  game_sessions,
  ad_clicks,
  site_duration_ms,
  game_duration_ms
from ranked
with no data;

create unique index if not exists analytics_venue_user_daily_cohorts_unique
  on public.analytics_venue_user_daily_cohorts(venue_id, user_id, activity_date);

create index if not exists idx_analytics_venue_user_daily_cohorts_cohort
  on public.analytics_venue_user_daily_cohorts(venue_id, cohort_date, activity_date);

create table if not exists public.analytics_venue_user_daily_cohorts_history (
  venue_id text not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  activity_date date not null,
  cohort_date date not null,
  days_since_cohort integer not null,
  previous_activity_date date null,
  retained_from_previous_day boolean null,
  site_sessions bigint not null default 0,
  game_sessions bigint not null default 0,
  ad_clicks bigint not null default 0,
  site_duration_ms bigint not null default 0,
  game_duration_ms bigint not null default 0,
  updated_at timestamptz not null default current_timestamp,
  constraint analytics_venue_user_daily_cohorts_history_pk
    primary key (venue_id, user_id, activity_date)
);

create index if not exists idx_analytics_venue_user_daily_cohorts_history_cohort
  on public.analytics_venue_user_daily_cohorts_history(venue_id, cohort_date, activity_date);

create or replace view public.admin_analytics_hourly_venue_game_rollups
with (security_barrier = true) as
select
  venue_id,
  game_type,
  hour_start,
  game_sessions,
  unique_users,
  won_sessions,
  lost_sessions,
  abandoned_sessions,
  total_duration_ms,
  avg_duration_ms,
  venue_hour_popularity_rank,
  updated_at
from public.analytics_hourly_venue_game_rollups_history
where public.is_current_admin_for_analytics_venue(venue_id);

create or replace view public.admin_analytics_daily_geographic_rollups
with (security_barrier = true) as
select
  venue_id,
  activity_date,
  dimension_level,
  dimension_key,
  dimension_label,
  game_type,
  unique_users,
  site_sessions,
  game_sessions,
  ad_views,
  ad_clicks,
  ad_conversions,
  site_duration_ms,
  game_duration_ms,
  game_popularity_rank,
  updated_at
from public.analytics_daily_geographic_rollups_history
where public.is_current_admin_for_analytics_venue(venue_id);

create or replace view public.admin_analytics_venue_user_daily_cohorts
with (security_barrier = true) as
select
  venue_id,
  user_id,
  activity_date,
  cohort_date,
  days_since_cohort,
  previous_activity_date,
  retained_from_previous_day,
  site_sessions,
  game_sessions,
  ad_clicks,
  site_duration_ms,
  game_duration_ms,
  updated_at
from public.analytics_venue_user_daily_cohorts_history
where public.is_current_admin_for_analytics_venue(venue_id);

revoke all on public.analytics_hourly_venue_game_rollups from anon, authenticated;
revoke all on public.analytics_daily_geographic_rollups from anon, authenticated;
revoke all on public.analytics_venue_user_daily_cohorts from anon, authenticated;
revoke all on public.analytics_hourly_venue_game_rollups_history from anon, authenticated;
revoke all on public.analytics_daily_geographic_rollups_history from anon, authenticated;
revoke all on public.analytics_venue_user_daily_cohorts_history from anon, authenticated;

grant select on public.admin_analytics_hourly_venue_game_rollups to authenticated;
grant select on public.admin_analytics_daily_geographic_rollups to authenticated;
grant select on public.admin_analytics_venue_user_daily_cohorts to authenticated;

create or replace function public.refresh_user_analytics_rollups()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view public.analytics_hourly_venue_game_rollups;
  refresh materialized view public.analytics_daily_geographic_rollups;
  refresh materialized view public.analytics_venue_user_daily_cohorts;

  delete from public.analytics_hourly_venue_game_rollups_history
  where hour_start >= current_timestamp - interval '90 days';

  insert into public.analytics_hourly_venue_game_rollups_history (
    venue_id,
    game_type,
    hour_start,
    game_sessions,
    unique_users,
    won_sessions,
    lost_sessions,
    abandoned_sessions,
    total_duration_ms,
    avg_duration_ms,
    venue_hour_popularity_rank,
    updated_at
  )
  select
    venue_id,
    game_type,
    hour_start,
    game_sessions,
    unique_users,
    won_sessions,
    lost_sessions,
    abandoned_sessions,
    total_duration_ms,
    avg_duration_ms,
    venue_hour_popularity_rank,
    current_timestamp
  from public.analytics_hourly_venue_game_rollups
  on conflict on constraint analytics_hourly_venue_game_rollups_history_pk do update
  set
    game_sessions = excluded.game_sessions,
    unique_users = excluded.unique_users,
    won_sessions = excluded.won_sessions,
    lost_sessions = excluded.lost_sessions,
    abandoned_sessions = excluded.abandoned_sessions,
    total_duration_ms = excluded.total_duration_ms,
    avg_duration_ms = excluded.avg_duration_ms,
    venue_hour_popularity_rank = excluded.venue_hour_popularity_rank,
    updated_at = current_timestamp;

  delete from public.analytics_daily_geographic_rollups_history
  where activity_date >= (current_date - 90);

  insert into public.analytics_daily_geographic_rollups_history (
    venue_id,
    activity_date,
    dimension_level,
    dimension_key,
    dimension_label,
    game_type,
    unique_users,
    site_sessions,
    game_sessions,
    ad_views,
    ad_clicks,
    ad_conversions,
    site_duration_ms,
    game_duration_ms,
    game_popularity_rank,
    updated_at
  )
  select
    venue_id,
    activity_date,
    dimension_level,
    dimension_key,
    dimension_label,
    game_type,
    unique_users,
    site_sessions,
    game_sessions,
    ad_views,
    ad_clicks,
    ad_conversions,
    site_duration_ms,
    game_duration_ms,
    game_popularity_rank,
    current_timestamp
  from public.analytics_daily_geographic_rollups
  on conflict on constraint analytics_daily_geographic_rollups_history_unique do update
  set
    dimension_label = excluded.dimension_label,
    unique_users = excluded.unique_users,
    site_sessions = excluded.site_sessions,
    game_sessions = excluded.game_sessions,
    ad_views = excluded.ad_views,
    ad_clicks = excluded.ad_clicks,
    ad_conversions = excluded.ad_conversions,
    site_duration_ms = excluded.site_duration_ms,
    game_duration_ms = excluded.game_duration_ms,
    game_popularity_rank = excluded.game_popularity_rank,
    updated_at = current_timestamp;

  delete from public.analytics_venue_user_daily_cohorts_history
  where activity_date >= (current_date - 90);

  insert into public.analytics_venue_user_daily_cohorts_history (
    venue_id,
    user_id,
    activity_date,
    cohort_date,
    days_since_cohort,
    previous_activity_date,
    retained_from_previous_day,
    site_sessions,
    game_sessions,
    ad_clicks,
    site_duration_ms,
    game_duration_ms,
    updated_at
  )
  select
    venue_id,
    user_id,
    activity_date,
    cohort_date,
    days_since_cohort,
    previous_activity_date,
    retained_from_previous_day,
    site_sessions,
    game_sessions,
    ad_clicks,
    site_duration_ms,
    game_duration_ms,
    current_timestamp
  from public.analytics_venue_user_daily_cohorts
  on conflict on constraint analytics_venue_user_daily_cohorts_history_pk do update
  set
    cohort_date = excluded.cohort_date,
    days_since_cohort = excluded.days_since_cohort,
    previous_activity_date = excluded.previous_activity_date,
    retained_from_previous_day = excluded.retained_from_previous_day,
    site_sessions = excluded.site_sessions,
    game_sessions = excluded.game_sessions,
    ad_clicks = excluded.ad_clicks,
    site_duration_ms = excluded.site_duration_ms,
    game_duration_ms = excluded.game_duration_ms,
    updated_at = current_timestamp;

  delete from public.analytics_hourly_venue_game_rollups_history
  where hour_start < current_timestamp - interval '1 year';

  delete from public.analytics_daily_geographic_rollups_history
  where activity_date < (current_date - 365);

  delete from public.analytics_venue_user_daily_cohorts_history
  where activity_date < (current_date - 365);
end;
$$;

revoke all on function public.refresh_user_analytics_rollups() from public;
grant execute on function public.refresh_user_analytics_rollups() to service_role;

comment on materialized view public.analytics_hourly_venue_game_rollups is 'Hourly game rollups by venue, game type, and hour. Intended retention window: one year.';
comment on materialized view public.analytics_daily_geographic_rollups is 'Daily venue-scoped rollups by geography dimensions: venue, zip code, city, state, region, country. Intended retention window: one year.';
comment on materialized view public.analytics_venue_user_daily_cohorts is 'Venue/date/user cohort rollups for retention analysis. Intended retention window: one year.';
comment on table public.analytics_hourly_venue_game_rollups_history is 'One-year retained hourly game rollup snapshots populated from analytics_hourly_venue_game_rollups.';
comment on table public.analytics_daily_geographic_rollups_history is 'One-year retained daily geography rollup snapshots populated from analytics_daily_geographic_rollups.';
comment on table public.analytics_venue_user_daily_cohorts_history is 'One-year retained venue/date/user cohort snapshots populated from analytics_venue_user_daily_cohorts.';
comment on function public.refresh_user_analytics_rollups() is 'Refreshes materialized views, snapshots aggregates for one year, and removes aggregate history older than one year. Intended schedule: hourly before raw-event pruning.';
