# Native app plan — Phase 9d handoff (the share sheet) — 2026-10-22

## For Andrew (plain English)
- **What changed:** the "Share your win" screen now has, under the pictures, the **caption** ("I just won $15 off my tab
  at The Pour House! Play on Hightop Challenge: https://hightopchallenge.com/app") with a **Copy caption + link** button,
  then one row of apps: **Instagram Story, Instagram post, Facebook, X, Messages, Save, More**, then the line "Tag The Pour
  House in your post" and a small **Take a selfie instead** button.
- **What each tap does:** it copies the caption, opens the phone's share sheet with the picture, and says which app to
  pick (for Instagram: "Paste the link in a link sticker"). A website can't send a picture straight to one app; only the
  phone's share sheet can.
- **Inside the app, Instagram Story opens Instagram's Story editor with the picture already in it** (Meta's "Sharing to
  Stories", using your Meta App ID 1413553567605243). This needs a **new app build** (it's native code). Old builds, and
  phones without Instagram, get the share sheet instead.
- **Your other answers are in the plan:** Phase **9e** (revived) adds the bar's Instagram handle to the caption and lets
  each partner choose whether the handle, name and address appear on share pictures (all, none or any mix), asked when they
  set up a Prize or schedule a game. Phase **9g** (new) makes `hightopchallenge.com/app` ask "Get the app?" on a phone,
  with "No thanks, play in the browser". 9g only shows once the store listings are live.
- **Live?** No. Built and tested on this computer only: **not committed, not pushed, not deployed**. 9c is also still
  uncommitted (9a and 9b are pushed).
- **Needs you:** (1) say if you want 9c + 9d committed and pushed; (2) one question in plan §6 item 7: should the
  handle/name/address choice be **one per venue** (my plan, because Bingo/Pick 'Em shares have no Prize or scheduled
  game) or **per Prize / per game**?

## For the next agent

### 1. Next phase and scope
**Phase 9e** (Opus 5.5, high; plan "Phase 9e"): `venues.instagram_handle` + three show/hide choices (handle, name,
address), one owner route through `withOwnerVenue`, the same small step in the Prize wizard (owner variant only) and the
Schedule flow, applied in ONE place (the share payload builder), the handle in the caption and on the picture, nudge
"Tag @handle". Needs a migration (`db push` only with Andrew's OK). Then **9g** (Sonnet 5.5, medium): `/app` "Get the app?"
page on phones. Then **9f** (review + phone pass). Out of scope: Phase 7 badges, store URLs.

### 2. Starting state
- Branch `main`, last commit `beebc77` (= 9a + 9b, pushed). **9c and 9d are uncommitted**,
  next to other people's work (`.codex/`, `.firebaserc`, `.mcp.json`, `.vscode/mcp.json`, `firebase.json`, POS docs,
  `lib/pos/providers.ts`, `docs/reel-video-assets-plan.md`, part of `CLAUDE.md`, deleted
  `design-system/project/public/info/*.png`, `tests/fixtures/squares/…`). Stage only 9c/9d files; for `CLAUDE.md` stage
  only the 9c and 9d hunks (`git diff -U3 CLAUDE.md`, split, `git apply --cached --recount`).
- No migration, no env var, no new route, no cron in 9d. Migration `20261023004047` (9c) is already applied.
- `native/` generated copies (`ios/App/App/capacitor.config.json`, Android `assets/`) were refreshed with `npx cap copy`;
  they're git-ignored.

### 3. Decisions (don't re-ask)
- Andrew 2026-10-22 (fourth round, recorded as plan decisions 10–12): @handle in the caption; partner picks handle/name/
  address on share content; `/app` may ask "Get the app?" first.
- Mine for 9d (flag only if Andrew objects): every destination except Save copies the caption; Save in the app = share
  sheet (the web view can't download); X with no picture share opens `x.com/intent/post`; a dismissed share sheet no
  longer pops the old "Share options" panel (it still appears when the browser can't share a picture at all); the
  destination is recorded in the existing analytics `resultReason` (no migration).
- Mine for 9e (in the plan, open question §6 item 7): one choice per venue, asked in both flows.

### 4. Files
New:
- `lib/socialShare/shareDestinations.ts` — `SHARE_DESTINATIONS`, `planShareDestination(dest, { instagramStoryDirect,
  canSharePicture, inApp })` → `{ copyCaption, action: instagram-story-native | share-sheet | x-intent | download, hint }`,
  `xIntentUrl`.
- `components/social-share/ShareDestinations.tsx` — `ShareCaption`, `ShareDestinationRow` (scrolls sideways; X drawn as a
  letter; buttons use `!border-0` and NOT `tp-clean-button`, whose border is `!important`).
- `lib/copyText.ts` — clipboard with the textarea fallback.
- `lib/nativeInstagramStories.ts` — `canShareToInstagramStory()` (one bridge call per sheet open) and
  `shareToInstagramStory(blob)` → `opened | unavailable | failed` (`NOT_INSTALLED` = unavailable).
- `native/ios/App/App/InstagramStoriesPlugin.swift` (+ 4 entries in `project.pbxproj`, ids `…B002` / `…F002`),
  `native/android/app/src/main/java/com/hightopchallenge/app/InstagramStoriesPlugin.java`.
- `tests/share-destinations.test.ts` (25 tests: the plan table, X URL, nudge, sheet contract — clipboard before the first
  await, no `url` with the picture —, both plugins registered, plist/manifest/config).
Changed:
- `components/social-share/StoryCaptureModal.tsx` — caption box, destinations footer, "Take a selfie instead", camera
  footer = Start / Capture / Designs (destinations appear once a selfie is captured), preview `min-h-[14rem]` so it never
  collapses on an iPhone SE (the sheet scrolls), `pickDestination`, `copyCaption`, `shareCapturedStory` returns its result
  and takes the destination for analytics.
- `lib/socialShare/copyPresets.ts` — `SHARE_DESTINATION_COPY`, `shareTagNudge`, `SHARE_COPY_CAPTION_LABEL`, copied/failed lines.
- `lib/nativeApp.ts` — `NativeCapability` gains `"InstagramStories"`.
- `native/capacitor.config.json` (`plugins.InstagramStories.facebookAppId`), `native/ios/App/App/Info.plist`
  (`LSApplicationQueriesSchemes` = `instagram-stories`), `HightopBridgeViewController.swift` (registers the plugin),
  `MainActivity.java` (registers before `super.onCreate`), `AndroidManifest.xml` (`<queries>` com.instagram.android).
- `docs/native-app-store-plan.md` — status line, phase table, decisions 10–12, Phase 9d rewritten as built, Phase 9e
  revived and specified, Phase 9g added, 9f extended, §6 item 7. `CLAUDE.md` — one 9d bullet.

### 5. Facts and traps
- **Gesture rule:** iOS Safari refuses `navigator.share` after an await. `pickDestination` starts `copyText` and the share
  without awaiting anything first (pinned by a test). That's also why "is Instagram installed?" is asked once when the sheet
  opens, not on tap.
- Meta's doc (re-checked 2026-10-22, developers.facebook.com/docs/instagram-platform/sharing-to-stories): iOS pasteboard key
  `com.instagram.sharedSticker.backgroundImage` + `instagram-stories://share?source_application=<App ID>`; Android intent
  `com.instagram.share.ADD_TO_STORY`, `source_application` extra, a content URI (our existing FileProvider
  `${applicationId}.fileprovider`, `cache-path` in `res/xml/file_paths.xml`), background ≥ 720×1280. An App ID is required
  since Jan 2023; no App Review. The Meta-dashboard steps in the plan were left as written (I didn't sign in to check them).
- iOS reads the App ID through `bridge?.config.getPluginConfig("InstagramStories")` (like HightopShell), not `getConfig()`.
- A Post-size picture sent to an Instagram Story is letterboxed on navy (`#020617`); a Story-size one fills the screen.
- Headless Chromium has no `navigator.share`, so a desktop browser shows the old "Share options" panel after a destination
  tap — expected.

### 6. Build, run, test — what was verified
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 435 files / 5,342 pass / 13 skipped; `npm run build` ok.
- Shells: `cd native && npx cap copy`; Android `cd native/android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew
  assembleDebug` → OK; iOS `xcodebuild -project native/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration
  Debug -derivedDataPath ~/Library/Caches/hightop-native/ios-dd CODE_SIGNING_ALLOWED=NO build` → BUILD SUCCEEDED.
- **iOS simulator** (iPhone 17, probe hook `SIMCTL_CHILD_HIGHTOP_PROBE_STEPS`; bundle id there is still
  `com.hightopchallenge.spike`) and **Android emulator** (`hightop_api36`, CDP via `adb forward tcp:9333
  localabstract:webview_devtools_remote_<pid>`): plugin registered = true; `isAvailable` = `{"available":false}` (no
  Instagram installed); `shareToStory` rejects `NOT_INSTALLED` — exactly what the web side expects.
- Sheet layout: esbuild + Tailwind harness of the real `StoryCaptureModal` in Playwright at 390×844 and 320×568 — preview,
  toggle, thumbnails, caption, row (peeks to show it scrolls), nudge, selfie button; Copy → "Caption + link copied."; Save →
  "Picture saved.". Harness in the scratchpad only (not committed).
- **Not verified:** a real phone. The Instagram Story editor actually opening with Instagram installed (iPhone + Android),
  what each app's share sheet keeps from the text, the clipboard on a real iPhone/Android web view, Facebook/X/Messages
  targets. All in 9f's checklist.

### 7. Open questions for Andrew
1. Commit + push 9c and 9d?
2. Plan §6 item 7: share details per venue (planned) or per Prize/game?
3. The 9d native half reaches players only with a new app build in the stores (Phase 6).

### 8. Recommended first steps for 9e
Read plan "Phase 9e" and decisions 10–11. Find the Schedule flow's component and the owner variant of
`CreateRewardWizard` (keep admin snapshots unchanged). Write the migration (columns + CHECK; altering needs no grant, but
follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`), add the columns to the existing venue reads, bump
`htc_share_venue_v1` → `v2`, apply the choice once in `prepareStorySharePayload`/the payload builders, extend
`shareWinHeadline`/`shareWinText` and `shareTagNudge`, then `npm run share-card:render -- --sheet` with a handle case.
Ask Andrew before `supabase db push`.
