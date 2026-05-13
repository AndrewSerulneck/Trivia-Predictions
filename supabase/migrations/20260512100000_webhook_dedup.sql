create table if not exists webhook_events_processed (
  webhook_id text primary key,
  processed_at timestamptz not null default now()
);

create index if not exists idx_webhook_events_processed_at
  on webhook_events_processed(processed_at);

alter table webhook_events_processed enable row level security;
