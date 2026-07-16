-- Migration: Add session_type column to category_blitz_sessions
-- This enables distinguishing between scheduled and continuous game modes

-- Add session_type column with default 'scheduled' to maintain backward compatibility
alter table public.category_blitz_sessions
  add column if not exists session_type text not null default 'scheduled';

-- Add constraint to ensure valid session types
alter table public.category_blitz_sessions
  drop constraint if exists category_blitz_sessions_session_type_check;

alter table public.category_blitz_sessions
  add constraint category_blitz_sessions_session_type_check
    check (session_type in ('scheduled', 'continuous'));

-- Add index for efficient filtering by session type
create index if not exists idx_category_blitz_sessions_type
  on public.category_blitz_sessions(session_type);

-- Add comment explaining the column
comment on column public.category_blitz_sessions.session_type is 
  'Game mode: scheduled (time-boxed with start/end) or continuous (infinite loop)';
