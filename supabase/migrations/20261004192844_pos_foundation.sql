-- POS rewards integration, Phase 1 — foundation (docs/pos-rewards-integration-plan.md §3, §4).
--
-- Nothing here talks to a POS. It adds:
--   1. pos_connections          — one row per venue × provider OAuth connection. Tokens are
--                                 stored ENCRYPTED by the app (lib/pos/crypto.ts, AES-256-GCM,
--                                 key in POS_TOKEN_KEY); the database never sees plaintext.
--   2. pos_reward_applications  — the ledger of every attempt to put a reward onto a POS
--                                 (Square gift card, Clover discount, …). `idempotency_key` is
--                                 UNIQUE so a retried apply can never double-discount.
--   3. prize_pos_value_cents    — the "value at the register" cap for a percent-off menu-item
--                                 prize, on challenge_campaigns AND the redemption snapshot.
--   4. award_cycle_winner       — re-created to snapshot that cap onto the coupon. Signature
--                                 (and therefore PostgREST's single overload) unchanged.
--
-- Both new tables are SERVER-ONLY: RLS on and forced with no policies, browser roles
-- revoked, service_role granted explicitly (supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md;
-- production has had explicit-grant defaults since 2026-09-23).
--
-- Deploy order: safe either way. The app only writes prize_pos_value_cents when a venue has
-- an active pos_connections row, which cannot exist before this migration; no app read
-- selects the new column yet (Phase 2/3 add the readers).

-- ── 1. pos_connections ──────────────────────────────────────────────────────────────────

create table if not exists public.pos_connections (
  id uuid primary key default gen_random_uuid(),
  -- Credentials die with the venue.
  venue_id text not null references public.venues(id) on delete cascade,
  provider text not null check (provider in ('square', 'clover', 'toast')),
  -- Sandbox connections are real rows too (Phase 2/3 testing); never mix the two.
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  merchant_id text not null,
  merchant_name text,
  -- Square: the location gift cards are issued at. Clover: null (merchant-scoped).
  location_id text,
  -- lib/pos/crypto.ts envelope ("v1:<iv>:<tag>:<ciphertext>"), bound to venue+provider+field.
  access_token_enc text not null,
  refresh_token_enc text,
  token_expires_at timestamptz,
  -- Clover refresh tokens expire (and are single-use); Square's do not (null).
  refresh_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  -- active = usable; error = the provider refused us (re-connect needed); revoked = disconnected.
  status text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_error text,
  -- Survives the owner account's deletion (a purge or support fix) as history.
  connected_by_owner_id uuid references public.venue_owners(id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one live (active or error) connection per venue and provider. Revoked rows are
-- kept as history and don't count.
create unique index if not exists pos_connections_one_live_per_venue_provider
  on public.pos_connections (venue_id, provider)
  where status <> 'revoked';

-- Webhooks identify the merchant, not the venue (Square sends merchant_id).
create index if not exists pos_connections_provider_merchant
  on public.pos_connections (provider, merchant_id);

alter table public.pos_connections enable row level security;
alter table public.pos_connections force row level security;
revoke all on table public.pos_connections from anon, authenticated;
grant select, insert, update, delete on table public.pos_connections to service_role;

-- ── 2. pos_reward_applications ──────────────────────────────────────────────────────────

create table if not exists public.pos_reward_applications (
  id uuid primary key default gen_random_uuid(),
  -- e.g. "<redemption id>:square:apply". UNIQUE = the idempotency guarantee: an insert that
  -- conflicts means "this attempt already exists — read it, don't call the provider again".
  idempotency_key text not null unique,
  -- A financial record: it outlives a deleted coupon/user (set null), never cascades away.
  redemption_id uuid references public.challenge_campaign_redemptions(id) on delete set null,
  -- Plain text on purpose (no FK): the ledger must survive a venue deletion.
  venue_id text not null,
  connection_id uuid references public.pos_connections(id) on delete set null,
  provider text not null check (provider in ('square', 'clover', 'toast')),
  action text not null default 'apply' check (action in ('apply', 'reverse')),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'reversed')),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text not null default 'USD',
  -- The provider's primary id for what we created: Square gift card id, Clover discount id,
  -- Toast transaction guid. NEVER a bearer secret — a Square GAN is spendable money and must
  -- not be stored here in plaintext (fetch it from Square by id, or encrypt it).
  external_ref text,
  -- Non-secret extras (Clover order id, Square location id, …).
  external_detail jsonb not null default '{}'::jsonb,
  -- Who triggered it: 'guest' (taps "Use at the register"), 'staff', 'webhook'.
  actor text check (actor is null or actor in ('guest', 'staff', 'webhook', 'system')),
  error_code text,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_reward_applications_redemption
  on public.pos_reward_applications (redemption_id);

-- Webhook lookups: "which of our rows is Square gift card X?"
create index if not exists pos_reward_applications_provider_external_ref
  on public.pos_reward_applications (provider, external_ref)
  where external_ref is not null;

alter table public.pos_reward_applications enable row level security;
alter table public.pos_reward_applications force row level security;
revoke all on table public.pos_reward_applications from anon, authenticated;
grant select, insert, update, delete on table public.pos_reward_applications to service_role;

-- ── 3. The "value at the register" cap ──────────────────────────────────────────────────
-- Registers discount money, not menu ideas. A percent-off menu-item prize ("50% off an
-- appetizer") has no dollar value until the partner gives one; this is it, in integer cents.
-- Null = not set (gift cards and dollar-off prizes derive their value — lib/pos/prizeValue.ts).

alter table public.challenge_campaigns
  add column if not exists prize_pos_value_cents integer
    check (prize_pos_value_cents is null or prize_pos_value_cents between 1 and 1000000);

alter table public.challenge_campaign_redemptions
  add column if not exists prize_pos_value_cents integer
    check (prize_pos_value_cents is null or prize_pos_value_cents between 1 and 1000000);

-- ── 4. award_cycle_winner: snapshot the cap onto the coupon ─────────────────────────────
-- Identical to 20260726120100_award_cycle_winner_prize_snapshot.sql except that the coupon
-- insert also copies c.prize_pos_value_cents. Same arity, so no drop and still exactly one
-- PostgREST overload; the quota guarantee and advisory-lock key are unchanged.

create or replace function public.award_cycle_winner(
  p_challenge_id uuid,
  p_cycle_start timestamptz,
  p_winner_user_id uuid,
  p_venue_id text,
  p_points_earned integer,
  p_winner_quota integer,
  p_prize_type text default null,
  p_prize_gift_certificate_amount numeric default null,
  p_prize_expires_at timestamptz default null
)
returns table (
  won boolean,
  exhausted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota integer := greatest(1, coalesce(p_winner_quota, 1));
  v_count integer;
  v_inserted integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_challenge_id::text || ':' || extract(epoch from p_cycle_start)::text,
      0
    )
  );

  select count(*) into v_count
  from challenge_cycle_winners
  where challenge_id = p_challenge_id
    and cycle_start = p_cycle_start;

  if v_count >= v_quota then
    won := false;
    exhausted := true;
    return next;
    return;
  end if;

  insert into challenge_cycle_winners (
    challenge_id, cycle_start, winner_user_id, venue_id, points_earned,
    prize_type, prize_gift_certificate_amount
  )
  values (
    p_challenge_id, p_cycle_start, p_winner_user_id, p_venue_id,
    coalesce(p_points_earned, 0), p_prize_type, p_prize_gift_certificate_amount
  )
  on conflict (challenge_id, cycle_start, winner_user_id) do nothing;

  get diagnostics v_inserted = row_count;

  won := v_inserted > 0;
  exhausted := (v_count + v_inserted) >= v_quota;

  if won and p_prize_expires_at is not null then
    insert into challenge_campaign_redemptions (
      challenge_id, winner_user_id, venue_id, cycle_start, prize_expires_at,
      reward_name, prize_type, prize_gift_certificate_amount,
      prize_kind, prize_menu_item, prize_menu_item_name,
      prize_discount_kind, prize_discount_value, prize_pos_value_cents
    )
    select
      p_challenge_id, p_winner_user_id, p_venue_id, p_cycle_start, p_prize_expires_at,
      c.name,
      coalesce(p_prize_type, c.prize_type),
      coalesce(p_prize_gift_certificate_amount, c.prize_gift_certificate_amount),
      c.prize_kind, c.prize_menu_item, c.prize_menu_item_name,
      c.prize_discount_kind, c.prize_discount_value, c.prize_pos_value_cents
    from challenge_campaigns c
    where c.id = p_challenge_id
    on conflict (challenge_id, winner_user_id, cycle_start) do nothing;
  end if;

  return next;
end;
$$;

revoke all on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz) to service_role;
