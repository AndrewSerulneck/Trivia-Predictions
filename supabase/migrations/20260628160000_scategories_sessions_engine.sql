-- Scategories automated engine support.
-- Distinguishes engine-driven sessions ('auto') from admin-driven ones ('manual')
-- and records when an auto session's scheduled window closes, so the engine can
-- open windows, fire rounds on a cadence, and end sessions with no human in the loop.

alter table public.scategories_sessions
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'auto'));

alter table public.scategories_sessions
  add column if not exists scheduled_end_at timestamptz;
