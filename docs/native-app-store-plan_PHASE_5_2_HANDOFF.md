# Native App Store Plan — Phase 5.2 Handoff (push notifications: iPhone)

**Date:** 2026-10-23 (two sessions). **Phase:** 5.2 of `docs/native-app-store-plan.md` (Opus 5.5, high). Follows
`docs/native-app-store-plan_PHASE_5_1_HANDOFF.md` (server, website, Android — read that first).
**State: BUILT, SIGNED, INSTALLED — device test NOT done.** The app is now signed by the paid team as
`com.hightopchallenge.app` with the push + associated-domains entitlements and is installed on Andrew's iPhone. 5.1 +
5.2 + 4d are committed and pushed to `main` (Vercel deploys it). What's left: Andrew uploads the APNs key to Firebase,
then the section K device test on the iPhone.

---

## Summary for Andrew (plain English)

**What changed.** The iPhone app is now the real app: signed by Hightop Challenge LLC, with its permanent id
`com.hightopchallenge.app`, and allowed to receive notifications. It's installed on your iPhone as a second Hightop
icon next to the old test app (sign in again in the new one; delete the old one whenever you like). The website
push code is deployed.

**What's left (yours, about 5 minutes).** Apple delivers every iPhone notification. Firebase sends ours, so Firebase
needs Apple's permission slip, a one-time key file (`.p8`):
1. developer.apple.com/account → **Certificates, Identifiers & Profiles** → **Keys** → **+** → name it "Hightop push"
   → tick **Apple Push Notifications service (APNs)** → Continue → Register → **Download** (only possible once).
   Note the **Key ID** on that page.
2. Save the `.p8` in your password manager. Never email it or put it in the project.
3. console.firebase.google.com → **Hightop Challenge** → ⚙ **Project settings** → **Cloud Messaging** → **Apple app
   configuration** → "Hightop Challenge iOS" → **APNs Authentication Key** → **Upload** → the `.p8`, the Key ID, Team
   ID **2U7HMXGQM3**.
4. Tell the next agent where you stored it (the place only), so it goes in plan §7.

**Until then:** in the new iPhone app, "Turn on" on the "Get a heads-up?" card may show Apple's prompt and then
"Couldn't save that". Tap "Not now" until the key is uploaded.

**Cost:** none (Firebase and Apple notifications are free).

---

## For the next agent

### 1. Remaining scope of 5.2
1. **Confirm the APNs key is uploaded** (ask Andrew; Firebase console → Cloud Messaging → Apple app configuration
   shows it). Record its storage location (place only) in plan §7 "Where the signing keys and APNs key are stored".
2. **Device test** on Andrew's iPhone 16 Pro (device id `00008140-001E74DE1A7B001C`, phone UNLOCKED): run section K
   of `docs/native-app-device-checklist.md` (items 43–50) on iPhone. Check a push arrives with the app in the
   background AND after swiping it away, and that the tap opens the right page. Confirm a `push_devices` row with
   `platform = 'ios'` appears for the test player (read-only query, `node --env-file=.env.local`).
3. Check the deploy of the push commit finished (Vercel) before the device test: `POST /api/push/devices` must not 404.
Out of scope: partner-sent pushes (5b), marketing pushes, server changes, Part B's passkey and 7-day tests (2B — the
signing switch they needed is done; see §3).

### 2. Starting state
- Branch `main`. The push work (4d + 5.1 + 5.2) is ONE commit on top of `cdc832a`, pushed to `origin/main`
  (2026-10-23). Left uncommitted on purpose (not this phase's): POS doc/comment edits (`docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts` comment), `docs/reel-video-assets-plan.md`, the squares
  fixture `tests/fixtures/squares/nfl-live-capture-1392309.json` (unreferenced), Andrew's Finder move of
  `design-system/project/public/info/*.png` into "New Folder With Items/", local tool config (`.codex/`, `.mcp.json`,
  `.vscode/mcp.json`, `.firebaserc`, `firebase.json`), and the iCloud duplicate `native/ios/App/App/config 2.xml`
  (delete-worthy junk; not deleted without asking).
- Production DB: migration `20261023105750` applied (5.1). `FCM_SERVICE_ACCOUNT_JSON` set in Vercel Production +
  Preview. `APPLE_TEAM_ID` set in Vercel Production; AASA serves `webcredentials` `2U7HMXGQM3.com.hightopchallenge.app`
  on the apex (applinks only on `play.`, by design: `lib/nativeAppLinks.ts` `claimsLinks`).
- Firebase iOS app: App ID `1:256711123965:ios:e624b8b6f7c4514a056f94`, bundle `com.hightopchallenge.app`, project
  `hightop-challenge-fdca1`. APNs key: not confirmed uploaded as of this handoff.
- Signing on this Mac: Xcode has both teams (paid `2U7HMXGQM3` "Hightop Challenge LLC", personal `Z39Q54R94X`).
  Identities: "Apple Development: Andrew Serulneck (GTS8523WRD)" (paid team, created by `-allowProvisioningUpdates`
  this session) and the old personal one. The iPhone was registered on the paid team this session.
- Installed on the iPhone: `com.hightopchallenge.app` (Debug, development profile, `aps-environment` development).
  The old `com.hightopchallenge.spike` app is still installed too.

### 3. Decisions
- Same plugin as Android (`@capacitor-firebase/messaging@8.5.2`) — it returns an **FCM** token on iPhone, so the
  server (`lib/push/fcm.ts`) is unchanged; Firebase relays to APNs with the uploaded key.
- **Part B signing switch done here** (2026-10-23, Andrew's go-ahead to "execute the rest of 5.2"): both build configs
  `PRODUCT_BUNDLE_IDENTIFIER = com.hightopchallenge.app`, `DEVELOPMENT_TEAM = 2U7HMXGQM3`,
  `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`. Pinned by `tests/push-notifications-contract.test.ts` ("both build
  configs sign as the real app…"). Phase 2B no longer needs to do it; its passkey + 7-day tests can use this build
  (a paid-team development profile lasts a year, unlike the 7-day free one).
- Andrew approved committing + pushing 4d, 5.1 and 5.2 together (they share `AccountMenuList.tsx` and
  `VenueGamesPanel.tsx`) after the full gates passed.

### 4. Files changed in 5.2
- `native/ios/App/App/GoogleService-Info.plist` (new; public client config) + in the App target's Resources.
- `native/ios/App/App/AppDelegate.swift` — APNs token, failure, background notification → `NotificationCenter`.
- `native/ios/App/App/Info.plist` — `UIBackgroundModes` = `remote-notification`.
- `native/ios/App/App/App.entitlements` — associated domains + `aps-environment` `development`; header comment now
  says it is wired.
- `native/ios/App/App.xcodeproj/project.pbxproj` — Part B switch (above) + the plist resource.
- `native/ios/App/CapApp-SPM/Package.swift`, `…/swiftpm/Package.resolved` (firebase-ios-sdk 12.19.3 pinned).
- `tests/push-notifications-contract.test.ts` — "push: the native shells" block (16 tests).

### 5. Facts and traps
- **Device builds need `-allowProvisioningDeviceRegistration`** as well as `-allowProvisioningUpdates` on a new team,
  or xcodebuild fails "Device "iPhone" isn't registered in your developer account". Done once; harmless to keep.
- `devicectl … process launch` fails with `FBSOpenApplicationErrorDomain error 7 … Locked` when the phone is locked —
  ask Andrew to unlock it.
- Probe/launch commands in older handoffs use `com.hightopchallenge.spike`; the bundle id is now
  `com.hightopchallenge.app`.
- **Firebase Analytics is NOT linked** (only FIRMessaging/FIRInstallations; `GoogleAppMeasurement`/`GADConversion` are
  resolved by SPM but not linked). Re-check after any plugin upgrade (App Privacy labels, Phase 6).
- For Phase 6 privacy labels: push adds a device identifier (FCM token / Firebase installation id) for app
  functionality only, not tracking.
- Firebase swizzles the app delegate (I-FCM001000); the explicit AppDelegate methods are still needed. Don't set
  `FirebaseAppDelegateProxyEnabled` NO.
- Derived data: `~/Library/Caches/hightop-native/ios-dd` (simulator) and `~/Library/Caches/hightop-native/ios-dd-device`
  (iPhone) — outside iCloud, keep them there.
- The simulator can receive real pushes after the switch only when the build is signed with the entitlements;
  `xcrun simctl push <device> com.hightopchallenge.app payload.apns` fakes one for tap tests.

### 6. Build, run, verify
- `cd native && npx cap sync ios`
- iPhone: `cd native/ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination
  'id=00008140-001E74DE1A7B001C' -derivedDataPath ~/Library/Caches/hightop-native/ios-dd-device
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build` → **BUILD SUCCEEDED** (2026-10-23), then
  `xcrun devicectl device install app --device 00008140-001E74DE1A7B001C
  ~/Library/Caches/hightop-native/ios-dd-device/Build/Products/Debug-iphoneos/App.app` → installed.
- Verified signed entitlements (`codesign -d --entitlements :- …/App.app`): `application-identifier`
  `2U7HMXGQM3.com.hightopchallenge.app`, `aps-environment` development, associated domains, team `2U7HMXGQM3`.
- Pre-commit gates (2026-10-23, all on the committed tree): `npm run test` 445 files / 5,483 pass / 13 skipped / 0 fail;
  `npm run lint`, `npx tsc --noEmit`, `npm run test:pwa-contract`, `npm run test:god-mode-join`, `npm run build` all
  exit 0. Browser check of the production build (`next start -p 3100`, Chromium 390×844, test player `bktrehearsal1`
  at `venue-hightop-test`): Venue Home renders; no "heads-up" card, no Notifications row, zero `/api/push` requests in a
  browser (app-only, correct); Invite a friend present on the page and in the drawer; Sign Out last. Only error: a 403
  from `/api/venue-presence/heartbeat` (no real location in the harness; code untouched).
- **Not verified:** the app launching on the iPhone (phone was locked), APNs/FCM token issue on the device, any real
  delivery.

### 7. Open questions for Andrew
- Is the APNs key uploaded, and where is the `.p8` stored (place only)?
- OK to delete `native/ios/App/App/config 2.xml` (iCloud duplicate)?

### 8. Recommended first steps
1. Ask Andrew to confirm the APNs key upload and to unlock the iPhone.
2. Check the Vercel deploy of the push commit is live (`POST https://hightopchallenge.com/api/push/devices` ≠ 404).
3. Launch with console: `xcrun devicectl device process launch --device 00008140-001E74DE1A7B001C --console
   --terminate-existing com.hightopchallenge.app` — no I-FCM012002 ("no valid aps-environment") line should appear.
4. Section K on the iPhone; record results in the checklist and plan. Opus 5.5, high.
