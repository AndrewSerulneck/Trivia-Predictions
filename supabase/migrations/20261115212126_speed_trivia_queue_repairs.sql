-- Speed Trivia overnight Keep queue repairs (docs/speed-trivia-backlog-and-quality-plan.md, Phase 3a; review #3).
-- No question is changed by this migration, and speed_trivia_queue_prepare never changes trivia_questions.
--
-- A queued Keep whose question is no longer waiting (deleted, moved out of Speed, or approved elsewhere with other
-- content) used to stay 'queued' forever: the overnight job skipped it without settling it, so every night counted
-- it, reserved dollars and loaded the bank for nothing. speed_trivia_queue_prepare runs at the start of each night:
--   settled = the question is active and carries the admission speed_trivia_queue_settle('approved') requires (same
--             content as the Keep, decision 'unique'); with p_apply it is recorded 'approved', as settle would.
--   stale   = any other queued Keep whose question isn't a waiting Speed question; with p_apply its decision is
--             cleared (the same field reset as speed_trivia_quick_undo), and the mark is deleted when it holds no
--             score and no pre-check result.
--   queued  = what's left: queued Keeps on waiting Speed questions.
-- Without p_apply it only counts and takes no locks.
-- Lock order matches the admission RPCs: the control row first, then marks.

create index speed_trivia_review_marks_queued_idx on public.speed_trivia_review_marks (decided_at, row_id)
  where decision = 'keep' and outcome = 'queued';

create function public.speed_trivia_queue_prepare(p_apply boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r record; n_queued bigint := 0; n_stale bigint := 0; n_settled bigint := 0;
begin
  if p_apply is null then raise exception 'invalid-quick-review-request'; end if;
  if p_apply then
    perform 1 from public.speed_trivia_control where singleton for update;
    perform 1 from public.speed_trivia_review_marks where decision = 'keep' and outcome = 'queued' order by row_id for update;
  end if;
  for r in
    select m.row_id, m.audience, m.precheck, q.speed_revision,
      case
        when q.id is null or q.question_pool <> 'anytime_blitz' or q.answer_format <> 'multiple_choice' then 'stale'
        when q.status = 'pending_review' then 'queued'
        when q.status = 'active' and a.row_id is not null and a.content_hash = m.content_hash
          and a.evidence->>'decision' = 'unique'
          and public.speed_content_hash(to_jsonb(q)) = m.content_hash then 'settled'
        else 'stale'
      end as state
    from public.speed_trivia_review_marks m
    left join public.trivia_questions q on q.id = m.row_id
    left join public.speed_trivia_admissions a on a.row_id = m.row_id
    where m.decision = 'keep' and m.outcome = 'queued'
    order by m.row_id
  loop
    if r.state = 'queued' then
      n_queued := n_queued + 1;
    elsif r.state = 'settled' then
      n_settled := n_settled + 1;
      if p_apply then
        update public.speed_trivia_review_marks set outcome = 'approved', reason = null, matched_row_id = null, note = null,
          checked_at = now(), decided_revision = r.speed_revision
        where row_id = r.row_id;
      end if;
    else
      n_stale := n_stale + 1;
      if p_apply then
        if r.audience is null and r.precheck is null then
          delete from public.speed_trivia_review_marks where row_id = r.row_id;
        else
          update public.speed_trivia_review_marks set decision = null, outcome = null, reason = null, content_hash = null,
            decided_revision = null, decided_at = null, matched_row_id = null, note = null, checked_at = null
          where row_id = r.row_id;
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('queued', n_queued, 'stale', n_stale, 'settled', n_settled);
end $$;

revoke all on function public.speed_trivia_queue_prepare(boolean) from public, anon, authenticated;
grant execute on function public.speed_trivia_queue_prepare(boolean) to service_role;
