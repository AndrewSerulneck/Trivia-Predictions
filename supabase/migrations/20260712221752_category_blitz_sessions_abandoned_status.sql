-- Add an 'abandoned' status for Category Blitz sessions, distinct from
-- 'complete'. Deleting a schedule from the admin UI should abandon the
-- running session (no scoring, no Game Over screen, no broadcast points) and
-- send players back to the lobby — whereas 'complete' still drives the
-- Game Over screen for a session that finished normally or was ended early
-- via the admin "end session" action.

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.category_blitz_sessions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%in%';

  if v_constraint_name is not null then
    execute format('alter table public.category_blitz_sessions drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.category_blitz_sessions
  add constraint category_blitz_sessions_status_check
    check (status in ('lobby', 'active', 'scoring', 'complete', 'abandoned'));
