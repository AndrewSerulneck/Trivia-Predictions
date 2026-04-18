alter table advertisements
add column if not exists page_key text not null default 'venue';

alter table advertisements
add column if not exists ad_type text not null default 'inline';

alter table advertisements
add column if not exists display_trigger text not null default 'on-load';

alter table advertisements
add column if not exists placement_key text null;

alter table advertisements
add column if not exists round_number integer null;

alter table advertisements
add column if not exists sequence_index integer null;

update advertisements
set
  page_key = case
    when slot in ('popup-on-entry', 'popup-on-scroll', 'mobile-adhesion', 'leaderboard-sidebar') then 'venue'
    when slot in ('inline-content', 'mid-content') then 'sports-predictions'
    else 'global'
  end,
  ad_type = case
    when slot in ('popup-on-entry', 'popup-on-scroll') then 'popup'
    when slot in ('mobile-adhesion', 'header', 'sidebar', 'footer') then 'banner'
    else 'inline'
  end,
  display_trigger = case
    when slot = 'popup-on-scroll' then 'on-scroll'
    else 'on-load'
  end,
  placement_key = case
    when slot = 'leaderboard-sidebar' then 'venue-leaderboard-inline'
    else placement_key
  end;

alter table advertisements
drop constraint if exists ads_page_key_valid;

alter table advertisements
add constraint ads_page_key_valid
check (page_key in ('global', 'join', 'venue', 'trivia', 'sports-predictions', 'sports-bingo'));

alter table advertisements
drop constraint if exists ads_ad_type_valid;

alter table advertisements
add constraint ads_ad_type_valid
check (ad_type in ('popup', 'banner', 'inline'));

alter table advertisements
drop constraint if exists ads_display_trigger_valid;

alter table advertisements
add constraint ads_display_trigger_valid
check (display_trigger in ('on-load', 'on-scroll', 'round-end'));

alter table advertisements
drop constraint if exists ads_round_number_valid;

alter table advertisements
add constraint ads_round_number_valid
check (round_number is null or round_number between 1 and 3);

alter table advertisements
drop constraint if exists ads_sequence_index_valid;

alter table advertisements
add constraint ads_sequence_index_valid
check (sequence_index is null or sequence_index between 1 and 4);

create index if not exists idx_ads_placement_lookup
  on advertisements (slot, page_key, ad_type, display_trigger, placement_key, round_number, sequence_index, active, start_date, end_date);
