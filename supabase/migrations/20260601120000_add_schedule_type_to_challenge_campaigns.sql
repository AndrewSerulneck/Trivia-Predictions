-- Add schedule_type and start_date to challenge_campaigns to support one-time
-- contiguous windows (e.g. Tue 7pm → Fri 2am) alongside the existing
-- recurring day-of-week schedule model.

alter table challenge_campaigns
  add column if not exists schedule_type text not null default 'recurring',
  add column if not exists start_date text;

-- Constrain to known values; existing rows default to 'recurring'.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'challenge_campaigns_schedule_type_check'
      and conrelid = 'challenge_campaigns'::regclass
  ) then
    alter table challenge_campaigns
      add constraint challenge_campaigns_schedule_type_check
      check (schedule_type in ('recurring', 'one_time'));
  end if;
end $$;

-- Index to speed up active-campaign lookups filtered by schedule type.
create index if not exists idx_challenge_campaigns_schedule_type
  on challenge_campaigns(schedule_type)
  where is_active = true;
