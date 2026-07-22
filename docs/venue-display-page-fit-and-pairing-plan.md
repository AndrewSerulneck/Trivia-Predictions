# Venue Display Page — Fit & Pairing Plan

Owner-facing bugs/changes on the Partner Dashboard's Venue Display page
(`app/owner/display/page.tsx`) and the TV screen it previews/links to
(`app/venue/[venueId]/screen/page.tsx`, `components/venue-screen/*`).

## Background / current architecture

- **`/owner/display`** (mobile Partner Dashboard page): has a scaled iframe
  **Preview**, an "Open full screen" link, a **"Link a TV"** code-entry form,
  and a collapsed **"Manual setup"** section with a QR code (encodes the
  *display URL*) + wording that needs to change.
- **`/tv`** (`app/tv/page.tsx`): what a TV browser loads. Already shows a big
  pairing code **and a QR that deep-links to `/owner/display?code=XXXX`**
  (see `claimDeepLink` in that file). So a partner can already point their
  phone's native camera app at the TV's QR and land pre-filled on the claim
  form — no in-app scanner needed.
- **`/venue/[venueId]/screen`**: the actual TV screen, authored for a 16:9
  viewport. Rendered both in the dashboard's preview iframe and via "Open
  full screen."
- Preview scaling today (`ScaledPreview` in `app/owner/display/page.tsx`)
  scales by **width only** (`el.clientWidth / 1280`), so tall/narrow preview
  boxes can clip the bottom of the screen.
- Pairing claim flow already exists end-to-end: `/api/owner/tv-pair/claim`
  (owner-authed, venue-ownership checked) + `claimPairingCode` in
  `lib/tvPairing.ts`. No backend changes needed for this plan.

## Key decisions already made (do not re-litigate)

1. **Fit-to-viewport should always be on, unconditionally** — no `?fit=1`
   flag, no "TV mode" vs "phone mode" branching. A browser viewport always
   equals the actual screen size, so scale-to-fit is self-adapting: a true
   16:9 TV computes scale = 1.0 (pixel-identical to today, zero
   letterboxing); any other aspect ratio (portrait phone, odd laptop window)
   letterboxes automatically. This is strictly safer than an opt-in mode —
   there is no way to detect "is this a TV" reliably, and there's no need to.
2. **No new npm dependencies for QR scanning.** Do not add `jsQR`,
   `qr-scanner`, or similar. The native camera app already handles scanning
   the TV's QR (it deep-links `/owner/display?code=...`), so no in-app
   `BarcodeDetector`/`getUserMedia` scanner is being built. Phase 5 is
   **removal + copy fix only**, not a new scanning feature.
3. Preview and fullscreen must **letterbox on black**, not stretch/distort
   the 16:9 content.

## Phases

### Phase 1 — Preview always fits fully in its box
**Problem:** `ScaledPreview` scales only by width, so short/wide preview
containers can clip the bottom of the 16:9 iframe.
**Fix:** Compute `scale = Math.min(containerWidth / 1280, containerHeight / 720)`
and center the scaled iframe in the box (still on the existing black
background). If the container's height isn't naturally constrained (it's
currently driven by `aspectRatio`), decide whether to keep a fixed aspect
container (simplest — scale-by-width already equals scale-by-height in that
case) or allow a fixed-height box and letterbox within it. Re-check which
change is actually needed once looking at current layout — the aspect-ratio
container may make width-only scaling already correct, in which case the
real bug may be elsewhere (e.g. viewport clipping the box itself on short
screens). Investigate before assuming the fix is purely in the scale math.
**Files:** `app/owner/display/page.tsx` (`ScaledPreview`, `PREVIEW_SOURCE_WIDTH/HEIGHT`).
**Model:** Sonnet · **Effort:** Low (~30 min)

### Phase 2 — "Open full screen" fits the actual device (always-on fit-to-viewport)
**Problem:** `/venue/[venueId]/screen` assumes a TV-like 16:9 canvas with no
responsive fit; on a phone/laptop viewport it overflows/clips.
**Fix:** Add a viewport-fit wrapper around the screen's render (likely in
`app/venue/[venueId]/screen/page.tsx` or a new wrapper inside
`VenueScreenClient.tsx`) that measures `window.innerWidth/innerHeight`,
computes `scale = min(vw/1280, vh/720)`, and renders the fixed 1280×720
canvas transform-scaled and centered on a black backdrop — same technique as
Phase 1's preview, applied to the real route. This applies unconditionally
(no flag) per the decision above. On an actual 16:9 TV this resolves to
scale ≈ 1 with no visible change.
**Files:** `app/venue/[venueId]/screen/page.tsx`, `components/venue-screen/VenueScreenClient.tsx`.
**Model:** Opus · **Effort:** Medium — this touches the shared real-TV render path; verify with the `verify` skill (or manual browser check) that a 16:9 viewport still renders pixel-identical before/after.

**Status: DONE (2026-07-22).** Added a `ViewportFitCanvas` wrapper in
`VenueScreenClient.tsx` (no changes needed to `page.tsx`): it measures
`window.innerWidth/innerHeight` on mount + on `resize`/`orientationchange`,
computes `scale = min(vw/1280, vh/720)`, and renders a fixed 1280×720 canvas
(`VENUE_SCREEN_CANVAS_WIDTH/HEIGHT`) transform-scaled + flex-centered on a black
backdrop. The three former viewport-unit sizings on the render root
(`min-h-[100svh] w-screen` → `h-full w-full`, and two inner `min-h-[100svh]` →
`h-full`) now fill the canvas instead of the raw viewport. Every `h-full`
descendant (all `Tv*` component roots) resolves against a **definite** 720px
canvas — cleaner than the prior min-height chain. Default `scale = 1` pre-measure
so SSR/first client render match (no hydration mismatch). The `orientationchange`
listener means Phase 3 largely falls out already. Verified: `tsc`/ESLint clean,
venue-screen tests pass (9/9), SSR emits the wrapper at `scale(1)`, no child uses
conflicting viewport units. Added Playwright as a devDependency and ran an
automated multi-viewport check against the real route (1280×720, 1920×1080,
390×844 portrait, 844×390 landscape, 1366×900 odd laptop): the 16:9 viewports
compute an exact scale (1.0 / 1.5) with the canvas filling the viewport
pixel-for-pixel and zero letterboxing; every non-16:9 viewport centers the same
content on black with correct letterbox math (`min(vw/1280, vh/720)`).
Screenshots confirm real content renders correctly scaled/centered in both
cases.

### Phase 3 — Mobile orientation-aware sizing
**Problem/goal:** Portrait phone should keep the small letterboxed view;
rotating to landscape should expand to fill the mobile viewport.
**Fix:** This should fall out of Phase 2's always-fit-to-viewport approach
automatically (rotating the phone changes `innerWidth`/`innerHeight`, which
the scale calc already reacts to via resize/orientation listeners). Confirm
the resize listener also fires on `orientationchange` in the browsers that
matter (some browsers fire `resize` reliably, others need an explicit
`orientationchange` listener too — add one if needed for iOS Safari).
**Files:** same wrapper as Phase 2.
**Model:** Sonnet · **Effort:** Low (verification + possible listener add)

**Status: DONE (2026-07-22).** No code changes needed — fell out of Phase 2 as
predicted. The `orientationchange` listener was already added defensively
alongside `resize` in `ViewportFitCanvas` during Phase 2 (Playwright has no way
to dispatch a real `orientationchange` event, so it can't be used to prove that
listener specifically fires on iOS Safari, but keeping it costs nothing and is
the documented reliable fallback). Verified with Playwright: loaded the venue
screen at a portrait viewport (390×844, scale 0.305, small letterboxed view),
then resized the *same* page in-session to landscape (844×390) — scale
recomputed to 0.542 filling the wider viewport with no reload, then rotating
back to portrait returned to the identical original scale/position. Confirms
the resize listener alone (which Chromium does fire on viewport change) drives
correct in-session recomputation — the core of the orientation-aware behavior
this phase asked for.

### Phase 4 — "Expand" button forces landscape fullscreen from portrait
**Goal:** A button that, even while the phone is held vertically, expands
to the full landscape TV view.
**Fix:** Use the Fullscreen API (`element.requestFullscreen()`) plus
`screen.orientation.lock("landscape")` where supported. iOS Safari blocks
programmatic orientation lock even in fullscreen — add a CSS-rotate
fallback (rotate the canvas 90° and swap width/height in the scale calc)
for browsers where `screen.orientation.lock` throws/is unavailable.
**Files:** `app/owner/display/page.tsx` (button) + the fullscreen wrapper from Phase 2.
**Model:** Opus · **Effort:** Medium (cross-browser fullscreen/orientation-lock quirks, esp. iOS Safari)

**Status: DONE (2026-07-22).** Added a self-contained `FullscreenExpander`
component to `app/owner/display/page.tsx` and an "Expand" link in the Preview
header (next to "Open full screen"). No change to `VenueScreenClient.tsx` was
needed — Phase 2's `ViewportFitCanvas` is leveraged as-is by embedding the venue
screen in a full-size iframe:
- **Android Chrome (preferred path):** the wrapper `<div>` enters real
  fullscreen (`requestFullscreen`, with a `webkitRequestFullscreen` fallback),
  then `screen.orientation.lock("landscape")`. The iframe fills 100%×100%, its
  own window becomes landscape, and `ViewportFitCanvas` inside scales the
  1280×720 canvas to fit with no letterboxing.
- **iOS Safari (rotate fallback):** `requestFullscreen` on a `<div>` and
  `orientation.lock` both throw/are absent; each failure sets `rotateFallback`,
  and the overlay stays a `fixed inset-0 z-[60]` black cover. The iframe is
  CSS-rotated 90° with width/height swapped (`width:100vh; height:100vw;
  transform: rotate(90deg) translate(0,-100%)`), so a vertically-held phone
  shows the landscape TV view. `ViewportFitCanvas` measures the (now landscape)
  iframe window and scales correctly. `maxWidth:none` overrides the global
  `iframe { max-width:100% }` reset (same reason as `ScaledPreview`).
- Keeping the screen in an iframe keeps the tap's user-gesture in the dashboard
  document (Fullscreen API requires transient activation). `handleExpand` awaits
  one `requestAnimationFrame` after un-hiding the overlay so the element has left
  `display:none` before the request (which the API otherwise refuses), still well
  inside the activation window.
- Teardown: a `fullscreenchange`/`webkitfullscreenchange` listener closes the
  overlay + unlocks orientation when the user exits real fullscreen
  (Esc/system-back/swipe); the iOS rotate path (no real fullscreen, no event) is
  closed via the in-overlay "Close ✕" button.
- Types stay off `any`: narrow local `WebkitFullscreen*` extension types for the
  vendor-prefixed surfaces, and `as unknown as { lock?/unlock? }` casts for the
  orientation-lock methods lib.dom doesn't type.
- Verified: `tsc --noEmit` clean; `npm run lint` reports no new problems in this
  file (all remaining errors are pre-existing, in unrelated files). Real
  fullscreen + orientation-lock behavior is inherently device-specific and can't
  be exercised headlessly (no transient activation / no OS orientation control in
  Playwright), so the cross-browser paths need a real Android + iOS device check
  before ship.

### Phase 5 — Remove the useless mobile QR (no new scanner)
**Problem:** The QR in "Manual setup" encodes the *display URL*, meant to be
scanned by a TV — but TVs don't have cameras scanning for QR codes. It's
dead weight on the mobile dashboard.
**Fix:** Delete the QR block from the "Manual setup" section of
`app/owner/display/page.tsx` (the `<QRCodeSVG value={displayUrl} .../>`
block and its `qrcode.react` import if no longer used elsewhere in that
file). Keep the Copy-URL row as the manual fallback. Do **not** add any new
in-app camera/QR-scanning feature — the TV's own QR at `/tv` (which already
deep-links to `/owner/display?code=...`) is scanned via the phone's native
camera app, which already works today and needs no code change.
**Files:** `app/owner/display/page.tsx` only. No changes needed to `app/tv/page.tsx`.
**Model:** Sonnet · **Effort:** Low

### Phase 6 — Fix "Manual setup" wording
**Fix:** Replace the current sentence:
> "Scan this QR code (or type the URL) directly into the TV's browser. No
> camera on the TV? Open the link on your phone first to confirm it looks
> right, then type it into the TV browser."

with:
> "Type this URL into the browser on your TV, or type this URL into a
> device that is paired with your TV."

**Files:** `app/owner/display/page.tsx` (the paragraph directly below the
Copy-URL row in "Manual setup"). Fold this into the same edit as Phase 5
since both touch the same block.
**Model:** Sonnet · **Effort:** Trivial (~5 min)

## Suggested execution order

1. Phase 1 (safe, isolated to the dashboard page)
2. Phases 5 + 6 together (safe, isolated to the dashboard page, same block)
3. Phase 2 (touches the shared TV render path — verify carefully before merging)
4. Phase 3 (builds directly on Phase 2)
5. Phase 4 (builds directly on Phase 2/3)

Phases 1, 5, and 6 have zero risk to the real TV render path and can be done
first/in any order. Phases 2→3→4 are a dependent chain and should be done in
order, with a real-browser check after Phase 2 confirming a 16:9 viewport
still renders identically to today.
