-- Hightop Challenge TV app: short-lived connect codes (docs/fire-tv-app-plan.md Phase 3).
--
-- The TV's Connect screen shows a QR code with a 6-character pair code. A signed-in partner scans it and taps
-- Connect, which sets venue_id here. The TV polls with its secret (only the hash is stored), reads the venue id
-- once, and the row is deleted. Rows live at most 10 minutes; expired rows are deleted by the next
-- POST /api/tv-app/pairings (no cron).
--
-- A connection grants a venue id only (plan D9): no partner session, no privilege. Server-only table: the browser
-- never reads or writes it (lib/tvConnect.ts through lib/supabaseAdmin.ts).

create table public.tv_device_pairings (
  id uuid primary key default gen_random_uuid(),
  pair_code text not null,
  poll_secret_hash text not null,
  venue_id text null references public.venues (id) on delete cascade, -- venues.id is text
  claimed_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  constraint tv_device_pairings_pair_code_format check (pair_code ~ '^[0-9A-HJKMNP-TV-Z]{6}$'),
  constraint tv_device_pairings_secret_hash_format check (poll_secret_hash ~ '^[0-9a-f]{64}$'),
  constraint tv_device_pairings_claim_consistent check ((venue_id is null) = (claimed_at is null))
);

create unique index tv_device_pairings_pair_code_key on public.tv_device_pairings (pair_code);
create unique index tv_device_pairings_poll_secret_hash_key on public.tv_device_pairings (poll_secret_hash);
create index tv_device_pairings_expires_at_idx on public.tv_device_pairings (expires_at);

alter table public.tv_device_pairings enable row level security;
alter table public.tv_device_pairings force row level security;

revoke all on table public.tv_device_pairings from anon, authenticated;
grant select, insert, update, delete on table public.tv_device_pairings to service_role;
