# Phase 3 — Desktop/Mobile chooser + mobile shell

## A. The chooser

After successful admin login, show an interstitial with two buttons:
**Desktop** and **Mobile**. Remember the choice in localStorage so it is not
asked on every login.

Requirements:
- The choice must be **overridable from inside either shell** via a visible
  control. A wrong tap must never be a trap.
- Deep links to a specific section bypass the chooser.
- The chooser is a *choice*, not viewport auto-detection — an admin on an iPad
  may want desktop, an admin on a laptop may want the mobile flow. Do not
  silently override the stored preference based on screen size.

## B. The mobile shell

A separate mobile-first shell exposing **exactly three** sections:

- **Venues** (`venue-manage`)
- **Game Settings** (`game-settings`)
- **Partner Billing** (`partner-billing`)

This is a hard allowlist. New sections must not appear on mobile unless
deliberately added — implement it so that adding a section to
`ADMIN_SECTION_OPTIONS` does not leak it onto mobile. Everything else stays
desktop-only and unreachable from this shell.

Share the existing auth, data fetching and API layer — do not fork logic. This
is a new presentation of the same sections.

## C. Establish the mobile conventions

Later phases follow whatever you set here, so make it explicit in the run log:
- card lists instead of horizontal-scroll tables
- bottom sheets instead of centered modals
- minimum 44px tap targets
- single-column forms
- safe-area insets respected

## Constraints
Tailwind only. No PWA install promotion and no service worker on any admin
surface (CLAUDE.md) — this is an ordinary responsive website.

## Verify
`npm run build`, `npx tsc --noEmit`, `npm test`. Both shells reachable; mode
switch works in both directions; the three-section allowlist holds.
