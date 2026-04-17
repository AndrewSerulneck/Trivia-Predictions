alter table advertisements
add column if not exists delivery_weight integer not null default 1;

alter table advertisements
drop constraint if exists ads_delivery_weight_valid;

alter table advertisements
add constraint ads_delivery_weight_valid check (delivery_weight >= 1 and delivery_weight <= 100);
