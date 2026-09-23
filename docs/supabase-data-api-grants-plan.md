# Supabase Data API grants: October 30, 2026 change

**Status:** Phase 0 (audit) and Phase 1 (guardrails) complete 2026-09-23. See
`docs/supabase-data-api-grants-plan_PHASE_1_HANDOFF.md` for the developer summary and the
Phase 2 handoff. Phase 2 not started. Nothing committed, pushed or applied to the database yet.

## Summary for Andrew

**What Supabase is changing.** From **2026-10-30**, a *new* table, view or sequence in the
`public` schema no longer gets automatic access for the three API roles (`anon`,
`authenticated`, `service_role`). Existing objects keep the access they already have.
Database functions (RPCs) are **not** affected. Source: Supabase changelog / discussion
[#45329](https://github.com/orgs/supabase/discussions/45329).

**What that means for us.** Nothing breaks on Oct 30 by itself. The risk is the **next
migration that creates a table**. Our server code reaches every table through `service_role`
(`lib/supabaseAdmin.ts`), and **no migration in this repo has ever granted `service_role`
anything.** We have always relied on the automatic grant. After Oct 30, a new table would come
back from the API as `permission denied for table …` (code `42501`), and whatever feature the
table was built for would fail when it ships.

**Why the job is small.** On 2026-05-27, migration
`20260527113000_explicit_api_grants_and_secure_defaults.sql` already switched off automatic
access for `anon` and `authenticated`. Browser-side access to new tables has been opt-in since
then, so only the `service_role` half and sequences are new.

**The plan:**

| Phase | What | Needed by Oct 30? | Touches production? | Model / effort |
|---|---|---|---|---|
| 1 | Guardrails: updated checklist, a test that fails the build if a new migration forgets its grants, project rules | **Yes**, before the next migration that creates a table | No | **Sonnet 5, medium** |
| 2 | One "catch-up" migration that writes today's live grants down explicitly (no change in prod), plus switching the new default on early, on our own schedule | Recommended | Yes: one `supabase db push`, **needs your OK** | **Opus 5.5, high** |
| 3 | After Oct 30: confirm Supabase applied the change and nothing regressed | After Oct 30 | Read-only | **Sonnet 5, low** |

**What needs you:** approval for the one `supabase db push` in Phase 2, and a quick decision
there (see "Open questions").

---

## Phase 0 findings (audit done 2026-09-23, all read-only)

Facts the later phases rely on:

1. **Exact change** (from discussion #45329). Supabase applies, for objects created by role
   `postgres` in schema `public`:
   ```sql
   alter default privileges for role postgres in schema public
     revoke select, insert, update, delete on tables from anon, authenticated, service_role;
   alter default privileges for role postgres in schema public
     revoke usage, select on sequences from anon, authenticated, service_role;
   ```
   Default privileges `on tables` also cover **views and materialized views**. Functions
   (`EXECUTE`) are not changed. It applies however the object is created: migration, SQL
   editor or dashboard. Local CLI: `auto_expose_new_tables = false` in `supabase/config.toml`
   simulates it, and that setting is "scheduled for removal on 2026-10-30" because it becomes
   the default.
2. **Live production default ACLs** (`pg_default_acl`, schema `public`, owner `postgres`):
   - tables: `{postgres=arwdDxtm, service_role=arwdDxtm}`. `anon`/`authenticated` were already
     revoked by the 2026-05-27 migration; **`service_role` is still auto-granted.**
   - sequences: `{postgres, anon, authenticated, service_role = rwU}`. **All still
     auto-granted.**
   - functions: `EXECUTE` to all API roles (not affected).
3. **Live production objects in `public`:** 67 tables, 6 views/materialized views, 1 sequence.
   **All 67 tables have `service_role` select/insert/update/delete; the sequence has
   `service_role` usage** (0 missing). `anon` has `select` on 26 tables, `authenticated` on 33.
4. **Migrations:** 186 files, **all applied to production** (`supabase migration list`: every
   local version has a matching remote one; latest `20260914010000`). Nothing is waiting to be
   pushed, so no pending migration is exposed to the date.
5. **70 `create table` statements across the migrations; 0 grant `service_role`.** Some later
   migrations grant `authenticated` (Category Blitz / scategories tables) or revoke from
   `anon, authenticated`.
6. **No other exposure:** no Realtime `postgres_changes` subscriptions in `app/`,
   `components/` or `lib/`; no runtime DDL in app code (the only `create table` outside
   migrations is the in-memory PGlite fixture in `scripts/test-bingo-atomic-grading.cjs`, which
   runs as superuser and doesn't depend on grants). Unmerged remote branches
   (`origin/chore/vps-pr-test`, `origin/onboarding-card-redesign`) contain no migrations.
7. **Replay exposure (why Phase 2 exists).** Anything that rebuilds the database from
   migrations after Oct 30 would have **no API grants on any table**: a new Supabase project,
   a preview branch, a staging copy, or a local `supabase db reset`. The app would be dead on
   arrival there. We don't use local Supabase or preview branches today (`supabase/config.toml`
   holds only `project_id` and one Edge Function setting), so this is insurance, not a live
   bug.
8. **Existing guidance to update:** `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` covers RLS
   and `anon`/`authenticated` grants but **never mentions `service_role` or sequences**.

### How the audit was run (reuse this)

- Snapshot query (read-only), run with
  `supabase db query --linked -f <file.sql>`:
  ```sql
  with rel as materialized (
    select c.oid, c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','S')
  ), t as materialized (select oid from rel where relkind in ('r','p')),
  s as materialized (select oid from rel where relkind='S')
  select
    (select count(*) from t) as tables,
    (select count(*) from t where not has_table_privilege('service_role',oid,'select,insert,update,delete')) as tables_missing_service_role_crud,
    (select count(*) from t where has_table_privilege('anon',oid,'select')) as anon_select,
    (select count(*) from t where has_table_privilege('authenticated',oid,'select')) as auth_select,
    (select count(*) from rel where relkind in ('v','m')) as views,
    (select count(*) from s) as sequences,
    (select count(*) from s where not has_sequence_privilege('service_role',oid,'usage')) as seq_missing_service_role,
    (select string_agg(pg_get_userbyid(d.defaclrole)||':'||d.defaclobjtype::text||'='||d.defaclacl::text, ' | ')
       from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public') as default_acls;
  ```
- **Traps hit:** `defaclobjtype` is type `"char"` and needs `::text` before `||`.
  `has_sequence_privilege` must run inside a `materialized` CTE, because otherwise the planner
  calls it on non-sequence rows (`"saml_providers_pkey" is not a sequence`). macOS has no
  `timeout` command. `supabase db query --linked` goes through the Management API and needs no
  DB password. The `supabase/migrations/Warnings` file is a stray linter JSON export; the CLI
  skips it ("file name must match pattern"). Leave it alone (existing migration-dir contents are
  history).

---

## Phase 1: Guardrails for every future migration (required, before Oct 30)

**Model / effort: Sonnet 5, medium.** Repo-only; no database or production changes.

**Goal:** make it impossible to merge a migration that creates a `public` table, view or
sequence without explicit grants. Also make the correct pattern the documented default.

**In scope**
1. **Rewrite `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`** around one copy-paste template:
   ```sql
   create table public.<t> ( … );
   alter table public.<t> enable row level security;

   -- Server (lib/supabaseAdmin.ts) access. Required since Supabase's 2026-10-30 change.
   grant select, insert, update, delete on table public.<t> to service_role;

   -- Browser access: ONLY if the client reads/writes it directly, and only with RLS policies.
   -- grant select on table public.<t> to anon;
   -- grant select, insert, update, delete on table public.<t> to authenticated;
   ```
   Plus these rules:
   - `serial`/`bigserial`/`create sequence` columns need
     `grant usage, select on sequence public.<t>_<col>_seq to service_role;` (and to any
     browser role that inserts). `generated … as identity` columns don't need a sequence
     grant. Prefer identity for new tables.
   - Views/materialized views need the same `grant select … to service_role`.
   - Deny-by-default for `anon`/`authenticated` stays (unchanged since 2026-05-27).
   - Functions are unaffected; keep the existing `revoke … from public, anon, authenticated`
     habit for `SECURITY DEFINER` RPCs.
   - Don't use Supabase's email example, which grants `anon`/`authenticated` full access. That
     would undo our deny-by-default posture.
2. **Static contract test `tests/supabase-migration-grants-contract.test.ts`** (Vitest, runs
   under plain `npm run test`, same style as `tests/navigation-controls-contract.test.ts`):
   - Scan `supabase/migrations/*.sql` with timestamp **greater than `20260914010000`** (every
     existing file is grandfathered and covered by Phase 2). Skip files that don't match
     `^\d{14}_.*\.sql$`, such as `Warnings`.
   - For each `create table [if not exists] [public.]<name>`,
     `create [or replace] [materialized] view [public.]<name>`: require, **in the same file**,
     a `grant … on [table] [public.]<name> … to … service_role` statement. Match names on word
     boundaries so `foo` doesn't match `foo_bar`.
   - For each `serial`/`bigserial`/`smallserial` column or `create sequence`: require a
     `grant usage … on sequence … to … service_role`.
   - For any object granted to `anon` or `authenticated`: require
     `enable row level security` on it in the same file (views are exempt; note why in a
     comment).
   - Escape hatch: a line `-- grants-contract: no-api-access <name> — <reason>` exempts an
     object only reachable through `SECURITY DEFINER` functions. The test must require a
     non-empty reason.
   - Include self-tests with inline SQL fixtures (passes / missing grant / missing sequence
     grant / anon without RLS / exemption without reason) so the parser is proven, not assumed.
     Watch for quoted identifiers, `public."Name"`, comma lists in `grant … on a, b to …`, and
     multi-line statements.
3. **Project rules:** add a short section to `CLAUDE.md` (and `AGENTS.md` if it has a
   migrations section) that says: new `public` tables/views/sequences need explicit
   `service_role` grants in the same migration; browser grants are opt-in with RLS; the
   contract test enforces it; see the checklist.

**Out of scope:** any migration, any `supabase db push`, and any change to existing grants.

**Done when:** `npx tsc --noEmit`, `npm run lint` and `npm run test` all pass, the new test
fails on a scratch migration that lacks the grant (create it, watch it fail, delete it), and the
Phase 1 handoff note is written.

---

## Phase 2: Catch-up grants migration + adopt the new default early (recommended)

**Model / effort: Opus 5.5, high.** Security-sensitive: it writes grants on production and
must be an exact no-op for existing tables.

**Goal:** (a) make the migration history reproduce production's real API access on a
fresh replay. (b) Switch production to the post-Oct-30 default now, so any mistake shows up on
our schedule instead of on a date we don't control.

**Steps**
1. **Snapshot before.** Dump the full per-object ACL to a file with
   `supabase db query --linked`: for every `public` table/view/matview/sequence, its `relacl`
   and any column-level grants (`information_schema.column_privileges` where
   `grantee in ('anon','authenticated','service_role')`). Save it under the scratchpad, not the
   repo.
2. **Generate** `supabase migration new explicit_api_grants_baseline`. Fill it from that
   snapshot, not hand-written: one `grant … to <role>` per object/role pair **exactly as
   production has it today**, including the 26 `anon` and 33 `authenticated` table grants. Use
   `grant` only (idempotent). No `revoke`: narrowing over-broad `anon` grants is a separate
   security review, not this plan. Header comment: generated from production on `<date>`,
   intended no-op on prod.
3. **Generate** `supabase migration new adopt_explicit_grant_defaults` containing exactly the
   two `alter default privileges for role postgres in schema public revoke … from anon,
   authenticated, service_role` statements from Phase 0 fact 1. No effect on existing objects.
4. **Local proof before prod (if Docker is available):** set `auto_expose_new_tables = false`
   under `[api]` in `supabase/config.toml`, run `supabase start` + `supabase db reset`, then
   check that `has_table_privilege('service_role', …)` holds for every table. If Docker isn't
   available, say so in the handoff; don't fake it.
5. **Ask Andrew, then** `supabase db push` (applies to the linked production project
   `pkmxupsayzshvpirkaav`; it always prompts).
6. **Snapshot after and diff.** Existing-object ACLs must be byte-identical to step 1. The
   default ACL must now show no `anon`/`authenticated`/`service_role` entries for tables and
   sequences owned by `postgres`. Then probe the new default in a rolled-back transaction:
   `begin; create table public._grant_probe(id int); select has_table_privilege('service_role','public._grant_probe','select'); rollback;`
   Expected result: `false`, which proves Phase 1's grants are what now carry new tables.
7. Run the full gates (`npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`,
   not typecheck concurrently with build). Write the handoff note.

**Undo:** migration files are immutable history. To reverse step 3, add a new migration with
the matching `alter default privileges … grant …` (only meaningful before Oct 30). Step 2 only
grants what already exists, so it has nothing to undo.

---

## Phase 3: Post-cutover verification (after 2026-10-30)

**Model / effort: Sonnet 5, low.** Read-only.

1. Re-run the Phase 0 snapshot query. Expect `tables_missing_service_role_crud = 0`,
   `seq_missing_service_role = 0`, and a default ACL with no API roles on tables/sequences.
2. Run `supabase db advisors --linked` (Security Advisor) and record any grant-related lint.
3. If any migration created a table between Phase 1 and now, confirm through PostgREST (e.g.
   `node --env-file=.env.local` with the service-role client) that the server can read it.
4. Remove `auto_expose_new_tables` from `supabase/config.toml` if Phase 2 added it (the CLI
   drops the setting at the cutover).
5. Mark this plan complete.

---

## Open questions for Andrew

1. **Phase 2 go/no-go.** Phase 2 is insurance. It matters only if we ever rebuild the database
   from migrations (new project, staging, disaster recovery) and for flipping early. Skipping
   it doesn't break production. Recommendation: do it.
2. **`anon` read access on 26 tables** was noticed but not reviewed. This plan copies it
   as-is. Do you want a separate security review of which tables the browser really needs?
