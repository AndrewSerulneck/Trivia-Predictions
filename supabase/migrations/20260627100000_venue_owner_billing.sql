-- Venue owner accounts, venue ownership links, billing subscriptions, and invoice history

CREATE TABLE venue_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE venue_owner_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES venue_owners(id) ON DELETE CASCADE NOT NULL,
  venue_id text REFERENCES venues(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (owner_id, venue_id)
);

CREATE TABLE billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id text REFERENCES venues(id) ON DELETE CASCADE UNIQUE NOT NULL,
  owner_id uuid REFERENCES venue_owners(id) ON DELETE CASCADE NOT NULL,
  slimcd_recurring_token text,
  plan_type text NOT NULL,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES billing_subscriptions(id) ON DELETE CASCADE NOT NULL,
  venue_id text REFERENCES venues(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'failed', 'pending')),
  slimcd_ticket text,
  charged_at timestamptz DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_venue_owner_venues_owner_id ON venue_owner_venues(owner_id);
CREATE INDEX idx_venue_owner_venues_venue_id ON venue_owner_venues(venue_id);
CREATE INDEX idx_billing_subscriptions_owner_id ON billing_subscriptions(owner_id);
CREATE INDEX idx_billing_subscriptions_status ON billing_subscriptions(status);
CREATE INDEX idx_billing_subscriptions_period_end ON billing_subscriptions(current_period_end);
CREATE INDEX idx_billing_invoices_subscription_id ON billing_invoices(subscription_id);
CREATE INDEX idx_billing_invoices_venue_id ON billing_invoices(venue_id);

-- RLS
ALTER TABLE venue_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_owner_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

-- venue_owners: owner can read and update their own row
CREATE POLICY "venue_owners_select_own" ON venue_owners
  FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY "venue_owners_update_own" ON venue_owners
  FOR UPDATE USING (auth.uid() = auth_id);

-- venue_owner_venues: owner can read their own venue links
CREATE POLICY "venue_owner_venues_select_own" ON venue_owner_venues
  FOR SELECT USING (
    owner_id IN (SELECT id FROM venue_owners WHERE auth_id = auth.uid())
  );

-- billing_subscriptions: owner can read their own venue's subscription
CREATE POLICY "billing_subscriptions_select_own" ON billing_subscriptions
  FOR SELECT USING (
    owner_id IN (SELECT id FROM venue_owners WHERE auth_id = auth.uid())
  );

-- billing_invoices: owner can read their own venue's invoices
CREATE POLICY "billing_invoices_select_own" ON billing_invoices
  FOR SELECT USING (
    venue_id IN (
      SELECT vov.venue_id FROM venue_owner_venues vov
      JOIN venue_owners vo ON vo.id = vov.owner_id
      WHERE vo.auth_id = auth.uid()
    )
  );

-- Auto-update updated_at on billing_subscriptions
CREATE OR REPLACE FUNCTION update_billing_subscription_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER billing_subscriptions_updated_at
  BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_billing_subscription_updated_at();
