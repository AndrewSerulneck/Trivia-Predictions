-- Speed Trivia overnight Keep queue (docs/speed-trivia-backlog-and-quality-plan.md, Phase 3; D5, D8).
-- No question is changed by this migration.
--
-- * The overnight job (scripts/process-speed-trivia-keep-queue.cjs) approves a queued Keep through the existing
--   signed admission (approved-only scope), then records the result with speed_trivia_queue_settle:
--     approved   -> the admission is verified here, so the mark can't claim an approval that didn't happen;
--     repeat     -> the row is retired (status-only, like Reject) with the approved question it repeats (D8);
--     needs_look -> left waiting with the checker's note, for Andrew.
-- * D5: a question rejected in Quick Review as dull or obscure (reason 'quality') no longer blocks its fact for
--   new questions. speed_trivia_released_rows lists them; full-bank checks skip them. Rejected as wrong,
--   repeats and older deletions stay blocked.
--   Safety: while a row is released, new questions are not compared with it. If Undo brings it back, every
--   question admitted during that window, and the row itself, loses the free fast lane (speed_trivia_quick_keep)
--   and goes to the overnight check instead. speed_trivia_released_restores records the window.
-- * Quick Review gains two views: "Needs a look" and "Repeats" (with the match and Undo), plus counts.
-- * D17: the same job pre-checks older undecided waiting questions (best score first) against approved questions,
--   without approving anything. A confirmed repeat is retired with its match (decision 'precheck', shown under
--   Repeats with Restore); unique and uncertain ones stay waiting, recorded in marks.precheck so they aren't redone.
-- * D4: every paid run reserves its dollars first in speed_trivia_queue_runs, inside a per-run cap and a total cap
--   (speed_trivia_queue_reserve). A run that dies before speed_trivia_queue_finish counts its whole reservation.
-- Lock order matches the admission RPCs: the control row first, then question rows.

alter table public.speed_trivia_review_marks drop constraint speed_trivia_review_marks_outcome_check;
alter table public.speed_trivia_review_marks drop constraint speed_trivia_review_marks_decision_check;
alter table public.speed_trivia_review_marks
  add constraint speed_trivia_review_marks_outcome_check
    check (outcome in ('queued', 'approved', 'rejected', 'repeat', 'needs_look')),
  add column matched_row_id uuid references public.trivia_questions(id) on delete set null,
  add column note text check (note is null or length(note) <= 600),
  add column checked_at timestamptz,
  add constraint speed_trivia_review_marks_checked
    check (decision is not null or (matched_row_id is null and note is null and checked_at is null)),
  add constraint speed_trivia_review_marks_repeat check (outcome is distinct from 'repeat' or matched_row_id is not null),
  -- 'precheck' = retired as a repeat by the D17 pre-check, never by Andrew.
  add constraint speed_trivia_review_marks_decision_check check (decision in ('keep', 'reject', 'precheck')),
  add constraint speed_trivia_review_marks_precheck_repeat check (decision is distinct from 'precheck' or outcome = 'repeat'),
  -- D17 result for the content it was made on: {contentHash, outcome, note?, at}. Never a decision.
  add column precheck jsonb check (precheck is null or (jsonb_typeof(precheck) = 'object'
    and precheck->>'contentHash' is not null and precheck->>'outcome' in ('unique', 'uncertain', 'repeat', 'restored')));

create table public.speed_trivia_released_restores (
  row_id uuid not null references public.trivia_questions(id) on delete cascade,
  released_revision bigint not null,
  restored_revision bigint not null,
  restored_at timestamptz not null default now(),
  primary key (row_id, restored_revision),
  check (released_revision < restored_revision)
);
alter table public.speed_trivia_released_restores enable row level security;
alter table public.speed_trivia_released_restores force row level security;
revoke all on table public.speed_trivia_released_restores from public, anon, authenticated;
-- Server reads only (audit); written only by speed_trivia_quick_undo.
grant select on table public.speed_trivia_released_restores to service_role;

-- D5: waiting-question rejects for quality whose fact may be tested again. Unchanged since the reject.
create function public.speed_trivia_released_rows() returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(m.row_id::text order by m.row_id), '[]'::jsonb)
  from public.speed_trivia_review_marks m
  join public.trivia_questions q on q.id = m.row_id
  where m.decision = 'reject' and m.outcome = 'rejected' and m.reason = 'quality'
    and q.question_pool = 'anytime_blitz' and q.status = 'deleted' and q.speed_revision = m.decided_revision
$$;

-- Keep. As Phase 1, plus: no fast lane for an admission made while a since-restored row was released, or for a
-- restored row's own earlier admission. Those go to the overnight check.
create or replace function public.speed_trivia_quick_keep(p_check jsonb, p_signature text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cfg public.speed_trivia_control; entry jsonb; q public.trivia_questions; a public.speed_trivia_admissions;
  candidate public.trivia_questions; verdict text; result jsonb := '[]'::jsonb;
begin
  select * into cfg from public.speed_trivia_control where singleton for update;
  if cfg.admission_secret is null
    or p_signature is distinct from public.speed_sign(cfg.admission_secret, public.speed_canonical(p_check))
    or p_check->>'operation' is distinct from 'quick_keep'
    or p_check->>'policyVersion' is distinct from cfg.policy
    or coalesce((p_check->>'expiresAt')::bigint, 0) < extract(epoch from clock_timestamp()) * 1000
    or (p_check->>'expiresAt')::bigint > extract(epoch from clock_timestamp()) * 1000 + 310000
    or jsonb_typeof(p_check->'rows') is distinct from 'array'
    or jsonb_array_length(p_check->'rows') < 1 or jsonb_array_length(p_check->'rows') > 200 then
    raise exception 'invalid-quick-review-check';
  end if;
  for entry in select value from jsonb_array_elements(p_check->'rows') loop
    select * into q from public.trivia_questions where id = (entry->>'id')::uuid for update;
    if not found or q.question_pool <> 'anytime_blitz' or q.answer_format <> 'multiple_choice'
      or q.status <> 'pending_review' then
      verdict := 'not_pending';
    elsif public.speed_content_hash(to_jsonb(q)) is distinct from entry->>'contentHash' then
      verdict := 'changed';
    else
      select * into a from public.speed_trivia_admissions where row_id = q.id;
      if found and a.content_hash = entry->>'contentHash' and a.policy = cfg.policy
        and a.evidence->>'decision' = 'unique' and a.evidence->>'contentHash' = a.content_hash
        and a.evidence->'comparisonScope' is null
        and not exists (select 1 from public.speed_trivia_released_restores r
          where r.released_revision < a.revision and a.revision < r.restored_revision)
        and not exists (select 1 from public.speed_trivia_released_restores r
          where r.row_id = q.id and r.restored_revision > a.revision) then
        candidate := q; candidate.status := 'active';
        insert into public.speed_trivia_permits values (txid_current(), q.id, public.speed_write_hash(to_jsonb(candidate)), false);
        update public.trivia_questions set status = 'active' where id = q.id returning * into q;
        delete from public.speed_trivia_permits where transaction_id = txid_current();
        verdict := 'approved';
      else
        verdict := 'queued';
      end if;
      insert into public.speed_trivia_review_marks (row_id, decision, outcome, reason, content_hash, decided_revision, decided_at)
      values (q.id, 'keep', verdict, null, entry->>'contentHash', q.speed_revision, now())
      on conflict (row_id) do update set decision = excluded.decision, outcome = excluded.outcome, reason = null,
        content_hash = excluded.content_hash, decided_revision = excluded.decided_revision, decided_at = excluded.decided_at,
        matched_row_id = null, note = null, checked_at = null;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('id', entry->>'id', 'outcome', verdict));
  end loop;
  return jsonb_build_object('rows', result);
end $$;

-- Reject: as Phase 1, and clears any overnight note on the mark.
create or replace function public.speed_trivia_quick_reject(p_row_ids uuid[], p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare q public.trivia_questions; content text; done jsonb := '[]'::jsonb;
begin
  if p_row_ids is null or cardinality(p_row_ids) < 1 or cardinality(p_row_ids) > 200
    or p_reason is null or p_reason not in ('quality', 'wrong') then
    raise exception 'invalid-quick-review-request';
  end if;
  perform 1 from public.speed_trivia_control where singleton for update;
  for q in select * from public.trivia_questions where id = any(p_row_ids) and question_pool = 'anytime_blitz'
      and answer_format = 'multiple_choice' and status = 'pending_review' order by id for update loop
    content := public.speed_content_hash(to_jsonb(q));
    update public.trivia_questions set status = 'deleted' where id = q.id returning * into q;
    insert into public.speed_trivia_review_marks (row_id, decision, outcome, reason, content_hash, decided_revision, decided_at)
    values (q.id, 'reject', 'rejected', p_reason, content, q.speed_revision, now())
    on conflict (row_id) do update set decision = excluded.decision, outcome = excluded.outcome, reason = excluded.reason,
      content_hash = excluded.content_hash, decided_revision = excluded.decided_revision, decided_at = excluded.decided_at,
      matched_row_id = null, note = null, checked_at = null;
    done := done || to_jsonb(q.id);
  end loop;
  return jsonb_build_object('rejected', done);
end $$;

-- Undo. As Phase 1, plus overnight repeats (back to waiting) and needs-look marks. Undoing a quality reject
-- records the release window (D5 safety, see speed_trivia_quick_keep). Restoring a pre-check repeat (D17) records
-- 'restored', so the pre-check never retires that wording again.
create or replace function public.speed_trivia_quick_undo(p_row_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.speed_trivia_review_marks; q public.trivia_questions; candidate public.trivia_questions;
begin
  perform 1 from public.speed_trivia_control where singleton for update;
  select * into m from public.speed_trivia_review_marks where row_id = p_row_id for update;
  if not found or m.decision is null then raise exception 'quick-review-nothing-to-undo'; end if;
  select * into q from public.trivia_questions where id = p_row_id for update;
  if not found or q.question_pool <> 'anytime_blitz' then raise exception 'quick-review-undo-drift'; end if;
  if m.outcome in ('rejected', 'approved', 'repeat') then
    if q.speed_revision is distinct from m.decided_revision
      or q.status is distinct from (case m.outcome when 'approved' then 'active' else 'deleted' end) then
      raise exception 'quick-review-undo-drift';
    end if;
    candidate := q; candidate.status := 'pending_review';
    insert into public.speed_trivia_permits values (txid_current(), q.id, public.speed_write_hash(to_jsonb(candidate)), false);
    update public.trivia_questions set status = 'pending_review' where id = q.id returning * into q;
    delete from public.speed_trivia_permits where transaction_id = txid_current();
    if m.outcome = 'rejected' and m.reason = 'quality' then
      insert into public.speed_trivia_released_restores (row_id, released_revision, restored_revision)
      values (q.id, m.decided_revision, q.speed_revision);
    end if;
  elsif q.status is distinct from 'pending_review' then
    raise exception 'quick-review-undo-drift';
  end if;
  if m.audience is null and m.decision <> 'precheck' then
    delete from public.speed_trivia_review_marks where row_id = p_row_id;
  else
    update public.speed_trivia_review_marks set decision = null, outcome = null, reason = null, content_hash = null,
      decided_revision = null, decided_at = null, matched_row_id = null, note = null, checked_at = null,
      precheck = case when m.decision = 'precheck'
        then jsonb_build_object('contentHash', m.content_hash, 'outcome', 'restored', 'at', now()) else m.precheck end
    where row_id = p_row_id;
  end if;
  return jsonb_build_object('id', q.id, 'status', q.status);
end $$;

-- Record one overnight result for a queued Keep. p_content_hash is the content the Keep was made on.
-- Returns {id, outcome}; outcome 'skipped' when the mark is no longer a queued Keep for that content.
create function public.speed_trivia_queue_settle(
  p_row_id uuid, p_content_hash text, p_outcome text, p_matched_row_id uuid, p_note text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.speed_trivia_review_marks; q public.trivia_questions; matched public.trivia_questions;
  a public.speed_trivia_admissions;
begin
  if p_row_id is null or p_content_hash is null or p_outcome is null
    or p_outcome not in ('approved', 'repeat', 'needs_look')
    or (p_outcome = 'repeat') <> (p_matched_row_id is not null)
    or (p_note is not null and length(p_note) > 600) then
    raise exception 'invalid-quick-review-request';
  end if;
  perform 1 from public.speed_trivia_control where singleton for update;
  select * into m from public.speed_trivia_review_marks where row_id = p_row_id for update;
  if not found or m.decision is distinct from 'keep' or m.outcome is distinct from 'queued'
    or m.content_hash is distinct from p_content_hash then
    return jsonb_build_object('id', p_row_id, 'outcome', 'skipped');
  end if;
  select * into q from public.trivia_questions where id = p_row_id for update;
  if not found or q.question_pool <> 'anytime_blitz' or q.answer_format <> 'multiple_choice' then
    raise exception 'invalid-quick-review-request';
  end if;
  if p_outcome = 'approved' then
    select * into a from public.speed_trivia_admissions where row_id = q.id;
    if q.status <> 'active' or public.speed_content_hash(to_jsonb(q)) is distinct from p_content_hash
      or a.row_id is null or a.content_hash is distinct from p_content_hash
      or a.evidence->>'decision' is distinct from 'unique' then
      raise exception 'invalid-quick-review-request';
    end if;
  elsif q.status <> 'pending_review' then
    return jsonb_build_object('id', p_row_id, 'outcome', 'skipped');
  elsif p_outcome = 'repeat' then
    select * into matched from public.trivia_questions where id = p_matched_row_id;
    if public.speed_content_hash(to_jsonb(q)) is distinct from p_content_hash
      or matched.id is null or matched.id = q.id or matched.question_pool <> 'anytime_blitz' or matched.status <> 'active' then
      raise exception 'invalid-quick-review-request';
    end if;
    -- Status-only retirement, allowed without a permit (like Reject).
    update public.trivia_questions set status = 'deleted' where id = q.id returning * into q;
  end if;
  update public.speed_trivia_review_marks set outcome = p_outcome,
    reason = case when p_outcome = 'repeat' then 'repeat' else null end,
    matched_row_id = p_matched_row_id, note = p_note, checked_at = now(), decided_revision = q.speed_revision
  where row_id = p_row_id;
  return jsonb_build_object('id', p_row_id, 'outcome', p_outcome);
end $$;

drop function public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int, int, int, int);

-- As Phase 2, plus p_view: 'waiting' (undecided, the default), 'needs_look' or 'repeats'; each item carries the
-- overnight note and the matched approved question; the result carries the queue counts.
create function public.speed_trivia_review_queue(
  p_category text, p_source text, p_sort text, p_after_created timestamptz, p_after_id uuid, p_limit int,
  p_score_min int default null, p_score_max int default null, p_after_score int default null, p_view text default null
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare total bigint; page jsonb; counts jsonb; sort text := coalesce(p_sort, 'oldest'); v_view text := coalesce(p_view, 'waiting');
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or coalesce(p_source, 'all') not in ('all', 'older', 'recent')
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

-- D17: one bounded page of older undecided waiting questions to pre-check, best score first. Only rows whose score
-- is for the current wording, and not yet pre-checked (or restored) in that wording.
create function public.speed_trivia_precheck_candidates(p_min_score int, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare ids jsonb;
begin
  if p_min_score is null or p_min_score not between 1 and 5 or p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'invalid-quick-review-query';
  end if;
  select coalesce(jsonb_agg(s.id::text order by s.sc desc, s.created_at, s.id), '[]'::jsonb) into ids from (
    select q.id, q.created_at, (m.audience->>'score')::int as sc
    from public.trivia_questions q
    join public.speed_trivia_review_marks m on m.row_id = q.id
    where q.question_pool = 'anytime_blitz' and q.answer_format = 'multiple_choice' and q.status = 'pending_review'
      and q.speed_generation_metadata is null and m.decision is null
      and m.audience->>'key' = public.speed_trivia_audience_key(q)
      and (m.audience->>'score')::int >= p_min_score
      and (m.precheck is null or m.precheck->>'contentHash' is distinct from public.speed_content_hash(to_jsonb(q)))
    order by (m.audience->>'score')::int desc, q.created_at, q.id
    limit p_limit
  ) s;
  return ids;
end $$;

-- D17: record one pre-check result. 'repeat' retires the row (status-only, like Reject) with its approved match;
-- 'unique' / 'uncertain' only note the result. Returns {id, outcome}; 'skipped' when the row was decided, edited
-- or retired meanwhile.
create function public.speed_trivia_precheck_settle(
  p_row_id uuid, p_content_hash text, p_outcome text, p_matched_row_id uuid, p_note text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.speed_trivia_review_marks; q public.trivia_questions; matched public.trivia_questions;
begin
  if p_row_id is null or p_content_hash is null or p_outcome is null
    or p_outcome not in ('unique', 'uncertain', 'repeat')
    or (p_outcome = 'repeat') <> (p_matched_row_id is not null)
    or (p_note is not null and length(p_note) > 600) then
    raise exception 'invalid-quick-review-request';
  end if;
  perform 1 from public.speed_trivia_control where singleton for update;
  select * into m from public.speed_trivia_review_marks where row_id = p_row_id for update;
  if not found or m.decision is not null then
    return jsonb_build_object('id', p_row_id, 'outcome', 'skipped');
  end if;
  select * into q from public.trivia_questions where id = p_row_id for update;
  if not found or q.question_pool <> 'anytime_blitz' or q.answer_format <> 'multiple_choice' then
    raise exception 'invalid-quick-review-request';
  end if;
  if q.status <> 'pending_review' or q.speed_generation_metadata is not null
    or public.speed_content_hash(to_jsonb(q)) is distinct from p_content_hash then
    return jsonb_build_object('id', p_row_id, 'outcome', 'skipped');
  end if;
  if p_outcome = 'repeat' then
    select * into matched from public.trivia_questions where id = p_matched_row_id;
    if matched.id is null or matched.id = q.id or matched.question_pool <> 'anytime_blitz' or matched.status <> 'active' then
      raise exception 'invalid-quick-review-request';
    end if;
    update public.trivia_questions set status = 'deleted' where id = q.id returning * into q;
    update public.speed_trivia_review_marks set decision = 'precheck', outcome = 'repeat', reason = 'repeat',
      content_hash = p_content_hash, decided_revision = q.speed_revision, decided_at = now(),
      matched_row_id = p_matched_row_id, note = p_note, checked_at = now(),
      precheck = jsonb_build_object('contentHash', p_content_hash, 'outcome', 'repeat', 'at', now())
    where row_id = p_row_id;
  else
    update public.speed_trivia_review_marks
    set precheck = jsonb_strip_nulls(jsonb_build_object('contentHash', p_content_hash, 'outcome', p_outcome, 'note', p_note, 'at', now()))
    where row_id = p_row_id;
  end if;
  return jsonb_build_object('id', p_row_id, 'outcome', p_outcome);
end $$;

-- D4: dollars for the overnight job (Keep queue + D17 pre-check). Written only by the two RPCs below.
create table public.speed_trivia_queue_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  reserved_dollars numeric(10, 4) not null check (reserved_dollars > 0 and reserved_dollars <= 100),
  spent_dollars numeric(10, 4) check (spent_dollars is null or spent_dollars >= 0),
  finished_at timestamptz,
  report jsonb,
  check ((spent_dollars is null) = (finished_at is null))
);
alter table public.speed_trivia_queue_runs enable row level security;
alter table public.speed_trivia_queue_runs force row level security;
revoke all on table public.speed_trivia_queue_runs from public, anon, authenticated;
grant select on table public.speed_trivia_queue_runs to service_role;

-- Reserve up to p_per_run dollars, never past p_total across all runs. An unfinished run counts its reservation.
-- Returns {id, dollars, used, total}; id null and dollars 0 when under one cent is left.
create function public.speed_trivia_queue_reserve(p_per_run numeric, p_total numeric) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare used numeric; allowed numeric; run_id uuid;
begin
  if p_per_run is null or p_per_run <= 0 or p_per_run > 100 or p_total is null or p_total <= 0 or p_total > 1000 then
    raise exception 'invalid-queue-budget';
  end if;
  lock table public.speed_trivia_queue_runs in exclusive mode;
  select coalesce(sum(coalesce(spent_dollars, reserved_dollars)), 0) into used from public.speed_trivia_queue_runs;
  allowed := trunc(least(p_per_run, p_total - used), 4);
  if allowed < 0.01 then
    return jsonb_build_object('id', null, 'dollars', 0, 'used', used, 'total', p_total);
  end if;
  insert into public.speed_trivia_queue_runs (reserved_dollars) values (allowed) returning id into run_id;
  return jsonb_build_object('id', run_id, 'dollars', allowed, 'used', used, 'total', p_total);
end $$;

-- Record what a run actually spent (once).
create function public.speed_trivia_queue_finish(p_id uuid, p_spent numeric, p_report jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.speed_trivia_queue_runs;
begin
  if p_id is null or p_spent is null or p_spent < 0 or (p_report is not null and length(p_report::text) > 20000) then
    raise exception 'invalid-queue-budget';
  end if;
  update public.speed_trivia_queue_runs set spent_dollars = round(p_spent, 4), finished_at = now(), report = p_report
  where id = p_id and finished_at is null returning * into r;
  if r.id is null then raise exception 'invalid-queue-budget'; end if;
  return jsonb_build_object('id', r.id, 'spent', r.spent_dollars);
end $$;

revoke all on function public.speed_trivia_released_rows(),
  public.speed_trivia_queue_settle(uuid, text, text, uuid, text),
  public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int, int, int, int, text),
  public.speed_trivia_quick_keep(jsonb, text),
  public.speed_trivia_quick_reject(uuid[], text),
  public.speed_trivia_quick_undo(uuid),
  public.speed_trivia_precheck_candidates(int, int),
  public.speed_trivia_precheck_settle(uuid, text, text, uuid, text),
  public.speed_trivia_queue_reserve(numeric, numeric),
  public.speed_trivia_queue_finish(uuid, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.speed_trivia_released_rows(),
  public.speed_trivia_queue_settle(uuid, text, text, uuid, text),
  public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int, int, int, int, text),
  public.speed_trivia_quick_keep(jsonb, text),
  public.speed_trivia_quick_reject(uuid[], text),
  public.speed_trivia_quick_undo(uuid),
  public.speed_trivia_precheck_candidates(int, int),
  public.speed_trivia_precheck_settle(uuid, text, text, uuid, text),
  public.speed_trivia_queue_reserve(numeric, numeric),
  public.speed_trivia_queue_finish(uuid, numeric, jsonb)
  to service_role;
