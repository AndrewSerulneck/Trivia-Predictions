alter table if exists pickem_picks
  drop constraint if exists pickem_picks_sport_slug_valid;

alter table if exists pickem_picks
  add constraint pickem_picks_sport_slug_valid
  check (sport_slug in ('nba', 'mlb', 'nhl', 'soccer', 'nfl', 'mma', 'tennis'));
