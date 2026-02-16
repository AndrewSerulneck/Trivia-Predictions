-- Add ad_events table for time-windowed advertising analytics

create table if not exists ad_events (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references advertisements(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'click')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_events_ad_time on ad_events(ad_id, created_at desc);
create index if not exists idx_ad_events_type_time on ad_events(event_type, created_at desc);
create index if not exists idx_ad_events_created_at on ad_events(created_at desc);

alter table ad_events enable row level security;

drop policy if exists "Admins can read ad events" on ad_events;
create policy "Admins can read ad events"
  on ad_events for select
  using (
    exists (
      select 1 from users where auth_id = auth.uid() and is_admin = true
    )
  );
