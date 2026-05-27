# Secure Table Migration Checklist

Use this checklist whenever a migration creates a new table in `public`.

## 1) RLS

```sql
alter table public.<table_name> enable row level security;
alter table public.<table_name> force row level security;
```

## 2) Explicit API grants

Start from deny-all, then grant only required verbs:

```sql
revoke all on table public.<table_name> from anon, authenticated;
```

Examples:

- Read-only catalog:

```sql
grant select on table public.<table_name> to anon, authenticated;
```

- User-owned rows:

```sql
grant select, insert, update, delete on table public.<table_name> to authenticated;
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

Repeat for `insert` (`with check`), `update` (`using` + `with check`), and `delete` (`using`) as needed.
