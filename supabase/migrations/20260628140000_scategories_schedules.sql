-- Scategories scheduling: time-windowed recurring availability per venue.
-- Mirrors the trivia_schedules pattern but scoped per venue with a window duration.

create table if not exists public.scategories_schedules (
  id              uuid primary key default gen_random_uuid(),
  venue_id        text not null references public.venues(id) on delete cascade,
  title           text not null,
  start_time      timestamptz not null,
  timezone        text not null default 'America/New_York',
  recurring_type  text not null default 'none'
                    check (recurring_type in ('none', 'daily', 'weekly')),
  recurring_days  text[] not null default '{}',
  window_minutes  int not null default 240
                    check (window_minutes >= 30 and window_minutes <= 720),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_scategories_schedules_venue
  on public.scategories_schedules (venue_id);

create index if not exists idx_scategories_schedules_start_time
  on public.scategories_schedules (start_time);

drop trigger if exists scategories_schedules_set_updated_at on public.scategories_schedules;
create trigger scategories_schedules_set_updated_at
  before update on public.scategories_schedules
  for each row execute function set_updated_at();

alter table public.scategories_schedules enable row level security;
alter table public.scategories_schedules force row level security;

revoke all on table public.scategories_schedules from anon, authenticated;
grant select on table public.scategories_schedules to authenticated;

drop policy if exists "players can view schedules for their venue" on public.scategories_schedules;
create policy "players can view schedules for their venue"
  on public.scategories_schedules
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.venue_id = scategories_schedules.venue_id
        and u.auth_id = (select auth.uid())
    )
  );
