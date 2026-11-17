-- Live Publish records what really happened (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c.2; review #2, #3).
--
-- Before this, Publish marked every claimed candidate `published` even when the PR didn't merge, and settled rows one
-- update at a time, ignoring errors. A PR that waits on GitHub (or is closed) then hid its questions from the repeat
-- check, let a second Publish add their twins, and stranded them if the PR closed; a failed settle let the 10-minute
-- re-claim open a second PR with the same questions. Now:
--
--   keep -> publishing (claimed) -> [PR opened: pr_url + final slug recorded, still publishing]
--        -> published (merged) | pr_open (PR waits on GitHub) | reject (refused) | keep (failed before any PR)
--   pr_open, or a stale publishing row that has a pr_url -> (PR check asks GitHub)
--        -> published (merged) | keep (closed without merging; pr_url cleared) | pr_open (still open)
--
-- A stale publishing row with a pr_url is never re-claimed: its PR exists, so only the PR check may settle it.
-- Every settle is one statement; a count that doesn't match the rows asked for rolls the whole settle back.
-- No question content changes; no trivia_questions change; no new table.

alter table public.question_candidates drop constraint question_candidates_status_check;
alter table public.question_candidates drop constraint question_candidates_ref_check;
alter table public.question_candidates drop constraint question_candidates_publish_check;
alter table public.question_candidates
  add constraint question_candidates_status_check check (case game
    when 'speed' then status in ('received', 'rejected', 'skipped', 'pending_review')
    else status in ('received', 'rejected', 'skipped', 'pending_review', 'keep', 'reject', 'publishing', 'pr_open', 'published') end),
  add constraint question_candidates_ref_check check (case game
    when 'speed' then (status = 'pending_review') = (question_ref is not null)
    else (status in ('pending_review', 'keep', 'reject', 'publishing', 'pr_open', 'published')) = (question_ref is not null) end),
  add constraint question_candidates_publish_check check (
    (status = 'publishing') = (publish_claim is not null and claimed_at is not null)
    and (pr_url is null or status in ('publishing', 'pr_open', 'published'))
    and (status <> 'pr_open' or (pr_url is not null and question_ref is not null and publish_claim is null and claimed_at is null)));

-- The claim, as in 20261116201904, except a stale publishing row is re-claimed only when no PR was opened for it.
create or replace function public.live_candidates_publish_claim(p_claim uuid, p_limit int)
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
    where game = 'live' and (status = 'keep' or (status = 'publishing' and pr_url is null))
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

-- Right after the PR is opened, before merging: record its link and each row's final slug on the claimed rows.
-- p_rows: [{id, questionRef}]. All or nothing; returns the count.
create function public.live_candidates_publish_record_pr(p_claim uuid, p_pr_url text, p_rows jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare expected int; done int;
begin
  if p_claim is null or p_pr_url is null or p_pr_url !~ '^https://github\.com/' or length(p_pr_url) > 300
    or p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid-publish-record'; end if;
  expected := jsonb_array_length(p_rows);
  if expected < 1 or expected > 200 or exists (select 1 from jsonb_array_elements(p_rows) r
    where coalesce(r->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(r->>'questionRef', '') = '') then raise exception 'invalid-publish-record'; end if;
  update public.question_candidates c set pr_url = p_pr_url, question_ref = r->>'questionRef'
  from jsonb_array_elements(p_rows) r
  where c.id = (r->>'id')::uuid and c.game = 'live' and c.status = 'publishing' and c.publish_claim = p_claim;
  get diagnostics done = row_count;
  if done <> expected then raise exception 'publish-record-mismatch'; end if;
  return done;
end $$;
revoke all on function public.live_candidates_publish_record_pr(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.live_candidates_publish_record_pr(uuid, text, jsonb) to service_role;

-- Settle one Publish in one statement. p_rows: [{id, status: published|pr_open|reject, questionRef, prUrl, reason}].
-- Only rows still held by p_claim in publishing; a count that differs from the rows asked for rolls it all back.
create function public.live_candidates_publish_settle(p_claim uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare expected int; done int;
begin
  if p_claim is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid-publish-settle'; end if;
  expected := jsonb_array_length(p_rows);
  if expected < 1 or expected > 200 or exists (select 1 from jsonb_array_elements(p_rows) r
    where coalesce(r->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(r->>'status', '') not in ('published', 'pr_open', 'reject')
      or (r->>'status' in ('published', 'pr_open') and coalesce(r->>'questionRef', '') = '')
      or (r->>'status' = 'pr_open' and coalesce(r->>'prUrl', '') = '')) then raise exception 'invalid-publish-settle'; end if;
  update public.question_candidates c set
    status = r->>'status',
    question_ref = case when r->>'status' = 'reject' then c.question_ref else r->>'questionRef' end,
    pr_url = case when r->>'status' = 'reject' then null else nullif(r->>'prUrl', '') end,
    reason = case when r->>'status' = 'reject' then left(coalesce(r->>'reason', 'publish'), 500) else c.reason end,
    decided_at = case when r->>'status' = 'reject' then now() else c.decided_at end,
    publish_claim = null, claimed_at = null
  from jsonb_array_elements(p_rows) r
  where c.id = (r->>'id')::uuid and c.game = 'live' and c.status = 'publishing' and c.publish_claim = p_claim;
  get diagnostics done = row_count;
  if done <> expected then raise exception 'publish-settle-mismatch'; end if;
  return done;
end $$;
revoke all on function public.live_candidates_publish_settle(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.live_candidates_publish_settle(uuid, jsonb) to service_role;

-- The PR check: GitHub says p_pr_url is merged, closed (without merging) or open. Moves that PR's pr_open rows, and
-- its stale (> 10 minutes) publishing rows, and returns the moved rows ({id, payload, tag, questionRef}) so the
-- caller can tag the merged ones. merged -> published; closed -> keep, pr_url cleared (question_ref keeps the
-- planned slug: a kept row must have one, and the next Publish picks a fresh slug anyway); open -> pr_open.
create function public.live_candidates_pr_settle(p_pr_url text, p_state text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_pr_url is null or p_pr_url !~ '^https://github\.com/' or length(p_pr_url) > 300
    or p_state is null or p_state not in ('merged', 'closed', 'open') then raise exception 'invalid-pr-settle'; end if;
  perform pg_advisory_xact_lock(hashtext('live_candidates_publish'));
  with moved as (
    update public.question_candidates c set
      status = case p_state when 'merged' then 'published' when 'closed' then 'keep' else 'pr_open' end,
      pr_url = case when p_state = 'closed' then null else c.pr_url end,
      publish_claim = null, claimed_at = null
    where c.game = 'live' and c.pr_url = p_pr_url
      and ((c.status = 'pr_open' and p_state <> 'open')
        or (c.status = 'publishing' and c.claimed_at <= now() - interval '10 minutes'))
    returning c.id, c.payload, c.tag, c.question_ref, c.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'payload', payload, 'tag', tag, 'questionRef', question_ref)
    order by created_at, id), '[]'::jsonb) into result from moved;
  return result;
end $$;
revoke all on function public.live_candidates_pr_settle(text, text) from public, anon, authenticated;
grant execute on function public.live_candidates_pr_settle(text, text) to service_role;
