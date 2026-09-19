-- Local Phase 4 artifact. Apply before deploying the new progress sweep.
-- No historical board or reward is changed by this migration.
alter table public.sports_bingo_cards
  add column if not exists grading_state jsonb not null default '{}'::jsonb;

create or replace function public.apply_sports_bingo_grading(
  p_card_id uuid,
  p_expected_updated_at timestamptz,
  p_observed_at timestamptz,
  p_squares jsonb,
  p_state jsonb,
  p_status text,
  p_won_line jsonb,
  p_notification jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  card public.sports_bingo_cards%rowtype;
  changed integer;
  square_count integer;
begin
  select * into card from public.sports_bingo_cards where id = p_card_id for update;
  if not found or card.status <> 'active'
    or card.updated_at is distinct from p_expected_updated_at
    or p_observed_at <= coalesce((card.grading_state->>'lastObservedAt')::timestamptz, '-infinity'::timestamptz)
  then return jsonb_build_object('applied', false); end if;

  if p_status is null or p_status not in ('active', 'won', 'lost')
    or jsonb_typeof(p_squares) is distinct from 'array' or jsonb_array_length(p_squares) <> 25
    or jsonb_typeof(p_state) is distinct from 'object'
    or (p_state->>'lastObservedAt')::timestamptz is distinct from p_observed_at
  then raise exception 'Invalid Bingo grading payload'; end if;

  -- Lock every cell before comparing its original resolver. Late scratch replacements and
  -- webhook counters cannot be silently graded under the superseded rule.
  perform id from public.sports_bingo_squares where card_id = p_card_id order by id for update;
  select count(*) into square_count from public.sports_bingo_squares where card_id = p_card_id;
  if square_count <> 25 then raise exception 'Incomplete Bingo board'; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_squares) x) <> 25
    or exists (
      select 1 from jsonb_array_elements(p_squares) x
      left join public.sports_bingo_squares s on s.id = (x->>'id')::uuid and s.card_id = p_card_id
      where s.id is null or s.resolver is distinct from x->'expected_resolver'
        or x->>'status' not in ('pending', 'hit', 'miss', 'void')
        or x->>'status' is null or (s.is_free and x->>'status' <> 'hit')
    ) then return jsonb_build_object('applied', false); end if;

  if p_observed_at is null or (p_status <> 'active' and exists (select 1 from jsonb_array_elements(p_squares) x where x->>'status' = 'pending')) then
    raise exception 'Cannot finalize an incomplete grading observation';
  end if;
  if p_status = 'won' and (
    jsonb_typeof(p_won_line) is distinct from 'array' or jsonb_array_length(p_won_line) <> 5
    or (select count(distinct x) from jsonb_array_elements(p_won_line) x) <> 5
    or exists (
      select 1 from jsonb_array_elements_text(p_won_line) n
      where not exists (
        select 1 from public.sports_bingo_squares s join jsonb_array_elements(p_squares) x on s.id = (x->>'id')::uuid
        where s.card_id = p_card_id and s.square_index = n::integer and x->>'status' = 'hit'
      )
    )
  ) then raise exception 'Invalid Bingo winning line'; end if;

  update public.sports_bingo_squares s
  set status = x->>'status',
    resolved_at = case when x->>'status' = 'pending' then null else p_observed_at end
  from jsonb_array_elements(p_squares) x
  where s.id = (x->>'id')::uuid and s.card_id = p_card_id and s.status is distinct from x->>'status';
  get diagnostics changed = row_count;

  update public.sports_bingo_cards
  set status = p_status, grading_state = p_state, last_cron_processed_at = p_observed_at,
    settled_at = case when p_status = 'active' then null else p_observed_at end,
    won_line = p_won_line,
    won_notified_at = case when p_status = 'won' then p_observed_at else won_notified_at end,
    near_win_notified_at = case when p_status = 'active' and p_notification is not null then p_observed_at else near_win_notified_at end
  where id = p_card_id;

  -- Status transition and notification share a transaction. A duplicate/stale call returns
  -- above without writing anything. Points remain in the existing explicit reward-claim path.
  if p_notification is not null and (p_status <> 'active' or card.near_win_notified_at is null) then
    insert into public.notifications(user_id, type, message, link_url)
    values(card.user_id, p_notification->>'type', p_notification->>'message', p_notification->>'link_url');
  end if;
  return jsonb_build_object('applied', true, 'updated_squares', changed);
end;
$$;

revoke all on function public.apply_sports_bingo_grading(uuid,timestamptz,timestamptz,jsonb,jsonb,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_sports_bingo_grading(uuid,timestamptz,timestamptz,jsonb,jsonb,text,jsonb,jsonb) to service_role;
