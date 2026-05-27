-- Username change abuse-prevention support:
-- - attempt logging (success/failure)
-- - durable data source for rate limiting policies

create extension if not exists pgcrypto;

create table if not exists public.username_change_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  venue_id text references public.venues(id) on delete set null,
  requested_username text,
  requested_username_normalized text,
  success boolean not null default false,
  failure_reason text,
  requester_auth_id uuid references auth.users(id) on delete set null,
  requester_ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_username_change_attempts_user_created_at
  on public.username_change_attempts (user_id, created_at desc);

create index if not exists idx_username_change_attempts_venue_created_at
  on public.username_change_attempts (venue_id, created_at desc);

create index if not exists idx_username_change_attempts_success_created_at
  on public.username_change_attempts (success, created_at desc);

alter table public.username_change_attempts enable row level security;
alter table public.username_change_attempts force row level security;

revoke all on table public.username_change_attempts from anon, authenticated;

drop policy if exists "username_change_attempts_no_direct_access" on public.username_change_attempts;
create policy "username_change_attempts_no_direct_access"
  on public.username_change_attempts
  for all
  to authenticated
  using (false)
  with check (false);
