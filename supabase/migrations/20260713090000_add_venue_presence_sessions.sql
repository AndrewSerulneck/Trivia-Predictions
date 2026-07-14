create table if not exists venue_presence_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  venue_id text not null references venues(id) on delete restrict,
  status text not null default 'active',
  last_verified_at timestamptz,
  expires_at timestamptz not null,
  last_distance_meters integer,
  last_accuracy_meters integer,
  source text not null default 'heartbeat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_presence_sessions_status_valid check (
    status in ('active', 'out_of_range', 'location_unavailable', 'expired', 'revoked')
  ),
  constraint venue_presence_sessions_source_valid check (
    source in ('join', 'heartbeat', 'server')
  ),
  constraint venue_presence_sessions_distance_non_negative check (
    last_distance_meters is null or last_distance_meters >= 0
  ),
  constraint venue_presence_sessions_accuracy_non_negative check (
    last_accuracy_meters is null or last_accuracy_meters >= 0
  )
);

create unique index if not exists idx_venue_presence_sessions_user_venue
  on venue_presence_sessions(user_id, venue_id);

create index if not exists idx_venue_presence_sessions_active_expiry
  on venue_presence_sessions(venue_id, expires_at)
  where status = 'active';

create index if not exists idx_venue_presence_sessions_user_expiry
  on venue_presence_sessions(user_id, expires_at);

drop trigger if exists venue_presence_sessions_set_updated_at on venue_presence_sessions;
create trigger venue_presence_sessions_set_updated_at
before update on venue_presence_sessions
for each row execute function set_updated_at();

alter table venue_presence_sessions enable row level security;

drop policy if exists "Users can read own venue presence sessions" on venue_presence_sessions;
create policy "Users can read own venue presence sessions"
  on venue_presence_sessions for select
  using (user_id in (select id from users where auth_id = auth.uid()));
