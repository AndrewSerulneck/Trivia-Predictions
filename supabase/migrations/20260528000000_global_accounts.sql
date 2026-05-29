-- Global account layer for auth-first redesign.
--
-- Users authenticate against a global `accounts` row (username + PIN + passkey).
-- The existing `users` table becomes a venue-scoped profile: account_id + venue_id + points.
-- Passkeys and WebAuthn challenges are now linked to accounts, not venue profiles.
--
-- Migration strategy:
-- 1. Create accounts table.
-- 2. Seed it from existing users (one account per unique username_normalized).
-- 3. Add account_id FK to users, user_passkeys, webauthn_challenges.
-- 4. Back-fill account_id from the seeded accounts.
-- 5. Enforce (account_id, venue_id) uniqueness on users.
-- 6. Add RLS: accounts are server-role–only.

-- ── 1. Global accounts table ─────────────────────────────────────────────────

create table if not exists public.accounts (
  id                  uuid        primary key default gen_random_uuid(),
  auth_id             uuid        references auth.users(id) on delete set null,
  username            text        not null,
  username_normalized text        not null,
  pin_salt            text,
  pin_hash            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint accounts_username_normalized_matches
    check (username_normalized = lower(btrim(username)))
);

create unique index if not exists accounts_username_normalized_unique
  on public.accounts (username_normalized);

create unique index if not exists accounts_auth_id_unique
  on public.accounts (auth_id) where auth_id is not null;

create index if not exists idx_accounts_username_normalized
  on public.accounts (username_normalized);

create or replace function public.set_accounts_username_normalized()
returns trigger language plpgsql as $$
begin
  new.username_normalized := lower(btrim(new.username));
  return new;
end;
$$;

drop trigger if exists accounts_set_username_normalized on public.accounts;
create trigger accounts_set_username_normalized
  before insert or update of username on public.accounts
  for each row execute function public.set_accounts_username_normalized();

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ── 2. Seed accounts from existing users ─────────────────────────────────────
-- One account per unique username_normalized; earliest created_at wins for PIN data.

-- auth_id is intentionally seeded as NULL: multiple venue profiles can share
-- the same Supabase auth_id, which would violate the partial unique index.
-- The new account system identifies accounts by accounts.id, not auth_id.
insert into public.accounts
  (auth_id, username, username_normalized, pin_salt, pin_hash, created_at)
select distinct on (username_normalized)
  null::uuid as auth_id,
  username,
  username_normalized,
  pin_salt,
  pin_hash,
  created_at
from public.users
where username_normalized is not null
order by username_normalized, created_at asc
on conflict (username_normalized) do nothing;

-- ── 3a. Add account_id to users ───────────────────────────────────────────────

alter table public.users
  add column if not exists account_id uuid
  references public.accounts(id) on delete cascade;

create index if not exists idx_users_account_id
  on public.users (account_id);

-- ── 3b. Back-fill users.account_id ───────────────────────────────────────────

update public.users u
set account_id = a.id
from public.accounts a
where u.username_normalized = a.username_normalized
  and u.account_id is null;

-- ── 3c. Unique: one profile per account per venue ─────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_account_venue_unique'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_account_venue_unique unique (account_id, venue_id);
  end if;
end;
$$;

-- ── 4. Add account_id to user_passkeys ───────────────────────────────────────

alter table public.user_passkeys
  add column if not exists account_id uuid
  references public.accounts(id) on delete cascade;

create index if not exists idx_user_passkeys_account_id
  on public.user_passkeys (account_id);

create index if not exists idx_user_passkeys_account_credential
  on public.user_passkeys (account_id, credential_id_b64url);

update public.user_passkeys pk
set account_id = u.account_id
from public.users u
where pk.user_id = u.id
  and u.account_id is not null
  and pk.account_id is null;

-- ── 5. Add account_id to webauthn_challenges ──────────────────────────────────

alter table public.webauthn_challenges
  add column if not exists account_id uuid
  references public.accounts(id) on delete cascade;

create index if not exists idx_webauthn_challenges_account_id
  on public.webauthn_challenges (account_id);

-- Back-fill only active (unexpired, unused) challenges; stale ones don't matter.
update public.webauthn_challenges wc
set account_id = u.account_id
from public.users u
where wc.user_id = u.id
  and u.account_id is not null
  and wc.account_id is null
  and wc.used_at is null
  and wc.expires_at > now();

-- ── 6. RLS for accounts (server-role–only) ────────────────────────────────────

alter table public.accounts enable row level security;
alter table public.accounts force row level security;

revoke all on table public.accounts from anon, authenticated;

drop policy if exists "accounts_no_direct_access_anon" on public.accounts;
create policy "accounts_no_direct_access_anon"
  on public.accounts for all to anon
  using (false) with check (false);

drop policy if exists "accounts_no_direct_access_authenticated" on public.accounts;
create policy "accounts_no_direct_access_authenticated"
  on public.accounts for all to authenticated
  using (false) with check (false);
