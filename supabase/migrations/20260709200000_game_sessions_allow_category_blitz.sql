-- Category Blitz was never added to game_sessions_type_valid, so every
-- Category Blitz play-session analytics insert (lib/analytics.ts
-- startGameSession, called from GameLandingExperience.tsx) has been
-- silently rejected since the game shipped. Add it to the allowed set.
alter table game_sessions drop constraint game_sessions_type_valid;
alter table game_sessions add constraint game_sessions_type_valid
  check (game_type in ('trivia', 'bingo', 'pickem', 'fantasy', 'speed-trivia', 'live-trivia', 'category-blitz'));
