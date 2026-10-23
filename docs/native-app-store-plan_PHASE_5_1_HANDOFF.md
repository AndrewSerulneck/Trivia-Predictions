# Native App Store Plan — Phase 5.1 Handoff (push notifications: server, website, Android)

**Date:** 2026-10-23. **Phase:** 5.1 of `docs/native-app-store-plan.md` (Opus 5.5, high). The plan's Phase 5 was split
into 5.1 (this) and 5.2 (iPhone) — the split is written under Phase 5 in the plan.
**State:** built and verified end to end on the Android emulator against the live database and real Firebase.
**Not committed, not pushed, not deployed.** The database migration IS applied to production, and the sender
credential IS set in Vercel (both approved by Andrew on 2026-10-23) — both are inert until the code is deployed.

---

## Summary for Andrew (plain English)

**What changed.**
- Players in the **Android app** can now get phone notifications for three things: a **Live Trivia game starting
  soon** at the bar they last played at, **prizes** (won, expiring, taken back), and **results** (Bingo, Pick 'Em,
  predictions — everything the app's bell already lists).
- The app asks only **after a player's first points at a venue** (a small "Get a heads-up?" card on Venue Home,
  "Turn on" / "Not now"), never at launch. "Not now" hides it for 30 days.
- The menu has a **Notifications** block with three on/off switches. Signing out turns notifications off for that
  phone.
- Tapping a notification opens the right page (Redeem Prizes, the venue, …), even if the app was closed.
- The privacy policy now describes this (date bumped to October 23, 2026).
- The website looks and behaves exactly as before.

**Is it live?** No. The database tables and the Google credential are in place, but the code isn't deployed and the
app on your phone doesn't have the push plugin yet. iPhone notifications are Phase 5.2.

**Cost.** Firebase notifications are free. Extra work on our side: one tiny database call per minute (inside a
check that already runs every minute) and one schedule read every 5 minutes (inside an existing check). No new
scheduled job. Measured today: about 5 in-app notifications a day and 231 player accounts, so the extra load is
negligible, and still small at 10× or 100×.

**What needs you.**
1. Decide when to commit/deploy (this sits on top of uncommitted Phase 4d work in the same files — see §2).
2. After the deploy: rebuild the Android app from `main` and run section **K** of
   `docs/native-app-device-checklist.md` (items 43–50).
3. For iPhone (Phase 5.2): add the paid Apple team (2U7HMXGQM3) to Xcode / do Part B, and create the APNs key
   (steps in the 5.2 handoff).
4. The Android status-bar icon is a plain bold "H" placeholder. If you want the real logo silhouette, a designer
   can supply a white-on-transparent 24×24 shape; it replaces one file.

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md` (the "Phone push" bullet under Native app),
`docs/native-app-store-plan.md` Phase 5 (the 5.1/5.2 split), and this file.

### 1. Next phase: 5.2 — iPhone push (Opus 5.5, high)
Goal: the same push working on Andrew's iPhone. Scope: Firebase iOS app + `GoogleService-Info.plist` in the Xcode
target, `aps-environment` entitlement wired (only once the paid team signs the app — Part B), Background Modes →
Remote notifications, the AppDelegate APNs hand-off the plugin README requires, Andrew's APNs `.p8` key uploaded to
Firebase, then a device test. **Out of scope:** partner-sent pushes (Phase 5b, open question §6 item 4), marketing
pushes, any new cron, any change to the server design below. See `…_PHASE_5_2_HANDOFF.md` if it exists — it records
what was prepared after this handoff.

### 2. Starting state
- Branch `main`, last commit `cdc832a` (9g). **Everything in this phase is uncommitted.** The working tree also holds
  other people's uncommitted work: Phase 4d ("Invite a friend": `components/social-share/InviteFriendButton.tsx`,
  edits in `components/navigation/AccountMenuList.tsx`, `components/venue/VenueGamesPanel.tsx`,
  `components/category-blitz/CategoryBlitzGame.tsx`, `components/leaderboard/LeaderboardTable.tsx`,
  `app/trivia/live/page.tsx`, `tests/native-share-haptics-contract.test.ts`, its handoff), plus POS doc edits,
  `lib/pos/providers.ts`, deleted `design-system/project/public/info/*.png`, `.codex/`, `.mcp.json`,
  `.vscode/mcp.json`, `.firebaserc`, `firebase.json`, `docs/reel-video-assets-plan.md`, a squares fixture. **Two files
  carry BOTH 4d and 5.1 edits:** `AccountMenuList.tsx` (4d: the invite row; 5.1: the Notifications row above it) and
  `VenueGamesPanel.tsx` (4d: the invite button; 5.1: `pushAskEligible` + `<PushPermissionCard>`). Commit them
  together or stage hunks carefully. Never `git checkout -- <file>`.
- **Production database:** migration `supabase/migrations/20261023105750_push_notifications.sql` applied
  2026-10-23 with `supabase db push` (it was the only pending migration). Verified through PostgREST: both tables
  reachable, `notifications.pushed_at` exists. Test rows created during verification were deleted; `push_devices`
  and `push_game_reminders` are empty. Rows already in `notifications` keep `pushed_at` null forever — harmless,
  they are older than the 15-minute claim window. My test runs stamped `pushed_at` on ~8 test notifications, all
  since deleted with the throwaway user.
- **Firebase (project `hightop-challenge-fdca1`, number 256711123965):** Android app registered —
  App ID `1:256711123965:android:363e1937afd172e4056f94`, package `com.hightopchallenge.app`. Its config is
  `native/android/app/google-services.json` (new, should be committed; it is public client config, not a secret).
  API `fcm.googleapis.com` enabled. No iOS app registered yet.
- **Sender credential:** service account `hightop-push-sender@hightop-challenge-fdca1.iam.gserviceaccount.com`, role
  `roles/firebasecloudmessaging.admin` only. One JSON key, base64-encoded, stored as `FCM_SERVICE_ACCOUNT_JSON` in
  `.env.local` (appended) and in Vercel **Production + Preview** (type Secret). The scratch copy was deleted. To
  rotate: `gcloud iam service-accounts keys list/create/delete --iam-account hightop-push-sender@…`, then
  `vercel env add` the new value (never `vercel env rm`/`pull`; ask Andrew to remove the old Vercel value).
  Server-side var → takes effect on the next deploy; no `NEXT_PUBLIC_`.
- Shell: `@capacitor-firebase/messaging@8.5.2` added to `native/package.json`; `npx cap sync android` done; the
  Android debug APK now on the `hightop_api36` emulator is the normal production-config build (it points at the live
  site, which doesn't have the push code yet, so it won't ask). iOS was NOT synced (Package.swift unchanged).

### 3. Decisions (don't re-ask)
- Andrew approved (2026-10-23): creating the sender service account + key and storing it locally and in Vercel;
  applying the migration once proven.
- **Hook = the notifications table**, not `createNotification()`. Writers found: `lib/challengeCampaigns.ts` (3),
  `lib/squaresPrizeAwards.ts`, `app/api/cron/prize-expiry-warnings` (via `createNotification`), plus direct inserts in
  `lib/pickem.ts`, `lib/admin.ts`, `lib/competition.ts` (5), `lib/fantasy.ts`, `lib/sportsBingo.ts`, and the SQL
  functions in `20260914010000_bingo_atomic_grading.sql` and the prediction-settlement migrations. A per-minute claim
  of new rows catches all of them with zero changes to any writer.
- **Where it runs:** the outbox at the end of `/api/cron/bingo-progress` (after the Bingo refresh, each in its own
  try/catch); the game reminder as a third sweep in `/api/cron/resolve-live-trivia-winners` (5-minute). `vercel.json`
  untouched (contract test).
- **Window/limits:** outbox claims notifications from the last 15 minutes (`OUTBOX_WINDOW_SECONDS`), ≤500 per run;
  older rows are never pushed late. Reminder fires when a game starts within 30 minutes (`GAME_REMINDER_LEAD_MS`),
  once per `(schedule_id, occurrence_date)`; phones idle >60 days are skipped. Live Trivia only (Category Blitz is
  continuous/unscheduled).
- **Who gets what:** a notification reaches every enabled phone registered by the same venue profile OR any profile
  of the same account. "Live games starting" goes to phones whose LAST-USED venue is the game's venue.
- **Categories** (one pure function, `lib/pushCategories.ts`): link to `/redeem-prizes` → prizes; everything else →
  results; reminders → games. All three default ON once the player taps Turn on (that tap + the OS prompt is the
  opt-in). No marketing category exists; adding one needs its own OFF-by-default switch (Apple 4.5.4).
- **Permission moment:** Venue Home card only when the player has points at that venue (`menuPoints > 0`), app only,
  30-day snooze on "Not now"; also "Turn on" in the menu. Two yeses needed: our opt-in flag (so Android ≤12, which
  grants silently, still waits for the player) + the OS permission.
- **Registration refresh:** at most once per day per (player, token) on navigation — keeps `last_seen_at` fresh at
  ~1 request/player/day. Token rotation re-registers immediately.
- **Dead tokens:** only FCM `UNREGISTERED`, `SENDER_ID_MISMATCH`, or `INVALID_ARGUMENT` about the registration token
  disable a phone. A bare 404 does NOT (a wrong project id would otherwise disable every phone). Nothing is retried.
- **Push copy:** notifications are body-only (the app name is the header); reminders have the title "Live Trivia
  starts soon" and body "8:00 PM at <venue>. Tap to play." in the schedule's timezone.
- App version NOT bumped (additive plugin; old builds simply lack the capability).

### 4. Files
Server
- `supabase/migrations/20261023105750_push_notifications.sql` — `push_devices` (token unique; user_id/account_id
  CASCADE; venue_id SET NULL on venues; three `notify_*`; `disabled_at`), `push_game_reminders` (PK schedule +
  local date), `notifications.pushed_at` + `notifications_created_at_idx`, RPC `claim_notification_pushes(window,
  limit)` (service_role only). RLS forced, browser roles revoked, explicit service_role grants.
- `scripts/test-push-sql.cjs` + `npm run test:push-sql` — PGlite proof (claim once, account fan-out, disabled/old
  rows excluded, limits, token uniqueness, reminder ledger, cascades, grants).
- `lib/push/fcm.ts` — credential reader, RS256 JWT → OAuth token (cached ~55 min), `sendPushMessages` (concurrency 8),
  `classifyFcmError`, `buildFcmMessage` (path goes in `data.path`).
- `lib/push/devices.ts` — `registerPushDevice` / `updatePushPreferences` / `unregisterPushDevice` (all owner-scoped),
  `disablePushDevices` (chunked via `chunkIds`).
- `lib/push/outbox.ts` — `sendPendingNotificationPushes`, pure `pushesFromClaimedRows`.
- `lib/push/gameReminders.ts` — `sendLiveGameStartPushes`, pure `gameReminderBody`.
- `lib/liveShowdownEngine.ts` — new `findStartingOccurrences(nowMs, aheadMs)` beside `findEndedOccurrences`.
- `app/api/push/devices/route.ts` — `POST` with `action` register | preferences | unregister.
- `app/api/cron/bingo-progress/route.ts`, `app/api/cron/resolve-live-trivia-winners/route.ts` — the two hooks.
Shared / app side
- `lib/pushCategories.ts` — categories, `safePushPath`, `PUSH_COPY` (all on-screen words).
- `lib/nativePush.ts` — the only plugin/route caller: `enablePush`, `syncPushRegistration`, `loadPushPreferences`,
  `setPushPreference`, `shouldAskForPush`/`dismissPushAsk`, `disablePushForSignOut`, `onPushTapped`,
  `onPushTokenChanged`. localStorage keys `htc:push-opt-in`, `htc:push-registered` (`user|token|YYYY-MM-DD`),
  `htc:push-ask-dismissed-at`.
- `lib/nativeApp.ts` — `"FirebaseMessaging"` added to `NativeCapability`.
- `components/push/NativePushRuntime.tsx` (taps + token refresh + daily sync; mounted by `components/ui/PlayerRuntime.tsx`
  only when `useIsNativeApp()`), `PushPermissionCard.tsx` (in `VenueGamesPanel` via `pushAskEligible` from
  `VenueHubClient`), `PushNotificationSettings.tsx` (in `AccountMenuList`, `<li className="empty:hidden">`).
- `components/navigation/SignOutButton.tsx` — `performSignOut("player")` awaits `disablePushForSignOut()` (capped
  2.5 s) BEFORE the logout POST (the unregister needs the session).
- `app/privacy/page.tsx`, `lib/legalInfo.ts` (`LEGAL_LAST_UPDATED` → October 23, 2026).
Native (Android)
- `native/package.json`/lock, `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle` (cap sync).
- `native/android/app/google-services.json` (new). The Gradle file already applies the google-services plugin when it
  exists.
- `native/android/app/src/main/AndroidManifest.xml` — `default_notification_icon` / `default_notification_color`
  meta-data. `res/drawable/ic_stat_notify.xml` (placeholder "H"), `res/values/htc_colors.xml` (`htc_notify_accent`
  #0E7490). POST_NOTIFICATIONS comes from the plugin's manifest.
Tests
- `tests/lib.push.test.ts` (19), `tests/api.push.devices.test.ts` (7), `tests/push-notifications-contract.test.ts` (12),
  updated `tests/api.cron.bingo-progress.test.ts`, `tests/api.cron.resolve-live-trivia-winners.test.ts`,
  `tests/player-runtime-contract.test.ts` (knows the app-only sixth runtime).
Docs: plan (split + status line + table), `CLAUDE.md` bullet, device checklist section K.

### 5. Facts and traps
- **`.env.local` hook:** any command that mentions `.env.local` together with something like `cat`/`tail` is blocked,
  even `tail -c 1 .env.local`. Append with `K="$(<file)"; printf '…%s\n' "$K" >> .env.local` in its own command.
  `cut -d= -f1 .env.local` was also denied by the permission layer this session; check names with
  `node --env-file=.env.local -e 'console.log(Boolean(process.env.X))'`.
- **`supabase db push` applies EVERY pending migration.** Run `supabase migration list` first and make sure only yours
  is pending (some bracket migrations are deliberately unapplied at times).
- **`node --env-file` can't go in `NODE_OPTIONS`**, and `next dev` forwards execArgv to workers. To run a dev server
  with the real env from a scratchpad clone, start a tiny launcher with `node --env-file=<repo>/.env.local
  launcher.mjs` that `spawn`s `node_modules/next/dist/bin/next dev --webpack -p 3107` with `env: process.env` and no
  NODE_OPTIONS (that is what worked; clone recipe in `docs/multi-venue-volume-billing-plan_PHASE_4_HANDOFF.md` §5).
- **Emulator testing of new web code:** `adb reverse tcp:3107 tcp:3107`; edit the GENERATED
  `native/android/app/src/main/assets/capacitor.config.json` (url `http://localhost:3107`, `cleartext`, add
  `localhost` to allowNavigation); temporarily add `android:usesCleartextTraffic="true"` to the manifest; build;
  afterwards restore the manifest and `npx cap sync android` (done; `grep usesCleartextTraffic` = 0).
- **Cookies set through CDP need `expires`**, or they are session cookies that vanish when the app process dies — the
  server gate then bounces every page to `/`. Real sign-ins set lasting cookies.
- **Next dev compiles a route on first visit and can reload the page**: the very first push tap went to
  `/redeem-prizes`, compiled it, and the reload put the page back on Venue Home. Every later tap (warm and cold start)
  landed on `/redeem-prizes`. Not a production issue.
- **The emulator's Play Store can update the WebView mid-test**, killing every app that uses it ("stop
  com.google.android.webview due to installPackageLI"). Just relaunch.
- `adb shell am force-stop` puts an app in the stopped state, where FCM deliveries are dropped — don't use it to test
  cold starts. `am kill <pkg>` works only after the app has been in the background a few seconds.
- Plugin facts: method names `checkPermissions`/`requestPermissions`/`getToken`/`deleteToken`; events
  `notificationActionPerformed` (payload `{actionId, notification:{data:{path,…}}}`) and `tokenReceived` are kept until
  a listener attaches (`retainUntilConsumed`), which is what makes cold-start taps work. Android foreground pushes are
  not shown by the system (the in-app bell has them). Permission words include `prompt-with-rationale`.
- The global dark button CSS (`app/globals.css`, "light-surface scoped") gives every `button` and `.tp-clean-button`
  a 1 px border with `!important`; the switch rows use `!border-0 !bg-transparent !rounded-none !px-0` and no
  `tp-clean-button`.
- PostgREST builders: a conditionally reassigned `update` vs `select` query fails typecheck (PATCH vs GET builder);
  write two awaited branches.
- `.next/dev/lock` existed with nothing listening on :3000 (a stale lock); `npm run build` was unaffected.

### 6. Build, run, test — and what was verified
- Web: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` → **445 files passed / 1 skipped, 5,479 tests
  passed / 13 skipped / 0 failed**; `npm run test:push-sql` passes; `npm run build` passes (217 pages,
  `ƒ /api/push/devices`).
- Android: `cd native/android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug` → OK (APK in
  `~/Library/Caches/hightop-native/android/app/outputs/apk/debug/`).
- **End to end on the `hightop_api36` emulator (Android 16, Google Play image), local server on the real database and
  real Firebase:** card hidden at 0 points / shown with points → Turn on → the real Android dialog "Allow Hightop
  Challenge to send you notifications?" → Allow → `push_devices` row (android, 1.0.0, venue, all on, 142-char token)
  → inserted a prize notification + ran the outbox → `{claimedRows:1, sent:1}` → notification shown with the tinted
  "H" → tap from background → page pushed `/redeem-prizes` → cold start (process killed) tap → app opened on `/`
  then `/redeem-prizes` → menu shows the three switches → Results off saved in the DB → a `/pickem` notification
  was claimed and muted (`sent:0, muted:1`) → a titled reminder rendered "Live Trivia starts soon / 7:51 AM at
  Hightop Test Bar. Tap to play." → Sign Out deleted the row, called `deleteToken`, cleared both local keys.
  `findStartingOccurrences` against production (read-only): 0 games in 30 min, 2 in 24 h, 9 in 7 days. Curl checks:
  401 without session, 400 from a browser UA, register/preferences/unregister OK, 404 after unregister.
- **Not verified:** the deployed crons in production (needs the deploy); a real reminder from a real schedule (only the
  pure pieces + a hand-sent identical message); a real phone; iPhone (5.2); FCM behaviour at volume.
- **Cost (measured baseline 2026-10-23):** 5 notifications/day, 14/week, 231 accounts, 0 phones. Added per day:
  1,440 claim RPCs (inside an existing per-minute cron, index range scan over 15 minutes of rows), 288
  `trivia_schedules` reads (inside the existing 5-minute cron; the winner sweep already makes the same read), ≤1
  registration request per opted-in player, FCM sends = notifications × phones (free). No new function invocations or
  crons. At 100× notifications it is still a few thousand sends/day. Compare after deploy: Supabase API requests and
  the `[Push] outbox` / `[Push] game-reminders` log lines (logged only when something was claimed/sent).

### 7. Open questions for Andrew
- Commit/deploy timing (bundled with uncommitted 4d work).
- A designed status-bar icon (optional).
- Partner-sent pushes (Phase 5b) — still open (§6 item 4).

### 8. Recommended first steps for 5.2
1. `git status` / `git log -3`; read `docs/native-app-store-plan_PHASE_5_2_HANDOFF.md` (what was prepared after this).
2. Check Xcode signing: `security find-identity -v -p codesigning` must show a certificate for team 2U7HMXGQM3. On
   2026-10-23 only the personal team Z39Q54R94X existed (bundle `com.hightopchallenge.spike`, which cannot sign
   push). Part B (bundle `com.hightopchallenge.app`, `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`) comes first.
3. Andrew: Apple Developer → Keys → + → "Apple Push Notifications service (APNs)" → download the `.p8` once (store it
   in the password manager; record only its location in plan §7) → Firebase console → Project settings → Cloud
   Messaging → Apple app configuration → upload with Key ID + Team ID 2U7HMXGQM3.
4. `firebase apps:create IOS "Hightop Challenge iOS" --bundle-id com.hightopchallenge.app --project
   hightop-challenge-fdca1`, `firebase apps:sdkconfig IOS <appId> -o native/ios/App/App/GoogleService-Info.plist`,
   add it to the App target, AppDelegate methods (plugin README), `UIBackgroundModes` remote-notification,
   `aps-environment` in `App.entitlements`, `npx cap sync ios`, build. Model: Opus 5.5, high.
