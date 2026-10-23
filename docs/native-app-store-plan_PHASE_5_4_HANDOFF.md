# Native App Store Plan — Phase 5.4 Handoff ("News from your bars")

**Date:** 2026-10-23. **Phase:** 5.4 of `docs/native-app-store-plan.md` (Opus 5.5, high). Follows
`…_PHASE_5_3_HANDOFF.md`. **State: BUILT, verified (tests, SQL proof, build, browser with a faked app bridge),
migration applied to production, committed and pushed to `main` (Vercel deploys it).** Website + database only —
no app rebuild.

---

## Summary for Andrew (plain English)

**What changed.**
- When a partner schedules a **new game** or creates a **new prize** on the Partner Dashboard, the players of that
  bar who have the app get one notification: "New game at Pacific Street — Live Trivia every Thursday at 8:00 PM.
  Tap to see it." or "New prize at Pacific Street — Win a $25 gift card. Tap to see how." Tapping opens that bar's
  Venue Home.
- Players control it with a new 4th switch in the menu, **News from your bars**. It is on for anyone who taps Turn
  on, because every Turn on screen now says so first (the welcome has a 4th line, "When your bars schedule new games
  and add prizes"; the Venue Home card and the menu's Turn on say it too). Your phone has it on, as you asked.
- **At most 5 a day per bar** (your number). Editing or deleting an existing game or prize never sends one, and
  each game or prize is announced only once.
- The partner's Save is not slowed down: the notification goes out just after the dashboard has its answer.
- Also fixed (from 5.3): after Turn on on the welcome, the menu kept saying "Off on this phone" until the app was
  reopened. It now shows the switches straight away.

**Is it live?** Yes, once Vercel finishes deploying the push (no app rebuild needed). The database part was applied
to production first (2026-10-23 14:2x UTC).

**Cost.** One small database call per new game or prize (a few per bar per week), plus one message to Google per
phone. Google's push service is free. No new scheduled job. Nothing runs when nobody creates anything.

**What needs you.**
1. Phone check: section **M** of `docs/native-app-device-checklist.md` (items 56–61), plus section L (5.3).
2. Your APNs key: see "APNs key" below — you do not need to send it to anyone.

**APNs key.** It goes in exactly one place: Firebase console → project `hightop-challenge-fdca1` → Project settings →
Cloud Messaging → Apple app configuration → "Hightop Challenge iOS" → APNs Authentication Key → Upload (the `.p8`
file, its Key ID, Team ID `2U7HMXGQM3`). Keep the `.p8` itself in your password manager. **Never paste it into a chat,
email or the project** — it is a secret and nothing in the code needs it. Your iPhone registered for push at 13:08 UTC
on 2026-10-23 and the plan records your first iPhone push test, so it is very likely already uploaded; that console
page shows it if so.

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md` (the "Phone push" bullet), plan Phase 5 (5.3–5.5), the 5.1,
5.2 and 5.3 handoffs, and this file.

### 1. Next phase: 5.5 — partner-written messages (Opus 5.5, high)
Goal (plan Phase 5): a compose box on the Partner Dashboard (website only, never in the app) for a short message
(≈150 characters) to that bar's players with **News from your bars** on. Cap **2 per bar per day** — its own named
constant, separate from `VENUE_NEWS_DAILY_CAP`. Needs review/abuse rules (words filter, report, admin kill switch).
Reuse 5.4's pieces: the `news` switch, the audience rule and the claim-under-lock pattern of
`claim_venue_news_push` (a new kind or a sibling RPC in a NEW migration — never edit `20261023141109`).
Out of scope: anything in the app shell; changing 5.4's cap.

### 2. Starting state
- Branch `main`. 5.3 = commit `6372be0` (pushed). 5.4 = the commit after it (pushed); check `git log`.
- Migration `20261023141109_push_venue_news.sql` **applied to production** (`supabase db push`, 2026-10-23) BEFORE the
  code was pushed — required, because `lib/push/devices.ts` now selects `notify_news` on every registration.
  Verified after: both `push_devices` rows have `notify_news = true`; `push_venue_news` is readable; the RPC answers
  (a probe for a non-existent venue returned `unknown_venue` and wrote nothing).
- Still uncommitted and NOT this phase's (leave alone): POS doc/comment edits (`docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`), `docs/reel-video-assets-plan.md`, the squares
  fixture `tests/fixtures/squares/nfl-live-capture-1392309.json`, Andrew's moved `design-system/project/public/info/*.png`,
  local tool config (`.codex/`, `.mcp.json`, `.vscode/mcp.json`, `.firebaserc`, `firebase.json`), and
  `native/ios/App/App/config 2.xml` (iCloud duplicate).
- `push_devices` in production: two iOS rows — Andrew's phone (user `7e2ad2e8-…`, `venue-pacific-street`) and one
  for test player `bktrehearsal1` (`72144672-…`, `venue-hightop-test`, created 13:42 UTC, origin not confirmed; if
  its token is fake, FCM answers UNREGISTERED on the first send and it is disabled automatically).

### 3. Decisions (don't re-ask)
- **Default ON** for the new switch, for everyone (Andrew, 2026-10-23: he is the only player who opted in before; keep
  his on). Consent = every Turn on surface states it first: welcome line `PUSH_COPY.welcomeBenefits.news`, card
  `askBody`, menu `settingsOff`. Contract test pins all three.
- **Cap 5 per bar per local day** (`VENUE_NEWS_DAILY_CAP`, `venues.timezone`; bad timezone → New York). Counts
  announcements that had an audience; a refused (capped) one records nothing.
- **Once per game/prize ever** (ledger PK `(kind, source_id)`); only the two partner CREATE routes send. Edits,
  deletes, admin-created games/prizes and the legacy `/api/owner/competitions` POST do not.
- **Audience** = phones (not disabled, `notify_news`, seen in the last 60 days) whose venue profile, or any profile of
  the same account, has a `users` row at the bar. Not limited to the phone's last-used venue (that is the Live Trivia
  reminder's rule) — "your bars" means every bar you joined.
- **Words** (in `lib/push/venueNews.ts`, pure `newGamePush` / `newPrizePush`): "New game at {bar}" / "{Live Trivia |
  Category Blitz} {Thu, Oct 29 | every Tuesday and Thursday | every day} at 8:00 PM. Tap to see it."; "New prize at
  {bar}" / "Win {a $25 gift card}. Tap to see how." (or "Prizes for the top 3. Tap to see how to win."). No bar name →
  "at your bar". Tap opens `/venue/{id}`. A one-off game already over sends nothing.
- **After the reply:** `announceAfterResponse` uses Next's `after()`; outside a request it runs in the background.
  Never throws (logs `[Push] venue-news-failed`).

### 4. Files
- `supabase/migrations/20261023141109_push_venue_news.sql` — `push_devices.notify_news`, table `push_venue_news`
  (RLS forced, service_role only), RPC `claim_venue_news_push(venue, kind, source, cap, idle_days)` (advisory lock per
  bar; outcomes `claimed` | `duplicate` | `capped` | `unknown_venue` | `no_audience`).
- `lib/push/venueNews.ts` (new) — the constants, words, `announceNewGame`, `announceNewPrize`, `announceAfterResponse`.
- `app/api/owner/schedule/route.ts`, `app/api/owner/rewards/route.ts` — one line each after the successful create.
- `lib/pushCategories.ts` — 4th category `news`, its label and the consent words.
- `lib/push/devices.ts` — `notify_news` in the column map, defaults and select.
- `components/push/PushWelcomeScreen.tsx` — 4th benefit line (`CalendarPlus` icon).
- `lib/nativePush.ts` + `components/push/PushNotificationSettings.tsx` — the 5.3 menu fix: `enablePush` fires
  `PUSH_ENABLED_EVENT` (`htc:push-enabled`, detail = the switches); the settings listen and show "on".
- Tests: `tests/lib.push.test.ts` (+5 venue-news cases, +event assertion), `tests/push-notifications-contract.test.ts`
  (the 5.3 "never promise new games/prizes" rule loosened deliberately to "only while both routes send it"; new
  describe for 5.4: one RPC caller, one cap constant, only the two routes after the create, `after`, consent words),
  `scripts/test-push-sql.cjs` (audience, once-only, cap, next-day reset, idle phones, unknown venue, grants).
- Docs: `CLAUDE.md` push bullet, checklist section M (+ items 51–52 reworded), plan status line + 5.4 marker.

### 5. Facts and traps
- The outcome is `unknown_venue`, not `no_venue`: `tests/self-serve-signup-contract.test.ts` forbids the literals
  `"no_venue"` / `"no_session"` outside `lib/ownerAuthCodes.ts`.
- iCloud duplicates `.next/types/routes.d 2.ts` / `validator 2.ts` break `tsc` (duplicate identifier); delete them
  (generated files).
- Playwright in the scratchpad must match the cached browsers (`~/Library/Caches/ms-playwright` has chromium-1228 →
  `playwright@1.61`).
- The account drawer (and so `PushNotificationSettings`) is mounted on page load, so anything that changes push state
  elsewhere must tell it (`PUSH_ENABLED_EVENT`).
- `supabase migration list` skips a stray file `supabase/migrations/Warnings` (not a migration; not ours; harmless).

### 6. Build, run, verify (2026-10-23)
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` → 445 files / **5,506 passed, 13 skipped, 0 failed**;
  `npm run test:pwa-contract` 20/20; `npm run test:push-sql` passes; `npm run build` OK.
- Browser (production build, `next start -p 3100`, 390×844): website path — Venue Home normal, no welcome, no push
  calls. App path (fake iPhone bridge, `/api/push/devices` mocked, test player `bktrehearsal1` at `venue-hightop-test`)
  — welcome shows four lines; Turn on → `requestPermissions` → `getToken` → register; the menu immediately shows four
  switches; tapping News from your bars sent `{ action: "preferences", preferences: { news: false } }`.
- **Not verified:** a real push from a partner save (needs Andrew's phone + a real create; checklist M), real FCM
  delivery to iPhone for this kind, the `after()` behaviour on Vercel (standard Next 16 API; check the
  `[Push] venue-news` log line in Vercel logs after the first real create).

### 7. Open questions for Andrew
- None blocking. Optional: should admin-created games/prizes (admin panel) also announce? Today they don't.

### 8. Recommended first steps for 5.5
1. `git status`; read `lib/push/venueNews.ts` and the 5.4 migration.
2. Find the Partner Dashboard sheet pattern (`OwnerSheet`, `lib/useOwnerSheet.ts`, `DiscardGuard`) for the compose box.
3. Write the new migration (ledger kind or table for messages, its own cap, report/kill-switch columns) with the
   `service_role` grant, extend `scripts/test-push-sql.cjs`. Opus 5.5, high.
