# Native app plan — Phase 9f.4 handoff (the partner's choice always wins over an old copy) — 2026-10-22

## For Andrew (plain English)
- **What changed:** when a player shares a win, the picture now always follows your latest "On shared pictures" choice
  (name / address / Instagram handle).
  - Before: the phone could keep an old copy of that choice forever. A player who reached a game by bookmark or
    notification (skipping the venue home) could share with a name or address you had turned off. A player arriving by a
    link could even share before the venue loaded, using the game screen's own name.
  - Now: the phone's copy counts for 10 minutes. If it's older, or missing, the share sheet looks the venue up once when
    it opens. For that moment it says "Getting your picture ready…" and the app buttons are greyed out. If the lookup fails,
    the phone uses its older copy if it has one. If it has none, the picture names no bar at all (the win and the app panel
    still share). It never falls back to a name you might have turned off.
- **Live?** No. Nothing is committed, pushed or deployed. You asked for 9f.1–9f.6 to ship together in one deploy, and 9f.5 and
  9f.6 are still to do.
- **Cost:** at most one small venue lookup each time someone opens the share sheet, and only if that player hasn't been on
  the venue's home page in the last 10 minutes. That's tens of lookups a day today, and at most 10,000 a day at 10,000 shares
  a day. Either way it's tiny next to what the venue home already reads. Your "Execute 9f.4" counted as the go-ahead.
- **Needs you:** nothing now. Your phone check is item 41 of section J in `docs/native-app-device-checklist.md`, after the deploy.

## For the next agent

### 1. Next phase and scope
**9f.5** (Sonnet 5.5, medium; website only): fixes to the partner "On shared pictures" box,
`components/owner/share/ShareDetailsPanel.tsx`. These are R10 (a "Try again" after a failed first load), R11 (cache-keyed
shown details plus a draft and message keyed by venue, so a draft is never shown or saved to another venue) and R12 (with
the handle off, Save neither checks nor changes the saved handle). Spec: `docs/native-app-store-plan.md` → "Phase 9f fix
phases" → 9f.5. Then 9f.6 (Pick 'Em `todayWinPoints`). Then ONE deploy of 9f.1–9f.6 plus the 9f.2 app build, then the
iPhone install (section 9 of `docs/native-app-store-plan_PHASE_9F_3_HANDOFF.md`), then 9g.
Out of scope: anything outside the fix phases; review finding 17 (relative `./` imports in `lib/socialShare/`, left
unscheduled on purpose).

### 2. Starting state
- Branch `main`, last commit `20a97e2` (9e). **Nothing from 9f, 9f.1, 9f.2, 9f.3 or 9f.4 is committed, pushed or deployed.**
  No database or data was touched in 9f.4 (no migration; reads only, and those only from a phone at share time).
- Uncommitted by 9f.4: `lib/socialShare/shareVenue.ts`, `lib/venues.ts`, `components/social-share/useShareVenue.ts`,
  `components/social-share/StoryShareLauncher.tsx`, `components/social-share/StoryCaptureModal.tsx`,
  `lib/socialShare/copyPresets.ts`, `tests/venue-share-details.test.ts`, `tests/share-pictures-stability.test.ts`, this
  file, the plan's status line and 9f.4 status bullet, checklist item 41, and two hunks in CLAUDE.md: the 9d bullet's
  "Next:" line and the 9e bullet's storage sentence. Several of these files also carry 9f.1–9f.3's uncommitted edits.
- **CLAUDE.md also holds someone else's uncommitted POS hunk** ("POS Rewards Integration (Square live; Toast is the
  PRIORITY…"). Never stage it. Stage only the 9d/9e share hunks, with `git apply --cached`.
- Other people's uncommitted work in the tree (don't stage): `.codex/`, `.firebaserc`, `.mcp.json`, `.vscode/mcp.json`,
  `firebase.json`, `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`,
  the deleted `design-system/project/public/info/*.png` + "New Folder With Items/", `docs/reel-video-assets-plan.md`,
  `tests/fixtures/squares/nfl-live-capture-1392309.json`, `native/ios/App/App/config 2.xml` (an iCloud copy).

### 3. Decisions already made (don't re-ask)
- Andrew (2026-10-22): "Execute 9f.4" = go-ahead on the one-read-per-sheet-open cost described in the plan.
- Andrew (2026-10-22): ship 9f.1–9f.6 in ONE deploy, then install the new build on his iPhone from this Mac.
- Mine, all within the plan:
  - (a) **A strict read.** `getVenueById` returns a built-in fallback venue (`lib/defaultVenues.ts`) on any error. That
    venue carries the default choices (all shown), which is exactly the leak 9f.4 closes. So the sheet uses the new
    `fetchVenueById` (`{ ok: true, venue } | { ok: false }`). `getVenueById` now wraps it and behaves the same for its
    callers (the venue page and the TV).
  - (b) "Not found" counts as a failed read.
  - (c) The join list's sessionStorage cache (`tp_venues_cache_v1`, its own 5-minute TTL) counts as fresh.
  - (d) A `savedAt` in the future (clock moved back) is stale.
  - (e) While the read is in flight the pictures draw with the stale entry if there is one, else with no bar. When the
    read lands they redraw once.
  - (f) The read's result is written back with `rememberShareVenue`, so the next sheet within 10 minutes needs no read.
  - (g) Old `htc_share_venue_v2` entries are ignored, not deleted. That matches what 9e did with v1.

### 4. Files
- `lib/socialShare/shareVenue.ts`:
  - `STORAGE_KEY = "htc_share_venue_v3"` (entry = `ShareVenue` + `savedAt`) and `SHARE_VENUE_FRESH_MS` (10 min).
  - `rememberShareVenue(venue, now?)`.
  - `readShareVenue(venueId, now?)` → `{ venue, fresh } | null`.
  - `type ShareVenueRead = "pending" | ShareVenue | "failed"`.
  - **`resolveShareVenue(stored, read)`** → `{ venue: ShareVenue | "unknown", ready }`. This is the expiry table and the
    one home of these rules.
  - **`applyShareVenue(payload, ShareVenue | "unknown")`**: "unknown" clears `venueName`, `subtitle`, `venueAddress` and
    `venueInstagram`. The old `null` = "the screen's own payload" case is gone.
- `lib/venues.ts`: `fetchVenueById` (strict), with `getVenueById` on top of it.
- `components/social-share/useShareVenue.ts`: returns `{ venue, ready }`. It reads storage only when active. It calls
  `fetchVenueById` once per venue per mount, only when storage isn't fresh, and the sheet mounts only while open (9f.3), so
  that's once per sheet open.
- `components/social-share/StoryShareLauncher.tsx`: `StoryShareSheet` passes `venueReady` to the modal.
- `components/social-share/StoryCaptureModal.tsx`: new prop `venueReady` (default true, so direct hosts and tests are
  unchanged).
  - While it's false, `canShare` and the new `canCopyCaption` are false, so every destination, More and "Copy caption +
    link" are disabled. `pickDestination` and `copyCaption` also return early in code, not just in the UI.
  - The status line shows `SHARE_VENUE_LOADING`. A destination hint still wins over it.
- `lib/socialShare/copyPresets.ts`: `SHARE_VENUE_LOADING = "Getting your picture ready…"`.
- Tests:
  - `tests/venue-share-details.test.ts`:
    - the v3 key with `savedAt`;
    - v1 and v2 entries ignored;
    - "unknown" → no bar text anywhere, with the app link kept;
    - the expiry boundary (fresh up to 10 min, a future date is stale);
    - the session cache counts as fresh;
    - the 7-row `resolveShareVenue` table (fresh / stale + pending, landed, failed / missing + pending, landed, failed);
    - a static check that the hook uses `fetchVenueById`, not `getVenueById`.
  - `tests/share-pictures-stability.test.ts` (new "9f.4" block):
    - a deferred read → pictures drawn, Facebook / Messages / More / Copy disabled, "Getting your picture ready…" shown,
      no screen name;
    - after the read lands (name off) → enabled, still no name, exactly one read;
    - a fresh entry → no read, ready at once, and the name shows (the positive control);
    - a failed read with nothing remembered → ready, no bar.
  - The mock there switched from `getVenueById` to `fetchVenueById`.
- Contract unchanged: only `StoryShareLauncher.tsx` calls `applyShareVenue` (`tests/venue-share-details.test.ts` "one place
  applies the choice").

### 5. Facts and traps
- `/venue/[venueId]` is dynamic (ƒ in the build output). The hub's `venue` is read per visit, so stamping `savedAt` when
  the hub mounts is honest.
- `getVenueById` never throws and never says "failed". Don't use it anywhere a fallback venue would be wrong. Use
  `fetchVenueById`.
- With no Supabase env (a scratch clone) `fetchVenueById` is `{ ok: false }`, so locally shared pictures name no bar unless
  you went through the venue home first. That's expected.
- The same as 9f.3: `npx tsc --noEmit` may list iCloud "name 2" copies under `.next/types`. This run listed none.

### 6. Build / test / verified
- Sequentially: `npx tsc --noEmit` clean; `npm run lint` clean (only the usual Babel "deoptimised sportsBingo.ts" note);
  `npm run test` → 440 files passed + 1 skipped, **5,422 pass / 13 skipped / 0 fail**; `npm run build` OK.
- This phase alone: `npx vitest run tests/venue-share-details.test.ts tests/share-pictures-stability.test.ts
  tests/share-sheet-taps.test.ts`.
- **Not verified:** a real browser or phone. In particular, how the greyed buttons and "Getting your picture ready…" look
  on Slow 4G, and the redraw when the read lands. That's section J item 41 (rewritten for 9f.4) and item 40.

### 7. Open questions for Andrew
- None new. Still pending from 9f.3: OK to commit and push everything once 9f.6 is done, then install on the iPhone?

### 8. Recommended first steps for 9f.5
1. Read "9f.5" in the plan and `components/owner/share/ShareDetailsPanel.tsx` (its module-level `cache`, the load effect,
   `draft`, `message` and `save()`), plus `lib/venueShareDetails.ts` (`SHARE_DETAILS_COPY`; add `retry`).
2. Write the tests first: retry re-runs the GET; A → B → A with A cached shows A's details, and a draft started on A is gone
   on B; "my bar!" with the handle off saves the old handle.
3. Remember the panel sits on light AND dark hosts. Keep `ht-light-surface` behaviour and the 12px text floor.
4. Model: Sonnet 5.5, medium.
