-- Add prize fields to challenge_campaigns
alter table challenge_campaigns
  add column if not exists prize_type text
    check (prize_type in ('wine_bottle', 'free_appetizer', 'gift_certificate')),
  add column if not exists prize_gift_certificate_amount numeric(10,2);

-- Add prize expiry to challenge_campaign_redemptions
alter table challenge_campaign_redemptions
  add column if not exists prize_expires_at timestamptz,
  add column if not exists prize_redeemed_at timestamptz;
