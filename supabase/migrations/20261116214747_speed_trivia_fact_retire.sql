-- Phase 4a.2 (D26) of docs/speed-trivia-backlog-and-quality-plan.md: one fact, one question.
--
-- speed_trivia_subject_cap_retire (20261116014954) never takes a subject below 5 active + waiting rows, but the fact
-- rules keep fewer: one question per fact, none on a little-known fact. speed_trivia_fact_retire is the same status-only
-- retirement with the same checks and the same log table (so speed_trivia_subject_cap_undo and the D5 release in
-- speed_trivia_released_rows_v2 work unchanged), without the floor of 5. Instead, a row dropped as a repeat of a fact
-- (keptId set) is retired only while the row that keeps that fact is still active or waiting on the same subject, so a
-- fact is never lost to a stale plan.
-- Lock order matches the admission RPCs: the control row first, then question rows.

-- p_rows = [{id, contentHash, status, subjectKey, keptId}], 1-200, from the reviewed plan; keptId is a uuid or null.
-- Returns {retired:[id], skipped:[{id, reason}]}.
create function public.speed_trivia_fact_retire(p_run_id uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare entry jsonb; q public.trivia_questions; reason text; kept uuid; done jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb;
begin
  if p_run_id is null or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 200
    or exists (select 1 from jsonb_array_elements(p_rows) e
      where jsonb_typeof(e.value) <> 'object' or e.value->>'id' is null or e.value->>'contentHash' is null
        or coalesce(e.value->>'status', '') not in ('active', 'pending_review')
        or coalesce(length(e.value->>'subjectKey'), 0) not between 1 and 120
        or jsonb_typeof(coalesce(e.value->'keptId', 'null'::jsonb)) not in ('string', 'null')
        or e.value->>'keptId' = e.value->>'id') then
    raise exception 'invalid-fact-retire-request';
  end if;
  perform 1 from public.speed_trivia_control where singleton for update;
  for entry in select value from jsonb_array_elements(p_rows) loop
    reason := null;
    kept := (entry->>'keptId')::uuid;
    select * into q from public.trivia_questions where id = (entry->>'id')::uuid for update;
    if not found or q.question_pool <> 'anytime_blitz' or q.answer_format <> 'multiple_choice' then
      reason := 'not_speed';
    elsif q.status is distinct from entry->>'status' then
      reason := 'status_changed';
    elsif public.speed_content_hash(to_jsonb(q)) is distinct from entry->>'contentHash' then
      reason := 'content_changed';
    elsif not exists (select 1 from public.question_tags qt where qt.game = 'speed' and qt.question_ref = q.id::text
        and qt.subject_key = entry->>'subjectKey') then
      reason := 'tag_changed';
    elsif kept is not null and not exists (select 1 from public.trivia_questions t
        join public.question_tags kt on kt.game = 'speed' and kt.question_ref = t.id::text
        where t.id = kept and t.question_pool = 'anytime_blitz' and t.status in ('active', 'pending_review')
          and kt.subject_key = entry->>'subjectKey') then
      reason := 'kept_row_gone';
    end if;
    if reason is not null then
      skipped := skipped || jsonb_build_array(jsonb_build_object('id', entry->>'id', 'reason', reason));
      continue;
    end if;
    -- Status-only retirement, allowed without a permit (like Quick Review Reject).
    update public.trivia_questions set status = 'deleted' where id = q.id returning * into q;
    insert into public.speed_trivia_subject_cap_log (run_id, row_id, subject_key, old_status, content_hash, retired_revision)
    values (p_run_id, q.id, entry->>'subjectKey', entry->>'status', entry->>'contentHash', q.speed_revision);
    done := done || to_jsonb(q.id);
  end loop;
  return jsonb_build_object('retired', done, 'skipped', skipped);
end $$;

revoke all on function public.speed_trivia_fact_retire(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.speed_trivia_fact_retire(uuid, jsonb) to service_role;
