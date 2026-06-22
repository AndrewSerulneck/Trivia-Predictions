-- Add last_cron_processed_at to fantasy_entries and sports_bingo_cards.
-- This column is set exclusively by cron functions (never by DB triggers or user writes),
-- so ordering by it avoids the pollution caused by updated_at being bumped on every row write.
ALTER TABLE fantasy_entries ADD COLUMN IF NOT EXISTS last_cron_processed_at TIMESTAMPTZ NULL;
ALTER TABLE sports_bingo_cards ADD COLUMN IF NOT EXISTS last_cron_processed_at TIMESTAMPTZ NULL;

-- Partial indexes covering only the rows cron actually scans.
CREATE INDEX IF NOT EXISTS idx_fantasy_entries_cron_order
  ON fantasy_entries (last_cron_processed_at ASC NULLS FIRST)
  WHERE status IN ('pending', 'live');

CREATE INDEX IF NOT EXISTS idx_sports_bingo_cards_cron_order
  ON sports_bingo_cards (last_cron_processed_at ASC NULLS FIRST)
  WHERE status = 'active';
