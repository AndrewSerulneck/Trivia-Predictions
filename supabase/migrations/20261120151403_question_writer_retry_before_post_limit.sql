-- A retried identical writer batch always gets its idempotent success
-- (docs/speed-trivia-backlog-and-quality-plan.md Phase 7g; second review R2 #20.5).
--
-- Before this, question_writer_receive (20261116030506) counted an identical-batch retry as one of the day's two
-- posts, so a third identical retry got 'writer-post-limit' (429) for a batch that was already stored. Now the
-- identical-batch check runs before the post limit and writes nothing: a retry is a read. The first post still counts,
-- a different batch on the same day is still 'writer-already-received', and the post limit still refuses anything
-- else once reached. Same signature, body otherwise unchanged; grants restated.

create or replace function public.question_writer_receive(p_game text, p_source text, p_model text, p_batch_hash text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_day date := (now() at time zone 'utc')::date; run public.question_writer_runs; n int;
begin
  if p_game is null or p_game not in ('speed', 'live')
    or p_source is null or p_source not in ('chatgpt', 'gemini-fallback')
    or (p_model is not null and p_model !~ '^[A-Za-z0-9._:-]{1,80}$')
    or p_batch_hash is null or p_batch_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 40
    or octet_length(p_items::text) > 65536
    or exists (select 1 from jsonb_array_elements(p_items) e
      where jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'slot') is distinct from 'object'
        or jsonb_typeof(e->'payload') is distinct from 'object') then
    raise exception 'invalid-writer-post';
  end if;
  insert into public.question_writer_runs (game, run_date, source, model) values (p_game, v_day, p_source, p_model)
  on conflict (game, run_date) do nothing;
  select * into run from public.question_writer_runs where game = p_game and run_date = v_day for update;
  -- R2 #20.5: the batch is already stored, so its retry succeeds whatever the post count.
  if run.batch_hash = p_batch_hash then
    return jsonb_build_object('runDate', v_day, 'received', run.received, 'idempotent', true);
  end if;
  if run.posts >= 2 then raise exception 'writer-post-limit'; end if;
  if run.batch_hash is not null then raise exception 'writer-already-received'; end if;
  insert into public.question_candidates (game, run_date, source, slot, payload)
  select p_game, v_day, run.source, e->'slot', e->'payload' from jsonb_array_elements(p_items) e;
  get diagnostics n = row_count;
  update public.question_writer_runs set posts = posts + 1, batch_hash = p_batch_hash, received = n, updated_at = now()
  where game = p_game and run_date = v_day;
  return jsonb_build_object('runDate', v_day, 'received', n, 'idempotent', false);
end $$;
revoke all on function public.question_writer_receive(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.question_writer_receive(text, text, text, text, jsonb) to service_role;
