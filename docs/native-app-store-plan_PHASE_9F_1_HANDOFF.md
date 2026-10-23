# Native app plan — Phase 9f.1 handoff (share-sheet taps) — 2026-10-22

## For Andrew (plain English)
- **What changed:** three small bugs in the share sheet's app buttons are fixed.
  1. **X on a computer** now says "Opening X with your caption." when the X tab really opens. Before, it always said
     "Couldn't open X" even though the tab opened.
  2. **Double-tapping** an app button (or tapping two quickly) now runs one share, not two. The buttons and the
     "Copy caption + link" button grey out while a share is in progress.
  3. **In the app, if Instagram Story doesn't open**, the sheet now says "Instagram didn't open. Tap More to share the
     picture." instead of trying to open the phone's share sheet too late (the iPhone refuses that and showed an error).
- **Is it live?** No. It is built and tested but **not committed or pushed**. It's website-only (no database change, no
  app rebuild), so it goes out with the next deploy.
- **What's left:** 9f.3, 9f.4, 9f.5, 9f.6 (website), then 9f.2 (needs an app rebuild), then 9g, then your phone pass
  (section J of `docs/native-app-device-checklist.md`; item 35 is now expected to pass).
- **Needs you:** say "commit 9f.1" (and whether to include the 9f docs), or tell me to carry on to 9f.3.

## For the next agent

### 1. Next phase and scope
**9f.3** (Sonnet 5.5, high): pictures that keep redrawing, broken thumbnails, lighter closed buttons — see
`docs/native-app-store-plan.md` "Phase 9f fix phases" → 9f.3. Then 9f.4, 9f.5, 9f.6 (website), then 9f.2 (iOS plugin,
app rebuild), then 9g. Out of scope: anything outside the plan's fix phases; finding 17 (relative `./` imports in
`lib/socialShare/`, deliberately unscheduled). 9f.1 itself is finished.

### 2. Starting state
- Branch `main`, last commit `20a97e2` (9e). **Nothing from 9f or 9f.1 is committed.** No data/DB was touched.
- Uncommitted by me (9f.1): `components/social-share/StoryCaptureModal.tsx`, `lib/socialShare/copyPresets.ts`,
  `tests/share-sheet-taps.test.ts` (new), `docs/native-app-store-plan_PHASE_9F_1_HANDOFF.md` (this file).
- Uncommitted from the 9f review session (docs): `docs/native-app-store-plan.md` (also my status-line edit),
  `docs/native-app-device-checklist.md` (section J; I edited items 31, 35 and the line above item 27),
  `docs/native-app-store-plan_PHASE_9F_HANDOFF.md`, and `CLAUDE.md`.
- **CLAUDE.md has someone else's uncommitted POS hunk** ("POS Rewards Integration (Square live; Toast is the PRIORITY…").
  Never stage it: stage only the 9d bullet's "Next:" hunk with `git apply --cached`.
- Other people's uncommitted work still in the tree (don't stage): `.codex/`, `.firebaserc`, `.mcp.json`,
  `.vscode/mcp.json`, `firebase.json`, `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `lib/pos/providers.ts`, the deleted `design-system/project/public/info/*.png` + "New Folder With Items/",
  `docs/reel-video-assets-plan.md`, `tests/fixtures/squares/nfl-live-capture-1392309.json`.

### 3. Decisions already made (don't re-ask)
- The plan's exact fixes for R1–R3 were followed. Mine: for **both** "unavailable" and "failed" plugin outcomes the
  shortcut is turned off (`setInstagramStoryDirect(false)`) and the hint shown (the plan said "non-opened outcome"; before,
  only "unavailable" turned it off). After that the next Instagram Story tap takes the ordinary share-sheet path, and the
  caption was already copied by the first tap.
- The new hint is `SHARE_DESTINATION_COPY["instagram-story"].directFailed` (a fourth field on that entry, not a new key,
  so `tests/share-destinations.test.ts`'s loop over `label/direct/viaSheet` and `ShareDestination` keys are unaffected).

### 4. Files
- `components/social-share/StoryCaptureModal.tsx`
  - `openInNewTab(url)` (top of file): `window.open(url, "_blank")`, sets `tab.opener = null`, returns `tab !== null`
    (R1). Used only for the website X path; in the app X still goes through `openInSystemBrowser`.
  - `pickDestination`: `destinationBusyRef` is checked/set synchronously as the first thing and cleared in `finally`;
    `destinationBusy` state mirrors it for rendering (R2). The whole body is still ONE function with the clipboard write
    before the first `await` (a test pins that: `tests/share-destinations.test.ts` "starts the clipboard write inside the tap").
  - `copyCaption` returns early while the ref is set; `canShare` and both `<ShareCaption disabled>` use `destinationBusy`.
  - Instagram native branch (R3): on a non-"opened" outcome it sets the hint and **returns**, so `shareCapturedStory`
    (the `navigator.share` call) is never reached after an await.
- `lib/socialShare/copyPresets.ts`: `directFailed` line.
- `tests/share-sheet-taps.test.ts`: jsdom, renders the real `StoryCaptureModal`, mocks only the platform edges
  (`webStoryPlatform`, `nativeApp`, `nativeInstagramStories`, `copyText`, analytics). 7 tests; 5 fail on the pre-fix file
  (checked by swapping `git show HEAD:` in and restoring), all pass now. Note vitest's include is `tests/**/*.test.ts` — a
  `.tsx` test is NOT picked up; use `createElement`.

### 5. Facts and traps
- `window.open(url, "_blank", "noopener")` always returns `null` by spec, so never use `!== null` on it with `noopener`.
- A second click in the same frame can't see state set by the first; use a ref for any "already running" guard.
- Anything after an `await` in a tap handler has lost user activation (WKWebView then refuses `navigator.share`). Don't
  chain a share sheet after an await.
- The existing `shareCapturedStoryPendingRef` and `nativeShareState === "sharing"` checks are kept; they cover the
  share-sheet path, the new ref covers every destination including Instagram/X/Save.
- Reading `StoryCaptureModal` after a Python rewrite showed a "file changed on disk" notice — that was my own edit.
- No dev server was running on :3000 (`lsof -i :3000` empty); I did not start one. Never `pkill next-server`.

### 6. Build / test / verified
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` → 438 files passed + 1 skipped, **5,395 pass / 13
  skipped / 0 fail**; `npm run build` OK. (Run build and typecheck sequentially; `.next/types` is regenerated.)
- Run just this phase: `npx vitest run tests/share-sheet-taps.test.ts tests/share-destinations.test.ts`.
- **Not verified:** any real browser/phone. R3's "WKWebView refuses it" and R2 on a touch device are unconfirmed on
  hardware (section J items 31, 34, 35). jsdom proves the logic, not the iOS activation rules.

### 7. Open questions for Andrew
1. Commit + push 9f.1 now, or batch with 9f.3–9f.6 into one deploy (the plan says they can ship together)?
2. Commit the 9f docs too?

### 8. Recommended first steps for 9f.3
Read "9f.3" in `docs/native-app-store-plan.md` (~line 1309), then `components/category-blitz/CategoryBlitzGame.tsx`
`CompleteScreen` `storySharePayload` (~line 980, not memoised), `components/social-share/StoryShareLauncher.tsx` and
`components/social-share/useSharePictures.ts` (cleanup revokes URLs but keeps state). Write the failing test first (same
jsdom pattern as `tests/share-sheet-taps.test.ts`), then fix. Model: Sonnet 5.5, high.
