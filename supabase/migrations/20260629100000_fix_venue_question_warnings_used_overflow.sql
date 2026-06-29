-- The original CREATE TABLE in 20260624100000_venue_question_warnings.sql included
-- used_overflow, but the column was never applied to the production database.
-- This migration adds it idempotently.

alter table public.venue_question_warnings
  add column if not exists used_overflow boolean not null default false;
