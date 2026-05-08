alter table advertisements
drop constraint if exists ads_page_key_valid;

alter table ad_events
drop constraint if exists ad_events_page_key_valid;

update advertisements
set page_key = 'pickem'
where page_key = 'sports-predictions';

alter table advertisements
add constraint ads_page_key_valid
check (page_key in ('global', 'join', 'venue', 'trivia', 'sports-bingo', 'pickem', 'fantasy'));

update ad_events
set page_key = 'pickem'
where page_key = 'sports-predictions';

alter table ad_events
add constraint ad_events_page_key_valid
check (page_key is null or page_key in ('global', 'join', 'venue', 'trivia', 'sports-bingo', 'pickem', 'fantasy'));
