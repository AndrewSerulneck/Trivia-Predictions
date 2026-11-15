-- Speed Trivia "bar test" scores in Quick Review (docs/speed-trivia-backlog-and-quality-plan.md, Phase 2).
-- No question is changed by this migration. Scores are a sort and a filter, never a delete.
--
-- * speed_trivia_review_set_audience stores a score in speed_trivia_review_marks.audience for a waiting Speed
--   question whose content still matches what was scored. It never touches decision fields (Undo trusts them).
-- * A stored score carries a cheap content key (md5 of the graded fields). If the question is edited later, the
--   key no longer matches and Quick Review treats the row as unscored. The full speed_content_hash costs ~5 s over
--   the whole backlog, too slow for every page.
-- * speed_trivia_review_queue gains a score band (p_score_min/p_score_max) and a 'best' sort (score high to low,
--   then oldest). The new parameters default to null, so Phase 1 callers keep working.

create function public.speed_trivia_audience_key(q public.trivia_questions) returns text
language sql immutable set search_path = pg_catalog, public as $$
  select md5(concat_ws(chr(31), q.question, q.options::text, q.correct_answer::text, coalesce(q.category, ''),
    coalesce(q.image_url, ''), coalesce(q.image_context::text, '')))
$$;

-- p_rows = [{id, contentHash, audience:{version, model, score 1-5, familiar, fun, estCorrect, flags}}], 1-200.
-- Returns {written, skipped}. Skipped: not a waiting Speed question, or content changed since it was scored.
create function public.speed_trivia_review_set_audience(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare entry jsonb; q public.trivia_questions; a jsonb; written int := 0; skipped int := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 200 then
    raise exception 'invalid-quick-review-request';
  end if;
  for entry in select value from jsonb_array_elements(p_rows) loop
    a := entry->'audience';
    if jsonb_typeof(a) is distinct from 'object' or pg_column_size(a) > 2000
      or jsonb_typeof(a->'score') is distinct from 'number' or (a->>'score') !~ '^[1-5]$'
      or jsonb_typeof(a->'version') is distinct from 'string'
      or coalesce(entry->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'invalid-quick-review-request';
    end if;
    select * into q from public.trivia_questions where id = (entry->>'id')::uuid;
    if not found or q.question_pool <> 'anytime_blitz' or q.answer_format <> 'multiple_choice'
      or q.status <> 'pending_review'
      or public.speed_content_hash(to_jsonb(q)) is distinct from entry->>'contentHash' then
      skipped := skipped + 1;
      continue;
    end if;
    a := a || jsonb_build_object('key', public.speed_trivia_audience_key(q), 'scoredAt', now());
    insert into public.speed_trivia_review_marks (row_id, audience) values (q.id, a)
    on conflict (row_id) do update set audience = excluded.audience;
    written := written + 1;
  end loop;
  return jsonb_build_object('written', written, 'skipped', skipped);
end $$;

drop function public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int);

-- One bounded page of undecided waiting questions, plus the filter's total. Keyset paging on (created_at, id),
-- or (score, created_at, id) for 'best'. A score band excludes unscored rows.
create function public.speed_trivia_review_queue(
  p_category text, p_source text, p_sort text, p_after_created timestamptz, p_after_id uuid, p_limit int,
  p_score_min int default null, p_score_max int default null, p_after_score int default null
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare total bigint; page jsonb; sort text := coalesce(p_sort, 'oldest');
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or coalesce(p_source, 'all') not in ('all', 'older', 'recent')
    or sort not in ('oldest', 'newest', 'best')
    or (p_after_created is null) <> (p_after_id is null)
    or (sort = 'best' and p_after_id is not null and p_after_score is null)
    or (p_score_min is not null and p_score_min not between 1 and 5)
    or (p_score_max is not null and p_score_max not between 1 and 5)
    or (p_score_min is not null and p_score_max is not null and p_score_min > p_score_max) then
    raise exception 'invalid-quick-review-query';
  end if;
  with base as (
    select q.*, case when m.audience->>'key' = public.speed_trivia_audience_key(q) then m.audience end as aud
    from public.trivia_questions q
    left join public.speed_trivia_review_marks m on m.row_id = q.id
    where q.question_pool = 'anytime_blitz' and q.answer_format = 'multiple_choice' and q.status = 'pending_review'
      and m.decision is null
      and (p_category is null or q.category = p_category)
      and (coalesce(p_source, 'all') = 'all' or (p_source = 'older') = (q.speed_generation_metadata is null))
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
      'contentHash', public.speed_content_hash(to_jsonb(b) - 'aud' - 'sc' - 'ord'),
      'audience', case when b.aud is null then null else jsonb_build_object(
        'score', (b.aud->>'score')::int, 'familiar', b.aud->'familiar', 'fun', b.aud->'fun',
        'estCorrect', b.aud->'estCorrect', 'flags', coalesce(b.aud->'flags', '[]'::jsonb)) end) order by b.ord)
      from ordered b where b.ord <= p_limit), '[]'::jsonb)
  into total, page;
  return jsonb_build_object('total', total, 'rows', page);
end $$;

revoke all on function public.speed_trivia_audience_key(public.trivia_questions),
  public.speed_trivia_review_set_audience(jsonb),
  public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int, int, int, int)
  from public, anon, authenticated;
grant execute on function public.speed_trivia_audience_key(public.trivia_questions),
  public.speed_trivia_review_set_audience(jsonb),
  public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int, int, int, int)
  to service_role;
