alter table if exists trivia_schedules
  add column if not exists recurring_days text[] not null default '{}'::text[];

alter table if exists trivia_schedules
  drop constraint if exists trivia_schedules_recurring_days_valid;

alter table if exists trivia_schedules
  add constraint trivia_schedules_recurring_days_valid
  check (
    recurring_days <@ array['sun','mon','tue','wed','thu','fri','sat']::text[]
  );
