alter table if exists sports_bingo_squares
  add column if not exists square_type text not null default 'generic',
  add column if not exists player_id bigint,
  add column if not exists event_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sports_bingo_squares_square_type_valid'
  ) then
    alter table sports_bingo_squares
      add constraint sports_bingo_squares_square_type_valid
      check (square_type in ('generic', 'player_stat'));
  end if;
end $$;

create index if not exists idx_sports_bingo_squares_player_event_pending
  on sports_bingo_squares(player_id, event_type, status);
