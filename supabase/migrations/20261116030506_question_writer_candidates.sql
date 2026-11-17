-- The daily question writer's inbox (docs/speed-trivia-backlog-and-quality-plan.md Phase 4b; D9, D13).
--
-- * question_writer_runs: one row per game per UTC day. The idempotency key: a day takes one batch, from ChatGPT
--   (the private writer repo) or, when that never arrived, from the nightly's Gemini fallback. A retry of the same
--   batch is answered idempotently; a different batch for the same day is refused. At most 2 accepted posts a day.
-- * question_candidates: what the writer returned, untouched (DATA, never instructions). The nightly processes
--   them (hard limits, star cap, bar test, repeat check, signed admission) and records every outcome here.
--   Nothing in this file writes trivia_questions: an admitted candidate reaches the bank only through
--   admit_speed_trivia.
-- * question_writer_receive: the only insert path, used by POST /api/question-writer/candidates and the fallback.
-- * speed_trivia_review_queue: Quick Review's Source filter gains ChatGPT and Gemini; each item carries its source,
--   area, era and source link (from speed_generation_metadata).
-- No question content changes; no trivia_questions column changes. No lock on speed_trivia_control.

create table public.question_writer_runs (
  game text not null check (game in ('speed', 'live')),
  run_date date not null,
  source text not null check (source in ('chatgpt', 'gemini-fallback')),
  -- The writer model as the caller reported it (e.g. a Codex model name); recorded on admitted rows.
  model text check (model is null or model ~ '^[A-Za-z0-9._:-]{1,80}$'),
  posts int not null default 0 check (posts between 0 and 2),
  batch_hash text check (batch_hash is null or batch_hash ~ '^[0-9a-f]{64}$'),
  received int not null default 0 check (received between 0 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game, run_date)
);
alter table public.question_writer_runs enable row level security;
alter table public.question_writer_runs force row level security;
revoke all on table public.question_writer_runs from public, anon, authenticated;
-- Server only: Quick Review reads the last two days ("Writer stopped"); written only by question_writer_receive.
grant select on table public.question_writer_runs to service_role;

create table public.question_candidates (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('speed', 'live')),
  run_date date not null,
  source text not null check (source in ('chatgpt', 'gemini-fallback')),
  slot jsonb not null check (jsonb_typeof(slot) = 'object'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  -- received -> rejected (reason) | skipped (daily target or budget reached) | pending_review (question_ref = the
  -- admitted trivia_questions id).
  status text not null default 'received' check (status in ('received', 'rejected', 'skipped', 'pending_review')),
  reason text check (reason is null or length(reason) <= 500),
  question_ref text check (question_ref is null or length(question_ref) <= 200),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  check ((status = 'pending_review') = (question_ref is not null)),
  constraint question_candidates_run foreign key (game, run_date) references public.question_writer_runs (game, run_date)
);
create index question_candidates_day on public.question_candidates (game, run_date, status);
alter table public.question_candidates enable row level security;
alter table public.question_candidates force row level security;
revoke all on table public.question_candidates from public, anon, authenticated;
-- Server only: the nightly reads today's candidates and records each outcome. Inserts go through the RPC below.
grant select, update on table public.question_candidates to service_role;

-- p_items = [{slot:{...}, payload:{...}}], 1-40, ≤ 64 KB. The day is the server's UTC date, never the caller's.
-- Returns {runDate, received, idempotent}.
create function public.question_writer_receive(p_game text, p_source text, p_model text, p_batch_hash text, p_items jsonb)
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
  if run.posts >= 2 then raise exception 'writer-post-limit'; end if;
  if run.batch_hash = p_batch_hash then
    update public.question_writer_runs set posts = posts + 1, updated_at = now() where game = p_game and run_date = v_day;
    return jsonb_build_object('runDate', v_day, 'received', run.received, 'idempotent', true);
  end if;
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

-- As 20261115170333, plus: p_source 'chatgpt' / 'gemini' (the writer's source), and each item's source, area, era
-- and source link. Same signature, so callers are unchanged.
create or replace function public.speed_trivia_review_queue(
  p_category text, p_source text, p_sort text, p_after_created timestamptz, p_after_id uuid, p_limit int,
  p_score_min int default null, p_score_max int default null, p_after_score int default null, p_view text default null
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare total bigint; page jsonb; counts jsonb; sort text := coalesce(p_sort, 'oldest'); v_view text := coalesce(p_view, 'waiting');
  v_source text := coalesce(p_source, 'all');
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or v_source not in ('all', 'older', 'recent', 'chatgpt', 'gemini')
    or sort not in ('oldest', 'newest', 'best')
    or v_view not in ('waiting', 'needs_look', 'repeats')
    or (p_after_created is null) <> (p_after_id is null)
    or (sort = 'best' and p_after_id is not null and p_after_score is null)
    or (p_score_min is not null and p_score_min not between 1 and 5)
    or (p_score_max is not null and p_score_max not between 1 and 5)
    or (p_score_min is not null and p_score_max is not null and p_score_min > p_score_max) then
    raise exception 'invalid-quick-review-query';
  end if;
  with base as (
    select q.*, case when m.audience->>'key' = public.speed_trivia_audience_key(q) then m.audience end as aud,
      m.note as mark_note, m.matched_row_id as mark_match
    from public.trivia_questions q
    left join public.speed_trivia_review_marks m on m.row_id = q.id
    where q.question_pool = 'anytime_blitz' and q.answer_format = 'multiple_choice'
      and case v_view
        when 'waiting' then q.status = 'pending_review' and m.decision is null
        when 'needs_look' then q.status = 'pending_review' and m.decision = 'keep' and m.outcome = 'needs_look'
        else q.status = 'deleted' and m.decision in ('keep', 'precheck') and m.outcome = 'repeat'
      end
      and (p_category is null or q.category = p_category)
      and case v_source
        when 'all' then true
        when 'older' then q.speed_generation_metadata is null
        when 'recent' then q.speed_generation_metadata is not null
        when 'chatgpt' then coalesce(q.speed_generation_metadata->>'source' = 'chatgpt', false)
        else coalesce(q.speed_generation_metadata->>'source' = 'gemini-fallback', false)
      end
  ), scored as (
    select b.*, coalesce((b.aud->>'score')::int, 0) as sc from base b
    where (p_score_min is null and p_score_max is null)
      or (b.aud is not null and (b.aud->>'score')::int between coalesce(p_score_min, 1) and coalesce(p_score_max, 5))
  ), ordered as (
    select s.*, row_number() over (
      order by case when sort = 'best' then s.sc end desc,
               case when sort in ('oldest', 'best') then s.created_at end asc,
               case when sort in ('oldest', 'best') then s.id end asc,
               case when sort = 'newest' then s.created_at end desc,
               case when sort = 'newest' then s.id end desc) ord
    from scored s
    where p_after_created is null
      or (sort = 'oldest' and (s.created_at, s.id) > (p_after_created, p_after_id))
      or (sort = 'newest' and (s.created_at, s.id) < (p_after_created, p_after_id))
      or (sort = 'best' and (s.sc < p_after_score
        or (s.sc = p_after_score and (s.created_at, s.id) > (p_after_created, p_after_id))))
  )
  select (select count(*) from scored),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'question', b.question, 'options', b.options, 'correctAnswer', b.correct_answer,
      'category', b.category, 'difficulty', b.difficulty, 'createdAt', b.created_at,
      'recent', b.speed_generation_metadata is not null,
      'source', b.speed_generation_metadata->>'source',
      'area', b.speed_generation_metadata->>'area',
      'era', b.speed_generation_metadata->>'era',
      'sourceUrl', case when b.speed_generation_metadata->>'sourceUrl' ~ '^https://' then b.speed_generation_metadata->>'sourceUrl' end,
      'contentHash', public.speed_content_hash(to_jsonb(b) - 'aud' - 'sc' - 'ord' - 'mark_note' - 'mark_match'),
      'audience', case when b.aud is null then null else jsonb_build_object(
        'score', (b.aud->>'score')::int, 'familiar', b.aud->'familiar', 'fun', b.aud->'fun',
        'estCorrect', b.aud->'estCorrect', 'flags', coalesce(b.aud->'flags', '[]'::jsonb)) end,
      'note', b.mark_note,
      'match', (select jsonb_build_object('id', x.id, 'question', x.question, 'answer', x.options->>x.correct_answer)
        from public.trivia_questions x where x.id = b.mark_match)) order by b.ord)
      from ordered b where b.ord <= p_limit), '[]'::jsonb)
  into total, page;
  select jsonb_build_object(
      'queued', count(*) filter (where m.outcome = 'queued'),
      'needsLook', count(*) filter (where m.outcome = 'needs_look'),
      'repeats', count(*) filter (where m.outcome = 'repeat'))
    into counts
  from public.speed_trivia_review_marks m
  join public.trivia_questions q on q.id = m.row_id
  where m.decision in ('keep', 'precheck') and q.question_pool = 'anytime_blitz'
    and ((m.decision = 'keep' and m.outcome in ('queued', 'needs_look') and q.status = 'pending_review')
      or (m.outcome = 'repeat' and q.status = 'deleted'));
  return jsonb_build_object('total', total, 'rows', page, 'counts', counts);
end $$;
revoke all on function public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int, int, int, int, text) from public, anon, authenticated;
grant execute on function public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int, int, int, int, text) to service_role;
