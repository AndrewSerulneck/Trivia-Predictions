# Phase R3 handoff: opening a bar away keeps its screen and its once-a-minute limit (2026-11-09)

## For Andrew (plain English)

- **What changed:** two fixes to opening a bar you aren't at.
  - A "New prize at Bar B" push, tapped while you're signed in at Bar A, now opens Bar B on its **Prizes** screen. Before, it
    opened on Games, because the trip through the sign-in list wiped the saved screen. The screen now travels in the web address.
  - The once-a-minute limit on opening a bar by itself now works. Before, it was wiped along with everything else, so two
    website tabs on different bars could keep switching each other back and forth.
- **Live?** No. Like A2–B4, R1 and R2, it's code and tests only: uncommitted and not deployed. It waits for Phase R's review.
- **Needs you:** nothing. Next is R4 (three small fixes).

## For the next agent

### 1. Next phase: R4, and what is out of scope

R4 = "Three small fixes" (plan §7, Phase R4, review findings 5, 7 and 8): chunked "Remind me" claims, a same-day wrapping pick
window, and Save waiting for the edit warning. The spec in `docs/cancelled-prizes-pick-windows-away-mode-plan.md` is complete.
Out of scope: anything in the join flow or away mode (R3 is done), R5/R6 work, and Q7.

### 2. Starting state

- Branch `main`, last commit `40d47492` (not mine). **Nothing committed, pushed or deployed.** R3 sits inside the held A2–B4 +
  R1–R2 change set (Andrew, 2026-11-09: hold everything for Phase R).
- No migration, env var, data change or production read/write. The three unapplied migrations (`20261109214742`,
  `20261109223743`, `20261110014242`) are unchanged and still unapplied.

### 3. Decisions already made (don't re-ask)

- Built as specced: the screen rides in the URL; no key is exempted from `clearClientState`.
- Additions beyond the spec, both small:
  1. `navigateToResolvedVenue` also calls `savePlayerPanel` **after** the clear for the bar `?v=` named. That keeps the C2
     sessionStorage fallback working, for the same "write after the clear" reason as the stamp.
  2. VenueHubClient doesn't read `window.location.search` at redirect time. It reads `mountSearchRef`, which is captured during
     its first client render. Why: `VenuePanelFromUrl` is a child, so its effect runs first and drops `?panel=` before the
     parent's redirect effects run. A ref never reaches the markup, so it can't cause a hydration mismatch.
- The panel goes onto the hard target only when the bar opened is the one the URL asked for (`selectedVenue.id === venueParam`).
  That covers both an away open and an in-range tap.
- If the open fails (network or server), no stamp is written. The page's `autoOpenedAwayVenueRef` still limits it to one try
  per page load.
- A stamp that is in the future (clock moved back) or isn't a number is ignored, so the open is allowed.

### 4. Files changed

- `lib/pushLanding.ts`: new `signInListPath(venueId, search)`, `withVenuePanel(path, panel)`, `venuePushPanelFromValue`,
  `venuePushPanelFromSearch` and `playerPanelForPushPanel`. `venuePanelFromSearch` now builds on `venuePushPanelFromSearch`
  (same behaviour). The header comment is updated.
- `lib/venueAwayMode.ts`: new `AWAY_AUTO_OPEN_MIN_GAP_MS` (60 000), `awayAutoOpenAllowed(nowMs)` and `markAwayAutoOpen(nowMs)`.
  The key `ht:away-auto-open-at` is private to this file now.
- `components/join/JoinFlow.tsx`:
  - New prop `initialPanel`.
  - `navigateToResolvedVenue` takes `{ viewOnly, automatic }`. After `hardClearAuthAndCachePreserveVenue` it calls
    `markAwayAutoOpen` (automatic only) and `savePlayerPanel` (when there's a panel), then builds the hard target with
    `withVenuePanel`. Its deps are now `[initialPanel, refreshAuthSession, venueParam]`.
  - `handleOpenAwayVenue(venue, { automatic })`.
  - The auto-open effect only calls `awayAutoOpenAllowed`.
- `app/page.tsx`: reads `panel` from `searchParams` and passes `initialPanel` (a string only; an array is ignored).
- `components/venue/VenueHubClient.tsx`: `mountSearchRef`. All five `/?v=` redirects (stored mismatch, late mismatch, missing
  cookie, arrival missing identity, arrival watchdog) now use `signInListPath(venue.id, mountSearchRef.current)`. The first
  three used to leave the venue id unencoded; it's encoded now (ids are UUID-like, so no change in practice).
- Tests:
  - `tests/lib.push-landing.test.ts`: new block "the screen survives the sign-in list" (3 cases, including the pure finding-3 chain).
  - `tests/lib.venue-away-auto-open.test.ts` (new, jsdom, real `clearClientState`), 4 cases:
    - a stamp written after the clear survives it;
    - a second open within 60 s is skipped (and allowed at exactly 60 s);
    - a stamp written before the clear is lost;
    - a junk or future stamp is ignored.
  - `tests/away-mode-contract.test.ts`: new "R3" case. It checks that `markAwayAutoOpen` and `savePlayerPanel` come after the
    clear in `navigateToResolvedVenue`, and that the effect only reads. It checks that there's no raw `` `/?v= `` left in
    VenueHubClient (5 `signInListPath` calls), that `app/page.tsx` passes `initialPanel`, and that `lib/storage.ts` doesn't
    name the stamp key.
  - `tests/components.venue-away-mode.test.ts`: new "finding 3" block. It renders `VenuePanelFromUrl` on the hard target built
    from a prize push to bar B and expects Prizes (2). The `next/navigation` mock gained `useSearchParams`.
- Docs:
  - the plan's status line;
  - the "Built (R3)" note under Phase R3;
  - the C2 standing rule (`savePlayerPanel` is now the fallback; the URL carries the screen);
  - a new R3 standing rule at the end of the plan.

### 5. Facts and traps

- `clearClientState` (`lib/storage.ts`) clears **all** of sessionStorage. Anything the join flow needs on the next page must be
  written after `hardClearAuthAndCachePreserveVenue`, or carried in the URL.
- On Venue Home, child effects (`VenuePanelFromUrl`) run before VenueHubClient's own effects. Also, the entry effect
  `router.replace("/venue/X")` strips every query param. Read `?panel=` from `mountSearchRef`, not from the live URL.
- `VenueListItem` is `memo`. `handleOpenAwayVenue` is still passed directly as `onSelect`, which calls it with one argument,
  so the optional second argument stays `undefined` and the memo holds.
- The `.next/types/` Finder duplicates still make raw `npx tsc --noEmit` print TS2300/TS2717. Filter them:
  `npx tsc --noEmit 2>&1 | grep -v "routes.d 2.ts"`.

### 6. Build, run, test

- `npm run test`: **517 files passed, 1 skipped; 6,778 tests passed, 13 skipped** (R2 ended at 6,769: +9 from R3).
- `npm run test:god-mode-join`: 6 files, 59 tests passed.
- `npx tsc --noEmit` (filtered) is clean. `npx eslint` on all nine touched files is clean.
- **Not run:** `npm run build` (Phase R builds), and a real-browser run of the push → `/?v=B&panel=prizes` → Venue Home hop or
  two tabs ping-ponging. Both are covered only by unit and contract tests. It's worth a Playwright check in Phase R, from a
  scratchpad clone with mocked routes.

### 7. Open questions for Andrew

None.

### 8. Recommended first steps for R4

Use **Sonnet 5.5, medium effort** (from the plan's table: each fix is fully specified, local and test-pinned).
1. Read the R4 spec and the C3, B1 and B4 standing rules in the plan.
2. Do (5) in `lib/push/gameReminders.ts` (`sendOptInReminderPushes`), (7) by moving `pickWindowOpenWeekdays` from
   `lib/pickemPrizeWizard.ts` into `lib/pickemPickWindow.ts`, and (8) in `components/owner/schedule/ScheduleGameFlow.tsx`
   (`editChecking`), each with the tests the spec lists.
3. Run `npm run test` and `npm run test:push-sql`.
4. Write `docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_R4_HANDOFF.md` and update the plan's status line.
