create table if not exists venue_presence_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  venue_id text not null references venues(id) on delete cascade,
  event_type text not null,
  presence_code text,
  status text not null,
  source text not null default 'heartbeat',
  expires_at timestamptz,
  distance_meters integer,
  allowed_distance_meters integer,
  accuracy_meters integer,
  lease_ttl_ms integer,
  created_at timestamptz not null default now(),
  constraint venue_presence_events_type_valid check (
    event_type in (
      'verified',
      'out_of_range',
      'location_unavailable',
      'expired',
      'required',
      'profile_mismatch',
      'unavailable'
    )
  ),
  constraint venue_presence_events_status_valid check (
    status in ('active', 'out_of_range', 'location_unavailable', 'expired', 'revoked', 'missing')
  ),
  constraint venue_presence_events_source_valid check (
    source in ('join', 'heartbeat', 'server')
  ),
  constraint venue_presence_events_distance_non_negative check (
    distance_meters is null or distance_meters >= 0
  ),
  constraint venue_presence_events_allowed_distance_non_negative check (
    allowed_distance_meters is null or allowed_distance_meters >= 0
  ),
  constraint venue_presence_events_accuracy_non_negative check (
    accuracy_meters is null or accuracy_meters >= 0
  ),
  constraint venue_presence_events_lease_ttl_non_negative check (
    lease_ttl_ms is null or lease_ttl_ms >= 0
  )
);

create index if not exists idx_venue_presence_events_venue_created
  on venue_presence_events(venue_id, created_at desc);

create index if not exists idx_venue_presence_events_venue_type_created
  on venue_presence_events(venue_id, event_type, created_at desc);

create index if not exists idx_venue_presence_events_user_venue_created
  on venue_presence_events(user_id, venue_id, created_at desc);

create index if not exists idx_venue_presence_events_type_created
  on venue_presence_events(event_type, created_at desc);

alter table venue_presence_events enable row level security;
