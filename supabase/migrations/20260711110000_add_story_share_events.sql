-- Story-share analytics events for the postgame camera/share flow.
-- Complements user/game sessions with funnel-level events that compare
-- Live Trivia vs Category Blitz sharing behavior.

create table if not exists public.story_share_events (
  event_id uuid primary key default gen_random_uuid(),
  story_share_id text not null,
  user_id uuid null references public.users(id) on delete set null,
  venue_id text not null references public.venues(id) on delete restrict,
  user_session_id uuid null references public.user_sessions(session_id) on delete set null,
  game_session_id uuid null references public.game_sessions(session_id) on delete set null,
  game_type text not null,
  event_type text not null,
  event_at timestamptz not null default current_timestamp,
  template_variant text null,
  fallback_mode text null,
  external_app_target text null,
  share_status text null,
  permission_state text null,
  camera_error_code text null,
  final_rank integer null,
  final_points integer null,
  correct_rate numeric null,
  is_champion boolean null,
  fallback_recommended boolean null,
  result_reason text null,
  image_width integer null,
  image_height integer null,
  used_camera_fallback boolean null,
  created_at timestamptz not null default current_timestamp,
  constraint story_share_events_game_type_valid
    check (game_type in ('live-trivia', 'category-blitz')),
  constraint story_share_events_event_type_valid
    check (event_type in (
      'story_share_opened',
      'story_camera_permission_result',
      'story_capture_completed',
      'story_share_attempted',
      'story_share_completed',
      'story_share_fallback_used'
    )),
  constraint story_share_events_template_variant_valid
    check (template_variant is null or template_variant in ('default', 'champion', 'top3', 'funny', 'minimal')),
  constraint story_share_events_fallback_mode_valid
    check (fallback_mode is null or fallback_mode in ('web-share', 'download', 'deep-link', 'copy-only')),
  constraint story_share_events_external_app_target_valid
    check (external_app_target is null or external_app_target in ('instagram', 'facebook')),
  constraint story_share_events_share_status_valid
    check (share_status is null or share_status in ('shared', 'unsupported', 'canceled', 'failed')),
  constraint story_share_events_permission_state_valid
    check (permission_state is null or permission_state in ('unknown', 'prompt', 'granted', 'denied', 'unsupported')),
  constraint story_share_events_camera_error_code_valid
    check (camera_error_code is null or camera_error_code in ('permission-denied', 'no-camera', 'insecure-context', 'unsupported-browser', 'unknown')),
  constraint story_share_events_final_rank_positive
    check (final_rank is null or final_rank > 0),
  constraint story_share_events_final_points_non_negative
    check (final_points is null or final_points >= 0),
  constraint story_share_events_correct_rate_range
    check (correct_rate is null or (correct_rate >= 0 and correct_rate <= 100)),
  constraint story_share_events_image_width_positive
    check (image_width is null or image_width > 0),
  constraint story_share_events_image_height_positive
    check (image_height is null or image_height > 0)
);

create index if not exists idx_story_share_events_story_share
  on public.story_share_events(story_share_id, event_at);

create index if not exists idx_story_share_events_venue_game_time
  on public.story_share_events(venue_id, game_type, event_at desc);

create index if not exists idx_story_share_events_user_time
  on public.story_share_events(user_id, event_at desc)
  where user_id is not null;

alter table public.story_share_events enable row level security;

drop policy if exists "Users can create own story share events" on public.story_share_events;
create policy "Users can create own story share events"
  on public.story_share_events for insert
  with check (
    user_id is null
    or public.is_current_user_for_analytics(user_id, venue_id)
  );

drop policy if exists "Users can read own story share events" on public.story_share_events;
create policy "Users can read own story share events"
  on public.story_share_events for select
  using (
    user_id is not null
    and public.is_current_user_for_analytics(user_id, venue_id)
  );

drop policy if exists "Admins can read venue story share events" on public.story_share_events;
create policy "Admins can read venue story share events"
  on public.story_share_events for select
  using (public.is_current_admin_for_analytics_venue(venue_id));

comment on table public.story_share_events is 'Raw story-share funnel analytics for camera capture, native sharing, and fallback usage. Retain with other raw user analytics.';
