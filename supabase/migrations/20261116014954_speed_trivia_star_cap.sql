-- Speed Trivia star cap on every path to active, and the one-time subject thinning
-- (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a.1; D15, D18, D19). No question is changed by this migration.
--
-- * Star cap (D15: 5 per subject). The admission guard (guard_speed_trivia_write) refuses any Speed row becoming
--   active while its subject (question_tags.subject_key) already has 5 active rows ('star-cap'), or while the row has
--   no tag ('star-cap-untagged'). One indexed count, after the control-row lock, so it binds every path: signed
--   admission (Admin add/edit/approve, the overnight Keep queue, the 4b writer), the Quick Review fast lane and the
--   undo tools. Retired and waiting rows don't count. The writer brief's count (active + waiting) is unchanged.
-- * Quick Review Keep reports 'subject_full' / 'untagged' and writes nothing for those rows, so a bulk Keep approves up
--   to the cap and leaves the rest waiting.
-- * speed_trivia_star_cap_check: the same answer for up to 200 rows, so callers skip a paid repeat check that the
--   guard would refuse anyway.
-- * Thinning (D19): speed_trivia_subject_cap_retire retires rows from the reviewed plan with the existing status-only
--   retirement (allowed without a permit), logging each in speed_trivia_subject_cap_log in the same transaction. A
--   subject-cap retirement releases the fact like a Quick Review quality reject (D5): speed_trivia_released_rows_v2
--   lists it at the revision it was retired at. speed_trivia_subject_cap_undo puts a row back (a live row that no
--   longer fits under the cap goes back to waiting) and records the release window in speed_trivia_released_restores,
--   so the fast lane is denied as after any other restore of a released row.
-- Lock order matches the admission RPCs: the control row first, then question rows.

-- 'ok', 'full' (5 other active rows share the subject) or 'untagged'. Speed refs in question_tags are uuids
-- (question_tags_speed_ref), so the cast only ever sees uuid text.
create function public.speed_trivia_star_cap_state(p_row_id uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select case
    when tag.subject_key is null then 'untagged'
    when (select count(*) from public.question_tags o
          join public.trivia_questions t on t.id = o.question_ref::uuid
          where o.game = 'speed' and o.subject_key = tag.subject_key and o.question_ref <> p_row_id::text
            and t.question_pool = 'anytime_blitz' and t.status = 'active') >= 5 then 'full'
    else 'ok' end
  from (select (select qt.subject_key from public.question_tags qt
                where qt.game = 'speed' and qt.question_ref = p_row_id::text) as subject_key) tag
$$;

-- {rowId: 'ok' | 'full' | 'untagged'} for 1-200 rows.
create function public.speed_trivia_star_cap_check(p_row_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if p_row_ids is null or cardinality(p_row_ids) < 1 or cardinality(p_row_ids) > 200 then
    raise exception 'invalid-star-cap-request';
  end if;
  return (select jsonb_object_agg(r.id::text, public.speed_trivia_star_cap_state(r.id))
    from (select distinct unnest(p_row_ids) as id) r);
end $$;

-- The admission guard, as 20261013120000, plus the star cap.
create or replace function public.guard_speed_trivia_write() returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
declare involved boolean; guarded boolean; permitted boolean; reserve_old boolean:=false; rev bigint; cap text;
begin
 if TG_OP='DELETE' and old.speed_revision>0 then raise exception 'speed-physical-delete-forbidden'; end if;
 if TG_OP='UPDATE' and old.speed_revision>0 then
  if new.id<>old.id or new.slug is distinct from old.slug then raise exception 'speed-identity-change-forbidden'; end if;
  -- Former-Speed rows cannot erase their provenance to escape history protection.
  new.speed_revision:=old.speed_revision;
 end if;
 involved := (TG_OP<>'INSERT' and old.question_pool='anytime_blitz') or (TG_OP<>'DELETE' and new.question_pool='anytime_blitz');
 if not involved then
  if TG_OP='INSERT' then new.speed_revision:=0; end if;
  return coalesce(new,old);
 end if;
 -- This row lock also serializes direct status-only retirement and pool departures.
 perform 1 from public.speed_trivia_control where singleton for update;
 if TG_OP='DELETE' then raise exception 'speed-physical-delete-forbidden'; end if;
 if TG_OP='UPDATE' and (new.id<>old.id or new.slug is distinct from old.slug) then raise exception 'speed-identity-change-forbidden'; end if;
 if new.question_pool='anytime_blitz' and new.answer_format<>'multiple_choice' then raise exception 'speed-invalid-format'; end if;
 new.normalized_question_key := public.normalize_trivia_question_key(new.question);
 -- Phase 4a.1 star cap (D15, D18-D19): a Speed row becomes active only while its subject has fewer than 5 active rows.
 -- Runs after the control-row lock, so concurrent admissions can't both take the last place.
 if new.question_pool='anytime_blitz' and new.status='active'
    and (TG_OP='INSERT' or old.status is distinct from 'active' or old.question_pool<>'anytime_blitz') then
   cap := public.speed_trivia_star_cap_state(new.id);
   if cap='untagged' then raise exception 'star-cap-untagged'; end if;
   if cap<>'ok' then raise exception 'star-cap'; end if;
 end if;
 guarded := TG_OP='INSERT' or old.question_pool<>'anytime_blitz' or
    (new.question_pool='anytime_blitz' and (public.speed_write_hash(to_jsonb(new))<>public.speed_write_hash(to_jsonb(old))) and
      not (new.status='deleted' and old.status<>'deleted' and public.speed_content_hash(to_jsonb(new))=public.speed_content_hash(to_jsonb(old)) and new.difficulty is not distinct from old.difficulty));
 -- Pool departure also needs a signed permit. A Live slug upsert must not
 -- accidentally overwrite a Speed question. Authorized departures retain memory.
 if old.question_pool='anytime_blitz' and new.question_pool<>'anytime_blitz' then guarded:=true; end if;
 if guarded then
   delete from public.speed_trivia_permits where transaction_id=txid_current() and row_id=new.id
      and write_hash=public.speed_write_hash(to_jsonb(new)) returning true,reserve_previous_fact into permitted,reserve_old;
   if not coalesce(permitted,false) then raise exception 'speed-admission-required'; end if;
 end if;
 update public.speed_trivia_control set revision=revision+1 where singleton returning revision into rev;
 if TG_OP='UPDATE' and old.question_pool='anytime_blitz' and
    (new.question_pool<>'anytime_blitz' or (reserve_old and public.speed_content_hash(to_jsonb(new))<>public.speed_content_hash(to_jsonb(old)))) then
   insert into public.speed_trivia_memory(id,row_data,revision) values('history:'||old.id||':'||rev,
     to_jsonb(old)||jsonb_build_object('id','history:'||old.id||':'||rev,'status','deleted'),rev);
 end if;
 new.speed_revision:=rev;
 insert into public.speed_trivia_changes values(rev,new.id,new.question_pool<>'anytime_blitz');
 return new;
end $$;
revoke all on function public.guard_speed_trivia_write() from public, anon, authenticated, service_role;

-- Quick Review Keep, as 20261115170333, plus the star cap.
create or replace function public.speed_trivia_quick_keep(p_check jsonb, p_signature text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cfg public.speed_trivia_control; entry jsonb; q public.trivia_questions; a public.speed_trivia_admissions;
  candidate public.trivia_questions; verdict text; cap text; result jsonb := '[]'::jsonb;
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
    verdict := null; cap := null;
    select * into q from public.trivia_questions where id = (entry->>'id')::uuid for update;
    if not found or q.question_pool <> 'anytime_blitz' or q.answer_format <> 'multiple_choice'
      or q.status <> 'pending_review' then
      verdict := 'not_pending';
    elsif public.speed_content_hash(to_jsonb(q)) is distinct from entry->>'contentHash' then
      verdict := 'changed';
    else
      cap := public.speed_trivia_star_cap_state(q.id);
    end if;
    if verdict is not null then
      null;
    elsif cap <> 'ok' then
      -- Phase 4a.1: the subject already has 5 approved questions (or the row has no tag yet). Nothing is written,
      -- so the question stays waiting and undecided; bulk Keep approves up to the cap and reports the rest.
      verdict := case cap when 'untagged' then 'untagged' else 'subject_full' end;
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

-- One row per question retired by the thinning. Written only by the RPCs below; the server reads it (audit, undo).
create table public.speed_trivia_subject_cap_log (
  run_id uuid not null,
  row_id uuid not null references public.trivia_questions(id) on delete cascade,
  subject_key text not null check (length(subject_key) between 1 and 120),
  old_status text not null check (old_status in ('active', 'pending_review')),
  content_hash text not null,
  -- trivia_questions.speed_revision right after the retirement; undo and the D5 release require it unchanged.
  retired_revision bigint not null,
  retired_at timestamptz not null default now(),
  restored_status text check (restored_status in ('active', 'pending_review')),
  restored_revision bigint,
  restored_at timestamptz,
  primary key (run_id, row_id),
  check ((restored_status is null) = (restored_at is null) and (restored_at is null) = (restored_revision is null))
);
create index speed_trivia_subject_cap_log_row on public.speed_trivia_subject_cap_log (row_id) where restored_at is null;
alter table public.speed_trivia_subject_cap_log enable row level security;
alter table public.speed_trivia_subject_cap_log force row level security;
revoke all on table public.speed_trivia_subject_cap_log from public, anon, authenticated;
grant select on table public.speed_trivia_subject_cap_log to service_role;

-- p_rows = [{id, contentHash, status, subjectKey}], 1-200, from the reviewed plan. A row is retired only while it is
-- still in that status with that content and tag, and only while 5 other active-or-waiting rows keep the subject.
-- Returns {retired:[id], skipped:[{id, reason}]}.
create function public.speed_trivia_subject_cap_retire(p_run_id uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare entry jsonb; q public.trivia_questions; reason text; done jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb;
begin
  if p_run_id is null or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 200
    or exists (select 1 from jsonb_array_elements(p_rows) e
      where jsonb_typeof(e.value) <> 'object' or e.value->>'id' is null or e.value->>'contentHash' is null
        or coalesce(e.value->>'status', '') not in ('active', 'pending_review')
        or coalesce(length(e.value->>'subjectKey'), 0) not between 1 and 120) then
    raise exception 'invalid-subject-cap-request';
  end if;
  perform 1 from public.speed_trivia_control where singleton for update;
  for entry in select value from jsonb_array_elements(p_rows) loop
    reason := null;
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
    elsif (select count(*) from public.question_tags o join public.trivia_questions t on t.id = o.question_ref::uuid
        where o.game = 'speed' and o.subject_key = entry->>'subjectKey' and o.question_ref <> q.id::text
          and t.question_pool = 'anytime_blitz' and t.status in ('active', 'pending_review')) < 5 then
      reason := 'would_go_below_cap';
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

-- Undo for 1-200 rows of one run. A row is restored only if nothing wrote it since the retirement. A live row goes
-- back to active only while its subject has room; otherwise it goes back to waiting. Returns
-- {restored:[{id, status}], skipped:[id]}.
create function public.speed_trivia_subject_cap_undo(p_run_id uuid, p_row_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare l public.speed_trivia_subject_cap_log; q public.trivia_questions; candidate public.trivia_questions; target text;
  done jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb;
begin
  if p_run_id is null or p_row_ids is null or cardinality(p_row_ids) < 1 or cardinality(p_row_ids) > 200 then
    raise exception 'invalid-subject-cap-request';
  end if;
  perform 1 from public.speed_trivia_control where singleton for update;
  for l in select * from public.speed_trivia_subject_cap_log where run_id = p_run_id and row_id = any(p_row_ids)
      and restored_at is null order by row_id for update loop
    select * into q from public.trivia_questions where id = l.row_id for update;
    if not found or q.question_pool <> 'anytime_blitz' or q.status <> 'deleted' or q.speed_revision <> l.retired_revision then
      skipped := skipped || to_jsonb(l.row_id);
      continue;
    end if;
    target := l.old_status;
    if target = 'active' and public.speed_trivia_star_cap_state(q.id) <> 'ok' then target := 'pending_review'; end if;
    candidate := q; candidate.status := target;
    insert into public.speed_trivia_permits values (txid_current(), q.id, public.speed_write_hash(to_jsonb(candidate)), false);
    update public.trivia_questions set status = target where id = q.id returning * into q;
    delete from public.speed_trivia_permits where transaction_id = txid_current();
    update public.speed_trivia_subject_cap_log set restored_status = target, restored_revision = q.speed_revision, restored_at = now()
    where run_id = l.run_id and row_id = l.row_id;
    -- The row was released (D5) while retired: deny the fast lane as after a Quick Review restore.
    insert into public.speed_trivia_released_restores (row_id, released_revision, restored_revision)
    values (q.id, l.retired_revision, q.speed_revision);
    done := done || jsonb_build_array(jsonb_build_object('id', q.id, 'status', target));
  end loop;
  skipped := skipped || coalesce((select jsonb_agg(to_jsonb(x.id)) from unnest(p_row_ids) x(id)
    where not exists (select 1 from jsonb_array_elements(done) d where d->>'id' = x.id::text)
      and not exists (select 1 from jsonb_array_elements(skipped) s where s #>> '{}' = x.id::text)), '[]'::jsonb);
  return jsonb_build_object('restored', done, 'skipped', skipped);
end $$;

-- D5, as 20261115213124, plus questions retired by the thinning (they are not repeats or wrong answers).
create or replace function public.speed_trivia_released_rows_v2() returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'revision', r.revision) order by r.id), '[]'::jsonb)
  from (
    select m.row_id::text as id, m.decided_revision as revision
    from public.speed_trivia_review_marks m
    join public.trivia_questions q on q.id = m.row_id
    where m.decision = 'reject' and m.outcome = 'rejected' and m.reason = 'quality'
      and q.question_pool = 'anytime_blitz' and q.status = 'deleted' and q.speed_revision = m.decided_revision
    union
    select l.row_id::text, l.retired_revision
    from public.speed_trivia_subject_cap_log l
    join public.trivia_questions q on q.id = l.row_id
    where l.restored_at is null
      and q.question_pool = 'anytime_blitz' and q.status = 'deleted' and q.speed_revision = l.retired_revision
  ) r
$$;

revoke all on function public.speed_trivia_star_cap_state(uuid) from public, anon, authenticated, service_role;
revoke all on function public.speed_trivia_star_cap_check(uuid[]),
  public.speed_trivia_subject_cap_retire(uuid, jsonb),
  public.speed_trivia_subject_cap_undo(uuid, uuid[]),
  public.speed_trivia_quick_keep(jsonb, text),
  public.speed_trivia_released_rows_v2() from public, anon, authenticated;
grant execute on function public.speed_trivia_star_cap_check(uuid[]),
  public.speed_trivia_subject_cap_retire(uuid, jsonb),
  public.speed_trivia_subject_cap_undo(uuid, uuid[]),
  public.speed_trivia_quick_keep(jsonb, text),
  public.speed_trivia_released_rows_v2() to service_role;
