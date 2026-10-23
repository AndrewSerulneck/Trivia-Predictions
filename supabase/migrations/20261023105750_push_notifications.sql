-- Native app store plan (docs/native-app-store-plan.md) Phase 5.1: phone push notifications.
--
-- Four parts:
--   1. public.push_devices — one row per phone (its Firebase Cloud Messaging token). Written only by
--      POST /api/push/devices (lib/push/devices.ts), bound to the signed tp_sess session. Holds the
--      player's three on/off choices (live games starting, prizes, results) for that phone.
--   2. public.push_game_reminders — the once-only ledger for "Live Trivia starts soon": one row per
--      game (schedule + its local date), claimed BEFORE anything is sent, so the 5-minute cron can
--      overlap or retry without a second push.
--   3. notifications.pushed_at — the push outbox marker. Ten writers insert notifications (eight
--      TypeScript files plus the Bingo-grading and prediction-settlement SQL functions), so the outbox
--      reads the table itself instead of hooking one writer.
--   4. public.claim_notification_pushes() — claims the recent unpushed notifications once (stamps
--      pushed_at under SKIP LOCKED) and returns each one with the phones it should go to.
--
-- Account deletion: both user links are ON DELETE CASCADE, so delete_player_account removes a
-- player's phones with their users/accounts rows (tests/account-deletion-contract.test.ts only
-- requires explicit handling for SET NULL consumers of users).
--
-- Cost: the outbox is one RPC per minute inside the existing /api/cron/bingo-progress run (an index
-- range scan over the last 15 minutes of notifications); the reminder sweep adds one small insert only
-- when a game is about to start. No new cron. Proven by `npm run test:push-sql`.

-- ── 1. Phones ───────────────────────────────────────────────────────────────────────────────

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  platform text not null,
  -- The venue profile that last registered this phone, and its global account. A notification for
  -- any of the account's venue profiles reaches the phone (see claim_notification_pushes).
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  -- The venue the player last used on this phone: who hears "a live game starts soon here".
  venue_id text references public.venues(id) on delete set null,
  app_version text,
  notify_games boolean not null default true,
  notify_prizes boolean not null default true,
  notify_results boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when Firebase says the token is dead (app uninstalled, token rotated). Never sent to again.
  disabled_at timestamptz,
  disabled_reason text,
  constraint push_devices_token_key unique (token),
  constraint push_devices_token_length check (char_length(token) between 20 and 4096),
  constraint push_devices_platform_valid check (platform in ('ios', 'android')),
  constraint push_devices_app_version_length check (app_version is null or char_length(app_version) <= 32),
  constraint push_devices_disabled_reason_length check (disabled_reason is null or char_length(disabled_reason) <= 64)
);

create index push_devices_user_idx on public.push_devices (user_id) where disabled_at is null;
create index push_devices_account_idx on public.push_devices (account_id) where disabled_at is null;
create index push_devices_venue_idx on public.push_devices (venue_id) where disabled_at is null;

alter table public.push_devices enable row level security;
alter table public.push_devices force row level security;
-- Server only: the browser never reads or writes a token directly.
revoke all on table public.push_devices from anon, authenticated;
grant select, insert, update, delete on table public.push_devices to service_role;

-- ── 2. "Live Trivia starts soon" ledger ─────────────────────────────────────────────────────

create table public.push_game_reminders (
  schedule_id uuid not null references public.trivia_schedules(id) on delete cascade,
  -- The occurrence's date in the schedule's own timezone (lib/liveShowdownEngine.ts occurrenceDate).
  occurrence_date text not null,
  venue_id text not null,
  starts_at timestamptz not null,
  claimed_at timestamptz not null default now(),
  constraint push_game_reminders_pkey primary key (schedule_id, occurrence_date),
  constraint push_game_reminders_occurrence_date_format check (occurrence_date ~ '^\d{4}-\d{2}-\d{2}$')
);

-- The ledger only needs recent rows; this index lets a future cleanup delete old ones cheaply.
create index push_game_reminders_starts_at_idx on public.push_game_reminders (starts_at);

alter table public.push_game_reminders enable row level security;
alter table public.push_game_reminders force row level security;
revoke all on table public.push_game_reminders from anon, authenticated;
grant select, insert, update, delete on table public.push_game_reminders to service_role;

-- ── 3. Outbox marker on notifications ───────────────────────────────────────────────────────
-- Null = not yet looked at by the outbox. Rows that existed before this migration stay null but are
-- older than the claim window, so they are never pushed.

alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_created_at_idx on public.notifications (created_at);

-- ── 4. Claim recent notifications for push ──────────────────────────────────────────────────
-- Stamps pushed_at on every unclaimed notification created in the last p_window_seconds (oldest
-- first, at most p_limit) — whether or not its player has a phone, so a row is looked at once — and
-- returns one row per (notification, enabled phone). SKIP LOCKED means two overlapping cron runs never
-- claim the same notification. A notification reaches a phone registered by the same venue profile, or
-- by any profile of the same account. Preferences are applied by the caller
-- (lib/pushCategories.ts decides a notification's category).

create or replace function public.claim_notification_pushes(
  p_window_seconds integer default 900,
  p_limit integer default 500
)
returns table (
  notification_id uuid,
  notification_user_id uuid,
  message text,
  notification_type text,
  link_url text,
  device_id uuid,
  token text,
  platform text,
  notify_prizes boolean,
  notify_results boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window integer := greatest(60, least(coalesce(p_window_seconds, 900), 3600));
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 2000));
begin
  return query
  with claimed as (
    update notifications n
    set pushed_at = now()
    where n.id in (
      select c.id
      from notifications c
      where c.pushed_at is null
        and c.created_at > now() - make_interval(secs => v_window)
      order by c.created_at
      limit v_limit
      for update skip locked
    )
    returning n.id, n.user_id, n.message, n.type, n.link_url
  )
  select
    cl.id,
    cl.user_id,
    cl.message,
    cl.type::text,
    cl.link_url,
    d.id,
    d.token,
    d.platform,
    d.notify_prizes,
    d.notify_results
  from claimed cl
  join users u on u.id = cl.user_id
  join push_devices d
    on d.disabled_at is null
   and (d.user_id = cl.user_id or (u.account_id is not null and d.account_id = u.account_id))
  order by cl.id, d.id;
end;
$$;

-- Server only (lib/push/outbox.ts). Players never call it.
revoke all on function public.claim_notification_pushes(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_pushes(integer, integer) to service_role;
