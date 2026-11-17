-- Current Events Speed questions with no expiry date (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c.3,
-- review #5, D28).
--
-- speed_trivia_expire_dated (20261115220356) retired only rows whose speed_generation_metadata.expiresOn had passed.
-- Only the writer sets expiresOn, so a Current Events question added in Admin, or a writer-made one whose metadata the
-- signed admission SQL cleared on an edit (reservePreviousFact), never expired.
--
-- This replacement also retires active and waiting anytime_blitz rows that:
--   * are category 'Current Events';
--   * have no well-formed expiresOn (missing, or not YYYY-MM-DD, so a malformed date can't live forever either);
--   * were created (UTC date) 12 months or more before p_today: D16's life, measured from creation. An edited
--     question keeps its created_at, so editing doesn't move the date.
-- Same status-only retirement, same before-state log (speed_trivia_expiry_runs), same p_limit and lock order.
-- The signed admission function (20261013120000) is untouched. Cost: the OR may scan the active and waiting Speed
-- rows (~5,000 today) instead of only the expiresOn index, once a month: negligible.

create or replace function public.speed_trivia_expire_dated(p_today date, p_apply boolean, p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_rows jsonb; v_matched int; v_retired int := 0; v_run uuid; v_created_cutoff date;
begin
  if p_today is null or p_apply is null or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid-expiry-request';
  end if;
  v_created_cutoff := (p_today - interval '12 months')::date;
  if p_apply then
    -- Control row first, then the question rows (the admission RPCs' order).
    perform 1 from public.speed_trivia_control where singleton for update;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id), '[]'::jsonb), count(*)::int into v_rows, v_matched
    from (
      select t.* from public.trivia_questions t
      where t.question_pool = 'anytime_blitz' and t.status in ('active', 'pending_review')
        and (
          (t.speed_generation_metadata ? 'expiresOn'
            and (t.speed_generation_metadata->>'expiresOn') ~ '^\d{4}-\d{2}-\d{2}$'
            and (t.speed_generation_metadata->>'expiresOn') <= to_char(p_today, 'YYYY-MM-DD'))
          or (t.category = 'Current Events'
            and coalesce(t.speed_generation_metadata->>'expiresOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
            and (t.created_at at time zone 'UTC')::date <= v_created_cutoff)
        )
      order by t.id limit p_limit
      for update of t
    ) q;
  else
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id), '[]'::jsonb), count(*)::int into v_rows, v_matched
    from (
      select t.* from public.trivia_questions t
      where t.question_pool = 'anytime_blitz' and t.status in ('active', 'pending_review')
        and (
          (t.speed_generation_metadata ? 'expiresOn'
            and (t.speed_generation_metadata->>'expiresOn') ~ '^\d{4}-\d{2}-\d{2}$'
            and (t.speed_generation_metadata->>'expiresOn') <= to_char(p_today, 'YYYY-MM-DD'))
          or (t.category = 'Current Events'
            and coalesce(t.speed_generation_metadata->>'expiresOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
            and (t.created_at at time zone 'UTC')::date <= v_created_cutoff)
        )
      order by t.id limit p_limit
    ) q;
  end if;
  if not p_apply or v_matched = 0 then
    return jsonb_build_object('mode', case when p_apply then 'apply' else 'dry-run' end, 'cutoff', p_today,
      'matched', v_matched, 'retired', 0, 'runId', null,
      'ids', coalesce((select jsonb_agg(r->'id') from jsonb_array_elements(v_rows) r), '[]'::jsonb));
  end if;
  insert into public.speed_trivia_expiry_runs (cutoff, rows) values (p_today, v_rows) returning id into v_run;
  update public.trivia_questions set status = 'deleted'
  where id in (select (r->>'id')::uuid from jsonb_array_elements(v_rows) r)
    and question_pool = 'anytime_blitz' and status in ('active', 'pending_review');
  get diagnostics v_retired = row_count;
  return jsonb_build_object('mode', 'apply', 'cutoff', p_today, 'matched', v_matched, 'retired', v_retired, 'runId', v_run,
    'ids', (select jsonb_agg(r->'id') from jsonb_array_elements(v_rows) r));
end $$;

revoke all on function public.speed_trivia_expire_dated(date, boolean, int) from public, anon, authenticated;
grant execute on function public.speed_trivia_expire_dated(date, boolean, int) to service_role;
