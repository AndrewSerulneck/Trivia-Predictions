-- Persist market context on each pick so pending/history views remain readable
-- even after upstream market feeds no longer return the question.
alter table if exists user_predictions
  add column if not exists market_question text,
  add column if not exists market_closes_at timestamptz,
  add column if not exists market_sport text,
  add column if not exists market_league text;

create index if not exists idx_user_predictions_prediction_status_created
  on user_predictions(prediction_id, status, created_at desc);
