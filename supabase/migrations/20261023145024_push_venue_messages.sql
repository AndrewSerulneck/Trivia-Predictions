-- Native app store plan (docs/native-app-store-plan.md) Phase 5.5: partner-written messages.
--
-- A partner types a short message (≤ 150 characters) on the Partner Dashboard and it goes as one
-- push to the players of that bar whose phone has "News from your bars" on (the 5.4 switch,
-- push_devices.notify_news). Limits and abuse controls (Andrew, 2026-10-23):
--   * at most p_daily_cap messages per bar per local day (PARTNER_MESSAGES_DAILY_CAP = 2 in
--     lib/push/venueMessages.ts) — separate from 5.4's automatic game/prize cap;
--   * the words/links filter runs in the app before this is ever called (lib/partnerMessageRules.ts);
--   * a player who got a message can report it; enough distinct reports pause the bar's messages;
--   * an admin can pause (or un-pause) any bar's messages at once.
--
--   1. public.push_venue_messages        — every message sent: who, what, when, how many phones.
--   2. public.push_venue_message_reports — one row per player per message reported (a player's
--      rows go with their account: CASCADE on users).
--   3. public.push_venue_message_pauses  — a row = that bar can't send. reason 'reports' (automatic)
--      or 'admin'. Deleting the row un-pauses.
--   4. claim_venue_message_push()  — under one advisory lock per bar: refuses a paused bar, refuses
--      past the cap, reads the audience once, records the message, returns the phones.
--   5. read_venue_message() / report_venue_message() — for a player of that bar only (a profile at
--      the bar, or any profile of the same account), the same rule the audience uses.
--
-- Cost: one RPC per message sent (≤ 2 per bar per day), one per report or read (a player tapping a
-- push). No cron. Proven by `npm run test:push-sql`.

-- ── 1. Messages ─────────────────────────────────────────────────────────────────────────────

create table public.push_venue_messages (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id) on delete cascade,
  -- The partner who sent it (venue_owners.id). No FK: an owner row can be removed (support,
  -- pending-signup purge) and the message record must not block that or vanish with it.
  owner_id uuid,
  body text not null,
  -- The bar's local date when it was sent: what the daily cap counts.
  local_date text not null,
  devices integer not null default 0,
  sent_at timestamptz not null default now(),
  constraint push_venue_messages_body_length check (char_length(body) between 1 and 150),
  constraint push_venue_messages_local_date_format check (local_date ~ '^\d{4}-\d{2}-\d{2}$')
);

create index push_venue_messages_venue_day_idx on public.push_venue_messages (venue_id, local_date);
create index push_venue_messages_sent_at_idx on public.push_venue_messages (sent_at desc);

alter table public.push_venue_messages enable row level security;
alter table public.push_venue_messages force row level security;
revoke all on table public.push_venue_messages from anon, authenticated;
grant select, insert, update, delete on table public.push_venue_messages to service_role;

-- ── 2. Reports ──────────────────────────────────────────────────────────────────────────────

create table public.push_venue_message_reports (
  message_id uuid not null references public.push_venue_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  reported_at timestamptz not null default now(),
  constraint push_venue_message_reports_pkey primary key (message_id, user_id)
);

alter table public.push_venue_message_reports enable row level security;
alter table public.push_venue_message_reports force row level security;
revoke all on table public.push_venue_message_reports from anon, authenticated;
grant select, insert, update, delete on table public.push_venue_message_reports to service_role;

-- ── 3. Pauses ───────────────────────────────────────────────────────────────────────────────

create table public.push_venue_message_pauses (
  venue_id text primary key references public.venues(id) on delete cascade,
  reason text not null,
  -- The message whose reports paused the bar (null for an admin pause).
  message_id uuid references public.push_venue_messages(id) on delete set null,
  paused_at timestamptz not null default now(),
  constraint push_venue_message_pauses_reason_valid check (reason in ('reports', 'admin'))
);

alter table public.push_venue_message_pauses enable row level security;
alter table public.push_venue_message_pauses force row level security;
revoke all on table public.push_venue_message_pauses from anon, authenticated;
grant select, insert, update, delete on table public.push_venue_message_pauses to service_role;

-- ── 4. Send one message ─────────────────────────────────────────────────────────────────────
-- Returns ONE row with a null phone when nothing is sent ('paused', 'capped', 'unknown_venue',
-- 'no_audience'), else one 'claimed' row per phone, all carrying the new message id.
-- The audience rule is the same as claim_venue_news_push (20261023141109): keep them in step.

create or replace function public.claim_venue_message_push(
  p_venue_id text,
  p_owner_id uuid,
  p_body text,
  p_daily_cap integer,
  p_max_idle_days integer default 60
)
returns table (outcome text, message_id uuid, device_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer := greatest(1, least(coalesce(p_daily_cap, 2), 20));
  v_idle integer := greatest(1, least(coalesce(p_max_idle_days, 60), 365));
  v_tz text;
  v_day text;
  v_sent_today integer;
  v_ids uuid[];
  v_tokens text[];
  v_message uuid;
begin
  if p_venue_id is null or p_body is null or char_length(p_body) not between 1 and 150 then
    raise exception 'claim_venue_message_push: venue and a 1-150 character message are required';
  end if;

  -- One bar's sends and reports run one at a time: the cap and a pause can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('push_venue_messages:' || p_venue_id, 0));

  select coalesce(nullif(v.timezone, ''), 'America/New_York') into v_tz from venues v where v.id = p_venue_id;
  if not found then
    return query select 'unknown_venue'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if exists (select 1 from push_venue_message_pauses p where p.venue_id = p_venue_id) then
    return query select 'paused'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  begin
    v_day := to_char(now() at time zone v_tz, 'YYYY-MM-DD');
  exception when others then
    v_day := to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD');
  end;

  select count(*)::integer into v_sent_today
  from push_venue_messages m
  where m.venue_id = p_venue_id and m.local_date = v_day;
  if v_sent_today >= v_cap then
    return query select 'capped'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  select array_agg(d.id order by d.id), array_agg(d.token order by d.id)
  into v_ids, v_tokens
  from push_devices d
  where d.disabled_at is null
    and d.notify_news
    and d.last_seen_at >= now() - make_interval(days => v_idle)
    and exists (
      select 1
      from users u
      where u.venue_id = p_venue_id
        and (u.id = d.user_id or (d.account_id is not null and u.account_id = d.account_id))
    );
  if v_ids is null then
    return query select 'no_audience'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  insert into push_venue_messages (venue_id, owner_id, body, local_date, devices)
  values (p_venue_id, p_owner_id, p_body, v_day, cardinality(v_ids))
  returning id into v_message;

  return query select 'claimed'::text, v_message, x.id, x.token from unnest(v_ids, v_tokens) as x(id, token);
end;
$$;

-- ── 5. A player of the bar reads or reports a message ───────────────────────────────────────

-- True when the venue profile p_user_id is at the bar, or its account has a profile there.
create or replace function public.is_venue_message_reader(p_venue_id text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from users me
    where me.id = p_user_id
      and (
        me.venue_id = p_venue_id
        or (me.account_id is not null and exists (
          select 1 from users other where other.account_id = me.account_id and other.venue_id = p_venue_id
        ))
      )
  );
$$;

create or replace function public.read_venue_message(p_message_id uuid, p_user_id uuid)
returns table (venue_id text, body text, sent_at timestamptz, reported boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.venue_id, m.body, m.sent_at,
    exists (select 1 from push_venue_message_reports r where r.message_id = m.id and r.user_id = p_user_id)
  from push_venue_messages m
  where m.id = p_message_id and is_venue_message_reader(m.venue_id, p_user_id);
$$;

-- Outcomes: 'reported' | 'already_reported' | 'not_found' (no such message, or not a player of
-- that bar — the same answer, so a stranger learns nothing). `paused` = the bar can't send now.
create or replace function public.report_venue_message(
  p_message_id uuid,
  p_user_id uuid,
  p_pause_threshold integer
)
returns table (outcome text, paused boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold integer := greatest(1, least(coalesce(p_pause_threshold, 3), 100));
  v_venue text;
  v_count integer;
  v_inserted integer;
begin
  select m.venue_id into v_venue from push_venue_messages m where m.id = p_message_id;
  if v_venue is null or p_user_id is null or not is_venue_message_reader(v_venue, p_user_id) then
    return query select 'not_found'::text, false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push_venue_messages:' || v_venue, 0));

  insert into push_venue_message_reports (message_id, user_id)
  values (p_message_id, p_user_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  select count(*)::integer into v_count from push_venue_message_reports r where r.message_id = p_message_id;
  if v_count >= v_threshold then
    insert into push_venue_message_pauses (venue_id, reason, message_id)
    values (v_venue, 'reports', p_message_id)
    on conflict (venue_id) do nothing;
  end if;

  return query select
    case when v_inserted = 1 then 'reported' else 'already_reported' end,
    exists (select 1 from push_venue_message_pauses p where p.venue_id = v_venue);
end;
$$;

-- Server only (lib/push/venueMessages.ts). Players and partners never call these directly.
revoke all on function public.claim_venue_message_push(text, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_venue_message_push(text, uuid, text, integer, integer) to service_role;
revoke all on function public.is_venue_message_reader(text, uuid) from public, anon, authenticated;
grant execute on function public.is_venue_message_reader(text, uuid) to service_role;
revoke all on function public.read_venue_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_venue_message(uuid, uuid) to service_role;
revoke all on function public.report_venue_message(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.report_venue_message(uuid, uuid, integer) to service_role;
