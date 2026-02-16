-- Atomic settlement path for pending prediction markets.
-- This keeps prediction status updates, winner point grants, and notifications
-- inside a single database transaction.

create index if not exists idx_user_predictions_prediction_status
  on user_predictions(prediction_id, status);

create or replace function public.settle_prediction_market(
  p_prediction_id text,
  p_winning_outcome_id text default null,
  p_settle_as_canceled boolean default false
)
returns table (
  affected_picks integer,
  winners integer,
  losers integer,
  canceled integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prediction_id text := btrim(coalesce(p_prediction_id, ''));
  v_winning_outcome_id text := btrim(coalesce(p_winning_outcome_id, ''));
  v_resolved_at timestamptz := now();
begin
  if v_prediction_id = '' then
    raise exception 'predictionId is required.';
  end if;

  if not p_settle_as_canceled and v_winning_outcome_id = '' then
    raise exception 'winningOutcomeId is required unless settling as canceled.';
  end if;

  return query
  with pending as (
    select up.id
    from user_predictions up
    where up.prediction_id = v_prediction_id
      and up.status = 'pending'
    for update
  ),
  resolved as (
    update user_predictions up
    set
      status = case
        when p_settle_as_canceled then 'canceled'
        when up.outcome_id = v_winning_outcome_id then 'won'
        else 'lost'
      end,
      resolved_at = v_resolved_at
    from pending p
    where up.id = p.id
    returning up.user_id, up.outcome_title, up.points, up.status
  ),
  winner_points as (
    select r.user_id, sum(r.points)::integer as delta
    from resolved r
    where r.status = 'won'
    group by r.user_id
  ),
  _points_update as (
    update users u
    set points = u.points + wp.delta
    from winner_points wp
    where u.id = wp.user_id
    returning u.id
  ),
  _notification_insert as (
    insert into notifications (user_id, message, type)
    select
      r.user_id,
      case
        when r.status = 'won' then format('Prediction resolved: %s won. You earned %s points.', r.outcome_title, r.points)
        when r.status = 'canceled' then format('Prediction canceled: %s market was canceled.', r.outcome_title)
        else format('Prediction resolved: %s did not win.', r.outcome_title)
      end,
      case
        when r.status = 'won' then 'success'
        when r.status = 'canceled' then 'info'
        else 'warning'
      end
    from resolved r
    returning id
  )
  select
    count(*)::integer as affected_picks,
    count(*) filter (where status = 'won')::integer as winners,
    count(*) filter (where status = 'lost')::integer as losers,
    count(*) filter (where status = 'canceled')::integer as canceled
  from resolved;
end;
$$;

revoke all on function public.settle_prediction_market(text, text, boolean) from public;
grant execute on function public.settle_prediction_market(text, text, boolean) to service_role;
