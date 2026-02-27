-- Improves settlement notifications by including market question context.
create or replace function public.settle_prediction_market(
  p_prediction_id text,
  p_winning_outcome_id text default null,
  p_settle_as_canceled boolean default false,
  p_market_question text default null
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
  v_market_question text := btrim(coalesce(p_market_question, ''));
  v_event_text text := rtrim(btrim(coalesce(p_market_question, '')), '?');
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
        when r.status = 'won' then
          case
            when v_event_text <> '' and lower(btrim(r.outcome_title)) = 'yes' then
              format('%s. You won %s points.', v_event_text, r.points)
            when v_event_text <> '' and lower(btrim(r.outcome_title)) = 'no' then
              format('%s did not happen. You won %s points.', v_event_text, r.points)
            when v_event_text <> '' then
              format('%s. Result: %s. You won %s points.', v_event_text, r.outcome_title, r.points)
            else
              format('Prediction resolved: %s won. You earned %s points.', r.outcome_title, r.points)
          end
        when r.status = 'canceled' then
          case
            when v_market_question <> '' then format('%s market was canceled.', v_event_text)
            else format('Prediction canceled: %s market was canceled.', r.outcome_title)
          end
        else
          case
            when v_event_text <> '' and lower(btrim(r.outcome_title)) = 'yes' then
              format('%s. This one did not go your way.', v_event_text)
            when v_event_text <> '' and lower(btrim(r.outcome_title)) = 'no' then
              format('%s did not happen. This one did not go your way.', v_event_text)
            when v_event_text <> '' then
              format('%s. Result: %s. This one did not go your way.', v_event_text, r.outcome_title)
            else
              format('Prediction resolved: %s did not win.', r.outcome_title)
          end
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

revoke all on function public.settle_prediction_market(text, text, boolean, text) from public;
grant execute on function public.settle_prediction_market(text, text, boolean, text) to service_role;
