-- Add end_day for recurring multi-day challenges (e.g. "every Tue 7pm → Fri 2am").
-- Also expands the schedule_type constraint to accept 'single_day' and 'multi_day'
-- as the canonical values going forward ('recurring' and 'one_time' remain valid
-- for any existing rows).

alter table challenge_campaigns
  add column if not exists end_day text;

do $$
begin
  alter table challenge_campaigns
    drop constraint if exists challenge_campaigns_schedule_type_check;

  alter table challenge_campaigns
    add constraint challenge_campaigns_schedule_type_check
    check (schedule_type in ('recurring', 'one_time', 'single_day', 'multi_day'));
end $$;
