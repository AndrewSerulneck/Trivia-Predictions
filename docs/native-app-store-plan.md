# Native App Store Plan — Hightop Challenge on the App Store and Google Play

**Apple creative assets prepared locally, 2026-10-26:** header `assets/app-store/apple-product-page-header-v1.png`
(3840×1646) and search results `assets/app-store/apple-search-results-v1.png` (3840×2560), opaque RGB PNGs.
Existing logo and one-line “It's game time.” design retained. Not uploaded or submitted; Phase 6 remains in progress.
Asset preparation/verification handoff: `docs/native-app-store-plan_PHASE_6_HANDOFF.md`, opening Oct 26 addendum.

**Current status — 2026-10-25, latest checkpoint:** Phase 6 remains in progress. Google Production build
`1.0.0` / code **2** is **In review** (Andrew's report). The iOS `1.0.0` / build **1** archive is ready,
and Andrew has now created App Store Connect record **6826962606**. The first upload failed before that
record existed; the retry **succeeded at 2026-10-26T01:29:30Z** (Oct 25 in New York). Apple reported
the uploaded package processing, and Andrew confirmed **Processing** in TestFlight. No App Review submission
was performed. **APNs key upload is
confirmed by Andrew**; real iPhone notification delivery is still unverified. Latest submission handoff:
`docs/native-app-store-plan_PHASE_6_HANDOFF.md`. Phase 8's runbook is now prepared at
`docs/native-app-release-runbook.md`; its end-to-end update rehearsal is **not done**. Partial Phase 8
handoff: `docs/native-app-store-plan_PHASE_8_HANDOFF.md`.

**Phase 7 prepared locally (2026-10-25):** official store badges, player download section, sign-in pointer,
Android dismissal and Apple Smart App Banner support built behind default-off
`NEXT_PUBLIC_APP_STORE_LINKS_ENABLED` plus two valid listing URLs. Both URL constants remain empty.
Old PWA promotion removed; existing browser/standalone play retained. **Uncommitted, not deployed or enabled**;
activation and actual Safari checks await live listings. Handoff: `docs/native-app-store-plan_PHASE_7_HANDOFF.md`.

| Remaining work | Current state / dependency |
|---|---|
| Apple record and TestFlight | Record 6826962606 created; build 1 uploaded successfully. Andrew confirms Processing. Once ready, add an internal group/tester and install through TestFlight. |
| Device checks | iPhone push (section K), remaining sharing/news checks (J item 33, L/M), Play-installed Android passkeys (O), and iPad checks. Record actual results in the device checklist. |
| Session persistence | 7+ day observation still open; the Oct 25 passkey check cannot establish it. |
| Apple listing and submission | iPhone+iPad screenshots, actual privacy/rating forms, US-only free availability, Andrew's legal review and final Submit. |
| Google approval | Await review result, verify public listing and install the Play-distributed build; respond to any actual reviewer requests. |
| Phase 7 | Implementation built locally behind an off flag; activate after both listings are live and Safari/device checks pass. |
| Phase 8 | Release runbook prepared; perform the native update rehearsal after initial launch. |
| Phase 10 (code-review fixes, added 2026-10-26) | **10.1 built 2026-10-26, uncommitted; migration `20261026173304` APPLIED 2026-10-26 (Andrew OK) — handoff `docs/native-app-store-plan_PHASE_10_1_HANDOFF.md`. 10.2 built 2026-10-26, uncommitted — handoff `docs/native-app-store-plan_PHASE_10_2_HANDOFF.md`.** **10.3 built 2026-10-26, uncommitted — handoff `docs/native-app-store-plan_PHASE_10_3_HANDOFF.md`.** **10.4 done 2026-10-26 (iCloud duplicate `config 2.xml` deleted after a byte-identical check; no other `* 2.*` files in `native/`) — handoff `docs/native-app-store-plan_PHASE_10_4_HANDOFF.md`. Phase 10 complete.** 10.1 + 10.2 before partner messages (5.5) are deployed or switched on; 10.3 before Phase 7's flag goes on; 10.4 before the next iOS build. See Phase 10 in §4. |

Phase 4c's iPhone Face ID and Safari use are verified; Part B's signing switch is complete. Android
certificate association/verifier are live at `7aacf153cd8707b6d3f3644051a96614703ecaba`; physical/Play-install
ceremonies are not inferred from those server checks. Reviewer account/demo venue and iPad decisions are
resolved (§2 items 13–15). Phase 5.5 partner-written messages are separate unpublished work, not a launch
prerequisite: migration `20261023145024` is already in remote history; **do not reapply it**. Its current
production feature flag has not been independently checked. The optional rating prompt is not a launch blocker.

**Earlier status checkpoints below are retained as history. The table above supersedes conflicting
“next”, “not uploaded”, “APNs pending” and “migration not applied” statements.**

**Phase 6: Google Play Production is IN REVIEW (Andrew reported 2026-10-25); Apple submission remains unverified.** Reviewer access is live. `appreview` was created through
the live account API with Andrew's supplied PIN (kept out of repository files), granted God Mode, and verified signing
in and joining without location. Existing **Hightop Test Bar**, `venue-hightop-test`, **1010 Pacific St, Brooklyn,
NY 11238, USA**, is now visible. **Keep iPhone + iPad support** (Andrew's answer); prepare iPad screenshots too.
Updated submission pack: `docs/native-app-store-submission-pack.md`; current handoff:
`docs/native-app-store-plan_PHASE_6_HANDOFF.md`. These setup/docs changes are uncommitted. Andrew manually uploaded
Google build 2 and submitted for review; no agent store upload, submission or application deployment was performed.
**Correction to the older Phase 6 handoff:** the paid-team
signing switch was completed in Phase 5.2 on 2026-10-23. **Phase 4c update, 2026-10-25:** iPhone passkey creation,
Face ID sign-in and Safari sign-in with that same passkey are now verified. Andrew approved migration
`20261025150000_native_discoverable_passkeys.sql`; it is applied and fixes the account-less authentication challenge
that previously failed before Apple's prompt. Android association and selected verifier are now **LIVE** at
`7aacf153cd8707b6d3f3644051a96614703ecaba`; READY `dpl_2Y9ixHxGcj5ijT5P5pNfSSkjYxvx`, both hosts/exact source
verified and Google DAL checks pass. Real Play-installed Android passkey testing remains open. Handoffs: `docs/native-app-store-plan_PHASE_4C_HANDOFF.md`
and `docs/native-app-store-plan_PHASE_2B_HANDOFF.md`. Signing-switch half of Part B is verified complete; its 7+ day
session check remains open. Earlier status paragraphs below are historical where they conflict.
**Google Play setup, 2026-10-25:** Andrew created the app record, supplied developer ID **5775756752839536193**,
and now chose to complete Console setup himself: **stop using TinyFish**. All browser runs are terminal; do not retry.
TinyFish never verified the app dashboard or signing certificate; account-setup choices in the cancelled run remain
unverified. Manual submission pack: `docs/native-app-store-submission-pack.md`; exact run, cancellation and cost facts:
`docs/native-app-store-plan_PHASE_6_HANDOFF.md`. Phase 6 remains incomplete.
**Release artifact update (2026-10-25):** Andrew confirmed first release and authorized creating the upload key
and bundle for `com.hightopchallenge.app`. **Signed/verified AAB ready**:
`/Users/andrewserulneck/Downloads/Hightop-Challenge-1.0.0-2.aab` (version 1.0.0 / code 2, 23,324,192 bytes).
Key/password files are private and outside Git; their locations are recorded in §7. Password-manager backup remains
unconfirmed. Andrew confirmed Organization account, removed shadowed build 1, and reported Google Production status
**In review** for build 2. The two mapping/native-symbol warnings are nonblocking; minification is disabled.
Approval/public availability and Android installed-release checks remain unverified. Andrew supplied the Play
app-signing certificate; association/server release is now verified live (handoff below);
no agent upload/publication performed. Phase 6 overall remains incomplete. Exact release facts are in the handoff.
**iOS artifact update (2026-10-25):** App Store distribution archive/export succeeded locally; verified IPA:
`/Users/andrewserulneck/Downloads/Hightop-Challenge-iOS-1.0.0-1.ipa` (1.0.0 / build 1, iPhone+iPad,
production APNs entitlement). No Apple upload/server validation/TestFlight or submission yet. Android Play
app-signing fingerprint received and configured in production; exact artifacts/checks/commands:
`docs/native-app-store-plan_PHASE_6_HANDOFF.md`.
**Status:** Plan written 2026-10-08; Andrew's answers folded in the same day (§2 items 4–11).
**Current state (checked 2026-10-22; supersedes the "Next:" and "uncommitted" notes below):** every phase
through 4b plus review fixes R1–R5 is committed AND pushed to `origin/main` (`87303ae` R4–R5, `52c63df`
`.vercelignore` fix); the Vercel deployment was not separately checked. **Remaining, in order:**
(1) Andrew — Phase 0: Apple Developer + Google Play Organization enrolment and the Firebase project (§7 is
still blank); (2) Andrew — rebuild the shell from `main` and run 3B.3 + section I of
`docs/native-app-device-checklist.md`; (3) Phase 4d (no account needed); (4) Phase 5 Android half (needs
only Firebase — see Phase 5); then, once the paid Apple account exists: Part B (2B), 4c, Phase 5 iOS half,
6, 7 (incl. the sign-in "Get the app" pointer, added 2026-10-22), 8. **Phase 9a is BUILT and pushed (`beebc77`; handoff `docs/native-app-store-plan_PHASE_9A_HANDOFF.md`).** **Phase 9b is BUILT and pushed (`beebc77`; handoff `docs/native-app-store-plan_PHASE_9B_HANDOFF.md`).** **Phases 9c + 9d are BUILT and pushed (`678e680`; handoffs `docs/native-app-store-plan_PHASE_9C_HANDOFF.md`, `…_PHASE_9D_HANDOFF.md`).** **Phase 9e is BUILT and pushed (`20a97e2`, 2026-10-22; migration `20261023011500` applied to production 2026-10-22; handoff `docs/native-app-store-plan_PHASE_9E_HANDOFF.md`).** **Phase 9f review is DONE (2026-10-22; handoff `docs/native-app-store-plan_PHASE_9F_HANDOFF.md`): 16 fixes scheduled as 9f.1–9f.6 + an iPad fix folded into 9g; Andrew's phone pass = section J of `docs/native-app-device-checklist.md`.** **Phase 9f.1 is BUILT (2026-10-22, not committed; handoff `docs/native-app-store-plan_PHASE_9F_1_HANDOFF.md`).** **Phase 9f.2 is BUILT (2026-10-22, not committed; iPhone check pending; handoff `docs/native-app-store-plan_PHASE_9F_2_HANDOFF.md`).** **Phase 9f.3 is BUILT (2026-10-22, not committed; handoff `docs/native-app-store-plan_PHASE_9F_3_HANDOFF.md`).** **Phase 9f.4 is BUILT (2026-10-22, not committed; handoff `docs/native-app-store-plan_PHASE_9F_4_HANDOFF.md`).** **Phase 9f.5 is BUILT (2026-10-23, not committed; handoff `docs/native-app-store-plan_PHASE_9F_5_HANDOFF.md`).** **Phase 9f.6 is BUILT (2026-10-23, not committed; handoff `docs/native-app-store-plan_PHASE_9F_6_HANDOFF.md`).** 9f.1–9f.6 are DEPLOYED (`6047f68`, 2026-10-23) and the build is installed on his iPhone. **Phase 9g is BUILT (2026-10-23; handoff `docs/native-app-store-plan_PHASE_9G_HANDOFF.md`).** Next: Andrew's section J (item 33 = the 9f.2 iPhone check). **Phase 5.1 (push: server, website, Android) is BUILT and verified end to end on the Android emulator (2026-10-23, not committed, not deployed; migration `20261023105750` applied to production; `FCM_SERVICE_ACCOUNT_JSON` set in Vercel Production + Preview; handoff `docs/native-app-store-plan_PHASE_5_1_HANDOFF.md`). **Phase 5.2 (iPhone) is BUILT AND SIGNED (2026-10-23): the Part B signing switch is done (paid team `2U7HMXGQM3`, bundle `com.hightopchallenge.app`, push + associated-domains entitlements wired) and the build is installed on Andrew's iPhone; 4d + 5.1 + 5.2 committed and pushed. It waits on Andrew's APNs key upload, then the section K iPhone test — handoff `docs/native-app-store-plan_PHASE_5_2_HANDOFF.md`.** **Phase 5.3 (the welcome ask + new wording) is BUILT and pushed (`6372be0`, 2026-10-23; web-only; handoff `docs/native-app-store-plan_PHASE_5_3_HANDOFF.md`).** **Phase 5.4 ("News from your bars") is BUILT and pushed (2026-10-23; migration `20261023141109` applied to production; web-only, no app rebuild; handoff `docs/native-app-store-plan_PHASE_5_4_HANDOFF.md`).** **Phase 5.5 (partner-written messages) is BUILT (2026-10-23, not committed; migration `20261023145024` NOT applied; flag `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` off; handoff `docs/native-app-store-plan_PHASE_5_5_HANDOFF.md`).** Next: Andrew's go-ahead to apply the migration, commit/push and turn the flag on; then sections L, M + N of the device checklist. **Sharing Phases 9a–9g (added
2026-10-22)** need no Apple account except 9d's in-app Instagram direct-share.
**Phases 1a and 1b are DONE and deployed (2026-10-08)** — latest handoff
`docs/native-app-store-plan_PHASE_1B_HANDOFF.md` (1a: `…_PHASE_1A_HANDOFF.md`). Migration
`20261008044524_player_account_deletion.sql` is applied to production. Phase 0 is Andrew's, in
progress (D-U-N-S 14-998-5585 received 2026-10-17; next: Apple Developer + Google Play Organization
enrolment; Xcode and Android Studio installed). **Phase 2 is split into Part A
(now: Xcode free provisioning + Andrew's iPhone + the Android emulator) and Part B (after the paid
Apple account is approved: passkeys and the 7-day login test)** — see Phase 2. **Part A: automated
simulator/emulator checks done 2026-10-08; waiting on Andrew's device checklist**
(`docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md`); handoff
`docs/native-app-store-plan_PHASE_2A_HANDOFF.md`. **Andrew's first device report (2026-10-08) added Phases 2C, 2D and 2E** (see "Andrew's first
device report" under Phase 2). **2A and 2C are committed and pushed** (`f96c386`, `858660c`,
2026-10-08); 2C's handoff is `docs/native-app-store-plan_PHASE_2C_HANDOFF.md`. **Phase 2D (fit the
screen) is built and verified on Andrew's iPhone 16 Pro, the simulator and the emulator, 2026-10-09 —
committed in `4706072`**; handoff `docs/native-app-store-plan_PHASE_2D_HANDOFF.md`.
**Phase 2E (front door, no `/info` in the app, false-offline fix) is built and verified on the simulator,
the emulator and in a local browser, 2026-10-09 — committed in `4706072`; its device check waits for the
web deploy**; handoff `docs/native-app-store-plan_PHASE_2E_HANDOFF.md`. **Phase 3 (production shell) is
built and verified on the emulator, the simulator, Andrew's iPhone (install + probe) and a local production
build, 2026-10-09 — committed with 2D and 2E in `4706072`, not pushed**; handoff
`docs/native-app-store-plan_PHASE_3_HANDOFF.md`, device checklist `docs/native-app-device-checklist.md`.
**Phase 3B (player-only app, clearer partner sign-in on `/info`, Square logo) was added 2026-10-09 on
Andrew's decision that partners never use the app (§2 item 12) — it runs BEFORE Phase 4.**
**2D, 2E and 3 were committed locally as ONE commit `4706072` (2026-10-09, not pushed).** **Phase 3B.1
(player-only app) is built and verified 2026-10-09, committed locally as its own commit, NOT pushed or
deployed** — handoff `docs/native-app-store-plan_PHASE_3B1_HANDOFF.md`.
**Phase 3B.2 (`/info` Partner Login + the Square badge) is built and verified 2026-10-09, committed locally,
NOT pushed or deployed** — handoff `docs/native-app-store-plan_PHASE_3B2_HANDOFF.md`.
**Phase 4a (native share + haptics) is built and verified by tests and both shell builds, 2026-10-09, NOT pushed or
deployed, not yet tried on a device** — handoff `docs/native-app-store-plan_PHASE_4A_HANDOFF.md`.
**Phase 4a.1 (Android story-picture share via `@capacitor/filesystem`) and Phase 4b (in-app QR scanner,
`@capacitor/barcode-scanner`; Android minSdk now 26) are built and verified 2026-10-09 (tests, build, both shell builds,
Android emulator), committed locally, NOT pushed or deployed** — handoff `docs/native-app-store-plan_PHASE_4B_HANDOFF.md`
(also: where "Invite a friend" should go next = unscheduled Phase 4d, and how to review the whole plan:
`git diff native-app-plan-base..HEAD`).
**Next: Andrew decides when to push 2D+2E+3+3B+4a+4b together, rebuild the shell, his device checklist (3B.3 + section I
of `docs/native-app-device-checklist.md`)** (4c, 5 and Part B wait for the paid Apple
account; Universal Links also switch on then). **Code-review fixes for 2D–4b (Android Back, QR scan on the venue list,
haptics, iPhone location timeout, tidy-ups) are planned as Phases R1–R5 in `docs/native-app-review-fixes-plan.md`
(2026-10-09). R1 (Android Back), R2 (venue-list QR scan) and R3 (one haptics path) are committed (`0d0c745`, not pushed); R4 (iPhone location budget) and R5 (code tidy-ups) are done, uncommitted — latest handoff `docs/native-app-review-fixes-plan_PHASE_R5_HANDOFF.md`.** Each finished phase writes `docs/native-app-store-plan_PHASE_<N>_HANDOFF.md` and updates
this line.

**Goal:** one players-only "Hightop Challenge" app, live on the Apple App Store and Google Play. Partners
use the Partner Dashboard in their browser. The `/info` home page links players to both
stores. The website keeps working exactly as it does today.

---

## 1. Plain-English summary for Andrew

**What we're building.** A thin "native shell" app built with **Capacitor** (made by the Ionic team,
free and open source). The shell is a real iPhone and Android app that opens
`https://play.hightopchallenge.com` inside itself. On top of the website it adds the phone features
a website can't have: push notifications, a QR scanner, Face ID passkey sign-in, the phone's share
sheet and haptics (vibration feedback). This approach avoids rewriting the app. A full rewrite in a
native language would take months, and every design tweak after that would need an app-store
review.

**Can you still tweak and update it like today? Yes, and this is the main reason for this design.**
The app loads the live website, so a change to colours, layout, copy, games or the dashboard goes
live in the app the moment Vercel deploys. That works the same as today, with no store review.
Only changes to the shell itself need a new store release, which Apple usually reviews in about
1–2 days and Google in hours to a few days:
- the app icon, name or splash screen;
- a new phone permission or capability (for example contacts or Bluetooth);
- a new native plugin;
- updates to Capacitor itself.

There are two real but small costs:
1. **Old app versions stay in use.** People don't update apps promptly. A web change that relies on a
   brand-new native feature must check that the feature is present before using it. Phase 3 builds
   this check, plus a "please update" screen for when an old version truly can't work.
2. **Apple's rules apply to the app.** Normal design and game changes are fine. Turning the app into
   something materially different without a review, or adding in-app selling of digital goods, is
   not.

**One app or two? One app, for players only** (revised 2026-10-09, §2 item 12). Players are the
audience that needs the "this is legit" signal. **Partners never use the app:** the Partner Dashboard,
partner sign-in, signup and Stripe billing all live on the website, in the phone's or computer's normal
browser. Any partner page reached from inside the app opens in the system browser. This keeps the paid
subscription entirely outside Apple's and Google's stores. We can build a separate partner app later if
partners ever need one.

**Is this dangerous or risky? Not dangerous.** Nothing in this plan changes the live website's
behaviour until a phase ships, and every website change is reversible by redeploying. The honest
risks:

| Risk | How likely | What we do about it |
|---|---|---|
| Apple rejects the first submission as "just a website" (guideline 4.2) | Moderate. This is common for first submissions. | Push, QR scanner, passkeys, share and haptics, a native offline screen, and clear reviewer notes. Expect possibly one rejection-and-resubmit round. |
| Face ID passkeys don't work inside the app's web view | Real technical unknown | Phase 2 tests this first. The fallback is that username/PIN works in the app while passkeys get a native plugin. |
| Player account deletion (required by both stores) touches `auth.users`, which players and partners share | Data-safety risk if done carelessly | Its own phase, top model, the existing seven-table guard, and no shortcuts. |
| Prizes count as a "contest" under store rules (Apple 5.3, Google contests policy) | Low, if the paperwork is done | An Official Rules page, a "no purchase necessary" statement and an "Apple is not a sponsor" statement. Players never pay, which keeps it legal. |
| Payment rules differ by country and keep changing | Low, if US-only | Launch in the **United States only** at first, with no purchase buttons in the app. |

**Money.** Apple Developer Program: $99/year. Google Play: $25 one-time. D-U-N-S number: free.
Push notifications through Firebase Cloud Messaging: free. Extra Vercel/Supabase usage is roughly
nothing (estimate in Phase 5). You already have the Mac you need for Xcode.

**What needs you.** You'll need to do these yourself:
- the business and account paperwork (Phase 0);
- testing on your iPhone, and on the free Android Studio emulator for Android (Phase 2 onward);
- legal review of the privacy policy, terms and contest rules (Phase 1a). You will do this yourself
  once admitted to the New York bar;
- the final "Submit for review" clicks.

---

## 2. Decisions already made (Andrew, 2026-10-08). Do not re-ask.

1. **The publisher is a registered business** (LLC or corporation, enrolled as an *Organization* on
   both stores). The listing shows the company name. This also exempts us from Google's rule that
   new *personal* accounts need 12 testers for 14 days.
2. **SUPERSEDED 2026-10-09 by item 12 (the app is player-only).** Original text, kept for history:
   **One app for players and partners.** It is player-first. The Partner Dashboard is reached through
   a sign-in link inside the app. Partner **signup and every Stripe page open in the system browser**.
   This supersedes, for the native app only, the PWA rule "`/owner/*` and `/admin` stay an ordinary
   website": the *PWA* stays player-only, but the native app may show `/owner/*`. `/admin` is never
   reachable in the app; it opens in the system browser.
3. **First-version native features: all four.** Push notifications, an in-app QR scanner, Face ID
   passkey sign-in, and native share plus haptics.
4. **Test devices: Andrew's iPhone plus the free Android Studio emulator** (revised by Andrew
   2026-10-08: "we'll probably want to use an Android simulator since it's free" — no Android phone
   is bought for now). Use a **Google Play** emulator image (Android 16 / API 36, arm64), signed in
   to a Google account where a check needs one (passkeys). The emulator counts as a pass for Android.
   Known emulator blind spots, to note in each checklist: real GPS (the emulator's location is set
   by hand), real camera for the QR scanner (the emulator has a virtual scene), and low-end phone
   performance. If a store reviewer or a player reports an Android-only bug the emulator can't
   reproduce, revisit buying a phone. No outside testers are needed: the Organization account skips
   Google's 12-tester rule.
5. **Approach: Capacitor shell over the live site** (`server.url`). There is no React Native or Expo
   rewrite, and no bundled copy of the site. Recommended by Claude and accepted with this plan.
6. **Launch in the United States only** (confirmed by Andrew 2026-10-08). Other countries are a
   later decision and need a fresh check of the payment rules.
7. **Account deletion REMOVES the player's data** (Andrew, 2026-10-08). Their scores leave every
   leaderboard; nothing is anonymised to "Deleted player". See the Phase 1b traps.
8. **Retire the PWA "Add to Home Screen" prompt** once the store apps are live (Andrew, 2026-10-08).
9. **The website stays a first-class way to play and manage a venue on a phone, with no app
   required** (Andrew, 2026-10-08). The home page offers "Get the app" *and* "Play in your browser"
   for players, and "Partner sign in" for partners. No page may force or nag anyone into the app:
   banners are dismissible, and no feature that works on the web today becomes app-only.
10. **Legal review: Andrew**, once admitted to the New York bar, before the Phase 6 submission.
11. **App id `com.hightopchallenge.app`** (Claude's recommendation; Andrew asked what it is and
    raised no objection, 2026-10-08). It is permanent once published. Confirm once more before the
    first upload to either store, because that is the point of no return.
12. **The app is for players only; partners use the website in a browser** (Andrew, 2026-10-09).
    Subscribers (bars, pubs, restaurants) pay $100/month; Andrew wants that subscription kept entirely
    outside the app stores (no store commission, and no "downloaded software" framing for state sales
    tax). So: no partner sign-in link, no Partner Dashboard and no billing screen inside the app; every
    `/owner/*` page opens in the system browser. The app's sign-in screen has **no Home button and no
    partner link**. This also answers the open 2E/3 question "should a partner who plays as a guest
    switch the app back to the player side?" — moot: partners never sign in inside the app, so the
    remembered-partner launch (`htc_app_side` cookie, `lib/appFrontDoor.ts`) is removed. Built in
    Phase 3B.
13. **Reviewer venue: choose the easiest option and do it** (Andrew, 2026-10-25: "Whatever is easiest, just do it.").
    Reuse and un-hide **Hightop Test Bar**, `venue-hightop-test`, at **1010 Pacific St, Brooklyn, NY 11238, USA**.
    Keep its name, address, geofence and POS settings; `venue-hightop-test-2` stays hidden. Completed 2026-10-25.
14. **Reviewer account: `appreview`, with Andrew's chosen PIN** (supplied in chat 2026-10-25).
    The supplied value was applied and live sign-in verified. Keep the PIN out of the repository; enter it only in
    the stores' private review/access forms. God Mode is approved for reviewer location bypass; it grants no admin
    or partner credentials. Do not ask Andrew to choose the PIN again.
15. **Keep iPad support too** (Andrew, 2026-10-25). Keep `TARGETED_DEVICE_FAMILY = "1,2"` in both iOS build
    configurations and prepare iPad screenshots. Do not ask whether to restrict the app to iPhone again.

---

## 3. Facts discovered while writing this plan (verified 2026-10-08)

- **The domain split is already LIVE in production.** `curl -I https://hightopchallenge.com/venue/x`
  returns `308 → https://play.hightopchallenge.com/venue/x`. `SYSTEM_CONTEXT.md` §0 and the runbook
  still describe it as "flag-gated off"; they are out of date on this point. Consequence: the app
  loads `play.` for players, and `/owner/*` lives on the **apex**. The shell must allow navigation
  to both hosts.
- **There is no privacy policy, no terms page, no official contest rules and no player self-serve
  account deletion** anywhere in `app/` or `components/`. Both stores require a privacy policy URL
  and in-app account deletion; Google also wants a web deletion URL. These are hard blockers, so they
  are Phase 1.
- **Ads are first-party.** `components/ui/PopupAds.tsx`, `MobileAdhesionAd.tsx` and `AdBanner` serve
  rows from our own `advertisements` table, with no AdSense or AdMob. That matters because AdSense
  forbids ads inside app web views. No cross-app tracking means no App Tracking Transparency prompt
  is expected. Confirm in Phase 6 by checking `components/analytics/AnalyticsRuntime.tsx`.
- **There is no web push today.** In-app notifications exist: the `notifications` table, with
  `createNotification()` in `lib/notifications.ts`, called from `lib/challengeCampaigns.ts` and
  `app/api/cron/prize-expiry-warnings/route.ts`. **Trap:** the Bingo atomic-grading RPC
  (`20260914010000_bingo_atomic_grading.sql`) inserts notifications **in SQL**, bypassing
  `createNotification()`. A push hook placed only in TypeScript misses Bingo wins.
- **Passkeys:** `lib/webauthn.ts` uses RP ID `hightopchallenge.com` (`PROD_RP_ID_DEFAULT`),
  `@simplewebauthn/server` 13.x, with allowed origins from `WEBAUTHN_ALLOWED_ORIGINS`.
- **`proxy.ts` gates any extensionless path** (`/\.[a-z0-9]+$/` is the "static file" test, in
  `proxy.ts:55` and `lib/domainSplit.ts:99`). `/.well-known/apple-app-site-association` has **no
  extension**, so Phase 3 must explicitly let `/.well-known/*` through on **both** hosts. Never
  change the auth gate's default behaviour to do this; add a narrow allow.
- **The geofence makes App Review hard.** Apple's reviewers are not at a venue. God Mode
  (`accounts.god_mode`, server-authoritative in `/api/join/profile`) already solves this: a
  dedicated reviewer God Mode account plus a demo venue with "anytime" games (Speed Trivia, Bingo,
  Pick 'Em) gives them something to play. The hidden venue `venue-hightop-test` exists already.
- **The permanent join QR** (`https://play.hightopchallenge.com`, `lib/joinQr.ts`) is printed on
  merch. With Universal Links / App Links (Phase 3), scanning it with the phone camera **opens the
  app if installed** and the website if not. The URL is never changed.
- **Capacitor and the existing PWA rules:** a Capacitor app has **no service worker** (that rule
  stays), and `app/manifest.ts` is unaffected. Inside the native app, the PWA "Add to Home Screen"
  prompt must be hidden (Phase 3).
- **No third-party social login** (we use username/PIN/passkey), so Apple's "must also offer Sign in
  with Apple" rule (4.8) does **not** apply. Do not add Google or Facebook login without revisiting
  this.

---

## 4. Phases

Model rule (Andrew): **never more capable than Opus 5.5.** Models: `claude-opus-5-5`,
`claude-sonnet-5-5`, `claude-haiku-4-5-20251001`. "Effort" is the Claude Code reasoning level
(low / medium / high / xhigh / max).

| Phase | What | Who / model | Effort | Rough duration |
|---|---|---|---|---|
| 0 | Business, D-U-N-S, Apple and Google developer accounts, tools installed | Andrew (Sonnet 5.5 only to answer questions) | low | 1–3 weeks of waiting, ~2 h of work |
| 1a | Privacy Policy, Terms, Official Contest Rules, Support pages | Sonnet 5.5 | medium | 1 session |
| 1b | Player self-serve account deletion (in-app + web URL) | **Opus 5.5** | **high** | 1–2 sessions |
| 2 | Native shell spike on iPhone + Android phone (prove the risky parts) | **Opus 5.5** | **xhigh** | 1–2 sessions + Andrew's iPhone test |
| 2C | Venue-list leak fix (website bug found in Andrew's device test) | **Opus 5.5** | medium | 1 session |
| 2D | App fits the screen: safe areas, venue-home gap, smaller logos | **Opus 5.5** | high | 1 session + Andrew's iPhone |
| 2E | App front door (guests → games, partners → dashboard), no `/info`, false-offline fix | **Opus 5.5** | high | 1–2 sessions + Andrew's iPhone |
| 3 | Production shell: icons, offline screen, native detection, partner/billing link-outs, Universal Links, minimum-version gate | **Opus 5.5** | high | 2 sessions |
| 3B.1 | Player-only app: no Home/partner link on the app's sign-in, every `/owner/*` page opens in the browser, remove the remembered-partner launch | **Opus 5.5** | high | 1 session |
| 3B.2 | `/info`: obvious Partner Login (phone + hero), "no app needed" line for partners, official Square logo | Sonnet 5.5 | medium | 1 session + Andrew's logo OK |
| 3B.3 | Rebuild the shell, Andrew's device + phone-browser check | Andrew (+ Sonnet 5.5, low) | low | ~15 min |
| 4a | Native share + haptics | Sonnet 5.5 | medium | 1 session |
| 4b | In-app QR scanner | Sonnet 5.5 | high | 1 session |
| 4d | "Invite a friend" on the venue home, after a win, short leaderboards, account drawer (placement list in the 4B handoff) | Sonnet 5.5 | low–medium | short | **built 2026-10-23, uncommitted** — `docs/native-app-store-plan_PHASE_4D_HANDOFF.md` |
| 4c | Face ID passkeys in the app (based on the Phase 2 result) | **Opus 5.5** | **xhigh** | 1–2 sessions |
| 5 | Push notifications (device registry, sending, preferences) — 5.1 server/website/Android **built 2026-10-23** (`…_PHASE_5_1_HANDOFF.md`); 5.2 iPhone **signed + installed 2026-10-23, waits on the APNs key + device test** (`…_PHASE_5_2_HANDOFF.md`) | **Opus 5.5** | high | 2 sessions |
| 6 | Store listings, privacy labels, reviewer account, TestFlight/internal test, submit | Sonnet 5.5 (copy) + Andrew (clicks) | medium | 1 session + review wait |
| 7 | App Store / Google Play badges on `/info` and the player sign-in, Smart App Banner, `/app` redirect link | Sonnet 5.5 | medium | 1 session |
| 8 | Release process doc + first native update dry run | Haiku 4.5 | low | short |
| 9a | The app download link `hightopchallenge.com/app` (built early, ahead of Phase 7) that every share points to | Sonnet 5.5 | medium | 1 session |
| 9b | Share card v2: ready-made designs (camera never required), "I just won … at <bar>!", bar name + address + QR + app, Story and feed-post sizes | **Opus 5.5** | high | 1–2 sessions |
| 9c | "Share my win" on every win: prizes, Bingo, Pick 'Em, NFL Pick 'Em, Fantasy, Squares, Bracket | Sonnet 5.5 | medium | 1–2 sessions |
| 9d | The share sheet: ready-made picks, caption + link, one tap per app; Instagram Stories direct from the app | **Opus 5.5** | high | 1 session |
| 9e | Venue Instagram handle (revived 2026-10-22) + the partner picks what a share shows: handle, name, address — all, none or any mix — asked when they set up a Prize or schedule a game; the @handle goes in the caption | **Opus 5.5** | high | 1–2 sessions |
| 9g | `/app` on a phone asks "Get the app?" first ("Get the app" / "No thanks, play in the browser") instead of jumping straight to a store | Sonnet 5.5 | medium | 1 session |
| 9f | Review + Andrew's phone pass of every share path (9a–9e, 9g) | **Opus 5.5** (review) + Andrew | high | 1 session |
| 9f.1–9f.6 | Fixes from the 9f review (share-sheet taps, iPhone Instagram caption, redraws, stale venue choice, partner box, Pick 'Em points) | Sonnet 5.5 / Opus 5.5 (see each) | medium–high | 1 session each (9f.6 tiny) |
| 10.1–10.4 | Fixes from the 2026-10-26 code review: partner-message reports/pauses (migration), partner-message app fixes, "Get the app" link fixes, iCloud duplicate cleanup | Opus 5.5 (10.1) / Sonnet 5.5 / Haiku 4.5 (see each) | low–high | 1 session each (10.4 tiny) |

Phases 0 and 1 run in parallel; Phase 0 is mostly waiting on paperwork. Phase 2 can start once
Xcode is installed. Free Apple provisioning can put a test build on Andrew's own iPhone before the
paid account is approved. Phases 4a/4b/4c/5 can run in any order after Phase 3B; 4a and 4b need only free provisioning, while 4c and 5 need the paid Apple account. Phase 6 needs
everything before it. Phase 7 needs live store URLs, so it starts after approval. The badges can
be built behind a flag earlier.

---

### Phase 0 — Accounts and tools (Andrew; no code)

**Goal:** everything an agent cannot do for you.

1. **Confirm the legal business** (LLC or corporation) and its exact legal name, address and phone.
   The store shows this name.
2. **Get a D-U-N-S number** for the business: free through Apple's D-U-N-S lookup page, and it can
   take up to ~2 weeks. Apple and Google both require it for Organization accounts.
3. **Apple Developer Program, as an Organization:** $99/year. You need a business website on our
   domain (`hightopchallenge.com/info` works) and a work email on the domain is preferred. Apple may
   phone to verify.
4. **Google Play Console, as an Organization:** $25 one-time. It includes identity verification, and
   the D-U-N-S number is needed here too.
5. **Install Xcode** (Mac App Store, free, large) and **Android Studio** (free). Sign into Xcode with
   your Apple ID.
6. **Create a Firebase project** (free) named "Hightop Challenge". It is used for push in Phase 5.
7. **Pick a support email** that the store listing will show, for example `support@hightopchallenge.com`.
8. ~~Buy a cheap Android phone~~ — **dropped 2026-10-08 (Andrew): Android testing uses the Android
   Studio emulator** (§2 item 4). Phase 2 Part A creates the emulator.
9. **Decide the app's display name** (default "Hightop Challenge") and confirm nobody else has it in
   either store (search both).

**Done when:** both developer accounts are approved, Xcode and Android Studio open, and the Firebase
project exists. No handoff file is needed for this phase; record the details below in §7 instead.

---

### Phase 1a — Legal and support pages (Sonnet 5.5, medium)

**Goal:** the public pages both stores require. These ship to the live website and are useful even
without an app.

- New marketing pages on the **apex**, like `/info`, `/faqs` and `/advertise`: `/privacy`, `/terms`,
  `/rules` (Official Contest Rules), `/support`. Add each to the apex "marketing" list in
  `lib/domainSplit.ts` (`classifyPage`) so `play.` redirects them to the apex. Add them to
  `app/sitemap.ts`. Link them from the `/info` footer, the player account drawer and the Partner
  Dashboard menu.
- The privacy policy must truthfully list what we collect:
  - username and PIN hash;
  - passkeys;
  - **precise location** (geofence check);
  - venue membership and game activity;
  - prize coupons;
  - first-party analytics;
  - partner email, address, and billing through Stripe;
  - push tokens (Phase 5);
  - camera use, for the QR scanner only, with nothing stored.

  Also list the processors: Supabase, Vercel, Stripe, Google Maps, Resend, Anthropic (question
  generation, not user data, so verify), Square/Clover (partners who connect a POS), and Firebase.
  **Inventory this from the code, not from memory.**
- The Official Rules must say: free to play, no purchase necessary; prizes are provided by the
  participating venue; eligibility (age, US); how winners are chosen; and **"Apple is not a sponsor
  of, and is not involved in, any contest or sweepstakes."** That last sentence is required by
  Apple 5.3.3.
- Copy is drafted by Claude and **reviewed by Andrew (NY bar) before the app is submitted.** Put a
  visible "Last updated" date on each page. Players are in many states, so flag sections that
  state law drives (California privacy rights, contest and sweepstakes rules in states like New York
  and Florida) for Andrew's attention.
- Text-size floor and navigation rules apply (`ExitBackButton` → `marketingHref("/info")`).

**Tests:** extend the domain-split tests for the new marketing paths, then run
`npm run test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`.

---

### Phase 1b — Player self-serve account deletion (Opus 5.5, high)

**Goal:** a player can delete their own account from inside the app (Apple 5.1.1(v), Google Play
policy). There must also be a public web page explaining how, which Google requires as a URL.

**This is the most dangerous phase in the plan. Read the `auth.users` standing prohibition in
`CLAUDE.md` first.**

- Add a "Delete my account" control in the player account drawer (near, but not adjacent to,
  `SignOutButton`) with a typed confirmation. It calls a new authenticated route bound to the
  signed session through `resolveRequestUserId()`, so a forged id gets 403.
- Delete **only the caller's own** rows. First map every table keyed to `accounts` / `users` /
  `auth_id`, using `tests/lib.auth-users-fk-guard.test.ts` as the starting map. **Andrew decided:
  remove, don't anonymise.** The player's scores, picks, cards and submissions are deleted, and venue
  leaderboards shift accordingly. Delete the `auth.users` row **only after** every consumer is
  handled, and only for the caller's own `auth_id`.
- **Traps to check before deleting (raise with Andrew if they apply):**
  - **Winner quota rows:** deleting the player's `challenge_cycle_winners` row for a *current* cycle
    frees a slot that `award_cycle_winner` counts, so one extra person could win that cycle's
    prize. Either leave past and current-cycle winner rows with the user link cleared, or accept
    the extra winner. Ask Andrew.
  - **Money ledger:** `pos_reward_applications` (Square gift cards) is a financial record that
    partners may need for their books. Recommend keeping the row with every personal identifier
    removed. Ask Andrew; this is the one place "remove" may need an exception.
  - **Scores already settled into a finished reward** (an NFL Pick 'Em season winner, a Live Trivia
    winner) must not re-run winner resolution after the player's rows are gone.
- Prefer one Postgres function (a new migration that grants `service_role`; follow
  `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`) so the deletion is all-or-nothing.
  **`supabase db push` needs Andrew's explicit go-ahead.**
- Unredeemed prizes are lost on deletion. Say so in the confirmation copy.
- Partners: deleting a *partner* account involves Stripe and is not self-serve here. The
  `/support` page says "email us" for partner account closure. That is acceptable to Apple for a
  business account; confirm in Phase 6 review notes.
- Add a public `/delete-account` page explaining the steps and the support email, for Google's
  form.

**Tests:** route tests for forged id → 403, the happy path, and partial failure → nothing deleted.
Re-run `npm run test` (the FK guard), `npm run test:god-mode-join`, and the full checks.

---

### Phase 2 — Native shell spike (Opus 5.5, xhigh)

**Goal:** prove the risky parts on Andrew's real iPhone and on the Android emulator **before**
building the polished shell. Whatever is learned goes in the handoff. Some spike code may be thrown
away.

**Split into two parts (Andrew, 2026-10-08)** so the spike doesn't sit idle while Apple processes
the D-U-N-S number and the paid developer account:

- **Part A — now.** Needs only Xcode (free "Personal Team" provisioning puts a build on Andrew's own
  iPhone) and the Android emulator. Covers: the setup below; item 1's *kill-and-relaunch* half;
  items 2, 3, 4, 6, 7 and 8; and a look at the menu → "Delete my account" screen (typing DELETE with
  the native keyboard, never pressing the button on a real account) and the legal pages inside the
  app. Handoff: `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`.
- **Part B — after the paid Apple Developer account is approved.** Covers item 5 (passkeys, iOS and
  Android) and item 1's *7+ days* half. Why it must wait: a free Personal Team **cannot** use the
  Associated Domains entitlement that passkeys need, and a free-provisioned build **expires after 7
  days**, which would end the 7-day test early. Android passkeys sit in Part B too because both
  platforms need `/.well-known/*` files served from the live site (a narrow `proxy.ts` allow), so
  one web change serves both. Handoff: `docs/native-app-store-plan_PHASE_2B_HANDOFF.md`.

**Part B update, 2026-10-25:** signing switch already completed in Phase 5.2 and now independently verified in both
project configurations and the actual signed device app: team `2U7HMXGQM3`, bundle `com.hightopchallenge.app`,
associated-domain entitlement for `webcredentials:hightopchallenge.com`. The development profile expires
**2027-10-23T12:00:55Z**, not after seven days. Andrew verified native passkey creation/sign-in and native-created
passkey use in iPhone Safari after the Phase 4c database fix. No iOS rebuild was needed. Android release trust and
the 7+ day session-persistence observation are still open; do not mark them passed from signing checks.

Setup:
- Create a separate folder **`native/`** with its own `package.json`, the current Capacitor major
  (check the version at start), and `@capacitor/ios` + `@capacitor/android`. It must not touch the
  Next.js build, `tsc`, lint or Vercel; check that `vercel build` ignores it and add it to
  `.vercelignore` if needed. Set `server.url = https://play.hightopchallenge.com` and
  `server.allowNavigation = ["play.hightopchallenge.com", "hightopchallenge.com"]`. `webDir` is a
  tiny bundled offline page.
- App id: **`com.hightopchallenge.app`** (permanent once published, so confirm with Andrew).
- Append a user-agent token, for example `HightopChallengeApp/<version> (ios|android)`, so the server
  and the web code can tell they're inside the app.

Prove each item, recording pass or fail:
1. Player login (username/PIN) survives a full app kill and relaunch, and still works after 7+ days.
   That checks WKWebView storage purging; if it fails, test WKAppBoundDomains.
2. Geolocation: one clean permission prompt, not a double app-then-website prompt. If doubled, route
   through `@capacitor/geolocation`, without changing God Mode's server-authoritative path
   (`npm run test:god-mode-join`).
3. Partner flow: `play.` → apex `/owner/login` → dashboard, staying inside the app. The owner cookie
   survives across hosts (`.hightopchallenge.com` cookie domain). The Capacitor bridge is present on
   the apex page too.
4. Stripe Checkout / billing portal and `/admin` open in the **system browser**, not the web view.
5. **Passkeys:** with an Associated Domains `webcredentials:hightopchallenge.com` entitlement and an
   `apple-app-site-association` file, does the existing web passkey flow work in WKWebView? On
   Android, check the WebView WebAuthn support (androidx.webkit `WebSettingsCompat` web
   authentication) plus `/.well-known/assetlinks.json`. If either fails, prototype a native passkey
   plugin. Then the server must accept the native origin: iOS reports `https://hightopchallenge.com`,
   while Android reports `android:apk-key-hash:<hash>`, which must be added to
   `WEBAUTHN_ALLOWED_ORIGINS`.
6. Bingo landscape fullscreen, the notch/safe area and the status bar, compared against
   `docs/bingo-fullscreen-pwa-device-checklist.md`.
7. Android hardware back button: it should behave like `ExitBackButton`/history, not quit the app.
8. Realtime (Supabase channels) reconnects after the app is backgrounded for 5 minutes.

**Done when:** every item has a recorded result and the handoff names the approach Phase 3 uses
for each one.

---

### Andrew's first device report (2026-10-08) and the fix phases it created

Andrew ran the Part A test app on his iPhone and reported seven things. The first agent to start
2C, 2D or 2E copies this list into `docs/native-app-store-plan_PHASE_2A_HANDOFF.md` §9.

| # | What Andrew saw | Cause (what was checked) | Fixed in |
|---|---|---|---|
| R1 | On the iPhone, everything sits too high. The sign-in logo, the venue-home menu and alerts buttons, and the Back buttons are cut off under the status bar, so Back can't be tapped. | iOS draws the web page under the status bar (`contentInset: "never"` in `native/capacitor.config.json` + `viewportFit: "cover"` in `app/layout.tsx`). Some screens add `env(safe-area-inset-top)` padding and some don't. The venue-home header (`components/venue/VenueHubHeaderBar.tsx`) *does* add it but is still cut off, so on the real phone the inset may be read as 0. Not yet diagnosed on the device; the simulator looked fine. | **2D** |
| R2 | Big gap between the game buttons and the Games / Leaderboard / Rewards bar; the "Next Live Trivia Showdown in…" box is pushed far down. | The venue home leaves a fixed-height gap for its pinned header (`components/venue/VenueHubClient.tsx`, `h-[calc(max(env(safe-area-inset-top),0px)+8rem)]`) instead of measuring the header. A guessed height is wrong whenever the header's real height differs. | **2D** |
| R3 | Signed in as **Rick** (not Andrew), all venues show, wherever he is. | **Working as designed.** Production `accounts` has `god_mode = true` for exactly three accounts: `Andrew`, `marc` and **`Rick`** (checked 2026-10-08). God Mode sees every venue. To test as a normal player, use a fresh account. If Rick should be a normal player, turn God Mode off for him in the admin. Andrew to decide; nothing to build. | none |
| R4 | A **new** player briefly sees every venue behind the "share your location" question. After they allow location, only the nearby ones remain. | **Real bug, on the website too, not only the app.** In `components/join/JoinFlow.tsx`, sign-out (`handleSignedOut`) and going back to the sign-in choice (`handleBackToAuthMethodSelection`) reset `venueListBuiltRef` but **not the `venueList` state**. The previous account's God Mode list (Rick's) stays on screen while `buildVenueListAfterAuth` waits for the new player's location. The deep-link path also fills `venueList` with every venue (`setVenueList(venues)` before the geofence check). Only phones where a God Mode account signed out are affected, but a non-God Mode player must never see an out-of-range venue. | **2C** |
| R5 | `/info` shouldn't be part of the app. The app should send guests to the games and partners to the dashboard. | A design change: today every "home" control points at `/info` (`marketingHref("/info")` in `LegalPage`, `app/owner/login`, `JoinFlow`, `SignupShell`, `SignupWizard`, `DeleteAccountPanel`, `app/owner/billing/setup`). | **2E — built 2026-10-09** (`homeHref()`, front door, link-outs) |
| R6 | Back from a legal page shows "No connection… check your connection" while the internet is fine. "Try again" then goes to the player sign-in. | Back on legal pages goes to `https://hightopchallenge.com/info` (domain split is live). Most likely cause: `useExitNavigation` calls `history.back()` and then, 150 ms later, its fallback navigation. The cancelled first navigation is reported as a failed load, and the shell shows `server.errorPath`. "Try again" in `native/www/offline.html` reloads the app's start URL, not the page that failed. To confirm on the device. | **2E — confirmed and fixed 2026-10-09**: Capacitor showed the offline page for a cancelled (−999) navigation |
| R7 | The app still works with Wi-Fi off. | Expected: the phone switched to mobile data. There is no offline caching (no service worker, by rule). To test the real offline screen, use **Airplane Mode**. | 2E re-tested: ✅ Android emulator; iPhone is Andrew's check |

All three phases change only the shell and the web pages' layout and routing. No database changes,
no new env vars, no new cron jobs, and no new recurring cost (2E adds no request; see its cost
note).

---

### Phase 2C — Venue-list leak fix (Opus 5.5, medium) — ships to the website now

**Status: built and tested 2026-10-08, not yet committed/deployed. As-built:
`docs/native-app-store-plan_PHASE_2C_HANDOFF.md`** (generation-tagged list in `lib/joinVenueList.ts`).

**Goal:** a player who isn't God Mode never sees a venue outside their range, not even for a
moment, and not after a God Mode account used the same phone. This is a website bug, so it ships
on its own without waiting for the app.

- In `components/join/JoinFlow.tsx`, **clear `venueList` (set it to `[]`) everywhere
  `venueListBuiltRef` is reset** (`handleSignedOut`, `handleBackToAuthMethodSelection`, and any
  other reset), **and** at the start of `buildVenueListAfterAuth` before it awaits anything. While
  the location check runs, show the "Finding venues near you…" loading state, never a list.
- Deep-link path (`setVenueList(venues)` around line 946): stop putting every venue into
  `venueList`. Use a local variable for that path's own single-venue check, or clear the list before
  the venue-list panel can show.
- Belt and braces: the venue-list panel renders a list only when it was built **for the current
  sign-in**. For example, keep a build id or owner (account id + God Mode) next to the list and
  render nothing when it doesn't match.
- Don't touch God Mode's server path (`/api/join/profile`), and don't add any god-mode lookup before
  sign-in (CLAUDE.md: that would let anyone find out which usernames exist).

**Tests:** a new test that signs in as God Mode, signs out, then signs up a normal player, and checks
that the venue list is empty until location resolves and then shows only in-range venues. Also the
deep-link case. Run `npm run test:god-mode-join`, `npm run test`, `npx tsc --noEmit`,
`npm run lint` and `npm run build`. Andrew's device check: sign out of Rick, create a new player, and
confirm that no venue shows behind the location question.

---

### Phase 2D — Fit the screen inside the app: safe areas, header gap, smaller logos (Opus 5.5, high)

**Status: built 2026-10-09, not yet committed. As-built: `docs/native-app-store-plan_PHASE_2D_HANDOFF.md`.**
Diagnosis on the iPhone 16 Pro: the inset read correctly (62px), so it was case (b), screens ignoring it.
At least six screens did. The shell option (step 2) fixed them all: `@capacitor/status-bar` with
`overlaysWebView: false`. The venue header had a website bug of its own: a global `!important` section
padding replaced its safe-area padding. That's fixed, and the spacer now uses the header's measured height.

**Goal:** inside the iPhone app, nothing sits under the status bar or the notch / Dynamic Island,
every Back and menu button can be tapped, and the venue home has no dead gap. The website must
look the same as today, or better.

**Needs Andrew's iPhone plugged into the Mac** (Safari → Develop menu → the phone → the app's page;
`webContentsDebuggingEnabled` is already on in the debug build).

1. **Diagnose first, on the real phone.** On the sign-in page, the venue home and a legal page, read
   the real value of `env(safe-area-inset-top)`. For example, set a test element's `padding-top`
   to it and read `getComputedStyle`. Also read `window.scrollY` and the header's
   `getBoundingClientRect().top`. Also say what Andrew's iPhone model is. This tells which of the two
   problems we have:
   - **(a) the inset reads as 0** inside the app → fix the shell (step 2);
   - **(b) the inset is right, but some screens ignore it** → fix the web pages (step 3).
   It may be both.
2. **Shell option (try first; fixes every screen at once).** Make the iPhone app start the page
   *below* the status bar, the way Android already does. Try either `ios.contentInset: "always"`, or
   the `@capacitor/status-bar` plugin with the web view not drawn under the bar, then set the bar's
   colour to the site's dark navy `#020617`. Check that it doesn't break the fixed headers, the
   bottom bars, the keyboard, or **Bingo landscape fullscreen**
   (`docs/bingo-fullscreen-pwa-device-checklist.md`). A shell change needs `npx cap sync ios`
   and a rebuild on the phone, but **no website deploy**. If it causes layout side effects, fall
   back to step 3.
3. **Web option.** Audit every top-of-screen element for safe-area padding. Known: the join /
   sign-in screens (`components/join/JoinFlow.tsx`) and the `/owner/login` page. Check also
   `ExitBackButton`'s host shells (`PageShell`, `OwnerShell` / `OwnerAppBar`, `AppBar`,
   `LegalPage`). Use one shared Tailwind pattern (`pt-[max(env(safe-area-inset-top),Xpx)]`) rather
   than per-page guesses. Add a contract test that every host shell carries it.
4. **Venue-home gap (R2):** replace the fixed `8rem` spacer in `VenueHubClient.tsx` with the
   header's **measured** height (a `ResizeObserver` on `VenueHubHeaderBar` writing a CSS variable),
   or make the header `sticky` so the page flows under it with no spacer. Inline `style` isn't allowed
   outside the TV display, so set the CSS variable through a ref (`element.style.setProperty`) or a
   Tailwind arbitrary value. Then the game buttons sit right under the Games / Leaderboard / Rewards
   bar, and the "Next Live Trivia Showdown" box sits right under the buttons. Check this on the
   **website too**: if the same gap shows in mobile Safari, this fixes it there as well.
5. **Smaller logos (Andrew asked):** shrink the logo on the **player sign-in** screen and on the
   **Partner Dashboard and partner sign-in** (`components/owner/OwnerAppBar.tsx`,
   `app/owner/login/page.tsx`) so they fit neatly. Roughly 15–25% smaller; show Andrew before/after
   screenshots. Use the existing `/brand/web/*.webp` files, so no new artwork is needed.
6. Android: the page already starts below the status bar there. Check that nothing regressed, and
   colour the white status bar dark if step 2 adds the status-bar plugin (Phase 3 would otherwise do
   it).

**Tests:** `npm run test:pwa-contract` (landscape CSS must not leak into portrait), the new
safe-area contract test, `npm run test`, typecheck, lint and build. Andrew's device check: the
sign-in logo, the menu and alerts buttons and every Back button are fully visible and tappable on
the sign-in page, the venue home, a game, a legal page and the Partner Dashboard; and the venue home
has no gap. Also confirm the website in mobile Safari looks unchanged or better.

---

### Phase 2E — App front door: guests to games, partners to the dashboard, no `/info` (Opus 5.5, high)

**Status: built 2026-10-09, committed in `4706072`. As-built: `docs/native-app-store-plan_PHASE_2E_HANDOFF.md`.
The remembered-partner launch and the "Venue partner? Sign in" link were removed in Phase 3B.1 (§2 item 12).**
Deviations from the spec below: the remembered side is a **cookie** (`htc_app_side`, shared
`.hightopchallenge.com` domain), not localStorage, because the partner signs in on the apex and the
launch choice runs on `play.`; and the link-out for marketing pages is **native** (one list in
`native/capacitor.config.json`), which Phase 3 extends for `/admin`, signup and billing.

**Goal (R5, R6, R7):** inside the app, there is no marketing page. The app opens on a front door
that sends a **bar guest** to the player sign-in and games, and a **venue partner** to the Partner
Dashboard. Back never leads to `/info` or to a false "No connection" screen. The website, including
`hightopchallenge.com/info`, is unchanged.

**How other apps do it, and the recommendation (Andrew asked).** Big two-sided products usually ship
**two apps**: Uber and Uber Driver, DoorDash and DoorDash Merchant, Yelp and Yelp for Business,
OpenTable and OpenTable for Restaurants. They do this because each side is a large audience with its
own daily workflow. Smaller products, and ones whose business side is just "manage your account",
usually ship **one app with two sign-in doors**. **Recommendation: keep one app (§2 item 2), with a
clear front door, and revisit a separate "Hightop Partner" app only if partners grow into the
hundreds and ask for one.** Reasons:
- Apple rejects thin "just a website" apps (guideline 4.2). A partner-only app would be mostly a
  dashboard and is the likelier one to be rejected. It would also be judged as a near-copy of the
  player app (4.3).
- Two apps means two listings, two reviews, two sets of screenshots and privacy labels, and twice the
  release work, all for a small partner group.
- Partners pay on the web anyway (Stripe in the system browser), so a partner app adds little.
- Going to two apps later is easy (a second shell over the same site). Merging two apps into one
  later is hard.

**Build:**
1. **`lib/nativeApp.ts`** (pulled forward from Phase 3): `isNativeApp()` reads the
   `HightopChallengeApp/<ver>` user-agent token or `window.Capacitor`. It is the only reader, pinned
   by a contract test. Phase 3 then adds `nativePlatform()`, `nativeAppVersion()` and
   `hasNativeCapability()` to this file, not a second helper.
2. **One "home" for the app.** Add one helper, for example `homeHref()` in `lib/domainSplit.ts`
   beside `marketingHref`: on the website it returns `marketingHref("/info")` (today's behaviour,
   CLAUDE.md rule unchanged), and **in the app** it returns the app front door. Switch every
   current `marketingHref("/info")` "home" control to it (list in R5). A contract test forbids a bare
   `marketingHref("/info")` in those files. CLAUDE.md's "`/info` IS the home page" rule gets a
   one-line note: *on the website*.
3. **Front door = the player sign-in screen** (`play.` `/`, `JoinFlow`'s
   `auth-method-selection`), which guests already see first, plus a plain **"Venue partner? Sign
   in"** link at the bottom that goes to `/owner/login`. In the app, the `/owner/login` Back goes to
   that same front door.
4. **Remember the side.** When a partner signs in inside the app, remember "partner" on the phone
   (localStorage, a convenience only, never trusted for access). On the next launch, if the partner's
   session is still valid, open straight on `/owner/dashboard`. Otherwise show the front door. A
   partner who signs out goes back to the front door. Do it in the web page, not `proxy.ts` (never
   change its default gate behaviour).
   **QR rule (Andrew, 2026-10-08):** someone who scans the join QR (`https://play.hightopchallenge.com`,
   `lib/joinQr.ts`, printed on merch, permanent) is a player, so a scan must always land on the **player
   sign-in**, never the partner dashboard or partner sign-in, even on a phone where a partner once
   signed in. The "remembered partner" shortcut applies **only to a plain launch from the app icon**.
   A launch or resume that came through a link (once Phase 3's Universal Links exist, a QR scan opens
   the app through `@capacitor/app`'s `appUrlOpen` event / `App.getLaunchUrl()`) shows the front door
   (player sign-in). Today, before Universal Links, a scan opens Safari or Chrome on `play.`, and `/`
   there is already the player sign-in (verified 2026-10-08: `play.` `/` serves `JoinFlow`, and nothing
   in it routes to `/owner/*`). Unit-test this case with the front-door choice.
5. **Marketing pages leave the app.** In the app, `/info`, `/faqs`, `/advertise` and any other
   apex marketing page open in the system browser (same link-out mechanism Phase 3 uses for Stripe
   and `/admin`). Legal pages (`/privacy`, `/terms`, `/rules`, `/support`, `/delete-account`) stay
   **inside** the app, because Apple wants them reachable in the app.
6. **R6: the false "No connection" screen.** On the phone, reproduce Back from a legal page with the
   Safari inspector open. Check whether the cancelled `history.back()` plus the fallback navigation is
   what trips `server.errorPath`. Fix both ends:
   - web: with item 2 in place, Back in the app goes to the app home by one navigation, not two
     racing ones;
   - shell: show the offline page only for real network errors (ignore "navigation cancelled",
     iOS `NSURLErrorCancelled` −999 and the Android equivalent), and make "Try again" in
     `native/www/offline.html` reload **the page that failed** (pass its URL in), not the start URL.

   Phase 3's "Offline screen" bullet is then mostly done; Phase 3 only polishes its look.
7. **R7:** re-test the offline screen in **Airplane Mode** on the iPhone and the emulator, and record
   it.

**Cost note:** no new requests; item 4 reuses the dashboard's existing single first-load call
(`GET /api/owner/dashboard`).

**Tests:** contract tests for `isNativeApp()`'s single-reader rule and for `homeHref()`; a unit test
for the front-door choice (no stored side → front door; "partner" + valid session → dashboard;
"partner" + expired session → front door; "partner" + valid session but launched from a link/QR → front
door); `npm run test:god-mode-join` (JoinFlow is touched); and
the full checks. Andrew's device check: the app opens on the front door; the partner link works;
relaunching as a signed-in partner opens the dashboard; no in-app control reaches `/info`; Back from
each legal page works with no "No connection"; Airplane Mode shows the offline screen and "Try
again" returns to the same page.

**Order:** 2C first (it's a live website bug and independent). 2D and 2E can then run in either
order; both need Andrew's iPhone for the final check. Phase 3 follows and skips whatever 2E already
built.

---

### Phase 3 — Production shell (Opus 5.5, high)

**Status: built 2026-10-09, not yet committed. As-built: `docs/native-app-store-plan_PHASE_3_HANDOFF.md`.**
Deviations from the spec below: (1) the minimum-version gate is shown **by the web page**, not the shell, so
it protects every app version ever shipped; (2) **Vercel applies a changed server env var only after a
Redeploy** — "no redeploy needed" below is wrong; (3) icons come from our own
`native/scripts/generate-app-icons.cjs` (root `sharp`), not `@capacitor/assets`; (4) web-only pages are
gated twice: the shell's link-out list (full page loads) **and** a server layout that renders "Open in
browser" in the app (Next router navigations never reach the shell); (5) a small native plugin
`HightopShell.openInBrowser` lets the web send any page to the browser without a store release;
(6) Universal Links / App Links are built but switch on only with the paid accounts (`APPLE_TEAM_ID`,
`ANDROID_APP_CERT_SHA256`, iOS entitlements wiring — handoff §7); (7) iOS uses native geolocation, Android
keeps the web API (it already asks once).

**Goal:** the app you would actually ship, minus the Phase 4/5 features.

**Already done by 2E (don't rebuild):** `lib/nativeApp.ts` with `isNativeApp()` + its contract test;
the native link-out mechanism (`plugins.HightopShell.openInBrowser`, read by
`HightopBridgeViewController.swift` / `HightopWebViewClient.java` — add `/admin`, `/owner/signup`,
`/owner/register` and the billing paths to it, mind that `/owner/login` and `/owner/dashboard` must stay
in-app); the offline page (real network errors only, "Try again" reloads the failed page). Phase 3 still
owns: `nativePlatform()` / `nativeAppVersion()` / `hasNativeCapability()`, Universal Links (and then the
`appUrlOpen` warm-resume case of the QR rule), the min-version gate, icons/splash, Android back button
via the page, the geolocation plugin, and replacing `SpikeViewController` with `HightopBridgeViewController`.

- **One native-detection helper**, for example `lib/nativeApp.ts`: `isNativeApp()`,
  `nativePlatform()`, `nativeAppVersion()`, and `hasNativeCapability(name)`. It reads the
  user-agent token or `window.Capacitor`. It is the **only** reader, and a contract test pins this,
  the same pattern as the flag readers. The web side may add `@capacitor/core` plus plugin JS
  packages, **lazy-loaded only when `isNativeApp()`**, so website visitors download nothing extra.
  Test it with `scripts/measure-owner-load.cjs`.
- **Link-out rules:** inside the app, the following open in the system browser:
  - partner signup (`/owner/signup`, `/owner/register`);
  - every Stripe URL;
  - `/owner/billing/*` payment actions;
  - `/admin`;
  - any non-Hightop link.

  Use Capacitor's Browser or App plugin. The in-app partner menu shows billing status but **never a
  "Subscribe" / "Pay" button**; it says "Manage billing on the web" and opens the browser. Pin this
  with a contract test.
- **Hide the PWA install prompt** inside the app (`isInstallPromptEnabled()` callers also check
  `!isNativeApp()`).
- **Universal Links (iOS) / App Links (Android)** for `play.hightopchallenge.com`, so the printed QR
  and shared links open the app. Serve `/.well-known/apple-app-site-association` (with no extension,
  `Content-Type: application/json`) and `/.well-known/assetlinks.json` from Next route handlers on
  **both** hosts. Add a narrow `/.well-known/*` pass-through in `proxy.ts` and `lib/domainSplit.ts`,
  with tests in `tests/proxy.behavior.test.ts`.
- **Offline screen:** a bundled native "No connection, tap to retry" page instead of a blank web
  view.
- **Minimum-version gate:** a public `GET /api/app/config` returning
  `{ minSupportedVersion, latestVersion }` from server env vars (no redeploy needed). The shell shows
  a "Please update Hightop Challenge" screen below the minimum. Cost: one tiny request per cold
  launch. Cache it with `s-maxage` at the CDN so it costs nearly nothing.
- **Icons and splash** generated from the brand art under a **new file name** (the `/brand/web/`
  files are immutable-cached), using `@capacitor/assets`. Status bar colour matches the theme.
- **Android back button** wired to the same behaviour as `useExitNavigation`, without duplicating
  that logic in the shell; call into the page.
- Permissions strings (`Info.plist`): location, camera, and Face ID usage descriptions, written in
  plain friendly copy.

**Tests:** contract tests for the helper's single-reader rule and the link-out rules; the proxy
`.well-known` tests; `npm run test:pwa-contract`; and the full checks. Andrew: device checklist
`docs/native-app-device-checklist.md`, created in this phase.

---

### Phase 3B — Player-only app, clearer partner sign-in on `/info`, Square logo (before Phase 4)

**Status: 3B.0 done (2D+2E+3 committed as one local commit `4706072`); 3B.1 built and verified
2026-10-09, committed locally (handoff `docs/native-app-store-plan_PHASE_3B1_HANDOFF.md`); 3B.2 built and verified 2026-10-09, committed locally (handoff `docs/native-app-store-plan_PHASE_3B2_HANDOFF.md`); 3B.3 (Andrew) next.**
Andrew's decision: §2 item 12. Each sub-phase writes
`docs/native-app-store-plan_PHASE_3B<N>_HANDOFF.md` (for example `…_PHASE_3B1_HANDOFF.md`) and updates
the status line at the top of this file.

**Why the Home button is still on Andrew's phone today.** The app loads the live website, and Phases 2D,
2E and 3 are not deployed. On the live site the app's sign-in still shows the website's "Home" button.
Uncommitted Phase 2E swapped it for "Venue partner? Sign in". Phase 3B removes both, so the app's
sign-in shows neither.

**Prerequisite (Andrew, 3B.0):** commit 2D, 2E and 3 locally first (three commits, as the Phase 3 handoff
recommends), so that 3B is its own reviewable change. Pushing can wait and go out together with 3B.
Never `git checkout -- <file>` in this tree.

**Order:** 3B.1 and 3B.2 touch different files and can run in either order, or in parallel. 3B.2 is
website-only and can ship on its own. 3B.3 comes after both.

#### Phase 3B.1 — The app is player-only (Opus 5.5, high)

**As built (2026-10-09), deviations from the steps below:** the in-app gate for `/owner`, `/tv` and
`/admin` is in **`proxy.ts`** (an app-UA request for a web-only page is rewritten to the static page
`app/in-app-notice/[page]`, URL unchanged), **not** an `app/owner/layout.tsx` + `WebOnlyInApp`. A layout
that reads the User-Agent would have turned all ~14 static `/owner/*` pages and `/tv` into per-visit
renders; the proxy already runs on every request, so this costs nothing and browsers keep the static
pages. `WebOnlyInApp` and all four per-page layouts (including `app/admin/layout.tsx`) are deleted.
`nativeLaunchUrl()` was removed (no caller left). iOS Universal Links on `play.` also exclude
`/owner`, `/tv`, `/admin`. Details: the 3B.1 handoff.

**Goal:** inside the app there is no partner surface. The website is unchanged for every browser visitor,
including partners on phones.

1. **The app's sign-in has no Home button and no partner link.** In `components/join/JoinFlow.tsx`
   (the `inNativeApp ? … : …` block at the bottom of the page, ~line 3335), the app branch renders
   nothing. The website branch keeps its Home button (`homeHref(false)` → `/info`), unchanged. Check
   `JoinFlow`'s other panels (venue list, username, PIN, create account) for any other Home or `/info`
   control that the app shows, and route each one through the existing `homeHref(isNativeApp())`.
2. **Remove the remembered-partner launch.** Delete `components/join/AppFrontDoor.tsx`,
   `lib/appFrontDoor.ts` and `tests/lib.app-front-door.test.ts`. `app/page.tsx` renders `JoinFlow` for
   everyone again; drop the user-agent read if nothing else needs it. Remove the callers:
   `rememberPartnerSide()` in `app/owner/login/page.tsx`; `isAppLaunchEntry` /
   `readRememberedAppSide` / `forgetAppSide` / `rememberPartnerSide` in `app/owner/dashboard/page.tsx`
   (~lines 430–445, including its `window.location.replace(homeHref(true))`); `forgetAppSide()` in
   `components/navigation/SignOutButton.tsx`. Andrew's QR rule ("a scan always lands on the player
   sign-in") now holds by construction: the app has no other door. Keep `nativeLaunchUrl()` in
   `lib/nativeApp.ts` if Universal Links still need it; otherwise remove it with its test. The leftover
   `htc_app_side` cookie on test phones is harmless once nothing reads it; it expires on its own.
3. **Every `/owner/*` page leaves the app.**
   - `lib/nativeLinkOut.ts`: replace the `/owner/signup`, `/owner/register` and `/owner/billing/setup`
     entries in `APP_WEB_ONLY_PAGES` with one **`/owner`** entry. Suggested copy: title "The Partner
     Dashboard is on our website", body "Venue partners sign in at hightopchallenge.com in any web
     browser. This app is for players." Update the file's header comment, which currently says "never
     list `/owner` itself".
   - `native/capacitor.config.json` `plugins.HightopShell.openInBrowser.paths`: the same change (the
     shell's matcher treats an entry as itself plus everything below it). `tests/native-app-contract.test.ts`
     fails if the two lists drift.
   - Add `app/owner/layout.tsx` → `<WebOnlyInApp path="/owner">`. This catches Next router
     navigations, which never reach the shell. Delete the three per-page layouts it replaces
     (`app/owner/signup/layout.tsx`, `app/owner/register/layout.tsx`, `app/owner/billing/setup/layout.tsx`).
     First confirm each holds nothing but the `WebOnlyInApp` wrapper (signup's does). Keep
     `app/admin/layout.tsx`.
   - Check `app/owner/loading.tsx` still works under the new layout, and that `WebOnlyInApp` only
     reads the request's user-agent: website `/owner/*` pages must stay as fast as today. The Phase 3
     handoff notes these pages became per-visit renders. Run `scripts/measure-owner-load.cjs` before
     and after and report the numbers.
   - `/tv` and `/owner/display` (the venue TV screen) are partner surfaces. `/owner/display` is covered
     by `/owner`. `/tv` is served on both hosts (`lib/domainSplit.ts` ~line 147); add it to the link-out
     list too, unless that breaks the TV pairing flow on a real TV browser (it can't: TVs don't run our
     app).
4. **Remove in-app partner code that is now dead.** `components/native/ManageBillingOnWeb.tsx` and the
   `inNativeApp` branches in `app/owner/billing/page.tsx`; the native-only `homeHref(true)` uses in
   `app/owner/billing/setup/page.tsx` and in `SignOutButton.tsx`'s partner variant; any native branch in
   `components/owner/OwnerShell.tsx` or `components/signup/*`. Keep the hard rule "never a Subscribe/Pay
   button in the app". It is now enforced by the `/owner` gate, so rewrite its contract test to pin
   that `/owner` is web-only in both lists.
5. **Universal Links / App Links:** `lib/nativeAppLinks.ts` already claims links only on `play.`, and
   `/owner/*` lives on the apex, so partner emails and links already open the browser. Keep it that way
   and add a test asserting the apex claims no links.
6. **Legal pages stay in the app.** Grep `/support`, `/terms`, `/privacy`, `/delete-account` and
   `lib/legalInfo.ts` for wording that tells partners to use the app ("sign in in the app", "in the
   app's Partner Dashboard") and change it to "in your web browser at hightopchallenge.com". No legal
   page in the app may link to pricing or Stripe.
7. **Docs and rules, in the same change:**
   - `CLAUDE.md` "Native app" bullets: "One Capacitor app … for players AND partners" → players only.
     Replace the Phase 2E front-door bullet (remembered partner, `htc_app_side`). Update the Phase 3
     link-out bullet (`/owner` in the list).
   - This plan: Phase 6's reviewer notes no longer need a demo partner login, and the listing copy is for
     players only (see Phase 6). Add a §5 hard rule: "No partner surface in the app."
   - Mark the open question in `docs/native-app-store-plan_PHASE_3_HANDOFF.md` §"What needs you" item 3
     as answered (one line pointing to §2 item 12; leave the rest of that history alone).
8. **Shell:** the config change needs `npx cap sync` and a rebuild of both apps (commands: Phase 2A
   handoff §5–§6; `JAVA_HOME=/opt/homebrew/opt/openjdk@21`, Gradle output in `~/Library/Caches/hightop-native/`).
   The app is not in a store yet, so this costs no store release. The web-side `/owner` gate covers any
   older test build.

**Cost:** zero new requests. It removes one cookie read on each app launch and one dashboard branch.
`/owner/*` render cost is unchanged (`WebOnlyInApp` is already on the signup and billing pages).

**Tests:** `tests/native-app-contract.test.ts` (updated lists, `/owner` web-only, no
`marketingHref("/info")` in home controls), `tests/navigation-controls-contract.test.ts`,
`npm run test:god-mode-join` (JoinFlow is touched), `npm run test:pwa-contract`, then
`npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`. Don't run typecheck alongside
the build. Simulator/emulator: the app's sign-in shows no Home and no partner link; a link to
`hightopchallenge.com/owner/login` opens Safari/Chrome; a Next-router hop to `/owner/*` shows the
"on our website" notice.

#### Phase 3B.2 — `/info`: obvious Partner Login and the Square logo (Sonnet 5.5, medium)

Website only (`app/info/page.tsx`). Inside the app, `/info` opens in the system browser, so this never
shows in the app.

1. **Phones can see Partner Login without opening the menu.** Today, below `md`, "Partner Login" exists
   only inside the hamburger menu (~line 448). Add a compact, clearly-a-button **"Partner Login"** to the
   header bar beside the menu toggle on phones: a bordered pill with an icon such as Lucide `LogIn`,
   ≥44 px tall, readable at 360 px wide without crowding the logo. Restyle the desktop header's
   text-only "Partner Login" (~line 414) as the same outlined button, next to "Get Started".
2. **Hero:** replace the transparent "Already a partner? Sign in" pill (~line 540) with a solid,
   high-contrast button labelled **"Partner Login"**. Under the hero buttons, add one plain line that
   tells partners the dashboard is browser-based. Suggested copy, for Andrew to approve: *"Venue
   partners: schedule games, set rewards and manage billing from any web browser — no app needed."*
   This is the line that answers the "do partners use the app?" question on the page itself. When
   Phase 7 adds the store badges, label them "For players".
**Andrew's inputs (2026-10-09) — don't re-ask:**
- **Copy approved:** the "Venue partners: schedule games, set rewards and manage billing from any web
  browser — no app needed." line in item 2, as written.
- **Square artwork supplied:** `public/info/Square-brand_white.png` (untracked until 3B.2 commits it).
  It is Square's official **"Built with Square" badge**: a white rounded button, black Square mark and
  black "Built with Square" text, 1125×320 px PNG with transparency, **1.46 MB**.
- **Square's guidelines, as Andrew pasted them:** "Do not alter the button or badge. Do not change the
  proposition. Do not change the color. Give a good amount of clear space around the logo: at least 40
  pixels."
- What that changes in item 3 below: it is a **badge, used whole** — never cropped to the square mark,
  recoloured, redrawn or re-worded, and never fused into one line with our own text. Keep at least
  **40 px clear space** on every side, so it sits on its own row near "Works with your Square
  register!", not inline at text height (the ~20–24 px inline idea below is superseded). Scaling it down
  for the web is fine (that is not altering it); serve an optimized copy (for example a 2× WebP/PNG at
  the display size, well under 50 KB) under a new path, keeping the original as the source.

3. **Square logo next to "Works with your Square register!"** (~line 553):
   - Use **official Square artwork only** (Square's press / brand-assets page), never a redrawn or
     recoloured mark. On the dark hero, use their white / reversed version. Andrew downloads the file
     or approves the one the agent fetches, and confirms Square's brand guidelines allow a "works with"
     use. Do not imply a partnership or endorsement; the existing wording does not.
   - Save it under a new path such as `public/brand/partners/square-logo-white.svg`. Do not put it in
     `public/brand/web/`, which is cached immutably for a year. Render it with `next/image` (SVG) and
     `alt="Square"`, at a height that matches the text (about 20–24 px). Lay it out as one row (logo +
     text) that wraps cleanly at 360 px.
   - Optional, Andrew's call: the same logo on the `#pricing` / features copy if it mentions Square.
4. **Constraints:** Tailwind only, the 12 px text floor (`text-caption` minimum), and every
   `/owner/login` link stays a plain `<a href="/owner/login">` (apex page). Partner Login must stay
   visible on the website: there is no "web-only" gating on `/info`.

**Tests:** a small render or contract test that `/info` has a Partner Login link visible at phone width
(not only inside the menu) and that the Square image is present with alt text;
`tests/text-size-floor-contract.test.ts`; lint, typecheck, test, build. Screenshots at 390 px and
1280 px (Playwright on `npm run dev`) for Andrew in the handoff. **Cost:** one small static SVG on
`/info`, CDN-cached.

**As built (2026-10-09):** phone header "Partner Login" button (`md:hidden`, 44 px) + outlined desktop
button; solid white hero button + the approved line; the badge shown whole (`public/brand/partners/
built-with-square-badge.webp`, 352×100, 3 KB, from `assets/partner-src/…png` via `npm run
square-badge:image`) on its own row with 40 px clear space, not a link. Test:
`tests/info-partner-login-contract.test.ts`. Screenshots: `docs/native-app-store-plan_PHASE_3B2_screenshots/`.

#### Phase 3B.3 — Device check (Andrew, ~15 minutes)

After 3B.1 and 3B.2 are deployed and the shell rebuilt:
1. App (iPhone + emulator): the sign-in has no Home and no partner link; Back on the first screen does
   nothing harmful (Android puts the app in the background); legal pages open and Back returns to the
   sign-in.
2. From inside the app, any partner link (for example on `/support`) opens Safari/Chrome on
   `hightopchallenge.com`, never the dashboard inside the app.
3. Phone **browser** (not the app): `hightopchallenge.com/info` shows Partner Login in the header
   without opening the menu, the hero button is easy to see, and the Square logo looks right. A partner
   can still sign in and use the dashboard in mobile Safari/Chrome exactly as before.

---

### Phase 4a — Native share + haptics (Sonnet 5.5, medium)

- "Invite friends" and "share my win" use `@capacitor/share` in the app and `navigator.share` or
  copy-link on the web. Haptics (`@capacitor/haptics`) fire on a correct answer, a bingo or a prize
  won. They respect Reduce Motion and are capability-checked through `hasNativeCapability`.
- No new server work.

### Phase 4b — In-app QR scanner (Sonnet 5.5, high)

- A "Scan QR" button on the join and venue-list screens, **app only**. Use a maintained Capacitor
  barcode plugin; pick one at implementation time and check its maintenance status.
- **Only accept our own URLs** (`play.hightopchallenge.com` / `hightopchallenge.com`). Anything else
  shows "That's not a Hightop code." Never navigate to an arbitrary scanned URL.
- Camera permission is requested only on tap, never at launch.

### Phase 4c — Face ID passkeys in the app (Opus 5.5, xhigh)

**2026-10-25: iOS LIVE/VERIFIED; Android association/server verifier LIVE, device ceremony pending.** Handoff:
`docs/native-app-store-plan_PHASE_4C_HANDOFF.md`. iOS uses WKWebView's existing WebAuthn flow, with the paid-team
entitlements/AASA already present; no native plugin or iOS source change is needed. Andrew saved a passkey for
`appreview`, then successfully signed in with Face ID in the native app and Safari.

**Production correction:** the original account-centric migration made `webauthn_challenges.account_id NOT NULL`,
but the front-door Face ID button is discoverable authentication (identity unknown until the authenticator returns
a credential). Live options returned HTTP 400 with an account_id not-null violation, shown as the misleading
"no passkey saved" message. Andrew explicitly approved applying **20261025150000** on 2026-10-25. It permits
identity-less authentication challenges while requiring an account or legacy profile for registration. Applied
alone to linked project `pkmxupsayzshvpirkaav`; live options HTTP 200 verified at **2026-10-25T14:40:16Z**. No
existing passkey/player rows were changed by the migration. It is immutable applied history; do not edit/reapply.

**Android:** feature-checked `WEB_AUTHENTICATION_SUPPORT_FOR_APP` + official Credential Manager 1.6.0; the emulator
reports support level 1 and exposes the passkey API/sign-in control. `getExpectedPasskeyOrigins` in `lib/webauthn.ts`
accepts only exact certificate-derived Android origins alongside the challenge's own web origin, only on the
allowed production RP. Certificates come from the existing `readAndroidCertFingerprints` reader, so Digital Asset
Links and verification share one configuration; no broad origin allowlist or native plugin is added.
Andrew supplied the Play signing SHA-256, added as `ANDROID_APP_CERT_SHA256` in the confirmed production project.
Both `assetlinks.json` URLs now return **200** with that exact certificate; Google's DAL API confirms all three
intended relationships. Web verifier/native implementation and applied migration record are committed/pushed at
**7aacf153**, READY **dpl_2Y9ixHxGcj5ijT5P5pNfSSkjYxvx**. No new migration ran. Native options smoke passed.
Google Production build **1.0.0 / code 2** is In review by Andrew's report. Still test Android passkey creation,
sign-in and browser interchange in the **Play-installed** build; do not substitute the debug or upload certificate.
Andrew originally created the Play record as App; recommended Game → Trivia change remains unconfirmed.

**Gates:** 5,551 tests passed / 13 environment skips; typecheck, source lint (`npm run lint -- --ignore-pattern 'tmp/**'`),
web build, Android debug build/unit tests and real PostgreSQL constraint regressions pass. Plain `npm run lint`
also scanned ignored historical release copies under `tmp/` and failed there; no such artifacts were changed.
Those initial gates preceded publication. The selected release now also passes 5,530 isolated tests / 13 skips,
typecheck/lint/217-page build; live associations and exact deployment source verified. Andrew manually uploaded and
submitted Android build 2; the agent deployed the selected server code only. Broad cross-device and 7+ day checks
remain open; exact tested rows are in `docs/PASSKEY_CROSS_DEVICE_MATRIX.md`.

- Implement whichever approach Phase 2 proved, either the web view's own WebAuthn or a native
  plugin. If native: add the Android origin to `WEBAUTHN_ALLOWED_ORIGINS` (via `vercel env add`,
  never `vercel env rm`/`pull`) and keep `lib/webauthn.ts` the single verifier.
- Re-run the cross-device matrix in `docs/PASSKEY_CROSS_DEVICE_MATRIX.md` and add app rows. A passkey
  made in the app must work on the website and the other way round, since both use the same RP ID.

---

### Phase 5 — Push notifications (Opus 5.5, high)

**Design (cost-conscious):**
- **Firebase Cloud Messaging for both platforms.** FCM delivers to iOS through an APNs auth key
  (`.p8`, created in the Apple Developer account). It is one free API.
- A new table `push_devices` (user id, venue id, platform, token, app version, created/last-seen,
  disabled). It needs a migration with an explicit `service_role` grant per
  `SECURE_TABLE_MIGRATION_CHECKLIST.md`, no browser access, and `tests/supabase-migration-grants-contract.test.ts`
  must pass. Registration and refresh go through an authenticated route bound to the session.
  Unregister on sign-out, wired into `performSignOut`, which is the only teardown path.
- **Hook point:** push is sent wherever an in-app notification is created. For the TypeScript paths,
  fan out from `createNotification()` in `lib/notifications.ts`. **Bingo wins are written by the
  atomic-grading SQL RPC**, so either have the Bingo caller send after the RPC succeeds, or add a
  small outbox sweep to an **existing** per-minute cron (`/api/cron/bingo-progress`). Do **not** add
  a new cron without asking Andrew (`vercel.json` boundary).
- **"Live game starting soon" at your venue:** add it to an existing scheduled path. The live-trivia
  crons already run every 5–15 minutes. One bounded query per run (games starting in the next window)
  → one batched FCM send per venue. Never one query per user.
- **Preferences:** a per-category on/off in the account drawer (game starting, prizes, results).
  Marketing pushes are **off unless the player opts in** (Apple 4.5.4). Ask for permission at a
  meaningful moment, after the first game, not at launch.
- Dead tokens returned by FCM get disabled immediately (no retry storms).

**Order (2026-10-22): build Android first.** FCM to the Android emulator needs only the free Firebase
project (Phase 0 item 6), not the Google Play account, so the device registry, sending, preferences and
the permission moment can all be built and proven before Apple approves the paid account. The iOS half
(APNs `.p8` key uploaded to Firebase, the Push Notifications capability) follows on the same code.

**The two sessions (split 2026-10-23, Opus 5.5, high; handoffs `…_PHASE_5_1_HANDOFF.md`, `…_PHASE_5_2_HANDOFF.md`).**
- **5.1 — server, website and Android.** Migration (`push_devices`, `push_game_reminders`,
  `notifications.pushed_at`, `claim_notification_pushes` RPC) + SQL proof; `lib/push/*` (FCM HTTP v1
  sender with no SDK, the notification outbox, the game-starting sweep); `POST /api/push/devices`
  (register / preferences / unregister, bound to the signed session); the app-only permission card after
  the player's first points at a venue, the Notifications settings in the account drawer, tap-to-open,
  unregister in `performSignOut`; `@capacitor-firebase/messaging` in the shell, the Firebase Android app
  and `google-services.json`; the FCM sender credential (`FCM_SERVICE_ACCOUNT_JSON`, Andrew approved
  2026-10-23) and applying the migration (approved 2026-10-23). Proven end to end on the Android emulator.
  **The outbox hook is the `notifications` table itself, not `createNotification()`:** eight TypeScript
  files and two SQL functions (Bingo grading, prediction settlement) insert notifications directly, so a
  per-minute claim of new rows (inside the existing `/api/cron/bingo-progress`, after the Bingo refresh)
  is the only hook that catches every writer. No new cron.
- **5.2 — iPhone.** Firebase iOS app + `GoogleService-Info.plist`, the Push Notifications capability and
  `aps-environment` entitlement, Background Modes → Remote notifications, the AppDelegate APNs hand-off the
  plugin needs; Andrew creates the APNs `.p8` key in the Apple Developer account and uploads it to Firebase
  (the one step no agent can do). Proven on Andrew's iPhone.

**Phases 5.3–5.5 (Andrew, 2026-10-23, after his first iPhone push test). Opus 5.5, high.**
- **Location fix (done in the 5.2 session, 2026-10-23):** "Location took too long" on sign-in and on a venue tap.
  `lib/geolocation.ts`: in the iPhone app the permission prompt is asked first, untimed
  (`ensureNativeLocationPermission`), so reading the prompt no longer eats the 8 s budget; `getCurrentLocation`
  falls back to a quick low-accuracy fix after a precise-fix timeout/unavailable (a denial stays final).
  Tests: `tests/lib.native-location-budget.test.ts`.
- **5.3 — the first ask + new wording.** **BUILT 2026-10-23** (handoff `…_PHASE_5_3_HANDOFF.md`). Andrew: "our screen first". After the first sign-in in the app, one
  full screen of our own ("Want to know the moment you win?" + the benefits) with Turn on / Not now; Apple's
  popup only on Turn on, so "Not now" keeps it for the in-game card. The Venue Home card stays as the reminder
  (benefit-led wording, e.g. "Want to know when you win?"). **Ads:** Andrew plans popup ads on the home page next —
  the welcome screen and a popup ad must never show in the same visit (welcome first; `PopupAds` waits). The
  wording that promises "when this bar schedules games and adds prizes" ships WITH 5.4, never before (Apple
  rejects asks that promise pushes the app doesn't send).
- **5.4 — automatic "new at your bar" pushes.** **BUILT 2026-10-23** (handoff `…_PHASE_5_4_HANDOFF.md`). Andrew: automatic, sent when a partner saves a new game or prize,
  to players of that bar who leave a new switch on ("News from your bars" — a 4th category in
  `lib/pushCategories.ts`, explicit consent language on the ask, Apple 4.5.4). Cap: **5 automatic game/prize pushes per bar per day**
  (Andrew confirmed 2026-10-23; separate from 5.5's 2 partner-written messages; he may change both later, so
  keep each cap a single named constant). One bounded audience read + one batched FCM send per event; no new cron.
- **5.5 (was "5b") — partner-written messages.** **BUILT 2026-10-23** (handoff `…_PHASE_5_5_HANDOFF.md`). Andrew: build with limits, **2 per bar per day**, short
  (≈150 characters), sent only to that bar's players with "News from your bars" on. Compose box on the Partner
  Dashboard (website only — never in the app). Needs review/abuse rules (words filter, report, admin kill switch).

**Partner-sent pushes — superseded by 5.5 above (was open question §6 item 4).** Everything above is
system pushes (game starting, prizes, results). A partner composing a message to "their regulars" (the
Reel ad's line, `docs/reel-video-assets-plan.md`) is a separate feature: a compose screen on the Partner
Dashboard (website, never the app), sent only to players of that venue who opted in to marketing pushes
(Apple 4.5.4), a per-venue cap (for example 2 per week), review/abuse controls, and one batched FCM send
per message. If Andrew wants it, it becomes **Phase 5b** (Opus 5.5, high) after Phase 5.

**Cost estimate to confirm in-phase:** FCM is $0. For 1,000 active players, 3 pushes/day ≈ 3,000
sends/day spread across a handful of batched calls per cron run: well under 1,000 extra function
invocations/day, and a few thousand small DB reads/writes per day. That is negligible at current
volume and stays small at 10×. Measure a baseline before and after, and report the difference.

---

### Phase 6 — Store listings and submission (Sonnet 5.5, medium + Andrew)

**Progress, 2026-10-25:** reviewer account and visible demo venue are ready (§2 items 13–15). Live account login
and demo profile join both returned HTTP 200 without location; the join issued a player session cookie. The shared
active Speed Trivia catalog is readable (single-row availability check); no demo prize, scheduled game or answer was
created. The submission pack no longer claims native Face ID sign-in or a preloaded prize coupon. Android's cached
**debug merged manifest** contains `POST_NOTIFICATIONS`, contributed by `@capacitor-firebase/messaging`; still inspect
the final release AAB before filling its permissions form. iOS source confirms paid team `2U7HMXGQM3`, bundle
`com.hightopchallenge.app`, and universal iPhone/iPad support in both configurations.

**Still pending (latest 2026-10-25):** Apple app record creation, then archive upload/processing and internal
TestFlight install; iPhone delivery checks (Andrew confirms APNs key uploaded); remaining device checklist,
including item 33; Play-installed Android passkeys and Part B persistence; screenshots including iPad; actual
Apple privacy/rating forms, Andrew's legal review and Apple submission. Google build 2 is already in Production
review by Andrew's choice; do not recreate a release solely to insert an internal-testing step. Verify its public
availability and Play-installed behavior after approval. The bundle ID was accepted for the authorized first
Android release. Phase 5.5's source/flag remain separate; its migration is already in remote history.
The optional rating prompt remains undecided. Phase 7 waits for live store URLs; keep its URL constants empty.

**Follow-up 2026-10-25:** iPhone native passkey creation, native Face ID sign-in and use of the same passkey in
Safari now pass (Phase 4c, above). Paid-team signing is independently verified. Migration `20261025150000` was
explicitly approved and applied; this does not require an iOS rebuild. Separately, the production migration history
already contains `20261023145024` (Phase 5.5), contrary to the older notes; it was not applied in this session and
its deployment/flag was not inspected. The passkey dry run and apply included only `20261025150000`.

- **Reviewer access:** create a God Mode reviewer account (for example username `appreview`) and a
  demo venue with anytime games stocked. Put the credentials and these points in the App Review
  notes:
  - venues are location-based, and this account bypasses that;
  - ~~the partner sign-in link and a demo partner login~~ — dropped 2026-10-09: the app is
    player-only (§2 item 12), so there is no partner login to review;
  - which native features to try.
- **Apple:** App Privacy labels (from Phase 1a's inventory), the age-rating questionnaire (answer
  honestly; bar/alcohol references and contests may raise it), category (Games → Trivia, or
  Entertainment), screenshots at the sizes App Store Connect currently requires (check at the time),
  the support and privacy URLs, and **US-only availability**. TestFlight internal test first.
- **Google:** the Data safety form, the content rating questionnaire (IARC), declaration of the
  contests/prizes policy, phone screenshots and a feature graphic, US-only availability, the
  account-deletion URL (`/delete-account`). Internal testing track first, then production.
- Write the listing copy for **players only** ("Play trivia, bingo and pick 'em at your local bar —
  compete for bragging rights and real prizes"). No partner line, no pricing (§2 item 12).
- Plan for possibly one rejection round; the handoff records any rejection text verbatim.

### Phase 7 — Home page links (Sonnet 5.5, medium)

**Built locally 2026-10-25, uncommitted/not deployed/not enabled.** Switch defaults off, both verified
live URLs required. PWA promotion retired in the working tree; manifest/standalone behavior retained.
Activation and actual Safari banner behavior remain open. Files, gates, cost and next steps:
`docs/native-app-store-plan_PHASE_7_HANDOFF.md`.

- Official **App Store** and **Google Play** badges on `/info`, using each company's official badge
  artwork and following their usage rules (no custom-drawn badges). Show the right one first by
  device; on desktop, show both plus a QR code.
- An Apple Smart App Banner (`<meta name="apple-itunes-app" content="app-id=…">`) on `play.` pages.
  It shows only in iOS Safari, never inside the app. On Android, a small dismissible "Get the app"
  bar, hidden inside the app.
- **The player sign-in points to the app (Andrew, 2026-10-22).** On `play.` in a phone browser, the
  `JoinFlow` entry screen (`auth-method-selection`, "How do you want to continue?") shows one quiet line
  — "Get the app" + the one store badge for that device (both on desktop) — below the sign-in choices,
  never in front of them, never blocking sign-in. **Never inside the app** (`isNativeApp()` /
  `nativeAppRequest`, which `app/page.tsx` already passes). **Players only:** nothing on `/owner/*` or
  `/info`'s partner area ever points a partner at the stores. Built behind the same flag as the `/info`
  badges, switched on only once both listings are live. Run `npm run test:god-mode-join` (it touches
  `JoinFlow`) and keep the "minimal and simple" rule: one line, no popup.
- A new short link **`/app`** that sends iPhones to the App Store, Android to Google Play, and
  desktops to `/info#app`. It is for future printed material. **The existing printed QR stays
  `play.hightopchallenge.com`**; it already opens the app through Universal Links.
- Store URLs come from env vars or one constants file, not scattered literals.
- **Retire the PWA install prompt** (decided). Remove the prompt UX and its flag reader in
  `lib/pwa.ts` / `components/bingo/SportsBingoHome.tsx`, and update `npm run test:pwa-contract`
  plus `docs/pwa-install-rollout-runbook.md`, marking it superseded. **Keep `app/manifest.ts` and the
  Apple meta tag:** they still give browser players fullscreen Bingo landscape and are harmless.
- **The browser path stays visible** (decided). `/info` shows the store badges, labelled "For players",
  *next to* a "Play in your browser" button (→ `gameHref("/")`) and the Partner Login made prominent in
  Phase 3B.2. The Smart App Banner
  and the Android "Get the app" bar are dismissible and stay dismissed (per-viewer `localStorage`,
  wrapped in try/catch). `/app` on desktop, or anywhere a store can't be detected, lands on `/info`
  with both choices, never a dead end.

### Phase 8 — Release process (Haiku 4.5, low)

**Progress 2026-10-25:** `docs/native-app-release-runbook.md` is prepared with commands checked against
the current source, signing helper, successful archive/export and local Xcode export options. The end-to-end
update rehearsal is still pending; do not mark Phase 8 complete. Handoff:
`docs/native-app-store-plan_PHASE_8_HANDOFF.md`.

- Write `docs/native-app-release-runbook.md`. It covers:
  - which changes are web-only (deploy as today) and which need a store build;
  - how to bump the version;
  - building and archiving in Xcode / Android Studio;
  - TestFlight and the internal track;
  - phased release;
  - raising `minSupportedVersion`.
- Do one dry-run native update, such as a trivial splash tweak, end to end.

---

### Phases 9a–9f — "Share my win" that sends people to the bar and to the app (added 2026-10-22)

**Andrew (2026-10-22):** finish win-sharing and give players ready-made social posts that send
whoever sees them to (1) the venue where the player won and (2) the Hightop Challenge app.

**Andrew's decisions (2026-10-22, second round). Don't re-ask:**
1. **The camera is never required.** Every win gets ready-made content to share with no photo. A selfie
   is an optional extra for those who want one.
2. **What gets packaged:** game wins and prizes won.
3. **Every design shows the bar's name and its physical address** (street + city, from the address
   the partner gave at signup: `venues.address` / `venues.city`). **No directions**: no Maps button,
   no Maps link.
4. **A prize win names the prize.** Andrew's wording: **"I just won [value of the prize] off my tab at
   [name of the business]!"** Exact text for each prize kind (the value comes from `prizeCardFace`):
   - gift card with an amount: **"I just won $15 off my tab at The Pour House!"** (Andrew's wording exactly);
   - any other prize, where "off my tab" would be untrue (a free appetizer, "50% off an Appetizer",
     a bottle of wine, a gift card with no amount): **"I just won a Free Appetizer at The Pour House!"**
     (approved by Andrew 2026-10-22; edit it in the one copy file);
   - a game win with no prize: **"I just won Live Trivia at The Pour House!"** (approved by Andrew 2026-10-22).
   The business name is the venue's display name (`getVenueDisplayName` / `venues.displayName`, else `name`).
5. **Two sizes:** Story (1080×1920) and feed post (1080×1350).
6. **Meta App ID:** Andrew creates it (steps in Phase 9d).
7. **No public venue page (Andrew, 2026-10-22, third round).** Every share's link and QR point to the
   **app download link** `hightopchallenge.com/app` (Phase 9a). The bar is named on the picture and in
   the text only.
8. **Tagging the bar is left to the player.** The share sheet shows one nudge line, "Tag <bar> in your
   post". There's no auto-tag. **Superseded in part by decision 10.**
9. **The two wording variants in item 4 are approved** (Andrew, 2026-10-22).
10. **The venue's Instagram handle goes in the caption (Andrew, 2026-10-22, fourth round: "Let's do the
    caption").** Instagram and Facebook don't let any app pre-tag an account on a shared picture, and an
    Instagram Story can't be pre-tagged by any means. What works: the copied caption carries "@thepourhouse",
    which is a real mention in an Instagram post caption, on X and on Facebook. The handle can also be printed on
    the picture (not tappable). Phase 9e builds this.
11. **The partner chooses what a share shows (Andrew, 2026-10-22): "When partners offer prizes and schedule
    games, let's give them the option to have their instagram handle, name, address (all 3, none or some
    combination) appear on the social media shareable content."** Three independent on/off choices: handle,
    name, address. This supersedes decision 3's "every design shows the bar's name and address": that is now
    the default, not a rule. Phase 9e builds it.
12. **`/app` may ask "Get the app?" on a phone (Andrew, 2026-10-22: "Plan the above feature").** A small page
    with "Get the app" and "No thanks, play in the browser" instead of an immediate store redirect. Phase 9g.

**What exists today (verified 2026-10-22).** Built from `docs/bar-victory-story-share-master-plan.md`
(July 2026) + Phase 4a.1:
- "Create story" (`components/social-share/StoryShareLauncher.tsx` → `StoryCaptureModal.tsx`): a
  **front-camera selfie** under a branded frame (`public/story-frames/{live-trivia,category-blitz}/`),
  with rank, score, % correct, username, venue name, a caption preset (`lib/socialShare/copyPresets.ts`)
  and a "Play at Hightop" / "Play Category Blitz" line, drawn on canvas (`lib/socialShare/storyCanvas.ts`,
  layout in `storyPayloads.ts`) at 1080×1920.
- Share: the phone's share sheet with the picture (`sharePipeline.ts`; native on Android via
  `lib/nativeImageShare.ts`). Fallback sheet (`ShareActionsSheet.tsx`): save the picture, "Open
  Instagram/Facebook" (camera roll, no link attached, `deepLinks.ts`), or share a link.
- **Only two places:** Live Trivia post-game (`app/trivia/live/page.tsx`) and Category Blitz completion
  (`components/category-blitz/CategoryBlitzGame.tsx`). `StoryShareGameType` = those two only.

**Gaps this finishes:**
1. **Nobody can find the bar from the post.** The picture has the venue *name* only: no city, no
   address, no link, no QR. The shared link is the generic `JOIN_QR_URL`
   (`play.hightopchallenge.com`), not the venue. There's no public page for a venue at all
   (`/venue/[venueId]` is the signed-in hub behind `proxy.ts`).
2. **Nothing points to the app.** No "Get the app" on the picture or in the link.
3. **The camera is required.** Camera denied, a dark bar, or a shy player all mean no post. There's
   no ready-made design without a photo.
4. **Most wins can't be shared:** a prize won, Bingo, Pick 'Em, NFL Pick 'Em, Fantasy, Squares and
   Bracket have no share at all.
5. **Story size only.** There's no 4:5 feed-post size, and no ready caption that names the bar or tags it.

**Facts that shape the design (don't re-research):**
- A web page **can't put a clickable link into an Instagram Story or post**. Instagram strips it, and
  only the user can add a link sticker. So **the picture itself must say where** (venue
  name + city and a QR code), and the copied caption carries the link for the user's link sticker or
  bio. On Facebook, X, Messages and WhatsApp the link travels with the share text.
- Inside the native app, Instagram's "Sharing to Stories" (iOS `instagram-stories://share` with the
  image on the pasteboard; Android `com.instagram.share.ADD_TO_STORY` intent) opens the Story editor
  with the picture already in it. It needs a **Meta (Facebook) App ID**, which is free (Andrew creates
  it; record it in §7). The website keeps the share-sheet path.
- `qrcode.react` is already a dependency (QR on the picture, drawn client-side).
- Store badges on the picture: the official artwork only, and **only once both listings are live**
  (same rule as Phase 7). Until then the picture says "hightopchallenge.com".

#### Phase 9a — The app download link, built early (Sonnet 5.5, medium)

Andrew (2026-10-22): **no public venue page.** Shares point to the app download. This pulls Phase 7's
`/app` link forward so 9b can print it on every picture. Phase 7 keeps the badges, the Smart App
Banner and the sign-in pointer.
- **`hightopchallenge.com/app`** (apex, short enough to read off a Story). An iPhone goes to the App
  Store listing, an Android to Google Play, and anything else to `/info#app`, which never dead-ends.
  **Until the store listings are live** (store URL constants empty), every device goes to
  `play.hightopchallenge.com`, so a share made today still works and upgrades by itself on launch day.
- **The path is permanent once a picture is posted** (a QR in someone's camera roll can't be
  updated, same as the printed join QR). Never rename it, never make it depend on an env var for its
  *path*. Store URLs live in one constants file (Phase 7's rule), read only by this route and the
  badge components.
- A route handler (`app/app/route.ts`, a 302 decided from the `User-Agent`), `Cache-Control: private,
  no-store` (the answer depends on the device). Cost: one tiny function call per tap, no DB read. At
  a viral 10,000 taps/day that's 10,000 invocations, which is negligible. Add a narrow `proxy.ts`
  public allow only if the gate catches it (check first, don't change the default).
- Inside the native app the link should never be needed. If tapped there, send it to the app's
  front door, not a store.
- Tests: the UA → destination table (iPhone, iPad, Android, desktop, unknown, store URLs unset), plus
  a contract test that the QR value used by the share cards is this one constant.

#### Phase 9b — Share card v2 (Opus 5.5, high)
**Status: built 2026-10-22, uncommitted. As-built + traps: `docs/native-app-store-plan_PHASE_9B_HANDOFF.md`.**
- **Ready-made designs first, photo optional (Andrew: never require the camera).** Every win
  offers 2–3 finished designs with no camera (game gradient, or the prize gift card for a prize; the
  headline line; username). "Add a selfie" is an optional extra on top of the existing camera flow.
  A denied or missing camera still leaves the ready-made designs shareable. The current "Create
  story" button opens the ready-made designs first, not the camera.
- **The headline is Andrew's line** (decision 4 above): "I just won $15 off my tab at The Pour
  House!" (or the prize/game variant), built by one function in the copy file from `prizeCardFace`,
  never re-derived per screen.
- **Every design carries the bar and the app:** the bar's name + physical address (street, city;
  **no directions**), a QR to **`hightopchallenge.com/app`** (9a), and "Play on Hightop
  Challenge" + the store badges (or "hightopchallenge.com" until the listings are live). A venue
  with no address on file shows the name only. Respect Instagram's story safe zones (keep the QR and venue line out of the top ~250
  and bottom ~340 px) and the 12 px text floor.
- **Two sizes:** Story 1080×1920 and feed post 1080×1350 (4:5), from the same layout spec in
  `storyPayloads.ts`. The canvas engine (`storyCanvas.ts`) gains QR + image-block drawing. One
  renderer, never a second one.
- Generalise `StoryShareGameType` into a registry, like Results: one entry per game with its label,
  gradient, frames and result fields. Category Blitz and Live Trivia move onto it unchanged.
- Copy lives in one file (extend `copyPresets.ts`). Use **Prize** on screen, never "Reward". The
  existing caption presets stay. Add a "venue" line per category ("Champion at [Venue]").

#### Phase 9c — "Share my win" on every win (Sonnet 5.5, medium)
**Status: built 2026-10-22, uncommitted. As-built + traps: `docs/native-app-store-plan_PHASE_9C_HANDOFF.md`.**
- One `ShareWinButton` (wrapping the launcher) placed on: the prize-won moment and each won card in
  `/redeem-prizes` (the gift-card design is the share picture, `PrizeCard` + `prizeCardFace`, no
  second card); Bingo win; Pick 'Em and NFL Pick 'Em weekly results; Fantasy; Squares quarter win;
  Bracket results. Live Trivia and Category Blitz keep theirs. Phase 4d's "Invite a friend" sits
  next to it where 4d already planned (post-game).
- **Share only what the server already said.** A button appears only on a result the screen already
  loaded (rank, prize). No new request to build a share card, and no new polling. A seasonal game
  appears only while its flag/date gate is on.
- Shows the prize *name* only ("Won a $15 Off Tab"), never a coupon code, QR, gift card number or
  redeem button (a shared redemption QR could be scanned by a stranger). Contract test.
- Tripwire test listing every win screen that must have the button, like
  `tests/native-back-review-fixes.test.ts`.

#### Phase 9d — The share sheet (Opus 5.5, high)
**Status: built 2026-10-22, uncommitted. As-built + traps: `docs/native-app-store-plan_PHASE_9D_HANDOFF.md`.**
- After a win: one sheet (`StoryCaptureModal`, extended — not forked) showing the ready-made designs as
  tappable thumbnails (Story/Post toggle), the pre-written caption with the app link (one "Copy caption + link"
  button), then one row of destinations: **Instagram Story, Instagram post, Facebook, X, Messages, Save, More**.
  Every destination copies the caption + link first; the Instagram ones say "Paste the link in a link sticker"
  (Story) or "Paste the caption" (post).
- **What a web page can and can't do (verified 2026-10-22):** a browser can't send a picture to one chosen app.
  So on the website each destination copies the caption and opens the phone's share sheet with the picture, and
  says which app to pick. X and Messages keep the text that travels with the picture. Where the browser can't
  share a picture at all (most desktops): X opens `x.com/intent/post` with the text + link, Save downloads the
  picture, and the old "Share options" panel (save + open Instagram/Facebook) stays as the last fallback.
- **Tag nudge (Andrew, 2026-10-22):** one quiet line under the destinations: "Tag <bar> in your post". Text
  only. Phase 9e turns it into "Tag @handle" and puts the handle in the caption (decision 10).
- **In the app:** Instagram Story = Meta's Sharing to Stories (opens the Story editor with the picture; needs the
  Meta App ID, §7). Our own small plugin `InstagramStories` in `native/` (iOS + Android), capability-checked
  through `hasNativeCapability("InstagramStories")`; old app builds, or a phone without Instagram, fall back to
  the share sheet. Save in the app = the share sheet ("Save Image"), because the app's web view can't download.
- Default selection: the first ready-made design (no photo). "Take a selfie instead" is one secondary
  button in the sheet; after a selfie is captured the same destinations share it.
- **Andrew's step — create the Meta App ID (free, ~15 min, before the native half of this phase).**
  Meta renames these screens often; the 9d agent re-checks Meta's "Sharing to Stories" developer doc at
  the start and corrects these steps if they've moved.
  1. Sign in to Facebook with your own account and go to **https://developers.facebook.com**. Click
     **Get Started** / **My Apps**. If asked, register as a developer (accept the terms, confirm your
     phone or email).
  2. **My Apps → Create App.** App name **"Hightop Challenge"**, contact email
     **support@hightopchallenge.com**.
  3. When asked what the app should do, choose the plain option with no Facebook Login, ads or
     business permissions (currently **"Other"**, then app type **"Consumer"** or **"None"**). Sharing
     to Stories needs no permissions and no App Review.
  4. If asked for a business portfolio, you may link **Hightop Challenge LLC** or skip it; it isn't
     required for this.
  5. **App settings → Basic:** add Privacy Policy URL **https://hightopchallenge.com/privacy**, Terms URL
     **https://hightopchallenge.com/terms**, category **Games** (or Entertainment) and the app icon
     (`public/brand/web/htc-logo-512.webp` converted to PNG, or the store icon). If it offers
     **Add platform**, add **iOS** (bundle id `com.hightopchallenge.app`) and **Android** (package
     `com.hightopchallenge.app`).
  6. Switch the app from **Development** to **Live** (the toggle at the top; it needs the privacy URL
     from step 5).
  7. Copy the **App ID** (a long number at the top of the page) into §7 of this plan. The App ID is
     public and safe to share. **Never copy the App Secret anywhere**: this feature doesn't use it.
     If it's ever pasted somewhere by mistake, reset it on that same page.
- Native half: the App ID goes in `native/capacitor.config.json` `plugins.InstagramStories.facebookAppId` (public,
  not a secret). iOS needs `instagram-stories` in `LSApplicationQueriesSchemes`, puts the picture on the pasteboard
  (`com.instagram.sharedSticker.backgroundImage`, 5-minute expiry) and opens
  `instagram-stories://share?source_application=<App ID>`. Android writes the picture to the app cache, shares it
  through the existing FileProvider (`${applicationId}.fileprovider`) with the `com.instagram.share.ADD_TO_STORY`
  intent + the `source_application` extra, and declares `<queries><package android:name="com.instagram.android"/>`
  (Android 11+ can't see Instagram otherwise). Both need a shell rebuild, and a new app build in the stores.
- Haptics through `haptic()` only. Native Back closes the sheet (`useNativeBackHandler("overlay", …)`
  and add it to `tests/native-back-review-fixes.test.ts`).
- Analytics: reuse `lib/analytics.ts` events already wired to the share flow (the destination goes in
  `resultReason`). No new table, no new route, no migration.

#### Phase 9e — Venue Instagram handle + what a share shows (Opus 5.5, high) — REVIVED 2026-10-22
**Status: built 2026-10-22, committed + pushed; migration `20261023011500_venue_share_details.sql` applied to production 2026-10-22 (verified: 16 venues, all defaults, no handles). Andrew chose PER VENUE (2026-10-22: "If new games or prizes are added, they should have the same info as the others"). As-built + traps: `docs/native-app-store-plan_PHASE_9E_HANDOFF.md`.**
Andrew (decisions 10 and 11): the @handle goes in the caption, and the partner picks which of handle, name and
address appear on share content (all three, none, or any mix), offered when they set up a Prize or schedule a game.
- **One setting per venue, asked in both places** (my recommendation, recorded so it isn't re-asked; Andrew can
  overrule — see §6): a share picture can come from games that are never scheduled and carry no prize (Bingo,
  Pick 'Em, Fantasy…), so the choice must live on the venue, not on one Prize or one game. The Prize wizard (owner
  variant only) and the Schedule flow each show the same small "On shared pictures" step/section, pre-filled from
  the venue's current choice; saving it in either place changes it for the venue. Also editable later from the
  Partner Dashboard (wherever the venue's details are edited). If Andrew wants it per Prize / per game instead:
  the Prize's/game's own choice wins on its share, the venue's choice everywhere else.
- **Data (new migration, `supabase migration new venue_share_details`; `db push` only with Andrew's go-ahead):**
  `venues.instagram_handle text null` (stored without the "@"; CHECK `^[A-Za-z0-9._]{1,30}$`),
  `venues.share_show_name boolean not null default true`, `share_show_address boolean not null default true`,
  `share_show_instagram boolean not null default true`. Defaults = today's pictures unchanged. Altering a table
  needs no new grant; still follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`.
- **Handle input:** accept "@thepourhouse", "thepourhouse" or an `instagram.com/thepourhouse` URL; store the bare
  handle; refuse anything else with a plain message. We can't verify the partner owns it; that's accepted.
- **Write path:** one owner route through `withOwnerVenue` (owner auth + the venue is theirs before any write),
  e.g. `PATCH /api/owner/venues/share-details`; both flows call it. Admin can see/edit it on the venue row.
- **What each choice does:** name off → the headline drops " at <bar>" ("I just won $15 off my tab!") and the
  picture's bar line goes; address off → no street/city line; handle on + set → "@thepourhouse" printed under the
  bar name on the picture and added to the caption ("… at The Pour House! @thepourhouse Play on Hightop Challenge:
  <link>"), and the share sheet's nudge says "Tag @thepourhouse". All three off → the picture shows only the win +
  the app panel. The wording stays in `lib/socialShare/copyPresets.ts`; the choice is applied in ONE place (the
  share payload builder), never per screen or per design.
- **Players' side, zero new requests:** the columns ride on the venue reads the hub and join list already make
  (`rememberShareVenue` / `toShareVenue` carry them; bump the localStorage key to `htc_share_venue_v2` so an old
  cached entry without the choice is re-read). Never fetch the venue just to build a share.
- Tests: handle parsing table; the choice → headline/picture/caption table (all 8 combinations); every design
  honours it (`npm run share-card:render -- --sheet` with a handle case); the route's owner-auth; the wizard's
  admin snapshots unchanged.

#### Phase 9g — `/app` asks "Get the app?" on a phone (Sonnet 5.5, medium) — added 2026-10-22
Andrew (decision 12). Today `/app` 302s a phone straight to its store (or, until the listings are live, to the player
sign-in). Change it so a phone sees one small page first:
- **iPhone / Android, store listing live:** a page with the logo, one line ("Hightop Challenge is better in the
  app"), a **"Get the app"** button (that phone's store URL) and a **"No thanks, play in the browser"** link to
  `https://play.hightopchallenge.com` (the player sign-in). **Store URL still empty:** no page — straight to the
  sign-in exactly as today. **Desktop / unknown:** `/info#app` as today. **Inside the app:** the front door as
  today. iPad counts as iPhone. No "remember my choice" (one tap either way; no cookie).
- **The path `/app` never changes** (it's printed in QR codes). The decision stays in `decideAppLinkDestination`
  (`lib/appDownloadLink.ts`), which gains an "ask" outcome; `app/app/route.ts` returns the small page as HTML
  (`Cache-Control: private, no-store`, same as today) or redirects. Keep the page tiny and self-contained (no
  player runtime, no fonts download beyond what next/font already serves, text ≥ 12 px, minimal design). Both
  choices are plain links, so they work without JavaScript.
- **Cost:** unchanged — one function call per scan/tap, no DB read. "Get the app" is one extra tap for a phone.
- **iPad (9f review finding R14, 2026-10-22):** iPadOS 13+ Safari sends a Mac User-Agent ("Macintosh", no "iPad"), so
  the server can't tell an iPad from a Mac, and `decideAppLinkDestination`'s `/iPhone|iPad|iPod/` misses it — an iPad
  would get the desktop destination once the listing is live. **Fix in 9g:** while the iOS listing is live, a
  `Macintosh` + Safari UA (no `Chrome`/`CriOS`/`Firefox`/`FxiOS`/`Edg` token) gets the "ask" page in a "maybe iPad"
  form: a tiny inline script shows "Get the app" (App Store) when `navigator.maxTouchPoints > 1`, otherwise
  `location.replace("/info#app")`; without JavaScript it shows both plain links ("Get the iPad app" and "Continue to the
  website" → `/info#app`). Store URL unset → unchanged (the sign-in). Cost unchanged (same one function call).
- Tests: extend the UA → destination table (ask vs redirect vs sign-in, store URLs set/unset); the page's two
  links; the QR value is still `APP_DOWNLOAD_URL`. Ship it any time; it only shows once Phase 6/7 fill the store
  URLs.

#### Phase 9f — Review + phone pass (Opus 5.5 review, high + Andrew)
- `/code-review` of 9a–9e and 9g. A device checklist section: every share path on the iPhone app, the
  Android app, iPhone Safari and Android Chrome. Instagram Story, Instagram post, Facebook,
  Messages, the camera-denied path (ready-made designs still share), and the QR on a posted Story
  scanned from another phone (lands on the right store, or `play.` before launch). 9d: each destination on each
  device (which app the share sheet offers, what text arrives), the in-app Instagram Story editor (iPhone and Android,
  with and without Instagram installed), "Copy caption + link". 9e: a venue with a handle and each show/hide choice.
  9g: the "Get the app?" page on both phones once the listings are live.

**Status (2026-10-22): review DONE** (`/code-review` high over `9cf67f7..20a97e2` = 9a–9e; 9g isn't built yet, so it is
reviewed with its own build). 17 findings; each one was checked against the code, and 16 became the fix phases below.
**Andrew's phone pass is written** as section **J** of `docs/native-app-device-checklist.md` (items 27–42); best run after
9f.1 and 9f.3–9f.5 are deployed (9f.2 needs an app rebuild). Handoff: `docs/native-app-store-plan_PHASE_9F_HANDOFF.md`.

#### Phase 9f fix phases (from the 9f review, 2026-10-22) — fix in these phases, never as in-place patches

Same rule as the Squares/Bracket reviews: each phase gets its own handoff (`…_PHASE_9F_<N>_HANDOFF.md`), tests that would
have caught the bug, and the gates (`npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`). **Order:** 9f.1,
9f.3, 9f.4, 9f.5, 9f.6 (all website-only; can ship in one deploy), then 9f.2 with the next app rebuild, then 9g, then
Andrew's section J. None needs a migration. None adds a recurring cost except 9f.4 (one small venue read, see there).

##### 9f.1 — Share-sheet taps that report the wrong result (Sonnet 5.5, high; website only)
- **R1 — X is always "Couldn't open X" on the website** (`StoryCaptureModal.tsx` `pickDestination`, x-intent branch).
  `window.open(url, "_blank", "noopener")` returns `null` by spec even when the tab opens, so every successful open shows
  the failure hint and logs `x: blocked`. **Fix:** `const tab = window.open(url, "_blank"); if (tab) tab.opener = null;
  opened = tab !== null` (same protection, a real answer). Test: a jsdom `window.open` stub returning a window → the
  "opened" hint.
- **R2 — Two taps run two shares** (same function). The Instagram Story path never sets `nativeShareState` to
  `"sharing"`, and state set in one tap isn't visible to a second tap in the same frame. **Fix:** one `destinationBusyRef`
  (a ref, set synchronously as the first line of `pickDestination`, cleared in `finally`) that every destination and
  "Copy caption + link" check; the row shows disabled while it's set. Test: two `pickDestination` calls in one tick → one
  plugin call, one analytics event.
- **R3 — The in-app Instagram fallback opens the share sheet too late** (same function). When the plugin says
  "unavailable"/"failed", `shareCapturedStory` calls `navigator.share` after several awaits (base64 + the bridge), when
  the tap no longer counts as a tap; WKWebView refuses it (`NotAllowedError`) and the player sees a failure panel.
  **Fix:** never chain a share sheet after an await. On a non-"opened" outcome, set `instagramStoryDirect` false (as
  today) and show the hint "Instagram didn't open. Tap More to share the picture." (new line in `SHARE_DESTINATION_COPY`,
  `copyPresets.ts`) — the next tap opens the sheet inside a real tap. Test: outcome "unavailable" → no `navigator.share`
  call, that hint.

##### 9f.2 — iPhone app: the Instagram Story shortcut wipes the copied caption (Opus 5.5, high; app rebuild + Andrew's iPhone)
- **R4** — `native/ios/App/App/InstagramStoriesPlugin.swift` `shareToStory` calls `UIPasteboard.general.setItems(...)`
  with only the sticker image, which REPLACES the caption + link that `pickDestination` copied a moment earlier. The sheet
  still says "Caption + link copied. Paste the link in a link sticker", but Paste in Instagram gives no link — the one
  thing the Story needed to send people to the app. (Android uses an intent and leaves the clipboard alone.)
- **Fix:** the web side passes the caption to the plugin (`shareToInstagramStory(blob, { caption })`,
  `lib/nativeInstagramStories.ts`); the plugin writes ONE pasteboard item that carries both the sticker keys and
  `"public.utf8-plain-text": caption` (same 5-minute expiry), so a Paste in Instagram's link sticker still finds the
  link. **Check on the iPhone first** (Meta's doc doesn't say whether Instagram clears the pasteboard on open): if the
  text is gone after Instagram reads it, fall back to the honest version — before opening Instagram the sheet says
  "Copy the link after you add the picture" and the hint after opening is the copy-in-Instagram instruction (never claim
  "copied" when it isn't). Old app builds keep today's behaviour (capability-checked; the extra option is ignored).
- Needs a shell rebuild (`cd native && npx cap sync ios`) and a new store build; record the result in section J item 33.
- **Status (2026-10-22): BUILT, not committed** (handoff `docs/native-app-store-plan_PHASE_9F_2_HANDOFF.md`). The fix above,
  plus: the sheet now waits for its own caption copy to land before calling the plugin, so the two pasteboard writes can't
  race. iOS simulator build passes. **The iPhone check is NOT done yet** — it needs this website change deployed and a new
  app build on the phone (the app loads the live site, so a new build alone still sends no caption). The honest-wording
  fallback is NOT built; build it only if item 33 shows the text gone.

##### 9f.3 — Pictures that keep redrawing, broken thumbnails, lighter closed buttons (Sonnet 5.5, high; website only)
- **Status (2026-10-22): BUILT, not committed** (handoff `docs/native-app-store-plan_PHASE_9F_3_HANDOFF.md`; tests `tests/share-pictures-stability.test.ts`). Done as written, plus: the sheet is a small inner component `StoryShareSheet` mounted only while open (so `achievedAtIso` is pinned by `useState(payload.achievedAtIso)` at mount), and Category Blitz's payload comes from `useCategoryBlitzSharePayload` (a hook over primitives; React Compiler's lint refuses a `useMemo` over values derived from the in-place sort).
- **R5 — Category Blitz's sheet may never settle** (`components/category-blitz/CategoryBlitzGame.tsx` `CompleteScreen`):
  the payload is rebuilt every render with a fresh `achievedAtIso`, so `StoryShareLauncher`'s `preparedStory` changes
  identity every render; `useSharePictures` keeps restarting (placeholders, Share disabled) and an edited selfie caption
  is dropped (its key includes `achievedAtIso`). **Fix (both halves):** `useMemo` the payload in `CompleteScreen` on its
  primitive inputs (as `ShareWinButton` already does), AND make the launcher robust for any future caller: it memoises on
  a content key (the payload's fields without `achievedAtIso`, JSON-stringified) and pins `achievedAtIso` to the value at
  the moment the sheet opened. Test: re-render the launcher with an equal-but-new payload → no redraw.
- **R6 — Broken thumbnails after "Take a selfie instead" → "Designs"** (`components/social-share/useSharePictures.ts`):
  the effect's cleanup revokes the object URLs but leaves them in state; coming back with the same win and size reuses
  that state, so the `<img>` tags point at revoked `blob:` URLs. **Fix:** the cleanup also resets the state for that
  key (`setState(EMPTY)` when `cancelled`), or the state carries the run's id and `current` requires it. Test: active →
  inactive → active → no picture URL from the first run is returned.
- **R7 — A closed share button does work it doesn't need** (findings 13–15, cost only, no wrong output):
  `useShareVenue` reads + parses storage on every mount because `active || venueId` is always true → gate on `active`;
  `StoryShareLauncher` mounts `StoryCaptureModal` (two `prepareStorySharePayload` builds and its effects) while closed →
  render it only when open, and delete the reset-on-close effects that only existed for that; `ShareWinButton`'s
  `useSyncExternalStore` with a no-op subscribe re-reads three storage values every render → read once
  (`useState` initializer; keep the server snapshot "" so hydration is unchanged). The prize wallet and Bingo lists render
  many of these buttons. Tests: the existing `tests/share-win-button.test.ts` + a "closed launcher renders no modal" test.

##### 9f.4 — The partner's choice must always win over an old copy (Opus 5.5, high; website only; tiny new read — Andrew's note)
- **Status (2026-10-22): BUILT, not committed** (handoff `docs/native-app-store-plan_PHASE_9F_4_HANDOFF.md`). Done as written.
  Andrew's "Execute 9f.4" = go-ahead on the read's cost. Added: `fetchVenueById` in `lib/venues.ts` (a failed read is
  `{ ok: false }`, never the built-in fallback venue, whose default choices could show a name the partner turned off;
  `getVenueById` now wraps it, unchanged for its callers); the join list's 5-minute session cache counts as fresh; the
  rules are one pure function, `resolveShareVenue`.
- **R8 — Before the venue loads, the screen's own name/address are used** (`applyShareVenue(payload, null)`,
  `lib/socialShare/shareVenue.ts`): a player who arrives by deep link (nothing remembered) can share the first picture,
  with a name/address the partner turned off, before `getVenueById` returns.
- **R9 — The remembered venue never expires** (`readShareVenue`): the hub's `htc_share_venue_v2` entry has no date and,
  when present, `useShareVenue` never re-reads; a partner's change is ignored on any game reached without passing through
  the venue home (bookmark, notification).
- **Fix:** (1) the remembered entry gains `savedAt` (bump the key to `htc_share_venue_v3`); the hub rewrites it as today
  (no new request there). (2) When the share sheet OPENS and the entry is missing or older than 10 minutes, read the one
  venue row (`getVenueById`, as today's no-entry path), once per venue per sheet open. (3) While that read is in flight,
  the pictures draw but every destination and "Copy caption + link" waits ("Getting your picture ready…"). (4) If the read
  fails: use the remembered entry if there is one; else the safe fallback — no bar name, address or handle on the picture
  or in the caption (the win + the app panel still share); never the screen's own name. `applyShareVenue` keeps being the
  one place the choice is applied; the "unknown" case becomes an explicit `"unknown"` input, not `null` = defaults.
- **Cost (for Andrew):** 9e promised zero new requests; this adds at most one single-row venue read per share-sheet open,
  only when the player hasn't been on that venue's home in the last 10 minutes. At today's volume (tens of shares a day)
  that's tens of tiny reads a day; at 10,000 shares a day it's ≤ 10,000 small reads a day — negligible next to the venue
  hub's own reads. The cheaper alternative (no read, accept stale choices up to forever) is what R9 is. Lowering the
  window below 10 minutes raises the count only for players who share without visiting the hub.
- Tests: the expiry table (fresh / stale / missing / read fails with and without a remembered entry); a deep-link share
  can't reach any destination before the read settles; contract test unchanged (`applyShareVenue` called only by the launcher).

##### 9f.5 — Partner "On shared pictures" box fixes (Sonnet 5.5, medium; website only)
- **Status (2026-10-23): BUILT, not committed** (handoff `docs/native-app-store-plan_PHASE_9F_5_HANDOFF.md`). R10–R12 done as written; tests `tests/share-details-panel.test.ts`.
`components/owner/share/ShareDetailsPanel.tsx`:
- **R10 — A failed first load is stuck:** no retry; "Change" only renders once details exist. **Fix:** a "Try again"
  button under the error (`SHARE_DETAILS_COPY.retry`, `lib/venueShareDetails.ts`) that re-runs the GET.
- **R11 — Switching venue without a remount shows "…" forever, and a draft can be saved to the wrong venue:** the load
  effect returns early for a cached key without updating `loaded`, and `draft`/`message` survive a `venueId` change.
  **Fix:** derive the shown details from `cache.get(key)` (set `loaded` from the cache when the key changes), and keep
  `draft` + `message` keyed by `key` (a draft for venue A is never shown or PATCHed for venue B). Test: render A → B → A
  with A cached → A's details shown; a draft started on A is gone on B.
- **R12 — Save fails on a hidden field:** with "Instagram handle" off, the handle input is hidden but `save()` still
  validates it. **Fix:** with the handle off, an invalid draft handle is not checked and the SAVED handle is sent
  unchanged (turning it back on later restores it); with it on, today's check. Test: "my bar!" + handle off → Save succeeds
  with the old handle.

##### 9f.6 — Pick 'Em: today's shared points assume 10 per pick (Haiku 4.5 or Sonnet 5.5, low; website only)
- **R13** — `components/pickem/PickEmGameList.tsx` `todayWinPoints` = won games × 10, while the history total uses each
  pick's `rewardPoints`. Latent today (every pick is `PICKEM_REWARD_POINTS` = 10) but wrong the day a pick is worth
  something else. **Fix:** sum `game.userPickRewardPoints` (already on each game, `lib/pickem.ts`), with the same `|| 10`
  fallback as the history line. Test: a won game worth 20 → the share shows 20.

**Not scheduled (recorded so it isn't re-raised):** review finding 17, "relative imports in `lib/socialShare/`"
(`./contracts`, `./copyPresets`). Sibling `./` imports have been this folder's convention since July (`storyCanvas.ts`,
`storyPayloads.ts`, `sharePipeline.ts`…); the CLAUDE.md rule's example forbids `../`. A folder-wide switch to `@/` is
harmless but cosmetic — only if Andrew asks.

**Order and dependencies:** 9a first (every picture prints its link). 9b and 9c can follow before the store
listings are live: the badges switch on with Phase 7's flag. 9d's Instagram direct-share needs the
app build + the Meta App ID; its web half doesn't. 9e needs a migration (Andrew's `db push` OK). 9g needs nothing,
but only shows once the store URLs are filled (Phase 6/7). **Cost:** $0 recurring: one redirect call per tap on
`/app`, no DB reads. All pictures are drawn on the player's phone, with no server
rendering, no storage and no new cron.

### Phase 10 — Fixes from the 2026-10-26 code review (added 2026-10-26)

**For Andrew, in plain English:** a code review of everything not yet committed found 10 problems, all in two
unreleased features: **partner messages** (Phase 5.5) and the **"Get the app" links** (Phase 7). Nothing is broken
for players today, because neither feature is live. These phases fix them before either one goes live. Run them
one at a time, in order. Only 10.1 changes the database, and it needs your OK to apply.

**How the review was run:** `/code-review high` over the uncommitted working tree on top of `7aacf153`. 10 findings;
each one was checked against the code before being scheduled. One finding was corrected: the review assumed migration
`20261023145024` was not applied. `supabase migration list` (2026-10-26) shows it **is** in production, and a read-only
count shows **0** rows in `push_venue_messages`, `push_venue_message_reports` and `push_venue_message_pauses`. So
changing the report rules touches no real data, but it must be a **new** migration (existing migration files are
read-only history).

**Rules for every sub-phase** (same as the 9f fix phases): fix only in these phases, never as in-place patches. Each
phase writes its own handoff (`docs/native-app-store-plan_PHASE_10_<N>_HANDOFF.md`), adds tests that would have caught
the bug, and passes the gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (never run typecheck
and build at the same time). Preserve all unrelated uncommitted work. Commit/push/deploy only when Andrew asks.

**Order:** 10.1 → 10.2 (partner messages; both before 5.5 is deployed or switched on) → 10.3 (before Phase 7's flag is
switched on) → 10.4 (housekeeping, any time before the next iOS build). 10.2 and 10.3 are independent and can swap.

**Cost:** no new recurring cost. 10.1 adds one indexed lookup inside an RPC that already runs once per report. 10.2 adds
at most one extra status read, and only after a send whose status read failed. 10.3 adds no request and keeps `/info`
a static page. No new cron, no polling.

**Before deploying any 5.5 code (Andrew):** `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` already exists in Vercel
**Production and Preview** (added ~2026-10-23; value not read). It is a build-time flag, and the 5.5 code is not
deployed yet. If its value is `true`, the **first deploy that includes 5.5 switches partner messages on at once**.
Confirm the value (Vercel dashboard) before that deploy, and keep it off until 10.1 + 10.2 are done and section N of
the device checklist passes.

| Sub-phase | Findings | Model / effort | Needs |
|---|---|---|---|
| 10.1 | Reports and pauses: one person = one report; an admin's un-pause sticks | **Opus 5.5**, high | New migration + Andrew's `db push` OK |
| 10.2 | Partner messages: false "Try again", over-eager word filter, endless spinner, admin panel ignores the flag | Sonnet 5.5, medium | Website only |
| 10.3 | "Get the app": `/info#app` target, Safari banner tag, hard-coded host, repeated URL parsing | Sonnet 5.5, high | Website only; one decision from Andrew (below) |
| 10.4 | Delete the iCloud duplicate `native/ios/App/App/config 2.xml` | Haiku 4.5, low | Nothing |

#### 10.1 — Reports count people, and an admin's un-pause sticks (Opus 5.5, high; new migration)

**Status: built 2026-10-26, uncommitted. Migration `20261026173304_partner_message_report_rules.sql` written, NOT applied (dry run lists only it). As-built: `docs/native-app-store-plan_PHASE_10_1_HANDOFF.md`.**

- **F1 — One person can file several "distinct" reports.** `report_venue_message` (migration `20261023145024`) counts
  report rows per venue **profile** (`users.id`). But `is_venue_message_reader` lets every profile on the same account
  read and report. A player with profiles at three bars can sign in to each and report the same message three times,
  reaching `PARTNER_MESSAGE_REPORTS_TO_PAUSE` (3) alone and pausing the bar. The rule is meant to need three different
  players.
- **F2 — An admin's "Un-pause" doesn't stick.** `setVenueMessagesPaused(venueId, false)` deletes the pause row. The next
  `report_venue_message` call on the old message still counts ≥ 3 reports and re-inserts the pause, **even an
  `already_reported` call that added no row**. The bar is paused again with no new evidence.
- **Fix (one new migration, `supabase migration new partner_message_report_rules`):**
  1. A reporter's identity is `coalesce(users.account_id::text, users.id::text)`: the account, or the profile when there
     is no account. Compute it in SQL only, in one place: a small `stable` helper used by the functions below.
  2. `alter table public.push_venue_messages add column reports_reviewed_at timestamptz;`. This is the last time an
     admin reviewed this bar's reports. It is a new column on an existing table, so no new grant is needed (the grants
     contract covers new tables, views and sequences); confirm `tests/supabase-migration-grants-contract.test.ts` passes.
  3. `create or replace function public.report_venue_message(...)` with the **same signature and return type**, so the
     existing grants carry over. Under the same per-bar advisory lock:
     (a) if this message already has a report from **any profile with the same identity**, answer `already_reported`
     and **stop**: no insert and no pause check;
     (b) otherwise insert the row;
     (c) count **distinct identities** among this message's reports with `reported_at > coalesce(reports_reviewed_at,
     '-infinity')`;
     (d) pause only if (c) ≥ the threshold. The pause check runs only on a call that inserted a row.
  4. `create or replace function public.read_venue_message(...)`: `reported` is true when any profile with the same
     identity reported the message, matching 3(a). Same signature.
  5. New RPC `public.unpause_venue_messages(p_venue_id text)` (security definer, `set search_path = public`, same
     advisory lock key `'push_venue_messages:' || venue_id`): delete the pause row **and** stamp
     `reports_reviewed_at = now()` on all of that bar's messages, in one transaction. Revoke from public/anon/
     authenticated; grant execute to `service_role` only.
  6. `lib/push/venueMessages.ts` `setVenueMessagesPaused(venueId, false)` calls `unpause_venue_messages` instead of a
     plain delete. That file stays the only writer of the pauses table. A missing function fails closed: log
     `[Push] unpause-rpc-missing` (detect it with `isMissingFunction` from `lib/supabaseRpcErrors.ts`) and return 503 to
     the admin. Never fall back to the plain delete. Admin **pause** (upsert, reason `admin`) is unchanged.
  7. The admin panel's report count (`listVenueMessagesForAdmin`) shows reports **since the last review**, so the number
     on screen is the number that drives a pause.
- **Accepted limitation (write it in the handoff):** a person can still create a second account. The threshold is a
  safety valve, not proof; the admin pause/un-pause is the real control. Profiles without an account count once each.
- **Tests:** extend `scripts/test-push-sql.cjs` (PGlite; add the new migration to its file list), run with
  `npm run test:push-sql`:
  - two profiles of one account → the second report is `already_reported` and the distinct count stays 1;
  - three different accounts → paused;
  - admin un-pause, then a 4th account reports → **not** paused (1 since review);
  - an earlier reporter reports again after the un-pause → `already_reported`, not paused;
  - three **new** accounts after the review → paused again.

  Update `tests/partner-messages.test.ts` for the unpause RPC call and the fail-closed path.
- **Apply:** Andrew approves `supabase db push`; apply **only** the new migration (dry run first and check its list
  contains just that file). Then deploy the code. While the migration is missing, un-pause fails closed (503) and
  nothing else changes. `npm run test` after it, because the `auth.users` FK guard runs there.
- **Undo:** none needed for data (0 rows today). To roll back the logic, a further migration restores the old function
  bodies from `20261023145024`; the added column is harmless if left in place.

#### 10.2 — Partner messages: false failures, the word filter, the spinner, the admin panel (Sonnet 5.5, medium; website only)

- **F3 — A sent message can say "Try again."** `app/api/owner/messages/route.ts` POST reads `getVenueMessageStatus`
  inside the same `try` as the send. If only that read fails, the partner sees "Couldn't send your message. Try again."
  even though the message is recorded and the pushes are queued. If they resend, players get a duplicate and the
  2-a-day cap is used up.
  **Fix:** once `sendVenueMessage` returns `ok`, the reply is **always** `200 { ok: true, messageId, devices, status }`.
  Read the status in its own `try`; on failure, log `[OwnerMessages] status-after-send-failed` and send
  `status: null`. In `components/owner/messages/PartnerMessagesSheet.tsx`, a success without `status` shows the "Sent
  to N phones" notice and reloads the status once (bump a `reloadKey` that the load effect depends on). Never show an
  error after `ok: true`.
  **Test:** the send succeeds and the status read throws → 200 `ok: true`, `status: null`; the sheet shows "Sent".
- **F4 — The word filter blocks harmless phrases.** `checkPartnerMessage` in `lib/partnerMessageRules.ts` matches
  `BLOCKED_INSIDE` against **all words joined together**, so "Bring your **mother f**or brunch" → `motherfor` → contains
  `motherf` → refused. Joining was meant to catch spaced-out spellings ("f u c k", "f.u.c.k").
  **Fix:** match `BLOCKED_INSIDE` (1) inside **each word** on its own, which still catches "fuckyeah" and
  "motherfucker", and (2) inside each **run of consecutive single-letter words** joined together, which catches
  "f u c k", "f.u.c.k" and "f-u-c-k". Never join across real words. `BLOCKED_WORDS` is unchanged.
  **Tests:** allowed: "Bring your mother for brunch", "Mother Friday special", "Mother's Day brunch", "Half-price wings
  tonight!". Refused: "fuckyeah", "f u c k", "f.u.c.k", "F-U-C-K", "MOTHERFUCKER", "m0therf*cker". Every case already
  in the test file still behaves the same.
  **Accepted limitation:** two-letter splits ("fu ck") get through. Reports and the pause are the backstop; don't widen
  this into fuzzy matching.
- **F5 — The sheet spins forever with no venue.** With `?sheet=messages` open and `venue` null (a partner with no
  surviving venue, or a reload before venues resolve to none), the load effect returns early and `load` stays
  `"loading"`.
  **Fix:** with no venue, render a short line (new `PARTNER_MESSAGE_COPY.noVenue`: "Choose a venue to message its
  players.") instead of the loader. Derive it during render (`!venueId`); don't set state in an effect (the
  `react-hooks/set-state-in-effect` lint).
  **Test:** open the sheet with `venue: null` → the line shows and no `HightopLoader` renders.
- **F6 — The admin messages panel ignores the off switch.** `components/admin/sections/VenuesSection.tsx` mounts
  `PartnerMessagesPanel` on every admin Venues visit, and `GET /api/admin?resource=partner-messages` runs, whatever
  `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` says. That is a wasted request while the feature is off.
  **Fix:** render the panel only when `isPartnerMessagesEnabled()` (the flag's single reader). In `app/api/admin/route.ts`,
  return 404 for both the GET `partner-messages` resource and the POST pause/unpause action while the flag is off,
  matching the owner routes.
  **Test:** add to `tests/partner-messages.test.ts`: with the flag off, the panel isn't rendered and both admin branches
  404.
- **Gates:** the four standard gates. This phase changes no navigation primitive and no `JoinFlow`.

#### 10.3 — "Get the app" links: the `/info#app` target, the Safari banner tag, the host, repeated parsing (Sonnet 5.5, high; website only)

**Status: built 2026-10-26, uncommitted. Andrew's decision: YES — the banner and the sign-in line also show on the apex's player pages while the domain split is off. As-built: `docs/native-app-store-plan_PHASE_10_3_HANDOFF.md`.**

**Decision for Andrew at the start of this phase (recommended answer first):** while the domain split is **off**
(today), players use **both** `hightopchallenge.com` and `play.hightopchallenge.com` (the printed QR goes to `play.`).
Phase 7 shows the banner and the sign-in "Get the app" line on `play.` only.
**Recommended:** also show them on the apex's **player** pages while the split is off. `/info`, `/owner`, `/admin` and
the other marketing pages stay excluded by the existing path rule. Without this, most website players never see
either. If Andrew says no, keep `play.` only but still take it from `playHost()`.

- **F9 — The game host is typed out four times.** `"play.hightopchallenge.com"` appears in `smartAppBannerScript`
  (`lib/appStorePromotion.ts`) and three times in `components/native/AppStorePromotion.tsx`, instead of coming from
  `lib/domainSplit.ts`, which honours `NEXT_PUBLIC_PLAY_HOST`.
  **Fix:** one home in `lib/appStorePromotion.ts`: `promotionHosts(): string[]` = `[playHost()]`, plus `apexHost()`
  and `www.` + `apexHost()` while `isDomainSplitEnabled()` is false (if Andrew agreed above), and
  `isPromotionHost(hostname)`. The head script embeds `JSON.stringify(promotionHosts())`; these are `NEXT_PUBLIC_*`
  values inlined at build time, so the root layout stays static. Every component check calls `isPromotionHost`.
  **Test:** add a contract assertion that neither file contains the literal `play.hightopchallenge.com`. Update
  `tests/lib.app-store-promotion.test.ts` and `tests/components.app-store-promotion.test.ts` to use `playHost()`, plus
  the apex case for each value of the split flag.
- **F8 — Hydration removes the Safari banner tag.** On the hydration render, `useStoreBrowser()` returns the server
  snapshot (null), so the effect in `PlayerAppStoreBanner` sees `hostname` undefined, decides "not allowed", and
  **removes** the `apple-itunes-app` meta that the head script inserted while the page was parsed. A re-render adds a
  new one; Safari may ignore a tag added that late.
  **Fix:** the effect reads `location.hostname` and `navigator` **directly** (effects only run in the browser) plus
  `pathname`; it no longer depends on the store snapshot. Compute "wanted": ready, `isPromotionHost`, player path,
  Safari on iOS, not native, not an installed PWA. Then: wanted and the tag exists with the right content → do
  nothing; wanted and missing → add it; not wanted and present → remove it. Depend on `[pathname]` only.
  **Test:** in jsdom, insert the meta first (as the head script would), mount with an iPhone Safari UA on the play host,
  and assert it is the **same element** afterwards (never removed and re-added). Navigating to `/owner` removes it, and
  back to `/` adds it.
- **F7 — `/app` sends desktops to an `#app` that isn't there.** `AppStoreDownloadSection` renders `null` on the server
  (server snapshot `""`), so `/info#app` has no target when the page loads and the browser doesn't scroll to it.
  Separately, `decideAppLinkDestination` (`lib/appDownloadLink.ts`) sends desktops to `/info#app` as soon as **either**
  store URL is set, even while the Phase 7 flag is off and the section never renders.
  **Fix (two halves):**
  (1) when `appStorePromotionReady()` is true, render the section **on the server** in its desktop form (both badges,
  "Play in your browser", the QR), so `id="app"` is in the static HTML. After hydration, narrow it to the visitor's
  device. Hide it only for the native app or an installed PWA, detected after hydration. Give the snapshot three values
  (`"pending"` on the server, `""` = hide, `"device:host"`) so "not known yet" is never treated as "hide".
  (2) `decideAppLinkDestination` gains a `desktopSectionLive: boolean` argument; desktops go to `/info#app` only when it
  is true, otherwise to `JOIN_QR_URL` as today. `app/app/route.ts` passes `appStorePromotionReady()`. Pass it as an
  argument because `lib/appStorePromotion.ts` already imports `lib/appDownloadLink.ts`, so importing back would make a
  cycle. Phone behaviour (9g's "ask" page) is unchanged.
  **Tests:** server-render `/info`'s section with promotion ready → the HTML contains `id="app"` and both badges; with
  it not ready → absent. `decideAppLinkDestination` on a desktop: one store URL set and the section not live →
  `JOIN_QR_URL`; both set and live → `/info#app`. The existing 9a/9g tests stay green.
- **F10 — Store URLs are re-parsed on every render.** `appStorePromotionReady()` (two `new URL()` parses plus regexes)
  runs inside every `getSnapshot`, `readDismissed` and `subscribe` of every consumer, although its inputs are build-time
  constants.
  **Fix:** `const PROMOTION_READY = appStorePromotionReady();` once at module load in `AppStorePromotion.tsx`. The pure
  function stays as it is for tests and the server.
- **Gates:** the four standard gates, plus `npm run test:god-mode-join` (the sign-in link renders inside `JoinFlow`) and
  `npm run test:pwa-contract` (the installed-PWA check). Check that `/info` is still listed as static (○) in the build
  output. Andrew's Safari check of the real banner still waits for live listings (Phase 7).

#### 10.4 — Remove the iCloud duplicate in the iOS project (Haiku 4.5, low)

**Status: done 2026-10-26. `config 2.xml` was byte-identical to `config.xml` (`cmp`), untracked; deleted. The `find` (and a wider numbered-copy sweep) found no other duplicates in `native/`. As-built: `docs/native-app-store-plan_PHASE_10_4_HANDOFF.md`.**

- `native/ios/App/App/config 2.xml` is an iCloud "name 2" copy. On 2026-10-26 it was byte-identical to `config.xml`,
  which is generated by `cap sync` and git-ignored. Copies like this break native builds (`CLAUDE.md`, native section).
  **Fix:** re-check `diff` against `config.xml`; if identical, delete it (it is untracked, so it can't be restored
  from git: compare first). Before the next iOS build, check `native/` for other `* 2.*` files with
  `find native -name '* 2.*' -not -path '*/node_modules/*'` and list them for Andrew rather than deleting anything
  that differs.

---

## 5. Hard rules for every phase

- Everything in `CLAUDE.md` still applies: the `.env.local` append-only rule, migrations as new
  files only, `supabase db push` only with Andrew's go-ahead, no `middleware.ts`, no service worker,
  `vercel.json` untouched unless asked, the text-size floor, the navigation primitives, and no
  `any`.
- **Never** put a purchase or subscribe button for anything digital inside the app. Physical merch
  (the Join Merch store, currently look-only) is allowed under Apple's rules, but when it starts
  taking orders, re-check this.
- **Never** change the permanent join QR URL.
- **No partner surface in the app** (§2 item 12): no partner sign-in link, no `/owner/*` page, no
  billing screen. Every `/owner/*` page opens in the system browser.
- The website must behave identically for non-app visitors after every phase. Native-only code is
  gated by `isNativeApp()` / `hasNativeCapability()`.
- Store signing keys (the iOS distribution certificate, the Android upload keystore, the APNs `.p8`)
  are **never committed** and never printed. Andrew keeps them in a password manager, and the
  handoff records only *where* they are. **Losing the Android upload key** is recoverable only
  through Google support, so use Play App Signing.

## 6. Open questions for Andrew

1. **App id `com.hightopchallenge.app`:** resolved for the first release; Andrew authorized creating the
   key/bundle for this package and uploaded it to Google Play. Keep the same ID on Apple.
2. ~~Square logo (Phase 3B.2)~~ — answered 2026-10-09: Andrew supplied Square's "Built with Square"
   badge and its guidelines (Phase 3B.2 "Andrew's inputs").
3. ~~Phase 3B.2 copy~~ — answered 2026-10-09: approved as written.
4. **Partner-sent pushes (2026-10-22):** should partners be able to send their own push messages to
   their venue's opted-in players (Phase 5b, see Phase 5)? The Reel ad says "send push notifications to
   your regulars", so the ad can't run with that line until 5b ships.
5. **App Store rating prompt (suggested 2026-10-22):** add the native "Rate this app" prompt (Apple's
   `SKStoreReviewController` / Google's In-App Review) after a player's first win? Ratings help the
   listing rank. Small; would sit in Phase 6.
6. **Sharing (Phases 9a–9f, 2026-10-22):** answered — no camera required, ready-made content, bar
   name + physical address on every design, no directions, prize named with Andrew's "I just won … off
   my tab at …" line, feed-post size, Andrew creates the Meta App ID (decisions at the top of Phases 9a–9f).
   All answered 2026-10-22: no public venue page (shares → `/app`), both wording variants approved, the @handle
   goes in the caption and the partner picks handle/name/address (9e revived), `/app` asks first on phones (9g).
7. **Share details per venue or per Prize/game? (9e)** Answered 2026-10-22: **per venue**; new games and prizes get the
   same info as the others.
8. **Reviewer setup (answered 2026-10-25):** easiest venue option authorized and completed by un-hiding
   `venue-hightop-test`; `appreview` created with the supplied PIN, verified, and given location bypass. PIN omitted
   from repository files; do not ask for a new choice. See §2 items 13–14 and the Phase 6 handoff for the undo journal.
9. **iPad (answered 2026-10-25):** keep support; include iPad screenshots (§2 item 15).
10. **APNs (answered 2026-10-25):** Andrew confirms the authentication key is uploaded to Firebase.
    Do not ask him to upload it again; test actual iPhone delivery. Private-key backup location remains unrecorded.
11. **Apple app record (answered 2026-10-25):** Andrew created record **6826962606** after the first upload
    reported no record. URL: `https://appstoreconnect.apple.com/apps/6826962606/distribution/ios/version/inflight`.
    Keep this record; do not recreate it. The prepared archive upload succeeded; Andrew confirms TestFlight Processing.

Answered 2026-10-08 and moved to §2: US-only, remove deleted accounts, retire the PWA prompt and
keep the browser path, Andrew does the legal review, Android testing on the emulator (no phone). Answered in
Phase 1b (2026-10-08): a deleted winner keeps the reward slot with the name blanked; the Square
gift-card ledger is kept, unlinked. Legal: New Jersey LLC, New Jersey governing law, no liability
dollar cap.

## 7. Account details (Andrew fills in during Phase 0; no secrets here)

- Legal business name: Hightop Challenge LLC (New Jersey) — `LEGAL_ENTITY_NAME` in `lib/legalInfo.ts`
- D-U-N-S number: 14-998-5585 (received 2026-10-17)
- Apple Team ID: 2U7HMXGQM3 (given by Andrew 2026-10-22; public, not a secret) — server env `APPLE_TEAM_ID`
- Google Play developer account name: Hightop Challenge (given by Andrew 2026-10-22)
- Firebase project id: hightop-challenge-fdca1 (from `.firebaserc`, untracked)
- Meta (Facebook) App ID, for Instagram Story direct-share (Phase 9d): 1413553567605243 (given by Andrew 2026-10-22; an App ID is public, not a secret)
- Support email: support@hightopchallenge.com — `SUPPORT_EMAIL` in `lib/legalInfo.ts`
- Where the signing keys and APNs key are stored (location only):
  - Public Play **app-signing** SHA-256 (Andrew supplied 2026-10-25):
    `D6:3F:6E:3E:B3:E3:BA:49:7E:A7:3B:AE:19:A3:56:3D:86:D7:8F:4A:9D:59:E6:16:2B:FD:22:99:06:ED:8C:4E`.
    Configured in production `ANDROID_APP_CERT_SHA256`; private Play app-signing key remains managed by Google.
  - Android upload keystore: `/Users/andrewserulneck/Library/Application Support/Hightop Challenge/signing/android-upload.p12`
  - Android upload credentials: same private folder, `android-upload-credentials.json`; **backup to Andrew's password manager pending**.
    Never commit/print the file contents. Folder mode 0700; keystore/credentials mode 0600.
  - Public upload certificate: same folder, `android-upload-certificate.pem`. This is **not** Google's Play app-signing certificate.
  - iOS distribution/APNs private-key locations remain unconfirmed here.
    APNs **upload to Firebase confirmed by Andrew 2026-10-25**; key backup location and real-device delivery
    are separate outstanding checks. Distribution signing uses Xcode-managed signing; no exported private-key
    backup was created by this release preparation.


---

## Standing rules (moved from CLAUDE.md, 2026-11-03)

> These rules were in the project `CLAUDE.md` until 2026-11-03 and still apply. CLAUDE.md now keeps a
> one-line pointer here. Keep this section current when the feature changes.

### Native app (App Store / Google Play) — planned 2026-10-08

Plan: `docs/native-app-store-plan.md` (phases, models, Andrew's decisions). One Capacitor app over
the live site, for **PLAYERS ONLY** (Andrew, plan §2 item 12): every `/owner/*` page, `/tv` and
`/admin` open in the system browser, never in-app — no partner link, sign-in, dashboard or billing
screen anywhere in the app. Partners use the website. Read the plan before any native/app-store work.

- **Native passkeys (Phase 4c / Part B, 2026-10-25).** Paid-team signing was already done in 5.2 and is verified
  in the signed app (`2U7HMXGQM3.com.hightopchallenge.app`, profile expires 2027-10-23). Andrew verified iPhone
  passkey creation, native Face ID sign-in and Safari sign-in with that same passkey. Approved migration
  `20261025150000_native_discoverable_passkeys.sql` is applied: discoverable authentication must allow an unknown
  account on the challenge; registration still requires an account/profile. Never reintroduce `account_id NOT NULL`
  on every challenge. Android WebView/Credential Manager integration is built locally; exact app-certificate origins
  are derived by `getExpectedPasskeyOrigins` in `lib/webauthn.ts` from the same certificate reader as Digital Asset
  Links. Android association/verifier are live at `7aacf153` (2026-10-25); Google DAL verifies both hosts' credential
  trust and play.'s App Links with the supplied Play signing SHA-256. Real Play-installed passkey testing is still
  open; never substitute debug/upload certificates or claim Android end-to-end ready. Handoffs `docs/native-app-store-plan_PHASE_4C_HANDOFF.md`
  and `docs/native-app-store-plan_PHASE_2B_HANDOFF.md`; 7+ day persistence remains unverified.
- **Player account deletion is live (Phase 1b, 2026-10-08).** One all-or-nothing RPC,
  `delete_player_account` (migration `20261008044524`), called only by `lib/playerAccountDeletion.ts`
  from `POST /api/account/delete` (signed session only; 503 without `SESSION_SECRET`, because dev
  shares the production DB). Andrew: REMOVE, don't anonymise — except a won reward keeps its
  `challenge_cycle_winners` slot with `winner_user_id` NULL (else sweeps re-award the prize), and the
  Square ledger is kept unlinked. `challenge_campaigns.winner_user_id` has NO FK on purpose (a
  "resolved" marker). A new `users` FK that is ON DELETE SET NULL must be deleted explicitly in the
  function — `tests/account-deletion-contract.test.ts` fails until it is. SQL is proven on PGlite by
  `npm run test:account-deletion-sql`. Emailed requests: `scripts/delete-player-account.cjs`.
- **`native/` is the Capacitor shell (Phase 2 spike, 2026-10-08)** — its own `package.json`, excluded
  from `tsconfig`/eslint/Vercel (`.vercelignore`). Build Android with `JAVA_HOME=/opt/homebrew/opt/openjdk@21`
  (Gradle can't run on Android Studio's Java 25); Gradle output goes to `~/Library/Caches/hightop-native/`
  because iCloud syncs `~/Documents` and makes `name 2` copies that break builds. Findings and commands:
  `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`.
- **The iPhone app's web view starts BELOW the status bar (Phase 2D, 2026-10-09)**:
  `@capacitor/status-bar` `overlaysWebView: false` + dark navy, light icons (`SystemBars.style "DARK"`;
  Android paints the edge-to-edge strip via `htc_canvas` in `styles.xml`). Don't flip it back to
  overlaying: half the player screens ignore `env(safe-area-inset-top)`. Never put safe-area top padding
  on a `<section>`/`<article>`: `.tp-page-main section` gets `0.625rem !important` on phones and silently
  replaces it (`tests/native-safe-area-contract.test.ts`).
- **The app's front door + link-outs (Phase 2E, 2026-10-09; 3B.1).** `lib/nativeApp.ts` is the ONLY
  reader of the `HightopChallengeApp/` UA token and `window.Capacitor` (`isNativeApp()`,
  `isNativeUserAgent()`); contract test. In the app `/` is the player sign-in and nothing else: no Home
  link, no partner link (`app/page.tsx` passes the server's UA check as `JoinFlow`'s `nativeAppRequest`
  so even the first paint has no Home). The 2E remembered-partner launch (`AppFrontDoor`,
  `lib/appFrontDoor.ts`, cookie `htc_app_side`) was deleted in 3B.1 — don't bring it back. Marketing pages (`plugins.HightopShell.openInBrowser` in
  `native/capacitor.config.json`) open in the system browser; legal pages stay in the app. The offline
  page is shown by our own native wrappers (`HightopBridgeViewController.swift`,
  `HightopWebViewClient.java`) only for real network errors — `server.errorPath` is deliberately unset.
- **Production shell (Phase 3, 2026-10-09; handoff `docs/native-app-store-plan_PHASE_3_HANDOFF.md`).** No
  `@capacitor/*` package in the website — `lib/nativeApp.ts` talks to the injected bridge
  (`hasNativeCapability()`, `callNative()`, `addNativeListener()`, `openInSystemBrowser()`); check the
  capability first, old app versions stay in use. Link-outs are ONE list: `lib/nativeLinkOut.ts` =
  `native/capacitor.config.json` `openInBrowser.paths`; the web-only entries are **`/owner`, `/tv`,
  `/admin`** (each = itself and everything below). The shell catches full page loads on the apex;
  everything else (Next router hops, `/owner` on `play.` while the split is off) is caught by
  **`proxy.ts`**, which rewrites an app-UA request for a web-only page to the static notice page
  `app/in-app-notice/[page]` (URL unchanged) — browsers never match, so the partner pages stay static.
  Don't add a per-page `WebOnlyInApp` layout gate (deleted in 3B.1: it made every page it wrapped a
  per-visit render). Never a Subscribe/Pay button in the app — guaranteed by `/owner` being web-only. Android Back runs the on-screen control
  (`components/navigation/nativeBackButton.ts`: overlay > step > exit) — never new navigation logic.
  Every closable player popup calls `useNativeBackHandler("overlay", open ? close : null)` with its X's close
  (list pinned in `tests/native-back-review-fixes.test.ts` — add new popups there); native Back runs
  `handleExit({ replace: true })` (a tap pushes); the venue hub is the root and Back minimises (review-fix R1).
  Native env vars (`NATIVE_APP_*`, `APPLE_TEAM_ID`, `ANDROID_APP_CERT_SHA256`) are server-side but
  need a Vercel **Redeploy** to apply. App version lives in four places, pinned equal by
  `tests/native-app-contract.test.ts`.
- **Native share, haptics and the QR scanner (Phase 4, 2026-10-09; handoffs `…_PHASE_4A_HANDOFF.md`,
  `…_PHASE_4B_HANDOFF.md`).** Plugins are capability-checked (`NativeCapability` in `lib/nativeApp.ts`:
  `Share`, `Haptics`, `Filesystem`, `CapacitorBarcodeScanner`); old app builds fall back. Share: `lib/nativeShare.ts`
  (link/text) and `lib/nativeImageShare.ts` (story picture; Android only, via Filesystem cache). Haptics have ONE native call
  site, `playHaptic` in `lib/nativeHaptics.ts`, reached from `triggerAnimation` (gameplay animations) and from
  `haptic()` in `lib/haptics.ts` (taps/submits/claims; with the plugin it skips `navigator.vibrate`, so no
  double buzz; website unchanged). Never call both for one moment. The Rewards "prize won" buzz baselines only on a successful load (`hasLoadedChallenges`). **QR scanner:** `lib/nativeQrScan.ts` — `parseHightopQr`
  accepts ONLY https `play.hightopchallenge.com` / `hightopchallenge.com` at `/` or `/join` (optional `?v=`), and the
  app navigates to a path it BUILDS (`joinPathForScan`), never to the scanned text. On the signed-in venue list a
  scan instead selects via `handleSelectVenue`, only if the venue is in the built list (`decideScannedVenue` in
  `lib/joinVenueList.ts`, R2) — a QR never bypasses the geofence. Plugin is
  `@capacitor/barcode-scanner` (the MLKit one has no Swift Package Manager support — don't swap it in);
  Android minSdk is 26 because of it. Camera is asked for only on tap. No partner surface (player-only app).
- **App download link `hightopchallenge.com/app` (Phase 9a, 2026-10-22).** `app/app/route.ts` 302s by User-Agent via
  `decideAppLinkDestination` (`lib/appDownloadLink.ts`): iPhone → App Store, Android → Play, else `/info#app`; store URLs are
  EMPTY constants there until the listings are live (until then everyone lands on the player sign-in); inside the app → the
  front door. **9g (2026-10-23):** once a store URL is set, a phone first sees a tiny page (`lib/appDownloadPage.ts`: "Get the app" /
  "No thanks, play in the browser"; `decideAppLinkDestination` returns `kind: "ask"`); a Mac-looking Safari = maybe an iPad. The PATH is permanent (printed on shared pictures; literal, never env). Share cards (9b) print `APP_DOWNLOAD_URL`.
- **Share pictures v2 (Phase 9b, 2026-10-22; handoff `docs/native-app-store-plan_PHASE_9B_HANDOFF.md`).** "Create story" opens
  READY-MADE designs first (Spotlight / Card / Night, no camera), Story 1080×1920 or Post 1080×1350; "Add a selfie" is the
  old camera flow. A game is a registry entry (`lib/socialShare/shareGames.ts`; no share component/layout branches on a game id,
  test). Layouts: `lib/socialShare/shareDesigns.ts`; one renderer `storyCanvas.ts`. Headline = Andrew's line, ONLY via
  `shareWinHeadline` (`copyPresets.ts`). Every picture carries the bar (name + street + city, no directions) and the QR file
  `public/share/app-download-qr-v1.png` = `APP_DOWNLOAD_URL` (`npm run share:qr`; new value = new file name). Canvas text ≥ 34px
  (= 12px on a phone). The hub remembers its venue for the games (`rememberShareVenue`, zero requests). Visual check:
  `npm run share-card:render -- --sheet` (also decodes every QR).
- **"Share my win" (Phase 9c, 2026-10-22; handoff `docs/native-app-store-plan_PHASE_9C_HANDOFF.md`).** ONE button,
  `components/social-share/ShareWinButton.tsx` (wraps `StoryShareLauncher variant="button"`; reads the player from storage, makes
  no request). A new win screen adds it and is listed in `tests/share-win-button.test.ts`. It only appears on a result the screen
  already loaded; a prize shares `prizeCardFace` (name only — never a code/QR/card number, tested). Share analytics accept every
  registry game (`story_share_events_game_type_valid`, migration `20261023004047`, applied).
- **The share sheet (Phase 9d, 2026-10-22; handoff `docs/native-app-store-plan_PHASE_9D_HANDOFF.md`).** Still ONE sheet,
  `StoryCaptureModal` (never fork it): designs + Story/Post + caption box ("Copy caption + link") + a destinations row
  (`components/social-share/ShareDestinations.tsx`). What a tap does is pure in `lib/socialShare/shareDestinations.ts`
  (`planShareDestination`); words in `copyPresets.ts`. The clipboard write starts inside the tap before any await (browsers
  allow it only then; `lib/copyText.ts`), and the picture still goes with NO `url` field. In the app, Instagram Story uses
  our plugin `InstagramStories` (`native/…/InstagramStoriesPlugin.{swift,java}`, Meta App ID in
  `native/capacitor.config.json`; web side `lib/nativeInstagramStories.ts`, capability-checked; old builds → share sheet). On iPhone the picture REPLACES
  the pasteboard, so the caption goes to the plugin and rides in the same item (9f.2) — never a picture-only `setItems`.
  Next: the 9f review's fix phases (9f.1–9f.4 built 2026-10-22; 9f.5–9f.6; 9f.2's iPhone check is section J item 33) (plan; handoff `docs/native-app-store-plan_PHASE_9F_HANDOFF.md`), then 9g.
- **What a share shows (Phase 9e, 2026-10-22; handoff `docs/native-app-store-plan_PHASE_9E_HANDOFF.md`).** ONE choice per venue
  (Andrew): `venues.instagram_handle` (bare, CHECK = `parseInstagramHandle` in `lib/venueShareDetails.ts`) + `share_show_name /
  _address / _instagram` (default true; migration `20261023011500`, applied 2026-10-22). Applied in ONE place, `applyShareVenue` (`lib/socialShare/shareVenue.ts`), called only by
  `StoryShareLauncher` — so every game/prize, including new ones, honours it; no screen sets `venueInstagram` (contract test). Players
  read it on the venue rows they already load (`lib/venues.ts` select tiers step down if the columns are missing; localStorage
  `htc_share_venue_v3` with `savedAt`). **9f.4: the partner's choice always wins** — a remembered copy older than 10 min
  (`SHARE_VENUE_FRESH_MS`) means the open sheet reads the one row (`fetchVenueById`, which tells a failed read from the
  fallback list), and nothing can be sent until it settles (`resolveShareVenue`); unknown → `applyShareVenue(p, "unknown")`
  = no bar at all, never the screen's own name. Partners edit it in ONE panel, `components/owner/share/ShareDetailsPanel.tsx` (Schedule Review, the
  owner wizard's `confirmExtra`, Game Settings; admin venue form with `host="admin"`), saved on its own via
  `PATCH /api/owner/venues/share-details` (owner auth + venue check first) or `/api/admin/venues/share-details`.
- **Phone push (Phase 5.1, 2026-10-23; handoff `docs/native-app-store-plan_PHASE_5_1_HANDOFF.md`; migration
  `20261023105750` applied).** Firebase Cloud Messaging, no SDK on the server: `lib/push/fcm.ts` is the only reader
  of `FCM_SERVICE_ACCOUNT_JSON` (unset → every sweep returns before any read). The hook is the `notifications`
  TABLE, not `createNotification()` (ten writers incl. two SQL functions): `claim_notification_pushes` stamps
  `pushed_at` once, run by `lib/push/outbox.ts` at the end of `/api/cron/bingo-progress`; "Live Trivia starts soon"
  is `lib/push/gameReminders.ts` in `/api/cron/resolve-live-trivia-winners`, once per game via `push_game_reminders`.
  No new cron. `push_devices` is written only by `lib/push/devices.ts` (route `POST /api/push/devices`, session-bound,
  503 without `SESSION_SECRET`). App side: `lib/nativePush.ts` is the only caller of the `FirebaseMessaging` plugin;
  the ask is `PushPermissionCard` on Venue Home only once the player has points (never at launch), switches are
  `PushNotificationSettings` in the menu, Sign Out unregisters first. **5.3 (2026-10-23): the FIRST ask is our own
  full screen, `PushWelcomeScreen` on Venue Home (once per phone, `htc:push-welcome-seen-at`); the OS prompt only on its
  Turn on; the card is the later reminder. `PopupAds` asks `pushWelcomeHoldsPopupAds()` before every popup — the welcome
  and a popup ad never share a visit. Words in `PUSH_COPY` promise only pushes the server sends (contract test).** Categories: `games`/`prizes`/`results`/`news`
  (`lib/pushCategories.ts`). **5.4 (2026-10-23, migration `20261023141109` applied): `news` = "News from your bars", the ONE
  promotional switch (Apple 4.5.4; default on, stated on the welcome before Turn on).** A partner's NEW game or prize
  (`POST /api/owner/schedule`, `POST /api/owner/rewards` only) → `lib/push/venueNews.ts` after the reply (`after`) → RPC
  `claim_venue_news_push` (once per game/prize, cap `VENUE_NEWS_DAILY_CAP` = 5 per bar per local day, audience = phones of
  players with a profile at the bar). **5.5 (2026-10-23, migration `20261023145024` NOT yet applied; flag
  `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED`, off): partner-written messages** on the same `news` switch and audience. Rules +
  copy + caps (`PARTNER_MESSAGES_DAILY_CAP` = 2, `PARTNER_MESSAGE_REPORTS_TO_PAUSE` = 3, 150 chars, no links, word list)
  in `lib/partnerMessageRules.ts` (also the flag's one reader); the ONLY caller of `claim_venue_message_push` /
  `read_venue_message` / `report_venue_message` and writer of `push_venue_message_pauses` is `lib/push/venueMessages.ts`.
  Compose box `components/owner/messages/PartnerMessagesSheet.tsx` (`?sheet=messages`, website only) → `/api/owner/messages`;
  a tapped push opens `/venue/{id}?message={id}` → `components/push/PartnerMessageSheet.tsx` (Report) → `/api/push/messages/[id]`
  (signed session; popup ads wait while `?message=` is in the URL); admin pause/un-pause in Venues → `PartnerMessagesPanel`.
  `tests/partner-messages.test.ts`. **10.1 (2026-10-26, migration `20261026173304` applied 2026-10-26):** a reporter is a
  PERSON (`venue_message_reporter` = account, else profile; SQL only); admin un-pause ONLY via `unpause_venue_messages`
  (also stamps `reports_reviewed_at`; missing RPC → 503, never a plain delete).
  `tests/push-notifications-contract.test.ts`, `npm run test:push-sql`. iPhone half = Phase 5.2 (signed by the
  paid team as `com.hightopchallenge.app` 2026-10-23; Andrew confirmed APNs key uploaded 2026-10-25;
  real iPhone push delivery remains unverified — `…_PHASE_5_2_HANDOFF.md`). Firebase Analytics must stay unlinked.
- **"Get the app" promotion hosts (Phase 10.3, 2026-10-26).** `promotionHosts()` / `isPromotionHost()` in `lib/appStorePromotion.ts`
  are the one home of which hosts show the banner, the sign-in line and the Safari tag: `playHost()`, plus the apex and `www.` while
  the domain split is OFF (Andrew). Never type the game host in those files (test). `/info#app` renders on the server in desktop form
  (snapshot `"pending"`), and `/app` sends a desktop there only when `appStorePromotionReady()` (`desktopSectionLive`).
- **Legal pages** (`/privacy /terms /rules /support /delete-account`) take their facts from
  `lib/legalInfo.ts`; a signed-in player can read them only because `AuthNavigationGuard` allowlists
  `LEGAL_PAGE_PATHS`. `/privacy` promises usernames never go to Anthropic — keep
  `ANTHROPIC_USERNAME_MODERATOR_API_KEY` unset in Vercel unless the policy changes first.
