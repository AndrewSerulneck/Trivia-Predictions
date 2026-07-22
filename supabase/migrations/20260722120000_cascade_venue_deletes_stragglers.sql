-- Two tables added after 20260625200000_cascade_venue_deletes.sql were created
-- with ON DELETE RESTRICT, re-blocking venue deletion. Bring them in line with
-- the cascade convention established there.

alter table public.venue_presence_sessions
  drop constraint if exists venue_presence_sessions_venue_id_fkey,
  add constraint venue_presence_sessions_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.story_share_events
  drop constraint if exists story_share_events_venue_id_fkey,
  add constraint story_share_events_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;
