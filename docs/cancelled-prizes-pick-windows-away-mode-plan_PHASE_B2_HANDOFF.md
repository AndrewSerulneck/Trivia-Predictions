# Phase B2 handoff: Pick ahead

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Claude Opus 5.5 did Phase B2 on 2026-11-09 at high effort, as the
plan's table names.

## For Andrew (plain English)

- **What changed:** when a bar sets a pick window for a sport (for example College Football picks open Thursday and close Saturday),
  players can now use the day arrows to go **forward** up to a week and pick games ahead of time while the window is open. The screen
  shows one small line, such as "Picks close Sat 11:59 PM", "Picks open Mon 12:00 AM" or "Picks closed". Games outside the window
  can't be tapped. NFL Pick 'Em's week view shows the same line. The Pick 'Em Prize tiebreaker card also locks when the window closes.
- **Nothing changes for any bar yet.** No bar has a window, and the screen to set one comes in Phase B4. Sports without a window stay
  "today only", exactly as now.
- **Cost:** none until a bar sets a window. After that, browsing future days adds sports-data requests, but most are cached and
  BallDontLie is a flat monthly subscription, so I estimate **no material cost** and did not build the extra "week cache". The
  estimate can't be measured until it's deployed (Vercel's call counts need a paid add-on). I added a small log line that counts
  BallDontLie calls per server every 10 minutes, so Phase R's deploy gives us the real numbers.
- **Is it live?** No. It is held for Phase R with A2–B1. Nothing was committed, deployed or applied, and no data was changed.
- **Checked:** all tests pass (512 files). Typecheck and lint are clean. **Not checked in a browser** (see §6 below).

## For the next agent

### 1. Next phase goal and scope
- **B3 (frozen spread lines per bar) is blocked on Q1** (plan §8: when a line freezes; recommended "first time shown"). Ask Andrew
  before starting it.
- **B4 (Game Settings UI)** can start now: per sport "Picks: Always open / Set days" in owner + admin Game Settings. The save API
  already accepts `pickWindows` (B1). Use `PICK_WINDOW_DAY_LABELS` and `formatPickWindowTime` from `lib/pickemPickWindow.ts`. Show
  "Saved." Add one Partner Manual entry. In the Pick 'Em Prize wizard, add one line (no block) when the prize's days fall outside the window.
- Out of scope for both: commit/deploy (Phase R), the migrations (R).

### 2. Starting state
- Branch `main`; `origin/main` = `f14c2449` (A1, deployed). Nothing new is committed, pushed or deployed.
- **Andrew, 2026-11-09: A2, A3 and C1 are held for Phase R.** C2, C3, B1 and B2 are treated the same way.
- Earlier uncommitted work: see `…_PHASE_B1_HANDOFF.md` §2 and the handoffs it lists.
- **Uncommitted, B2:**
  - new: `lib/providerCallCounter.ts`, `tests/lib.provider-call-counter.test.ts` (2 tests), this handoff
  - modified: `lib/pickemPickWindow.ts` (pick-ahead helpers appended), `lib/pickemPickWindowGate.ts` (`pickWindowViewAtVenue`),
    `lib/pickem.ts` (list + submit + display cache + probe + counter), `lib/balldontlie.ts` and `lib/ballDontLieClient.ts` (counter
    call only), `app/api/nfl-pickem/games/route.ts`, `app/api/pickem/prize-tiebreaker/route.ts` (GET), `components/pickem/PickEmGameList.tsx`,
    `components/pickem/PickEmPrizeTiebreakerCard.tsx`, `components/nfl-pickem/NFLPickEmGameList.tsx`, `components/nfl-pickem/NFLGameCard.tsx` (type only)
  - tests modified: `tests/lib.pickem-pick-window.test.ts` (+6), `tests/lib.pickem-college-spreads.test.ts` (+7; its settings mock
    now honours `collegeModeGate`, and the 30 s cache test counts `getVenueGameSettings`), `tests/api.nfl-pickem-games-route.test.ts`
    (+2; mocks `getVenueGameSettings` + `@/lib/timezone`), `tests/pickem-prize-tiebreaker.test.ts` (+1)
  - plan doc: status line, §6 B2 row, a "Built (B2)" note, B2 standing rule.
- No data, env var or production read/write. **Phase R still has to `supabase db push` `20261109214742` (C3) and `20261109223743` (B1),
  with Andrew's go-ahead.** Without B1's column, B2 sees no windows and shows nothing new.

### 3. Decisions made (don't re-ask)
- **Reach** (`pickAheadHorizonMs`): at most 7 days. While a window is open, the reach stops at its next opening (the last game it
  covers). While it is shut, the reach is the full 7 days, so the next window's games show "Picks open …". The server sends it as
  `pickAheadThrough` (a local date key in the phone's offset), and only when it is after today.
- **Words:** "Picks close Wed 11:59 PM" / "Picks open Mon 12:00 AM" / "Picks closed". The plan said "Picks open Mon". I kept the time
  so it matches the B1 refusal and works for windows that don't open at midnight. "Picks closed" covers a game whose own window has
  passed (the B1 409 still says when picks next open). Times are on the **bar's** clock (`formatPickWindowInstant`, built from
  parts so there's never a narrow no-break space).
- **One line per list:** the window of the first game still to start. A game not yet started whose window is shut gets
  `pickWindowMessage` (its buttons are disabled; a tap shows the words, through the existing `blockedMessage` path). Games that have
  started get nothing; the kickoff lock speaks for them.
- **The display read is cached:** the list's window comes from `readVenueGameSettingsForDisplay` (30 s per venue per instance),
  which replaced the college-rule-only cache. One promise serves both the college rule and the window. Pick writes still read fresh.
- **Submit:** `submitPickEmPick` now does its one fresh settings read **before** the today-only check, and skips that check only
  when the sport has a window (the B1 gate then decides). If the read fails, today-only stays (a future-day pick is refused with "You
  can only place picks for today.") and windows stay open (B1 fail-open).
- **NFL route:** `getVenueNFLPickEmScoringMode` was replaced with `getVenueGameSettings`: the same one read, now also carrying
  `pickWindows.nfl`. The time zone is read (cached) only when there's an NFL window. A failed read → mode unresolved (unchanged) and no window.
- **Tiebreaker GET:** `isLocked: true` + `pickWindowMessage` while the window is shut; `locksAt` = the window close when that comes
  before kickoff (the card's "Locks at"). One extra fresh small settings read per card load (`pickWindowViewAtVenue`, fail-open).
- **No week-slate cache:** not material (see §5 cost). The plan allowed skipping it; tell Andrew if R's measurement says otherwise.
- **Empty-day debug probe** (uncached provider calls whose result the screen never renders: `lastDebugProbes` is set but unused)
  now runs only for today and earlier, so pick-ahead days add none. Removing it entirely is a candidate for R (not done: out of scope).

### 4. Files and how they fit
- `lib/pickemPickWindow.ts` (pure): `PICK_AHEAD_MAX_MS`, `nextPickWindowOpeningMs`, `pickAheadHorizonMs`, `formatPickWindowInstant`,
  `PickEmPickWindowView` (`opensAt`, `closesAt`, `isOpen`, `line`), `pickWindowViewForGame`, `pickWindowViewForGames` → `{ view,
  closedLines }`.
- `lib/pickem.ts`: `PickEmGame.pickWindowMessage`; `listPickEmGames` returns `pickWindow` + `pickAheadThrough` via
  `applyPickWindowToGames` (in the same `Promise.all` as lines/prizes/summary; skipped for `skipLines`, NFL or no venue);
  `readVenueGameSettingsForDisplay` (+ `clearCollegeScoringModeDisplayCache` still clears it); `submitPickEmPick` reorder.
- `lib/pickemPickWindowGate.ts`: `pickWindowViewAtVenue` (tiebreaker GET).
- `app/api/nfl-pickem/games/route.ts`: top-level `pickWindow`, per game `pickWindowMessage`.
- `components/pickem/PickEmGameList.tsx`: `isValidStartDateKey` (initial `?date=` up to 7 days ahead), `pickAheadThrough` /
  `pickWindowLine` state, snap-back in `loadGames`, `isPickAheadDay` / `isLiveListDay` / `lastReachableDate`, the Next arrow,
  `data-testid="pickem-pick-window"` line, `windowShut` in each card. The sport row, "Today:" summary and tiebreaker card stay on
  today only.
- `components/nfl-pickem/NFLPickEmGameList.tsx`: `pickWindowLine` under the weeks (`data-testid="nfl-pickem-pick-window"`); a shut game
  is shown locked (🔒).
- `lib/providerCallCounter.ts`: `countProviderCall("bdl", path)` in every BallDontLie `fetch` (`lib/balldontlie.ts`,
  `lib/ballDontLieClient.ts`, two in `lib/pickem.ts`); one `console.info("[provider-calls] minutes=10 bdl/ncaaf/v1/games=12 …")`
  per instance per ≥10 min. Ids are folded to `:id`, query strings dropped. The test pins "one counter per fetch".

### 5. Facts and traps
- **The list maps days with the phone's current UTC offset**, not the date's (pre-existing). Across a DST change the reach can land one
  day later than the wall clock suggests (test "an open window lets players pick…" documents Thu Oct 29 → reach Nov 5). Harmless:
  those games show "Picks open …".
- **Cost estimate (not measured):** zero until a window exists. With one, per future day viewed: one games request (Next data cache
  `revalidate: 60` per URL in `fetchBallDontLieJson`, so ≤ 1 provider call/min per sport + day + offset), and for College Football in
  spread mode ≤ 1 odds walk (≈3 pages) per 10 min per day per instance, skipped while the shared DB stamp is fresh. Worst case, a
  week browsed nonstop: ≤ ~7 games calls/min + ≤ ~2 odds calls/min per instance. BallDontLie is a flat subscription. Supabase/Vercel:
  the same list reads as viewing today, once per future day viewed. Unverified: that Next 16's data cache really serves those
  `revalidate: 60` fetches on Vercel. The counter counts `fetch()` calls, so cached replies are counted too (an upper bound).
- **Measuring after R's deploy:** Vercel runtime logs, search `[provider-calls]` (MCP `get_runtime_logs`, project
  `prj_OpAN1WsW4vxk9rvc4I6oZANNLeLF`, team `team_uGVCpxcJGBQ1VdCDO0lSMRZf`). Take a baseline before any bar sets a window, then compare
  once one does. Observability Plus is still not bought (402).
- `getTimeZoneParts` (`lib/categoryBlitzScheduleTime.ts`) is the one local-time reader; `formatPickWindowInstant` uses it.
- zsh: `echo =====` fails; `sed -i ''` is the macOS form.

### 6. Build / run / test
- `npx vitest run tests/lib.pickem-pick-window.test.ts tests/lib.pickem-college-spreads.test.ts tests/api.nfl-pickem-games-route.test.ts tests/pickem-prize-tiebreaker.test.ts tests/lib.provider-call-counter.test.ts tests/api.pickem-pick-window-gate.test.ts`
- Full `npm run test`: 512 files passed, 1 skipped; 6,698 tests passed, 13 skipped. `npx tsc --noEmit` clean (outside `.next/`).
  eslint is clean on every B2 file.
- **Not verified:** no browser check. A real one needs B1's column applied (or mocked `/api/pickem/games` and `/api/nfl-pickem/games`
  responses with `pickWindow`/`pickAheadThrough`) in a scratchpad clone, per CLAUDE.md. Check at 350 px: the Next arrow past today, a
  future day's list and line, disabled cards with the tap message, snap-back from `?date=` beyond the reach, NFL line under the weeks,
  and the tiebreaker card's "Locks at". Recommended in B4 (once a window can be set) or R.

### 7. Open questions for Andrew
- None new. Q1 (line freeze timing) still blocks B3. Phase R needs his go-ahead for `20261109214742` and `20261109223743`.
- FYI only: the open line says "Picks open Mon 12:00 AM" (with the time), not the plan's "Picks open Mon".

### 8. Recommended first steps for the next phase
- **B4 (Opus 5.5, medium effort, per the plan's table):** read the B1 + B2 standing rules in the plan, then
  `readGameSettingsChanges` / `updateVenueGameSettings` (`lib/venueGameSettings.ts`) and the owner + admin Game Settings screens.
  Build the form against the existing save API, then do the browser check in §6 with a real window.
- **B3 (Opus 5.5, high):** only after Andrew answers Q1.
