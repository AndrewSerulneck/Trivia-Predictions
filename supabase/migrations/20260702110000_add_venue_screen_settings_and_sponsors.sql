ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS screen_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS screen_brand_image_url text,
  ADD COLUMN IF NOT EXISTS screen_brand_primary text,
  ADD COLUMN IF NOT EXISTS screen_brand_secondary text,
  ADD COLUMN IF NOT EXISTS screen_sponsor_rotation_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'venues_screen_brand_primary_hex_check'
  ) THEN
    ALTER TABLE venues
      ADD CONSTRAINT venues_screen_brand_primary_hex_check
      CHECK (
        screen_brand_primary IS NULL
        OR screen_brand_primary ~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'venues_screen_brand_secondary_hex_check'
  ) THEN
    ALTER TABLE venues
      ADD CONSTRAINT venues_screen_brand_secondary_hex_check
      CHECK (
        screen_brand_secondary IS NULL
        OR screen_brand_secondary ~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS venue_screen_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id text NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  title text NOT NULL,
  image_url text NOT NULL,
  link_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_screen_sponsors_display_order_check CHECK (display_order >= 0),
  CONSTRAINT venue_screen_sponsors_active_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_venue_screen_sponsors_venue_order
  ON venue_screen_sponsors(venue_id, display_order, created_at);

CREATE INDEX IF NOT EXISTS idx_venue_screen_sponsors_active_window
  ON venue_screen_sponsors(venue_id, is_active, starts_at, ends_at);
