alter table if exists trivia_schedules
  add column if not exists recurring_type text not null default 'none';

alter table if exists trivia_schedules
  drop constraint if exists trivia_schedules_recurring_type_valid;

alter table if exists trivia_schedules
  add constraint trivia_schedules_recurring_type_valid
  check (recurring_type in ('none', 'daily', 'weekly', 'monthly', 'yearly'));
