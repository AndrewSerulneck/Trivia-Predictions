-- Native app store plan (docs/native-app-store-plan.md) Phase 10.1: partner-message reports count
-- PEOPLE, and an admin's un-pause sticks. Fixes two findings of the 2026-10-26 code review in
-- 20261023145024_push_venue_messages.sql (which stays as history):
--
--   F1. report_venue_message counted report rows per venue PROFILE (users.id), but every profile of
--       one account may read and report. One player with profiles at three bars could reach the pause
--       threshold alone. Now a reporter is a PERSON: the account, or the profile when it has none
--       (venue_message_reporter — the one home of that rule). A second profile of the same person
--       gets 'already_reported' and adds nothing.
--   F2. An admin's un-pause deleted the pause row, and the next report call on the old message (even
--       an 'already_reported' one) still counted ≥ the threshold and paused the bar again. Now:
--       * an un-pause is unpause_venue_messages(), which deletes the pause AND stamps
--         push_venue_messages.reports_reviewed_at on all of the bar's messages, in one transaction
--         under the bar's lock;
--       * only reports made after that review count;
--       * the pause check runs only on a call that added a report.
--
-- Accepted limitation: a person can still make a second account. The threshold is a safety valve,
-- not proof; the admin pause / un-pause is the real control. Profiles with no account count once each.
--
-- No new table, view or sequence (so no new grants beyond the functions'). Same signatures and return
-- types for read_venue_message and report_venue_message, so their grants carry over. Production had
-- 0 rows in all three push_venue_message* tables on 2026-10-26. Cost: one more indexed lookup per
-- report (≤ one per player tap); one small RPC per admin panel open and per un-pause. No cron.
-- Proven by `npm run test:push-sql`. To roll the logic back: a further migration restoring the
-- function bodies from 20261023145024; the column is harmless left in place.

-- ── 1. When an admin last reviewed a message's reports ─────────────────────────────────────

alter table public.push_venue_messages add column reports_reviewed_at timestamptz;

-- ── 2. Who a reporter is: the account, or the profile when there is no account ──────────────

create or replace function public.venue_message_reporter(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(u.account_id::text, u.id::text) from users u where u.id = p_user_id;
$$;

-- Reports since the message's last review, counted in people. What drives a pause and what the
-- admin panel shows.
create or replace function public.venue_message_report_count(p_message_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct venue_message_reporter(r.user_id))::integer
  from push_venue_message_reports r
  join push_venue_messages m on m.id = r.message_id
  where r.message_id = p_message_id
    and r.reported_at > coalesce(m.reports_reviewed_at, '-infinity'::timestamptz);
$$;

-- The admin panel: one call for the messages it lists.
create or replace function public.venue_message_report_counts(p_message_ids uuid[])
returns table (message_id uuid, reports integer)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, venue_message_report_count(m.id)
  from push_venue_messages m
  where m.id = any(p_message_ids);
$$;

-- ── 3. Read: "you reported this" for any profile of the same person ─────────────────────────

create or replace function public.read_venue_message(p_message_id uuid, p_user_id uuid)
returns table (venue_id text, body text, sent_at timestamptz, reported boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.venue_id, m.body, m.sent_at,
    exists (
      select 1 from push_venue_message_reports r
      where r.message_id = m.id
        and venue_message_reporter(r.user_id) = venue_message_reporter(p_user_id)
    )
  from push_venue_messages m
  where m.id = p_message_id and is_venue_message_reader(m.venue_id, p_user_id);
$$;

-- ── 4. Report: one per person; the pause check only on a new report ─────────────────────────
-- Outcomes unchanged: 'reported' | 'already_reported' | 'not_found'. `paused` = the bar can't send now.

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
  v_reporter text;
begin
  select m.venue_id into v_venue from push_venue_messages m where m.id = p_message_id;
  if v_venue is null or p_user_id is null or not is_venue_message_reader(v_venue, p_user_id) then
    return query select 'not_found'::text, false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push_venue_messages:' || v_venue, 0));

  v_reporter := venue_message_reporter(p_user_id);
  if exists (
    select 1 from push_venue_message_reports r
    where r.message_id = p_message_id and venue_message_reporter(r.user_id) = v_reporter
  ) then
    return query select 'already_reported'::text,
      exists (select 1 from push_venue_message_pauses p where p.venue_id = v_venue);
    return;
  end if;

  insert into push_venue_message_reports (message_id, user_id) values (p_message_id, p_user_id);

  if venue_message_report_count(p_message_id) >= v_threshold then
    insert into push_venue_message_pauses (venue_id, reason, message_id)
    values (v_venue, 'reports', p_message_id)
    on conflict (venue_id) do nothing;
  end if;

  return query select 'reported'::text,
    exists (select 1 from push_venue_message_pauses p where p.venue_id = v_venue);
end;
$$;

-- ── 5. Admin un-pause: delete the pause and mark the bar's reports reviewed, together ───────
-- Returns true when the bar was paused.

create or replace function public.unpause_venue_messages(p_venue_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_venue_id is null then
    raise exception 'unpause_venue_messages: venue is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push_venue_messages:' || p_venue_id, 0));

  delete from push_venue_message_pauses p where p.venue_id = p_venue_id;
  get diagnostics v_deleted = row_count;
  update push_venue_messages m set reports_reviewed_at = now() where m.venue_id = p_venue_id;

  return v_deleted > 0;
end;
$$;

-- Server only (lib/push/venueMessages.ts). Players, partners and admins' browsers never call these.
revoke all on function public.venue_message_reporter(uuid) from public, anon, authenticated;
grant execute on function public.venue_message_reporter(uuid) to service_role;
revoke all on function public.venue_message_report_count(uuid) from public, anon, authenticated;
grant execute on function public.venue_message_report_count(uuid) to service_role;
revoke all on function public.venue_message_report_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.venue_message_report_counts(uuid[]) to service_role;
revoke all on function public.unpause_venue_messages(text) from public, anon, authenticated;
grant execute on function public.unpause_venue_messages(text) to service_role;
-- read_venue_message / report_venue_message keep their 20261023145024 grants (same signatures);
-- restated so this file alone is the whole truth.
revoke all on function public.read_venue_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_venue_message(uuid, uuid) to service_role;
revoke all on function public.report_venue_message(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.report_venue_message(uuid, uuid, integer) to service_role;
