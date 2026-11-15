-- Speed Trivia Quick Review (docs/speed-trivia-backlog-and-quality-plan.md, Phase 1).
-- One decision mark per question, plus four server-only RPCs. No question is changed by this migration.
--
-- Every status change keeps to the signed-admission boundary (20261013120000_speed_trivia_admission.sql):
-- * Reject is the existing status-only retirement (allowed without a permit), recorded in a mark.
-- * Keep approves instantly ONLY when the row's current content still carries a full-bank admission
--   (compared with every approved, waiting and retired question when it was admitted). Any later write
--   to Speed content is itself full-bank admitted, so that row has already been compared with it.
--   Anything else is queued for the overnight check (Phase 3). The call is signed with the admission
--   secret, like admit_speed_trivia.
-- * Undo returns a row to pending_review only if Quick Review made the last change to it
--   (speed_revision unchanged since the mark).
-- Lock order matches the admission RPCs: the control row first, then question rows.

create table public.speed_trivia_review_marks (
  row_id uuid primary key references public.trivia_questions(id) on delete cascade,
  decision text check (decision in ('keep', 'reject')),
  outcome text check (outcome in ('queued', 'approved', 'rejected')),
  reason text check (reason is null or length(reason) <= 40),
  -- Content the decision was made on. Phase 3 approves a queued keep only while it still matches.
  content_hash text,
  -- trivia_questions.speed_revision right after the decision; Undo requires it unchanged.
  decided_revision bigint,
  decided_at timestamptz,
  -- Phase 2 "bar test" score. Survives Undo.
  audience jsonb,
  constraint speed_trivia_review_marks_decided check (
    (decision is null and outcome is null and reason is null and content_hash is null
      and decided_revision is null and decided_at is null)
    or (decision is not null and outcome is not null and content_hash is not null
      and decided_revision is not null and decided_at is not null
      and (decision = 'reject') = (outcome = 'rejected'))
  )
);
alter table public.speed_trivia_review_marks enable row level security;
alter table public.speed_trivia_review_marks force row level security;
revoke all on table public.speed_trivia_review_marks from public, anon, authenticated;
-- Server reads only; every write goes through the RPCs below so a mark can't be forged to unlock Undo.
grant select on table public.speed_trivia_review_marks to service_role;

-- One bounded page of undecided waiting questions, plus the filter's total. Keyset paging on (created_at, id).
create function public.speed_trivia_review_queue(
  p_category text, p_source text, p_sort text, p_after_created timestamptz, p_after_id uuid, p_limit int
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare total bigint; page jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or coalesce(p_source, 'all') not in ('all', 'older', 'recent')
    or coalesce(p_sort, 'oldest') not in ('oldest', 'newest')
    or (p_after_created is null) <> (p_after_id is null) then
    raise exception 'invalid-quick-review-query';
  end if;
  with base as (
    select q.* from public.trivia_questions q
    left join public.speed_trivia_review_marks m on m.row_id = q.id
    where q.question_pool = 'anytime_blitz' and q.answer_format = 'multiple_choice' and q.status = 'pending_review'
      and m.decision is null
      and (p_category is null or q.category = p_category)
      and (coalesce(p_source, 'all') = 'all' or (p_source = 'older') = (q.speed_generation_metadata is null))
  ), ordered as (
    select s.*, row_number() over (
      order by case when coalesce(p_sort, 'oldest') = 'oldest' then s.created_at end asc,
               case when coalesce(p_sort, 'oldest') = 'oldest' then s.id end asc,
               case when p_sort = 'newest' then s.created_at end desc,
               case when p_sort = 'newest' then s.id end desc) ord
    from base s
    where p_after_created is null
      or (coalesce(p_sort, 'oldest') = 'oldest' and (s.created_at, s.id) > (p_after_created, p_after_id))
      or (p_sort = 'newest' and (s.created_at, s.id) < (p_after_created, p_after_id))
  )
  select (select count(*) from base),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'question', b.question, 'options', b.options, 'correctAnswer', b.correct_answer,
      'category', b.category, 'difficulty', b.difficulty, 'createdAt', b.created_at,
      'recent', b.speed_generation_metadata is not null,
      'contentHash', public.speed_content_hash(to_jsonb(b))) order by b.ord)
      from ordered b where b.ord <= p_limit), '[]'::jsonb)
  into total, page;
  return jsonb_build_object('total', total, 'rows', page);
end $$;

-- Keep. p_check = {operation:'quick_keep', policyVersion, expiresAt, rows:[{id, contentHash}]}, signed like
-- admit_speed_trivia. Per row: 'approved' (free fast lane), 'queued' (overnight check), 'changed' (content
-- differs from what was reviewed; nothing written) or 'not_pending'.
create function public.speed_trivia_quick_keep(p_check jsonb, p_signature text) returns jsonb
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
        and a.evidence->'comparisonScope' is null then
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
        content_hash = excluded.content_hash, decided_revision = excluded.decided_revision, decided_at = excluded.decided_at;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('id', entry->>'id', 'outcome', verdict));
  end loop;
  return jsonb_build_object('rows', result);
end $$;

-- Reject: the existing status-only retirement, plus a mark. Only waiting Speed questions are touched.
create function public.speed_trivia_quick_reject(p_row_ids uuid[], p_reason text) returns jsonb
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
      content_hash = excluded.content_hash, decided_revision = excluded.decided_revision, decided_at = excluded.decided_at;
    done := done || to_jsonb(q.id);
  end loop;
  return jsonb_build_object('rejected', done);
end $$;

-- Undo one Quick Review decision. Status changes back to pending_review only if nothing else wrote the row since.
create function public.speed_trivia_quick_undo(p_row_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.speed_trivia_review_marks; q public.trivia_questions; candidate public.trivia_questions;
begin
  perform 1 from public.speed_trivia_control where singleton for update;
  select * into m from public.speed_trivia_review_marks where row_id = p_row_id for update;
  if not found or m.decision is null then raise exception 'quick-review-nothing-to-undo'; end if;
  select * into q from public.trivia_questions where id = p_row_id for update;
  if not found or q.question_pool <> 'anytime_blitz' then raise exception 'quick-review-undo-drift'; end if;
  if m.outcome in ('rejected', 'approved') then
    if q.speed_revision is distinct from m.decided_revision
      or q.status is distinct from (case m.outcome when 'rejected' then 'deleted' else 'active' end) then
      raise exception 'quick-review-undo-drift';
    end if;
    candidate := q; candidate.status := 'pending_review';
    insert into public.speed_trivia_permits values (txid_current(), q.id, public.speed_write_hash(to_jsonb(candidate)), false);
    update public.trivia_questions set status = 'pending_review' where id = q.id returning * into q;
    delete from public.speed_trivia_permits where transaction_id = txid_current();
  elsif q.status is distinct from 'pending_review' then
    raise exception 'quick-review-undo-drift';
  end if;
  if m.audience is null then
    delete from public.speed_trivia_review_marks where row_id = p_row_id;
  else
    update public.speed_trivia_review_marks set decision = null, outcome = null, reason = null, content_hash = null,
      decided_revision = null, decided_at = null where row_id = p_row_id;
  end if;
  return jsonb_build_object('id', q.id, 'status', q.status);
end $$;

revoke all on function public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int),
  public.speed_trivia_quick_keep(jsonb, text),
  public.speed_trivia_quick_reject(uuid[], text),
  public.speed_trivia_quick_undo(uuid) from public, anon, authenticated;
grant execute on function public.speed_trivia_review_queue(text, text, text, timestamptz, uuid, int),
  public.speed_trivia_quick_keep(jsonb, text),
  public.speed_trivia_quick_reject(uuid[], text),
  public.speed_trivia_quick_undo(uuid) to service_role;
