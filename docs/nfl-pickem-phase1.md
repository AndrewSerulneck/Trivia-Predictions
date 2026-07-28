# Phase 1 — Instant optimistic pick feedback

Read `docs/nfl-pickem-improvements-plan.md` first.

Requirement #1: the checkmark takes too long to register. Selecting a team must
feel **instant** — zero perceptible delay between tap and confirmed checkmark.

## Root cause (already diagnosed — verify, then fix)

`components/nfl-pickem/NFLPickEmGameList.tsx` already applies an optimistic
update to `optimisticPicks` *before* awaiting the network, so the state is
correct immediately. Three things then hide that from the user:

1. **`components/nfl-pickem/NFLGameCard.tsx` (~lines 75–79 and 113–117)**
   renders a spinner overlay with `absolute inset-0 ... bg-black/20` on top of
   the button whenever `game.isSubmitting` is true — literally covering the
   checkmark it just optimistically set.
2. **Both team buttons set `disabled={isLocked || game.isSubmitting}`**, so the
   card goes inert during the round-trip and a fast second tap is dropped.
3. **`submitPick` refetches the entire games list** after every successful
   pick (`/api/nfl-pickem/games?...`) just to refresh the summary, extending
   how long `isSubmitting` stays true.

## Required changes

### `NFLGameCard.tsx`

- **Delete both spinner overlays entirely.** The optimistic checkmark *is* the
  feedback; a spinner on top of it is strictly worse.
- **Stop disabling on `isSubmitting`.** Buttons should only be `disabled` when
  the game is locked. A user must be able to change their mind mid-flight.
- Keep the checkmark's existing selected/unselected styling and the
  `rotate-[-7deg]` selected treatment — it reads well, it was just being
  covered.
- Make the checkmark transition snappy. The current `transition-all` has no
  explicit duration; give it a short, deliberate one (~120–150ms) so it feels
  crisp rather than either laggy or abrupt. Add a subtle scale/pop on select if
  it stays within Tailwind utilities.
- If `isSubmitting` ends up entirely unused after this, remove it from the
  `NFLGame` type and from the `gamesWithOptimistic` mapping rather than
  leaving a dead prop.

### `NFLPickEmGameList.tsx`

- **Remove the post-success full games refetch.** Update `userSummary`
  locally instead: derive the new picks/correct/wrong/points counts from the
  optimistic pick state. Pending picks contribute to `picksCount` only —
  correct/wrong/points only change at settlement, so a local recompute is
  exact, not an approximation.
- **Keep the rollback-on-error behavior**, and keep surfacing the error. On
  failure, revert the optimistic pick and show the existing error banner.
- **Fix the stale-closure hazard in `submitPick`.** It currently depends on
  `optimisticPicks` and `weekData`, so it is recreated on every pick and reads
  a potentially stale `currentPick`. Use functional `setState` updaters to
  read the latest pick state rather than closing over it.
- **Guard against out-of-order responses.** Rapid taps on the same game can
  resolve out of order. Ensure the last *user action* wins — e.g. track a
  per-game request sequence number and ignore a response that is no longer the
  latest for that game. Do not let a slow earlier response overwrite a newer
  optimistic pick.

## Do not

- Do not remove the server round-trip or make picks fire-and-forget. The
  optimistic UI must still reconcile with, and roll back on, server rejection.
- Do not touch lock logic in this phase — that is Phase 2.

## Acceptance

- Tapping a team shows the checkmark with no perceptible delay and no spinner.
- Tapping the *other* team immediately after switches the checkmark instantly.
- Tapping the same team again clears the pick (existing deselect behavior
  preserved).
- A rejected pick (e.g. locked game) visibly reverts and shows the error.
- The weekly summary "PICKS" count updates immediately on pick/unpick.
- `npm run build` and `npm test` pass.
