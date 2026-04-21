-- Set Sports Bingo win reward to 100 points by default and enforce one active card per user/game.

alter table if exists sports_bingo_cards
  alter column reward_points set default 100;

update sports_bingo_cards
set reward_points = 100
where status = 'active'
  and coalesce(reward_points, 0) <> 100;

create unique index if not exists idx_sports_bingo_active_user_game
  on sports_bingo_cards(user_id, game_id)
  where status = 'active';
