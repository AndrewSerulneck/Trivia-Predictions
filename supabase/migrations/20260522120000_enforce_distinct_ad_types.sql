-- Ensure ad taxonomy is explicit and stable across environments.
-- Distinct valid ad types: popup, banner, inline.

alter table advertisements
add column if not exists ad_type text;

update advertisements
set ad_type = 'inline'
where ad_type is null
   or ad_type not in ('popup', 'banner', 'inline');

alter table advertisements
alter column ad_type set not null;

alter table advertisements
drop constraint if exists ads_ad_type_valid;

alter table advertisements
add constraint ads_ad_type_valid
check (ad_type in ('popup', 'banner', 'inline'));
