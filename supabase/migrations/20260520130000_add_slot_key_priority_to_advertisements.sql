-- Add slot_key (canonical slot identifier) and priority (sort order) to advertisements.
-- slot_key replaces the multi-field lookup (slot + page_key + ad_type + display_trigger + placement_key)
-- with a single, exact-match string. priority replaces the start_date DESC round-robin rotation.

-- Step 1: Add columns (slot_key nullable initially so backfill can run)
ALTER TABLE advertisements
  ADD COLUMN IF NOT EXISTS slot_key TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Step 2: Backfill slot_key from existing column combination
UPDATE advertisements
SET slot_key =
  CASE
    WHEN display_trigger = 'round-end' THEN
      COALESCE(page_key, 'trivia') || '-round-end' ||
      CASE WHEN round_number IS NOT NULL THEN '-r' || round_number ELSE '' END

    WHEN slot = 'popup-on-entry' THEN
      COALESCE(page_key, 'venue') || '-popup-on-entry'

    WHEN slot = 'popup-on-scroll' THEN
      COALESCE(page_key, 'venue') || '-popup-on-scroll'

    WHEN slot = 'mobile-adhesion' THEN
      COALESCE(page_key, 'venue') || '-banner'

    WHEN placement_key IS NOT NULL THEN
      COALESCE(page_key, 'global') || '-' || slot || '-' || placement_key

    WHEN page_key IS NOT NULL THEN
      page_key || '-' || slot

    ELSE slot
  END
WHERE slot_key IS NULL;

-- Step 3: Lock in NOT NULL constraint now that all rows have a value
ALTER TABLE advertisements ALTER COLUMN slot_key SET NOT NULL;

-- Step 4: Indexes for fast slot serving and priority ordering
CREATE INDEX IF NOT EXISTS idx_advertisements_slot_key
  ON advertisements (slot_key);

CREATE INDEX IF NOT EXISTS idx_advertisements_slot_key_priority
  ON advertisements (slot_key, priority ASC);
