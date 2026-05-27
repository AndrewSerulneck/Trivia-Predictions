alter table public.players enable row level security;
alter table public.players force row level security;

drop policy if exists "players_read_all" on public.players;
create policy "players_read_all"
  on public.players
  for select
  to anon, authenticated
  using (true);
