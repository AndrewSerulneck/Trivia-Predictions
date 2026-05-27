-- Fix Supabase advisor: "RLS Disabled in Public" for public.players
-- Keep table readable to anon/authenticated clients, deny writes.

alter table public.players enable row level security;
alter table public.players force row level security;

revoke all on table public.players from anon, authenticated;
grant select on table public.players to anon, authenticated;

drop policy if exists "players_read_only_public" on public.players;
create policy "players_read_only_public"
  on public.players
  for select
  to anon, authenticated
  using (true);
