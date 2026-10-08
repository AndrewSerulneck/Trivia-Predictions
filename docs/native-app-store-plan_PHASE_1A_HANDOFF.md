# Native App Store Plan — Phase 1a Handoff (legal + support pages)

Plan: `docs/native-app-store-plan.md`. Phase 1a done 2026-10-08 by Claude Sonnet 5.5.
Next phase to run: **Phase 1b — player self-serve account deletion** (Opus 5.5, high).
(Phase 0, Andrew's accounts and tools, runs in parallel and is not blocking 1b.)

---

## Summary for Andrew (plain English)

**What changed.** The website now has four public pages that Apple and Google require before they will
list an app: **/privacy** (Privacy Policy), **/terms** (Terms of Use), **/rules** (Official Contest
Rules, with the "Apple is not a sponsor" sentence Apple requires and "no purchase necessary"), and
**/support** (contact + how to delete your account). Small links to them were added to the bottom of the
`/info` home page, the player menu drawer and the Partner Dashboard menu drawer. They are also in the
sitemap.

**Is it live?** No. Nothing is committed, pushed or deployed. The work is in your working tree next to
your own earlier uncommitted edits (`CLAUDE.md`, `docs/native-app-store-plan.md`). When you deploy,
the pages appear at `https://hightopchallenge.com/privacy` etc. Nothing else on the site changes.

**What I wrote from the code, and what I could not verify.** I read the code to list what we collect
(username, hashed PIN, passkey, venue activity, ZIP/city/state, IP address, ad views, partner email,
Stripe, Square/Clover tokens) and who we send data to (Supabase, Vercel, Stripe, Google Maps/Places,
Resend, Anthropic). The drafts are my best reading, not legal advice.

**What needs you (Andrew):**
1. **Legal review before the Phase 6 submission** (your New York bar plan). Wording I chose that you
   should look at is listed in "Open questions" below: ages (13 to play, 18 to win, 21 for alcohol),
   New York governing law, a US$100 liability cap, the 30-day deletion promise.
2. **Support email.** I used `partnerships@hightopchallenge.com` because it is the only real mailbox I
   could confirm exists. If you create `support@hightopchallenge.com`, change one line
   (`SUPPORT_EMAIL` in `lib/legalInfo.ts`).
3. **Legal business name.** The pages say "Hightop Challenge" as the operator. When Phase 0 settles
   the registered name, change `LEGAL_ENTITY_NAME` in `lib/legalInfo.ts`.
4. Deploy when ready (the Google Play listing needs the privacy URL to be live).

**What's left in the plan:** Phase 1b (real in-app "Delete my account"), then the native app phases.
Until 1b ships, the Support page tells people to email us to delete their account.

---

## For the next agent (Phase 1b)

You have none of the earlier conversation. Everything you need is here and in the repo. Read first:
`CLAUDE.md` (especially "`auth.users` is SHARED WITH PLAYERS — standing prohibition"),
`SYSTEM_CONTEXT.md`, `docs/native-app-store-plan.md` (§2 decisions, Phase 1b), and
`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`.

### 1. Next phase goal and scope — Phase 1b
Goal: a player can delete their own account from inside the app and website, plus a public
`/delete-account` page (Google Play requires a web URL for it). Scope and traps are in the plan's
Phase 1b section; do not drop any of them. **Out of scope:** partner (`venue_owners`) deletion (stays
"email us"), push notifications, any native/Capacitor work, changing `lib/supabaseAdmin.ts`,
touching `vercel.json`.

### 2. Starting state
- Branch `main`. Last commit `77399f5` ("Square dev testing: Phase 2/3 handoffs, runbook §6; test Square on
  the live site"). **Phase 1a is uncommitted.** `git status` should show: modified `CLAUDE.md` (Andrew's,
  pre-existing, not mine), `app/info/page.tsx`, `app/sitemap.ts`, `components/navigation/AccountMenuList.tsx`,
  `components/owner/OwnerAppBar.tsx`, `lib/domainSplit.ts`, `proxy.ts`, `tests/lib.domainSplit.test.ts`,
  `tests/proxy.behavior.test.ts`, `docs/native-app-store-plan.md`; new `app/privacy/`, `app/terms/`,
  `app/rules/`, `app/support/`, `components/legal/LegalPage.tsx`, `lib/legalInfo.ts`,
  `tests/legal-pages-contract.test.ts`, this file. Do not revert anyone's changes. Ask Andrew before
  committing; he commits/pushes (the "Commit or push only when asked" rule applies).
- No data was touched. No migration written, none applied, no env var added, no Supabase call made.

### 3. Decisions already made (do not re-ask)
All of plan §2 stands. Directly relevant to 1b: account deletion **removes** the player's data (scores
leave leaderboards; no "Deleted player" anonymising). Launch is US-only. Andrew does the legal review.
Phase 1a choices I made without asking (flagged as open questions below): see §7.

### 4. Files created or changed (all paths from repo root)
- `lib/legalInfo.ts` — `LEGAL_ENTITY_NAME`, `SUPPORT_EMAIL`, `LEGAL_LAST_UPDATED`, `LEGAL_LINKS`
  (Privacy Policy, Terms of Use, Official Rules, Support). The one place those facts live.
- `components/legal/LegalPage.tsx` — `LegalPage` (PageShell, no user status, the single Back button via
  `backTo.href = marketingHref("/info")`), `LegalSection`, `LegalList`. Server component.
- `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/rules/page.tsx`, `app/support/page.tsx` — static copy
  plus metadata/canonical.
- `lib/domainSplit.ts` — `MARKETING_PAGE_PREFIXES` gained `/privacy /terms /rules /support`, so with the
  split ON `play.` 308-redirects them to the apex.
- `proxy.ts` — `LEGAL_PUBLIC_PREFIXES` makes them public in `isPublicPath` (they are extensionless, so
  the auth gate would otherwise bounce visitors without cookies). The gate's default behaviour is unchanged.
- `app/sitemap.ts` — four new entries.
- Links: `app/info/page.tsx` footer (`<nav aria-label="Legal">`), `components/navigation/AccountMenuList.tsx`
  (small link row above the divider; Sign Out is still last), `components/owner/OwnerAppBar.tsx` (link row
  above the Sign Out divider; menu rows and order unchanged so `tests/owner-menu-contract.test.ts` passes).
- Tests: `tests/legal-pages-contract.test.ts` (new: page per link, sitemap, host split behaviour, the
  Apple non-sponsor sentence and "NO PURCHASE NECESSARY" text, link locations); extended
  `tests/lib.domainSplit.test.ts` and `tests/proxy.behavior.test.ts`.

**Phase 1b must update:** `app/support/page.tsx` ("Delete your account" section currently says email
us) and `app/privacy/page.tsx` ("Keeping and deleting your data") to describe the real in-app flow and
link `/delete-account`; add `/delete-account` to `MARKETING_PAGE_PREFIXES` (`lib/domainSplit.ts`),
`LEGAL_PUBLIC_PREFIXES` (`proxy.ts`), `app/sitemap.ts`, and `tests/legal-pages-contract.test.ts`
(its "page per link" test iterates `LEGAL_LINKS`; decide whether the new page belongs in that list).
Bump `LEGAL_LAST_UPDATED`.

### 5. Facts and traps discovered
- **Extensionless paths are gated by `proxy.ts`** — any new public page needs an `isPublicPath` entry.
- **Account data model (what the privacy page claims — verify it before relying on it for deletion):**
  `accounts` (`auth_id`, `username`, `username_normalized`, `pin_salt`, `pin_hash`; `app/api/join/account/route.ts`);
  `users` (per-venue profile; `auth_id`); `user_sessions` (session id, IP, user agent;
  `app/api/analytics/events/route.ts`); `user_geographic_data` (zip, city, state, region, country, data source —
  written by the `geo_sync` analytics event); ad interaction rows; story-share analytics events;
  `notifications`; challenge/prize tables (`challenge_cycle_winners`, `pos_reward_applications`).
  This list is from reading only two routes — **do the full FK map yourself**, starting from
  `tests/lib.auth-users-fk-guard.test.ts`, then query information_schema (see memory file
  `feedback_query_production_instead_of_asking.md`: use `node --env-file=.env.local`, read-only).
- **Claims in the privacy page I could not fully verify** (check and correct the page if wrong):
  (a) "the location check happens on your device and we do not store exact coordinates" — I saw no
  player-coordinate writes, only venue coordinates, but did not audit `lib/geolocation.ts` /
  `components/venue/VenuePresenceBoundary.tsx`; (b) "photos stay on your phone" for story share —
  `lib/socialShare/` has no `fetch(` and the only storage uploads are admin ad/challenge images;
  (c) Anthropic receives usernames (`lib/usernameModerator.ts`, Haiku) and Category Blitz answers
  (`validateAnswersWithLLM`) — stated; (d) ads are first-party only (from the plan, §3);
  (e) there is **no consent UI**: `lib/analytics.ts` has `setAnalyticsConsent` but no component calls it,
  so the page does not describe an analytics opt-out. Nothing promises one.
- Retention of `user_sessions` / analytics is unspecified in code; the policy says "while your account is
  active". If 1b deletes `user_sessions` by user id, that matches.
- `SUPPORT_EMAIL` currently equals the existing partnerships mailbox; `/info`'s JSON-LD uses it too.
- The `/info` footer text is `text-xs` (floored to 12px by `tailwind.config.ts`); new drawer links use
  `text-footnote`. The text-size-floor test passes.

### 6. How to build, run, test; what was verified
Commands (repo root; don't run typecheck concurrently with build because `.next/types` regenerates):
`npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`. Phase 1a results 2026-10-08:
tsc clean, lint clean, `npm run test` 307 files passed / 1 skipped, 3,514 tests passed / 13 skipped / 0 failed,
`npm run build` succeeded and lists `/privacy /rules /support /terms` as static pages.
**Not verified:** no browser or device look at the pages, drawer link rows or footer layout (I did not run
the dev server); no check that the pages render correctly at phone width. Do a quick `npm run dev` visual
pass or ask Andrew to look. Cross-host behaviour with the split live (`play.` → apex redirect) is covered by
unit tests only.
For 1b, the plan also requires `npm run test:god-mode-join` and the FK-guard test.

### 7. Open questions for Andrew (copy of the wording needing his legal eye)
1. Ages: 13+ to play (Terms), 18+ and US resident to win (Rules), 21+ for alcohol prizes. Is 18 right
   for all venues?
2. Terms: New York governing law, US$100 liability cap. There is no arbitration clause or class-action waiver (deliberately omitted).
3. Support promise: "reply usually within one business day"; deletion "normally within 30 days"
   (becomes automatic after 1b — update the copy).
4. Rules say winners are listed on request via the support email — confirm he wants that.
5. Support email choice and registered business name (see summary).
6. Privacy: California / other state rights are covered generically; the plan asked to flag
   state-driven sections. NY/Florida contest registration or bonding rules may apply to prize contests
   above certain values — Andrew to assess.
All pages are drafts for his review before the Phase 6 submission; none of this blocks 1b.

### 8. Recommended first steps for Phase 1b (use Opus 5.5, high effort per the plan)
1. Read `CLAUDE.md` `auth.users` section and `tests/lib.auth-users-fk-guard.test.ts`.
2. Build the complete table map (every table keyed to `accounts.id`, `users.id`, `auth_id`, `user_id`
   columns) with a read-only information_schema query; save it in the 1b handoff.
3. Ask Andrew the two plan questions BEFORE writing the SQL: winner-quota rows in current cycles
   (`challenge_cycle_winners`) and the Square gift-card ledger (`pos_reward_applications`).
4. Write the single all-or-nothing Postgres function in a NEW migration (`supabase migration new`),
   with `service_role` grants per the checklist. **Do not run `supabase db push` without Andrew's go-ahead.**
5. Route bound with `resolveRequestUserId()`; UI in the account drawer near but not adjacent to Sign Out
   (the new legal link row sits just above Sign Out — keep the delete control away from it); typed
   confirmation; `/delete-account` page; update the Support/Privacy copy as listed in §4.
6. Run all the checks, write `docs/native-app-store-plan_PHASE_1B_HANDOFF.md`, update the plan's status line.
