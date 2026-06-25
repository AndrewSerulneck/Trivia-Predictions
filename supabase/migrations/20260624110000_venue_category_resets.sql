-- Audit log of per-category epoch resets (Phase 3 of question rotation).
-- A row is written whenever a venue exhausts every active Live Trivia question in
-- a category and the seeder recycles that category — freeing its oldest-seen
-- questions while carrying forward the most-recent ones to avoid back-to-back repeats.

create table if not exists public.venue_category_resets (
  id                    uuid primary key default gen_random_uuid(),
  venue_id              text not null,
  category              text not null,
  category_total        integer not null default 0,
  freed_count           integer not null default 0,
  carried_forward_count integer not null default 0,
  created_at            timestamptz not null default now()
);

create index if not exists venue_category_resets_venue_id_idx
  on public.venue_category_resets (venue_id, created_at desc);

-- RLS
alter table public.venue_category_resets enable row level security;
alter table public.venue_category_resets force row level security;

-- Only the service role writes/reads (admin UI uses the service-role client).
revoke all on table public.venue_category_resets from anon, authenticated;
