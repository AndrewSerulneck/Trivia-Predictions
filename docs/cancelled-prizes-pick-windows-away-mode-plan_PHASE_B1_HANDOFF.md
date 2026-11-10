# Phase B1 handoff: Pick-window data + rules (server only)

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Claude Opus 5.5 did Phase B1 on 2026-11-09 at high effort,
which matches the plan's table.

## For Andrew (plain English)

- **What changed:** the server can now hold a weekly pick window per sport for each bar, for example "College Football picks open
  Mon 12:00 AM, close Wed 11:59 PM". Outside the window, making, changing or clearing a pick is refused with "Picks open Mon
  12:00 AM." This covers regular Pick 'Em, NFL Pick 'Em and the Pick 'Em Prize tiebreaker guess. Games still lock at kickoff.
- **Nothing changes for any bar yet.** No bar has a window. There is no screen to set one until Phase B4, and a sport with no
  window works exactly as today.
- **If our own database read fails,** picks stay open. An outage on our side never blocks picks.
- **Cost:** none measurable. In most cases a pick makes one extra tiny database read. No new scheduled job and no provider calls.
- **Is it live?** No. It is held for Phase R with A2–C3. It needs a new database column (migration
  `20261109223743_pickem_pick_windows.sql`). **I did not apply it.** Until it is applied, the code behaves as if no bar has a
  window.
- **Checked:** all tests pass (511 files). Typecheck and lint are clean. The migration was run twice against a local Postgres
  copy (PGlite) on a stub table.

## For the next agent (Phase B2: Pick ahead)

### 1. Next phase goal and scope
Phase B2 per plan §7: for a sport **with** a window, regular Pick 'Em's date arrows go forward up to the last game the current or
next window covers (at most 7 days). Sports without a window stay today-only. The games response carries `pickWindow` (`opensAt`,
`closesAt`, `isOpen`). The screen shows one muted line: "Picks close Wed 11:59 PM" or "Picks open Mon". NFL Pick 'Em's week view
shows the same. Measure BallDontLie calls against the Phase 0 baseline; if they are material, ship the shared 10-minute week-slate
cache and tell Andrew **before** release.
Out of scope: B3 (frozen lines; Q1 still open), B4 (Game Settings form), commit/deploy (held for R).

### 2. Starting state
- Branch `main`; `origin/main` = `f14c2449` (A1, deployed). Nothing new committed, pushed or deployed.
- **Andrew, 2026-11-09: A2, A3 and C1 are held for Phase R.** C2, C3 and B1 are treated the same. Don't commit or deploy.
- For the uncommitted A2–C3 files, see `…_PHASE_C3_HANDOFF.md` §2 and the handoffs it lists.
- **Uncommitted, B1:**
  - new: `supabase/migrations/20261109223743_pickem_pick_windows.sql` (**not applied**), `lib/pickemPickWindow.ts`,
    `lib/pickemPickWindowGate.ts`, `tests/lib.pickem-pick-window.test.ts` (15), `tests/api.pickem-pick-window-gate.test.ts` (10)
  - modified: `lib/venueGameSettings.ts`, `lib/pickem.ts` (`submitPickEmPick`, `resolvePickScoringMode`, `clearPickEmPick`),
    `lib/nflPickEm.ts` (`submitNFLPickEmPick`, `clearNFLPick`), `app/api/pickem/picks/route.ts`, `app/api/nfl-pickem/picks/route.ts`
    (it already had a D8 change from C1), `app/api/pickem/prize-tiebreaker/route.ts`, `app/api/owner/game-settings/route.ts`,
    `app/api/admin/game-settings/route.ts`
  - tests modified: `tests/lib.venue-game-settings.test.ts` (+5), `tests/lib.pickem-college-spreads.test.ts` (+5; its mock now has
    `getVenueGameSettings` and a `delete`), `tests/pickem-prize-tiebreaker.test.ts` (+1)
  - plan doc: status line, §6 B1 cost row, a "Built (B1)" note in the B1 section, B1 standing rule; this handoff.
- No data, env var or production read/write. **Phase R must `supabase db push` both `20261109214742` (C3) and `20261109223743` (B1),
  with Andrew's go-ahead, before deploying.** B1 without its migration is safe: reads fall back to "no windows", and only a
  pick-window **save** fails ("Pick windows are not available yet.", 500).

### 3. Decisions made (don't re-ask)
- **Column, not table** (the plan allowed either): `venue_game_settings.pickem_pick_windows jsonb not null default '{}'`, with a
  check that it is an object. Example: `{"ncaaf": {"open_day": "mon", "open_time": "00:00", "close_day": "wed", "close_time":
  "23:59"}}`. Keys are `PickEmSportSlug` (`lib/pickemSports.ts`), and `nfl` means NFL Pick 'Em. The table is already
  service_role-only (baseline `20260923130841`); a new column needs no grant.
- **Window instance** = the latest opening at or before kickoff; it closes at the next close after that opening. Open means
  opening ≤ now < close, so the close is exclusive: "11:59 PM" refuses from 11:59:00. A window is always shorter than a week, and
  open = close is refused.
- **Refusal words** always name the window's opening ("Picks open Mon 12:00 AM."), even when the game's own window has already
  passed. The plan specified these words, and they tell the player when picks next open.
- **Fail open** on a settings read error: `readVenueGameSettingsForPick` logs `[Pick 'Em] pick-window-read-failed` and returns
  null. A **new college pick** still refuses without its rule, as before.
- **One settings read per pick:** `submitPickEmPick` reads settings once and uses the result for both the window and the college
  rule. `resolvePickScoringMode` now takes `settings` and no longer calls `getVenueCollegeFootballPickEmScoringMode`, which is
  still used for the cached **display** rule. `submitNFLPickEmPick` reads settings first and passes `scoringMode` to
  `listNFLPickEmGames`, so the read happens once instead of twice.
- **Tiebreaker** (§4 default): a guess is refused while the window covering the tiebreaker game (that game's sport, from
  `pickEmSportOfLeague`) isn't open. As a result, it locks at window close when that comes before kickoff.
- **The save API is in B1.** `readGameSettingsChanges` accepts `pickWindows: { <slug>: {openDay, openTime, closeDay, closeTime} |
  null }`. Only the sports named change, and null clears a sport. Any invalid entry refuses the whole body with 400.
  `updateVenueGameSettings` merges the change into the saved windows: it reads them, then upserts. B4 only needs the form.
- **B1 still keeps regular Pick 'Em today-only.** The window only adds a restriction. Pick-ahead is B2.

### 4. Files and how they fit
- `lib/pickemPickWindow.ts` (pure, client-safe): types `PickEmPickWindow` / `PickEmPickWindows` / `PickEmPickWindowChanges`;
  `readPickEmPickWindow` and `readPickEmPickWindowChanges` (API input, camelCase); `parseStoredPickWindows` and
  `toStoredPickWindows` (jsonb, snake_case); `applyPickWindowChanges`; `pickWindowInstanceAt(window, atMs, tz)`;
  `pickWindowStatusForGame({window, kickoffMs, nowMs, timeZone})` → `{opensAtMs, closesAtMs, isOpen}`; `formatPickWindowTime`;
  `pickWindowClosedMessage`; `PICK_WINDOW_DAY_LABELS`. **B2 builds `pickWindow` from `pickWindowStatusForGame`,** and B4's form
  uses the labels and formatter.
- `lib/pickemPickWindowGate.ts` (server-only): `PickEmPickWindowClosedError` / `isPickEmPickWindowClosedError` (matched by
  `name`); `readVenueGameSettingsForPick`; `assertPickEmPickWindowOpen({venueId, sportSlug, startsAt, windows, nowMs?})`, which
  reads the time zone (`getVenueTimezone`, cached 10 min) only when the sport has a window;
  `assertPickEmPickWindowOpenAtVenue`, which does its own settings read and is used by both clears and the tiebreaker.
- `lib/venueGameSettings.ts`: `VenueGameSettings.pickWindows`. `withColumnFallback` tries column sets newest-first
  (with windows → without windows → legacy without college). It steps back only when a column in the current set is missing, and
  a save never falls back to a set that can't hold what it writes.

### 5. Facts and traps
- **The today-only rule lives in two places.** B2 must relax both for a windowed sport only: `submitPickEmPick` has
  `if (gameLocalDate !== todayLocalDate) throw "You can only place picks for today."`, and the games list has
  `isValidPastOrTodayDateKey` plus the arrows in `components/pickem/PickEmGameList.tsx`. The window check comes **after** the
  today-only, kickoff-lock and team checks. It comes before the existing-pick read and any write; the contract test pins it
  before `.update(` / `.delete()`.
- **`clearPickEmPick` has no venue param.** It now selects `venue_id, sport_slug` from the pick row to find the window.
  `clearNFLPick` uses `pick.venue_id`.
- **The tiebreaker GET's `isLocked` still reflects kickoff only.** The window is enforced on POST alone. B2 should mark the card
  closed while the window is shut, or the player only learns from the 409.
- The 409 body is `{ ok: false, error: "Picks open Mon 12:00 AM." }` on all three routes. Other errors keep their old statuses.
  `/api/pickem/picks` still maps by message keywords; "Picks open…" would have fallen through to 500, which is why it goes
  through `instanceof`/`name`.
- In zsh, `echo =====` fails ("= not found"). Use another separator in shell one-liners.
- The pick-window save is read-then-upsert, not atomic. Two partners saving different sports at the same moment could lose one
  save. That is rare, and the cost was accepted (no lease, unlike Pick 'Em Prize saves).
- A malformed stored entry is dropped on read, and the sport then counts as always open. This keeps the fail-open rule.

### 6. Build / run / test
- `npx vitest run tests/lib.pickem-pick-window.test.ts tests/api.pickem-pick-window-gate.test.ts tests/lib.venue-game-settings.test.ts tests/lib.pickem-college-spreads.test.ts tests/pickem-prize-tiebreaker.test.ts`
- Full `npm run test`: 511 files passed, 1 skipped; 6,680 tests passed, 13 skipped. `npx tsc --noEmit` is clean outside `.next/`.
  eslint is clean on every B1 file.
- DST is covered: autumn (Thu–Mon across 2026-11-01) and spring (Sat 8 PM–Sun 12 PM across 2027-03-14), both Eastern, plus one
  Pacific case.
- Migration: run twice in PGlite on a stub `venue_game_settings`. Existing rows get `{}`, and `[]`, `null` and `3` are refused.
  The script was `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/7f9705df-fc1d-4c4e-bf8a-ea952cecd670/scratchpad/mig.mjs`;
  copy it into the repo root to run it, because it needs `node_modules`.
- **Not verified:** real Postgres and PostgREST with the column applied (Phase R); `submitNFLPickEmPick`'s window path
  end-to-end (only a source contract plus the route's 409 mapping, since NFL has no submit harness); no browser check (there is
  no UI in B1).

### 7. Open questions for Andrew
None new. Q1 (line freeze timing) blocks B3. Q2 and Q4 are unchanged. **Phase R needs his go-ahead to apply `20261109214742` and
`20261109223743`.**

### 8. Recommended first steps for Phase B2 (Opus 5.5, high effort)
1. Read the plan's B2 section, §6's B2 cost row and Phase 0's BallDontLie baseline (`…_PHASE_0_HANDOFF.md`).
2. In `listPickEmGames` (`lib/pickem.ts`), use the venue's windows. Reuse the 30 s display cache idea: don't add a fresh read per
   list load. Attach `pickWindow` from `pickWindowStatusForGame`, and allow future dates only for a windowed sport (both
   today-only spots in §5).
3. Count provider calls per day browsed before shipping. If they are material, tell Andrew before release and offer the shared
   10-minute week-slate cache.
