-- Allow the anon role to read fantasy_entries so Supabase Realtime
-- postgres_changes subscriptions can deliver row updates to the client.
--
-- The Supabase JS client (anon key) is used exclusively for Realtime channels
-- in this app — all database queries go through the server-side admin client.
-- Without this policy the channel stays in a SUBSCRIBED→CHANNEL_ERROR loop
-- because RLS blocks row delivery for unauthenticated sessions.
--
-- The Realtime channel is filtered to a single user's rows
-- (filter: user_id=eq.<userId>), so broadcast scope is already narrow.

drop policy if exists "Anon can read fantasy entries for realtime" on fantasy_entries;
create policy "Anon can read fantasy entries for realtime"
  on fantasy_entries for select
  to anon
  using (true);
