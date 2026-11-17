-- Phase 4c.7 of docs/speed-trivia-backlog-and-quality-plan.md (D32): players report a bad question after answering it.
-- Server-only: the browser never reads or writes this table. POST /api/trivia/report (lib/questionReports.ts) inserts,
-- copying player_answer from the player's own answer row, never from the request. scripts/export-question-reports.cjs
-- reads it for Andrew (no user ids) and sets resolved_at. A report never changes a question by itself.

create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.trivia_questions(id) on delete cascade,
  game text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  reason text not null,
  note text,
  player_answer text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint question_reports_game check (game in ('speed', 'live')),
  constraint question_reports_reason check (
    reason in ('wrong_answer', 'two_right', 'my_answer_right', 'confusing', 'typo', 'other')
    and (reason <> 'my_answer_right' or game = 'live')
    and (reason <> 'two_right' or game = 'speed')
  ),
  -- A note goes with Other only, and Other needs one.
  constraint question_reports_note check (
    (reason = 'other' and note is not null and length(btrim(note)) > 0 and char_length(note) <= 200)
    or (reason <> 'other' and note is null)
  ),
  constraint question_reports_player_answer check (player_answer is null or char_length(player_answer) <= 200),
  constraint question_reports_one_per_player unique (user_id, question_id)
);

create index question_reports_user_created_idx on public.question_reports (user_id, created_at);
create index question_reports_unresolved_idx on public.question_reports (created_at) where resolved_at is null;

alter table public.question_reports enable row level security;
alter table public.question_reports force row level security;

revoke all on table public.question_reports from anon, authenticated;
grant select, insert, update on table public.question_reports to service_role;

-- Total plays of the reported questions, one grouped count per game, for the export. Invoker rights (the server
-- already reads both answer tables); plpgsql so the body isn't bound to the answer tables until it runs.
create function public.question_report_play_counts(p_speed_ids uuid[], p_live_slugs text[])
returns table (game text, question_ref text, plays bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return query
    select 'speed'::text, a.question_id::text, count(*)::bigint
    from public.trivia_answers a
    where a.question_id = any(coalesce(p_speed_ids, '{}'::uuid[]))
    group by a.question_id;
  return query
    select 'live'::text, l.question_id::text, count(*)::bigint
    from public.live_showdown_answers l
    where l.question_id = any(coalesce(p_live_slugs, '{}'::text[]))
    group by l.question_id;
end;
$$;

revoke all on function public.question_report_play_counts(uuid[], text[]) from public, anon, authenticated;
grant execute on function public.question_report_play_counts(uuid[], text[]) to service_role;

comment on table public.question_reports is
  'Player reports of a bad Speed or Live question (Phase 4c.7, D32). Server-only; notes are untrusted player text.';
