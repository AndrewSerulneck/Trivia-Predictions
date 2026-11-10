# Phase C2 handoff: push wording + where taps land

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Phase C2 was done on 2026-11-09 by Claude Opus 5.5 at medium effort,
which matches the plan's table.

## For Andrew (plain English)

- **What changed:** the automatic pushes no longer assume the player is at the bar.
  - New game: **"New at Pacific Street" / "Live Trivia, Thursdays 8:00 PM."** (was "New game at … / … Tap to see it.")
  - New prize: **"New at Pacific Street" / "Win a $25 gift card."** (was "New prize at … / … Tap to see how.")
  - 30-minute reminder: **"Live Trivia starts soon" / "8:00 PM at Pacific Street."** ("Tap to play." removed)
  - **Where a tap lands:** a game push opens the bar's Venue Home on the **Games** screen, a prize push on the **Prizes** screen
    (before, it reopened whatever screen the player last swiped to). Away from the bar this is the view-only page from C1.
- The permission ask and the menu wording (Apple's consent rule) are unchanged. Partner-written messages are unchanged.
- **Cost:** none (no new requests, reads or pushes).
- **Is it live?** No. As you asked, A2, A3 and C1 — and now C2 — wait for the final review-and-release phase (R).
- **Checked:** all tests pass. Not yet tried on a real phone.

## For the next agent (Phase C3: Remind me + Add to calendar)

### 1. Next phase goal and scope
Phase C3 per plan §7: migration `push_game_reminder_optins`, `POST/DELETE /api/push/game-reminders`, a "Remind me" toggle on upcoming
games in Venue Home (works in away mode), a 1-hour reminder from the existing 5-minute sweep, Add to calendar generated on the phone.
Read the plan's C3 section and §4 (Remind me = 1 hour; open question Q2 still says "change?" — default stands). Out of scope: B phases,
committing/deploying (held for R).

### 2. Starting state
- Branch `main`; `origin/main` = `f14c2449` (A1, deployed). Nothing new committed, pushed or deployed.
- **Andrew, 2026-11-09: hold A2, A3 and C1 for Phase R** (final review and release). Treat C2 the same. Don't commit or deploy.
- Uncommitted from A2/A3/C1: see `…_PHASE_C1_HANDOFF.md` §2 and `…_PHASE_A3_HANDOFF.md` §2.
- **Uncommitted, C2:**
  - new `lib/pushLanding.ts`, `components/venue/VenuePanelFromUrl.tsx`
  - modified `lib/push/venueNews.ts`, `lib/push/gameReminders.ts`, `components/push/NativePushRuntime.tsx`,
    `components/venue/VenueHubClient.tsx` (one import + one `<Suspense>` block after `PartnerMessageSheet`)
  - tests: new `tests/lib.push-landing.test.ts` (3), `tests/components.venue-panel-from-url.test.ts` (2); updated
    `tests/lib.push.test.ts` (copy + `?panel=games` paths); new "invitations" block (3 tests) in `tests/push-notifications-contract.test.ts`
  - plan doc: status line, C2 standing rule; this handoff.
- No data, migration or env var changed. No production reads.

### 3. Decisions made
- Copy follows the plan's C2 example exactly for weekly games. One-off: "Live Trivia, Thu, Oct 29, 8:00 PM."; daily:
  "Category Blitz, every day 8:00 PM."; several days: "Live Trivia, Tuesdays and Thursdays 8:00 PM.". Both news titles are now
  "New at {bar}" (fallback "New at your bar"); the body says game or prize. Reminder title unchanged.
- **"That game in view"** = the right Venue Home screen. Venue Home restores the last-swiped screen from sessionStorage
  (`lib/playerViewState.ts`, key `tp:player-view:v1:{venueId}`, 0 Games / 1 Leaderboard / 2 Prizes), so a push could land on
  Leaderboard. Fix: the push path carries `?panel=games|prizes`; the app's tap handler saves that screen before `router.push`, which
  survives C1's `/venue/X → /?v=X → /venue/X?entryUser=…` hop (that hop drops query params). `VenuePanelFromUrl` covers a tap while
  Venue Home is already open and website links; it calls `goToScreen` then removes `panel` with `history.replaceState` (same pattern
  as `PartnerMessageSheet`). Live Trivia's countdown card is the first thing on the Games screen, so no scrolling to a tile was added.

### 4. Files and how they fit
- `lib/pushLanding.ts` (pure): `VENUE_PANEL_PARAM = "panel"`, `venuePushPath(venueId, panel)`, `venuePanelFromSearch(search)`,
  `venuePushLanding(path)` → `{ venueId, panel }` or null.
- `lib/push/venueNews.ts`: `newGamePush`/`newPrizePush` copy; `announce` takes `panel` (`announceNewGame` → "games",
  `announceNewPrize` → "prizes").
- `lib/push/gameReminders.ts`: `gameReminderBody` without "Tap to play"; path `venuePushPath(venueId, "games")`.
- `components/push/NativePushRuntime.tsx`: tap → `venuePushLanding` → `savePlayerPanel` → `router.push`.
- C3's 1-hour reminder should reuse `venuePushPath(venueId, "games")` and the same no-"Tap to" wording (the contract test scans
  `lib/push/venueNews.ts` and `lib/push/gameReminders.ts`; add any new sender file to that list).

### 5. Facts and traps
- `tests/push-notifications-contract.test.ts` "invitations" block: the "Tap to" check strips comments first; only
  `lib/push/venueMessages.ts` may build a bare `/venue/${encodeURIComponent(` path inside `lib/push/`.
- C1's `/?v=X` hop also drops a partner message's `?message=` (pre-existing, not touched here). Worth a look in Phase R.
- The C1 handoff's browser recipe (scratchpad clone, mocked `/api/**`, port 3101) applies if you need a browser check.

### 6. Build / run / test
- `npx vitest run tests/lib.push.test.ts tests/push-notifications-contract.test.ts tests/lib.push-landing.test.ts tests/components.venue-panel-from-url.test.ts`
- Full `npm run test` (before the 2-test component file was added): 504 files passed, 1 skipped; 6,606 tests passed, 13 skipped.
  The component file passes alone (2). `npx tsc --noEmit` clean outside `.next/`; eslint clean on every changed file.
- **Not verified:** a real push tapped on iPhone/Android (cold start and while open), the `/?v=X` hop landing on the saved screen
  in a real app, `npm run build` (Phase R).

### 7. Open questions for Andrew
None new. Plan Q1 (blocks B3), Q2 (remind-me lead time, default 1 hour — relevant to C3), Q4 still open.

### 8. Recommended first steps for Phase C3 (Opus 5.5, high effort)
1. Read the plan's C3 section, `lib/push/gameReminders.ts`, `app/api/push/devices/route.ts` (session binding to copy), and
   `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`.
2. Write the migration with `service_role`-only grants; do **not** `supabase db push` without Andrew.
3. Put the toggle where away mode shows the Live Trivia day/time (`components/venue/VenueGamesPanel.tsx`), and check 350 px.
