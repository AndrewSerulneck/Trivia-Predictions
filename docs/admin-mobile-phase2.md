# Phase 2 — Structural shell fixes

Mechanical fixes to `components/admin/AdminShell.tsx`. Benefits desktop too.
No design decisions here.

## A. CSS breakpoints instead of JS measurement

`isMobile` is `useState(false)` plus a resize effect, so every phone load
renders the desktop sidebar first and then swaps — layout flash, and SSR-wrong.
Replace with Tailwind `md:` classes so the correct layout is in the first
paint. Remove the resize listener and the `isMobile` state once nothing needs
them. The drawer's open/closed state stays as React state — only the
*breakpoint* moves to CSS.

## B. Viewport units

The shell uses `h-screen max-h-screen` + `overflow-hidden`. Mobile Safari's
dynamic toolbar makes `100vh` wrong and this clips. Move to `min-h-[100svh]`.

**CAUTION — read this before touching the CSS.** This is the same pattern
behind a previous mobile blackout regression (commit 35115fc, where a `100svh`
clamp leaked from Category Blitz onto five game routes). Known gotcha from that
fix: `to { transform: none }` does NOT clear a containing block under fill-mode
`both`/`forwards` — the identity matrix persists; use `backwards`. And
`will-change: transform` creates a containing block on its own. Keep the change
scoped to the admin shell; do not let it leak into shared styles.

## C. Code-split the sections

`AdminShell` statically imports all remaining sections (~17k lines before Phase
0's cuts). Convert them to `next/dynamic` so a phone loads one section, not all
of them. Keep `SectionErrorBoundary` behavior intact and give each a sensible
loading state.

## Verify
`npm run build`, `npm test`, `npm run lint`. Confirm the admin bundle shrinks.
Check the shell at a phone width in a real browser — a build passing is NOT
sufficient evidence for B.
