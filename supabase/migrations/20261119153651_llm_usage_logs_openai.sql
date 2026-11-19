-- Phase 4f.2 (docs/speed-trivia-backlog-and-quality-plan.md, D40): the question checks move from Gemini to the
-- OpenAI API, and their spend is recorded here (one row per model per run; lib/openai/ledger.cjs).
-- Widen the provider check only. Old 'gemini' rows stay readable; nothing is rewritten.
alter table public.llm_usage_logs drop constraint if exists llm_usage_logs_provider_check;
alter table public.llm_usage_logs add constraint llm_usage_logs_provider_check
  check (provider in ('anthropic', 'gemini', 'openai'));
