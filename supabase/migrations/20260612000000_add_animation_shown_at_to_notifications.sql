alter table notifications
  add column if not exists animation_shown_at timestamptz;
