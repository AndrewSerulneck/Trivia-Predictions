-- Category Blitz submissions no longer require a Supabase Auth identity.
--
-- auth_id was meant to be populated by a client-side signInAnonymously()
-- call, but lib/auth.ts's getCurrentAuthUserId() races that call against a
-- 1.2s timeout that (in practice) always wins, leaving auth_id null for
-- every account. Since category_blitz_submissions.auth_id was NOT NULL +
-- FK'd to auth.users, every submission was rejected server-side with a
-- silent 400 the client never surfaced to the player.
--
-- public.users.id (our own username+PIN identity) is already the durable,
-- always-populated identity for every account. Drop the auth_id
-- requirement and re-key uniqueness off user_id instead.

alter table public.category_blitz_submissions
  alter column auth_id drop not null;

drop index if exists public.uq_category_blitz_submissions_player_category;

create unique index if not exists uq_category_blitz_submissions_player_category
  on public.category_blitz_submissions (round_id, user_id, category_index);
