# Phase 1 — Layer A: squeeze the landscape view

**Model:** opus / high.

Reclaim every pixel the app itself is wasting in the Bingo landscape view, and give iOS
Safari the chance to collapse its own URL bar. This benefits **every player today**, with no
install and no tap. It is the highest-value work in the plan per unit of risk.

## Input

Start from `docs/bingo-fullscreen-pwa-phase0-findings.md` and the run log. Phase 0's priority
ordering supersedes the ordering below if they disagree.

## Do

1. **Reclaim app-owned chrome in landscape.** For each band Phase 0 marked
   "app-owned and reclaimable," remove or collapse it while `isLandscapeGameView` is true:
   - `MobileAdhesionAd` and `MobileBottomNav` must not occupy or overlay the landscape board.
   - `AppShell` header/padding must not constrain the landscape shell.
   - Prefer suppressing these via the existing `tp-bingo-landscape-active` html/body class
     that `SportsBingoHome` already toggles, rather than threading new props through
     `AppShell`. One class, one CSS block, easy to reason about and easy to revert.

2. **Give the board the reclaimed space.** The board stage is sized by
   `.tp-bingo-landscape-shell .tp-bingo-landscape-board-stage` in `app/globals.css`, via
   `min(calc(vh - 5.7rem), calc(vw - clamp(...)))`. Those subtracted constants encode the
   chrome being removed. Retune them so the board actually grows — do not remove chrome and
   leave the board the same size, which would accomplish nothing visible.

3. **Make the prop-bet text readable — this is the actual goal.** Growing the board is the
   means, not the end. Verify by reading the square-rendering JSX that longer prop-bet labels
   will now render more fully. Note that `shortenLabel()` in `SportsBingoHome.tsx` truncates
   labels; if it is applied to landscape squares, raise or bypass its `maxLength` for the
   landscape view specifically, since the whole premise is that landscape has room for the
   full text. Do not change its portrait behavior.

4. **Attempt the iOS URL-bar collapse, carefully.** Per Phase 0's assessment, iOS Safari
   collapses its URL bar in response to page scroll, and `tp-bingo-landscape-active` currently
   makes the page unscrollable. Implement the minimal version:
   - Allow the document a small scrollable overflow **only** while the Bingo landscape view
     is active on a touch device, and programmatically `scrollTo` once on entry to trigger
     the collapse.
   - The landscape shell is `position: fixed` and sized from `visualViewport`, so it must
     continue to cover correctly as the bar collapses — the existing `visualViewport`
     `resize`/`scroll` listeners should already re-measure. Confirm they do.
   - **Guard rails:** rubber-banding, content drift, and a shell that no longer covers the
     viewport are all regressions worse than the bug. If this cannot be done without
     reintroducing rubber-band scroll, **abandon this sub-task**, revert it cleanly, and
     record in the run log that the URL-bar collapse was attempted and rejected with the
     reason. A clean partial win beats a janky full one. Phases 3–5 (PWA) are the
     belt-and-braces answer for iOS anyway.

5. **Respect safe areas.** Use `env(safe-area-inset-*)` so the board does not slide under the
   notch or home indicator in landscape. The existing `@media (orientation: landscape) and
   (max-height: 430px)` block already does this for padding — extend the same approach rather
   than inventing a second mechanism.

## Do not

- Do not touch `components/venue-screen/*` — the TV surface is not part of this plan.
- Do not change portrait behavior. Every change must be scoped to `isLandscapeGameView` /
  the landscape media query.
- Do not remove the scroll lock wholesale. It exists to stop rubber-banding and was hard-won.
- Do not claim any visual result is "verified." See §4 of the master plan.

## Verify

`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`. Confirm no portrait-path
snapshot or unit test changed behavior.

## Run-log entry must include

Which bands were reclaimed and how many px each; the new board-stage sizing formula; whether
the URL-bar collapse was shipped, and if abandoned, exactly why (Phase 6 needs this for the
device checklist).
