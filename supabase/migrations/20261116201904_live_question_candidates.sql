-- Live Trivia path for the daily question writer (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c; D10, D11).
--
-- Live candidates never enter trivia_questions from here. The canonical Live Trivia bank is the JSON under
-- data/live-trivia/categories/; reviewed candidates reach it only through Publish, which APPENDS them in a GitHub PR
-- (append-only, D10), and the existing Sync Live Trivia workflow imports them. This file only extends the writer's inbox:
--
--   received -> rejected (gates, with reason) | skipped (daily target or budget) | pending_review (passed every gate;
--   waits in Quick Review's Live mode; question_ref = the slug it would be published under)
--   pending_review -> keep | reject (Andrew)      keep | reject -> pending_review (Undo)
--   keep -> publishing (claimed by one Publish) -> published (question_ref = final slug, pr_url) | keep (failed)
--
-- Speed candidates keep exactly the 4b statuses and rule (pending_review <=> question_ref).
-- No question content changes; no trivia_questions change; no new table.

alter table public.question_candidates
  add column audience jsonb check (audience is null or jsonb_typeof(audience) = 'object'),
  add column tag jsonb check (tag is null or jsonb_typeof(tag) = 'object'),
  -- An uncertain Live repeat: {slug, question, answer}, shown as "Possible repeat of: ...".
  add column possible_repeat jsonb check (possible_repeat is null or jsonb_typeof(possible_repeat) = 'object'),
  -- Quick Review's E: {answer, acceptableAnswers}. The writer's payload is never rewritten.
  add column edit jsonb check (edit is null or jsonb_typeof(edit) = 'object'),
  add column decided_at timestamptz,
  add column pr_url text check (pr_url is null or (pr_url ~ '^https://github\.com/' and length(pr_url) <= 300)),
  add column publish_claim uuid,
  add column claimed_at timestamptz;

alter table public.question_candidates drop constraint question_candidates_status_check;
alter table public.question_candidates drop constraint question_candidates_check;
alter table public.question_candidates
  add constraint question_candidates_status_check check (case game
    when 'speed' then status in ('received', 'rejected', 'skipped', 'pending_review')
    else status in ('received', 'rejected', 'skipped', 'pending_review', 'keep', 'reject', 'publishing', 'published') end),
  add constraint question_candidates_ref_check check (case game
    when 'speed' then (status = 'pending_review') = (question_ref is not null)
    else (status in ('pending_review', 'keep', 'reject', 'publishing', 'published')) = (question_ref is not null) end),
  add constraint question_candidates_publish_check check (
    (status = 'publishing') = (publish_claim is not null and claimed_at is not null)
    and (pr_url is null or status = 'published'));

create index question_candidates_live_review on public.question_candidates (status, created_at) where game = 'live';

-- One Publish at a time. Claims up to p_limit kept Live candidates (oldest decision first) for p_claim and returns
-- them. A claim older than 10 minutes is stale (the request died) and is re-claimed with the rest: Publish re-checks
-- every entry against the current file, so a claim whose PR did merge is recognised and settled, never added twice.
create function public.live_candidates_publish_claim(p_claim uuid, p_limit int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_claim is null or p_limit is null or p_limit < 1 or p_limit > 200 then raise exception 'invalid-publish-claim'; end if;
  perform pg_advisory_xact_lock(hashtext('live_candidates_publish'));
  if exists (select 1 from public.question_candidates
    where game = 'live' and status = 'publishing' and claimed_at > now() - interval '10 minutes') then
    raise exception 'publish-in-progress';
  end if;
  with picked as (
    select id from public.question_candidates
    where game = 'live' and status in ('keep', 'publishing')
    order by decided_at nulls last, created_at, id
    limit p_limit
    for update
  ), claimed as (
    update public.question_candidates c set status = 'publishing', publish_claim = p_claim, claimed_at = now()
    from picked where c.id = picked.id
    returning c.id, c.slot, c.payload, c.edit, c.tag, c.question_ref, c.decided_at, c.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slot', slot, 'payload', payload, 'edit', edit, 'tag', tag,
    'questionRef', question_ref) order by decided_at nulls last, created_at, id), '[]'::jsonb) into result from claimed;
  return result;
end $$;
revoke all on function public.live_candidates_publish_claim(uuid, int) from public, anon, authenticated;
grant execute on function public.live_candidates_publish_claim(uuid, int) to service_role;
