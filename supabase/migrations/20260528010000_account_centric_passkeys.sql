-- Relax user_passkeys.user_id constraint and make account_id mandatory.
--
-- This enables "Account-Centric" passkeys: a passkey can exist at the account
-- level without being tied to a specific venue profile (user_id).
--
-- For existing rows, account_id should have been back-filled in the previous 
-- migration. We now enforce its presence and remove the user_id requirement.

-- 1. Ensure all user_passkeys have an account_id before enforcing NOT NULL.
-- If any are missing (though unlikely after 20260528000000_global_accounts.sql),
-- we link them via users.
update public.user_passkeys pk
set account_id = u.account_id
from public.users u
where pk.user_id = u.id
  and u.account_id is not null
  and pk.account_id is null;

-- 2. Make account_id NOT NULL and user_id NULLABLE.
alter table public.user_passkeys
  alter column account_id set not null,
  alter column user_id drop not null;

-- 3. Repeat for webauthn_challenges to ensure registration flow can use account_id only.
update public.webauthn_challenges ch
set account_id = u.account_id
from public.users u
where ch.user_id = u.id
  and u.account_id is not null
  and ch.account_id is null;

-- Some older challenge rows can be orphaned from a venue user profile or predate
-- account backfill entirely. These WebAuthn challenges are short-lived and safe
-- to discard before enforcing account_id NOT NULL.
delete from public.webauthn_challenges
where account_id is null;

alter table public.webauthn_challenges
  alter column account_id set not null,
  alter column user_id drop not null;

-- 4. Update the unique constraint on user_passkeys.
-- Previously: unique(user_id, credential_id_b64url).
-- Now: unique(account_id, credential_id_b64url).
do $$
begin
  -- Drop the user-scoped constraint if it exists
  if exists (
    select 1 from pg_constraint 
    where conname = 'user_passkeys_user_id_credential_id_b64url_key'
  ) then
    alter table public.user_passkeys drop constraint user_passkeys_user_id_credential_id_b64url_key;
  end if;

  -- Add the account-scoped constraint
  if not exists (
    select 1 from pg_constraint 
    where conname = 'user_passkeys_account_id_credential_id_b64url_key'
  ) then
    alter table public.user_passkeys add constraint user_passkeys_account_id_credential_id_b64url_key 
      unique (account_id, credential_id_b64url);
  end if;
end;
$$;
