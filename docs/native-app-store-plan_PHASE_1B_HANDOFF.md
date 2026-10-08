# Native App Store Plan — Phase 1b Handoff (player self-serve account deletion)

Plan: `docs/native-app-store-plan.md`. Phase 1b done 2026-10-08 by Claude Opus 5.5 (high), in the same
session as Andrew's Phase 1a legal corrections. Next phase: **Phase 2 — native shell spike**
(Opus 5.5, xhigh). Phase 0 (Andrew's accounts and tools) is still in progress and Phase 2 needs Xcode
plus Andrew's iPhone and Android phone.

---

## Summary for Andrew (plain English)

**What changed.**
- **Players can delete their own account.** In the game menu there is a small "Delete my account"
  link (kept away from Sign Out). It opens a page that explains what goes, warns that unused prizes
  (including Square gift cards) are lost, and asks them to type DELETE. Deletion is immediate and
  covers every venue they play at. Their scores leave every leaderboard.
- **Two exceptions you chose:** if they won a reward, the venue's record that the prize was given out
  is kept with their name blanked (otherwise the system would hand the same prize to the next
  player); and the Square gift-card money record is kept for the venue's books, with no link to them.
- **New public page `/delete-account`** (Google Play asks for this link). It explains the steps and
  says people who can't sign in can email support@hightopchallenge.com.
- **Legal pages updated as you asked:** operator "Hightop Challenge LLC", support email
  support@hightopchallenge.com, **no dollar cap on liability** (we disclaim liability to the extent the
  law allows and say we won't pay damages), **New Jersey** law and courts.
- **Privacy page corrected after checking the code** (details in §5 below): location *is* sent to our
  server for the check, but the coordinates are thrown away, never stored; share-to-story photos stay
  on the phone; only Category Blitz answers go to Anthropic, not usernames. Added the "Do Not Track"
  sentence California requires.
- **Bug fixed from Phase 1a:** a signed-in player who tapped Privacy/Terms/Rules/Support in the menu was
  bounced back to their venue home page. They now open normally.

**Is it live?** Yes. The database change was applied to production on 2026-10-08 with your go-ahead and
checked there (including a full test deletion of a throwaway player). The code was committed and
pushed to `main` (Vercel deploys from it) — see §2 for the commit and the deploy check.

**What needs you.**
1. **Look at it on your phone** (I could only check it in a desktop browser at phone size): open the
   menu → "Delete my account" → read the page. Don't press the button on your real account. To test a
   real deletion, create a throwaway account first.
2. **Legal review** before the store submission (unchanged from 1a). New wording to read: the liability
   paragraph in `/terms`, and the whole `/delete-account` page.
3. **support@hightopchallenge.com must actually receive mail** — the pages now send people there.
4. If someone emails asking to be deleted: a developer runs
   `scripts/delete-player-account.cjs` (§6). It shows the account first and only deletes with `--confirm`.

**Your question: is an analytics opt-out legally required?** My reading (not legal advice — yours to
confirm): **no, not today.** US state privacy laws (California's CCPA/CPRA, New Jersey's NJDPA and the
similar laws in other states) require an opt-out for *selling* personal data, *sharing* it for
cross-context behavioral advertising, *targeted advertising* and certain profiling. We do none of those:
analytics is first-party, ads are our own and not targeted across other sites, and there is no
third-party tracker anywhere in the code (checked). Those laws also only apply above size thresholds
(California: ~$26.6M revenue or 100,000+ consumers; New Jersey: 100,000+ NJ consumers, or 25,000+ with
revenue from selling data) that we are very likely below today. What *is* required now: a privacy
policy that says what we collect (done), California's CalOPPA "Do Not Track" disclosure (added), and
honest store privacy labels (Phase 6). Two things to keep an eye on: precise location is "sensitive
data" under NJ/CA law — we use it only to provide the service, ask the phone's permission first and
don't store it, which is the safe position; and if we ever add an outside ad network, ad tracking or
analytics SDK, an opt-out (and on iPhone, Apple's tracking prompt) becomes necessary before launch of
that change.

---

## For the next agent (Phase 2)

You have none of the earlier conversation. Read `CLAUDE.md`, `SYSTEM_CONTEXT.md`,
`docs/native-app-store-plan.md` (§2 decisions, §5 hard rules, Phase 2), this file and
`docs/native-app-store-plan_PHASE_1A_HANDOFF.md`.

### 1. Next phase goal and scope
Phase 2 = native shell **spike** in a separate `native/` folder (Capacitor), proving the eight risky
items in the plan on real devices. Out of scope: anything in this phase's code except where the spike
proves a change is needed; partner account deletion (still "email us"); the Join Merch store; push.
**Account deletion in the app:** item 3/7 of the spike should include opening the menu →
"Delete my account" inside the web view and confirming the typed-confirmation input works with the
native keyboard (do NOT press the button on a real account).

### 2. Starting state
- Branch `main`. Before this session the last commit was `77399f5`. Phase 1a + 1b + Andrew's pending
  `CLAUDE.md` and plan edits were committed together in one commit with this file and pushed to
  `origin/main` (find it with `git log -1 -- docs/native-app-store-plan_PHASE_1B_HANDOFF.md`).
  The deploy check result is recorded in §6.
- **Production database:** migration `supabase/migrations/20261008044524_player_account_deletion.sql`
  applied 2026-10-08 via `supabase db push --linked` (it was the only pending migration; verified with
  `supabase migration list --linked` first). No backup was needed: it adds a function, drops NOT NULL on
  `challenge_cycle_winners.winner_user_id`, swaps that FK to ON DELETE SET NULL, and drops the FK on
  `challenge_campaigns.winner_user_id`. No existing row was modified.
- **Production verification (2026-10-08):** service role `rpc('delete_player_account', random id)` →
  `{"outcome":"not_found"}`; anon key → `42501 permission denied`; PostgREST shows `winner_user_id` no
  longer required. End-to-end: inserted a throwaway `accounts` + `users` row (`zzdeltest…`, hidden venue
  `venue-hightop-test`) plus a notification, called the RPC → `deleted, users_deleted 1,
  account_deleted true`; all three rows gone. No other production data was written.
- No env vars added. No `vercel.json` change.

### 3. Decisions already made (do not re-ask)
- Andrew (plan §2.7): **remove, don't anonymise.** Scores leave leaderboards.
- Andrew (2026-10-08, this phase): **winner rows keep the slot, lose the name** (`winner_user_id` set
  NULL; `award_cycle_winner`'s `count(*)` still counts the row; NULLs are distinct under the unique key).
  **Square ledger (`pos_reward_applications`) kept, unlinked** (its FK was already SET NULL).
- Andrew (2026-10-08): operator "Hightop Challenge LLC" (New Jersey), New Jersey governing law, support
  email `support@hightopchallenge.com`, no US$100 liability cap ("we aren't paying for anything").
- Mine: deletion refuses (503) when `SESSION_SECRET` is unset — the local dev server talks to the
  production DB, so an unverifiable claim must never delete anyone. God Mode accounts CAN delete
  themselves (Apple reviewers may test deletion; recreate the reviewer account if they do — Phase 6).
- Mine: the auth.users row is deleted by TypeScript through `supabaseAdmin.auth.admin.deleteUser`
  (the repo's only pattern), only after `authUserIsUnreferenced` re-checks all seven consumers and only
  if the auth user has **no email**. The SQL never touches `auth.users`.
- Mine: the analytics materialized view `analytics_venue_user_daily_cohorts` is NOT refreshed on
  deletion (exclusive lock + full recompute per deletion). Its rows keep an opaque user id with daily
  counts and no link to anything. Nothing in app code calls `refresh_user_analytics_rollups()`.

### 4. Files created or changed (this session)
Legal corrections (Phase 1a files):
- `lib/legalInfo.ts` — `LEGAL_ENTITY_NAME = "Hightop Challenge LLC"`, new `GOVERNING_LAW_STATE =
  "New Jersey"`, `SUPPORT_EMAIL = "support@hightopchallenge.com"`, new `LEGAL_PAGE_PATHS` (legal links +
  `/delete-account`).
- `app/terms/page.tsx` — no dollar cap; New Jersey law/courts; deletion from the menu.
- `app/privacy/page.tsx` — location, Anthropic, Do Not Track/GPC sentences; deletion section rewritten.
- `app/support/page.tsx` — self-serve deletion + link to `/delete-account`.
- `lib/usernameModerator.ts` — comment only: the username AI check sends usernames to Anthropic; its key
  is unset in Vercel and `/privacy` promises usernames are never sent.

Phase 1b:
- `supabase/migrations/20261008044524_player_account_deletion.sql` — `public.delete_player_account(uuid)
  returns jsonb`, service-role only. Scope: the session's `users` row + its `accounts` row + every other
  `users` row on that account (legacy no-account profile → just that row). Order: lock rows → collect
  auth ids and every username held (incl. `username_change_audit`) → blank winner rows → delete SET NULL
  consumers (`ad_interactions`, `story_share_events` incl. rows tied only by the player's
  user/game session ids, `venue_presence_events`, `username_change_attempts`, `user_passkeys`,
  `webauthn_challenges`) → strip the player's keys from `category_blitz_sessions.cumulative_totals` →
  delete `llm_usage_logs` username-moderation rows for those names → delete `users` (CASCADE does the
  rest) → delete `accounts` → return `unreferenced_auth_ids`. Outcomes `deleted` / `not_found`; any error
  rolls back everything.
- `lib/playerAccountDeletion.ts` — `deletePlayerAccount(userId)`: RPC, then the guarded auth cleanup.
  Errors: `unconfigured | invalid-user-id | rpc-missing | rpc-failed`. Logs `[AccountDelete] …`.
- `app/api/account/delete/route.ts` — `POST`, body `{ userId?, confirm: "DELETE" }`;
  `resolveRequestUserId` (forged → 403, no session → 401), 400 without confirmation, 503 when sessions
  aren't enforced or the RPC is missing, 500 on failure ("Nothing was changed"); on success expires
  `tp_sess`.
- `lib/accountDeletionShared.ts` — `DELETE_CONFIRMATION_WORD`, `PLAYER_DELETE_ACCOUNT_PATH = "/account/delete"`.
- `app/account/delete/page.tsx` + `components/account/DeleteAccountPanel.tsx` — the signed-in screen
  (game host). On success runs `performSignOut("player")` and shows a confirmation in place.
- `app/delete-account/page.tsx` — public explainer (apex, uses `LegalPage`).
- `components/navigation/AccountMenuList.tsx` — "Delete my account" `Link` above the legal row (both
  player drawers share this list); Sign Out stays last below the divider.
- `components/auth/AuthNavigationGuard.tsx` — `isInSessionGameRoute` allows `/account/delete` and
  `LEGAL_PAGE_PATHS`.
- `lib/domainSplit.ts` (`/delete-account` marketing), `proxy.ts` (`LEGAL_PUBLIC_PREFIXES`),
  `app/sitemap.ts`.
- Winner-ledger readers made null-safe: `lib/challengeCampaigns.ts` (`ChallengeCycleWinnerRecord.winnerUserId:
  string | null`, `listChallengeCycleWinners`, `resolveCurrentCycleWinnersForSnapshot`),
  `app/api/nfl-pickem/rewards/route.ts` (skips a nameless winner),
  `components/admin/sections/ChallengesSection.tsx` (shows "Deleted player").
- `scripts/delete-player-account.cjs` — operator tool for emailed requests (dry run by default).
- `scripts/test-player-account-deletion.cjs` + `npm run test:account-deletion-sql` — applies the real
  migration to in-memory PGlite over a synthetic schema with production's FK rules.
- Tests: `tests/api.account.delete.test.ts`, `tests/lib.player-account-deletion.test.ts`,
  `tests/account-deletion-contract.test.ts`.
- Docs: plan status line, §6, §7; `CLAUDE.md` native-app section (two bullets).

### 5. Facts and traps discovered
- **Privacy facts verified from code (2026-10-08):**
  - Coordinates: `components/venue/VenuePresenceBoundary.tsx` and `JoinFlow` POST raw lat/lng/accuracy
    to `/api/venue-presence/heartbeat` and `/api/join/profile`; the server computes distance and keeps
    only `distance_meters`, `accuracy_meters` (`venue_presence_sessions`/`_events`). No table has a
    player coordinate column. `user_geographic_data` ZIP/city/state is the **venue's** (JoinFlow passes
    `selectedVenue.zipCode` etc.), not the player's.
  - Story share: `lib/socialShare/` has no network upload; the image goes to `navigator.share` or a
    download. `story_share_events` stores image width/height, rank, points.
  - Anthropic: `lib/categoryBlitz.ts` sends category + answer text (fit judging and a content-safety
    pass) with `ANTHROPIC_API_KEY_CATEGORY_BLITZ_ANSWER_GRADER` (set in Vercel). `lib/usernameModerator.ts`
    would send usernames, but `ANTHROPIC_USERNAME_MODERATOR_API_KEY` is **not set in Vercel** (production
    or preview), so production skips it. 20 old `llm_usage_logs` rows with `feature='username_moderation'`
    exist (probably from local dev, which uses `.env.local`); deletion removes a player's rows.
  - No third-party analytics, tag manager or ad SDK anywhere (`package.json`, `app/layout.tsx`, no
    `next/script`). `setAnalyticsConsent` exists in `lib/analytics.ts` but nothing calls it.
- **FK drift is real:** `20260625210000` changed `user_passkeys.user_id` / `webauthn_challenges.user_id`
  to SET NULL; a one-pass read of the CREATE TABLEs misses it. The contract test replays all migrations.
- **`AuthNavigationGuard` bounces signed-in players off any path not in `isInSessionGameRoute`** to their
  venue home. Any new player-visible page needs an entry there. (This is what broke the 1a legal links.)
- **`challenge_campaigns.winner_user_id` is a "resolved" marker**, not "the winner"; when it nulled,
  `isLeaderboardCampaignClosed` would re-finalize a closed leaderboard reward for someone else. Hence the
  FK drop. In production no campaign currently carries a marker.
- **Reward sweeps are idempotent only through `challenge_cycle_winners`** (`lib/challengeCampaigns.ts`
  `finalizeClosedRecurringCycles` "existingWinner → break"; `lib/liveTriviaWinnerRewards.ts`;
  `lib/nflPickEmWinnerRewards.ts`). Never delete winner rows.
- Production shape (2026-10-08): 189 `users`, 209 `accounts`, 10 `users` without an account, 92 accounts
  without `auth_id`, 4 `venue_owners`, no auth id shared between a player and a partner, 11 winner rows,
  9 coupons, 1 POS ledger row.
- Tooling: this shell's `grep` is ugrep and behaves oddly with `--include`; use `rg`. `.env.local` names
  can't be listed (`cut` is blocked); env is loaded with `node --env-file=.env.local`. PGlite lives at
  `tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite` (ignored folder; reinstall with
  `npm install --prefix tmp/bingo-phase4-pg --no-save --package-lock=false @electric-sql/pglite@0.5.8`).
- A route file may not export anything but handlers (Next build error) — shared constants live in
  `lib/accountDeletionShared.ts`.

### 6. Build, run, test — and what was verified
Run from the repo root; don't run typecheck concurrently with build.
- `npx tsc --noEmit` — clean. `npm run lint` — clean.
- `npm run test` — 310 files passed / 1 skipped; 3,539 tests passed / 13 skipped / 0 failed.
- `npm run test:god-mode-join` 34/34; `npm run test:pwa-contract` 20/20.
- `npm run test:account-deletion-sql` — passes (grants, not_found, rollback on a forced failure,
  whole-account delete from either profile, winner slot kept blank, campaign marker kept, coupon gone and
  ledger kept unlinked, SET NULL consumers removed incl. passkeys, cascades, Blitz totals, moderation log,
  bystander untouched, idempotent, legacy profile, partner-shared auth id protected).
- `npm run build` — succeeds; lists `/account/delete`, `/api/account/delete`, `/delete-account`.
- Browser (headless Chromium, 375 px, `next start`, API calls blocked so nothing reached production):
  `/account/delete` and all five legal pages stay put for a signed-in player, no horizontal scroll; the
  button stays disabled until DELETE is typed (case-insensitive); a 500 shows "Nothing was changed";
  `/account/delete` without cookies → 307 to `/`.
- Production: see §2.
- Operator script: `node --env-file=.env.local --conditions react-server --import tsx
  scripts/delete-player-account.cjs --username <name> [--confirm]` (dry run verified with a
  non-existent name). It refuses an account with no venue profile ("ask a developer").
- **Deploy check (2026-10-08, commit `4849397`):** https://hightopchallenge.com/privacy, /terms, /rules, /support and /delete-account all return 200; /terms shows "Hightop Challenge LLC" and "New Jersey" and no US$100 cap.
- **Not verified:** a real phone (iOS Safari / Android Chrome); the success path in a browser against a
  real account (only proven at the RPC level in production and in unit tests); the `auth.admin.deleteUser`
  branch against production (the throwaway had no auth id); live FK rules beyond those exercised by the
  throwaway (accounts, users, notifications) — any blocking rule would roll back and show "Nothing was
  changed", never half-delete.

### 7. Open questions for Andrew
1. Legal review of `/terms` liability wording, the `/delete-account` page and the privacy changes (before
   Phase 6). The 1a list (ages, 30-day support wording now removed, winner list on request) still stands.
2. Confirm the support mailbox exists and is monitored.
3. `/support` says "I forgot my PIN — email us from the address on file for your venue", but players have
   no email on file. Worth rewording (1a copy; I left it).

### 8. Recommended first steps for Phase 2 (Opus 5.5, xhigh)
1. Confirm Phase 0 status with Andrew (Xcode installed, Android phone bought, app id reconfirmed).
2. Follow the plan's Phase 2 setup exactly (`native/` folder, `.vercelignore`), then the eight checks.
3. While in the web view, also open the menu → Delete my account (don't submit) and the legal pages,
   and record whether they display correctly.
