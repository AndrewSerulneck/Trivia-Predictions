-- Phase 4c.10 of docs/speed-trivia-backlog-and-quality-plan.md (post-4c.4 review #8): the 20-a-day player report limit
-- becomes one atomic rule. Before, lib/questionReports.ts counted and then inserted, so a burst of concurrent POSTs
-- all saw the same count. Now a BEFORE INSERT trigger takes a per-player transaction lock, skips a duplicate, and
-- refuses the 21st report in a rolling 24 hours. The number 20 must match QUESTION_REPORT_DAILY_LIMIT
-- (tests/question-reports-limit-contract.test.ts).
--
-- Invoker rights: only service_role inserts (the route), and it can already read the table. Nothing new to grant.

create function public.guard_question_report_limit()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- One player's inserts run one at a time, so each sees the others' rows.
  perform pg_advisory_xact_lock(hashtextextended('question_reports:' || new.user_id::text, 0));

  -- A second report on the same question is skipped quietly (the route still replies "Sent."). This runs before
  -- the limit, so a duplicate at the limit is not an error.
  if exists (
    select 1 from public.question_reports r
    where r.user_id = new.user_id and r.question_id = new.question_id
  ) then
    return null;
  end if;

  if (
    select count(*) from public.question_reports r
    where r.user_id = new.user_id and r.created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'question-report-limit' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_question_report_limit() from public, anon, authenticated;

create trigger question_reports_daily_limit
  before insert on public.question_reports
  for each row execute function public.guard_question_report_limit();
