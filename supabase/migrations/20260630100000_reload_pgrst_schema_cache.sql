-- PostgREST picks up new tables on NOTIFY; trigger reload so category_blitz_schedules becomes visible.
NOTIFY pgrst, 'reload schema';
