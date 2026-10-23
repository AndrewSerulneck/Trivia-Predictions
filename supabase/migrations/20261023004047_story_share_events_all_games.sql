-- Share analytics for every game that offers "Share my win" (native-app plan Phase 9c).
-- story_share_events.game_type only accepted the two original share games; the share registry
-- (lib/socialShare/shareGames.ts) now has nine, so shares from the others were dropped silently.
-- Widen the CHECK only: no new table, no data change, no grant change.

alter table public.story_share_events
  drop constraint if exists story_share_events_game_type_valid;

alter table public.story_share_events
  add constraint story_share_events_game_type_valid
  check (game_type in (
    'live-trivia',
    'category-blitz',
    'bingo',
    'pickem',
    'nfl-pickem',
    'fantasy',
    'squares',
    'bracket',
    'prize'
  ));
