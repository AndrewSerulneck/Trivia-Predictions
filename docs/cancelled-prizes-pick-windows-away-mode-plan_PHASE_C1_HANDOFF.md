# Phase C1 handoff: away mode (view-only bar) + "Your bars"

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Phase C1 was done on 2026-11-09 by Claude Opus 5.5 at high effort,
which matches the plan's table.

## For Andrew (plain English)

- **What changed (two things):**
  1. **Venue Home away from the bar is view-only.** Before, a player who opened their bar from home got a full-screen "You've left
     the venue" block. Now they see the bar's Venue Home with a small **View only** card (the bar's address and a **Directions**
     button), the Live Trivia day and time, the leaderboard and the prizes. Every game button reads **Play at the bar**. Tapping one
     checks location once: if they are now at the bar, the game opens; if not, nothing happens. Game screens still show the old
     block.
  2. **"Your bars"** (your request): after signing in, under the nearby list, players see the bars they've checked in at in the
     **last 90 days** that aren't in range, marked **View only**. Tapping one opens that bar's Venue Home view-only. Bars in range
     appear in the normal list and join as full players, as today. A bar drops off 90 days after the player's last check-in there.
     "Checked in" = a location check that passed at that bar (joining, or the check that runs every 15 minutes while playing).
- **Pushes:** if a push or link for bar X reaches someone signed in at bar Y, the app now opens X view-only by itself (if X is out
  of range and they have played at X), instead of the old "No partner venue nearby" dead end.
- **Nothing can be played, picked or redeemed from home.** The server still checks location on every write (your
  `VENUE_PRESENCE_ENFORCEMENT = 1`).
- **Checked:** all tests (503 files) pass, plus a real-browser check at 350 px (screens looked right, nothing ran off the side).
- **Is it live?** No. A2, A3 and C1 are **not committed or deployed**.
- **Your answers (2026-11-09), both done:**
  1. **Restore old check-in dates: yes.** 37 dates restored from the location-check log (4 had no log entry). Undo list:
     `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`.
  2. **Server location checks on four more games: yes.** NFL Pick 'Em picks, Squares and Bracket now refuse from away ("Play at the
     bar."). Category Blitz: a player who isn't at the bar can watch a running round but can't start one. Not deployed yet.

## For the next agent (Phase C2: push wording + where taps land)

### 1. Next phase goal and scope
Phase C2 per plan §7: invitation-style wording for the news push and the 30-minute reminder, landing on Venue Home (now away mode when
not there). Update `PUSH_COPY` and `tests/push-notifications-contract.test.ts`. Out of scope: Remind me (C3), every B phase.
C1 already makes a tap on `/venue/X` land well in both cases (same stored bar → away mode; different stored bar → `/?v=X` →
auto-open view-only), so C2 is mostly copy plus "that game in view".

### 2. Starting state
- Branch `main`; `origin/main` = `f14c2449` (A1, deployed). Nothing new committed, pushed or deployed.
- Uncommitted from A2/A3: see `…_PHASE_A3_HANDOFF.md` §2.
- **Uncommitted, C1:**
  - new `lib/recentVenues.ts`, `lib/playerVenues.ts`, `lib/venueAwayMode.ts`, `app/api/player/venues/route.ts`,
    `app/api/player/venues/open/route.ts`, `scripts/backfill-presence-checkins.mjs`
  - modified `lib/venuePresence.ts` (`upsertPresence`), `components/venue/VenuePresenceBoundary.tsx`,
    `app/venue/[venueId]/page.tsx`, `components/venue/VenueHubClient.tsx`, `components/venue/VenueGamesPanel.tsx`,
    `components/join/JoinFlow.tsx`
  - new tests `tests/away-mode-contract.test.ts` (6), `tests/api.player-venues.test.ts` (8), `tests/components.venue-away-mode.test.ts`
    (8), `tests/lib.recent-venues.test.ts` (6), `tests/lib.venue-away-mode.test.ts` (8), `tests/lib.venue-presence-checkin.test.ts` (3)
  - plan doc: D6, §6 cost row, C1 section, Q3 answered, status line, C1 standing rule; this handoff.
- Not mine, leave alone: `assets/app-store/*-2026-11-09/`, `output/`.
- **No data changed, no migration, no env var.** Production reads only (select). The backfill script was run in dry-run mode only.

### 3. Decisions made
- **D6 (Andrew, 2026-11-09):** "Your bars" = bars checked in at in the last 90 days; in range → join as full player; else view-only.
- **Check-in = `venue_presence_sessions.last_verified_at`** (no migration). `upsertPresence` now omits the column on failures
  (an upsert updates only the columns it sends), so only a passed check moves it. The partner diagnostics (`lib/venuePresenceDiagnostics.ts`)
  now see the true last verified time instead of null after a failure.
- **Departure from Phase 0's P4 (written into the plan's C1 section):** opening bar X switches the signed session to the account's
  **existing** X profile (`POST /api/player/venues/open`) instead of showing X under bar Y's identity. Reason: the second, public-only
  read path would touch ~10 places in `VenueHubClient` (prizes, badges, points, passkey, warm-up, arrival guard, watchdog, heartbeat).
  Side effect: the phone's `push_devices.venue_id` (30-minute reminder audience) follows the bar last opened.
- **Account binding:** both endpoints take the browser's account id and answer nothing unless it equals the session's
  `users.account_id` (a phone may still hold player A's `tp_sess` while B signs in). Legacy no-account sessions match only an absent id.
- **Away = `VENUE_OUT_OF_RANGE` only.** `AUTH_REQUIRED` and `VENUE_PROFILE_MISMATCH` keep the overlay; location-unavailable still
  shows no overlay (unchanged).
- **A "Play at the bar" tap re-checks once** (`playWhenPresent`) and opens the game if the check passes. The plan said "open nothing";
  this is the same while away and avoids making an arrived player wait up to 15 minutes.
- **Auto-open for `/?v=X`:** only when X is out of range, in the account's list (any age), at most once a minute per tab
  (`sessionStorage` `ht:away-auto-open-at`). Without that guard two website tabs on different bars bounced each other (seen in testing).
- God Mode skips the "Your bars" fetch (its list already holds every bar). Opening view-only skips `syncUserGeographicData`.

### 4. Files and how they fit
- `lib/recentVenues.ts` (pure): `RECENT_VENUE_WINDOW_DAYS = 90`, `selectRecentVenues(rows, nowMs, requestedVenueId)`,
  `awayRecentVenues(recent, visibleVenues, inRange)`.
- `lib/playerVenues.ts` (server-only): `readSessionUser` (account binding), `listRecentVenuesForSession` (3 reads: session user,
  account's `users` rows, their presence rows; a lease on another bar's row is ignored), `openVenueProfileForSession` (visible
  venue check + existing profile; no writes).
- Routes: `GET /api/player/venues?accountId=&venueId=` (no session → `[]`), `POST /api/player/venues/open {venueId, accountId}`
  (503 without `SESSION_SECRET`, 401 no session, 404 no profile/mismatch/hidden; sets `tp_sess`).
- `VenuePresenceBoundary`: `awayMode` prop, `isAway` in context, exported `isVenueAwayFailure`.
- `VenueHubClient`: `useVenuePresence()`, `awayView` memo → `VenueGamesPanel away`; `handleGoTo` and `playChallengeGame` wrap `goTo`
  in `playWhenPresent`; prize modal button reads `AWAY_PLAY_LABEL` when away.
- `VenueGamesPanel`: `VenueAwayView` type, "View only" card (`data-venue-away-banner`), Directions (`openInSystemBrowser` in the app,
  new tab on the web), `data-venue-away-play` pills, play disabled while checking.
- `JoinFlow`: state `recentVenues`/`recentVenueRows`/`openingAwayVenueId`, fetch effect, `awayVenues`, `handleOpenAwayVenue`
  (→ `navigateToResolvedVenue(venue, user, { viewOnly: true })`), auto-open effect — all placed **before**
  `handleVenueListQrScanned` (the God Mode contract test slices from there to `handleBackToVenueList` and forbids "geolocation").
  `discardVenueList` also resets "Your bars". `VenueListItem` has `viewOnly`.

### 5. Facts and traps
- Production (2026-11-09, select-only): 156 presence rows; 82 verified in the last 90 days; 60 accounts would have a non-empty list
  (max 9 bars, 5 with 2+). 40 rows have a null check-in; 36 restorable from `venue_presence_events`, 27 within 90 days.
- The 10 presence-checked write routes are pinned in `tests/away-mode-contract.test.ts`. **Not presence-checked** (pre-existing):
  `app/api/nfl-pickem/picks`, `app/api/squares/claim`, `app/api/bracket/entry`, `app/api/category-blitz/sessions` (open question 2).
- A fresh account sign-in on a new device has no `tp_sess` until the first join there, so "Your bars" is empty on that device until then.
- Category Blitz's first tap shows its tutorial overlay, not navigation: browser-test "tap opens a game" with another tile.
- `sourceBetween`-style contract tests slice JoinFlow by function names; inserting code between those anchors can trip them.
- Browser check recipe (worked): `rsync -a` with anchored excludes to the scratchpad, `cp -Rc node_modules`, then in the clone
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev --webpack -p 3101`; cookies
  `tp_user_id`/`tp_venue_id` + localStorage `tp:user-id`, `tp:venue-id`, `tp:username`, `tp:account-id`, `tp_welcome_seen`; fallback
  venue `brunswick-grove`; mock every `/api/**`. Kill only your PID. The script used was
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/ba357cac-667a-4370-aa3b-4d0448dfa38c/scratchpad/c1-browser.mjs`.

### 6. Build / run / test
- `npx vitest run tests/away-mode-contract.test.ts tests/api.player-venues.test.ts tests/components.venue-away-mode.test.ts tests/lib.recent-venues.test.ts tests/lib.venue-away-mode.test.ts tests/lib.venue-presence-checkin.test.ts`
- `npm run test:god-mode-join` → 6 files, 59 tests pass.
- Full `npm run test` → 503 files passed, 1 skipped; 6,597 tests passed, 13 skipped (before a type-only fix to the new component test,
  which was re-run alone: 8 pass). `npx tsc --noEmit` clean outside `.next/`; eslint clean on every changed file.
- Browser (mocked, 350 px): away banner + 7 "Play at the bar" controls, no overlay, no horizontal scroll; a tap while away = one
  heartbeat, no navigation; a tap after "arriving" opened `/trivia`; sign-in list showed "Your bars" with View only rows; a tap called
  `/api/player/venues/open` and landed on `/venue/venue-uptown?entryUser=…`.
- **Not verified:** a real iPhone/Android app run (Directions via `openInSystemBrowser`), real `tp_sess` switching against the live
  server, `npm run build` (Phase R).

### 7. Open questions for Andrew
Answered 2026-11-09 (plan D7, D8): backfill applied (37 rows, undo log above); presence checks added to
`app/api/nfl-pickem/picks`, `app/api/squares/claim`, `app/api/bracket/entry` (via `maybeRequireActiveVenuePresence`) and
Category Blitz's sessions GET (look-only via new read-only `isVenuePresenceLive` in `lib/venuePresence.ts`). Squares/Bracket map a
refusal to `outcome: "not_at_venue"` (`lib/squaresView.ts`, `lib/bracketsView.ts`). Full suite after: 503 files, 6,600 tests pass.
Not browser-tested: these four refusals on a real phone.
Still open: commit/deploy A2 + A3 + C1 now, or with Phase R? Plan Q1, Q2, Q4 still open (only Q1 blocks anything: B3).

### 8. Recommended first steps for Phase C2 (Opus 5.5, medium effort)
1. Read `lib/push/venueNews.ts`, `lib/push/gameReminders.ts`, `PUSH_COPY` and `tests/push-notifications-contract.test.ts`.
2. Change copy only as the plan's C2 section says; keep the 4.5.4 consent wording.
3. "That game in view": Venue Home's Games panel is screen 0 already; decide whether anything more than the landing is needed.
