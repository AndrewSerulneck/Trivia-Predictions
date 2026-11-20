-- Speed Trivia: Quick Keep's free fast lane ends at a live edit (docs/speed-trivia-backlog-and-quality-plan.md,
-- Phase 7d, second review R2 #26.1).
--
-- Since D38 (2026-11-19) an edit that keeps a live question live is compared with live questions only (evidence
-- comparisonScope 'live-edit'), not with waiting ones. Quick Keep's fast lane assumed every later write was compared
-- with the whole bank, waiting questions included. So:
--   1. waiting question P tests fact X and holds a full-bank 'unique' admission;
--   2. live question L is edited to test X; the live-only check doesn't see P, so the edit saves;
--   3. Keep on P approved it instantly: two live questions tested X.
-- Now the fast lane also requires that no live edit was admitted after P's admission (a larger revision). Otherwise
-- P is 'queued' and the overnight job runs a real approved-only check (about $0.0005 a question).
-- Revisions are the global speed_trivia_control counter, and an admission's corpusRevision must equal it, so P's own
-- check saw every live edit with a smaller revision.
--
-- speed_trivia_quick_keep: as 20261116014954 (the latest definition), plus that one condition. The overnight
-- settle (20261115170333) needs no change: it approves only after an approved-only check against live questions.
-- No table, view or sequence is created; no data changes.

-- The one lookup Keep adds: the newest live-edit admission.
create index speed_trivia_admissions_live_edit_idx on public.speed_trivia_admissions (revision)
  where evidence->>'comparisonScope' = 'live-edit';

-- Quick Review Keep, as 20261116014954, plus no fast lane for an admission older than the newest live edit.
create or replace function public.speed_trivia_quick_keep(p_check jsonb, p_signature text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cfg public.speed_trivia_control; entry jsonb; q public.trivia_questions; a public.speed_trivia_admissions;
  candidate public.trivia_questions; verdict text; cap text; result jsonb := '[]'::jsonb; last_live_edit bigint;
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
  -- Phase 7d: the newest live edit (read under the control-row lock every admission takes, so none can slip in).
  select max(le.revision) into last_live_edit from public.speed_trivia_admissions le
    where le.evidence->>'comparisonScope' = 'live-edit';
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
        and (last_live_edit is null or last_live_edit < a.revision)
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

revoke all on function public.speed_trivia_quick_keep(jsonb, text) from public, anon, authenticated;
grant execute on function public.speed_trivia_quick_keep(jsonb, text) to service_role;
