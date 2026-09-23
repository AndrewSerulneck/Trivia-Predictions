# Phase 2 handoff — Supabase Data API grants: catch-up migration + early cutover

**Plan:** `docs/supabase-data-api-grants-plan.md`. **Status:** Phase 2 complete, 2026-09-23.
Both migrations are **applied to production** and verified. Code is committed and pushed to
`origin/main`. Next is Phase 3, a read-only check **after 2026-10-30**.

## Summary for Andrew

- **What changed.** Production now behaves the way Supabase will make every project behave on
  Oct 30: a *new* table, view or sequence gets no automatic access for the app's database
  roles. We switched this on ourselves, today, so any mistake shows up on our schedule.
- **Nothing existing changed.** Before and after snapshots of every table's permissions in
  production are identical, byte for byte. I also checked the app's server connection and the
  public browser connection still read data normally.
- **Why it's worth having.** The migration history now records every table's real permissions.
  If the database is ever rebuilt from migrations (new project, staging copy, disaster
  recovery), the app will work instead of failing with "permission denied" everywhere.
- **Is it live?** Yes. The two database changes were applied to production at about
  13:10 UTC on 2026-09-23. No app redeploy is needed. The only app-repo changes are docs and
  the two migration files.
- **What's left:** Phase 3, a 10-minute read-only check some time after Oct 30. Nothing is
  urgent before then.
- **What needs you:** nothing required. Two optional items:
  1. **Security review of browser access (optional, recommended some time).** 24 tables give
     the public (not-logged-in) browser role full read/write *permission*, and 2 more give it
     read. Row Level Security is on for all 26, so what can actually be done depends on each
     table's policies. 5 of them have **no policies at all** (`answer_variants`,
     `challenge_campaign_progress`, `challenge_campaign_redemptions`, `challenge_campaigns`,
     `webhook_events_processed`), which with RLS on means the browser can do nothing there, so
     those are safe. The other 21 were not reviewed. This was Open Question 2 and it is still
     your call. This work copied those permissions exactly and did not change them.
  2. **Rule for new tables (already enforced).** Any future migration that makes a table must
     grant it to `service_role` in the same file. The automated test from Phase 1 blocks the
     build if it doesn't, and production now enforces the same rule. Claude sessions already
     know this from `CLAUDE.md`.
- **Code review?** I don't think one is needed. See "Code review" below for why.
- **Unrelated failing tests:** 4 date-based "snapshot is stale" tests for the MLB and NFL star
  index data fail today (they failed before this work too). They need a data refresh, separate
  from this plan.

---

## For the next agent (Phase 3)

### 1. Goal and scope

Phase 3 is **read-only**, **after 2026-10-30**. Spec: the "Phase 3: Post-cutover
verification" section of `docs/supabase-data-api-grants-plan.md` (updated in this phase with
the exact expected default ACL). Goal: confirm Supabase's cutover landed and nothing
regressed, then mark the plan complete.

**Out of scope:** changing any grant; narrowing the `anon`/`authenticated` grants (Open
Question 2, which needs Andrew's explicit request); editing either Phase 2 migration (they
are applied history and immutable).

### 2. Starting state

- Branch `main`. Phase 1 was committed as `ccd271e` ("Supabase Data API grants Phase 1:
  migration grants guardrails"). Phase 2 is the commit right after it on `main` (message starts
  "Supabase Data API grants Phase 2"), pushed to `origin/main`. Check with `git log --oneline -3`.
- **Database:** linked project `pkmxupsayzshvpirkaav`, PostgreSQL 17.6. 188 migrations,
  all applied; the two newest are:
  - `20260923130841_explicit_api_grants_baseline.sql`
  - `20260923130842_adopt_explicit_grant_defaults.sql`

  Applied with `supabase db push --yes` on 2026-09-23 at about 13:10 UTC, after a
  `--dry-run` listed exactly those two. `supabase migration list --linked` shows local = remote
  for all of them.
- **No backups or undo log were needed.** The baseline only re-grants privileges production
  already had (verified identical after), and the defaults change affects only objects created
  later. The snapshots were saved in the session scratchpad, which is temporary. Re-take them
  with the query in §6 if you need them.
- The app was not redeployed and doesn't need to be. There are no application code changes.

### 3. Decisions made (don't re-ask)

- **Andrew approved Phase 2 and the `supabase db push`:** "execute phase 2 … push this work so
  it's live and implemented" (2026-09-23).
- **`revoke all`, not Supabase's literal statement list.** The plan said "exactly the two
  statements from Phase 0 fact 1" (`revoke select, insert, update, delete on tables` /
  `revoke usage, select on sequences`). Those would leave `service_role=Dxtm` (truncate,
  references, trigger, maintain) on tables and `update` for all three roles on sequences in the
  default ACL. That contradicts the plan's own step-6 check ("no API-role entries"). `revoke all`
  is a strict superset: when Supabase applies its narrower revoke on Oct 30, it will change
  nothing here. It also matches `20260527113000_explicit_api_grants_and_secure_defaults.sql`.
  The migration header documents this.
- **Baseline style:** one `grant` per object/role pair, generated from the production snapshot
  and never hand-written. `all privileges` is used when the role held the full set (PG17 table:
  `arwdDxtm`; sequence: `rwU`). Otherwise the privileges are listed explicitly. Owner
  (`postgres`) entries are left out. Grant only, no revoke.
- **Only owner `postgres` default ACLs were changed.** `supabase_admin` still has default ACLs
  granting everything to all three roles in `public`. Those are Supabase-managed, our
  migrations and the dashboard create objects as `postgres` (all 74 `public` objects are owned
  by `postgres`), and Supabase's change also targets `postgres` only. Left alone on purpose.
- **Nothing was added to `supabase/config.toml`.** There was no Docker, so there was no local
  stack to configure `auto_expose_new_tables` for.

### 4. Files created or changed

- `supabase/migrations/20260923130841_explicit_api_grants_baseline.sql` (new, applied). It
  has a header plus 138 grants in four blocks: tables 126 (67 `service_role`, 26 `anon`,
  33 `authenticated`), views 6 (3 `service_role`, 3 `authenticated`), materialized views 3
  (`service_role`) and sequence 3 (`players_id_seq` to all three roles).
- `supabase/migrations/20260923130842_adopt_explicit_grant_defaults.sql` (new, applied):
  `alter default privileges for role postgres in schema public revoke all on tables|sequences
  from anon, authenticated, service_role`.
- `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`: the "Why" section now says production has
  run the post-cutover default since 2026-09-23, so a missing grant fails **as soon as the
  migration is applied**.
- `CLAUDE.md`: the "Supabase Data API grants" section gets the same update.
- `docs/supabase-data-api-grants-plan.md`: status line, Phase 2 "As built" paragraph
  (including the deviation), Phase 3 expected default ACL, Phase 3 step 4 (nothing to
  remove) and Open Question 1 marked answered.
- This handoff.

The Phase 1 contract test (`tests/supabase-migration-grants-contract.test.ts`) now scans these
two real files (timestamps > `20260914010000`). Both pass with zero findings, because neither
creates a table, view or sequence.

### 5. Facts and traps

- **Production ACL facts (2026-09-23):** 74 `public` objects: 67 tables, 3 views
  (`admin_analytics_*`), 3 materialized views (`analytics_*`) and 1 sequence
  (`players_id_seq`). All are owned by `postgres`, every grantor is `postgres`, and there are
  **no column-level grants**. `anon` has `arwdDxtm` on 24 tables and `r` on 2 (`players`,
  `live_player_stats`). All 26 have RLS enabled.
- **Default ACL now** (`pg_default_acl`, schema `public`):
  `postgres:r={postgres=arwdDxtm/postgres}` and `postgres:S={postgres=rwU/postgres}` (no API
  roles). `postgres:f` still grants `EXECUTE` to all three API roles (functions are
  unaffected). `supabase_admin:r/S/f` still grant everything (see §3).
- **New tables now get zero API access in production.** A migration that creates a table
  without granting it will apply cleanly and then fail at runtime with `42501 permission
  denied`. The contract test catches this before merge. Don't bypass it.
- **`supabase db query --linked` accepts a multi-statement `begin; …; rollback;` file** and
  returns the last `select`'s rows. That is how the probe ran safely on production. After a
  probe, always confirm there are no leftovers (query in §6).
- **Snapshot query traps (from Phase 0, still true):** `defaclobjtype` needs `::text` before
  `||`. `has_sequence_privilege` must sit behind a `materialized` CTE. macOS has no `timeout`.
  `supabase/migrations/Warnings` is a stray file that the CLI skips.
- **Tooling:** no Docker on this machine (`docker info` fails), so no `supabase start`. The
  repo has no `@electric-sql/pglite` in `node_modules`. For the local proof I installed it into
  a scratch directory (`npm install @electric-sql/pglite`, which gave 0.5.8, i.e. PostgreSQL
  18.3). Don't add it to `package.json` for this.
- **PostgREST sanity check:** `node --env-file=.env.local <script>.mjs`, with the script
  **inside the repo directory** so `@supabase/supabase-js` resolves. Delete the script after.
  Env names used: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never print values.

### 6. How it was verified (and how to re-run)

**Full ACL snapshot query** (read-only; `supabase db query --linked -f snapshot.sql > out.json`):

```sql
with rel as materialized (
  select c.oid, c.relname, c.relkind::text as relkind, c.relacl
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
)
select 'rel' as kind, r.relname as object, r.relkind, null::text as col,
       coalesce(r.relacl::text,'<null>') as acl
from rel r
union all
select 'col', r.relname, r.relkind, a.attname, a.attacl::text
from rel r join pg_attribute a on a.attrelid=r.oid
where a.attnum>0 and not a.attisdropped and a.attacl is not null
union all
select 'defacl', pg_get_userbyid(d.defaclrole), d.defaclobjtype::text, null, d.defaclacl::text
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' or d.defaclnamespace=0
order by 1,2,4;
```

**Generator** (how the baseline body was produced from that JSON; `python3 gen.py out.json`):

```python
import json, re, sys
rows = json.load(open(sys.argv[1]))["rows"]
API = ["anon", "authenticated", "service_role"]
TABLE_PRIVS = [("r","select"),("a","insert"),("w","update"),("d","delete"),("D","truncate"),("x","references"),("t","trigger"),("m","maintain")]
SEQ_PRIVS = [("r","select"),("w","update"),("U","usage")]
KIND = {"r":"tables","p":"tables","v":"views","m":"materialized views","S":"sequences"}
out = {"tables":[], "views":[], "materialized views":[], "sequences":[]}
for r in sorted((r for r in rows if r["kind"]=="rel"), key=lambda r: r["object"]):
    privmap = TABLE_PRIVS if r["relkind"] != "S" else SEQ_PRIVS
    full = "".join(c for c,_ in privmap)
    items = {}
    for it in r["acl"].strip("{}").split(","):
        grantee, priv, grantor = re.match(r"(.*)=(\w*)/(.*)", it).groups()
        assert grantor == "postgres", it
        items[grantee] = priv
    objkw = "sequence" if r["relkind"] == "S" else "table"
    for role in API:
        if role not in items: continue
        p = items[role]
        plist = "all privileges" if set(p) == set(full) else ", ".join(n for c,n in privmap if c in p)
        out[KIND[r["relkind"]]].append(f"grant {plist} on {objkw} public.{r['object']} to {role};")
for k, lines in out.items():
    print(f"-- {k} ({len(lines)} grants)"); print("\n".join(lines)); print()
```

**Results:**
1. **Contract test:** `npx vitest run tests/supabase-migration-grants-contract.test.ts` gave
   16/16 passing (14 self-tests + the 2 new real files).
2. **Local PGlite proof** (standing in for plan step 4, since there is no Docker):
   - (A) Created all 74 objects as stubs with the same names in a fresh DB with **no**
     default grants (the post-cutover replay case) and confirmed zero API grants. Then ran the
     baseline file verbatim. Result: the API-role ACL items match production exactly (138
     expected, 138 present, 0 missing, 0 extra), `service_role` can `select` every relation,
     and a second run of the baseline is a no-op.
   - (B) Started from production's pre-change default ACL plus a pre-existing table and
     sequence, then ran the adopt file. Existing ACLs were unchanged, the `public` default ACL
     was empty, and a new table, view, sequence and `serial` column all returned `false` for
     API-role privileges.
3. **Production, before and after:** snapshot taken, re-taken just before the push (identical),
   then taken after. **All 74 object ACLs are byte-identical** and there are no column ACLs.
   The default ACL is as listed in §5.
4. **Production probe** (plan step 6), in a transaction that was rolled back:
   `create table public._grant_probe(id int); create sequence public._grant_probe_seq;`
   returned `false` for service_role table select, anon, authenticated and service_role
   sequence usage (as `current_user = postgres`). Leftover `_grant_probe%` objects afterwards: 0.
5. **PostgREST:** `service_role` can read `venues` (13), `users` (179),
   `billing_subscriptions` (3) and `players` (12,761). `anon` can read `players` (HTTP 206 partial
   content). Both work.
6. **Gates:** `npx tsc --noEmit` clean. `npm run lint` clean (only the known Babel file-size
   note on `lib/sportsBingo.ts`). `npm run test`: 246 files passed, 2,632 tests passed,
   13 skipped, **4 failed, all pre-existing and unrelated**:
   `tests/lib.sportsBingo.{mlb,nfl}-star-index.test.ts` and
   `tests/lib.sportsBingo.{mlb,nfl}-star-index-freshness.test.ts`. These are date-based
   committed-snapshot staleness tripwires. Phase 1 recorded the same 4. `npm run build` passed,
   run separately and not alongside typecheck.

**Unverified:** a real `supabase db reset` replay of all 188 migrations. The PGlite proof
covers the grant logic but not a full Supabase-stack replay, because there is no Docker.

### 7. Open questions for the developer

1. (Carried over, optional) Security review of the 26 `anon`-granted tables. See the summary
   above. This needs Andrew's explicit request before anything is narrowed, and would be its
   own plan with a new migration.

Nothing else is waiting on Andrew.

### 8. Recommended first steps for Phase 3

The plan names **Sonnet 5, low effort**. After 2026-10-30:

1. Re-run the Phase 0 snapshot query (in the plan) and the §6 query above. Expect
   `tables_missing_service_role_crud = 0`, `seq_missing_service_role = 0`, and the `postgres`
   default ACL exactly as in §5. Record whether Supabase touched the `supabase_admin` rows.
2. `supabase db advisors --linked` and record any grant-related lint.
3. For each migration newer than `20260923130842`, confirm through PostgREST with the
   service-role client that the server can read every table it created.
4. Confirm `supabase/config.toml` still has no `auto_expose_new_tables`.
5. Mark the plan complete and write a short Phase 3 note.
