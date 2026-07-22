# Venue TV Display — Content Fit Plan

The TV screen (`/venue/[venueId]/screen`) clips the majority of its own content.
This is **not** a Partner Dashboard preview bug — the preview and the "Expand"
button are faithfully mirroring a TV screen that is itself broken at real TV
resolution.

Supersedes the "preview looks wrong" framing in
`docs/venue-display-page-fit-and-pairing-plan.md` Phase 1.

## Evidence (measured 2026-07-22, live code at commit `65897c9`)

Rendered `/venue/venue-pacific-street/screen` during an **active Category Blitz
round** and measured the natural (unclipped) extent of the content inside the
fixed canvas:

| Canvas size | Natural content size | Fits? |
| --- | --- | --- |
| **1280×720** (current) | 2093 × 1182 | ✗ both axes |
| 1920×1080 | 2093 × 1182 | ✗ both axes |
| 2560×1440 | fits | ✓ |

At the shipped 1280×720 canvas the active-round layout needs **~1.64× the width
and ~1.64× the height** it is given. `overflow-hidden` silently clips the rest:
only **2 of 12 categories** and roughly half the hero letter tile are visible.
This reproduces at native 1280×720 — i.e. **real TVs are affected**, not just the
dashboard preview.

Note the natural content ratio: 2093 / 1182 = **1.77 ≈ 16:9**. The design *is*
16:9 — it is simply authored for a ~2100px-wide design space and rendered into a
1280px one.

## Root cause

- `ViewportFitCanvas` (`components/venue-screen/VenueScreenClient.tsx:46`) pins a
  fixed **1280×720** canvas (`VENUE_SCREEN_CANVAS_WIDTH/HEIGHT`, lines 38–39) and
  scales that canvas to the device viewport. That part works correctly and should
  be kept.
- The `Tv*` panel components are authored in **hard-coded pixels sized for a much
  larger canvas**. In `TvLetterReveal.tsx` alone: `fontSize: 340` hero glyph, a
  460×460 letter tile, `fontSize: 76` headline, `padding: "54px 96px 56px"`,
  `gap: 72`. A survey of the other panels shows the same pattern
  (`TvIdleAttract` max `fontSize: 168`, `TvQuestionReveal` 132, `TvGoLiveTakeover`
  148, `TvBlitzResults` / `TvRoundBreak` 112, `TvFinalStandings` 84).
- Net effect: content authored at ~2100px wide is clipped inside a 1280px canvas.

**Important negative result:** simply enlarging the canvas to 1920×1080 does *not*
fix it — content still overflows both axes at that size. Any "just bump the
constants" fix must target ≥ ~2100px wide, and even then is fragile (see below).

**Fragility to come:** the widest element is the category `grid flex-1`, whose
natural width is driven by the **longest category name's min-content width**
(fixed font size + non-wrapping cells). So the required canvas width is *content
dependent* — a longer category name than today's would overflow again even after
a one-time constant bump. This is why Phase 2 (not Phase 1) is the durable fix.

## Key decisions (do not re-litigate)

1. **Keep `ViewportFitCanvas`.** The canvas→viewport scale-to-fit layer is
   correct and already verified. This plan changes what goes *inside* it.
2. **The canvas stays a single fixed 16:9 design resolution.** Do not introduce
   per-device breakpoints or a "phone layout" for the TV screen. One design, one
   canvas, scaled.
3. **Letterboxing on black is acceptable; clipping is not.** Content must never
   be cut off, at any viewport.
4. **The dashboard Preview and Expand need no fix for this.** They were verified
   correct on 2026-07-22 and will inherit the fix automatically.

## Phases

### Phase 0 — Audit natural content size across every screen state
**Why first:** the 2093×1182 figure is measured for *one* state (Category Blitz
active round). The canvas must accommodate the **worst case** across all modes,
or Phase 1 fixes one screen and leaves others clipped.

**Do:** Drive the venue screen through every state and record natural content
extent for each: Category Blitz (letter reveal / results / intermission), Live
Trivia (question / answer reveal / round break / final standings), idle attract,
pairing display, and the go-live takeover. Force states via the server-only
engine helpers (see the `verify` skill's seeding notes) rather than waiting on
real cron cycles. Also test with deliberately long content (longest category
name in `data/category-blitz/category-pool.json`, a long venue name, a long
trivia question) since natural width is content-driven.

**Output:** a table of `state → natural W×H`, and the single worst-case width.
**Files:** none (measurement only) + a throwaway script.
**Model:** Sonnet · **Effort:** Medium — mostly mechanical, but needs the state

**Status: DONE (2026-07-22).** Used a different (more reliable) technique than
originally proposed: rather than seeding real game rows and waiting on cron,
intercepted the client's `/api/venue-screen/state` poll via Playwright
(`page.route`) and fed it fabricated `VenueScreenState` fixtures matching every
`phase` in the type — including two adversarial content tests (the 12 longest
category names in the pool; a long venue name). Navigated with `?mode=` set to
match each fixture's top-level mode so the server's own debug branch gives a
fast initial poll interval (1–4s vs. idle's fixed 20s), then let the intercepted
fixture land and measured the canvas at native **1280×720**. Verified each
fixture actually rendered (not stale debug content) via a text marker check
before trusting the measurement — this caught and required fixing a false
negative (`TvQuestionReveal` splits its question into per-word `<span>`s for a
staggered reveal animation, so `innerText` has no space characters between
words; the check now strips whitespace before comparing).

**Results — natural content extent vs. 1280×720 canvas:**

| State | Natural W×H | Overflow |
| --- | --- | --- |
| idle attract | 1284 × 726 | negligible (4–6px, not visibly clipped) |
| live-trivia: question | 1280 × 1036 | **Y: +316px** |
| live-trivia: reveal (answer) | 1280 × 1190 | **Y: +470px — the correct-answer text is completely below the fold, invisible** |
| live-trivia: intermission (round break) | 1280 × 825 | **Y: +105px** |
| live-trivia: final standings | 1358 × 1000 | **X: +78px, Y: +280px — a long username clips off the right edge; 3rd-place podium clips at the bottom** |
| category-blitz: round (typical 12 categories) | 1280 × 1182 | **Y: +462px** (matches the originally-reported 2093×1182 for width once categories are long enough to wrap two lines — see next row) |
| category-blitz: round (12 **longest** real category names) | 2194 × 1182 | **X: +914px, Y: +462px — category text itself is cut off mid-word, not just extra items hidden** |
| category-blitz: intermission/results | 1280 × 720 | **none — the only state that already fits** |
| category-blitz: round, long venue name | 1280 × 1182 | Y: +462px (venue name itself didn't overflow at this length; height overflow is the pre-existing round-layout issue) |

**Worst case:** width **2194px** (category-blitz round, longest real category
names), height **1190px** (live-trivia reveal). A single fixed 16:9 canvas
clearing both with the recommended headroom below satisfies every state.

**Scope correction:** the TV pairing display (`TvPairingDisplay`, on `/tv`) was
excluded — it is a separate route with its own layout, never rendered inside
`ViewportFitCanvas`, so it's out of scope for this plan. `TvGoLiveTakeover` (the
"we're live" overlay) was not separately fixtured — it's a transient, purely
celebratory overlay with short fixed text, not a candidate for the kind of
per-state variable-length content that's overflowing elsewhere; revisit only if
Phase 2's regression guard flags it.

**Revises Phase 1 below:** the ~2133×1200 candidate size floated before this
audit is too small — it doesn't clear the 2194px worst-case width. Phase 1's
target should be recalculated from the real 2194×1190 figures above.
**Model:** Sonnet · **Effort:** Medium — mostly mechanical, but needs the state
seeding to be driven correctly.

### Phase 1 — Raise the canvas to the real design resolution (immediate unblock)
**Fix:** Set `VENUE_SCREEN_CANVAS_WIDTH/HEIGHT` to a 16:9 size that clears the
Phase 0 worst case (2194 × 1190, category-blitz round with the longest real
category names) with headroom. **2304×1296** is the recommended candidate: it's
an exact 16:9 ratio, clears 2194 width with ~5% headroom and 1190 height with
~9% headroom, and both dimensions are multiples of 16 (clean scale-factor math
against common TV resolutions — 2304/1920 = 1.2, 1296/1080 = 1.2). Because
`ViewportFitCanvas` scales the canvas down to the viewport, a real 1920×1080 TV
renders at scale ≈ 0.833 with **all** content visible — strictly better than
today's clipping, where roughly a third of the round-summary content and the
entire correct-answer reveal are invisible.

**Watch for:** text becomes ~17% smaller on a 1080p TV than authored (scale
0.833 vs. today's notional 1.0 baseline). Verify legibility at TV viewing
distance for every Phase 0 state, especially `live-trivia:reveal` and
`category-blitz:round` where the overflow was largest; if anything reads too
small, that's a signal for Phase 2's rebalancing rather than a reason to shrink
the canvas back (shrinking it re-introduces the clipping this phase exists to
fix).

**Files:** `components/venue-screen/VenueScreenClient.tsx` (two constants).
**Model:** Sonnet · **Effort:** Low — a two-constant change, but must be
verified with real screenshots across the Phase 0 state matrix, not just typecheck.

**Status: DONE (2026-07-22).** Set `VENUE_SCREEN_CANVAS_WIDTH/HEIGHT` to
2304×1296 as above. `tsc --noEmit` and `npm run lint` both clean. Re-ran the
Phase 0 fixture harness at native 2304×1296 (same 9 fixtures, same
marker-verified interception technique) — every state now measures
`naturalBottom/naturalRight` exactly equal to the canvas size (i.e. content is
bounded by the full-bleed background wrapper, not clipped by it). Screenshotted
and visually confirmed the three worst Phase 0 cases:
- `live-trivia:reveal` — "The Nile River" correct-answer text, previously
  entirely below the fold, now fully visible with room to spare.
- `live-trivia:final` — full 1-2-3 podium and all six ranked rows visible,
  including the long username ("AnotherLongUsernameHere") that previously
  clipped off the right edge, and rank 6 ("Riley") that was previously cut off.
- `category-blitz:round` with the 12 longest real category names — all 12
  categories fully visible with complete (non-truncated) text, the full letter
  tile, and the timer ring. This is the exact reproduction of the originally
  reported bug screenshot, now fixed.

`idle` also re-confirmed clean at the new resolution (screenshot: full sponsor
footer visible, no clipping) — the isolated 3–8px "overflow" the harness
reported for `idle` both before and after resize turned out to be the
measurement walk picking up `TvIdleAttract`'s own full-bleed background
wrapper rather than genuine content overflow, and is not visible in any
screenshot at either canvas size; not a real bug, not something this phase or
Phase 2 needs to chase.

No manual/real-device check yet for text legibility at TV viewing distance
(the "Watch for" note above) — screenshots confirm layout correctness but not
in-person readability on an actual TV. Recommend a quick real-device glance
before considering this phase fully closed, though nothing in the screenshots
suggests a problem (text sizes read comparably to before, just less clipped).

### Phase 2 — Make panels fit their canvas regardless of content (durable fix)
**Why:** Phase 1 hard-codes a canvas big enough for *today's* content. A longer
category name, venue name, or trivia question re-breaks it. This phase removes
the whole class of bug.

**Fix — recommended approach:** add an `AutoScaleToFit` wrapper (same idea as
`ViewportFitCanvas`, one level in): measure the panel's natural content box with
a `ResizeObserver`, compute `scale = min(1, canvasW / naturalW, canvasH / naturalH)`,
and transform-scale the panel down only when it would otherwise overflow. Content
that already fits renders untouched at scale 1, so well-behaved screens are
pixel-identical to Phase 1.

Apply it to the panels Phase 0 flags as overflow-prone, starting with
`TvLetterReveal`. Combine with targeted layout hardening where it's cheap and
obviously right (let long category names wrap instead of forcing min-content
width; cap the hero letter tile relative to available height).

**Risk to manage:** `TvLetterReveal`'s hero letter uses a framer-motion "slam"
sequence built from `transform` keyframes. A wrapper transform composes with
those. Put the auto-scale on a **separate parent element** from any animated
node so the two transforms never fight, and re-verify the slam animation visually
after the change.

**Files:** new `components/venue-screen/AutoScaleToFit.tsx`; `TvLetterReveal.tsx`
and whichever panels Phase 0 flags.
**Model:** Opus · **Effort:** Medium-High — genuine layout/measurement work
interacting with an existing animation system; the transform-composition risk
above is the kind of thing that silently breaks the marquee animation.

**Status: DONE (2026-07-22).** Shipped as described, plus three findings that
weren't in the plan and that anyone touching this code needs to know.

**What shipped**

- New `components/venue-screen/AutoScaleToFit.tsx`. An outer *slot*
  (`h-full w-full overflow-hidden`) and an inner *content* element pinned at
  100%×100% of it. Every render (the screen already re-renders on its 1s clock
  tick) a layout effect measures the content's natural extent and sets
  `scale = min(1, slotW/naturalW, slotH/naturalH)`, applied as
  `translate(...) scale(...)` with a **top-left** origin. Content that fits gets
  `scale === 1` and *no transform attribute at all*, so every already-correct
  screen is pixel-identical to Phase 1.
- Applied to all six overflow-capable panels: `TvLetterReveal`,
  `TvQuestionReveal`, `TvAnswerReveal`, `TvRoundBreak`, `TvBlitzResults`,
  `TvFinalStandings`. (`TvIdleAttract` deliberately left alone — Phase 1
  established its reported "overflow" is a measurement artifact, not content.)
- Layout hardening in `TvLetterReveal`'s category grid: columns are now
  `minmax(0, 1fr)` instead of `1fr` (a bare `1fr` floors at the item's
  *min-content* width, which is exactly what pushed the grid past the canvas in
  the original bug report), rows are `minHeight` rather than a fixed `height`,
  and long names **wrap** (`overflowWrap: anywhere`) instead of being
  `truncate`d. An unreadable category is worse than a two-line row, and the
  extra height is absorbed by the auto-fit.

**Finding 1 — the real reason nothing ever "overflowed": `min-height: auto`.**
The first working implementation still measured zero overflow in every state.
The panel chain (`ScreenTransition` motion.div → panel `<section>` → `Tv*` root)
is all flex, and a flex item's default `min-height: auto` means the column
**grows to fit its content** rather than overflowing. The content was pushing
the whole column past the 1296px canvas, where `main`'s `overflow-hidden`
clipped it. Nothing in between ever registered as overflowing, so no
measurement-based fix could have worked. Every one of those elements now carries
`min-h-0`. **Do not remove those `min-h-0` classes** — without them
`AutoScaleToFit` is silently inert.

**Finding 2 — `scrollHeight` lies on `overflow: visible` boxes.** Chrome reports
no scroll overflow for a visible-overflow element; it propagates the overflow up
to the nearest clipping ancestor instead. So measuring the content element
directly always reads back "fits". The measurement is taken on the *slot*
(which is `overflow-hidden`, i.e. a real scroll container), with the content's
transform temporarily set to `none` for the read — the scrollable overflow
region is computed from *transformed* boxes, so leaving the previous scale on
would feed the measurement back into itself. The strip-and-restore happens
inside a layout effect, so nothing is ever painted untransformed. `scrollWidth`/
`scrollHeight` also exclude the content element's own end padding, so the child
rects are walked as well and the padding added back — otherwise a panel silently
eats its bottom padding before any scaling kicks in.

**Finding 3 — decorative overhang had to move out of the measured subtree.**
`TvAnswerReveal`'s 700px answer bloom and `TvFinalStandings`' confetti (pieces
translate up to ~940px down, ~960px sideways) both sat inside what is now the
measured content. Measuring them would have swung the scale for the seconds they
are in flight. Both are now absolute children of their panel root, outside
`AutoScaleToFit`, clipped by the root's `overflow-hidden` exactly as before.
**Any new decorative overhang must go there too.**

**Verified** (same fixture-interception harness as Phases 0–1, native 2304×1296,
marker-checked): all nine original fixtures render with **scale exactly 1** and
zero overflow — i.e. no visual change from Phase 1. Two new adversarial fixtures
prove the durable fix engages: 12 near-worst real category names → `scale 0.965`,
and 12 four-line synthetic category names → `scale 0.705` with all twelve rows
fully readable. Screenshotted and eyeballed: category-blitz round (normal +
both stress cases), live-trivia question / answer-reveal (incl. a long-answer
stress fixture) / round break / final standings, category-blitz intermission.
`tsc --noEmit`, `npm run lint`, and the full Vitest suite (643 passing) are clean.

**Slam animation re-verified** (the flagged transform-composition risk): captured
mid-flight and at rest. The hero letter still slams full-screen with its impact
burst and settles at exactly its resting slot (x 96, y 504, 460×460,
`transform: none`). No composition conflict — the auto-scale lives on a separate
parent element from every animated node.

**Known cosmetic follow-up, NOT introduced by this phase:** `TvLetterReveal`'s
`CENTER = { x: 960, y: 540 }` and `REST = { x: 376, y: 566 }` (lines ~57–64) are
hard-coded for a 1920×1080 layout. Since Phase 1 raised the canvas to
2304×1296, the letter now slams toward a point ~190px left and ~180px above the
panel's true centre. The letter is large enough at that moment to fill the
screen so it still reads correctly, but the impact burst is visibly off-centre.
Fixing it properly means deriving both points from a measured panel box, which
risks re-triggering the slam mid-flight — deliberately left for a follow-up
rather than bundled into this phase.

**Phase 3 hook:** the measured element carries `data-auto-scale-to-fit="<scale>"`.
The regression guard should assert that every state renders at scale `1` (or, if
a state legitimately needs scaling, that no element's box exceeds the canvas) —
the attribute is what distinguishes "fits at scale 1" from "overflows and wasn't
scaled", which is the exact false-negative that cost the most time in this phase.

### Phase 3 — Overflow regression guard
**Fix:** An automated check that walks the rendered canvas for every screen state
and fails if any element's bounding box exceeds the canvas bounds. This is the
test that would have caught the current bug, and the only thing that keeps it
from silently returning the next time a panel's copy grows. Wire it into the
existing venue-screen test suite (currently 9 passing tests).

**Files:** `components/venue-screen/__tests__/` (or the repo's existing
venue-screen test location) + fixtures for each state.
**Model:** Sonnet · **Effort:** Medium — the assertion is simple; building
reliable per-state fixtures is the actual work.

**Status: DONE (2026-07-22).** Shipped as a standalone Playwright script,
**not** a vitest test — the existing `tests/venue-screen-*.test.ts` suite uses
`renderToStaticMarkup` against Vitest's Node environment, which has no real
layout engine (`getBoundingClientRect` and `scrollWidth`/`scrollHeight` are
meaningless without one), so genuine overflow can only be measured in a real
browser. `scripts/verify-venue-screen-overflow.mjs` reuses Phases 0-2's
fixture-interception technique (`page.route` on `/api/venue-screen/state`, one
navigation per state, at native 2304×1296) against the same `venue-pacific-street`
venue, made permanent instead of throwaway. Wired as `npm run
test:venue-screen-overflow`. No auth needed — the `/venue/[venueId]/screen`
route is unauthenticated by design.

**Fixture matrix (13 states):** the same 9 original Phase 0 states plus the 2
adversarial category sets from Phase 2 (12 near-worst real category names →
expect `scale 0.965`; 12 four-line synthetic names → expect `scale 0.705`),
plus a `live-trivia:reveal` long-answer stress fixture. Real category text for
the longest/near-worst fixtures is pulled from
`data/category-blitz/category-pool.json` at write time (ranked by length), not
hand-invented strings.

**The check, and why it is NOT simply `main.scrollWidth`/`scrollHeight` vs
2304×1296:** verified two false negatives before landing on this shape.
1. **A missing `<AutoScaleToFit>` or a missing `min-h-0` doesn't show up at
   `main` at all.** Per Phase 2 Finding 2, an overflowing box's scrollable
   overflow region propagates to its *nearest clipping ancestor* — which, for
   a `Tv*` panel, is the panel's own `overflow-hidden` root, one or more levels
   below `main`. Confirmed by deliberately deleting `<AutoScaleToFit>` from
   `TvLetterReveal.tsx` and re-running the guard: `main.scrollHeight` stayed
   exactly 1296 (no detected overflow) even though a screenshot at that
   moment showed categories 11-12 fully clipped off the bottom edge — the
   exact bug this whole plan exists to catch, invisible to an outermost-only
   check. The fix: walk **every in-flow descendant** of `main` (skipping
   `position: absolute`/`fixed` subtrees, which is deliberate decorative
   overhang per Finding 3) and compare each one's own
   `getBoundingClientRect()` straight against the canvas bounds —
   `getBoundingClientRect` reports an element's true layout box regardless of
   which ancestor clips it, so this catches overflow at *any* depth. Re-running
   the same deleted-`AutoScaleToFit` regression with this walk correctly failed
   on the 12-synthetic-category fixture (240px overflow) once content was
   extreme enough to genuinely exceed the panel's own bounds even at scale 1
   (the milder longest/near-worst fixtures still fit at scale 1 without
   `AutoScaleToFit`, matching Phase 1's 5-9% headroom — only the deliberately
   extreme synthetic fixture needs the auto-scale, consistent with Phase 2's
   own findings).
2. **`AppShell` (`components/ui/AppShell.tsx`) renders its own unrelated
   `<main className="flex-1 pb-24">`** around the whole app. A bare
   `document.querySelector("main")` silently grabs that one instead of
   `VenueScreenClient`'s canvas — scoped to `main.bg-slate-950` instead.

**Known accepted non-bug baked into the guard:** idle mode's deliberate
anti-burn-in pixel jitter (`getVenueScreenBurnInTransform`, up to ±6px per
axis) reads back as a few-pixel "overflow" on `TvIdleAttract`'s full-bleed
background wrapper — this is the exact artifact Phase 1 already identified and
dismissed as a measurement quirk, not real clipping. Idle gets its own
`IDLE_OVERFLOW_SLACK_PX` (20px) rather than loosening the slack for every
fixture (2px elsewhere, matching `AutoScaleToFit`'s own
`OVERFLOW_SLACK_PX`).

**Verified:** all 13 fixtures pass against the current code. Re-confirmed the
guard is load-bearing (not a check that always passes) by reintroducing the
exact regression twice — deleting `<AutoScaleToFit>` from `TvLetterReveal.tsx`
and removing `min-h-0` from `VenueScreenClient.tsx`'s `ScreenTransition`
wrapper — and observing real failures with actionable diagnostics (worst
offending element, tag, class, and overflow in px) before reverting both.
`tsc --noEmit`, `npm run lint`, and the full Vitest suite (643 passing, 6
skipped) are unaffected — this phase added no vitest tests, only the
standalone script.

### Phase 4 — Re-verify the dashboard Preview and Expand
**Fix:** No code change expected. Confirm the Partner Dashboard preview and the
"Expand" landscape view now show the complete screen, on a real phone. This is
the user-visible acceptance check for the whole plan.

**Files:** none expected.
**Model:** Sonnet · **Effort:** Low — verification only.

## Suggested execution order

1. **Phase 0** — must precede Phase 1; sizing the canvas without the worst case
   just moves the clipping to a different screen.
2. **Phase 1** — ships a visible fix quickly and safely.
3. **Phase 3** — worth doing *before* Phase 2 if you want the refactor guarded by
   a failing-then-passing test; otherwise after.
4. **Phase 2** — the durable fix; largest change, do it with the guard in place.
5. **Phase 4** — final acceptance on a real device.

Phases 0+1 alone resolve the reported symptom. Phases 2+3 are what stop it
recurring.

## Model / effort summary

| Phase | Model | Effort |
| --- | --- | --- |
| 0 — Audit natural size per state | Sonnet | Medium |
| 1 — Raise canvas to design resolution | Sonnet | Low |
| 2 — Auto-fit panels to canvas | **Opus** | Medium-High |
| 3 — Overflow regression guard | Sonnet | Medium |
| 4 — Re-verify preview/expand | Sonnet | Low |

Opus is warranted only for Phase 2 (layout measurement + animation interaction).
Everything else is mechanical or verification work well within Sonnet's range.
