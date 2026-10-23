# Native app plan — Phase 9f.2 handoff (iPhone Instagram Story keeps the copied caption) — 2026-10-22

## For Andrew (plain English)
- **What changed:** in the iPhone app, tapping **Instagram Story** used to erase the caption and link that the sheet
  had just copied. The sheet said "copied", but Paste in Instagram gave you nothing. Now the app puts the caption + link
  back on the clipboard together with the picture, so the paste should work.
- **Is it live?** No. It's built and tested on the computer but **not committed or pushed**, and it is **not on your
  phone yet**. It needs both halves before it can work:
  1. the website change deployed (the app shows the live website, and the website is what sends the caption), and
  2. a new app build on your iPhone (the part that writes the clipboard).
  With only one of the two, it still fails exactly as before. Nothing breaks either way.
- **What I couldn't check:** whether Instagram wipes the clipboard itself when it picks up the picture. Only a real
  iPhone with Instagram can show that. That's section J item 33 of `docs/native-app-device-checklist.md`. If the paste
  is empty there, tell me and I'll build the fallback: the sheet will tell you to copy the link after you add the picture.
- **Something to look at in item 33:** the paste puts the whole caption ("I just won … Play on Hightop Challenge:
  https://…") into Instagram's link field, not just the link. That's true on Android too and was there before this fix.
  Note whether Instagram accepts it or makes you delete the words.
- **Needs you:** (1) say whether to commit + push (on its own, or with 9f.1 and the 9f docs); (2) after the deploy, say
  "install on my iPhone" (it's plugged in and paired) or build it yourself from Xcode; then do item 33.

## For the next agent

### 1. Next phase and scope
9f.2 is finished except for the iPhone check (item 33) and the commit/deploy. **Next: 9f.3** (Sonnet 5.5, high) — see
`docs/native-app-store-plan.md` "Phase 9f fix phases" → 9f.3, then 9f.4, 9f.5, 9f.6 (website), then 9g, then
section J. Andrew ran 9f.2 before 9f.3–9f.6, out of the plan's order. That's fine: the phases don't touch the same code.
Out of scope: the honest-wording fallback (build it ONLY if item 33 shows an empty paste; spec in the plan's 9f.2
"Fix" bullet); trimming the caption to just the link for the link sticker (an observation, not a scheduled fix);
anything else from the review; finding 17.

### 2. Starting state
- Branch `main`, last commit `20a97e2` (9e). **Nothing from 9f, 9f.1 or 9f.2 is committed.** No database or data touched.
- Uncommitted by me (9f.2):
  - `native/ios/App/App/InstagramStoriesPlugin.swift`
  - `lib/nativeInstagramStories.ts`
  - `components/social-share/StoryCaptureModal.tsx` (on top of 9f.1's uncommitted edits to the same file)
  - `tests/instagram-story-caption.test.ts` (new) and `tests/share-sheet-taps.test.ts` (9f.1's new file; I added a
    describe block and changed one assertion)
  - docs: the plan's status line + the 9f.2 status bullet, checklist item 33 + the line above item 27,
    the `CLAUDE.md` 9d bullet (a pasteboard line and the "Next:" line), and this file.
- `npx cap sync ios` was run; it changed no tracked file (`git status native` shows only the Swift file).
- Still uncommitted from 9f / 9f.1: see `docs/native-app-store-plan_PHASE_9F_1_HANDOFF.md` §2.
- **CLAUDE.md has someone else's uncommitted POS hunk** ("POS Rewards Integration (Square live; Toast is the PRIORITY…").
  Never stage it. Stage only the Phase 9 native-app hunks with `git add -p` / `git apply --cached`.
- Other people's uncommitted work in the tree (don't stage): `.codex/`, `.firebaserc`, `.mcp.json`, `.vscode/mcp.json`,
  `firebase.json`, `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`,
  the deleted `design-system/project/public/info/*.png` + "New Folder With Items/", `docs/reel-video-assets-plan.md`,
  `tests/fixtures/squares/nfl-live-capture-1392309.json`.
- Nothing installed on Andrew's iPhone in this phase. It shows as `available (paired)`, UDID `00008140-001E74DE1A7B001C`.

### 3. Decisions already made (don't re-ask)
- The plan's fix was followed as written: the caption is passed as `shareToInstagramStory(blob, { caption })`, and the
  plugin writes ONE pasteboard item with the three sticker keys + `"public.utf8-plain-text": caption`, with the same
  5-minute expiry. With an empty caption it writes the picture only, as before.
- Mine: `pickDestination` now does `await copied` **before** calling the plugin. Before, the web clipboard write and the
  plugin's `setItems` were unordered: a late web write would have wiped the picture instead. The tap's user activation
  doesn't matter here, because the plugin's `UIApplication.open` is native and needs none. The 9d rule "start the
  clipboard write inside the tap" still holds: `copyText` is still called before the first await.
- The hint after "opened" still depends on the web copy's result (`captionCopied ? direct : SHARE_CAPTION_COPY_FAILED`).
  On iPhone the plugin writes the caption anyway, so a failed web copy makes the hint pessimistic. That's rare and safe.
  On Android it's exactly right, because there the web copy is the only copy.
- No back-compat logic for old builds. The app isn't in either store yet (`IOS_APP_STORE_URL` / `ANDROID_PLAY_STORE_URL`
  are `""` in `lib/appDownloadLink.ts`), so the only old builds are Andrew's dev installs. Those ignore the extra option
  and behave as before.
- Android is unchanged. Its plugin uses an intent and leaves the clipboard alone, and it ignores `caption`.

### 4. Files
- `native/ios/App/App/InstagramStoriesPlugin.swift` `shareToStory`: reads `call.getString("caption")`, builds
  `var item` and adds `item["public.utf8-plain-text"] = caption` when the caption isn't empty, then calls
  `UIPasteboard.general.setItems([item], options: [.expirationDate: …5 min])`. The doc comment explains why.
- `lib/nativeInstagramStories.ts`: new `InstagramStoryOptions` (`caption?`, `colors?`). The second argument of
  `shareToInstagramStory` is now that options object (it used to be `colors`; no caller passed colors). It sends
  `caption` to `callNative("InstagramStories", "shareToStory", …)`.
- `components/social-share/StoryCaptureModal.tsx` `pickDestination`, instagram-story-native branch: `await copied`, then
  `shareToInstagramStory(shareBlob, { caption: activePreparedStory.shareText })`.
- `tests/instagram-story-caption.test.ts`: tests the bridge args (with a caption and with none) plus a static check of the
  Swift item. All 3 fail on the pre-fix files: checked by putting the `HEAD` versions back temporarily, then restoring.
- `tests/share-sheet-taps.test.ts`: new "Phase 9f.2" describe. It checks copy-then-plugin order, that the plugin gets the
  same caption, and that a failed copy isn't reported as copied. The 9f.1 R2 double-tap test now `waitFor`s the plugin
  call, because it comes one await later; it still asserts exactly one plugin call and one copy.

### 5. Facts and traps
- `UIPasteboard.setItems` replaces EVERYTHING on the pasteboard. Any future iOS plugin that writes the pasteboard must
  carry whatever the sheet copied (now in `CLAUDE.md`).
- A Paste reads the FIRST pasteboard item's text. That's why the caption goes in the same item, not a second one (the
  test pins `setItems([item],`).
- Instagram's link sticker gets the whole caption, not just the URL (see §1 / item 33). This was true before 9f.2.
- The app loads `https://play.hightopchallenge.com` (`native/capacitor.config.json` `server.url`). Web changes reach the
  app only through a deploy, and native changes only through a rebuild. A device test of 9f.2 needs both.
- vitest's include is `tests/**/*.test.ts`. A `.tsx` test isn't picked up, so use `createElement`.
- No dev server on :3000 was touched. Never `pkill next-server`.

### 6. Build / test / verified
- `npx tsc --noEmit` clean; `npm run lint` clean (only the usual Babel size note for `lib/sportsBingo.ts`).
- `npx vitest run tests/instagram-story-caption.test.ts tests/share-sheet-taps.test.ts tests/share-destinations.test.ts`
  → 37/37 pass.
- Full `npm run test` → 439 files passed + 1 skipped, **5,400 pass / 13 skipped / 0 fail**. `npm run build` → compiled OK
  (run after typecheck, not alongside it).
- Native: `cd native && npx cap sync ios` OK. iOS compile: `cd native/ios/App && xcodebuild -project App.xcodeproj
  -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator'
  -derivedDataPath <scratchpad>/ios-dd build` → **BUILD SUCCEEDED**. Android is unchanged, so it wasn't rebuilt.
- To install on the iPhone (after the web deploy, and only with Andrew's go-ahead): the device build in the 2D/2E handoffs,
  `xcodebuild … -destination 'id=00008140-001E74DE1A7B001C' -allowProvisioningUpdates`, then `xcrun devicectl device
  install app` (exact commands in `docs/native-app-store-plan_PHASE_2D_HANDOFF.md` §5).
- **Not verified:** the real iPhone + Instagram behaviour (item 33). In particular, does Instagram leave the text on the
  pasteboard after reading the picture? Also whether iOS shows its "Allow Paste" prompt differently now that the item
  also holds text.

### 7. Open questions for Andrew
1. Commit + push 9f.2 now (with 9f.1 and the 9f docs?), or batch with 9f.3–9f.6?
2. After the deploy: install on the iPhone from the command line, or will you build from Xcode?
3. Item 33's result decides whether the fallback gets built.

### 8. Recommended first steps for the next agent
- If Andrew reports item 33: empty paste → build the plan's fallback (new copy in `SHARE_DESTINATION_COPY`
  `copyPresets.ts`, iPhone-only; never claim "copied"). Paste OK → mark item 33 passed and 9f.2 done in the plan.
- Otherwise start 9f.3 as the 9f.1 handoff §8 describes (Sonnet 5.5, high).
