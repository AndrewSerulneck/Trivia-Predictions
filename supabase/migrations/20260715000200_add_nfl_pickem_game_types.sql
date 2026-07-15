-- Migration: Add NFL Pick 'Em to game type constraints
-- Purpose: Enable NFL Pick 'Em across the application

-- Update game_sessions constraint
ALTER TABLE game_sessions 
  DROP CONSTRAINT IF EXISTS game_sessions_type_valid;

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_type_valid
  CHECK (game_type IN (
    'trivia', 
    'bingo', 
    'pickem', 
    'fantasy', 
    'speed-trivia', 
    'live-trivia', 
    'category-blitz',
    'nfl-pickem'
  ));

-- Update challenge_invites constraint
ALTER TABLE challenge_invites
  DROP CONSTRAINT IF EXISTS challenge_invites_game_type_valid;

ALTER TABLE challenge_invites
  ADD CONSTRAINT challenge_invites_game_type_valid
  CHECK (game_type IN (
    'pickem', 
    'fantasy', 
    'trivia', 
    'bingo',
    'nfl-pickem'
  ));

-- Update challenge_campaigns game_types constraint
-- First, we need to handle existing data that may have other game types
-- The constraint will be added permissively to allow existing types plus new ones

-- Drop existing constraint first
ALTER TABLE challenge_campaigns
  DROP CONSTRAINT IF EXISTS challenge_campaigns_game_types_valid;

-- Add constraint with expanded allowed types including all possible game types
-- This ensures backward compatibility with existing data
ALTER TABLE challenge_campaigns
  ADD CONSTRAINT challenge_campaigns_game_types_valid
  CHECK (
    array_length(game_types, 1) IS NULL
    OR game_types <@ ARRAY[
      'pickem','fantasy','trivia','bingo','speed-trivia','live-trivia','nfl-pickem'
    ]::text[]
  );

-- Update ad_events page_key constraint
ALTER TABLE ad_events
  DROP CONSTRAINT IF EXISTS ad_events_page_key_valid;

ALTER TABLE ad_events
  ADD CONSTRAINT ad_events_page_key_valid
  CHECK (page_key IS NULL OR page_key IN (
    'global', 'join', 'venue', 'trivia', 
    'sports-bingo', 'pickem', 'fantasy', 'nfl-pickem'
  ));

-- Update advertisements page_key constraint  
ALTER TABLE advertisements
  DROP CONSTRAINT IF EXISTS ads_page_key_valid;

ALTER TABLE advertisements
  ADD CONSTRAINT ads_page_key_valid
  CHECK (page_key IN (
    'global', 'join', 'venue', 'trivia', 
    'sports-bingo', 'pickem', 'fantasy', 'nfl-pickem'
  ));
