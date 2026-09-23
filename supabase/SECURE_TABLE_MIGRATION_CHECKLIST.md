# Secure Table Migration Checklist

Use this checklist whenever a migration creates a new table, view/materialized view, or
sequence in `public`.

## The template

```sql
create table public.<t> ( … );
alter table public.<t> enable row level security;
alter table public.<t> force row level security;

-- Server (lib/supabaseAdmin.ts) access. Required since Supabase's 2026-10-30 change
-- (new objects no longer get automatic API-role access — see below).
grant select, insert, update, delete on table public.<t> to service_role;

-- Browser access: ONLY if the client reads/writes it directly, and only with RLS policies.
-- grant select on table public.<t> to anon;
-- grant select, insert, update, delete on table public.<t> to authenticated;
```

Do not copy Supabase's own docs example for a new table — it grants `anon`/`authenticated`
full access by default, which undoes this project's deny-by-default posture (see
`docs/supabase-data-api-grants-plan.md`).

## Why `service_role` needs an explicit grant now

From **2026-10-30**, Supabase stops auto-granting `anon`, `authenticated` **and
`service_role`** on any new `public` table, view, materialized view or sequence
(Supabase discussion [#45329](https://github.com/orgs/supabase/discussions/45329)). Before
that date the grant is still automatic in production, but the local CLI already simulates the
post-cutover behavior (`auto_expose_new_tables = false` in `supabase/config.toml`).

Our server code (`lib/supabaseAdmin.ts`) reaches every table through `service_role`. A
migration that creates a table without granting `service_role` will work today and return
`permission denied for table …` (Postgres code `42501`) once the cutover lands, or immediately
on any fresh database replay (new project, preview branch, local `supabase db reset`).

`anon`/`authenticated` deny-by-default has been the rule since the 2026-05-27 migration
(`20260527113000_explicit_api_grants_and_secure_defaults.sql`) — that part is unchanged.

## 1) RLS

```sql
alter table public.<table_name> enable row level security;
alter table public.<table_name> force row level security;
```

## 2) Explicit API grants

Start from deny-all for the browser roles, then grant only required verbs — and always grant
`service_role` what the server needs:

```sql
revoke all on table public.<table_name> from anon, authenticated;
grant select, insert, update, delete on table public.<table_name> to service_role;
```

Examples:

- Read-only catalog, also readable by the browser:

```sql
grant select on table public.<table_name> to anon, authenticated;
```

- User-owned rows, browser writes through RLS:

```sql
grant select, insert, update, delete on table public.<table_name> to authenticated;
```

### Sequences

A `serial`/`bigserial`/`smallserial` column or a standalone `create sequence` creates a
sequence object that needs its own grant — it is not covered by the table grant:

```sql
grant usage, select on sequence public.<table_name>_<column>_seq to service_role;
-- plus to any browser role that inserts into the table, if applicable
```

`generated … as identity` columns do **not** create a separately-grantable sequence in the way
that matters here — prefer identity columns over `serial` for new tables.

### Views and materialized views

Same rule: grant `select` to whichever roles read them.

```sql
grant select on table public.<view_name> to service_role;
```

### Functions (RPCs) are unaffected

The 2026-10-30 change does not touch `EXECUTE` privileges. Keep the existing habit of locking
down `SECURITY DEFINER` functions explicitly:

```sql
revoke all on function public.<fn>(<args>) from public, anon, authenticated;
grant execute on function public.<fn>(<args>) to service_role;
```

## 3) Explicit policies (idempotent)

```sql
drop policy if exists "<policy_name>" on public.<table_name>;
create policy "<policy_name>"
  on public.<table_name>
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
```

Repeat for `insert` (`with check`), `update` (`using` + `with check`), and `delete` (`using`) as
needed.

## Enforcement

`tests/supabase-migration-grants-contract.test.ts` (part of `npm run test`) statically checks
every migration newer than `20260914010000` for a `service_role` grant on each table/view it
creates, a `service_role` sequence grant on each `serial`/`bigserial` column, and RLS on any
object also granted to `anon`/`authenticated`. If a table is only ever reached through a
`SECURITY DEFINER` function and genuinely needs no direct API-role access, exempt it with a
comment giving the reason:

```sql
-- grants-contract: no-api-access <table_name> — reached only via public.<fn>(), never directly
```
