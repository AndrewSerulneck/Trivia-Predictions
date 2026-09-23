# Phase 1 handoff — Supabase Data API grants guardrails

**Plan:** `docs/supabase-data-api-grants-plan.md`. **Status:** Phase 1 complete, 2026-09-23.
Nothing was pushed to production or applied to the database — this phase is repo-only.

## Summary for Andrew

Phase 1 built the guardrail Phase 0 recommended: the migration checklist now explains the
`service_role` grant requirement and gives a copy-paste template, and a new automated test
(`tests/supabase-migration-grants-contract.test.ts`, runs under plain `npm run test`) will fail
the build if anyone writes a future migration that creates a table/view/sequence in `public`
without granting `service_role` — or grants `anon`/`authenticated` without turning on Row Level
Security. I proved the test actually catches the bug: I wrote a scratch migration missing the
grant, watched the test fail with a clear message, then deleted the scratch file. Nothing here
touches the live database. Phase 2 (the recommended one-time "catch-up" migration + early
cutover) is next, and needs your go-ahead for one `supabase db push` — see the plan's "Open
questions" section, unchanged from Phase 0.

## For the next agent (Phase 2)

### Scope
Phase 2's goal and scope are already fully specified in `docs/supabase-data-api-grants-plan.md`
under "Phase 2: Catch-up grants migration + adopt the new default early" — read that section,
it is the spec, not this note. In short: (a) generate one migration that writes today's live
production grants down explicitly (a no-op against prod, but makes a fresh replay work), (b)
generate a second migration that flips on the post-Oct-30 default early, on our schedule, (c)
push both to production with Andrew's explicit OK, (d) verify byte-identical ACLs on existing
objects and that a probe table created after the flip has no automatic `service_role` grant.
**Out of scope:** narrowing the 26 tables `anon` already has `select` on — that's Open Question
2, a separate security review Andrew hasn't requested yet.

### Starting state
- Branch: `main`. Last commit before this phase: `dad7708` ("Record reliability release on
  main"). This phase's changes are **not committed yet** — that's a deliberate choice: I didn't
  commit because the user's instruction was "read handoff notes and execute phase 1, leave
  handoff notes," not "commit." Check with Andrew (or just ask) whether to commit Phase 1 before
  starting Phase 2, or bundle both into one commit/PR. If you commit Phase 1 first, keep it a
  separate commit from anything Phase 2 does, since Phase 2 touches production.
- Database: unchanged. Still `pkmxupsayzshvpirkaav`, still 186 migrations, all applied, latest
  `20260914010000`. No `supabase db push` has been run in this phase.
- Working tree has exactly 4 changed/new files (verified with `git status --short`):
  - `M CLAUDE.md`
  - `M supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`
  - `?? docs/supabase-data-api-grants-plan.md` (was already untracked at the start of this
    session — Phase 0's output, not touched by me except this handoff and the status-line edit)
  - `?? tests/supabase-migration-grants-contract.test.ts`
  - Plus this handoff file and the plan's updated status line, both new/modified after the
    `git status` snapshot above was taken.

### Decisions already made (don't re-ask)
- **AGENTS.md was deliberately left untouched.** The plan said "add a section... if it has a
  migrations section" — it doesn't (checked: `grep -n -i migration AGENTS.md` only matches
  unrelated Bingo release-history prose). `CLAUDE.md` got the new section instead
  ("Supabase Data API grants (2026-10-30 Supabase change)", right before "## Trivia Source of
  Truth"). If AGENTS.md later grows a real migrations section, mirror it there too.
- **The contract test's real-migration suite is currently empty** (0 files with timestamp
  `> 20260914010000`) and passes trivially. That's expected — the grandfather cutoff is
  Phase 0's audit date, and no migration has been added since. The test still proved itself:
  see "How it was verified" below. Don't be alarmed that `npm run test` shows 0 assertions
  against real files; that will start exercising real content the moment Phase 2's two new
  migrations land (they'll need to pass it, or be exempted with the documented escape hatch —
  see the "Traps" note below on that).
- **Sequence detection covers `serial`/`bigserial`/`smallserial` columns and standalone
  `create sequence`, not `generated … as identity`.** That matches Phase 0's fact that identity
  columns don't need a separate sequence grant in the way that matters here, and the checklist
  now tells authors to prefer identity for new tables.
- **RLS requirement is table-only, views exempt** — matches the plan's explicit exemption
  ("views are exempt; note why in a comment" — I didn't add that comment anywhere since the
  parser enforces the exemption unconditionally, no comment needed to invoke it; only the
  `no-api-access` escape hatch needs an inline reason).

### Files changed, with key functions
- **`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`** — fully rewritten. Structure: the
  copy-paste template at the top, then "Why `service_role` needs an explicit grant now"
  (context for a reader with no memory of this plan), then the original RLS/grants/policy
  sections expanded with sequence and view/matview guidance, then an "Enforcement" section
  pointing at the new test and documenting the escape-hatch comment syntax exactly.
- **`CLAUDE.md`** — one new section inserted before "## Trivia Source of Truth", ~10 lines,
  summarizing the rule and pointing at the checklist + test + plan.
- **`tests/supabase-migration-grants-contract.test.ts`** — new file, ~400 lines. Two `describe`
  blocks:
  - `"supabase migration grants contract — parser self-tests"` (14 inline-fixture tests) proves
    the parser: passes a clean table, flags a missing `service_role` grant, flags a missing
    sequence grant, flags anon/authenticated without RLS, passes the same with RLS, honors a
    valid `no-api-access` exemption, rejects one with no reason, proves `foo` vs `foo_bar` don't
    cross-match, handles a comma-separated `grant ... on public.a, public.b to ...` list,
    requires `service_role select` on a materialized view, passes a standalone `create sequence`
    with its own grant, and proves dollar-quoted (`$$...$$`) function bodies with internal `;`
    don't break statement splitting.
  - `"supabase migration grants contract — real migrations"` iterates
    `supabase/migrations/*.sql`, filters filenames matching `^(\d{14})_.*\.sql$` (so `Warnings`
    is skipped automatically — it doesn't match) with timestamp `> "20260914010000"`
    (string comparison, safe because all timestamps are the same 14-digit width), and runs one
    `it(...)` per file so a future failure names the exact file.
  - Key functions inside: `analyzeMigrationSql(rawSource)` (returns tables/views/sequences/RLS
    set/grants map/exemptions found in one file) and `checkMigration(sql)` (applies the Phase 1
    rules to that analysis and returns human-readable error strings — this is what both describe
    blocks call). `maskDollarQuoted`, `stripComments`, `splitTopLevel` (depth-aware comma split,
    used both for grant object lists and for column lists so `check (a in (1,2))` doesn't
    fracture) and `columnListBody` (paren-depth matching to find a `create table`'s column list)
    are the parsing primitives.

### Facts and traps discovered
- **`supabase/migrations/Warnings` is a stray linter export, not a migration** — the Supabase
  CLI already skips it ("file name must match pattern"), and so does this test's filename regex
  (`^(\d{14})_.*\.sql$` requires a 14-digit numeric prefix). Confirmed by listing the dir; no
  action needed, just don't be surprised it's absent from the scanned set.
- **Statement splitting is a plain `text.split(";")` after masking `$$...$$` bodies** — same
  pattern `tests/lib.venue-fk-cascade-guard.test.ts` already uses in this repo (plain `;` split,
  no masking) but I added dollar-quote masking because Phase 2's migrations may plausibly mix
  `create table` + a `create function ... as $$ ... $$` in one file, and an unmasked split would
  fracture on every `;` inside the function body. Verified this works with an inline self-test.
- **The escape-hatch reason separator accepts both an em dash (`—`, as the plan's example
  literally uses) and a plain hyphen (`-`)** — I made it lenient on purpose so a future author
  typing a regular hyphen doesn't get a confusing "missing a reason" failure over punctuation.
  If Andrew wants it strict to the em dash only, tighten `EXEMPTION_STRICT_RE` in the test file.
- **RLS detection only recognizes `alter table ... enable row level security`**, not `force row
  level security`. That matches the plan's literal spec ("require ... `enable row level
  security` on it") — `force` is good practice (see the scategories example migration) but not
  what Phase 1 was asked to enforce. If Andrew wants `force` required too, that's a one-line
  regex addition plus a self-test, not a re-architecture.
- **The contract test currently has zero real files to check.** This is fine and expected — see
  "Decisions already made" above — but it means the very first migration Phase 2 writes will be
  the first real proof this test does something. Watch it closely on that migration: run
  `npm run test -- tests/supabase-migration-grants-contract.test.ts` right after writing each of
  Phase 2's two migrations, before running the full suite.
- **Phase 2's `explicit_api_grants_baseline` migration will need the `no-api-access` escape
  hatch, or careful sequencing, for edge cases the parser wasn't built to handle:** the 6
  views/materialized views in production (Phase 0 fact 3) need `grant select ... to
  service_role` in that same file to satisfy this test — that's straightforward. But if that
  migration also backfills grants for any table that Phase 2 discovers has **no** service_role
  grant possible for a legitimate reason (shouldn't exist per Phase 0's audit — "0 missing" —
  but double check), the escape hatch is there. More likely relevant: `adopt_explicit_grant_defaults`
  (the `alter default privileges ... revoke ...` migration) creates no tables/views/sequences at
  all, so it should pass this test with zero findings and needs no exemption.

### How to build, run and test
- Typecheck: `npx tsc --noEmit` — clean (0 errors) as of this handoff.
- Lint: `npm run lint` — clean (only a pre-existing unrelated Babel file-size note on
  `lib/sportsBingo.ts`, not an error).
- This test alone: `npx vitest run tests/supabase-migration-grants-contract.test.ts` — 14/14
  passed.
- **Verified the guardrail actually guards:** created
  `supabase/migrations/20260915000000_scratch_grants_test.sql` with a `create table` and RLS but
  no `service_role` grant, re-ran the test, watched it fail with
  `table "scratch_grants_test" is created without a "grant ... to service_role"...`, then
  deleted the scratch file and re-ran to confirm clean. Do this again for any future change to
  the parser — don't trust it from the self-tests alone; the self-tests use inline strings, not
  a real file on disk in the scanned directory.
- Full suite: `npm run test` — **246 files / 2630 tests passed, 13 skipped, 4 failed.** The 4
  failures are **pre-existing and unrelated**: all four are in
  `tests/lib.sportsBingo.nfl-star-index*.test.ts` and
  `tests/lib.sportsBingo.nfl-star-index-freshness.test.ts`, a committed-snapshot staleness
  tripwire for NFL star-index data (`isNFLStarIndexSnapshotStale`) that is failing because the
  committed snapshot is stale relative to today's date (2026-09-23), not because of anything in
  this phase. Confirmed by `git status --short` showing only the 4 files this phase touched (no
  overlap with `lib/sportsBingo*` or the star-index snapshot data). **Not investigated further
  and not in scope for Phase 2** — flag it to Andrew separately if it's still failing when you
  pick this up, since it may need its own snapshot refresh unrelated to this plan.
- Build (`npm run build`) was **not run** in this phase — the plan's Phase 1 "Done when" line
  lists `npx tsc --noEmit`, `npm run lint` and `npm run test`, not `npm run build`; Phase 2's
  step 7 is what calls for the build gate. If you want extra confidence going into Phase 2, run
  it, but it wasn't required here and doing so burns the "don't run typecheck concurrently with
  build" constraint for no reason at this stage.

### Open questions for the developer (unchanged from Phase 0, still open)
1. Phase 2 go/no-go — recommended, needs Andrew's explicit OK for the `supabase db push`.
2. Whether to separately review the 26 tables `anon` has `select` on. Not in Phase 2's scope
   either way; only relevant if Andrew wants a follow-up security review.

### Recommended first steps for Phase 2
Model/effort per the plan: **Opus 5.5, high** (security-sensitive, writes grants on
production). Start by re-reading Phase 0 fact 2 (live default ACLs) and fact 3 (67 tables/6
views/1 sequence) in the plan itself — those exact counts are what the "byte-identical after"
diff in step 6 checks against. Then: snapshot current ACLs to the scratchpad (not the repo, per
the plan), generate the two migrations, run this phase's contract test against them before
anything else, get Andrew's sign-off, then push. Do not skip the probe-table check in step 6 —
it's the only thing that actually proves the new default is live rather than just that the
`alter default privileges` statement ran without error.
