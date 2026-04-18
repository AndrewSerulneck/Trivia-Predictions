alter table advertisements
add column if not exists venue_ids text[] null;

update advertisements
set venue_ids = array[venue_id]
where venue_id is not null
  and venue_ids is null;

alter table advertisements
add column if not exists dismiss_delay_seconds integer not null default 3;

alter table advertisements
add column if not exists popup_cooldown_seconds integer not null default 180;

alter table advertisements
drop constraint if exists ads_dismiss_delay_seconds_valid;

alter table advertisements
add constraint ads_dismiss_delay_seconds_valid
check (dismiss_delay_seconds between 0 and 300);

alter table advertisements
drop constraint if exists ads_popup_cooldown_seconds_valid;

alter table advertisements
add constraint ads_popup_cooldown_seconds_valid
check (popup_cooldown_seconds between 0 and 86400);
