-- Share to social, Phase 5 — Instagram "Post now" (docs/partner-social-promo-plan.md §4.6, Phase 5).
--
-- Adds:
--   1. social_connections  — one row per venue × provider: the partner's connected Instagram account
--                            (Phase 6 adds 'facebook' rows). The Meta token is stored ENCRYPTED by the
--                            app (lib/social/crypto.ts, AES-256-GCM, key SOCIAL_TOKEN_KEY); the database
--                            never sees plaintext.
--   2. social_posts        — every Post now (and, from Phase 7, Post later) attempt: what was posted,
--                            where the file is, and how far publishing got. No player data, ever.
--   3. storage bucket `social-media` — PRIVATE. The browser uploads a rendered picture/Reel to it with
--                            a signed upload URL (avoids Vercel's 4.5 MB body limit); Meta fetches it
--                            with a 1-hour signed read URL; the app deletes it once the post is done.
--
-- Both tables are SERVER-ONLY: RLS on and forced with no policies, browser roles revoked,
-- service_role granted explicitly (supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md). The bucket has
-- no storage policies on purpose: only service-role-signed URLs can write or read it.
--
-- Deploy order: safe either way. Every route that touches these is behind
-- NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED (off = 404), and the Meta callbacks treat a missing table as
-- an error (500, Meta retries) rather than silently succeeding.

-- ── 1. social_connections ───────────────────────────────────────────────────────────────

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  -- Credentials die with the venue.
  venue_id text not null references public.venues(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'facebook')),
  -- active           = usable; the token is a Facebook PAGE token (does not expire).
  -- choose_account   = the partner granted several Pages with Instagram accounts and must pick one;
  --                    the token is the long-lived USER token (≈60 days), kept only until they pick
  --                    (the app drops a pending row after an hour).
  -- reconnect_needed = Meta refused the token (password change, app removed, permission lost).
  status text not null default 'active' check (status in ('active', 'choose_account', 'reconnect_needed')),
  -- The app-scoped Facebook user id. Meta's deauthorize / data-deletion callbacks name only this.
  meta_user_id text not null,
  -- The Facebook Page the Instagram account is linked to (null while choosing).
  page_id text,
  -- The Instagram professional account id (null while choosing).
  external_account_id text,
  -- "@username" for the sheet. Not a secret; still removed with the row.
  display_name text,
  -- lib/social/crypto.ts envelope ("v1:<iv>:<tag>:<ciphertext>"), bound to venue+provider+field.
  access_token_enc text not null,
  -- Null for a Page token (never expires); the user token's expiry while choosing.
  token_expires_at timestamptz,
  -- While choosing: [{ "pageId", "pageName", "instagramId", "username" }] — ids and names only, no tokens.
  account_choices jsonb not null default '[]'::jsonb,
  scopes text[] not null default '{}',
  last_error text,
  -- Survives the owner account's deletion as history of who connected it.
  connected_by_owner_id uuid references public.venue_owners(id) on delete set null,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_connections_active_has_account check (
    status <> 'active' or (page_id is not null and external_account_id is not null)
  )
);

-- One connection per venue and provider. Disconnecting deletes the row (nothing to keep).
create unique index if not exists social_connections_one_per_venue_provider
  on public.social_connections (venue_id, provider);

-- Meta's callbacks look connections up by the Facebook user.
create index if not exists social_connections_meta_user
  on public.social_connections (meta_user_id);

alter table public.social_connections enable row level security;
alter table public.social_connections force row level security;
revoke all on table public.social_connections from anon, authenticated;
grant select, insert, update, delete on table public.social_connections to service_role;

-- ── 2. social_posts ─────────────────────────────────────────────────────────────────────

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  -- Post history dies with the venue.
  venue_id text not null references public.venues(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'facebook')),
  -- Which account it went to (kept as text so history survives a disconnect).
  external_account_id text,
  connection_id uuid references public.social_connections(id) on delete set null,
  -- What it advertises: the design (lib/promo/promoTemplates.ts PromoGameId), the scheduled game
  -- if any (Phase 7 cancels a game's scheduled posts with it), and the prizes shown.
  template_id text not null,
  schedule_id text,
  prize_ids text[] not null default '{}',
  music_id text,
  format text not null check (format in ('post', 'story', 'reel')),
  caption text not null default '' check (char_length(caption) <= 2200),
  -- Object path inside the private social-media bucket; null once the file is deleted.
  media_path text,
  media_type text not null check (media_type in ('image/jpeg', 'video/mp4')),
  -- uploading  = row made, the browser is uploading the file.
  -- publishing = claimed by one request that is creating the container / publishing (a lease:
  --              claimed_at says when, so a crashed request can be taken over).
  -- processing = the Instagram container exists; waiting for Meta to report FINISHED.
  -- scheduled  = Post later (Phase 7). published / failed / cancelled are final.
  status text not null default 'uploading'
    check (status in ('scheduled', 'uploading', 'publishing', 'processing', 'published', 'failed', 'cancelled')),
  claimed_at timestamptz,
  scheduled_for timestamptz,
  repeat text not null default 'none' check (repeat in ('none', 'weekly')),
  -- The Reel's cover frame (Instagram thumb_offset), from lib/promo/promoReel.ts reelCoverMs.
  cover_ms integer check (cover_ms is null or cover_ms between 0 and 60000),
  container_id text,
  external_post_id text,
  permalink text,
  -- A short, partner-safe reason (never a token, never Meta's raw response).
  error text,
  created_by_owner_id uuid references public.venue_owners(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phase 7's cron: one indexed read of due rows.
create index if not exists social_posts_status_scheduled_for
  on public.social_posts (status, scheduled_for);

-- The sheet's "Recent posts" and the per-venue daily cap.
create index if not exists social_posts_venue_created
  on public.social_posts (venue_id, created_at desc);

alter table public.social_posts enable row level security;
alter table public.social_posts force row level security;
revoke all on table public.social_posts from anon, authenticated;
grant select, insert, update, delete on table public.social_posts to service_role;

-- ── 3. Private storage bucket ───────────────────────────────────────────────────────────

-- 50 MB per file (a 15 s Reel is ≈11 MB; Instagram's JPEG limit is 8 MB). JPEG and MP4 only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', false, 52428800, array['image/jpeg', 'video/mp4'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
