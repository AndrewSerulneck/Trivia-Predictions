-- Native app store plan (docs/native-app-store-plan.md) Phase 5.4: "News from your bars" pushes.
--
-- When a partner saves a NEW game or prize, the players of that bar whose phone has the new
-- "News from your bars" switch on get one push. Three parts:
--   1. push_devices.notify_news — the 4th switch. Default ON: the 5.4 ask states it before the
--      player taps Turn on (Apple 4.5.4), and the menu turns it off. Andrew (2026-10-23): the only
--      phone opted in before 5.4 is his own and stays on, so existing rows take the default too.
--   2. public.push_venue_news — the once-only ledger: one row per game or prize ever announced,
--      claimed BEFORE anything is sent (a retried save never pushes twice), and the count behind
--      the per-bar daily cap (counted on the bar's own local date, venues.timezone).
--   3. public.claim_venue_news_push() — under one advisory lock per bar: refuses a repeat, refuses
--      past the cap, reads the audience once, records the claim, and returns the phones. The cap
--      value itself is passed in from lib/push/venueNews.ts (VENUE_NEWS_DAILY_CAP, one constant).
--
-- Who is "a player of that bar": a phone whose venue profile, or any profile of the same account,
-- has a users row at the bar. A bar with no such phone records nothing (the cap counts pushes sent).
--
-- Cost: one RPC per partner save (a new game or prize; a few per bar per week), none otherwise.
-- No cron. Proven by `npm run test:push-sql`.

-- ── 1. The switch ───────────────────────────────────────────────────────────────────────────

alter table public.push_devices add column if not exists notify_news boolean not null default true;

-- ── 2. The ledger ───────────────────────────────────────────────────────────────────────────

create table public.push_venue_news (
  kind text not null,
  -- The schedule id (game) or challenge_campaigns id (prize). Text so both engines' ids fit.
  source_id text not null,
  venue_id text not null references public.venues(id) on delete cascade,
  -- The bar's local date when it was claimed: what the daily cap counts.
  local_date text not null,
  devices integer not null default 0,
  claimed_at timestamptz not null default now(),
  constraint push_venue_news_pkey primary key (kind, source_id),
  constraint push_venue_news_kind_valid check (kind in ('game', 'prize')),
  constraint push_venue_news_source_length check (char_length(source_id) between 1 and 128),
  constraint push_venue_news_local_date_format check (local_date ~ '^\d{4}-\d{2}-\d{2}$')
);

create index push_venue_news_venue_day_idx on public.push_venue_news (venue_id, local_date);

alter table public.push_venue_news enable row level security;
alter table public.push_venue_news force row level security;
revoke all on table public.push_venue_news from anon, authenticated;
grant select, insert, update, delete on table public.push_venue_news to service_role;

-- ── 3. Claim one announcement ───────────────────────────────────────────────────────────────
-- Returns ONE row with a null phone when nothing is sent ('duplicate', 'capped', 'unknown_venue',
-- 'no_audience'), else one 'claimed' row per phone.

create or replace function public.claim_venue_news_push(
  p_venue_id text,
  p_kind text,
  p_source_id text,
  p_daily_cap integer,
  p_max_idle_days integer default 60
)
returns table (outcome text, device_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer := greatest(1, least(coalesce(p_daily_cap, 5), 50));
  v_idle integer := greatest(1, least(coalesce(p_max_idle_days, 60), 365));
  v_tz text;
  v_day text;
  v_sent_today integer;
  v_ids uuid[];
  v_tokens text[];
begin
  if p_kind is null or p_kind not in ('game', 'prize') then
    raise exception 'claim_venue_news_push: unknown kind %', p_kind;
  end if;
  if p_venue_id is null or p_source_id is null or char_length(p_source_id) not between 1 and 128 then
    raise exception 'claim_venue_news_push: venue and source are required';
  end if;

  -- One bar's claims run one at a time, so the cap and the repeat check can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('push_venue_news:' || p_venue_id, 0));

  if exists (select 1 from push_venue_news n where n.kind = p_kind and n.source_id = p_source_id) then
    return query select 'duplicate'::text, null::uuid, null::text;
    return;
  end if;

  select coalesce(nullif(v.timezone, ''), 'America/New_York') into v_tz from venues v where v.id = p_venue_id;
  if not found then
    return query select 'unknown_venue'::text, null::uuid, null::text;
    return;
  end if;
  begin
    v_day := to_char(now() at time zone v_tz, 'YYYY-MM-DD');
  exception when others then
    v_day := to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD');
  end;

  select count(*)::integer into v_sent_today
  from push_venue_news n
  where n.venue_id = p_venue_id and n.local_date = v_day;
  if v_sent_today >= v_cap then
    return query select 'capped'::text, null::uuid, null::text;
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
    return query select 'no_audience'::text, null::uuid, null::text;
    return;
  end if;

  insert into push_venue_news (kind, source_id, venue_id, local_date, devices)
  values (p_kind, p_source_id, p_venue_id, v_day, cardinality(v_ids));

  return query select 'claimed'::text, x.id, x.token from unnest(v_ids, v_tokens) as x(id, token);
end;
$$;

-- Server only (lib/push/venueNews.ts). Players and partners never call it.
revoke all on function public.claim_venue_news_push(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_venue_news_push(text, text, text, integer, integer) to service_role;
