-- Tracks every runtime LLM API call for cost observability.
-- One row per API call (not per message in a streaming conversation).
-- Cost is computed server-side from known pricing tables, not from the provider's billing API.

CREATE TABLE llm_usage_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL CHECK (provider IN ('anthropic', 'gemini')),
  model           text NOT NULL,                           -- e.g. 'claude-haiku-4-5-20251001', 'gemini-2.5-flash'
  feature         text NOT NULL,                           -- e.g. 'category_blitz_grading', 'username_moderation', 'live_trivia_rewrite'
  input_tokens    integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens   integer NOT NULL CHECK (output_tokens >= 0),
  cost_cents      numeric(10,4) NOT NULL CHECK (cost_cents >= 0),
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_llm_usage_logs_created_at ON llm_usage_logs(created_at DESC);
CREATE INDEX idx_llm_usage_logs_feature    ON llm_usage_logs(feature);
CREATE INDEX idx_llm_usage_logs_provider   ON llm_usage_logs(provider);

-- RLS: admins only (service_role)
ALTER TABLE llm_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "llm_usage_logs_service_role_only" ON llm_usage_logs
  USING (auth.role() = 'service_role');
