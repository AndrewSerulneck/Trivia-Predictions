-- Adopt Supabase's post-2026-10-30 default early (Phase 2 of
-- docs/supabase-data-api-grants-plan.md).
--
-- Supabase will apply the equivalent change on 2026-10-30 (discussion #45329). Running it now
-- means a migration that forgets its grants fails on our schedule, not on a date we don't
-- control.
--
-- `revoke all` rather than Supabase's literal `revoke select, insert, update, delete` /
-- `revoke usage, select`: theirs would leave service_role holding truncate/references/
-- trigger/maintain on new tables, and all three roles holding update on new sequences, in the
-- default ACL. `all` is a strict superset of their change (theirs becomes a no-op on top of
-- it) and matches 20260527113000_explicit_api_grants_and_secure_defaults.sql.
--
-- Effect: NEW tables, views, materialized views and sequences created by role postgres in
-- schema public no longer get any automatic grant for anon, authenticated or service_role.
-- Every such migration must grant explicitly (supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md;
-- enforced by tests/supabase-migration-grants-contract.test.ts). EXISTING objects are not
-- touched; their grants are recorded in 20260923130841_explicit_api_grants_baseline.sql.
-- Functions (EXECUTE) are not affected.
--
-- Undo (only meaningful before 2026-10-30): a NEW migration with the matching
-- `alter default privileges for role postgres in schema public grant ...` statements.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
