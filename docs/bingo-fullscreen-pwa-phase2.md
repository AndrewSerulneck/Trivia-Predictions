# Phase 2 — Layer B: near-automatic one-tap fullscreen

**Model:** sonnet / high.

Make the existing fullscreen toggle feel automatic on the platforms whose Fullscreen API
actually works (Android Chrome, iPad, desktop), and stop showing iPhone players a control
that can never succeed.

## Background you must not re-derive

`components/bingo/SportsBingoHome.tsx` already contains the whole mechanism:
`isFullscreenSupported`, `hasCheckedFullscreenSupport`, `isLandscapeFullscreen`,
`fullscreenFeedback`, `showFullscreenHint`, `toggleLandscapeFullscreen`, and the
`fullscreenchange` / `webkitfullscreenchange` listeners. **Extend it. Do not rewrite it and
do not add a second fullscreen abstraction.**

Two constraints are settled (master plan §1) and must not be re-litigated:
- `orientationchange` is **not** a user gesture, so calling `requestFullscreen()` from it
  will be rejected. Auto-fullscreen-on-rotate is impossible by spec.
- iPhone Safari has no `Element.requestFullscreen` at all.

## Do

1. **Arm fullscreen on the next touch after rotating.** When `isLandscapeGameView` becomes
   true and `isFullscreenSupported` is true and we are not already fullscreen, attach a
   one-shot `pointerdown`/`touchend` listener on the landscape shell that calls
   `toggleLandscapeFullscreen()`. The player rotates, taps once anywhere, and is full screen —
   which is as close to automatic as the platform permits.
   - Must be one-shot: remove the listener after it fires, on unmount, and when leaving
     landscape.
   - Must not swallow the tap's real action. A tap that lands on a Bingo square, a nav arrow,
     or a tab must still do its job — request fullscreen *in addition*, do not
     `preventDefault()` and do not stop propagation.
   - Must not re-arm after the player deliberately exits fullscreen. Track that they exited
     by choice (via the `fullscreenchange` listener while still in landscape) and respect it
     for the remainder of the session. Nagging is worse than a small board.

2. **Replace the hint copy accordingly.** The existing `showFullscreenHint` one-time coach
   mark (`FULLSCREEN_HINT_STORAGE_KEY`) should now say something like "Tap anywhere for full
   screen" rather than pointing at the button. Keep the button as the explicit affordance and
   keep the localStorage one-time-only behavior and the 7s auto-dismiss.

3. **Auto-exit fullscreen on return to portrait.** There is already an effect at roughly
   `SportsBingoHome.tsx:1046` handling `isLandscapeGameView === false && isLandscapeFullscreen`.
   Confirm it exits cleanly and does not fight the `fullscreenchange` listener.

4. **Stop showing iPhone players a dead control.** Today when `hasCheckedFullscreenSupport &&
   !isFullscreenSupported` the UI renders "Fullscreen unavailable in this browser." — which on
   an iPhone is permanent, unactionable, and just advertises a missing feature. Replace it:
   - If Phase 5's install flow exists by the time a player sees this, this is the natural
     place to eventually surface "Add to Home Screen for full screen" — but that copy is
     **flag-gated by `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED` and ships OFF** (master plan §2).
   - With the flag off, render **nothing at all** in that slot. Silence beats an apology.
   - Reclaim the space the unavailable-label occupied — see
     `.tp-bingo-landscape-fullscreen-unavailable` in `app/globals.css`.

## Do not

- Do not attempt `screen.orientation.lock()`. It is unsupported on iOS, requires fullscreen
  on Android, and is not what the user asked for.
- Do not call `requestFullscreen()` from an `orientationchange` or `resize` handler.
- Do not remove the manual button.

## Verify

`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`.

## Run-log entry must include

The exact event used to arm the one-shot listener, how "user deliberately exited" is tracked,
and confirmation that the armed tap does not swallow square/nav taps — Phase 6 must put all
three on the device checklist.
