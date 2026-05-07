-- Replace probabilistic delivery_weight with deterministic frequency_interval.
-- frequency_interval = N means the ad serves every Nth page load (1 = every load, 3 = every 3rd).

alter table advertisements
  add column if not exists frequency_interval integer not null default 1;

alter table advertisements
  drop constraint if exists ads_frequency_interval_valid;

alter table advertisements
  add constraint ads_frequency_interval_valid check (frequency_interval >= 1 and frequency_interval <= 999);

-- Index for slot lookups (covers the new column if needed for future queries)
create index if not exists idx_ads_frequency_interval on advertisements (frequency_interval);
