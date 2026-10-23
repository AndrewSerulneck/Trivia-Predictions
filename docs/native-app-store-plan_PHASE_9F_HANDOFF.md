# Native app plan — Phase 9f handoff (review of 9a–9e + phone checklist) — 2026-10-22

## For Andrew (plain English)
- **Done today, in order:**
  1. **9e's database change is applied** to production (four new columns on `venues`; afterwards all 16 venues still had
     the defaults and no handle). The partner box now loads instead of showing "Couldn't load this setting".
  2. **9e is committed and pushed** (`20a97e2`). Vercel deploys from the push; I didn't check the deploy separately.
     Before committing I tested it against production on the hidden test venue: saving a handle works, a bad handle gets
     a plain message, players' devices can read the setting, and I put the test venue back to its defaults.
  3. **9f review done.** The code review of everything shared since 9a found 17 issues. I checked each one against the
     code. 16 are real and are now fix phases **9f.1–9f.6** in the plan, plus one iPad fix added to 9g. The 17th is a
     style point that I've noted without a phase.
- **The ones you'd notice:**
  - In the iPhone app, the Instagram Story shortcut erases the copied link. The sheet says "copied", but nothing pastes,
    so the Story can't point to the app (9f.2; needs an app rebuild).
  - On a computer, X opens but the sheet says "Couldn't open X" (9f.1).
  - The Category Blitz finish screen's share pictures can keep redrawing and never become shareable (9f.3).
  - A partner's "hide name/address" change can be ignored for a player who saved the venue earlier, or who shares
    before the venue loads (9f.4).
- **One cost note (9f.4):** making the partner's choice reliable adds at most one tiny venue lookup when a player opens
  the share sheet. It happens only if they haven't been on that venue's home page in the last 10 minutes. That's
  pennies even at 10,000 shares a day. The alternative is a choice that can stay out of date indefinitely.
- **Your phone pass is written:** section **J** (items 27–42) of `docs/native-app-device-checklist.md`. It's best done
  after the website fixes (9f.1, 9f.3–9f.5) are deployed. Four items are marked as known failures until their fix lands.
- **Not committed:** these 9f documents (plan, checklist, this note, one CLAUDE.md line). Say "commit 9f docs" if you
  want them pushed.
- **Needs you:** (1) go-ahead to start 9f.1 (or reorder); (2) section J on your phones once the fixes are deployed.

## For the next agent

### 1. Next phase and scope
**9f.1** (Sonnet 5.5, high): share-sheet taps (R1 X `window.open` noopener → null, R2 double-tap guard, R3 no share sheet
after an await). Then 9f.3, 9f.4, 9f.5, 9f.6 (all website-only, can ship in one deploy), then 9f.2 (iOS plugin, app
rebuild), then 9g (with the iPad amendment, R14), then Andrew's section J. Each fix phase's exact bug, file, fix and test
is in `docs/native-app-store-plan.md` under "Phase 9f fix phases". Out of scope: anything not in those phases; finding 17
(relative `./` imports in `lib/socialShare/`, deliberately unscheduled).

### 2. Starting state
- Branch `main`. Last commit `20a97e2` (9e), pushed to `origin/main`. The deployment wasn't checked.
- Uncommitted 9f docs: `docs/native-app-store-plan.md` (status line, table row, "Phase 9f fix phases", 9g iPad bullet),
  `docs/native-app-device-checklist.md` (section J), `docs/native-app-store-plan_PHASE_9F_HANDOFF.md` (this file), and
  `CLAUDE.md` (the 9d bullet's "Next:" line only). `CLAUDE.md` also has someone else's uncommitted POS hunk
  ("POS Rewards Integration (Square live; Toast is the PRIORITY…"). Never stage that hunk: stage CLAUDE.md with
  `git apply --cached` of the "Next:" hunk only.
- Other people's uncommitted work is still in the tree: `.codex/`, `.firebaserc`, `.mcp.json`, `.vscode/mcp.json`,
  `firebase.json`, `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`,
  the deleted `design-system/project/public/info/*.png` + "New Folder With Items/", `docs/reel-video-assets-plan.md`,
  `tests/fixtures/squares/nfl-live-capture-1392309.json`. Don't stage them.
- Database: migration `20261023011500_venue_share_details.sql` applied 2026-10-22 (`supabase db push`; the dry run first
  showed it as the only pending one). Verified via service role: 16 rows, all `share_show_*` true, 0 handles.
  Verification wrote `venue-hightop-test`'s handle `hightop.test_9e` + address off, then restored it to null/all-on (the
  verified read-back confirmed this). No other data was touched, so there's no undo log.

### 3. Decisions already made (don't re-ask)
- Andrew asked for: apply the migration first, then commit + push 9e, then 9f, with review problems written up as extra
  phases in the plan (no in-place fixes). The plan follows that.
- Mine, recorded in the plan: fix order (website fixes first, the iOS rebuild later, 9g after); 9f.4's 10-minute
  freshness window and its fail-safe (an unknown choice + failed read → no name/address/handle, never the screen's own
  name); 9f.2 checks on the iPhone whether Instagram keeps the pasteboard text, with an honest-wording fallback; iPad
  handled in 9g by a progressive "maybe iPad" page; finding 17 unscheduled.
- 9e's decisions (per-venue choice, the panel saves on its own, etc.) are in `docs/native-app-store-plan_PHASE_9E_HANDOFF.md` §3.

### 4. Files
No code changed in 9f. Docs only (§2). How the findings map to code:
- `components/social-share/StoryCaptureModal.tsx` `pickDestination`: R1, R2, R3.
- `native/ios/App/App/InstagramStoriesPlugin.swift` `shareToStory` + `lib/nativeInstagramStories.ts`: R4.
- `components/category-blitz/CategoryBlitzGame.tsx` `CompleteScreen` `storySharePayload` (not memoised; ~line 980) +
  `components/social-share/StoryShareLauncher.tsx`: R5.
- `components/social-share/useSharePictures.ts` (cleanup revokes URLs but keeps state): R6.
- `components/social-share/useShareVenue.ts` (`active || venueId`), `StoryShareLauncher.tsx` (modal always mounted),
  `components/social-share/ShareWinButton.tsx` (`useSyncExternalStore` no-op subscribe): R7.
- `lib/socialShare/shareVenue.ts` `applyShareVenue(…, null)` + `readShareVenue` (no expiry): R8, R9.
- `components/owner/share/ShareDetailsPanel.tsx` (load effect, `draft` across venues, `save()` validation): R10–R12.
- `components/pickem/PickEmGameList.tsx` `todayWinPoints` (×10): R13.
- `lib/appDownloadLink.ts` `decideAppLinkDestination` (`/iPhone|iPad|iPod/`): R14 (in 9g).

### 5. Facts and traps
- `supabase db push` takes the confirmation on stdin (`echo Y | supabase db push`). It prints "Skipping migration
  Warnings…" for the old file `supabase/migrations/Warnings`. That's harmless; leave the file.
- A scratch Node script outside the repo can't find `@supabase/supabase-js`: run it with `NODE_PATH=$PWD/node_modules`.
  To use repo TS modules: `node --env-file=.env.local --conditions react-server --import tsx <script>`.
- The `/code-review` skill accepted a commit range (`high 9cf67f7..HEAD --max-findings all`).
- R1 is spec behaviour: `window.open` with `noopener` in the features string always returns `null`.
- R3/R5 are why "start the clipboard write and share sheet inside the tap" (9d rule) matters: anything after an await
  has lost the tap, and so has anything that re-renders with a new identity.
- R13 is latent: every Pick 'Em pick is `PICKEM_REWARD_POINTS` (10) today, so nobody sees a wrong number yet.
- No dev server was running on :3000 during this session (`lsof -i :3000` empty). Per memory, Andrew normally runs it;
  never `pkill next-server`.

### 6. Build / test / verified
- Before the 9e commit: `npx tsc --noEmit` clean; `npx vitest run tests/venue-share-details.test.ts
  tests/api.owner.venue-share-details.test.ts tests/share-designs.test.ts tests/components.owner-schedule-flow.test.ts`
  → 84/84 pass. The full suite / lint / build were last run in 9e (437 files, 5,388 pass, 13 skipped; build OK) and the
  committed 9e content is unchanged since then, apart from docs.
- Production check of 9e (§2): GET 200 with the defaults; PATCH `@hightop.test_9e` → 200 with the bare handle; PATCH
  "not a handle!" → 400 with the plain message; anon-key select of the new columns works (players); test venue restored.
- **Not verified:** the routes' auth gate against a live server (covered by `tests/api.owner.venue-share-details.test.ts`);
  the partner panel in a real browser; any phone. All of these are in section J.
- Review findings were checked by reading code, not by running them. R4 (pasteboard) and R3 (activation) need a real
  iPhone to confirm. Do that at the start of 9f.2 / as part of 9f.1's manual check.

### 7. Open questions for Andrew
1. Go-ahead for 9f.1 → 9f.6 in the order above (or a different order)?
2. OK with 9f.4's tiny venue read (≤1 per share-sheet open, only when the venue home wasn't visited in 10 min)?
3. Commit + push the 9f docs?

### 8. Recommended first steps for 9f.1
Read "Phase 9f fix phases" → 9f.1 in the plan and `StoryCaptureModal.tsx` `pickDestination` (~lines 418–462). Write the
three failing tests first (jsdom: a `window.open` stub, two calls in one tick, outcome "unavailable" → no
`navigator.share`), then fix. Copy for the new hint goes in `SHARE_DESTINATION_COPY` (`lib/socialShare/copyPresets.ts`).
Model: Sonnet 5.5, high effort.
