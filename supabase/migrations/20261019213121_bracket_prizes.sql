-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) Phase 9a: March Madness bracket Prizes
-- and the bracket's Results page read.
--
-- A partner offers 1st / 2nd / 3rd place prizes for the brackets they choose (men's / women's, main /
-- second chance). Each chosen bracket is one prize cycle at the venue, paid once that tournament's
-- championship is graded, through the existing award_ranked_cycle_places RPC
-- (lib/bracketPrizeAwards.ts). Nothing here changes how a prize is awarded or redeemed.
--
-- Parts:
--   1. challenge_campaigns_game_types_valid accepts 'bracket' (a bracket prize's game_types is
--      ['bracket']). Rebuilt with every value the last version (20261019131139) allowed.
--   2. challenge_campaigns.bracket_keys: which brackets a bracket prize pays ('men_main',
--      'women_main', 'men_second', 'women_second'). NULL = not a bracket prize (purely additive; every
--      existing row stays NULL). Deliberately NOT in lib/challengeCampaigns.ts's CAMPAIGN_SELECT_COLUMNS:
--      only bracket code reads it, so a deploy that runs ahead of this migration leaves every other
--      prize untouched.
--   3. bracket_tournaments.prizes_settled_at: set once the tournament's prizes were settled after its
--      championship was graded. The sync keeps reading the tournament until it is set, so a failed
--      settlement is retried instead of being forgotten when the last round is paid.
--   4. bracket_venue_games(venue): the Results page's one read of which brackets a venue played
--      (entries with at least one pick, per tournament and kind). One indexed aggregate
--      (bracket_entries_venue_id_idx) instead of reading every entry the venue ever had.
--
-- No new table, view or sequence, so no grants beyond the functions'. No users FK, so
-- delete_player_account is unchanged.
-- DEPLOY ORDER: apply this BEFORE turning NEXT_PUBLIC_BRACKETS_ENABLED on (the flag is what offers a
-- bracket prize at all, and what lists brackets on Results).

-- ── 1. 'bracket' is a campaign game type ───────────────────────────────────────────────────

alter table public.challenge_campaigns
  drop constraint if exists challenge_campaigns_game_types_valid;

alter table public.challenge_campaigns
  add constraint challenge_campaigns_game_types_valid
  check (
    array_length(game_types, 1) is null
    or game_types <@ array[
      'pickem', 'fantasy', 'trivia', 'bingo', 'speed-trivia', 'live-trivia', 'nfl-pickem', 'squares', 'bracket'
    ]::text[]
  );

-- ── 2. Which brackets a bracket prize pays ─────────────────────────────────────────────────

alter table public.challenge_campaigns
  add column if not exists bracket_keys text[];

-- 1–4 known brackets, none twice. A function because a check constraint can't hold a subquery
-- (same pattern as squares_moments_valid, 20261019131139).
create or replace function public.bracket_keys_valid(p text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p is not null
    and cardinality(p) between 1 and 4
    and p <@ array['men_main', 'women_main', 'men_second', 'women_second']::text[]
    and cardinality(p) = (select count(distinct k) from unnest(p) as k);
$$;

revoke all on function public.bracket_keys_valid(text[]) from public, anon, authenticated;
grant execute on function public.bracket_keys_valid(text[]) to service_role;

alter table public.challenge_campaigns
  drop constraint if exists challenge_campaigns_bracket_keys_valid;

alter table public.challenge_campaigns
  add constraint challenge_campaigns_bracket_keys_valid
  check (bracket_keys is null or public.bracket_keys_valid(bracket_keys));

comment on column public.challenge_campaigns.bracket_keys is
  'March Madness bracket prizes: the brackets (men_main, women_main, men_second, women_second) that each pay the prize''s place ladder at the venue. NULL = not a bracket prize. Read only by lib/bracketPrizeAwards.ts and the description reads (never CAMPAIGN_SELECT_COLUMNS).';

-- ── 3. When a tournament's prizes were settled ─────────────────────────────────────────────

alter table public.bracket_tournaments
  add column if not exists prizes_settled_at timestamptz;

comment on column public.bracket_tournaments.prizes_settled_at is
  'Set once every bracket prize was settled after the championship was graded (lib/bracketPrizeAwards.ts). The sync keeps reading the tournament until it is set.';

-- ── 4. Which brackets a venue played (Results) ─────────────────────────────────────────────

create or replace function public.bracket_venue_games(p_venue_id text)
returns table (
  tournament_id uuid,
  kind text,
  entries integer
)
language sql
stable
set search_path = public
as $$
  select e.tournament_id, e.kind, count(*)::integer as entries
  from bracket_entries e
  where e.venue_id = p_venue_id
    and e.pick_count > 0
  group by e.tournament_id, e.kind;
$$;

revoke all on function public.bracket_venue_games(text) from public, anon, authenticated;
grant execute on function public.bracket_venue_games(text) to service_role;
