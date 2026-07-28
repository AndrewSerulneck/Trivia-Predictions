# Phase 2 — Per-game locking; remove the countdown

Read `docs/nfl-pickem-improvements-plan.md` first.

Requirements #2 and #3: a pick locks at **that game's own kickoff**, not at
Thursday Night Football's kickoff. A user must be able to change their 1pm
Sunday pick right up until 1pm Sunday. The week-wide countdown clock and its
containing box go away entirely.

## Important: the server is already correct

`lib/nflPickEm.ts` already enforces per-game locking:

- `submitNFLPickEmPick` rejects with "This game has already started. Picks lock
  at kickoff." based on the individual game's `isLocked`, and separately checks
  the existing pick's own `starts_at`.
- `clearNFLPick` calls `isGameLocked(pick.starts_at)`.

Neither consults the week's lock state. **Do not add server-side logic; this
phase is about removing the client-side week-wide lock that contradicts it.**

## Required changes

### `components/nfl-pickem/NFLPickEmGameList.tsx`

- Every `<NFLGameCard>` currently receives
  `isLocked={weekData.week.isLocked || game.isLocked}` (four occurrences, one
  per day group). Change all of them to `isLocked={game.isLocked}`.
- `submitPick`'s early return currently reads
  `if (game.isLocked || weekData?.week.isLocked)`. Drop the week clause.
- **Delete the `<LockCountdown>` render block** and its import.
- **Delete the week-level "PICKS ARE LOCKED" banner** (the rose-bordered block
  that says "Thursday Night Football has kicked off").
- Update the header blurb: "Picks lock at kickoff." is now accurate but
  ambiguous — make it explicit, e.g. "Each pick locks at that game's kickoff."

### `components/nfl-pickem/LockCountdown.tsx`

Delete the file. Confirm nothing else imports it first.

### Per-game lock affordance

With the week banner gone, a locked *game* still needs to read as locked. The
card already applies `cursor-not-allowed opacity-50` when locked. Verify that
is legible and add a small inline lock indicator in the card header (next to
the existing time/status text) for games that are locked but not yet final, so
a user understands why they cannot change that one pick. Keep it compact —
this is a mobile surface.

### Freshness of `isLocked`

`game.isLocked` is computed server-side at fetch time. A user sitting on the
page while a game kicks off will still see it as open until something
refetches, and their pick will then be rejected by the server with a confusing
error.

Handle this client-side: derive lock state from `game.startsAt` vs the current
time on the client, on a low-frequency ticking interval (e.g. every 15–30s),
rather than trusting the server-rendered boolean indefinitely. Treat a game as
locked if **either** the server says so **or** its kickoff has passed locally.
This is a display concern only — the server remains the authority on writes.

## Do not

- Do not remove `isNFLWeekLocked` from `lib/nflPickEm.ts` or stop returning
  `week.isLocked` from the API routes. It may have other consumers and
  removing it is out of scope. Just stop letting it gate individual picks in
  this UI.
- Do not change `submitNFLPickEmPick` or `clearNFLPick`.

## Acceptance

- With the Phase 0 seed loaded, the current week shows already-started games as
  locked and not-yet-started games as fully pickable, simultaneously.
- Changing a pick for a later game succeeds after an earlier game in the same
  week has kicked off.
- No countdown clock and no containing box appear anywhere on the page.
- `grep -rn "LockCountdown" app components lib` returns nothing.
- `npm run build` and `npm test` pass.
