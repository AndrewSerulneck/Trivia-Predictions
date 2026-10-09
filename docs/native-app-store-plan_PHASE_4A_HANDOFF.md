# Native App Store Plan — Phase 4a Handoff (native share + haptics)

> **Update 2026-10-09:** Andrew approved `@capacitor/filesystem`, so Android now shares the story picture natively
> (Phase 4a.1, `lib/nativeImageShare.ts`) — "no `@capacitor/filesystem`" below is superseded. Phase 4a is committed
> (`1aac107`, `92f6304`). Next-phase notes and the "where else Invite a friend" answer: `…_PHASE_4B_HANDOFF.md`.

**Date:** 2026-10-09. **Phase:** 4a of `docs/native-app-store-plan.md` (Sonnet 5.5, medium).
**State:** built and verified by automated tests and by compiling both shells. **Not committed by this
phase's author unless `git log` shows it; NOT pushed, NOT deployed. Not tried on a real phone.**

---

## Summary for Andrew (plain English)

**What changed.**
- **"Invite a friend" button** on Category Blitz's "you're playing solo / need more players" banner. In the
  app it opens the phone's own share sheet (Messages, WhatsApp...) with a link to `play.hightopchallenge.com`.
  In a browser it uses the browser's share sheet, or copies the link and says "Link copied".
- **"Share a link instead"** button in the story-sharing "Share options" box (shown when sharing the picture
  directly doesn't work, which is common on Android).
- **Haptics (small vibrations/taps)** in the app: a tap for a Bingo square, a buzz for correct answers, a
  stronger buzz for a Bingo / champion win, a gentle warning for a wrong answer or near-miss, and a strong buzz
  when a **prize is won while you're looking at the Rewards panel**. They are silent when the phone's Reduce
  Motion setting is on, on the website, and in older app builds.
- Nothing on the server, database or Vercel cost changed.

**Is it live?** No. Nothing is pushed. **The app on your phone has no share/haptics plugins yet**: it needs a
rebuild (the website part falls back safely until then).

**Needs you / left.**
1. Push + deploy decision (this sits on top of unpushed 2D+2E+3+3B work).
2. Rebuild the iPhone/Android app and try: Invite a friend, a correct answer, a bingo (checklist below).
3. Honest limit: sharing the story **picture** straight into the share sheet still relies on the phone's web
   view. iPhone handles it; Android's web view does not, so Android gets the Save-image sheet plus the new
   "Share a link instead". Sharing the image natively on Android needs one more plugin (`@capacitor/filesystem`)
   — say if you want it.
4. There was no "invite friends" feature before; I added it only to the Category Blitz banner. Tell the next
   agent where else you want it (e.g. venue home).

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md` (Native app bullets), `docs/native-app-store-plan.md`,
`docs/native-app-store-plan_PHASE_3_HANDOFF.md` (rebuild/run commands) and this file.

### 1. Next phase
**4b — in-app QR scanner (Sonnet 5.5, high)**: plan §Phase 4b. App-only "Scan QR" on join/venue-list screens;
only accept `play.hightopchallenge.com` / `hightopchallenge.com`; camera permission only on tap. Out of scope:
4c (Face ID, needs paid Apple account), 5 (push), anything for partners (the app is player-only, §2 item 12).
4b adds a native plugin, so register its capability name in `NativeCapability` (`lib/nativeApp.ts`) and check
`hasNativeCapability` first. Camera needs `NSCameraUsageDescription` (iOS) / `CAMERA` permission (Android).

### 2. Starting state
- Branch `main`. Prior unpushed commits: 3B.2 (`772aa5a`), 3B.1 (`1fb5a1f`), 2D+2E+3 (`4706072`). Run
  `git log --oneline -6` and `git status` — Phase 4a's changes may be uncommitted if Andrew hasn't asked.
- `.vscode/settings.json` is untracked and not ours; leave it.
- Pre-existing iCloud conflict copies (`.next/types/routes.d 2.ts`, `tests/* 2.ts`) make `npx tsc --noEmit`
  report `Duplicate identifier 'LayoutProps'` in `.next/types/routes.d 2.ts` — that is the ONLY tsc error and
  predates this phase. Tell Andrew before deleting them. `npm run build` regenerates `.next/types`.
- No migrations, env vars, `vercel.json`, or production data touched.

### 3. Decisions (don't re-ask)
- Scope: text/link share + haptics only. No `@capacitor/filesystem`; no native image share (see Summary 3).
- Haptics are fired from ONE place: `triggerAnimation` in `components/animations/AnimationTriggerProvider.tsx`
  via `hapticForAnimation(type)` (map in `lib/nativeHaptics.ts`). Don't sprinkle `playHaptic` at call sites;
  add new gameplay haptics by adding the animation type to the map. Exception: prize-won in
  `components/venue/VenueChallengesPanel.tsx` (a transition-detecting effect; the first batch of cards is the
  baseline so opening the panel on an already-won prize stays quiet).
- Invite link = `JOIN_QR_URL` (permanent, `lib/joinQr.ts`). Never env-derived.
- App version NOT bumped (additive plugins; the four pinned places are unchanged, `tests/native-app-contract.test.ts`).

### 4. Files
- `lib/nativeApp.ts` — `NativeCapability` now `"App" | "Geolocation" | "HightopShell" | "Share" | "Haptics"`.
- `lib/nativeShare.ts` — `sharePayload(payload)` → `"shared" | "copied" | "canceled" | "failed"`: native Share →
  `navigator.share` → clipboard. `INVITE_FRIEND_PAYLOAD`.
- `lib/nativeHaptics.ts` — `playHaptic(kind)`, `hapticForAnimation(type)`; no-op without the plugin or with
  `prefers-reduced-motion`; never throws.
- `components/social-share/ShareLinkButton.tsx` — the one share-a-link button (shows "Link copied").
- `components/social-share/ShareActionsSheet.tsx` (+ `linkShare` prop) and `StoryCaptureModal.tsx` (passes it).
- `components/category-blitz/CategoryBlitzGame.tsx` — `InviteBanner` gets the button.
- `native/package.json`, `package-lock.json`, `ios/App/CapApp-SPM/Package.swift`,
  `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle` — `@capacitor/share@8.0.3`,
  `@capacitor/haptics@8.0.2` added via `npm install` + `npx cap sync` (all in `native/`).
- `tests/native-share-haptics-contract.test.ts` — 10 tests.

### 5. Facts and traps
- zsh: `grep --include=*.tsx` without quotes fails ("no matches found"); quote the glob.
- Only `lib/nativeApp.ts` may read `window.Capacitor`; share/haptics go through `callNative` (contract test).
- Capacitor Share on Android resolves (not rejects) when dismissed, so the button says nothing — correct.
- The Share plugin method is `share`; Haptics methods used: `impact {style: LIGHT|HEAVY}`, `notification {type: SUCCESS|WARNING}`.
- Don't run typecheck and build together. Never `git checkout -- <file>`.

### 6. Build, run, verify
- Web: `npx tsc --noEmit`, `npm run lint` (clean), `npm run test` → **316 files passed / 1 skipped, 3,626 tests
  passed / 13 skipped / 0 failed**. `npm run build` not re-run in this phase.
- Shells: `cd native && npx cap sync`. Android: `cd native/android && JAVA_HOME=/opt/homebrew/opt/openjdk@21
  ./gradlew assembleDebug` → BUILD SUCCESSFUL. iOS: `xcodebuild -project native/ios/App/App.xcodeproj -scheme App
  -sdk iphonesimulator -configuration Debug -derivedDataPath ~/Library/Caches/hightop-native/ios-dd
  CODE_SIGNING_ALLOWED=NO build` → BUILD SUCCEEDED (derived data kept out of iCloud).
- **NOT verified:** any real device/simulator run; the share sheet appearing; haptics actually felt (simulators
  don't vibrate — iPhone/Android hardware only); the prize-won buzz.

### 7. Device checklist for Andrew (add to `docs/native-app-device-checklist.md` if you extend it)
1. Rebuild/install the app. Open Category Blitz alone at a venue: banner shows "Invite a friend" -> native share
   sheet with the link. Cancel -> nothing happens.
2. Same button in Safari/Chrome: share sheet or "Link copied".
3. Answer a Speed Trivia question right/wrong, get a bingo square: buzz/tap on the phone. Turn on iOS Reduce
   Motion: no buzz.
4. Story share on Android: "Share a link instead" opens the share sheet.

### 8. Open questions for Andrew
Push/deploy timing; native image sharing on Android (needs `@capacitor/filesystem`); other places for Invite.

### 9. Recommended first steps for 4b
`git log --oneline -6`; read plan Phase 4b; pick a maintained barcode plugin (check last release and Capacitor 8
support before choosing); mirror this phase's pattern (capability name, `callNative`, contract test, `cap sync`,
both shell builds).
