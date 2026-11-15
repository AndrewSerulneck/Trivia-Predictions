-- Speed Trivia D5: released rows by revision (docs/speed-trivia-backlog-and-quality-plan.md, Phase 3b, review #4).
-- No question or mark is changed by this migration.
--
-- A full-bank check skips a released row (a waiting question rejected in Quick Review as dull or obscure) only at
-- the revision it was released at. A long-running session holds the set it read when it started; if that row is
-- restored by Undo and later rejected again (for example as wrong), its revision has moved on, so the session
-- compares new questions with it again instead of skipping it on a stale id.
--
-- speed_trivia_released_rows() (20261115170333) is kept for now and dropped once nothing calls it.

create function public.speed_trivia_released_rows_v2() returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.row_id::text, 'revision', m.decided_revision) order by m.row_id), '[]'::jsonb)
  from public.speed_trivia_review_marks m
  join public.trivia_questions q on q.id = m.row_id
  where m.decision = 'reject' and m.outcome = 'rejected' and m.reason = 'quality'
    and q.question_pool = 'anytime_blitz' and q.status = 'deleted' and q.speed_revision = m.decided_revision
$$;

revoke all on function public.speed_trivia_released_rows_v2() from public, anon, authenticated;
grant execute on function public.speed_trivia_released_rows_v2() to service_role;
