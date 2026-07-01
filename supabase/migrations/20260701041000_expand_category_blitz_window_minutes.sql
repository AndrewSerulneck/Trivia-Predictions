alter table public.category_blitz_schedules
  drop constraint if exists category_blitz_schedules_window_minutes_check;

alter table public.category_blitz_schedules
  add constraint category_blitz_schedules_window_minutes_check
  check (window_minutes >= 1 and window_minutes <= 43200);
