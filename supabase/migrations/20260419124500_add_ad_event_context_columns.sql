alter table ad_events
add column if not exists page_key text null;

alter table ad_events
add column if not exists venue_id text null;

alter table ad_events
drop constraint if exists ad_events_page_key_valid;

alter table ad_events
add constraint ad_events_page_key_valid
check (page_key is null or page_key in ('global', 'join', 'venue', 'trivia', 'sports-predictions', 'sports-bingo'));

create index if not exists idx_ad_events_page_time on ad_events(page_key, created_at desc);
create index if not exists idx_ad_events_venue_time on ad_events(venue_id, created_at desc);
