# Native App Store Plan — Phase 5.3 Handoff (the welcome ask + new wording)

**Date:** 2026-10-23. **Phase:** 5.3 of `docs/native-app-store-plan.md` (Opus 5.5, high). Follows
`…_PHASE_5_1_HANDOFF.md` (push server/website/Android) and `…_PHASE_5_2_HANDOFF.md` (iPhone).
**State: BUILT and verified (tests, build, browser with a faked app bridge). NOT committed, NOT deployed.**
Website code only — no app rebuild, no database change, no new request.

---

## Summary for Andrew (plain English)

**What changed.**
- Right after a player's first sign-in in the app, Venue Home now shows **one full screen of our own**: "Want to
  know the moment you win?" with three lines (prizes, results, Live Trivia starting at your bar) and **Turn on** /
  **Not now**. Apple's (or Android's) own question appears only after **Turn on**. So "Not now" doesn't waste
  Apple's one-time question; the small Venue Home card can still ask later.
- The Venue Home card is now the reminder, with new wording: **"Want to know when you win?"** It no longer
  appears on the same launch as the welcome.
- **Popup ads wait for the welcome.** On the launch that shows the welcome, no popup ad appears at all; ads come
  back on the next launch. Ready for the home-page popup ads you're planning.
- The wording only promises notifications we really send today. "When this bar schedules games or adds prizes"
  is held back for Phase 5.4, which sends those (Apple rejects promises the app doesn't keep). A test enforces it.
- The website is unchanged.

**Is it live?** No. It's built and tested here; it goes live when you deploy (no new app build needed — the app
loads the website).

**Cost.** None. The welcome makes no request; the ad check reads a setting on the phone, never the server.

**What needs you.**
1. Say when to commit and deploy.
2. After the deploy: section **L** of `docs/native-app-device-checklist.md` (items 51–55). To see the welcome
   again on a phone that already had it, delete and reinstall the app.
3. The APNs key from 5.2 is still needed for iPhone delivery (until then "Turn on" on iPhone may show "Couldn't
   save that").

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md` (the "Phone push" bullet), plan Phase 5 (5.3–5.5), the 5.1
and 5.2 handoffs, and this file.

### 1. Next phase: 5.4 — automatic "new at your bar" pushes (Opus 5.5, high)
Goal (plan Phase 5, Andrew 2026-10-23): when a partner saves a new game or prize, push to that bar's players who
leave a NEW 4th switch on, "News from your bars" (`lib/pushCategories.ts`; Apple 4.5.4: its own explicit consent).
Cap **5 automatic pushes per bar per day** — one named constant. One bounded audience read + one batched FCM send
per event; no new cron. **5.4 also ships the ask wording that promises "when this bar schedules games and adds
prizes"**: add it to `PUSH_COPY.welcomeBenefits`/`askBody` in the same change, and loosen the 5.3 contract test
(`push: the first ask is our own screen` → "promises only the pushes the server sends") deliberately, not by
deleting it. Decide (ask Andrew) whether the new switch defaults ON for players who tap Turn on after 5.4 ships
(the ask then states it) and OFF for players already opted in.
Out of scope: 5.5 partner-written messages; anything in the app shell.

### 2. Starting state
- Branch `main`, last commit `940324a`. **5.3 is uncommitted.** Also uncommitted and NOT this phase's (leave
  them alone): `docs/native-app-store-plan.md` already had an edit to the 5.4 cap line before this session (kept;
  5.3 added only the status line and the "BUILT" marker), POS doc/comment edits (`docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`), `docs/reel-video-assets-plan.md`, the squares
  fixture, Andrew's moved `design-system/project/public/info/*.png`, local tool config (`.codex/`, `.mcp.json`,
  `.vscode/mcp.json`, `.firebaserc`, `firebase.json`), and `native/ios/App/App/config 2.xml` (iCloud duplicate).
- 5.3 files to commit: `lib/nativePush.ts`, `lib/pushCategories.ts`, `components/push/PushWelcomeScreen.tsx` (new),
  `components/ui/PopupAds.tsx`, `components/venue/VenueHubClient.tsx`, `tests/lib.push.test.ts`,
  `tests/push-notifications-contract.test.ts`, `tests/native-back-review-fixes.test.ts`, `CLAUDE.md`,
  `docs/native-app-device-checklist.md`, `docs/native-app-store-plan.md` (status line + 5.3 marker — the file also
  holds the pre-existing 5.4 edit), this handoff.
- No database, Vercel env, Firebase or native change.

### 3. Decisions (don't re-ask)
- **Where:** Venue Home (`VenueHubClient`), shown once the home has loaded (`ready={contentReady}`) — that is the
  screen right after sign-in. Rendered like `CategoryBlitzOnboardingOverlay` (fixed, inside the hub), z-[2300].
- **Once per phone**, not per player: localStorage `htc:push-welcome-seen-at`, written the moment it shows (a kill
  mid-screen doesn't re-show it); kept across Sign Out. The next player on the phone is asked by the card (after
  their first points), as in 5.1.
- **When it shows:** app with the push plugin, push not already on (`htc:push-opt-in`), this phone never asked
  (no `htc:push-welcome-seen-at` AND no 5.1 card "Not now" `htc:push-ask-dismissed-at`), and the phone's permission
  is `prompt` or `granted` (granted = Android ≤ 12; our opt-in is still needed). Never when blocked in Settings.
- **Turn on** = the existing `enablePush()` (the OS prompt is only ever triggered there). Denied → closes (the card
  won't ask; the menu explains Settings). Failure → "Couldn't save that. Try again." and the screen stays.
  **Not now** / Android Back → closes and does NOT snooze the card.
- **Card (`PushPermissionCard`)** is now the reminder: `shouldAskForPush` also needs the first ask done and the
  welcome NOT shown this visit.
- **Ads:** "visit" = one app launch = the web view's sessionStorage (`htc:push-welcome-this-visit`). `PopupAds`'s
  `showPopup` awaits `pushWelcomeHoldsPopupAds()` BEFORE the ad request: true while the welcome is still due on
  this phone (even on the sign-in page — welcome first) and for the rest of the visit it showed in. The answer is
  kept per page load so the round-end retry loop (every 300 ms) never re-reads the phone. On the website it is
  `false` at once (no storage read). Only popup ads are held; the bottom adhesion ad is under the full screen anyway.
- **Words** (all in `PUSH_COPY`): welcome title "Want to know the moment you win?"; benefits "When you win a prize,
  and before it expires" / "When your Bingo, Pick 'Em and prediction results are in" / "When Live Trivia is about
  to start at your bar"; footnote "You can change this any time in the menu."; card "Want to know when you win?" /
  "Turn on notifications for your prizes, your results and Live Trivia starting here."

### 4. Files
- `lib/nativePush.ts` — new `shouldShowPushWelcome`, `markPushWelcomeShown`, `pushWelcomeHoldsPopupAds`,
  `resetPushWelcomeForTests`; `shouldAskForPush` gained the two welcome conditions; header comment explains it.
- `lib/pushCategories.ts` — `PUSH_COPY` welcome words + new card words; comment: promise only what is sent.
- `components/push/PushWelcomeScreen.tsx` — the screen (logo, title, three lucide-icon lines, Turn on, Not now,
  footnote); scroll lock `push-welcome`; `useNativeBackHandler("overlay", open && !busy ? close : null)`.
- `components/venue/VenueHubClient.tsx` — `<PushWelcomeScreen ready={contentReady} />` before the AccountDrawer.
- `components/ui/PopupAds.tsx` — the hold, first thing inside `showPopup`'s `try`.
- Tests: `tests/lib.push.test.ts` (+5 welcome cases; the two older card tests now seed `WELCOME_DONE`),
  `tests/push-notifications-contract.test.ts` (+4: mounted only on Venue Home; no OS prompt outside the tap; ads
  check before the ad request; no 5.4 promise in the words), `tests/native-back-review-fixes.test.ts` (list entry).
- Docs: `CLAUDE.md` push bullet, checklist section L (and item 43 reworded), plan status line.

### 5. Facts and traps
- A bare `button` with `tp-clean-button` gets the global 1 px border back even with `!border-0`; the welcome's
  "Not now" therefore has no `tp-clean-button` (as 5.1's switch rows).
- Browser testing the app side: a Playwright init script that defines `window.Capacitor` (`isNativePlatform`,
  `isPluginAvailable(n)` true for `FirebaseMessaging`, `nativePromise(plugin, method)` answering
  `checkPermissions` → `{receive:"prompt"}`) plus the UA token `HightopChallengeApp/1.0.0 (ios)`, cookies from
  `scripts/print-test-auth-cookies.cjs` (give them `expires`), and `page.route("**/api/push/devices")` mocked —
  never let a fake token register against production. Test player `bktrehearsal1`
  (`72144672-7506-428c-9347-421c1c3c5411`) at `venue-hightop-test`. A new page in the same context = a new visit
  (fresh sessionStorage, same localStorage).
- Andrew's `next dev` may hold :3000; this session used `next start -p 3100` from the repo after `npm run build`
  and stopped only its own PID.

### 6. Build, run, verify (2026-10-23)
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` → 445 files passed / 1 skipped, **5,496 passed /
  13 skipped / 0 failed**; `npm run test:pwa-contract` 20/20; `npm run build` OK.
- Browser (production build on :3100, 390×844, fake iPhone app bridge, test player above):
  - **Not now run:** welcome shown; only `checkPermissions` native calls (no OS prompt); 0 popup-ad requests that
    visit; card hidden. Next visit: no welcome, card "Want to know when you win?" shown, popup-ad request resumed.
  - **Turn on run:** `requestPermissions` → `getToken` → (mocked) register → screen closed, `htc:push-opt-in` = 1;
    0 popup-ad requests that visit; next visit no welcome, no card, ads resumed.
  - **Website run (no bridge, normal UA):** no welcome, no native calls, no storage keys, popup ads as before.
  - Screenshots in the session scratchpad only (not kept).
- **Not verified:** a real phone (section L), real OS prompt timing after Turn on on iPhone (needs the APNs key for
  the registration to succeed), and a live popup ad (none configured to show for the test venue's popups beyond
  the request — the request count is the check).

### 7. Open questions for Andrew
- Commit/deploy timing for 5.3.
- APNs key upload + where the `.p8` is stored (from 5.2, still open).
- For 5.4: should "News from your bars" be on by default for players who tap Turn on after 5.4 (stated on the ask),
  and off for players who opted in before?

### 8. Recommended first steps for 5.4
1. `git status`; confirm 5.3 is committed/deployed (ask Andrew).
2. Read `lib/pushCategories.ts`, `lib/push/outbox.ts`, `lib/push/gameReminders.ts`, `lib/push/devices.ts` and the
   5.1 migration `20261023105750_push_notifications.sql` (a 4th `notify_*` column = a NEW migration file with an
   explicit `service_role` grant review; never edit the old one).
3. Find the partner save paths for games (owner schedule routes) and prizes (`/api/owner/rewards`, `lib/rewards.ts`)
   and hook one bounded send after a successful save. Opus 5.5, high.
