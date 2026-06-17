alter table public.venues
  add column if not exists place_id text null;
