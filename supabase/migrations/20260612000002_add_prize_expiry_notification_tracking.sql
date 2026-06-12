-- Track whether expiry warning notifications have been sent for each prize
alter table challenge_campaign_redemptions
  add column if not exists expiry_2d_notified_at timestamptz,
  add column if not exists expiry_1d_notified_at timestamptz;
