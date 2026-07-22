# Venue Display "Expand" Button — Review Fix Plan

Follow-up to Phase 4 of `docs/venue-display-page-fit-and-pairing-plan.md`
(the "Expand" landscape-fullscreen button on `/owner/display`). A code review
(`/code-review`, high effort) found 6 issues in `FullscreenExpander`
(`app/owner/display/page.tsx`). This plan groups them into phases by how
tightly coupled the fixes are and orders by severity.

## Findings being addressed

1. **Rotate fallback fires on already-landscape screens** (correctness,
   highest severity) — `rotateFallback` is set whenever
   `screen.orientation.lock()` is missing or rejects, with no check that the
   device is actually portrait. On desktop Chrome or any Android without
   orientation-lock support, real fullscreen succeeds in landscape, `lock()`
   rejects, and the content gets needlessly rotated 90° into a sideways
   display.
2. **iOS rotate math uses `100vh`/`100vw`, not the fixed overlay's actual
   visible size** (correctness) — on iOS Safari (the exact browser this
   fallback targets), `100vh` includes the collapsible-toolbar space, which
   doesn't match the `fixed inset-0` overlay's real visible viewport, causing
   clipping/off-center content.
3. **`fullscreenchange` handler closes/unlocks globally** (correctness) —
   fires whenever *any* element's fullscreen exits (not just this
   component's), and unconditionally calls `screen.orientation.unlock()`,
   which can release an unrelated lock held elsewhere on the page.
4. **Close button isn't rotated with the content** (correctness/UX, minor) —
   in the rotate-fallback view the Close button stays in unrotated portrait
   coordinates, landing in an awkward corner relative to the rotated content.
5. **Inline `style={{}}` outside `components/venue-screen/*`** (conventions,
   low) — CLAUDE.md scopes the inline-style exception to the venue-screen TV
   surface only; this file is `app/owner/display/`. Note `ScaledPreview` in
   the same file already does this for dynamic values, so this is a
   consistency question, not a new pattern.
6. **Expanded iframe double-polls `/api/venue-screen/state`** (efficiency,
   low) — the preview iframe (`ScaledPreview`) stays mounted behind the
   overlay and keeps polling while the new fullscreen iframe polls
   independently, doubling load on that venue's state endpoint while Expand
   is open.

## Phases

### Phase A — Fix the rotate-fallback trigger + sizing (findings #1, #2)
**Why bundled:** both are bugs in the same decision (`handleExpand`'s
orientation-lock branch) and the same render (the `rotateFallback` style
block) — fixing #1 without touching #2 would still ship broken sizing on the
one platform (iOS) that actually takes this path.

**Fix:**
- Only set `rotateFallback` when the device is genuinely portrait at the
  moment of the check — read `window.innerWidth < window.innerHeight` (or
  `screen.orientation.type.startsWith("portrait")` if available) before
  falling back, so a desktop/Android screen that's already landscape and
  already fullscreen never gets rotated.
- Replace the `100vh`/`100vw` sizing in the rotated branch with `100dvh`/
  `100dvw` (dynamic viewport units), or measure `fsRef.current`'s actual
  bounding box via `ResizeObserver`/`getBoundingClientRect` and size the
  iframe from that instead of viewport units.
- Re-verify the rotate transform math (`rotate(90deg) translate(0, -100%)`)
  still centers correctly once the width/height source changes.

**Files:** `app/owner/display/page.tsx` (`FullscreenExpander`).
**Model:** Opus · **Effort:** Medium — genuine cross-browser viewport/orientation
subtlety; needs careful reasoning about iOS Safari's dvh vs vh behavior and
about when `lock()` legitimately fails vs. when the device is already
landscape. Verify with the `verify` skill or manual check across a real
portrait phone, a real Android device, and a desktop browser if available.

### Phase B — Scope the fullscreenchange teardown to this component (finding #3)
**Fix:** Track whether *this* component's `fsRef` element is the one
currently in fullscreen (e.g. a ref/flag set in `handleExpand` after a
successful `requestFullscreen()`, cleared in the handler). Only call `close()`
and `orientation.unlock()` when that flag was true and the new
`fullscreenElement`/`webkitFullscreenElement` no longer matches `fsRef`
(instead of "no fullscreen element exists anywhere"). This prevents this
component from reacting to, or unlocking orientation for, fullscreen state
changes it didn't cause.

**Files:** `app/owner/display/page.tsx` (`FullscreenExpander`'s `useEffect`).
**Model:** Sonnet · **Effort:** Low-medium — localized logic fix, no new
browser-API surface, but worth a careful re-read of the effect's closure
variables since `close`/`onFullscreenChange` capture component state.

### Phase C — Rotate the Close button with the content (finding #4)
**Fix:** When `rotateFallback` is active, apply the same `rotate(90deg)`
transform (with appropriate origin/position adjustment) to the Close button
so it visually matches the rotated content's orientation and sits in a
sensible corner from the user's (rotated) point of view.

**Files:** `app/owner/display/page.tsx` (`FullscreenExpander`'s Close button).
**Model:** Sonnet · **Effort:** Low — CSS-only, no new logic.

### Phase D — Optional cleanup: inline-style convention + double-poll (findings #5, #6)
**Fix (5):** Replace the static, non-dynamic parts of the iframe's `style`
(the non-rotate branch's `width: "100%", height: "100%"`) with Tailwind
`h-full w-full`, keeping inline `style` only for the genuinely dynamic
rotate-transform branch that Tailwind can't express. Match the existing
`ScaledPreview` precedent in this file rather than removing inline style
entirely.
**Fix (6):** When `expanded` is true, stop polling in the background
`ScaledPreview` iframe (e.g. conditionally unmount it, or pause via a prop)
so only one iframe polls `/api/venue-screen/state` at a time.

**Files:** `app/owner/display/page.tsx` (`FullscreenExpander` styles;
`ScaledPreview` / parent state for the poll-pause).
**Model:** Sonnet · **Effort:** Low — mechanical style swap + a conditional
mount/prop; lowest priority of the four phases, safe to defer or skip if
time-constrained.

## Suggested execution order

1. **Phase A** first — highest-severity correctness bugs, and both hit real
   target devices (desktop/Android for #1, iOS for #2).
2. **Phase B** next — real correctness bug but narrower blast radius (only
   matters if something else on the page also uses Fullscreen/orientation
   APIs, which nothing else does today — still worth fixing defensively).
3. **Phase C** — cosmetic but cheap, bundle with B's PR if convenient.
4. **Phase D** — optional polish; can be skipped or deferred without risk.

Phases A and B should each get the real-device verification called for in
Phase 4 of the original plan (Playwright can't exercise transient activation
or OS-level orientation, so these need a real portrait phone + a real
Android/desktop check before ship).
