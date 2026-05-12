begin;

-- Backfill existing rows to canonical values.
update live_player_stats
set sport_key = public.canonical_sport_key(sport_key)
where coalesce(sport_key, '') <> public.canonical_sport_key(sport_key);

update fantasy_entries
set sport_key = public.canonical_sport_key(sport_key)
where coalesce(sport_key, '') <> public.canonical_sport_key(sport_key);

update sports_bingo_cards
set sport_key = public.canonical_sport_key(sport_key)
where coalesce(sport_key, '') <> public.canonical_sport_key(sport_key);

update pickem_picks
set sport_key = public.canonical_sport_key(sport_key)
where coalesce(sport_key, '') <> public.canonical_sport_key(sport_key);

create or replace function public.enforce_canonical_sport_key()
returns trigger
language plpgsql
as $$
begin
  new.sport_key := public.canonical_sport_key(new.sport_key);
  return new;
end;
$$;

drop trigger if exists enforce_canonical_sport_key_live_player_stats on live_player_stats;
create trigger enforce_canonical_sport_key_live_player_stats
before insert or update of sport_key
on live_player_stats
for each row
execute function public.enforce_canonical_sport_key();

drop trigger if exists enforce_canonical_sport_key_fantasy_entries on fantasy_entries;
create trigger enforce_canonical_sport_key_fantasy_entries
before insert or update of sport_key
on fantasy_entries
for each row
execute function public.enforce_canonical_sport_key();

drop trigger if exists enforce_canonical_sport_key_sports_bingo_cards on sports_bingo_cards;
create trigger enforce_canonical_sport_key_sports_bingo_cards
before insert or update of sport_key
on sports_bingo_cards
for each row
execute function public.enforce_canonical_sport_key();

drop trigger if exists enforce_canonical_sport_key_pickem_picks on pickem_picks;
create trigger enforce_canonical_sport_key_pickem_picks
before insert or update of sport_key
on pickem_picks
for each row
execute function public.enforce_canonical_sport_key();

commit;
