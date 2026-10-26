-- The Face ID / Touch ID button starts before the authenticator identifies the
-- player. Such authentication challenges have neither account_id nor user_id;
-- verification resolves the account from the registered credential instead.
-- Keep identity binding mandatory for registration, including legacy user scope.
-- No existing challenges, passkeys or player records are changed.
alter table public.webauthn_challenges
  alter column account_id drop not null;

alter table public.webauthn_challenges
  add constraint webauthn_challenges_registration_identity_required
  check (flow_type = 'authentication' or account_id is not null or user_id is not null);
