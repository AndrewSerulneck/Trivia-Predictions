alter table advertisements
  add column if not exists target_all_venues boolean not null default false,
  add column if not exists target_cities text[] null,
  add column if not exists target_zip_codes text[] null,
  add column if not exists target_counties text[] null,
  add column if not exists target_states text[] null,
  add column if not exists target_regions text[] null;

create index if not exists idx_ads_target_all_venues on advertisements (target_all_venues);

alter table venues
  add column if not exists city text null,
  add column if not exists zip_code text null,
  add column if not exists county text null,
  add column if not exists state text null,
  add column if not exists region text null;
