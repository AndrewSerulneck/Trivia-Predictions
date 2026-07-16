-- Migration: Create category_blitz_continuous_config table
-- Stores per-venue configuration for continuous loop mode

-- Config table for continuous mode settings
-- Each venue can have one continuous config row
-- When enabled, the venue runs Category Blitz on infinite loop with randomized rounds
-- When disabled (is_active = false), venue reverts to schedule-based mode

create table if not exists public.category_blitz_continuous_config (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id) on delete cascade,
  
  -- Enable/disable continuous mode
  is_active boolean not null default false,
  
  -- Round timing (in seconds) - allows venues to customize pace
  round_duration_seconds integer not null default 180,
  intermission_seconds integer not null default 300,
  
  -- Mode randomization: 'random' for 50/50, 'weighted_standard' for 75/25
  mode_selection text not null default 'random',
  
  -- Category pool management
  -- stored as array of category strings (empty = use all available)
  category_pool text[] not null default '{}',
  
  -- Minimum categories required per letter for continuous mode to be valid
  min_categories_per_letter integer not null default 12,
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- One config per venue
  constraint uq_category_blitz_continuous_config_venue unique (venue_id),
  
  -- Valid mode selection values
  constraint category_blitz_continuous_config_mode_check
    check (mode_selection in ('random', 'weighted_standard', 'weighted_reverse')),
    
  -- Timing must be positive
  constraint category_blitz_continuous_config_round_duration_check
    check (round_duration_seconds >= 30),
  constraint category_blitz_continuous_config_intermission_check
    check (intermission_seconds >= 0),
  constraint category_blitz_continuous_config_min_categories_check
    check (min_categories_per_letter >= 5)
);

-- Index for venue lookups
create index if not exists idx_category_blitz_continuous_config_venue
  on public.category_blitz_continuous_config(venue_id);

-- Index for finding all venues with continuous mode enabled
create index if not exists idx_category_blitz_continuous_config_active
  on public.category_blitz_continuous_config(is_active)
  where is_active = true;

-- Enable RLS
alter table public.category_blitz_continuous_config enable row level security;
alter table public.category_blitz_continuous_config force row level security;

-- Revoke default access
revoke all on table public.category_blitz_continuous_config from anon, authenticated;

-- Venue owners can manage their own config
grant select, insert, update, delete on table public.category_blitz_continuous_config to authenticated;

-- RLS Policy: Admins can CRUD continuous config.
-- NOTE: this schema's users table has no `role` column — admin is expressed via
-- the boolean `users.is_admin`, matching every other admin RLS policy in the
-- repo (see 20260214153000_initial_schema.sql et al.). All server-side writes go
-- through supabaseAdmin (service role) + requireAdminAuth anyway; this policy is
-- defense-in-depth for any direct authenticated access.
create policy "admins can manage continuous config"
  on public.category_blitz_continuous_config
  for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.auth_id = (select auth.uid())
        and u.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.auth_id = (select auth.uid())
        and u.is_admin = true
    )
  );

-- RLS Policy: Players can view config for their venue (needed to know game mode)
create policy "players can view venue continuous config"
  on public.category_blitz_continuous_config
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.venue_id = category_blitz_continuous_config.venue_id
        and u.auth_id = (select auth.uid())
    )
  );

-- Add updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists category_blitz_continuous_config_updated_at
  on public.category_blitz_continuous_config;

create trigger category_blitz_continuous_config_updated_at
  before update on public.category_blitz_continuous_config
  for each row
  execute function public.set_updated_at();

-- Comments
comment on table public.category_blitz_continuous_config is 
  'Configuration for Category Blitz continuous loop mode per venue';
comment on column public.category_blitz_continuous_config.is_active is 
  'When true, venue runs continuous rounds instead of scheduled games';
comment on column public.category_blitz_continuous_config.category_pool is 
  'Array of categories to use; empty means all available categories';
comment on column public.category_blitz_continuous_config.mode_selection is 
  'How to select round mode: random (50/50), weighted_standard (75/25), weighted_reverse (25/75)';
