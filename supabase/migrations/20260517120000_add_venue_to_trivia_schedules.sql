alter table if exists trivia_schedules
  add column if not exists venue_id text references venues(id) on delete restrict;

create index if not exists idx_trivia_schedules_venue_id_start_time
  on trivia_schedules(venue_id, start_time desc);
