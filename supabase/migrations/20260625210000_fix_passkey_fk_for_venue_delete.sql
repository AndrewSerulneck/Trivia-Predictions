-- Fix passkey FKs to preserve account auth when a venue is deleted.
--
-- user_passkeys.user_id and webauthn_challenges.user_id were ON DELETE CASCADE,
-- meaning deleting a venue deleted the user row, cascading to destroy passkeys
-- for the entire account even if the user exists at other venues.
--
-- Change to ON DELETE SET NULL since these are now legacy columns after the
-- global accounts migration. Auth now looks up passkeys by account_id first.

alter table public.user_passkeys
  drop constraint if exists user_passkeys_user_id_fkey,
  add constraint user_passkeys_user_id_fkey
    foreign key (user_id) references public.users(id) on delete set null;

alter table public.webauthn_challenges
  drop constraint if exists webauthn_challenges_user_id_fkey,
  add constraint webauthn_challenges_user_id_fkey
    foreign key (user_id) references public.users(id) on delete set null;
