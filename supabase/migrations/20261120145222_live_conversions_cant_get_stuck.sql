-- Speed -> Live conversions can't get stuck (docs/speed-trivia-backlog-and-quality-plan.md Phase 7f; second code review
-- R2 #27.1, #27.2, #27.3, #27.5, #27.7). Replaces 20261119134654's live_conversion_receive; adds live_conversion_sweep.
--
-- * R2 #27.1: a conversions-only post no longer creates the day's question_writer_runs row, so it can't hide "Writer
--   stopped" for Live (readWriterState reads that table). Conversions are tracked in live_conversion_requests. Their
--   candidates therefore no longer need a run row: the question_candidates -> question_writer_runs foreign key goes.
--   Nothing joins the two; the regular batch still creates its run row first (question_writer_receive), and
--   service_role can't delete runs (select only), so every regular candidate keeps its run.
-- * R2 #27.3: the writer's route marks a rewrite that fails the Live schema as {requestId, invalid: true}; receive
--   fails that request with a reason, so it isn't re-sent every night.
-- * R2 #27.2, #27.5, #27.7: the nightly calls live_conversion_sweep before processing.
-- No question content changes. Nothing here writes trivia_questions. Server only (service_role).

alter table public.question_candidates drop constraint if exists question_candidates_run;

-- As 20261119134654, minus the run-row insert, plus {requestId, invalid: true} -> failed. Returns
-- {runDate, received, declined, failed, already}.
create or replace function public.live_conversion_receive(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_day date := (now() at time zone 'utc')::date; e jsonb; req public.live_conversion_requests; q record;
  cand uuid; received int := 0; declined int := 0; failed int := 0; already int := 0; v_reason text;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20
    or octet_length(p_items::text) > 65536
    or exists (select 1 from jsonb_array_elements(p_items) x
      where jsonb_typeof(x) <> 'object'
        or coalesce(x->>'requestId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or case when x->'declined' = 'true'::jsonb then jsonb_typeof(x->'reason') is distinct from 'string'
          when x->'invalid' = 'true'::jsonb then false
          else jsonb_typeof(x->'slot') is distinct from 'object' or jsonb_typeof(x->'payload') is distinct from 'object' end)
    or (select count(distinct x->>'requestId') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'invalid-conversion-post';
  end if;
  for e in select * from jsonb_array_elements(p_items) loop
    select * into req from public.live_conversion_requests where id = (e->>'requestId')::uuid for update;
    if not found or req.status <> 'queued' then already := already + 1; continue; end if;
    if e->'declined' = 'true'::jsonb then
      v_reason := left(nullif(btrim(e->>'reason'), ''), 500);
      update public.live_conversion_requests set status = 'declined', reason = coalesce(v_reason, 'Declined.'),
        updated_at = now() where id = req.id;
      declined := declined + 1;
      continue;
    end if;
    if e->'invalid' = 'true'::jsonb then
      update public.live_conversion_requests set status = 'failed',
        reason = 'ChatGPT''s rewrite didn''t fit Live''s format.', updated_at = now() where id = req.id;
      failed := failed + 1;
      continue;
    end if;
    select id, question, options->>correct_answer as answer into q from public.trivia_questions where id = req.speed_question_id;
    insert into public.question_candidates (game, run_date, source, slot, payload)
    values ('live', v_day, 'chatgpt', e->'slot', (e->'payload') || jsonb_build_object('conversionOf', req.id,
      'fromSpeed', jsonb_build_object('id', q.id, 'question', q.question, 'answer', q.answer)))
    returning id into cand;
    update public.live_conversion_requests set status = 'sent', candidate_id = cand, reason = null, updated_at = now()
    where id = req.id;
    received := received + 1;
  end loop;
  return jsonb_build_object('runDate', v_day, 'received', received, 'declined', declined, 'failed', failed, 'already', already);
end $$;
revoke all on function public.live_conversion_receive(jsonb) from public, anon, authenticated;
grant execute on function public.live_conversion_receive(jsonb) to service_role;

-- The nightly's tidy-up, before it reads the day's candidates. Returns {failed, requeued, done}.
-- 1. R2 #27.7: a queued request whose Speed question is no longer active or waiting (rejected or retired: 'deleted')
--    fails, "The Speed question wasn't kept." (The brief only ever sends active ones, so it would wait forever.)
-- 2. R2 #27.2, #27.5: a request 'sent' more than 3 days ago whose candidate is gone or no longer 'received':
--    - the candidate reached Live review (it has a question_ref): the request is 'done', as the nightly would have set
--      it, so a waiting Live version is never written twice;
--    - otherwise (gone, rejected, skipped): back to 'queued', "Sent again", for the next brief.
--    A candidate still 'received' is left alone: the nightly reads unsettled conversions from earlier days too.
create function public.live_conversion_sweep()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare n_failed int; n_done int; n_requeued int;
begin
  update public.live_conversion_requests r set status = 'failed', reason = 'The Speed question wasn''t kept.', updated_at = now()
  from public.trivia_questions q
  where q.id = r.speed_question_id and r.status = 'queued' and q.status not in ('active', 'pending_review');
  get diagnostics n_failed = row_count;

  update public.live_conversion_requests r set status = 'done', reason = null, updated_at = now()
  from public.question_candidates c
  where c.id = r.candidate_id and r.status = 'sent' and r.updated_at < now() - interval '3 days'
    and c.question_ref is not null;
  get diagnostics n_done = row_count;

  update public.live_conversion_requests r set status = 'queued', candidate_id = null, reason = 'Sent again', updated_at = now()
  where r.status = 'sent' and r.updated_at < now() - interval '3 days'
    and not exists (select 1 from public.question_candidates c
      where c.id = r.candidate_id and (c.status = 'received' or c.question_ref is not null));
  get diagnostics n_requeued = row_count;

  return jsonb_build_object('failed', n_failed, 'requeued', n_requeued, 'done', n_done);
end $$;
revoke all on function public.live_conversion_sweep() from public, anon, authenticated;
grant execute on function public.live_conversion_sweep() to service_role;
