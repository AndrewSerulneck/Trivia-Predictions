-- Rename venue id 'venue-downtown' → 'brunswick-grove'.
-- One-way migration: no DOWN provided. The old id was an opaque placeholder;
-- 'brunswick-grove' matches the venue's actual name and is the desired URL slug.
-- Reversing would require the same FK-cascade dance in reverse and is not worth
-- the risk to live data — if a rollback is ever needed, write a new forward migration.

begin;

-- Insert the venue row under the new id, preserving all columns.
insert into venues (
  id,
  name,
  latitude,
  longitude,
  radius,
  created_at,
  address,
  display_name,
  logo_text,
  icon_emoji,
  city,
  zip_code,
  county,
  state,
  region,
  street,
  country
)
select
  'brunswick-grove',
  name,
  latitude,
  longitude,
  radius,
  created_at,
  address,
  display_name,
  logo_text,
  icon_emoji,
  city,
  zip_code,
  county,
  state,
  region,
  street,
  country
from venues
where id = 'venue-downtown';

-- Re-point all FK tables before removing the old row.
-- All FKs are ON DELETE RESTRICT or CASCADE, so the old row cannot be deleted
-- until every referencing row has been moved to the new id.

update users
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

update advertisements
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

update sports_bingo_cards
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

update pickem_picks
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

update challenge_invites
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

update weekly_prizes
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

update prize_wins
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

update fantasy_entries
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

update pickem_daily_snapshots
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

-- challenge_campaigns uses venue_ids text[] (not a scalar FK column)
update challenge_campaigns
  set venue_ids = array_replace(venue_ids, 'venue-downtown', 'brunswick-grove')
  where 'venue-downtown' = any(venue_ids);

update trivia_schedules
  set venue_id = 'brunswick-grove'
  where venue_id = 'venue-downtown';

-- Tables from 20260530120000 and 20260601160000 may not exist yet in all envs
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'venue_seen_questions') then
    update venue_seen_questions
      set venue_id = 'brunswick-grove'
      where venue_id = 'venue-downtown';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_sessions') then
    update user_sessions
      set venue_id = 'brunswick-grove'
      where venue_id = 'venue-downtown';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'game_sessions') then
    update game_sessions
      set venue_id = 'brunswick-grove'
      where venue_id = 'venue-downtown';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ad_interactions') then
    update ad_interactions
      set venue_id = 'brunswick-grove'
      where venue_id = 'venue-downtown';
  end if;
end $$;

-- Remove the old venue row now that no FK references remain.
delete from venues
  where id = 'venue-downtown';

commit;
