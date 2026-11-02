-- Pick 'Em Phase 2 (docs/pickem-college-football-and-prize-plan.md): College Football (FBS) joins
-- regular Pick 'Em as sport_slug 'ncaaf'. Same constraint as 20260524113000, plus 'ncaaf'.
-- Apply BEFORE (or with) the code: until this runs, a college pick is refused by the database.
alter table if exists pickem_picks
  drop constraint if exists pickem_picks_sport_slug_valid;

alter table if exists pickem_picks
  add constraint pickem_picks_sport_slug_valid
  check (sport_slug in ('nba', 'mlb', 'nhl', 'soccer', 'ncaaf', 'nfl', 'mma', 'tennis'));
