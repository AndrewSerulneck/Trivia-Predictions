-- Support separate Speed Trivia and Live Trivia challenge game types.

alter table if exists challenge_invites
  drop constraint if exists challenge_invites_game_type_valid;

alter table if exists challenge_invites
  add constraint challenge_invites_game_type_valid
  check (game_type in ('pickem', 'fantasy', 'trivia', 'speed-trivia', 'live-trivia', 'bingo'));

alter table if exists challenge_campaigns
  alter column game_types set default '{pickem,fantasy,speed-trivia,live-trivia,bingo}';

alter table if exists challenge_campaigns
  drop constraint if exists challenge_campaigns_game_types_valid;

alter table if exists challenge_campaigns
  add constraint challenge_campaigns_game_types_valid check (
    array_length(game_types, 1) is null
    or game_types <@ array['pickem','fantasy','trivia','speed-trivia','live-trivia','bingo']::text[]
  );
