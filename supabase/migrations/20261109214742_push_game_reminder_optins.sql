-- Away-mode plan (docs/cancelled-prizes-pick-windows-away-mode-plan.md) Phase C3: "Remind me".
--
-- A player taps "Remind me" on the next Live Trivia game in Venue Home (at the bar or away). One push
-- goes to their phones 1 hour before it starts, sent by the existing 5-minute sweep in
-- /api/cron/resolve-live-trivia-winners (lib/push/gameReminders.ts). No new cron.
--
-- Two parts:
--   1. public.push_game_reminder_optins — one row per (player profile, game). Written only by
--      lib/gameReminderOptIns.ts from POST/DELETE /api/push/game-reminders (signed session). The browser
--      never reads or writes it, so service_role grants only.
--   2. public.claim_game_reminder_optins() — claims the opt-ins for the games the sweep says are inside
--      the hour (stamps reminded_at once, under row locks, so overlapping or retried runs send nothing
--      twice) and returns each one with the phones it should go to.
--
-- A game is keyed exactly like the "starts soon" ledger (push_game_reminders): schedule + its local
-- occurrence date. A deleted schedule takes its opt-ins with it (cascade). A schedule edited to another
-- day leaves the old row unclaimed forever (the sweep only asks for games that are really on); rows are
-- tiny and starts_at is indexed for a later cleanup.
--
-- Account deletion: user_id is ON DELETE CASCADE, so delete_player_account removes the rows with the
-- player (tests/account-deletion-contract.test.ts only requires explicit handling for SET NULL).
--
-- Cost: one insert or delete per tap. The sweep calls the claim only while a game is inside the hour
-- (at most 12 runs per game), an index lookup on the unclaimed rows of those games. Proven by
-- `npm run test:push-sql`.

-- ── 1. Opt-ins ──────────────────────────────────────────────────────────────────────────────

create table public.push_game_reminder_optins (
  user_id uuid not null references public.users(id) on delete cascade,
  schedule_id uuid not null references public.trivia_schedules(id) on delete cascade,
  -- The occurrence's date in the schedule's own timezone (lib/liveShowdownEngine.ts occurrenceDate).
  occurrence_date text not null,
  venue_id text not null,
  -- The start the player saw when they tapped. The sweep uses the live schedule, never this.
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Set once when the reminder is claimed for sending. Never cleared.
  reminded_at timestamptz,
  constraint push_game_reminder_optins_pkey primary key (user_id, schedule_id, occurrence_date),
  constraint push_game_reminder_optins_occurrence_date_format check (occurrence_date ~ '^\d{4}-\d{2}-\d{2}$')
);

create index push_game_reminder_optins_game_idx
  on public.push_game_reminder_optins (schedule_id, occurrence_date)
  where reminded_at is null;
create index push_game_reminder_optins_starts_at_idx on public.push_game_reminder_optins (starts_at);

alter table public.push_game_reminder_optins enable row level security;
alter table public.push_game_reminder_optins force row level security;
-- Server only: the browser never reads or writes it directly.
revoke all on table public.push_game_reminder_optins from anon, authenticated;
grant select, insert, update, delete on table public.push_game_reminder_optins to service_role;

-- ── 2. Claim the opt-ins of games starting within the hour ──────────────────────────────────
-- p_schedule_ids[i] + p_occurrence_dates[i] name one game (the arrays are zipped; at most 200 games).
-- Stamps reminded_at on every unclaimed opt-in of those games — whether or not its player has a phone,
-- so an opt-in is looked at once — and returns one row per (opt-in, live phone). A phone belongs to the
-- opt-in's player when the same venue profile registered it, or any profile of the same account. The
-- player asked for this push by tapping, so the "Group games starting" switch is not consulted; a
-- disabled (dead) phone never gets it.

create or replace function public.claim_game_reminder_optins(
  p_schedule_ids uuid[],
  p_occurrence_dates text[]
)
returns table (
  schedule_id uuid,
  occurrence_date text,
  user_id uuid,
  device_id uuid,
  token text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(cardinality(p_schedule_ids), 0) <> coalesce(cardinality(p_occurrence_dates), 0) then
    raise exception 'claim_game_reminder_optins: the two arrays must be the same length';
  end if;
  if coalesce(cardinality(p_schedule_ids), 0) > 200 then
    raise exception 'claim_game_reminder_optins: at most 200 games per call';
  end if;

  return query
  with games as (
    select g.schedule_id, g.occurrence_date
    from unnest(p_schedule_ids, p_occurrence_dates) as g(schedule_id, occurrence_date)
  ),
  claimed as (
    update push_game_reminder_optins o
    set reminded_at = now()
    from games g
    where o.schedule_id = g.schedule_id
      and o.occurrence_date = g.occurrence_date
      and o.reminded_at is null
    returning o.schedule_id, o.occurrence_date, o.user_id
  )
  select cl.schedule_id, cl.occurrence_date, cl.user_id, d.id, d.token
  from claimed cl
  join users u on u.id = cl.user_id
  join push_devices d
    on d.disabled_at is null
   and (d.user_id = cl.user_id or (u.account_id is not null and d.account_id = u.account_id))
  order by cl.schedule_id, cl.occurrence_date, cl.user_id, d.id;
end;
$$;

-- Server only (lib/push/gameReminders.ts). Players never call it.
revoke all on function public.claim_game_reminder_optins(uuid[], text[]) from public, anon, authenticated;
grant execute on function public.claim_game_reminder_optins(uuid[], text[]) to service_role;
