# Native app plan — Phase 9f.3 handoff (pictures that keep redrawing, broken thumbnails, lighter closed buttons) — 2026-10-22

## For Andrew (plain English)
- **What changed:** three fixes to the share sheet, all website-only.
  1. **Category Blitz finish screen** — the share pictures could redraw over and over and never become shareable (and a
     caption you typed could vanish). Fixed twice: the screen no longer makes a "new" result every moment, and the share
     sheet itself now ignores a result that only differs by its timestamp.
  2. **Broken thumbnails** — after "Take a selfie instead" then back to "Designs", the thumbnails could show as broken
     pictures. They now redraw cleanly.
  3. **Lighter closed buttons** — a "Share my win" button that hasn't been tapped now does almost nothing (it used to prepare
     the whole share sheet behind the scenes). The prize wallet and Bingo lists show many of these.
- **Live?** No. Nothing is committed, pushed or deployed. You said to ship 9f.1–9f.6 together in one deploy, and then install
  the new build on your iPhone. 9f.4, 9f.5 and 9f.6 are still to do.
- **Cost:** none. If anything slightly less work on the phone.
- **Needs you:** nothing right now. Say "go" for 9f.4 (it adds one tiny venue lookup per share-sheet open, see the plan).
- **About the iPhone install:** I found your iPhone 16 Pro already listed as "available (paired)" on this Mac, so I can
  install from the terminal. A cable is the most reliable way (Wi-Fi install works only if the phone is set up for it).
  The phone must be unlocked and "Developer Mode" on.

## For the next agent

### 1. Next phase and scope
**9f.4** (Opus 5.5, high; website only): the partner's share-details choice must always win over an old copy (R8 + R9).
Spec: `docs/native-app-store-plan.md` "Phase 9f fix phases" → 9f.4 — includes a new `htc_share_venue_v3` with `savedAt`, one
single-row venue read per sheet open when the entry is older than 10 minutes, destinations disabled ("Getting your picture
ready…") while it is in flight, and a no-name/address/handle fallback if the read fails. Then 9f.5, 9f.6, then ONE deploy
of 9f.1–9f.6 + the 9f.2 plugin build, then install on Andrew's iPhone, then 9g. Out of scope: anything outside the plan's
fix phases; review finding 17 (relative `./` imports in `lib/socialShare/`, deliberately unscheduled).

### 2. Starting state
- Branch `main`, last commit `20a97e2` (9e). **Nothing from 9f, 9f.1, 9f.2 or 9f.3 is committed, pushed or deployed.** No
  data or database was touched in 9f.3.
- Uncommitted by 9f.3: `components/social-share/StoryShareLauncher.tsx`, `StoryCaptureModal.tsx` (also edited by 9f.1/9f.2),
  `useSharePictures.ts`, `useShareVenue.ts`, `ShareWinButton.tsx`, `components/category-blitz/CategoryBlitzGame.tsx`,
  `lib/socialShare/storyPayloads.ts`, `tests/share-pictures-stability.test.ts` (new), this file, the plan's status line +
  9f.3 status bullet, checklist item 38, and CLAUDE.md's 9d bullet "Next:" line.
- **CLAUDE.md also holds someone else's uncommitted POS hunk** ("POS Rewards Integration (Square live; Toast is the
  PRIORITY…"). Never stage it; stage only the 9d bullet's "Next:" hunk with `git apply --cached`.
- Other people's uncommitted work in the tree (don't stage): `.codex/`, `.firebaserc`, `.mcp.json`, `.vscode/mcp.json`,
  `firebase.json`, `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`,
  the deleted `design-system/project/public/info/*.png` + "New Folder With Items/", `docs/reel-video-assets-plan.md`,
  `tests/fixtures/squares/nfl-live-capture-1392309.json`.

### 3. Decisions already made (don't re-ask)
- Andrew (2026-10-22): **wait and ship 9f.1–9f.6 together** (one deploy); after the deploy **install the new build on his
  iPhone from here** (the phone is plugged into this Mac), not from Xcode by himself.
- 9f.3 followed the plan. Mine: (a) the content-key memo + the `achievedAtIso` pin live in a new inner component
  `StoryShareSheet` that the launcher mounts only while open — that one change delivers R7's "render the modal only when
  open" AND makes the pin trivial (`useState(payload.achievedAtIso)` at mount); (b) `ShareWinButton` keeps
  `useSyncExternalStore` (hydration-safe) but its snapshot function is a per-button once-only cache, rather than
  `useState` storage reads (a plain initializer would read storage during hydration and could mismatch the server's `""`).
- `StoryCaptureModal` keeps its `isOpen` prop (the native-Back test pins `isOpen ? closeModal : null`) but the launcher
  always passes `isOpen`. The reset-on-close effect is deleted; closing now unmounts, so the camera, the selfie URL and the
  scroll lock release through the existing cleanups, and a new analytics share id is made per open.

### 4. Files
- `components/social-share/StoryShareLauncher.tsx`: `StoryShareSheet` (inner, open only: `useShareVenue(…, true)`, pinned
  `openedAtIso`, `useMemo` on `storyPayloadContentKey(payload)`, `prepareStorySharePayload(applyShareVenue(...))`, renders
  `StoryCaptureModal isOpen`). The launcher itself now only holds `isOpen` and the button.
  `tests/venue-share-details.test.ts` still passes: the launcher file is the only caller of `applyShareVenue` and the only
  `<StoryCaptureModal` host.
- `lib/socialShare/storyPayloads.ts`: `storyPayloadContentKey(payload)` = JSON of the payload with `achievedAtIso: null`.
- `components/social-share/useSharePictures.ts`: the effect cleanup also calls `setState(EMPTY)` (R6).
- `components/social-share/useShareVenue.ts`: storage read gated on `active && venueId`.
- `components/social-share/ShareWinButton.tsx`: `createIdentityReader()` (once-only cache) passed as the snapshot.
- `components/social-share/StoryCaptureModal.tsx`: reset-on-close effect replaced by a small "tracked opened" effect;
  `setStoryShareId` removed (the id is created per mount).
- `components/category-blitz/CategoryBlitzGame.tsx`: `useCategoryBlitzSharePayload` (hook over primitives, above
  `CompleteScreen`). `CompleteScreen`'s viewer-rank/answers/correct-rate maths moved above its early return so every hook runs
  before it.
- `tests/share-pictures-stability.test.ts` (jsdom, 9 tests): an equal-but-new payload draws nothing again; a real change does;
  the Category Blitz payload sits in a `useMemo`; active→inactive→active returns no released URL; a closed launcher mounts
  no sheet, draws nothing and reads no storage; `useShareVenue` reads only when active; `ShareWinButton` reads storage once.
  6 of the 9 failed before the fix (the other 3 are controls that must keep passing).

### 5. Facts and traps
- **React Compiler lint (`react-hooks/preserve-manual-memoization`) rejects a `useMemo` whose deps derive from an array that
  is sorted in place.** CompleteScreen's `standings` is `.slice().sort()`ed. Put the memo in a hook that takes primitive
  arguments (as done), not inline.
- `npx tsc --noEmit` prints errors for `.next/types/routes.d 2.ts`, `validator 2.ts`, `package 2.json`, `app 2`: iCloud
  "name 2" copies in the generated `.next/types` (CLAUDE.md warns about this). They are not source errors; filter them with
  `grep -v " 2\.\| 2/"`. Nothing else was reported. (`npm run build` regenerates `.next`; I did not delete the copies.)
- vitest picks up only `tests/**/*.test.ts`. jsdom tests mock `@/lib/storage` etc. with `vi.mock` before the dynamic imports.
- No dev server was running on :3000 (`lsof -i :3000` empty). Never `pkill next-server`.
- The iPhone 16 Pro shows in `xcrun devicectl list devices` as `iPhone`, id `00008140-001E74DE1A7B001C`, "available (paired)".

### 6. Build / test / verified
- `npx tsc --noEmit` (apart from the iCloud copies above), `npm run lint`, `npm run test` → 440 files passed + 1 skipped,
  **5,409 pass / 13 skipped / 0 fail**, `npm run build` OK (run sequentially).
- Run just this phase: `npx vitest run tests/share-pictures-stability.test.ts tests/share-sheet-taps.test.ts
  tests/share-destinations.test.ts tests/venue-share-details.test.ts tests/share-win-button.test.ts
  tests/native-back-review-fixes.test.ts`.
- **Not verified:** any real browser or phone. jsdom proves the logic (no redraw, no revoked URL); it does not prove the
  Category Blitz finish screen on a real device — section J item 38 (and the new "selfie → Designs" line there).
  Also unverified: that unmounting the sheet on close is visually identical (no exit animation existed before either).

### 7. Open questions for Andrew
1. Go-ahead for 9f.4 (tiny single-row venue read per share-sheet open, only if he hasn't been on that venue's home in 10
   minutes — cost note in the plan)?
2. After 9f.4–9f.6: OK to commit + push everything (9f docs, 9f.1–9f.6, the 9f.2 plugin), then install on the iPhone?

### 8. Recommended first steps for 9f.4
Read "9f.4" in the plan, `lib/socialShare/shareVenue.ts` (`applyShareVenue`, `readShareVenue`, `rememberShareVenue`),
`components/social-share/useShareVenue.ts` and the new `StoryShareSheet` in `StoryShareLauncher.tsx` (the venue hook is
called there, with `active` always true). Write the expiry-table tests first (fresh / stale / missing / read fails with and
without a remembered entry; a deep-link share can't reach a destination before the read settles). Keep `applyShareVenue` the
one place the choice is applied; the unknown case becomes an explicit `"unknown"` input. Model: Opus 5.5, high.

### 9. Deploy + iPhone install, when 9f.6 is done (Andrew's instruction)
1. Commit (stage CLAUDE.md's "Next:" hunk only; exclude the other people's files above) and push `main`; confirm the Vercel
   deployment is Ready for that commit (`vercel ls` / the Vercel MCP) before installing — the app loads the live site, so the
   website part of 9f.2 must be live first.
2. App build: `cd native && npx cap sync ios`, then build and install on the paired iPhone with `xcodebuild … -destination
   'id=00008140-001E74DE1A7B001C'` and `xcrun devicectl device install app --device 00008140-001E74DE1A7B001C <App.app>`
   (build products go to a folder outside iCloud, as `docs/native-app-store-plan_PHASE_2A_HANDOFF.md` describes). Needs the
   phone unlocked, Developer Mode on, and signing for the team already used in earlier phases.
3. Then Andrew runs section J item 33 (the 9f.2 caption-paste check) and items 31–38.
