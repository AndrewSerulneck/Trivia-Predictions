-- Passkey-first auth foundation:
-- - Adds multi-device passkey storage per user profile
-- - Adds one-time WebAuthn challenge storage
-- - Adds case-insensitive username normalization support
-- - Adds username change audit trail
--
-- NOTE: This migration intentionally preserves existing venue-scoped gameplay
-- and points behavior by keeping username uniqueness scoped to (venue_id, username).

create extension if not exists pgcrypto;

-- 1) Username normalization support on users (case-insensitive login lookups).
alter table public.users
  add column if not exists username_normalized text;

create or replace function public.set_users_username_normalized()
returns trigger
language plpgsql
as $$
begin
  new.username_normalized := lower(btrim(new.username));
  return new;
end;
$$;

drop trigger if exists users_set_username_normalized on public.users;
create trigger users_set_username_normalized
before insert or update of username
on public.users
for each row
execute function public.set_users_username_normalized();

update public.users
set username_normalized = lower(btrim(username))
where username_normalized is distinct from lower(btrim(username));

alter table public.users
  alter column username_normalized set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_username_normalized_matches'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_username_normalized_matches
      check (username_normalized = lower(btrim(username)));
  end if;
end
$$;

-- Replace legacy expression index with normalized-column unique index.
drop index if exists public.users_unique_username_per_venue_ci;
create unique index if not exists users_unique_username_per_venue_normalized_ci
  on public.users (venue_id, username_normalized);

create index if not exists idx_users_username_normalized_lookup
  on public.users (username_normalized);

-- 2) Multi-device passkey credentials per user profile.
create table if not exists public.user_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  credential_id_b64url text not null,
  public_key_b64url text not null,
  sign_count bigint not null default 0,
  transports text[] not null default '{}',
  aaguid uuid,
  device_type text,
  backed_up boolean,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint user_passkeys_sign_count_non_negative check (sign_count >= 0),
  constraint user_passkeys_device_type_valid check (
    device_type is null or device_type in ('singleDevice', 'multiDevice')
  ),
  constraint user_passkeys_credential_id_unique unique (credential_id_b64url)
);

create index if not exists idx_user_passkeys_user_id
  on public.user_passkeys (user_id);

create index if not exists idx_user_passkeys_user_id_created_at
  on public.user_passkeys (user_id, created_at desc);

drop trigger if exists user_passkeys_set_updated_at on public.user_passkeys;
create trigger user_passkeys_set_updated_at
before update on public.user_passkeys
for each row execute function public.set_updated_at();

-- 3) Short-lived, one-time WebAuthn challenges.
create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  flow_type text not null,
  challenge_b64url text not null,
  rp_id text not null,
  origin text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint webauthn_challenges_flow_type_valid check (
    flow_type in ('registration', 'authentication')
  ),
  constraint webauthn_challenges_challenge_unique unique (challenge_b64url),
  constraint webauthn_challenges_expiry_after_create check (expires_at > created_at),
  constraint webauthn_challenges_used_after_create check (
    used_at is null or used_at >= created_at
  )
);

create index if not exists idx_webauthn_challenges_user_flow
  on public.webauthn_challenges (user_id, flow_type);

create index if not exists idx_webauthn_challenges_expires_at
  on public.webauthn_challenges (expires_at);

-- 4) Username change audit trail.
create table if not exists public.username_change_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  old_username text not null,
  new_username text not null,
  old_username_normalized text not null,
  new_username_normalized text not null,
  changed_by_auth_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  reason text
);

create index if not exists idx_username_change_audit_user_changed_at
  on public.username_change_audit (user_id, changed_at desc);

create index if not exists idx_username_change_audit_changed_by_auth
  on public.username_change_audit (changed_by_auth_id);

-- 5) RLS + explicit grants/policies (secure checklist).
alter table public.user_passkeys enable row level security;
alter table public.user_passkeys force row level security;

alter table public.webauthn_challenges enable row level security;
alter table public.webauthn_challenges force row level security;

alter table public.username_change_audit enable row level security;
alter table public.username_change_audit force row level security;

-- API access defaults: deny anon/authenticated.
-- Server-side routes should use service role for these tables.
revoke all on table public.user_passkeys from anon, authenticated;
revoke all on table public.webauthn_challenges from anon, authenticated;
revoke all on table public.username_change_audit from anon, authenticated;

-- user_passkeys policies: ownership-safe if explicit grants are introduced later.
drop policy if exists "user_passkeys_select_own" on public.user_passkeys;
create policy "user_passkeys_select_own"
  on public.user_passkeys
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_passkeys.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists "user_passkeys_insert_own" on public.user_passkeys;
create policy "user_passkeys_insert_own"
  on public.user_passkeys
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = user_passkeys.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists "user_passkeys_update_own" on public.user_passkeys;
create policy "user_passkeys_update_own"
  on public.user_passkeys
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_passkeys.user_id
        and u.auth_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = user_passkeys.user_id
        and u.auth_id = (select auth.uid())
    )
  );

drop policy if exists "user_passkeys_delete_own" on public.user_passkeys;
create policy "user_passkeys_delete_own"
  on public.user_passkeys
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = user_passkeys.user_id
        and u.auth_id = (select auth.uid())
    )
  );

-- Challenge table is server-only (even if grants are added later).
drop policy if exists "webauthn_challenges_no_direct_access" on public.webauthn_challenges;
create policy "webauthn_challenges_no_direct_access"
  on public.webauthn_challenges
  for all
  to authenticated
  using (false)
  with check (false);

-- Audit table is server-only (even if grants are added later).
drop policy if exists "username_change_audit_no_direct_access" on public.username_change_audit;
create policy "username_change_audit_no_direct_access"
  on public.username_change_audit
  for all
  to authenticated
  using (false)
  with check (false);
