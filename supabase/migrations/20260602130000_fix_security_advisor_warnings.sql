-- Fix Supabase security advisor warnings:
-- 1. Recreate admin analytics views with security_invoker = true
-- 2. Enable RLS on answer_variants (service-role-only table)

create or replace view public.admin_analytics_hourly_venue_game_rollups
with (security_barrier = true, security_invoker = true) as
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
with (security_barrier = true, security_invoker = true) as
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
with (security_barrier = true, security_invoker = true) as
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

-- answer_variants is accessed exclusively via service role (supabaseAdmin),
-- which bypasses RLS. Enabling RLS with no permissive policies locks it down
-- to service role only.
alter table public.answer_variants enable row level security;
