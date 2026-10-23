# Native app plan — Phase 9a handoff (app download link) — 2026-10-22

## For Andrew (plain English)
- **What changed:** `hightopchallenge.com/app` now exists. Tap it on an iPhone → App Store, on Android → Google Play, on a
  computer → the `/info` page. **The store listings don't exist yet**, so today every device lands on the player sign-in
  (`play.hightopchallenge.com`). On launch day we paste the two store URLs into one file and it upgrades itself.
- **Live?** No. Built and tested locally; **not committed, not pushed, not deployed.** It only works on the website after you
  deploy.
- **Native app rebuilt from `main`:** `npx cap sync`, Android debug build and iOS simulator build both succeeded. I did not
  install them on your phone/emulator.
- **Recorded in plan §7:** Meta App ID `1413553567605243`, Firebase project `hightop-challenge-fdca1`.
- **Needs you:** say if you want me to commit + push; then deploy and open `hightopchallenge.com/app` on your phone to check.
  Apple Team ID and Google Play account name in plan §7 are still blank.

## For the next agent
1. **Next:** Phase 9b (Opus 5.5, high) — share card v2, per plan "Phase 9b". Out of scope here: store badges (Phase 7), 9d.
2. **Starting state:** branch `main`, last commit `9cf67f7`. Phase 9a changes are uncommitted alongside unrelated pre-existing
   uncommitted work (CLAUDE.md, docs, `lib/pos/providers.ts`, deleted design-system PNGs, `.codex/`, `.firebaserc`, `.mcp.json`,
   `firebase.json`) — stage only 9a files: `app/app/route.ts`, `lib/appDownloadLink.ts`, `tests/app-download-link.test.ts`,
   `proxy.ts`, `lib/domainSplit.ts`, `CLAUDE.md` (the 9a bullet only; it also has other uncommitted edits), plan + this file.
3. **Decisions:** no public venue page; shares point to `/app`; until listings are live everyone → sign-in (Andrew, plan item 7).
4. **Files:** `lib/appDownloadLink.ts` (`APP_DOWNLOAD_URL`, `APP_DOWNLOAD_DISPLAY_URL`, `STORE_URLS`, pure
   `decideAppLinkDestination`); `app/app/route.ts` (302, `private, no-store`, force-dynamic); `proxy.ts` (`/app` exact public);
   `lib/domainSplit.ts` (`/app` classified neutral so the split never bounces it). 9b must print/encode `APP_DOWNLOAD_URL`
   and add the contract test "share-card QR value === `APP_DOWNLOAD_URL`".
5. **Traps:** Phase 7 should reuse `STORE_URLS` (don't add a second constants file). The AASA/assetlinks files may open `/app`
   in the installed app via universal links on the apex — not checked; the native-UA branch sends it to the front door anyway.
6. **Verified:** `npx vitest run tests/app-download-link.test.ts tests/native-app-contract.test.ts tests/lib.native-app-phase3.test.ts`
   (53 pass); `npx tsc --noEmit` and eslint clean on touched files. Native: `cd native && npm install && npx cap sync`;
   Android `cd native/android && ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`
   → success; iOS `xcodebuild … -destination 'generic/platform=iOS Simulator'` → success. Full `npm run test` also passes (431 files, 5,283 tests). **Not run:**
   `npm run build`, a real HTTP hit on the route, device install. `npm install` in `native/` reported npm audit warnings (not acted on).
7. **Open questions:** commit/push/deploy go-ahead; Apple Team ID.
8. **First steps for 9b:** read plan "Phase 9b"; run `npm run build` once to confirm `/app` appears as a dynamic route.
