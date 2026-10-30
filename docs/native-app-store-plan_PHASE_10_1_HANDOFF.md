# Native app store plan — Phase 10.1 handoff (2026-10-26)

## For Andrew (plain English)

**What changed:** partner-message reports now count **people**, not profiles. One player with profiles at three
bars used to be able to report a message three times and pause a bar alone; now their second and third reports
are ignored ("already reported"). And when you **Un-pause** a bar in Admin → Venues → Partner messages, it stays
un-paused: the old reports are marked "reviewed", so only reports made after your un-pause count toward the next
automatic pause. The admin panel's "Reports" number now shows exactly that count (people since the last un-pause).

**Is it live?** No. Nothing is committed, pushed, deployed, or applied to the database. Partner messages are
still not deployed and stay behind `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED`.

**What needs you:**
1. **OK to apply the database change** (`supabase db push`). A dry run on 2026-10-26 shows it would apply only
   `20261026173304_partner_message_report_rules.sql`. The tables it touches had 0 rows on 2026-10-26.
2. Then 10.2 (partner-message app fixes), 10.3, 10.4 — see the plan.

**Known limit (accepted in the plan):** someone can still make a second account to report twice. The 3-report
pause is a safety valve; your pause / un-pause is the real control.

---

## For the next agent (Phase 10.2)

### 1. Next phase goal and scope
Phase 10.2 in `docs/native-app-store-plan.md` (Phase 10 section, "10.2 — Partner messages: false failures, the
word filter, the spinner, the admin panel"): F3 (POST `/api/owner/messages` says "Try again" after a successful
send when only the status read failed), F4 (word filter joins all words → "mother for" blocked), F5 (sheet spins
forever with `venue: null`), F6 (admin `PartnerMessagesPanel` mounts while the flag is off). Model: Sonnet 5.5,
medium. Website only, no migration. Out of scope: anything in 10.3/10.4, any change to the 10.1 SQL.

### 2. Starting state
- Branch `main`, last commit `7aacf153` (unchanged). Everything below is **uncommitted** in the working tree, on
  top of a large amount of other uncommitted work (Phase 5.5, Phase 7, etc.). Preserve all of it; never
  `git checkout -- <file>`.
- Migration `20261026173304_partner_message_report_rules.sql` is **NOT applied**. `supabase db push --dry-run`
  (2026-10-26) → `"migrations":["20261026173304_partner_message_report_rules.sql"]` only. (It also prints
  "Skipping migration Warnings..." — a stray file named `Warnings` in `supabase/migrations/`; it is not ours,
  harmless, left alone.)
- No data changed. Production counts of `push_venue_messages`, `push_venue_message_reports`,
  `push_venue_message_pauses` were 0 on 2026-10-26 (per the plan). No backup needed; no undo log.
- Migration `20261023145024_push_venue_messages.sql` (5.5) IS applied in production (plan, verified 2026-10-26).

### 3. Decisions already made
- Reporter identity = `coalesce(users.account_id::text, users.id::text)`, in SQL only, one helper
  (`venue_message_reporter`). Plan 10.1 step 1.
- Un-pause stamps `reports_reviewed_at` on ALL the bar's messages; only `reported_at > reports_reviewed_at` counts.
- The pause check runs only on a call that inserted a report; `already_reported` returns early.
- A missing un-pause RPC fails closed (503), never a plain-delete fallback.
- Admin **pause** is unchanged (TS upsert, reason `admin`).
- **One addition beyond the plan's letter (step 7):** the admin panel's report count comes from a new RPC
  `venue_message_report_counts(uuid[])`, so the counting rule exists only in SQL (the plan forbids a second copy
  of the identity rule). Consequence: before the migration is applied, the admin **list** also answers 503
  (`[Push] report-counts-rpc-missing`), not only un-pause. Accepted because 5.5 code isn't deployed and the order
  is migration → deploy.

### 4. Files created / changed
- **New** `supabase/migrations/20261026173304_partner_message_report_rules.sql`:
  - `alter table push_venue_messages add column reports_reviewed_at timestamptz` (no new table → no new grant;
    `tests/supabase-migration-grants-contract.test.ts` passes).
  - `venue_message_reporter(uuid) → text` — the identity rule.
  - `venue_message_report_count(uuid) → integer` — distinct people since review; drives the pause.
  - `venue_message_report_counts(uuid[]) → table(message_id, reports)` — the admin panel's one call.
  - `create or replace` `read_venue_message` (same signature; `reported` = same person reported) and
    `report_venue_message` (same signature/return; same advisory lock key `'push_venue_messages:' || venue_id`).
  - `unpause_venue_messages(text) → boolean` (true = a pause existed), same lock, delete + stamp in one transaction.
  - All new functions: `security definer`, `set search_path = public`, revoked from public/anon/authenticated,
    execute to `service_role` only.
- `lib/push/venueMessages.ts`: `setVenueMessagesPaused(id, false)` → `rpc("unpause_venue_messages")`; missing
  function (via `isMissingFunction`) → `console.error("[Push] unpause-rpc-missing", { venueId })` +
  `VenueMessagesUnavailableError`. `listVenueMessagesForAdmin` reads counts via `venue_message_report_counts`
  (no longer selects `push_venue_message_reports`). `MIGRATION_MISSING_MESSAGE` constant. Header comment updated.
  Still the only caller of every partner-message RPC and the only writer of the pauses table (contract test).
- `app/api/admin/route.ts`: the `partner-messages` GET and POST branches catch `VenueMessagesUnavailableError`
  → `503 { ok: false, error }`; other errors still fall to the outer handler.
- `components/admin/sections/PartnerMessagesPanel.tsx`: header comment + explainer copy ("Reports on one message
  from 3 different players pause that venue … after that, only new reports count."). No logic change. (This file
  is untracked — 5.5 work.)
- `scripts/test-push-sql.cjs`: new migration in `MIGRATIONS`; 10.1 cases (see §6); grants loop covers the four new
  functions.
- `tests/partner-messages.test.ts`: un-pause uses the RPC and never `from()`; missing RPC fails closed with the log;
  pause unchanged; admin list uses the counts RPC; contract list extended with the two new RPC names; admin route
  503 static check; migration content check.

### 5. Facts and traps
- `PGlite` must be resolvable from the script's directory; to run a copy of `test-push-sql.cjs` from elsewhere set
  `PUSH_PGLITE_MODULE=$PWD/node_modules/@electric-sql/pglite`. I used that to confirm the new assertions **fail**
  against the old 5.5 rules (first failure: "the same person sees it as reported").
- `npm run lint` reports 309 errors, **all** in `tmp/group-games-phase-4/` (git-ignored release copy from other
  work). Real code lints clean. Lint the changed files directly if in doubt.
- Old reporters stay `already_reported` after an un-pause (their pre-review report is the one on file) — by design
  (plan's test "an earlier reporter reports again after the un-pause → already_reported, not paused").

### 6. Build / test — what was verified
All run 2026-10-26, sequentially:
- `npm run test:push-sql` → "push SQL: all checks passed". Covers: two profiles of one account → second is
  `already_reported`, count stays 1; legacy (no account) profile counts as its own person; three people → paused;
  `already_reported` on a paused bar adds nothing; un-pause returns true then false, deletes the pause, stamps every
  v1 message, leaves v2 untouched, count → 0; all four earlier reporters → `already_reported`, not paused; new
  person #1 → not paused, earlier reporter again → not paused, #2 → not paused, #3 → paused; grants service_role
  only.
- `npx vitest run tests/partner-messages.test.ts` → 24 passed.
- `npx tsc --noEmit` → clean. `npm run lint` → clean outside `tmp/`. `npm run test` → 450 files passed, 1 skipped;
  5,568 tests passed, 13 skipped, 0 failed. `npm run build` → succeeded.
- `supabase db push --dry-run` → only the new migration.
- **Unverified:** the migration on real Postgres/Supabase (only PGlite); the admin panel in a browser.

### 7. Open questions / waiting on Andrew
- Approval to run `supabase db push` (apply only `20261026173304`). After applying: `npm run test` again (the
  `auth.users` FK guard runs there), and optionally confirm via PostgREST that `unpause_venue_messages` exists.
- `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` value in Vercel Production/Preview must be confirmed before the first deploy
  that includes 5.5 (plan, Phase 10 intro).

### 8. Recommended first steps for 10.2
1. Read the 10.2 section of the plan and `app/api/owner/messages/route.ts`, `lib/partnerMessageRules.ts`
   (`checkPartnerMessage`, `BLOCKED_INSIDE`), `components/owner/messages/PartnerMessagesSheet.tsx`,
   `components/admin/sections/VenuesSection.tsx`.
2. Keep `tests/partner-messages.test.ts` green (it now also pins the 10.1 behaviour).
3. Model / effort per plan: Sonnet 5.5, medium.
