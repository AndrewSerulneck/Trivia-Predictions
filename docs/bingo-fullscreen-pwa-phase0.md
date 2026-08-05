# Phase 0 — Measurement: where do the pixels actually go?

**Model:** opus / high. **Writes no product code.** Output is a findings doc + run-log entry.

## Why this phase exists

Before changing the landscape layout, establish how much of the missing space is the
**browser's** chrome (which we mostly cannot control) versus the **app's own** chrome (which
we fully control). If the app is eating 90px of a 390px-tall landscape viewport, Phase 1 is a
layout fix and the whole PWA track is a bonus rather than the cure. Guessing this wrong sends
Phase 1 down the wrong path.

## Do

1. **Read the existing landscape implementation end to end** before concluding anything:
   - `components/bingo/SportsBingoHome.tsx` — the landscape state machine
     (`isLandscapeGameView`, media query `(orientation: landscape) and (max-height: 560px)`),
     the `visualViewport` measurement effect that sets `landscapeViewportStyle`, the
     fullscreen helpers (`getFullscreenElement`, `isFullscreenAvailable`,
     `requestElementFullscreen`, `exitDocumentFullscreen`), `toggleLandscapeFullscreen`, and
     the landscape shell JSX.
   - `app/globals.css` — everything matching `tp-bingo-landscape` (the shell sizing rules,
     the `--bingo-landscape-*` custom properties, the `@media (orientation: landscape) and
     (max-height: 430px)` compaction block, and the `tp-bingo-landscape-active` scroll lock).
   - `components/ui/AppShell.tsx`, `components/ui/MobileBottomNav.tsx`,
     `components/ui/MobileAdhesionAd.tsx` — the app chrome wrapping the page.
   - `components/ui/ViewportHeightSync.tsx` and `app/layout.tsx`'s `viewport` export.

2. **Build a written pixel budget.** For a representative small landscape viewport (assume
   an iPhone-class 844×390 CSS px landscape), account for every vertical band between the top
   of the display and the top of the Bingo board, and again below it. For each band state:
   what draws it, which file/line owns it, its height, and whether the app can reclaim it.
   Distinguish clearly:
   - **App-owned and reclaimable** — e.g. adhesion ad, bottom nav, shell padding, header.
   - **App-owned but load-bearing** — e.g. the board's own controls.
   - **Browser-owned** — Safari's URL bar, home indicator, notch safe-area insets.

3. **Determine empirically whether app chrome is even rendered in landscape.** Check whether
   `MobileAdhesionAd`, `MobileBottomNav`, and the `AppShell` header are actually mounted and
   occupying space while `isLandscapeGameView` is true, or whether the landscape shell's
   `position: fixed` already covers them. If it covers them, they cost nothing visually but
   may still affect the scroll lock — say so.

4. **Assess the URL-bar collapse lever.** `app/globals.css`'s `tp-bingo-landscape-active`
   rule sets `overflow: hidden !important` and `touch-action: none !important` on html/body.
   iOS Safari collapses its URL bar in response to page **scroll**; a page that can never
   scroll never sends that signal. Write down: (a) whether this is plausibly why the bar
   never collapses here, (b) what a minimal "scrollable sliver + programmatic scroll"
   technique would look like against this specific CSS, and (c) what it would risk — this
   scroll lock exists to stop rubber-banding and was hard-won, so removing it wholesale is
   not on the table.

5. **State the iOS/Android split plainly.** Confirm from the code (not from memory) what
   `isFullscreenAvailable` will return on iPhone Safari, and therefore what a player on an
   iPhone sees today where the fullscreen button would be.

## Do not

- Do not modify any file under `app/`, `components/`, or `lib/`. This phase is read-only
  with respect to product code.
- Do not run a headless browser and report visual measurements from it as fact. See §4 of
  `docs/bingo-fullscreen-pwa-plan.md` — a headless browser has no browser chrome, so it
  cannot measure the thing being measured. Reason from the CSS and the code. If you do run
  one, label its numbers explicitly as "layout-only, chrome absent."

## Deliverable

Write `docs/bingo-fullscreen-pwa-phase0-findings.md` containing the pixel budget table, the
URL-bar collapse assessment, and a one-paragraph recommendation to Phase 1 naming the two or
three highest-yield reclamations in priority order.

## Run-log entry must include

The single highest-yield finding, the reclaimable-pixel estimate, and an explicit
"Phase 1 should start with X" instruction.
