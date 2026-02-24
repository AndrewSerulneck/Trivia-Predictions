-- Supports rolling hourly pick-limit checks.
create index if not exists idx_user_predictions_user_created_at
  on user_predictions(user_id, created_at);
