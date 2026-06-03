-- Revoke anonymous access to SECURITY DEFINER functions that should never
-- be callable without authentication.

revoke execute on function public.settle_prediction_market(text, text, boolean) from anon;
revoke execute on function public.settle_prediction_market(text, text, boolean, text) from anon;
revoke execute on function public.prune_user_analytics_raw_events(interval) from anon;
revoke execute on function public.refresh_user_analytics_rollups() from anon;
