alter table advertisements
  add column if not exists is_placeholder boolean not null default false;

create index if not exists idx_advertisements_slot_placeholder_active
  on advertisements (slot, is_placeholder, active, start_date, end_date);
