# Phase 6 — Device verification

## Hard limit on what you can conclude

Per CLAUDE.md: **headless browsers cannot verify this surface.** They have no
browser chrome, so a headless pass reports success on bugs that are still
there — dynamic-toolbar clipping, safe-area insets, keyboard behavior. Do not
claim any of those verified from a headless run.

Your job is to take it as far as automation honestly can, then write a
checklist only Andrew can close on a real phone.

## A. Automated pass

Run the full gate: `npm run build`, `npx tsc --noEmit`, `npm run lint`,
`npm test`. Also run the named tripwires if anything in their scope was
touched: `npm run test:god-mode-join`, `npm run test:pwa-contract`.

Drive the activate-a-venue flow with Playwright at phone viewport against a
throwaway venue, end to end, then clean the venue up. Report what actually
passed, with output — not a summary of intent.

## B. Write the device checklist

Create `docs/admin-mobile-device-checklist.md` with concrete, checkable items
for a real iPhone and a real Android:

- address autocomplete: keyboard type, autocorrect interference, whether the
  suggestion list is reachable above the keyboard
- safe-area insets: notch and home indicator, portrait and landscape
- the `min-h-[100svh]` shell under Safari's dynamic toolbar — scroll up and
  down and confirm nothing clips (this is the Phase 2 regression risk)
- the optional map pin adjustment on a touch screen
- bottom sheets: dismissal, scroll containment, no body-scroll bleed
- the desktop/mobile mode switch in both directions
- one full real-world activation

## C. Report honestly

State plainly what is verified, what is unverified, and what is blocked. If
something failed, say so with the output. Do not report the phase complete on
the strength of a headless pass — the automated portion completing is not the
same as the surface being verified.
