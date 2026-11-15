-- Speed Trivia Quick Review: Undo returns a question to the view it came from
-- (docs/speed-trivia-backlog-and-quality-plan.md, Phase 3c, review #7). No question or mark is changed by this migration.
--
-- Keep or Reject in "Needs a look" overwrites the mark, which used to lose the overnight note; Undo then cleared
-- the mark, so the question went back to Waiting instead of Needs a look.
-- * marks.prior keeps the needs-look fields while the Keep or Reject made from Needs a look stands.
--   A BEFORE UPDATE trigger sets it (it also fires on the `on conflict do update` path of speed_trivia_quick_keep
--   and speed_trivia_quick_reject), so neither RPC — nor the fast-lane / D5 release-window checks in quick_keep —
--   is rewritten.
-- * prior is cleared when the mark is cleared, goes back to needs_look, or the overnight job settles the queued
--   Keep (approved / repeat): a later Undo or Restore then returns the question to Waiting, as before.
-- * speed_trivia_quick_undo keeps its body (status restore, drift checks, D5 window), then writes the prior
--   needs-look state back, keeping audience and precheck. It returns {id, status, view}: view is the list the
--   question is now in ('needs_look' or 'waiting').

alter table public.speed_trivia_review_marks
  add column prior jsonb,
  add constraint speed_trivia_review_marks_prior check (prior is null or (jsonb_typeof(prior) = 'object'
    and decision in ('keep', 'reject') and outcome is distinct from 'needs_look'
    and prior->>'content_hash' is not null and prior->>'decided_revision' is not null and prior->>'decided_at' is not null));

create function public.speed_trivia_review_marks_prior() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.decision is null or new.outcome = 'needs_look' then
    new.prior := null;
  elsif old.decision = 'keep' and old.outcome = 'needs_look' then
    new.prior := jsonb_build_object(
      'content_hash', old.content_hash, 'decided_revision', old.decided_revision, 'decided_at', old.decided_at,
      'note', old.note, 'checked_at', old.checked_at, 'matched_row_id', old.matched_row_id);
  elsif old.outcome = 'queued' and new.outcome is distinct from 'queued' then
    -- The overnight job settled the Keep; its result is now the latest word on the question.
    new.prior := null;
  end if;
  return new;
end $$;

revoke all on function public.speed_trivia_review_marks_prior() from public, anon, authenticated;

create trigger speed_trivia_review_marks_prior
  before update on public.speed_trivia_review_marks
  for each row execute function public.speed_trivia_review_marks_prior();

-- Undo. As 20261115170333, then: if the decision was made from Needs a look, put the needs-look mark back.
create or replace function public.speed_trivia_quick_undo(p_row_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.speed_trivia_review_marks; q public.trivia_questions; candidate public.trivia_questions;
  v_view text := 'waiting';
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
  if m.prior is not null then
    -- The trigger clears prior on this write (outcome needs_look).
    update public.speed_trivia_review_marks set decision = 'keep', outcome = 'needs_look', reason = null,
      content_hash = m.prior->>'content_hash',
      decided_revision = (m.prior->>'decided_revision')::bigint,
      decided_at = (m.prior->>'decided_at')::timestamptz,
      note = m.prior->>'note',
      checked_at = (m.prior->>'checked_at')::timestamptz,
      matched_row_id = (select x.id from public.trivia_questions x where x.id = (m.prior->>'matched_row_id')::uuid)
    where row_id = p_row_id;
    v_view := 'needs_look';
  elsif m.audience is null and m.decision <> 'precheck' then
    delete from public.speed_trivia_review_marks where row_id = p_row_id;
  else
    update public.speed_trivia_review_marks set decision = null, outcome = null, reason = null, content_hash = null,
      decided_revision = null, decided_at = null, matched_row_id = null, note = null, checked_at = null,
      precheck = case when m.decision = 'precheck'
        then jsonb_build_object('contentHash', m.content_hash, 'outcome', 'restored', 'at', now()) else m.precheck end
    where row_id = p_row_id;
  end if;
  return jsonb_build_object('id', q.id, 'status', q.status, 'view', v_view);
end $$;

revoke all on function public.speed_trivia_quick_undo(uuid) from public, anon, authenticated;
grant execute on function public.speed_trivia_quick_undo(uuid) to service_role;
