-- Speed -> Live conversions (docs/speed-trivia-backlog-and-quality-plan.md Phase 4e; D37, Andrew 2026-11-18).
--
-- Andrew queues a Speed question ("Make Live" in the question list, key L in Quick Review). That night the Live brief
-- sends the oldest queued ones to the private ChatGPT writer, which rewrites each as a write-in Live question with the
-- same answer, or declines with a reason. The rewrite becomes an ordinary Live writer candidate (question_candidates,
-- game 'live') and is gated, reviewed and published like every other one.
--
--   queued -> sent (rewrite received; candidate_id set) -> done (passed the nightly gates; waits in Live review)
--                                                        -> failed (a gate rejected it; reason)
--   queued -> declined (ChatGPT declined; reason)        queued -> cancelled (Andrew)
--
-- Conversions COPY, never move: the Speed row is only read here; nothing in this file writes trivia_questions.
-- The Live version reaches players only through Publish -> PR -> Sync Live Trivia (D10).
-- Server only: RLS on, no browser grants; every function is SECURITY DEFINER and executable by service_role only.

create table public.live_conversion_requests (
  id uuid primary key default gen_random_uuid(),
  speed_question_id uuid not null references public.trivia_questions (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'done', 'declined', 'failed', 'cancelled')),
  candidate_id uuid references public.question_candidates (id) on delete set null,
  reason text check (reason is null or length(reason) <= 500),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'queued' or candidate_id is null)
);
-- One open request per Speed question.
create unique index live_conversion_requests_open on public.live_conversion_requests (speed_question_id)
  where status in ('queued', 'sent');
create index live_conversion_requests_queue on public.live_conversion_requests (requested_at, id) where status = 'queued';
create index live_conversion_requests_question on public.live_conversion_requests (speed_question_id, requested_at desc);
alter table public.live_conversion_requests enable row level security;
alter table public.live_conversion_requests force row level security;
revoke all on table public.live_conversion_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.live_conversion_requests to service_role;

-- Queue one Speed question (active, or waiting after a Keep). Returns {id, status, already}. An open request is
-- returned as is (already = true). Refuses a non-Speed row, a retired one, and one whose Live version is waiting in
-- review ('conversion-in-review') or was kept or published ('conversion-already-live').
create function public.live_conversion_queue(p_question_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare q record; open_row public.live_conversion_requests; live_status text; new_id uuid;
begin
  if p_question_id is null then raise exception 'invalid-conversion'; end if;
  perform pg_advisory_xact_lock(hashtext('live_conversion:' || p_question_id::text));
  select id, status, question_pool, answer_format into q from public.trivia_questions where id = p_question_id;
  if not found or q.question_pool <> 'anytime_blitz' or q.answer_format <> 'multiple_choice' then
    raise exception 'conversion-not-speed';
  end if;
  if q.status not in ('active', 'pending_review') then raise exception 'conversion-not-active'; end if;
  select * into open_row from public.live_conversion_requests
  where speed_question_id = p_question_id and status in ('queued', 'sent');
  if found then return jsonb_build_object('id', open_row.id, 'status', open_row.status, 'already', true); end if;
  select c.status into live_status from public.live_conversion_requests r
  join public.question_candidates c on c.id = r.candidate_id
  where r.speed_question_id = p_question_id and r.status = 'done'
    and c.status in ('pending_review', 'keep', 'publishing', 'pr_open', 'published')
  order by r.requested_at desc limit 1;
  if live_status = 'pending_review' then raise exception 'conversion-in-review'; end if;
  if live_status is not null then raise exception 'conversion-already-live'; end if;
  insert into public.live_conversion_requests (speed_question_id) values (p_question_id) returning id into new_id;
  return jsonb_build_object('id', new_id, 'status', 'queued', 'already', false);
end $$;
revoke all on function public.live_conversion_queue(uuid) from public, anon, authenticated;
grant execute on function public.live_conversion_queue(uuid) to service_role;

-- Cancel a still-queued request. Returns {cancelled: true|false}; one already sent to the writer can't be cancelled.
create function public.live_conversion_cancel(p_question_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare n int;
begin
  if p_question_id is null then raise exception 'invalid-conversion'; end if;
  update public.live_conversion_requests set status = 'cancelled', updated_at = now()
  where speed_question_id = p_question_id and status = 'queued';
  get diagnostics n = row_count;
  return jsonb_build_object('cancelled', n > 0);
end $$;
revoke all on function public.live_conversion_cancel(uuid) from public, anon, authenticated;
grant execute on function public.live_conversion_cancel(uuid) to service_role;

-- The question list's labels: for ≤ 100 Speed ids, the newest request that isn't cancelled, with its Live candidate's
-- status. Ids with none are left out. Returns [{questionId, status, reason, liveStatus}].
create function public.live_conversion_status(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_ids is null or cardinality(p_ids) > 100 then raise exception 'invalid-conversion'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('questionId', x.speed_question_id, 'status', x.status,
    'reason', x.reason, 'liveStatus', x.live_status)), '[]'::jsonb) into result
  from (
    select distinct on (r.speed_question_id) r.speed_question_id, r.status, r.reason, c.status as live_status
    from public.live_conversion_requests r
    left join public.question_candidates c on c.id = r.candidate_id
    where r.speed_question_id = any (p_ids) and r.status <> 'cancelled'
    order by r.speed_question_id, r.requested_at desc, r.id desc
  ) x;
  return result;
end $$;
revoke all on function public.live_conversion_status(uuid[]) from public, anon, authenticated;
grant execute on function public.live_conversion_status(uuid[]) to service_role;

-- The brief's conversion prompt: the ≤ p_limit oldest queued requests whose Speed question is live. Read only (the
-- brief is a GET; requests turn 'sent' on receive). Returns [{requestId, question, options, answer, category,
-- whyTrue, expiresOn, era, sourceUrl}] (the last four from the writer's metadata; null for older questions).
create function public.live_conversion_brief(p_limit int)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then raise exception 'invalid-conversion'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('requestId', x.id, 'question', x.question, 'options', x.options,
    'answer', x.options->>x.correct_answer, 'category', x.category,
    'whyTrue', x.speed_generation_metadata->>'whyTrue', 'expiresOn', x.speed_generation_metadata->>'expiresOn',
    'era', x.speed_generation_metadata->>'era',
    'sourceUrl', case when x.speed_generation_metadata->>'sourceUrl' ~ '^https://' then x.speed_generation_metadata->>'sourceUrl' end)
    order by x.requested_at, x.id), '[]'::jsonb) into result
  from (
    select r.id, r.requested_at, q.question, q.options, q.correct_answer, q.category, q.speed_generation_metadata
    from public.live_conversion_requests r
    join public.trivia_questions q on q.id = r.speed_question_id
    where r.status = 'queued' and q.status = 'active'
      and q.question_pool = 'anytime_blitz' and q.answer_format = 'multiple_choice'
    order by r.requested_at, r.id
    limit p_limit
  ) x;
  return result;
end $$;
revoke all on function public.live_conversion_brief(int) from public, anon, authenticated;
grant execute on function public.live_conversion_brief(int) to service_role;

-- The writer's conversions: p_items = [{requestId, declined:true, reason} | {requestId, slot:{...}, payload:{...}}],
-- 1-20, ≤ 64 KB. A rewrite becomes a Live candidate for today's run (the server's UTC day), with the request id and
-- the Speed question added to its payload by the server ({conversionOf, fromSpeed}); a decline records its reason.
-- Idempotent per request: only a queued request changes; anything else is counted as `already`. Returns
-- {runDate, received, declined, already}.
create function public.live_conversion_receive(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_day date := (now() at time zone 'utc')::date; e jsonb; req public.live_conversion_requests; q record;
  cand uuid; received int := 0; declined int := 0; already int := 0; v_reason text;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20
    or octet_length(p_items::text) > 65536
    or exists (select 1 from jsonb_array_elements(p_items) x
      where jsonb_typeof(x) <> 'object'
        or coalesce(x->>'requestId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or case when x->'declined' = 'true'::jsonb then jsonb_typeof(x->'reason') is distinct from 'string'
          else jsonb_typeof(x->'slot') is distinct from 'object' or jsonb_typeof(x->'payload') is distinct from 'object' end)
    or (select count(distinct x->>'requestId') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'invalid-conversion-post';
  end if;
  -- Candidates belong to a writer run (FK). The Live batch normally created today's run already.
  insert into public.question_writer_runs (game, run_date, source) values ('live', v_day, 'chatgpt')
  on conflict (game, run_date) do nothing;
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
    select id, question, options->>correct_answer as answer into q from public.trivia_questions where id = req.speed_question_id;
    insert into public.question_candidates (game, run_date, source, slot, payload)
    values ('live', v_day, 'chatgpt', e->'slot', (e->'payload') || jsonb_build_object('conversionOf', req.id,
      'fromSpeed', jsonb_build_object('id', q.id, 'question', q.question, 'answer', q.answer)))
    returning id into cand;
    update public.live_conversion_requests set status = 'sent', candidate_id = cand, reason = null, updated_at = now()
    where id = req.id;
    received := received + 1;
  end loop;
  return jsonb_build_object('runDate', v_day, 'received', received, 'declined', declined, 'already', already);
end $$;
revoke all on function public.live_conversion_receive(jsonb) from public, anon, authenticated;
grant execute on function public.live_conversion_receive(jsonb) to service_role;
