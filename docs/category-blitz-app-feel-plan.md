# Category Blitz — "App Feel" Fix Plan (post-v8)

**Status:** in progress — Phases 0–7 are done in the working tree, and **Phase 8 (device
acceptance) has had its first real device capture (`After-Fixes.png`, 2026-08-03).** That capture
**closes Findings F and G**: no magenta anywhere, keyboard open or closed, so acceptance criteria
1–4 pass. It also surfaced a **new, quantified defect** — only 2 answer rows were usable with the
keyboard open, against a target of 5+ — which is now fixed by `compactChrome` and verified by a
before/after A/B in the harness (2 rows → 6 rows at the device's real ~410 px budget). **Phase 8 is
still open**: `compactChrome` itself has not been seen on device, criterion 5 (typing feel) has not
been reported on, and no `?cbzDebug=1` capture has ever been supplied. Read "Phase 8 — round 1
device capture" under Phase 8 first.
**Supersedes as the active workplan:** `docs/category-blitz-claude-code-handoff.md` (kept as the
attempt history — do not delete, it is the record of what has already been falsified)
**Branch at time of writing:** `billing-guard-and-discounts`, last relevant commit `356fefd`
(`cbz-portal-visual-frame-v8`)

## Goal (acceptance criteria)

1. Tapping any answer row on a real iPhone opens the keyboard with **no visible layout tear** —
   no rows drawn at stale positions, no gap, no band of any color, no content jumping.
2. No non-game color (magenta `#a10d63`, venue background, browser chrome tint) is ever visible
   during gameplay.
3. The page itself never scrolls during gameplay; only the answer list scrolls internally.
4. The legal footer never appears inside a game (already true — `shouldShowLegalNotice`).
5. Typing feels immediate: no per-keystroke jank, no dropped characters, no caret jumps.

---

## Real-device evidence (screenshots, 2026-08-03)

Andrew supplied three real-iPhone-Safari screenshots (start / keyboard-open / keyboard-closed),
saved at
`design-system/hightop-challenge-design-system/project/public/brand/category-blitz-broken/`
(`start-position.PNG`, `after-open-keyboard.PNG`, `after-close-keyboard.PNG`). These were taken
without `?cbzDebug=1`, so they don't carry the debug-panel numbers, but they are enough to
re-rank the hypotheses below — read before starting any phase.

**What they show:**

1. **A thin magenta/pink vertical strip is visible on both the left and right edges of the
   screen in ALL THREE screenshots — including `start-position.PNG`, before the keyboard ever
   opens.** This is a distinct, previously-undocumented, always-on bug: the game frame does not
   fully cover the viewport horizontally even at rest. None of the six prior attempts mention
   this, and no finding above explains it yet. Likely candidates: `--cbz-visible-width`/
   `--cbz-visible-left` resolving to a value slightly narrower than the true device width (a
   known iOS quirk where `visualViewport.width` can differ fractionally from `window.innerWidth`
   at load), exposing the `GAME_CARD_BG_BY_KEY["category-blitz"]` magenta layer
   (`GameLandingExperience.tsx:310-315`) underneath at the seams. This needs the Phase 0
   instrumentation to confirm (exact `rootRect`/`viewportFrame` numbers), but it is now a
   **separate, simpler, always-reproducible bug** that doesn't need a keyboard to trigger —
   worth fixing and verifying first, since it's the cheapest possible repro.

2. **On keyboard-open, a large solid magenta band appears between the visible answer rows and
   the keyboard** — this is the original bug from the handoff, reproduced exactly. Critically,
   the answer rows themselves are **not visibly displaced, overlapping, or torn** in the
   screenshot — row 1 is correctly active (blue focus ring), rows 1–2 are fully intact, row 3's
   header is cleanly cut off at the frame's bottom edge. There is no evidence in this still frame
   of Finding A's predicted symptom (rows drawn at stale scaled/translated positions). A single
   still can't rule out a transient tear during the resize animation itself, but the resting
   frame here shows a clean cut, not corruption — so **this demotes Finding A from leading
   suspect to secondary**, and promotes the frame-height/exposed-layer mechanism (new Finding F
   below) to co-primary.

3. **The floating `play.hightopchallenge.com` URL pill and the keyboard's `^ v ✓` accessory bar
   both sit ON the magenta band**, not on a dark background. If the frame's dark background
   extended all the way down to the true top of the keyboard, that chrome would float over
   `bg-slate-950`. It doesn't — it floats over magenta. That's consistent with the frame's
   rendered height stopping well short of the actual visible-area boundary, i.e. the frame
   shrank, but not by enough, or shrank based on a stale measurement.

### Finding F — the frame's height undershoots the real visible viewport, exposing the fixed magenta layer beneath (new, primary suspect)

The portal frame (`VIEWPORT_FRAME_CLASS`, `CategoryBlitzGame.tsx:53-54`) is sized via
`--cbz-visible-height`, written by `applyCategoryBlitzVisibleViewportFrame`
(`:157-169`) from `window.visualViewport.height`. Directly beneath this portal, at `z-0`, sits a
`position: fixed; inset: 0` div in `GameLandingExperience` (`:310-315`) painted
`GAME_CARD_BG_BY_KEY["category-blitz"]` — the exact magenta gradient (`#a10d63…#4a052c`) —
whenever the `isCategoryBlitzGame && isPlaying` override doesn't apply. That fixed div spans the
**full layout viewport regardless of keyboard state**; it never shrinks. So any gap between the
bottom of the shrunk portal frame and the top of the keyboard is, by construction, painted
magenta, not black — there is no dark fallback under the portal at all once you're below its
rendered rect. Two ways this gap opens up, both worth checking in Phase 0's instrumentation:

- **Lag**: `applyCategoryBlitzVisibleViewportFrame` runs on a `rAF` scheduled from the
  `visualViewport resize`/`scroll` events (`:183-191`). If the keyboard's height animates in over
  ~250ms (it does, on iOS) while the CSS var updates in discrete resize-event steps, the frame's
  rendered height can visibly lag behind the true instantaneous `visualViewport.height` for the
  duration of the keyboard's own opening animation — which is exactly when a screenshot mid-open
  would catch a gap.
- **Wrong reference value**: if anything upstream (Safari's own resize event ordering, or a
  stale `visualViewport` snapshot taken before the compact URL bar finished collapsing) causes
  `applyCategoryBlitzVisibleViewportFrame` to compute a height number smaller than the actual
  final visible area, the frame parks itself short and never grows back to fill the real gap —
  this would explain a *persistent* (non-transient) magenta band, not just a mid-animation flash.

Either way, the fix is the same shape: don't leave a keyboard-open gap exposing whatever's
underneath — either eliminate the fixed magenta layer entirely on this route (favor Phase 3's
dedicated shell, which removes the layer instead of trying to keep it perfectly in sync), or
make the frame's dark background provably always reach at least to `window.innerHeight` (not
just `visualViewport.height`) so nothing can ever show through beneath it, no matter which
value lags.

### Finding G — a persistent horizontal viewport-width gap exposes the same magenta layer at rest (new, needs Phase 0 numbers)

The left/right magenta strips visible in all three screenshots, including the keyboard-closed
ones, indicate `--cbz-visible-width`/`--cbz-visible-left` (or the frame's actual rendered rect)
doesn't fully span the device width at rest. Same underlying exposure mechanism as Finding F —
the magenta fixed layer in `GameLandingExperience` shows through at the seam — but this one
needs no keyboard interaction to reproduce, making it the fastest thing to fix and verify.
Instrument this specifically in Phase 0: log `visualViewport.width` vs `window.innerWidth` vs
the frame's actual `getBoundingClientRect().width` on load, with the keyboard fully closed.

---

## What the code actually shows

Six attempts have all been variations on **one hypothesis**: "the frame is sized/positioned
wrong relative to the iOS visual viewport." All six were CSS/viewport/focus strategies, and all
six failed on device. That is strong evidence the hypothesis itself is wrong, or at least
incomplete. The re-read turned up four concrete findings from source alone (below), now joined
by Findings F and G above from actual device screenshots.

### Finding A — Framer Motion layout projection is live on all 12 answer rows (never tested)

`components/category-blitz/CategoryBlitzGame.tsx:1438-1446` wraps every answer row in:

```tsx
<motion.div layoutId={cbCategoryRowLayoutId(i)} transition={{ layout: LAYOUT_MORPH_TRANSITION }}>
```

and `CategoryBlitzGame.tsx:1328-1336` does the same for the letter badge
(`CB_LETTER_BADGE_LAYOUT_ID`). These exist to power the `RoundStartReveal` → gameplay FLIP morph
(`components/category-blitz/RoundStartReveal.tsx:96,136`), which lasts **450 ms at round start**.
But the `layoutId` props stay mounted for the **entire three-minute answering phase**.

A `motion` element with `layoutId` keeps an active projection node. Framer Motion re-measures
projection nodes on viewport resize and animates each node from its old rect to its new rect —
here over `LAYOUT_MORPH_TRANSITION` (450 ms, `EASE_SNAP`), applying per-node translate **and
scale-correction** transforms to 12 rows plus the header badge.

The iOS keyboard opening is a viewport resize. So the expected symptom of this bug is: *for
roughly half a second after every tap on an answer field, twelve rows are drawn at stale
positions with stale scale corrections, overlapping and clipped, while the header badge does the
same thing independently.* That is a very close description of "the screen is half-corrupted each
time a user wants to enter an answer in an answer field."

This was the leading hypothesis before device screenshots came back (see "Real-device evidence"
above). The screenshots show clean, non-displaced rows with a solid magenta band below them
rather than overlapping/scaled rows — that's more consistent with Finding F (the frame's dark
background not reaching far enough down) than with a projection tear. Finding A is demoted to
**secondary**: still cheap to falsify (Phase 0) and cheap to fix (Phase 2), and still worth
fixing regardless (it's real dead weight sitting on 12 rows for 3 minutes either way), but no
longer assumed to be the dominant cause of what's in the screenshots.

### Finding B — the magenta has a concrete source, and it is not the DOM under the keyboard

`#a10d63` appears in exactly two places:

- `components/venue/GameIdentityPanel.tsx:16-17` — `GAME_CARD_BG_BY_KEY["category-blitz"]`
- `lib/venueGameTransition.ts:56` — `FALLBACK_CARD_BG_BY_KEY["category-blitz"]`, painted on a
  `position: fixed; z-index: 2100` overlay during the venue→game open transition

The transition overlay is removed in a `finally` block (`lib/venueGameTransition.ts:537-540`), so
it should not persist — but it sits at `z-2100`, **21× above the game portal's `z-[100]`**, and it
is created by direct DOM manipulation outside React. If it ever fails to unmount (interrupted
navigation, `await navigatePromise` rejecting, a re-entrant transition), it is a full-screen
magenta gradient over everything. Worth auditing rather than assuming.

Separately: the app ships **no `theme-color` meta tag**. `app/layout.tsx:58-62` exports
`viewport` with only `width`, `initialScale`, `viewportFit: "cover"`. With no `theme-color`, iOS
Safari samples the page's own colors to tint its URL bar and the keyboard accessory strip. That
is browser chrome, not DOM — it would be invisible to every DOM-based debug probe used so far,
and it is a plausible source of a colored band that "no DOM layer explains."

### Finding C — a global ad banner can mount over the game at `z-[1600]`

`components/ui/MobileAdhesionAd.tsx:36-62` — `resolvePageKey` has no `/category-blitz` case, so
it falls through to `"global"`. The on-load effect (`:196-223`) is **not** gated to trivia routes,
so a `global` banner can load on `/category-blitz/play` and render
`fixed inset-x-0 bottom-0 z-[1600]` — directly above the keyboard, above the game portal.
(`PopupAds` is safe: its `resolvePageKey` returns `null` for this route, `components/ui/PopupAds.tsx:60-85`.)

### Finding D — the test file actively locks in the broken implementation

`tests/category-blitz-mobile-shell-contract.test.ts` asserts on **source strings**, not behavior:
it requires `LAYOUT_DEBUG_VERSION === "cbz-portal-visual-frame-v8"`, requires the exact
`[top:var(--cbz-visible-top,0px)]` class literal, requires `grid-rows-[auto_auto_minmax(0,1fr)_auto]`,
requires `onPointerDown` + `event.preventDefault()`. Any real fix fails this test immediately.
It has to be replaced before, not after, the fix.

### Secondary "app feel" defects on the typing path

- `focusAnswerRow` (`:1164-1202`) schedules **four** competing scroll corrections (0/40/220/420 ms)
  plus a one-shot `visualViewport.resize` listener that schedules two more `smooth` scrolls — up to
  six overlapping animated scrolls per tap, straight through the keyboard animation.
- Focus is called from `setTimeout(focusEditor, 0)` (`:1192`) after `onPointerDown` called
  `event.preventDefault()` (`:1393-1396`). iOS is most reliable when `.focus()` runs
  **synchronously** inside the gesture handler; a deferred focus is how you get a late or
  non-opening keyboard.
- `ValidAnswerGlow key={answers[i]}` (`:1410`) **remounts an animated SVG on every keystroke**.
- `WrongLetterReject` (`components/category-blitz/WrongLetterReject.tsx`) runs an `x`-translate
  shake on every keystroke while the answer starts with the wrong letter — on a `motion.div` that
  is a direct child of the `layoutId` projection node from Finding A.
- The root component re-renders at 4 Hz (`nowMs` interval, `:1788-1791`) and `AnsweringScreen`
  re-renders every timer tick, rebuilding all 12 rows, while the user is typing.

---

## Phases

Each phase is independently shippable and independently revertible. Phases 1 and 2 do not depend
on Phase 0 — start them in parallel if Andrew is not available to run the device capture.

---

### Phase 0 — Falsify the hypothesis on a real device (30 min, needs Andrew) — *partially done*

**Purpose:** After six blind fixes, the next change should be aimed, not guessed.

**Update:** Andrew supplied three plain (non-`cbzDebug`) screenshots — see "Real-device
evidence" above. They confirm the bug reproduces exactly as described, they demote Finding A,
and they surface Findings F and G. They do **not** carry the numeric instrumentation (exact
`rootRect` height, `visualViewport` values, computed `transform`s) needed to pick between "lag"
and "wrong reference value" in Finding F, or to explain Finding G's width gap. The instrumentation
pass below is still needed — but now it's confirmatory, not exploratory.

- Extend `CategoryBlitzLayoutDebugPanel` (`CategoryBlitzGame.tsx:212-267`) to report, on the
  keyboard-open frame:
  - **`window.visualViewport.height` vs the frame's live `getBoundingClientRect().height` vs
    `window.innerHeight`, side by side** — this is the Finding F number; a gap between the first
    two directly measures the magenta band's height.
  - **`window.visualViewport.width` vs `window.innerWidth` vs the frame's
    `getBoundingClientRect().width`/`.left`, at rest (keyboard closed)** — this is the Finding G
    number, and doesn't need the keyboard open to capture.
  - the computed `transform` of `[data-category-blitz-answer-row="0"]` and of its `motion.div`
    parent, and of the letter badge — non-`none` here would still confirm Finding A is
    *contributing*, just not that it's the dominant effect
  - `document.querySelectorAll("[data-venue-transition]").length` (Finding B)
  - the bounding rect + `z-index` + `backgroundColor` of every `position: fixed` element in the
    document whose rect intersects the bottom 40% of the visual viewport (Findings B, C, F)
  - `window.getComputedStyle(document.documentElement).backgroundColor`
- Ship behind the existing `?cbzDebug=1` gate. No production behavior change.
- **Deliverable Andrew provides:** one screenshot on iPhone Safari at `/category-blitz/play?cbzDebug=1`,
  taken *during* the corrupted frame right after tapping an answer row, and one at rest with the
  keyboard closed (for Finding G) — same corner as the existing debug panel.

**Model: Sonnet 5 · effort: medium.** Mechanical instrumentation against a known file.

**Exit:** we have the exact numbers behind Findings F and G, and know whether A is contributing
at all, before touching gameplay code.

---

### Phase 1 — Retire the string-contract test (unblocks everything)

- Delete the assertions in `tests/category-blitz-mobile-shell-contract.test.ts` that pin v8
  implementation details: the `LAYOUT_DEBUG_VERSION` literal, the `--cbz-visible-*` class
  literals, the exact grid-template string, `onPointerDown`/`preventDefault`, `focus({ preventScroll: true })`.
- Keep and strengthen the assertions that are genuine **invariants**, since these encode real
  decisions the project has already litigated:
  - `/category-blitz` is in `FULLSCREEN_PATHS` and `GAME_SCREEN_PATHS`
  - `shouldShowLegalNotice` keeps its round-3 Phase 7 scope (non-admin, non-fullscreen) —
    see `components/ui/AppShell.tsx:42-55`; this one is a compliance decision, do not touch it
  - exactly one native `<input>` exists in the answering screen, and zero inside the answer list
  - the answer list scrolls internally (`scrollBy`), never `scrollIntoView` on the page
  - no `--cbz-layout-height` and no hidden-proxy-input markers (the guardrails from the handoff)
- Add a note at the top of the file: this suite asserts contracts, not implementation strings.

**Model: Sonnet 5 · effort: low.** Deletion plus rewording; the invariants are already listed above.

**Exit:** `npx vitest run tests/category-blitz-mobile-shell-contract.test.ts` green, and the suite
no longer fails on a legitimate refactor.

---

### Phase 2 — Scope layout projection to the reveal morph only ✅ *done 2026-08-03 (see as-built below)*

- Introduce a `morphActive` boolean in `AnsweringScreen`, true only from mount until the
  reveal→gameplay morph settles (`LAYOUT_MORPH_TRANSITION.duration` = 450 ms, plus a small
  buffer), then permanently false for the rest of the round.
- While `morphActive` is false, render answer rows and the letter badge as **plain elements with
  no `layoutId` and no `layout` transition**. No projection node → nothing to re-measure or
  scale-correct when the keyboard resizes the viewport.
- The round-start morph is unaffected: it still runs at full fidelity for its 450 ms, which is
  the only window it was ever designed for
  (`lib/categoryBlitzMotion.ts`, `components/category-blitz/RoundStartReveal.tsx:96,136`).
- While in there: audit `LiveLeaderboard.tsx:111` (`layout={!exiting}`) for the same class of
  problem on the results screen — lower priority, the keyboard is closed there, but it is the
  same footgun.
- Keep `WrongLetterReject`'s shake and `ValidAnswerGlow` for now; they are addressed in Phase 6.

**Model: Opus 5 · effort: high.** Framer Motion projection semantics are subtle, the morph must
survive intact, and getting the handoff boundary wrong reintroduces a visual cut at round start —
which is a *different* regression the reveal work was specifically built to avoid.

**Exit:** on device, tapping an answer row produces no row displacement. Given the screenshot
evidence, don't expect this alone to close the magenta band — that's Finding F's job (Phases 3–4)
— but ship it regardless; a live projection node sitting idle for 3 minutes is real waste even if
it isn't the dominant visible symptom.

#### Phase 2 — as built (2026-08-03) ✅

**What changed** (all in `components/category-blitz/`, plus one comment in `LiveLeaderboard.tsx`):

- `CategoryBlitzGame.tsx`
  - New `LAYOUT_MORPH_SETTLE_MS` = `LAYOUT_MORPH_TRANSITION.duration * 1000 + 120` (570 ms).
  - `AnsweringScreen` takes a new `morphFromReveal?: boolean` prop (default **false**) and keeps
    `const [morphActive, setMorphActive] = useState(morphFromReveal)`, flipped permanently false
    by a single `setTimeout` after `LAYOUT_MORPH_SETTLE_MS`. It never flips back on.
  - The 12 answer rows and the letter badge now render **two ways**: `motion.div` with
    `layoutId` + `transition={{ layout: … }}` while `morphActive`, and a **plain `div`** after.
    Both branches keep the same classes, the same `data-category-blitz-answer-row-wrap`/
    `data-category-blitz-letter-badge` markers and identical geometry, so the swap is invisible.
  - The projected branch also carries `data-category-blitz-row-projected` — a marker that exists
    *only* while a row has a live projection node. Phase 7's harness should assert
    `document.querySelectorAll("[data-category-blitz-row-projected]").length === 0` during
    gameplay; that is a far more direct check than inferring it from rects.
  - `?cbzDebug=1` panel gained a `projectedRows` line (0 = scoped correctly, 12 = regressed).
  - `morphFromReveal` is computed at the call site as `finishedRevealRoundId === round.id`.
    That is the exact and only condition under which AnsweringScreen has live `layoutId`
    partners to FLIP from. **A mid-round reload now mounts the board with no projection at
    all** — it never showed a reveal, so there was never anything to morph.
    Known, accepted edge: if the reveal is still on screen when `revealElapsedMs` passes
    `ROUND_START_REVEAL_MAX_MS` (3 s — a suspended tab or a very slow device), `showReveal`
    flips false without `onDone`, so that round cuts to the board instead of morphing. That
    path was already a degraded/frozen reveal; a cut there is acceptable.
- `DevAnimationPanel.tsx` — the `revealMorph` demo passes `morphFromReveal` (it always follows a
  reveal), so the dev preview still exercises the real morph.
- `LiveLeaderboard.tsx` — **audited, deliberately unchanged.** `layout={!exiting}` is the same
  class of footgun, but that list only renders in the reveal/results/complete phases, which have
  no text input, so the keyboard cannot resize the viewport underneath it — and the projection is
  what animates rank changes between rounds. A comment now records that, plus the condition that
  would make it a real problem (a leaderboard that gains an input, or renders during
  "answering").

**Verified** (headless Chromium 390×844, real dev server + real seeded round, `verify` skill:
`createSession`/`registerSessionPresence`/`startRound` on the `sim-category-blitz` venue, driven
with Playwright; sim data torn down afterwards):

| Check | Result |
|---|---|
| `RoundStartReveal` still renders and hands off | ✅ reveal at t+1.4 s, board at t+2.9 s |
| Morph still runs at full FLIP fidelity | ✅ row + badge transforms decay `matrix(0.84, …, −57px)` → identity over ~450 ms, same curve as before the change |
| Projection retired after the morph | ✅ `projectedRows` 12 → **0** at ~570 ms after board mount, stays 0 for the rest of the round |
| No visual seam at the swap | ✅ screenshot after the swap is a correctly laid-out board |
| Keyboard-sim resize (844→504) | ✅ all 12 rows move by an identical delta (0,0), no transforms, `scrollY === 0` |
| Tap row 9 (scrolls the answer list ~456 px) | ✅ all rows move by one uniform delta, no per-row transform, editor input focused |
| A/B against pre-Phase-2 behavior | ✅ with the settle window forced to ∞, `projectedRows` stays **12** all round — the marker really does track the change |
| `npx tsc --noEmit`, `npm run lint`, full `vitest` (1311 tests) | ✅ green |

**Honest limits — read before Phase 8.** Headless Chromium **does not reproduce Finding A's
symptom at all**: in the A/B run with 12 live projection nodes, neither the viewport resize nor
the answer-list scroll produced any stale transform. Two reasons, both worth carrying forward:

1. Framer measures and animates layout on **React commits**, not on raw `resize` events.
2. Shrinking the frame doesn't actually move the rows — the answer list is the flex/grid child
   that absorbs the height change, so row rects are unchanged and there is nothing to animate.

So this phase is verified as *"the projection nodes are gone, and the morph survived"* — which is
exactly what it set out to do — but **not** as *"this fixes the device symptom."* Whether
Finding A was contributing on real iOS is still an open question that only Andrew's device
capture can answer (`projectedRows` in the debug panel now answers it directly). Phase 7's
harness must be written knowing it cannot prove the iOS half either; same lesson as
`project_category_blitz_mode_flip_3d` (headless WebKit was not a valid CSS-3D verifier).

**Not done here / left for later phases:** `ValidAnswerGlow`'s per-keystroke remount and
`WrongLetterReject`'s per-keystroke shake are untouched by design (Phase 6). Nothing in this
phase touches the magenta layer, the frame sizing, or the focus/scroll stack (Phases 3–5).

---

### Phase 3 — A dedicated Category Blitz play shell ✅ *done 2026-08-03 (see as-built below)* ← *closes Finding F directly*

This is recommendation E from the handoff, and the screenshot evidence makes it the priority fix,
not just good architecture: Finding F's magenta band exists *because* a fixed, full-viewport,
never-shrinking magenta layer sits underneath the game portal in `GameLandingExperience`. The
most reliable fix isn't to chase the portal frame's height into perfect sync with a resize event
that fires mid-animation — it's to delete the magenta layer from this route entirely, so there is
nothing underneath for any sizing gap to expose.

- `app/category-blitz/play/page.tsx` currently wraps the game in `GameLandingExperience`
  (`initialPlaying`), which wraps it in `PageShell`, which mounts a fixed `z-[1000]` header, a
  `100svh` shell, a `data-venue-game-surface` layer at `z-[70]`, a full-screen branded background
  layer, and a `data-venue-game-scroll` container — all of it inert during play, all of it still
  laying out and compositing under the portal
  (`components/venue/GameLandingExperience.tsx:300-336`, `components/ui/PageShell.tsx:56-100`).
- Replace that path with a minimal play shell that renders only: a dark root, the presence
  boundary (`VenuePresenceBoundary` — required, it is what gates submissions), and the game.
  No `PageShell`, no branded background layer, no `svh` wrappers, no scroll container.
- Preserve, explicitly:
  - the `onBack` → `backToVenue` wiring, including `runVenueGameReturnTransition` and
    `endCurrentGameSession("abandoned")` (`GameLandingExperience.tsx:273-292`)
  - `startGameSession("category-blitz")` / `endCurrentGameSession` analytics (`:191-198`)
  - `markOnboardingComplete` — the tutorial slides live on venue home
    (`components/venue/VenueHubClient.tsx:1325`) and must keep working
- Once the play path no longer uses it, remove the `isCategoryBlitzGame` special-casing that was
  bolted into `GameLandingExperience` (`:294`, `:303-333`) so the generic component goes back to
  being generic.
- With no route shell competing for the viewport, the portal in `CategoryBlitzGame` may no longer
  be necessary. Evaluate removing it — if the game root *is* the page, `createPortal` to
  `document.body` is redundant indirection.

#### Phase 3 — as built (2026-08-03) ✅

**New file: `components/category-blitz/CategoryBlitzPlayShell.tsx`.** `app/category-blitz/play/page.tsx`
is now a four-line server component rendering `<CategoryBlitzPlayShell />`; it no longer touches
`GameLandingExperience` at all. The shell is one `div` —
`data-venue-game-surface data-category-blitz-play-shell`,
`className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950"` — wrapping
`<VenuePresenceBoundary><CategoryBlitzGame onBack={backToVenue} /></VenuePresenceBoundary>`, plus
one mount effect. Everything the old path did that wasn't layout was carried over verbatim:
`markOnboardingComplete("category-blitz")`, `startGameSession("category-blitz")` +
`endCurrentGameSession("abandoned")` on unmount, `forceRecoverDocumentScroll()` on mount, and a
`backToVenue` that is a literal copy of `GameLandingExperience`'s (`endCurrentGameSession` →
`runVenueGameReturnTransition` → `navigateBackToVenue` → `router.push` fallback). What's gone:
`PageShell` (fixed `z-[1000]` header, `100svh` shell, `main`), the `data-venue-game-scroll`
container, the `animate-tp-surface-enter` wrapper, the `tp-game-page` class, and — the point of
the phase — the fixed full-viewport `GAME_CARD_BG_BY_KEY["category-blitz"]` magenta layer.

**`data-venue-game-surface` moved onto the play shell deliberately.** That attribute is the
element `runVenueGameReturnTransition` FLIPs back down into the venue-home card
(`lib/venueGameTransition.ts:551`). Dropping it would have silently degraded the back button to a
hard navigation. There is a test guarding this now.

**The body portal is gone.** `renderGamePortal`/`createPortal` were removed from
`CategoryBlitzGame.tsx`; all four return branches now render the frame inline. The frame itself
(`VIEWPORT_FRAME_CLASS`) is unchanged — still `position: fixed`, still sized off the
`--cbz-visible-*` vars. **Phase 4 still owns how it tracks the keyboard.** Two things made
un-portaling worth doing rather than just tidy:

- It fixes a real latent bug. The old route shell was `relative z-[70]` (a stacking context) while
  the game portaled to `document.body` at `z-[100]` (root context), so `VenueAccessOverlay`
  (`z-[140]`, rendered *inside* the presence boundary) painted **behind** the game — an
  out-of-range player mid-game would have been shown nothing. The play shell deliberately creates
  no stacking context (`position: relative` with `z-index: auto`), so the game's `z-[100]`, the
  access overlay's `z-[140]`, and the body-level overlays (`AnimationOverlay` `1200`,
  `venueGameTransition` `2100`, `GlobalTransitionOverlay` `6500`) all resolve against each other
  correctly again.
- The return transition now animates the real game. It previously shrank an empty dark route-shell
  div while the portaled game sat on top of it.

**`GameLandingExperience` is generic again.** `isCategoryBlitzGame`, `data-category-blitz-route-shell`,
the `gameKey === "category-blitz"` render branch and the two `isCategoryBlitzGame` className
ternaries are all deleted. No other game's rendering changed (the branch it fell into is byte-identical
to what every other game already used).

**Debug panel (`?cbzDebug=1`) changes:**

- `LAYOUT_DEBUG_VERSION` is now **`cbz-p3-play-shell`** (was `cbz-portal-visual-frame-v8`) so a
  device screenshot is unambiguous about which build it came from. Phase 8 renames it to
  `cbz-v9-<strategy>` on acceptance.
- New `magentaLayers` line: a full-document scan for anything computing to `rgb(161, 13, 99)`
  (`#a10d63`) in a background color or gradient. **It must read 0 during gameplay.** Non-zero means
  a magenta band on device has a DOM source and this names it — which is exactly the question six
  previous rounds couldn't answer. Elements inside `[data-animation-overlay]` are excluded, because
  the reverse-mode "Majority Rules!" takeover legitimately paints this exact magenta full-screen and
  would otherwise read as a false positive every reverse round. (`AnimationOverlay.tsx` gained that
  one marker attribute; nothing else about it changed.)
- `routeRect` now probes `[data-category-blitz-play-shell]` instead of the retired
  `[data-category-blitz-route-shell]`.

**Test changes** (`tests/category-blitz-mobile-shell-contract.test.ts`): the "dark inert route
shell" test was rewritten against the new shell (asserted on *imports*, not prose — both files
document at length why they don't use `PageShell`/`GameLandingExperience`, so substring checks
matched the comments), plus a new "keeps the play shell's non-visual wiring intact" test pinning
presence boundary, analytics, onboarding, return transition and `data-venue-game-surface`. Those
five are the silent failure modes this phase could have caused.

**Verified** (headless Chromium 390×844, real dev server, real seeded round on `sim-category-blitz`
driven with Playwright; sim data torn down afterwards):

| Check | Result |
|---|---|
| Route renders through the new shell | ✅ `pageShellCount 0`, `gameSurfaceCount 1`, game root is a descendant of the play shell |
| Finding G rect check, at rest | ✅ game root rect is exactly `l0 t0 w390 h844` = `innerWidth × innerHeight`; `widthGap 0`, `heightGap 0` |
| Same after a keyboard-sim shrink (844→504) | ✅ rect `h504`, `heightGap 0` |
| No magenta anywhere on the route | ✅ `magentaLayers 0` at lobby, answering, intermission and after resize. The one hit found during the run was the reverse-round takeover animation, now excluded |
| `RoundStartReveal` → board morph survived un-portaling | ✅ `projectedRows` 12 during the reveal window → **0** after the 570 ms settle, same as Phase 2 |
| Tap row 9 | ✅ editor input focused, `scrollY 0`, all 12 rows move by one uniform delta, no per-row transforms |
| Keyboard-sim resize while typing | ✅ all 12 rows move by an identical −352 px, transforms all `none`, `scrollY 0` |
| Typing | ✅ characters land in the single editor input |
| Back button (deep-linked, no card snapshot) | ✅ lands on `/venue/sim-category-blitz` via the `fallbackNavigate` path |
| Full round trip: venue home → tutorial → open transition → play → back | ✅ opens to `/category-blitz/play`, `venueTransitionOverlays 0` (open overlay tore down), return FLIP shrinks the real game surface, lands back on venue home with `strayGameRoot 0` and `tp-category-blitz-game-active` cleaned off `html`/`body` |
| `VenueAccessOverlay` not spuriously triggered | ✅ no overlay during the run |
| `npx tsc --noEmit`, `npm run lint`, full `vitest` (1312 tests) | ✅ green |

**Honest limits — same caveat as Phase 2.** Headless Chromium reproduced none of the device
symptoms before this change and reproduces none after it, so **none of the above is evidence that
the magenta band is fixed on iOS**. What it *is* evidence of: the magenta layer no longer exists in
the DOM on this route, the frame's rect exactly matches the viewport at rest and after a shrink, and
nothing that used to run through `GameLandingExperience` broke. Whether that closes Findings F and G
is Andrew's device capture to decide.

**Explicitly not done here** (all four Phase 4 items below were subsequently done — see the Phase 4
as-built): the frame is still positioned with `top`/`height` layout properties (Phase 4),
`body { position: fixed; inset: 0 }` is still in `app/globals.css` (Phase 4), the focus/scroll stack
is untouched (Phase 4). Still open after Phase 4: there is no `theme-color` meta tag and
`MobileAdhesionAd` can still mount over the route (Phase 5), and the per-keystroke remount/shake work
is untouched (Phase 6).

---

#### Handoff notes for whoever starts Phase 4 (written 2026-08-03, end of Phase 3) — *superseded, kept as record*

**State of the tree.** Phases 0–3 are all **uncommitted** on branch `billing-guard-and-discounts`
and entangled in one working tree. Modified: `components/category-blitz/CategoryBlitzGame.tsx`
(Phase 0 instrumentation + Phase 2 projection scoping + Phase 3 portal removal/debug marker),
`components/category-blitz/DevAnimationPanel.tsx` and `components/category-blitz/LiveLeaderboard.tsx`
(Phase 2), `components/venue/GameLandingExperience.tsx` and `app/category-blitz/play/page.tsx` and
`components/animations/AnimationOverlay.tsx` (Phase 3),
`tests/category-blitz-mobile-shell-contract.test.ts` (Phases 1 + 3), and this doc. New:
`components/category-blitz/CategoryBlitzPlayShell.tsx`. Untracked: the device screenshots under
`design-system/hightop-challenge-design-system/project/public/brand/category-blitz-broken/`. No
unrelated billing/ad work is staged. `npx tsc --noEmit`, `npm run lint` and the full `vitest` suite
are green.

**Get a device capture before writing Phase 4 code.** Phase 4 is the part that has failed six times,
and the plan itself says it "shrinks to the focus fix and the `transform`-vs-`top` hardening" if
Phase 3 alone closed the band. That is now a cheap question to answer: ask Andrew for one screenshot
at `/category-blitz/play?cbzDebug=1` with the keyboard open and one at rest. Read `magentaLayers`
(must be 0), `heightGap`/`widthGap` (the band's height / the side-strip width, in px), and
`projectedRows` (must be 0). If `heightGap` is 0 and there's still a band, the band is **not** a DOM
layer and Phase 5's `theme-color` work is the live suspect, not Phase 4's frame positioning — do not
start rewriting the frame on the assumption that it's still mis-sized.

**Things Phase 4 must not break** (all verified working at the end of Phase 3): the reveal→board
morph and `projectedRows` going 12→0; the answer-list internal scroll on tap with `scrollY === 0`;
the back button on **both** paths (deep-linked *and* entered from the venue-home card — they take
different branches of `navigateBackToVenue`); presence gating; and the fact that the play shell
creates no stacking context, which is what keeps `VenueAccessOverlay` above gameplay.

**Careful with `body { position: fixed; inset: 0 }`** (`app/globals.css:271-274`, which Phase 4 plans
to drop). The play shell sizes itself with `h-full`, which resolves against `main`/`.tp-app-shell`'s
`h-[100svh]`, not against body — so the shell survives that change. But the shell is what
`runVenueGameReturnTransition` measures, so re-run the venue-home→play→back round trip after touching
it, not just the layout.

**Reproducing the verification setup** (unchanged from Phase 2, plus two things that cost time):

1. Dev server on :3000 (`npm run dev`).
2. Seed script: create the `sim-category-blitz` venue if missing, 3 `auth.users` (via
   `db.auth.admin.createUser`) + matching `public.users` rows (`id` = the auth id, `venue_id` =
   the sim venue), `createSession(venueId, { source: "manual" })`, `registerSessionPresence` × 3,
   **wait on a flag file**, then `startRound(sessionId)`. Run with
   `node --env-file=.env.local --conditions react-server --import tsx <script>.cjs`. The flag-file
   handshake exists because `RoundStartReveal` only mounts while the round is younger than
   `ROUND_START_REVEAL_MAX_MS` (3 s) — the browser must already be on the page when the round
   starts or you never exercise the morph. `startRound` takes **only** `sessionId`.
   `lib/categoryBlitz.ts` needs `grep -a` to search (plain `grep` treats it as binary).
3. Cookies from `node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId> <venueId>
   --format raw`, set via `page.context().addCookies` **before** `goto`.
4. **Two gotchas that will otherwise read as bugs.** (a) Clicking the Category Blitz card on venue
   home does not navigate — it opens `CategoryBlitzOnboardingOverlay` (tutorial slides); click
   `Next` until `Join Game` appears, then `Join Game`. (b) In dev, the first navigation to
   `/venue/[id]` compiles the route and can take ~8 s; a back-button check that only waits 2.5 s
   will look like the back button is broken. Warm the venue route first.
5. Tear down afterwards: delete `category_blitz_sessions` for the venue, then the seeded `users`
   rows, then the `auth.users` rows. Leave the `sim-category-blitz` venue in place.

**Reading Chromium results honestly.** Still not an iOS oracle — it reproduced none of the device
symptoms even against the pre-fix code. It is good for "did the structure change as intended" and
for regression-proofing. Phase 4's real exit is Andrew's device check.

---

#### Handoff notes for Phase 3 (written 2026-08-03, end of Phase 2) — *superseded, kept as record*

**State of the tree.** Phases 0, 1 and 2 are all **uncommitted** on branch
`billing-guard-and-discounts`, and they are entangled in the same working tree:
`components/category-blitz/CategoryBlitzGame.tsx` (Phase 0 debug instrumentation + Phase 2
projection scoping), `components/category-blitz/DevAnimationPanel.tsx` and
`components/category-blitz/LiveLeaderboard.tsx` (Phase 2),
`tests/category-blitz-mobile-shell-contract.test.ts` (Phase 1), this doc, and the untracked
device screenshots under
`design-system/hightop-challenge-design-system/project/public/brand/category-blitz-broken/`.
Nothing has been committed and no unrelated (billing/ad) work is staged. `npx tsc --noEmit`,
`npm run lint` and the full `vitest` suite are green at this point.

**What Phase 2 leaves you.** `AnsweringScreen` no longer holds layout-projection nodes during
gameplay, so if Phase 3 changes the shell and rows still misbehave on device, projection is
already ruled out — check `projectedRows` in the `?cbzDebug=1` panel to confirm it's 0. Do not
"tidy up" the two-branch (motion vs plain) render of the rows/badge back into one `motion.div`
with a conditional `layoutId`; a plain element is the only way to guarantee no projection node
exists, and that is the entire point of the phase.

**Things Phase 3 must not break (they were verified working at the end of Phase 2):**
`RoundStartReveal` → `AnsweringScreen` morph, `finishedRevealRoundId` gating (`morphFromReveal`
is derived from it), the answer-list internal scroll on tap, `scrollY === 0`, and
`markRevealDone`'s auto-scoring gate. If Phase 3 removes the portal (`renderGamePortal`), note
that `AnsweringScreen`'s morph partners live across that boundary — re-verify the morph after,
not just the layout.

**Reproducing the verification setup** (this is the fastest loop found; ~2 min per run):

1. Dev server on :3000 (`npm run dev`).
2. Seed a real round with a "go" handshake so the browser catches the reveal live — the reveal
   only mounts while the round is younger than `ROUND_START_REVEAL_MAX_MS` (3 s), so you must
   **start the round and navigate within ~3 s**, otherwise you land on a plain board and never
   exercise the morph. A one-off seed script (create the `sim-category-blitz` venue if missing,
   3 real `auth.users` + `public.users` players, `createSession(venueId, { source: "manual" })`,
   `registerSessionPresence` × 3, wait for a flag file, then `startRound(sessionId)`) run with
   `node --env-file=.env.local --conditions react-server --import tsx <script>.cjs` does it.
   Two gotchas: `startRound` takes **only** `sessionId` (no testMode arg — pass `testMode` via
   `createSession` if you want a 10 s round), and a script living in the scratchpad must
   `require()` project deps by absolute path (`<project>/node_modules/@supabase/supabase-js`).
3. Cookies from `node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId>
   <venueId> --format raw` (the `playwright` format prints a JS object literal, not JSON — parse
   `raw` instead), set via `page.context().addCookies` **before** `goto`.
4. Tear down afterwards: delete `category_blitz_sessions` for the venue, then the seeded
   `users` + `auth.users` rows. Leave the `sim-category-blitz` venue in place.

**Reading Chromium results honestly.** Headless Chromium reproduced *none* of the device
symptoms — no magenta, no torn frame, no stale projection — even with the pre-fix code. It is
useful for "did the DOM/structure change as intended" and for regression-proofing, and useless
as an iOS oracle. Phase 3's real exit is Andrew's device check.

**Model: Opus 5 · effort: high.** Architectural change touching analytics, presence, back
navigation, and the venue transition. The failure mode is silent (points stop being attributed,
back button strands the user) rather than visual, so it needs care rather than iteration.

**Exit:** `/category-blitz/play` renders exactly one full-screen dark surface in the DOM, with no
sizing seam on any edge — this also closes Finding G (the persistent left/right magenta strips):
once there's no magenta layer underneath at any point in the stack, a sub-pixel width mismatch
has nothing to expose. Back-to-venue, presence gating, and point attribution all verified
unchanged.

---

### Phase 4 — iOS keyboard contract (v9) ✅ *done 2026-08-03 (see as-built below)* ← *belt-and-suspenders for Finding F*

Only attempt this after Phase 3 has been checked on device — with the magenta layer gone, any
remaining gap exposes only `html`/`body`'s own background, which is already pinned to `#020617`
by `html.tp-category-blitz-game-active` / `body.tp-category-blitz-game-active`
(`app/globals.css:259-274`). If Phase 3 alone closes the screenshots' magenta band, this phase
shrinks to the focus fix and the `transform`-vs-`top` hardening, done for robustness rather than as
an active fix. **Read "Handoff notes for whoever starts Phase 4" under Phase 3 first** — it says
which debug-panel numbers decide how much of this phase is still needed.

- **Position the frame with `transform: translate3d(0, offsetTop, 0)`, not `top:`.** iOS composites
  transforms on the GPU and updates them on the same frame as the keyboard animation; `top:` on a
  `position: fixed` element is a layout property and lands a frame or more late, which by itself
  produces a torn frame. This is a genuinely different mechanism from anything in attempts 1–6,
  all of which used `top`/`height` layout properties.
- **Drop `body { position: fixed; inset: 0 }`** (`app/globals.css:271-274`). Suspicion C in the
  handoff, still untested. Replace with `html, body { overflow: hidden; overscroll-behavior: none;
  background: #020617; }` and let the fixed portal own the viewport.
- **Focus synchronously inside the gesture.** Call `editorInput.focus()` directly in the
  `onPointerDown` handler (`CategoryBlitzGame.tsx:1393-1396`), not from
  `setTimeout(focusEditor, 0)` (`:1192`). Keep `preventScroll: true`.
- **Collapse six scroll corrections into one.** Replace the 0/40/220/420 ms timer stack plus the
  `visualViewport` one-shot listener (`:1186-1201`) with a single correction fired once the
  `visualViewport.resize` has *settled* (no further resize for ~120 ms), using `behavior: "auto"`.
  Competing `smooth` scrolls during a keyboard animation cannot look like an app.
- Do **not** re-litigate the guardrails: no `--cbz-layout-height`, no hidden proxy input, no
  pinned-editor-plus-shield. Those are falsified.

**Model: Opus 5 · effort: xhigh.** This is the part that has failed six times. The premium is
worth it here specifically because the failure mode is "plausible reasoning that is wrong about
iOS," and more deliberation is the only lever that helps when device iteration is slow.

**Exit:** device capture shows the frame tracking the keyboard with no intermediate torn frame,
and `window.scrollY` stays 0 throughout.

#### Phase 4 — as built (2026-08-03) ✅

**No new device capture was available.** The three screenshots handed over at the start of this
phase are the same pre-Phase-3 set already described under "Real-device evidence" (same 9:11
timestamps, no `?cbzDebug=1` panel). So the question the Phase 3 handoff wanted answered first —
"did Phase 3 alone close the band, making Phase 4 a robustness-only pass?" — is still open, and
Phase 4 was executed **in full** rather than shrunk. Every change here is correct independent of
the answer.

**One thing did come out of re-measuring those screenshots, and it reframes Finding F.** In
`after-open-keyboard.PNG` the frame's bottom edge sits ~105 CSS px above the top of the keyboard's
`^ v ✓` accessory bar, with the floating `play.hightopchallenge.com` URL pill inside that gap. That
gap is very close to the combined height of Safari's accessory bar plus its URL pill — both of
which are **outside `visualViewport.height` by definition**. If that reading is right, the frame
was never mis-sized at all: the band is the region Safari's own chrome occupies, which no frame
height can ever fill, and the only thing that was ever wrong about it was **what color painted
underneath it**. That makes the backdrop below the real fix and demotes frame-sizing precision to
a secondary concern. It is a hypothesis from pixel measurements, not from instrumentation — the
`heightGap` number on a real device settles it (0 ⇒ this reading is right).

**What changed**

- **The game is now two elements instead of one** (`CategoryBlitzGame.tsx`, new
  `CategoryBlitzFrame` wrapper used by all four return branches):
  - `[data-category-blitz-game-root]` is a **backdrop**: `fixed inset-0 z-[100] bg-slate-950`,
    covering the whole **layout** viewport, which iOS never shrinks for the keyboard. This is the
    paint guarantee, and it is deliberately decoupled from any live measurement, so it cannot lag
    the keyboard animation. Anything the frame above it fails to cover is `#020617` — the same
    color `html`/`body` are pinned to. This is Finding F's "make the frame's dark background
    provably always reach at least to `window.innerHeight`".
  - `[data-category-blitz-visible-frame]` is the element that tracks the **visual** viewport and
    holds the game's flex column. It carries the per-phase background (`pageTheme.pageBg`).
- **The frame is offset with `transform: translate3d(...)`, not `top`/`left`** — geometry moved
  into `.tp-cbz-visible-frame` in `app/globals.css` (following the existing
  `.tp-bingo-landscape-shell` precedent for a game shell sized off dynamic CSS vars), with
  `will-change: transform`. Height is still a layout property because the flex column needs a
  resolved height; the point of the split is that a late height now only means content settles a
  frame late **over dark**, instead of opening a hole in the page. Pre-hydration fallbacks changed
  from `100vw`/`100svh` to `100%`/`100%`, which resolve against the backdrop — `100svh` is the
  *small* viewport and undershoots.
- **`body { position: fixed; inset: 0 }` is gone** (`app/globals.css`). The rest of the lock
  (`overflow: hidden`, `overscroll-behavior: none`, `height: 100%`, `background-color: #020617`,
  all `!important`) was already there and is untouched, so this is a pure deletion. A comment now
  records that it was dropped on purpose. The play shell sizes itself with `h-full` against
  `.tp-app-shell`'s `h-[100svh]`, not against body, so it is unaffected.
- **Focus is synchronous inside the gesture.** `focusAnswerRow` calls
  `editorInput.focus({ preventScroll: true })` directly; the `setTimeout(focusEditor, 0)` is gone.
  The caret-to-end moved into a `useEffect` keyed on `activeAnswerIndex` — it *has* to run after
  the commit that swaps in the new row's value, because synchronously it would target the previous
  row's text (and React moves the caret again anyway when it writes the new value).
- **Six scroll corrections became one.** The 0/40/220/420 ms timer stack plus the one-shot
  `visualViewport resize` listener (which scheduled two more `smooth` scrolls) is replaced by
  `scheduleAnswerScroll`, which fires exactly one `behavior: "auto"` correction:
  - keyboard already open (taps 2..12 of a round — no viewport change is coming): **immediately**,
    because waiting 120 ms for nothing just feels laggy. It keeps listening for
    `VIEWPORT_SETTLE_FALLBACK_MS` in case the keyboard changes height under it (emoji/autocorrect
    bar, hardware keyboard).
  - keyboard opening: once `visualViewport` has held still for `VIEWPORT_SETTLE_MS` (120 ms), with
    a 400 ms fallback for the case where no resize ever arrives.
  There is no `"smooth"` scroll left anywhere in the file; the contract test now enforces that.
- **`applyCategoryBlitzVisibleViewportFrame` dedupes on a geometry signature**, so the
  `visualViewport scroll`/`resize` burst during a keyboard animation doesn't invalidate the frame's
  style (and with it its height, a layout property) once per event when nothing actually moved.
- **Debug panel (`?cbzDebug=1`)**: `LAYOUT_DEBUG_VERSION` is now **`cbz-p4-keyboard-contract`**.
  `heightGap`/`widthGap` now measure the **visible frame** vs `visualViewport` (their original
  intent). Three new lines: `frameFull` (the frame's rect), `frame xf` (its computed transform —
  must be a `matrix`, never `none`, or the frame has fallen back to layout positioning), and
  **`backdropGap h· w·`**, which is `innerWH` minus the backdrop's rect and **must be 0 in every
  keyboard state** — that is the paint guarantee, and it is the single most useful number on the
  panel now.
- **Contract tests** (`tests/category-blitz-mobile-shell-contract.test.ts`, +2): the backdrop is
  `fixed inset-0` and dark; the frame is offset by `translate3d` and not by
  `[top:var(--cbz-visible-top)]`; no `"smooth"` scroll in the game source. All three fail against
  the pre-Phase-4 tree (`BACKDROP_CLASS` and `.tp-cbz-visible-frame` don't exist; `"smooth"` did).
  Deliberately **not** asserted: that `body` isn't `position: fixed` — the existing test at
  "locks the page background/scroll" explicitly refuses to pin the CSS mechanism, and that
  decision still stands.

**Verified** (headless Chromium 390×844, real dev server, real seeded round on `sim-category-blitz`
driven with Playwright; sim data torn down afterwards). 43 checks across three scripts:

| Check | Result |
|---|---|
| Backdrop is `fixed`, covers the layout viewport, paints `#020617` | ✅ `l0 t0 w390 h844` = `innerWidth × innerHeight`, `rgb(2, 6, 23)` |
| Visible frame is `absolute` + offset by a `matrix`, not `top`/`left` | ✅ `matrix(1, 0, 0, 1, 0, 0)` |
| Visible frame matches the visual viewport at rest | ✅ `heightGap 0 widthGap 0` |
| `body` is no longer `position: fixed`, page still locked | ✅ `static`, `overflow: hidden`, `scrollY 0` |
| No magenta anywhere on the route | ✅ `magentaLayers 0` at lobby, answering, after resize, and after the venue-home open transition |
| Reveal → board morph survived the new frame | ✅ `projectedRows` 0 → **12** at 3.17 s (board mounts out of the reveal) → **0** at 3.90 s, with a non-identity badge transform observed mid-morph |
| Frame transform stayed a live matrix through the morph | ✅ never `none` |
| Tap a row | ✅ editor focused, answer **list** scrolled (`0→4`), `scrollY 0`, no per-row transforms |
| Typing + caret | ✅ "Banana" lands, caret at 6; switching rows swaps the value and resets the caret to 0 |
| Keyboard-sim shrink 844→504 | ✅ backdrop `h504` = `innerHeight`, frame `h504` = `vv.height`, all 12 rows move by ONE delta, transforms `none`, `scrollY 0`, **editor stays focused** |
| Frame grows back on keyboard close | ✅ 844, no parked-short frame |
| Back button, deep-linked path | ✅ lands on venue home, game root + overlays torn down, `tp-category-blitz-game-active` cleaned |
| Back button, venue-home-card path (the other `navigateBackToVenue` branch) | ✅ tutorial → Join Game → play → back; open overlay torn down, `--cbz-visible-*` vars cleared, venue home scrolls again |
| `?cbzDebug=1` panel renders the Phase 4 fields | ✅ `backdropGap h0 w0`, `frame xf matrix(…)`, `frameFull`, `magentaLayers 0` |
| `npx tsc --noEmit`, `npm run lint`, full `vitest` (1314 tests) | ✅ green |

**Two verification traps worth recording** (both initially read as bugs):

1. **The `?cbzDebug=1` panel is `fixed z-[99999]` and intercepts taps on the rows beneath it.**
   Playwright's `tap()` times out on those rows; `tap({ force: true })` "succeeds" but the touch
   hit-tests onto the panel, which blurs the editor. That produced a false "editor input lost focus
   across the resize" failure *and* made a caret assertion pass vacuously. **Drive the game with
   the panel off**, and check the panel separately on its own page.
2. **The continuous engine abandons a manually-created lobby session while the browser sits on
   it** (`Cannot start round on a session with status 'abandoned'`). The Phase 2/3 flag-file
   handshake (browser waits on the lobby, script then calls `startRound`) no longer works for the
   reveal window. What works: **start the round first, then navigate** — the reveal still mounts
   because the round is younger than `ROUND_START_REVEAL_MAX_MS` (3 s), and it still hands off with
   `morphFromReveal` true. Warm the route with an earlier `goto` so a dev compile doesn't eat the
   3 s. `scripts/` equivalents are in the scratchpad note below.

**Honest limits — same caveat as Phases 2 and 3, and it matters most here.** Headless Chromium
reproduced none of the device symptoms before any of this work and reproduces none after it. None
of the above is evidence that the iOS keyboard tear is fixed. What it *is* evidence of: the
structure changed exactly as intended, the paint guarantee holds in every state tested, and nothing
that worked at the end of Phase 3 broke. Phase 4's real exit is Andrew's device check, and this
phase is **not** the fourth-through-seventh blind fix — it is deliberately the one change that
does not depend on getting a measurement right.

**The one thing to suspect if a NEW symptom appears on device:** `will-change: transform` on
`.tp-cbz-visible-frame` permanently promotes a full-screen compositing layer that contains the
text input. That is the intended mechanism (it is what keeps the offset update on the GPU), and
`translate3d` would promote the layer anyway, so removing `will-change` alone changes little — but
if the device shows caret/text-rendering artifacts that were *not* in the pre-Phase-4 screenshots,
this line is the first thing to try dropping.

---

#### Handoff notes for whoever starts Phase 5 (written 2026-08-03, end of Phase 4) — *superseded, kept as record*

**Ask Andrew for a device capture before anything else — and this time it decides two phases.**
One screenshot at `/category-blitz/play?cbzDebug=1` with the keyboard open, one at rest. Read four
numbers off the panel and the branch is unambiguous:

| Reading | What it means | What to do |
|---|---|---|
| `backdropGap h0 w0`, `magentaLayers 0`, band is **dark** | Everything worked. The "band" is Safari's own chrome zone (accessory bar + URL pill), which is outside `visualViewport` and cannot be filled by any frame | Phase 5 proceeds as written; the `theme-color` bullet is now the *most* valuable one, since Safari tints that chrome from sampled page color |
| `backdropGap` **non-zero** | The paint guarantee itself is broken — the backdrop isn't covering the layout viewport on iOS | Stop. That is a Phase 4 bug, not a Phase 5 one. Most likely cause: `position: fixed; inset: 0` resolving against something other than the layout viewport (a transformed ancestor) |
| `magentaLayers` **non-zero** | A `#a10d63` layer is still in the DOM and the panel now names it | Finding B / the `MobileAdhesionAd` and `venueGameTransition` bullets in Phase 5 become the live fix, not the `theme-color` one |
| `heightGap` **non-zero and large** while the band is dark | The frame really is parked short (the "wrong reference value" arm of Finding F), and the pixel-measurement reframing above is wrong | Frame sizing is back on the table — but note the backdrop means it now costs a dark gap, not a colored band |

**`frame xf` must read a `matrix`, never `none`.** `none` means the transform positioning silently
stopped applying and the frame is back to layout positioning — i.e. Phase 4's central mechanism is
not actually live in that build.

**State of the tree.** Phases 0–4 are all **uncommitted** on branch `billing-guard-and-discounts`,
entangled in one working tree. Modified: `components/category-blitz/CategoryBlitzGame.tsx`
(Phases 0, 2, 3, 4), `app/globals.css` (Phase 4), `components/category-blitz/DevAnimationPanel.tsx`
and `components/category-blitz/LiveLeaderboard.tsx` (Phase 2),
`components/venue/GameLandingExperience.tsx`, `app/category-blitz/play/page.tsx` and
`components/animations/AnimationOverlay.tsx` (Phase 3),
`tests/category-blitz-mobile-shell-contract.test.ts` (Phases 1, 3, 4), and this doc. New:
`components/category-blitz/CategoryBlitzPlayShell.tsx`. Untracked: the device screenshots under
`design-system/hightop-challenge-design-system/project/public/brand/category-blitz-broken/` (still
the pre-Phase-3 set). No unrelated billing/ad work is staged. `npx tsc --noEmit`, `npm run lint`
and the full `vitest` suite (1314 tests) are green.

**Things Phase 5 must not break** (all verified working at the end of Phase 4): the backdrop's
`backdropGap h0 w0` in every keyboard state; `frame xf` staying a matrix; the reveal→board morph
(`projectedRows` 0→12→0); the answer-list internal scroll with `scrollY === 0`; the editor staying
focused across a viewport resize; the back button on **both** paths; and the play shell creating no
stacking context, which is what keeps `VenueAccessOverlay` above gameplay.

**Two Phase 5 bullets interact with Phase 4 — read before editing.**

- **`themeColor: "#020617"`** is now the natural completion of Phase 4's backdrop: the backdrop
  guarantees the *page* is dark everywhere, and `theme-color` is the only way to make Safari's own
  chrome (URL bar, keyboard accessory strip) stop sampling page color. If the pixel-measurement
  reframing above is right, **this is the bullet that removes the last colored surface in the
  keyboard-open screenshot**, and it should be treated as a primary fix rather than hygiene.
- **`interactiveWidget: "resizes-content"`** changes what `visualViewport` reports on Android
  Chrome, which is exactly what the frame is sized from. Harmless in principle (it makes Android
  behave like the code already assumes) but it must be re-checked against `backdropGap`/`heightGap`
  in a resized viewport, not assumed.

**Reproducing the verification setup** (updated — the Phase 2/3 recipe no longer catches the
reveal):

1. Dev server on :3000 (`npm run dev`).
2. **Start the round BEFORE the browser navigates.** The old flag-file handshake (browser waits on
   the lobby, script then calls `startRound`) fails now: the continuous engine abandons a manual
   lobby session while the browser sits on it, and `startRound` throws
   `Cannot start round on a session with status 'abandoned'`. Instead: delete any
   `category_blitz_sessions` for the venue, `createSession(venueId, { source: "manual" })`,
   `registerSessionPresence` × 3, `startRound(sessionId)` — then `goto` within ~2 s. The reveal
   still mounts (round younger than `ROUND_START_REVEAL_MAX_MS` = 3 s) and still hands off with
   `morphFromReveal` true. Warm the route with an earlier `goto` first or a dev compile eats the
   window. Run with
   `node --env-file=.env.local --conditions react-server --import tsx <script>.cjs`.
   `startRound` takes **only** `sessionId`. `lib/categoryBlitz.ts` needs `grep -a`.
3. Seeded players: 3 `auth.users` via `db.auth.admin.createUser` + matching `public.users` rows
   (`id` = the auth id, `venue_id` = the sim venue). Cookies from
   `node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId> <venueId> --format raw`,
   set via `page.context().addCookies` **before** `goto`.
4. **Drive the game with `?cbzDebug=1` OFF.** The panel is `fixed z-[99999]` at top-right and
   hit-tests over the answer rows: `tap()` times out, `tap({ force: true })` lands on the panel and
   blurs the editor. Check the panel on a separate page instead.
5. Venue-home path gotchas (unchanged): clicking the Category Blitz card opens
   `CategoryBlitzOnboardingOverlay` — click `Next` until `Join Game` appears; and in dev the first
   `/venue/[id]` navigation compiles the route (~8 s), so warm it before timing a back-button check.
6. Tear down: delete `category_blitz_sessions` for the venue, then the seeded `users` rows, then
   the `auth.users` rows. Leave the `sim-category-blitz` venue in place.

**Reading Chromium results honestly.** Unchanged and worth repeating: it reproduced none of the
device symptoms even against the pre-fix code. Good for "did the structure change as intended" and
for regression-proofing; useless as an iOS oracle.

**Note for Phase 7's harness author:** three of Phase 4's checks are worth lifting verbatim into
the permanent harness — `backdropGap === 0` in both keyboard states, `frame xf` matching `/^matrix/`,
and the venue-home-card back path (which is a different code branch from the deep-linked one that
Phase 3 tested). The Phase 4 scripts live in the session scratchpad, not in the repo.

---

### Phase 5 — Chrome, overlays, and the magenta ✅ *done 2026-08-03 (see as-built below)*

- **Add `themeColor: "#020617"`** to the `viewport` export in `app/layout.tsx:58-62`. Removes
  Safari's color sampling from the equation entirely. Verify it does not regress `/info` or the
  venue home, which are the branded surfaces.
- **Add `interactiveWidget: "resizes-content"`** to the same export. Android Chrome's default
  (`resizes-visual`) means the layout viewport does not shrink for the keyboard — the same class
  of bug on the other platform, currently unhandled.
- **Exclude game routes from `MobileAdhesionAd`.** Give `resolvePageKey`
  (`components/ui/MobileAdhesionAd.tsx:36-62`) an explicit `/category-blitz` case and gate the
  on-load path (`:196-223`) so a `global` banner cannot mount `z-[1600]` over live gameplay.
  Confirm the intended ad policy for the other game routes before changing them — this is a
  revenue surface, so it is Andrew's call whether the exclusion is Category Blitz only or all games.
- **Harden the venue transition teardown.** `lib/venueGameTransition.ts:489-540` appends a
  `z-2100` magenta overlay to `document.body` outside React. Add a defensive sweep on Category
  Blitz play mount that removes any orphaned `[data-venue-transition]` node, and confirm the
  `finally` block cannot be skipped by an interrupted navigation.
- **Write down the z-index ladder** in a comment: portal `100` · `AnimationOverlay` `1200` ·
  `PageShell` header `1000` · `MobileAdhesionAd` `1600` · `venueGameTransition` `2100` ·
  `PopupAds` `5000` · `GlobalTransitionOverlay` `6500`. Right now nothing records that the game
  sits at the bottom of a stack of seven full-screen layers; that is how a stray overlay goes
  unnoticed for six debugging rounds.

**Model: Sonnet 5 · effort: medium.** Individually small, well-scoped edits. Flag the ad-policy
question to Andrew rather than deciding it.

**Exit:** no non-game layer can paint over `/category-blitz/play`, and no browser-chrome tint is
derived from page content.

#### Phase 5 — as built (2026-08-03) ✅

**No new device capture was available.** Same situation as Phase 4: the branch table at the end of
the Phase 4 handoff (`backdropGap`/`magentaLayers`/`heightGap` readings → which bullet is the live
fix) was never resolved against a real screenshot, so this phase was executed **in full** rather
than narrowed to one bullet. Every change below is correct independent of which reading turns out
to be true.

**What changed**

- **`app/layout.tsx`** — the `viewport` export gained `themeColor: "#020617"` and
  `interactiveWidget: "resizes-content"`. No other route sets a `theme-color`
  (`grep -rn themeColor app components` returns only this one line), so there is no conflicting
  branded override to reconcile on `/info` or venue home — this is a single global value, and it
  matches `html`/`body`'s existing pinned background, so it can't introduce a new mismatch anywhere
  else in the app. Not verified in a browser (no way to observe Safari's own chrome-tinting
  locally); this is exactly the thing Andrew's next device capture should read `backdropGap`/band
  color against.
- **`components/ui/MobileAdhesionAd.tsx`** — new `isAdExcludedRoute()` helper
  (`pathname?.startsWith("/category-blitz")`), OR'd into all five existing `isAdminRoute(pathname)`
  guards (the round-banner listener effect, the on-load effect, the scroll-trigger effect, the
  ad-tier-priority sync effect, and the final render guard) rather than a new branch in
  `resolvePageKey`. **Scoped to Category Blitz only** — Andrew's call (asked explicitly, since the
  plan flagged this as a revenue decision): the other game routes (`trivia`, `bingo`, `pickem`,
  `fantasy`) already have dedicated `AdPageKey`s and deliberate round-end ad triggers, which is
  existing, intentional monetization this phase does not touch. Category Blitz never had that
  wiring — it was falling through to the untargeted `"global"` on-load banner, which is the actual
  bug (Finding C).
- **`lib/venueGameTransition.ts`** — new exported `sweepOrphanedVenueTransitionOverlays()`, called
  once from `CategoryBlitzPlayShell`'s mount effect. **Audited first, not blindly added**: both
  `runVenueGameOpenTransition`'s and `runVenueGameReturnTransition`'s `finally` blocks already
  unconditionally clean up (`root.remove()` / style restoration) even if `navigate()` rejects, so
  the "confirm the finally block cannot be skipped" half of the Phase 5 bullet is **already true
  today, not a bug** — no logic changed there. The sweep is a second, defensive layer for a
  narrower case that check can't cover (bfcache restore, or a re-entrant transition mounting the
  destination route before a prior overlay's `finally` has run), which is why it's a no-op query +
  remove rather than a rewrite of the transition functions.
- **`components/category-blitz/CategoryBlitzGame.tsx`** — the partial z-index comment on
  `BACKDROP_CLASS` (added in Phase 4) is now the full ladder: `100` portal · `140`
  `VenueAccessOverlay` · `1000` `PageShell` header · `1200` `AnimationOverlay` · `1600`
  `MobileAdhesionAd` (now excluded here) · `2100` `venueGameTransition` · `5000` `PopupAds` · `6500`
  `GlobalTransitionOverlay`. All eight values re-verified against source at write time (not copied
  from the plan doc unchecked).

**Verified:**

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ clean |
| Full `vitest` suite | ✅ 1314 passed, 13 skipped (unchanged from Phase 4's count — this phase added no new tests, see "Not done" below) |
| `grep -rn themeColor app components` | ✅ exactly one hit, the new line — no conflicting per-route override to reconcile |
| All five `isAdminRoute` guard sites in `MobileAdhesionAd.tsx` also gate on `isAdExcludedRoute` | ✅ mechanical `sed`-style replace, verified by count (5 occurrences both before and after) |
| Eight z-index values in the new ladder comment | ✅ each re-grepped against its source file at write time |

**Not done here / honest limits.**

- **No new automated test was added.** Phase 5's changes are (a) a metadata field with no DOM
  assertion surface in headless Vitest/jsdom, (b) a route-string exclusion in an ads component with
  no existing test file to extend, and (c) a defensive no-op sweep. Phase 7 (regression harness) is
  the right place to decide whether any of these need a permanent assertion — a reasonable one:
  extend `tests/category-blitz-mobile-shell-contract.test.ts` with a static-source check that
  `/category-blitz` appears in an ad-exclusion path in `MobileAdhesionAd.tsx`, mirroring how that
  file already asserts other source-level invariants.
- **No browser verification of `theme-color`** or the ad exclusion actually suppressing a banner —
  neither is observable through the project's existing headless-Chromium `verify` skill loop
  (Safari chrome tinting isn't a DOM property; the ad slot API needs a live venue with ad inventory
  configured, which the sim venue doesn't have). Both are open until a real device / real ad
  inventory check.
- **`interactiveWidget: "resizes-content"` is Android-only in effect** (Safari ignores this Viewport
  key) and was not testable in this pass — no Android device or emulator available. Low risk (it
  only changes behavior on a platform this bug wasn't reported on) but flagged so Phase 8 doesn't
  assume it was device-verified.

---

#### Handoff notes for whoever starts Phase 6 (written 2026-08-03, end of Phase 5)

**Ask Andrew for a device capture before writing Phase 6 code — the same four-number read from the
end-of-Phase-4 handoff, still unanswered.** One screenshot at `/category-blitz/play?cbzDebug=1`
with the keyboard open, one at rest. This has now been asked for at the end of both Phase 4 and
Phase 5 without a new capture arriving; the three screenshots on file are still the original
pre-Phase-3 set. Read `backdropGap` (must be `h0 w0`), `magentaLayers` (must be `0`), `heightGap`,
and the band's actual color in the screenshot:

| Reading | What it means | What to do |
|---|---|---|
| `backdropGap h0 w0`, `magentaLayers 0`, band is **dark** | Phases 3–5 all worked; the remaining band (if any) is Safari's own chrome zone, and Phase 5's `theme-color` addition is the thing to check removed it | Proceed straight to Phase 6 |
| `backdropGap` **non-zero** | The paint guarantee itself is broken on iOS | Stop — this is a Phase 4 regression, not a Phase 6 concern. Do not start Phase 6 until this is understood |
| `magentaLayers` **non-zero** | A `#a10d63` layer is still in the DOM | Phase 5's ad-exclusion / transition-sweep bullets didn't fully close Finding B/C, or there's a source not yet named — the panel's per-element scan should say which element it is |
| Band is still colored even with `backdropGap 0` and `magentaLayers 0` | `theme-color` didn't take, or Safari is sampling something else | Worth a second look at the `viewport` export — confirm the build actually shipped it (check page source `<meta name="theme-color">`) |

**If Phase 6 is started anyway without a capture** (typing-path performance work is largely
independent of the magenta/keyboard-tear investigation and safe to do in parallel): nothing in
Phase 6's scope (row memoization, `ValidAnswerGlow`/`WrongLetterReject` remount/debounce, the 4 Hz
`nowMs` isolation, the `font-size: 16px` check) depends on Finding F/G being resolved. It's fine to
proceed on typing performance while the device-capture question stays open, but don't fold Phase 6
and Phase 8 (device acceptance) together — they answer different questions.

**State of the tree.** Phases 0–5 are all **uncommitted** on branch `billing-guard-and-discounts`,
entangled in one working tree. Modified beyond what Phase 4's handoff already listed:
`app/layout.tsx` (Phase 5 `themeColor`/`interactiveWidget`), `components/ui/MobileAdhesionAd.tsx`
(Phase 5 ad exclusion), `lib/venueGameTransition.ts` (Phase 5 `sweepOrphanedVenueTransitionOverlays`),
`components/category-blitz/CategoryBlitzPlayShell.tsx` (Phase 5 sweep call),
`components/category-blitz/CategoryBlitzGame.tsx` (Phase 5 z-index ladder comment, on top of Phases
0/2/3/4's changes), plus this doc. No unrelated billing/ad work is staged. `npx tsc --noEmit`,
`npm run lint` and the full `vitest` suite (1314 tests) are green as of the end of Phase 5.

**Things Phase 6 must not break** (all verified working at the end of Phase 5, unchanged from
Phase 4 — Phase 5 touched no gameplay/focus/scroll code): the backdrop's `backdropGap h0 w0` in
every keyboard state; `frame xf` staying a matrix; the reveal→board morph (`projectedRows`
0→12→0); the answer-list internal scroll with `scrollY === 0`; the editor staying focused across a
viewport resize; the back button on **both** paths; the play shell creating no stacking context.
Phase 6 explicitly touches `ValidAnswerGlow`, `WrongLetterReject`, and the row-rendering path, so
re-run the full tap/type/resize check list from the Phase 4 as-built table, not just a typing smoke
test — a careless memo boundary around the answer rows is exactly the kind of change that could
silently reintroduce Finding A (stale row transforms) that Phase 2 scoped away.

**A Category Blitz ad-exclusion regression test does not exist yet.** If Phase 7's harness author
wants one sooner, the `MobileAdhesionAd.tsx` change (Phase 5) has no dedicated test file today —
see "Not done here" in the Phase 5 as-built above for the suggested static-source assertion to add
to `tests/category-blitz-mobile-shell-contract.test.ts`.

**Reproducing the verification setup.** Unchanged from the Phase 5 recipe (identical to Phase 4's,
reproduced here for convenience — nothing about seeding changed in Phase 5):

1. Dev server on :3000 (`npm run dev`).
2. Start the round BEFORE the browser navigates: delete any `category_blitz_sessions` for the
   venue, `createSession(venueId, { source: "manual" })`, `registerSessionPresence` × 3,
   `startRound(sessionId)` — then `goto` within ~2 s (the reveal only mounts while the round is
   younger than `ROUND_START_REVEAL_MAX_MS` = 3 s). Warm the route with an earlier `goto` first so a
   dev compile doesn't eat the window. Run with
   `node --env-file=.env.local --conditions react-server --import tsx <script>.cjs`. `startRound`
   takes **only** `sessionId`. `lib/categoryBlitz.ts` needs `grep -a`.
3. Seeded players: 3 `auth.users` via `db.auth.admin.createUser` + matching `public.users` rows.
   Cookies from `node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId> <venueId>
   --format raw`, set via `page.context().addCookies` **before** `goto`.
4. Drive the game with `?cbzDebug=1` **OFF** — the panel is `fixed z-[99999]` and hit-tests over the
   answer rows, producing false focus-loss failures. Check the panel on a separate page.
5. Venue-home path gotchas: clicking the Category Blitz card opens
   `CategoryBlitzOnboardingOverlay` — click `Next` until `Join Game` appears; the first
   `/venue/[id]` navigation in dev compiles the route (~8 s), so warm it before timing a back-button
   check.
6. Tear down: delete `category_blitz_sessions` for the venue, then the seeded `users` rows, then the
   `auth.users` rows. Leave the `sim-category-blitz` venue in place.

**Reading Chromium results honestly.** Unchanged, worth repeating every handoff: headless Chromium
has reproduced none of the device symptoms at any point in this plan, before or after any phase's
fix. Good for "did the structure change as intended" and regression-proofing; useless as an iOS
oracle. Phase 6's typing-path work is more testable this way than Phases 3–5 were (dropped
characters and caret jumps are DOM-observable), but the magenta/tear question remains device-only.

---

### Phase 6 — Typing path performance ✅ *done 2026-08-03 (see as-built below)*

- Memoize the answer row into its own component so a timer tick re-renders the header, not twelve
  rows. `AnsweringScreen` currently rebuilds the whole list on every `timeRemaining` change while
  the user is typing.
- Stop remounting `ValidAnswerGlow` per keystroke (`:1410`) — key it on the *transition* into a
  valid state, not on the answer string.
- Debounce `WrongLetterReject`'s shake so it fires once when the answer becomes wrong-letter, not
  on every subsequent character.
- Isolate the 4 Hz `nowMs` interval (`:1788-1791`) so it only drives the components that need it;
  it currently re-renders the entire game root, including the answering screen.
- Confirm the editor input keeps `font-size: 16px` (`text-base`, `:1492`) — below 16 px iOS zooms
  the page on focus, which would look exactly like the reported corruption. It is correct today;
  add a comment so it is not "cleaned up" later.

**Model: Sonnet 5 · effort: medium-high.** Standard React performance work, but it touches a
component with real focus-management state — a careless memo boundary drops the caret.

**Exit:** typing a full 12-answer round produces no dropped characters and no caret jumps.

#### Phase 6 — as built (2026-08-03) ✅

**No new device capture was available** — same situation as every phase since Phase 4: asked for
again at the start of this phase, not supplied. The four-number branch table at the end of the
Phase 5 handoff is still unresolved. This phase's scope (typing-path render/remount frequency) is
independent of that open question either way, per the Phase 5 handoff's own note, so it was
executed in full rather than blocked on it.

**What changed** (`components/category-blitz/CategoryBlitzGame.tsx` only):

- **New `AnswerRow` component, wrapped in `React.memo`,** extracted from the inline
  `categories.map(...)` body that used to live directly in `AnsweringScreen`'s render. It owns one
  row's button markup, its `WrongLetterReject` wrapper, and its `ValidAnswerGlow`. Props are
  `index`, `category`, `letter`, `answer`, `isActive`, `disabled`, `theme`, `activeRingClass`,
  `activeCaretClass`, `onActivate` — all either primitives, a stable `GAME_THEME[...]` object
  reference, or `focusAnswerRow` itself (already a `useCallback` with narrow deps). Default shallow
  prop comparison is sufficient: for the 11 rows a keystroke or timer tick doesn't touch, every one
  of these props is referentially/value-unchanged, so `React.memo` bails without re-rendering them.
  The row wrapper that toggles between `motion.div` (during the reveal morph) and a plain `div`
  (Phase 2's `morphActive` split) is unchanged — it still lives in `AnsweringScreen`, one level
  above `AnswerRow`, so the projection lifecycle Phase 2/3 built is untouched.
- **`AnsweringScreen` itself is now `export const AnsweringScreen = memo(function AnsweringScreen(...))`**
  (was a plain `export function`). `categories`/`round.mode` are stable references from
  `useCategoryBlitzSession` — `setRound()` only replaces them on an actual round change, never on
  the root's 4 Hz `nowMs` tick or the 250ms `timeRemaining` tick — so default shallow comparison is
  correct here too; no custom comparator was needed or added. This is what actually stops the 4 Hz
  root tick from cascading into the answering screen: memoizing the row alone wouldn't have helped
  if the parent kept re-executing `AnsweringScreen`'s own function body (rebuilding the `.map()`,
  recomputing `theme`, etc.) every 250ms regardless of whether any row's props changed.
- **`ValidAnswerGlow`'s remount key changed from `key={answer}` to a `glowToken` counter** that only
  increments on the false→true transition of `isValid` (`filled && !wrongLetter`), computed with
  React's documented "adjust state during render, compared against a previous-render value stored
  in state" pattern — not a `useEffect` + `setState`, which `eslint-plugin-react-hooks`'s
  `set-state-in-effect` rule (already enabled in this repo) correctly flags as a cascading-render
  anti-pattern. Same pattern for **`WrongLetterReject`'s `shakeToken`**, changed from the raw,
  ever-changing answer string to a `wrongToken` counter that only increments on the false→true
  transition of `wrongLetter`. Net effect: typing "banana" into an already-valid row no longer
  remounts the checkmark-pop SVG or the reject-flash span 6 times: each fires exactly once, on the
  actual state transition, same as it did before this game had 3 minutes of typing to sit through.
- **One-line comment added** above the editor `<input>`'s `className` (no behavior change) recording
  that `text-base` (16px) must not shrink — below 16px iOS zooms the whole page in on focus, which
  would look exactly like this plan's reported corruption.
- Two new small types: `AnswerRowTheme` (`= (typeof GAME_THEME)[CategoryBlitzThemeKey]` — note this
  is keyed off the narrower `CategoryBlitzThemeKey` union from `lib/categoryBlitzModes.ts`, not
  `keyof typeof GAME_THEME`, which would widen to every game's theme shape and lose the
  `filledBorder`/`filledBg`/`filledText` fields this file actually reads) and `AnswerRowProps`.
  `CategoryBlitzThemeKey` is now imported alongside `MODE_CONFIG`.

**Not done here / explicitly out of scope:** the row-wrapper motion/plain toggle, the projection
marker, `focusAnswerRow`/`scheduleAnswerScroll`, the backdrop/frame split, and everything else
Phases 2–5 built are untouched — this phase only touched render/remount *frequency* on the typing
path, not layout, scroll, or focus mechanics.

**Verified** (headless Chromium 390×844, real dev server, real seeded round on `sim-category-blitz`
driven with Playwright; sim data torn down afterwards). One environment wrinkle worth recording for
whoever seeds this venue next: **`NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT=true` in this
`.env.local`**, so `sim-category-blitz` runs continuous mode by default (no per-venue override row
needed) — the continuous engine's self-heal on the client's very first session poll can advance
past a round this script started directly via `engine.startRound()` before the page ever renders
it, so the round the browser shows is not reliably the one the seed script's own return value
describes. Fix: read the letter the client actually rendered
(`[data-category-blitz-letter-badge]` textContent) and build any letter-correct test answers from
*that*, not from the script's local `round.letter`. (This surfaced as a real-looking false positive
first — a letter-correct test answer got flagged "wrong letter" — before the badge-letter check
traced it to a different round being live under the page than the one the script had just
started, not a code bug.)

| Check | Result |
|---|---|
| Reveal→board morph projection lifecycle survived the `AnswerRow` extraction | ✅ `projectedRows` 12 at mount → **0** after the ~600ms settle window, unchanged from Phases 2–5 |
| Typing lands every character, no drops, across multiple distinct rows | ✅ row 0 and row 3 each received their full typed string exactly |
| Caret stays at the end after each keystroke | ✅ `selectionStart === value.length` held throughout |
| Switching rows shows each row's own text, no cross-row bleed | ✅ row 0 still read its own text after focus moved to row 3 and back |
| A letter-correct answer takes the glow path, not the wrong-letter path | ✅ confirmed once the check used the client-rendered letter (see the continuous-mode wrinkle above) |
| A sustained wrong-letter answer (several keystrokes, still wrong) doesn't crash and stays visually flagged | ✅ full string landed, "wrong letter" label present, no thrown error — this is the direct behavioral check for the `WrongLetterReject` debounce fix (a remount-frequency reduction isn't itself screenshot-visible, so "still correct and stable across repeated keystrokes" is what headless Chromium can actually attest to) |
| Keyboard-sim viewport shrink (844→504) while a row is focused/typing | ✅ editor stayed focused, `window.scrollY` stayed 0, all 12 row wrappers moved by one identical delta (no per-row displacement), all row-wrapper `transform`s read `none` (no stray per-row transform reappeared) |
| Editor value survives the resize with no dropped characters | ✅ |
| `npx tsc --noEmit`, `npm run lint`, full `vitest` (1314 tests) | ✅ green — same count as Phase 5; no new automated test was added (see below) |

**Not done here / honest limits.**

- **No new automated test was added to `tests/category-blitz-mobile-shell-contract.test.ts`.** This
  phase's changes (a `memo()` boundary, two remount-token state variables, one comment) have no
  natural static-source assertion the way Phases 1/3/4/5 did (a class literal, an import, a route
  string) — the correctness property is *behavioral* (render/remount count), not structural. Phase
  7 (regression harness) is the right place to decide whether to add a render-count assertion (e.g.
  instrumenting a dev-only render counter behind `?cbzDebug=1` and asserting it stays flat across a
  timer tick while a row is focused) — this phase deliberately didn't invent new debug-panel surface
  that wasn't asked for.
- **Render/remount *frequency* was not measured directly** (no React DevTools profiler hook, no
  render counter). What was verified is the *consequence* a wrong memo boundary would produce —
  dropped characters, caret jumps, cross-row bleed, or a crash on repeated wrong-letter keystrokes —
  and none occurred. This is indirect evidence the memoization is correct, not a direct measurement
  that it reduced render count. If Phase 7 wants the direct measurement, the cleanest approach is
  probably a temporary `console.count` (or a `?cbzDebug=1` panel field) inside `AnswerRow`, gated
  out of production, rather than reaching for React DevTools in a headless harness.
- **Headless Chromium still cannot speak to iOS-only symptoms** — unchanged caveat from every prior
  phase, repeated here because Phase 6 is the first phase since Phase 1 whose exit criterion
  ("no dropped characters and no caret jumps") is fully DOM-observable and headless-testable, unlike
  Phases 3–5's magenta/keyboard-tear work. That makes this phase's verification more load-bearing
  than most, not less.

---

#### Handoff notes for whoever starts Phase 7 (written 2026-08-03, end of Phase 6)

**Ask Andrew for a device capture before writing Phase 8 code** (Phase 7 itself — the regression
harness — doesn't need one; it's headless by design). This has now been asked for at the end of
Phases 4, 5, and 6 without a new capture arriving; the three screenshots on file are still the
original pre-Phase-3 set. The read is unchanged from the Phase 5→6 handoff table: `backdropGap`
(must be `h0 w0`), `magentaLayers` (must be `0`), `heightGap`, and the band's actual color decide
whether Phase 3–5's fixes closed Findings F/G or whether one of them needs another look. Phase 7's
harness doesn't depend on this either — it's explicitly scoped to headless-testable regressions
(see below).

**State of the tree.** Phases 0–6 are all **uncommitted** on branch `billing-guard-and-discounts`,
entangled in one working tree. Modified beyond what the Phase 5→6 handoff already listed:
`components/category-blitz/CategoryBlitzGame.tsx` only (Phase 6's `AnswerRow` extraction + memo
wrapper + glow/shake token fix + font-size comment, on top of Phases 0/2/3/4/5's changes to the
same file), plus this doc. No other file changed in this phase. No unrelated billing/ad work is
staged. `npx tsc --noEmit`, `npm run lint` and the full `vitest` suite (1314 tests) are green as of
the end of Phase 6.

**Things Phase 7 must not contradict** (all verified working at the end of Phase 6): the reveal→board
morph (`projectedRows` 12→0 on the same ~600ms settle window as Phases 2–5); the answer-list
internal scroll with `scrollY === 0`; the editor staying focused across a viewport resize; no
per-row transform/displacement on resize; typing correctness (no dropped characters, caret at end,
no cross-row bleed); a sustained wrong-letter answer staying visually stable across repeated
keystrokes. Phase 7 is a harness-authoring phase, not a code-change phase, so "must not contradict"
here means: write the harness's assertions to match this observed-good behavior, not some
idealized version of it.

**A concrete Phase 7 addition worth considering, raised by this phase's own honest limits above:**
a dev-only render counter on `AnswerRow` (behind `?cbzDebug=1`, following the existing debug-panel
convention from Phases 0/3/4) that Phase 7's harness can assert stays flat for the 11 untouched rows
across a `timeRemaining` tick while one row is focused and typing. This phase verified the
*consequences* of correct memoization (no dropped chars, no caret jumps) but never measured render
count directly — Phase 7 is positioned to close that gap if it's judged worth the added debug-panel
surface.

**Reproducing the verification setup — read this before reusing the Phase 4/5 recipe verbatim.**
The seeding recipe (delete stale sessions → `createSession({ source: "manual" })` →
`registerSessionPresence` × 3 → `startRound(sessionId)` → navigate within ~2s) is unchanged, but
this phase found a real wrinkle in it: **`sim-category-blitz` runs in continuous mode by default**
(`NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT=true` in this `.env.local` — no per-venue override
row is needed for that flag to apply). The continuous engine's self-heal on the client's *first*
session poll can advance past the round this script just started via a direct `engine.startRound()`
call before the page ever renders it, so **the round actually visible in the browser is not
reliably the one the seed script's own return value describes.** This is a different failure mode
from the Phase 4 handoff's "abandoned lobby session" trap (that one threw an error; this one
silently swaps in a different round with a different letter, which looks exactly like a real
wrong-letter bug until you check). Fix: after the page mounts, read the letter the client actually
rendered (`[data-category-blitz-letter-badge]` textContent) and build any letter-dependent test
answers from *that value*, never from the script's local `round.letter`. If Phase 7's Playwright
harness needs deterministic letter/category control for its assertions, it may be worth seeding
against a venue with `category_blitz_continuous_config.is_active = false` (opts a venue back onto
the scheduled engine, per `CLAUDE.md`'s Category Blitz section) instead of fighting the continuous
engine's race on every run.

**Reading Chromium results honestly.** Unchanged, worth repeating every handoff: headless Chromium
has reproduced none of the device-only symptoms (magenta band, keyboard tear) at any point in this
plan. Phase 6 is the exception in kind, not in this rule — dropped characters and caret jumps are
DOM-observable and were meaningfully tested here; the magenta/tear question is still device-only
and remains Phase 8's job.

---

### Phase 7 — Regression harness ✅ *done 2026-08-03 (see as-built below)*

- Assert `document.querySelectorAll("[data-category-blitz-row-projected]").length === 0` once the
  reveal morph window has passed (Phase 2 added that marker for exactly this). This is the direct
  Finding A regression check; the rect comparison below is the indirect one, and note that in
  headless Chromium the rect check alone did **not** distinguish projected from unprojected rows
  (see the Phase 2 as-built "honest limits") — so do not ship the harness with only the rect
  assertion and believe it covers Finding A.
- A Playwright test that loads `/category-blitz/play` seeded into the answering phase, records
  each answer row's bounding rect, shrinks the viewport by ~340 px (a keyboard-open simulation),
  and asserts that after settle **every row rect has moved by the same delta or not at all** —
  i.e. no per-row displacement, no per-row scale. This catches Finding A directly and would have
  caught it six attempts ago.
- Assert `window.scrollY === 0` and that no element with `position: fixed` and a `z-index` above
  the game root intersects the visual viewport during gameplay.
- Assert that at rest, the game root's `getBoundingClientRect()` exactly equals
  `{ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }` — a direct
  regression check for Finding G's persistent side strips, independent of any keyboard simulation.
- Use the project's existing `verify` skill for the seeding/auth-gate work — it already knows how
  to get a venue-scoped game page past the cookie gate.
- **Record the known limits honestly in the test file:** headless Chromium is not iOS Safari.
  This harness catches layout-projection and stray-overlay regressions. It cannot validate iOS
  keyboard behavior, and must not be treated as the device gate. (Same lesson as
  `project_category_blitz_mode_flip_3d`: headless WebKit was not a valid CSS-3D verifier.)

**Model: Sonnet 5 · effort: medium.** Well-specified test authoring against an existing harness.

**Exit:** the harness fails against `356fefd` and passes against the fixed build. If it passes
against both, it is not testing anything — fix the harness before trusting it.

#### Phase 7 — as built (2026-08-03) ✅

**No new device capture was available** — same situation as Phases 4-6. This phase doesn't need
one (it's headless by design), so it was executed in full.

**Two new pieces, not the Playwright-inside-Vitest shape originally sketched.** The plan bullet
"use the `verify` skill for the seeding/auth-gate work" assumed a Vitest+Playwright test file, but
this repo has no `@playwright/test`/jsdom-browser wiring — every existing Playwright use
(`scripts/verify-venue-screen-overflow.mjs`, and the scratchpad scripts from Phases 3-6's own
handoffs) is a standalone script run against a real dev server, not a Vitest test. Matching that
existing convention:

- **`tests/category-blitz-mobile-shell-contract.test.ts`** (+3 static-source checks, no new
  runtime): the `data-category-blitz-row-projected`/`morphActive`/`LAYOUT_MORPH_SETTLE_MS` marker
  trio exists (so a future refactor can't silently delete the thing Phase 2 built and this phase's
  runtime harness depends on); `AnswerRow`/`AnsweringScreen` are still wrapped in `memo(...)`
  (Phase 6's regression, with no natural static assertion of its own until now); and
  `MobileAdhesionAd.tsx`'s `isAdExcludedRoute` gate is paired 1:1 with every `isAdminRoute` guard
  site (Phase 5's ad-exclusion bullet had no test at all — see its own as-built "not done here").
  All 12 tests in the file pass.
- **New `scripts/verify-category-blitz-mobile-shell.cjs`** (+ npm script
  `category-blitz:verify-mobile-shell`): a standalone Playwright harness, seeded via the real
  server engine (`lib/categoryBlitz.ts`, not HTTP), that drives `/category-blitz/play` on a real
  dev server and asserts, in this order: Finding G (`[data-category-blitz-game-root]` rect exactly
  equals `{0,0,innerWidth,innerHeight}` at rest); Finding B/C (no `#a10d63` layer anywhere in the
  DOM outside `[data-animation-overlay]`; no `position:fixed` element with `z-index` above the
  game root's `100` intersects the visual viewport); Finding A direct (`projectedRows` settles to
  0 within ~2s of poll); Finding A indirect (every `[data-category-blitz-answer-row]` moves by the
  identical vertical delta, none horizontally, across a 390×844 → 390×504 keyboard-open
  simulation); and `window.scrollY === 0` throughout. Seeding follows the recipe nailed down across
  Phases 4-6's handoffs exactly: opt `sim-category-blitz` off continuous mode for the run
  (`category_blitz_continuous_config.is_active = false`, removed again on teardown), start the
  round *before* navigating, warm the route first so a dev compile doesn't eat the ~3s reveal
  window. `?cbzDebug=1` is never turned on (the panel is `fixed z-[99999]` and would hit-test over
  the rows).

**A real bug this phase found and fixed, not just tested for.** The first harness run failed
"no higher-z fixed overlay intersects the visual viewport" — the dev-only "Test mode" / "Skip
round" toggle buttons (`CategoryBlitzGame.tsx`, `NODE_ENV !== "production"` only) and
`DevAnimationPanel`'s root both sit at `fixed z-[999]`, above the game root's `100`, and the
harness (correctly) doesn't know these are intentional dev tooling rather than a Finding B/C
regression. Rather than special-case "z-999 buttons" in the harness by guesswork, all three got a
new `data-category-blitz-dev-only` marker (mirroring the existing `data-animation-overlay`
exclusion pattern from Phase 3) and the harness excludes elements carrying it — the same shape of
fix as the reverse-round takeover exclusion, not a one-off hack.

**Empirically verified against BOTH trees, not just reasoned about** — the exit criterion demands
the harness fail against `356fefd` and pass against the fixed build, so both were actually run
rather than assumed:

| Check | Fixed build (this tree, :3000) | `356fefd` (`git worktree add`, :3100) |
|---|---|---|
| Finding G rect | ✅ pass | ✅ pass |
| Finding B/C: magenta | ✅ pass | ✅ pass |
| Finding B/C: stray overlay | ✅ pass | ✗ **fail** |
| Finding A marker (`projectedRows` → 0) | ✅ pass | ✅ pass |
| Finding A rect-delta (uniform movement) | ✅ pass | ✅ pass |
| `scrollY === 0` | ✅ pass | ✅ pass |
| **Total** | **10/10** | **9/10** |

The harness does discriminate the two builds (exit criterion met), but **read the one failing
check honestly, not as proof of catching the original six-attempts bug**: `356fefd` fails the
stray-overlay check only because `data-category-blitz-dev-only` — the marker this very phase
added — didn't exist yet in that commit, so its dev-only buttons register as unmarked strays. That
is a real, correct failure (the check is doing its job against the tree as it exists today), but
it is a marker-retrofit artifact, not evidence this check would have caught a genuine Finding
B/C-class bug in the original pre-fix code. The other two checks that *could* have been meaningful
historical discriminators both came back identical on both trees, and for the exact reason every
prior phase already documented:

- **Finding G's rect check passes on `356fefd` too.** The device screenshots' left/right magenta
  strips never reproduced in headless Chromium at any point in this plan (Phases 2-6 all recorded
  this), so the pre-fix frame's rect matched the viewport in headless even though it didn't on a
  real iPhone. This check is a real regression guard for the *current* fixed geometry going
  forward; it was never going to retroactively prove Finding G on `356fefd` in a headless harness.
- **Finding A's rect-delta check passes on `356fefd` too** (after fixing the harness to query
  `[data-category-blitz-answer-row]`, which exists in both eras, instead of the Phase-2-only
  `[data-category-blitz-answer-row-wrap]` marker the first draft used — that draft read
  `before=0 after=0` against `356fefd` and technically "failed," but for the wrong reason, a marker
  that postdates the commit, not a geometry catch). With the correct selector, both trees show
  every row moving by one uniform delta — exactly the empirical confirmation of Phase 2's own
  "honest limits" note: Framer only re-measures layout projection on React commits, and a
  keyboard-simulated resize doesn't move row rects at all (the answer list absorbs the height
  change), so this comparison cannot discriminate projected from unprojected rows in headless
  Chromium regardless of which commit it runs against. The marker check
  (`data-category-blitz-row-projected` → 0) is the only check in this harness that actually proves
  anything about Finding A, and it only works from Phase 2 forward — which is fine, since Phase 2
  is what fixed it.

**Verified:**

| Check | Result |
|---|---|
| `npx eslint` on the new/touched files | ✅ clean |
| `npx tsc --noEmit` | ✅ clean |
| Full `vitest` suite | ✅ 1317 passed, 13 skipped (was 1314 passed at end of Phase 6 — +3 new static-source tests, same skip count) |
| `npm run category-blitz:verify-mobile-shell` against this tree (:3000) | ✅ 10/10 |
| Same harness against `356fefd` via `git worktree add` (:3100, package.json/package-lock.json
  identical between the two so `node_modules` could be symlinked, no reinstall needed) | 9/10 (see table above) |

**Not done here / honest limits.**

- **This is not the device gate and does not attempt to be.** Every check here is exactly the set
  the plan bullet list asked for — layout-projection retirement, stray-overlay/magenta absence,
  row-geometry uniformity, no page scroll — and nothing more. It has no opinion on the magenta band,
  the keyboard tear, or Safari's chrome tinting; Phase 8 is still the only real exit for the five
  acceptance criteria at the top of this doc.
- **`scripts/verify-category-blitz-mobile-shell.cjs` is a standalone script, not wired into `npm
  run test` or CI.** It needs a live dev server + real Supabase credentials + ~10s of round-trip
  time, the same reason `verify-venue-screen-overflow.mjs` and the Category Blitz simulation
  harness aren't either. It should be run by hand after any future change that touches this route's
  layout/overlay/projection code, and its npm script name
  (`category-blitz:verify-mobile-shell`) is discoverable via `npm run` for that purpose.
- **The `356fefd` worktree comparison was a one-time verification for this handoff, not a
  permanent fixture.** It was created with `git worktree add`, run against a second dev server on
  port 3100, and fully torn down (`git worktree remove --force`, dev server killed) before this
  phase ended. Nothing about it persists in the tree.

---

#### Handoff notes for whoever starts Phase 8 (written 2026-08-03, end of Phase 7)

**Ask Andrew for a device capture before running Phase 8 — this is the same ask as every handoff
since Phase 4, and Phase 8 is the phase that finally can't proceed without it.** The three
screenshots on file are still the original pre-Phase-3 set. Phase 8 IS the device check — there is
no more headless work to do first. Read `backdropGap` (must be `h0 w0`), `magentaLayers` (must be
`0`), `heightGap`/`widthGap`, and the band's actual color at `/category-blitz/play?cbzDebug=1`, one
screenshot with the keyboard open and one at rest, same as every prior handoff asked.

**State of the tree.** Phases 0-7 are all **uncommitted** on branch `billing-guard-and-discounts`,
entangled in one working tree. Modified beyond what the Phase 6→7 handoff already listed:
`components/category-blitz/CategoryBlitzGame.tsx` (Phase 7's `data-category-blitz-dev-only` marker
on the two dev-only buttons, on top of Phases 0/2/3/4/5/6's changes to the same file),
`components/category-blitz/DevAnimationPanel.tsx` (same marker on its root),
`tests/category-blitz-mobile-shell-contract.test.ts` (Phase 7's three new static-source checks),
`package.json` (new `category-blitz:verify-mobile-shell` script), plus this doc. New:
`scripts/verify-category-blitz-mobile-shell.cjs`. No unrelated billing/ad work is staged.
`npx tsc --noEmit`, `npm run lint`, and the full `vitest` suite (1317 passed, 13 skipped) are green
as of the end of Phase 7.

**Run the new harness once before touching anything, as a baseline.** `npm run dev`, then in
another shell `npm run category-blitz:verify-mobile-shell`. It should read 10/10 against a clean
tree (that's what it read at the end of Phase 7). If Phase 8 finds a device bug and someone patches
it, re-run this afterward — it won't tell you the device bug is fixed (it can't see iOS), but it
will tell you the patch didn't reintroduce a DOM-observable regression (a stray overlay, a live
projection node, a per-row transform) while chasing the device fix.

**What the harness does and does not cover, so Phase 8 doesn't over- or under-trust it.** It
directly proves, on every run: no `#a10d63` layer anywhere in the DOM, no higher-z stray overlay,
the game root exactly fills the viewport at rest, layout projection is retired after the reveal
morph, all 12 answer rows move by one uniform delta on a simulated keyboard resize, and the page
never scrolls. It proves nothing about Safari's own chrome tinting, the keyboard's paint timing, or
whether `theme-color` actually suppressed the sampled band color — those are Phase 8's job
specifically because they are not DOM state.

**If Phase 8 finds a NEW device bug that code changes are needed for:** make the fix, then extend
`scripts/verify-category-blitz-mobile-shell.cjs` with whatever DOM-observable signal the debug
panel showed for that specific bug (the panel already has more fields than this harness reads —
`heightGap`/`widthGap`/`frameHeightGap`/`frameWidthGap`/`frameTransform` are all computed in
`readLayoutDebugSnapshot` but not yet asserted on by the harness, since Phase 7 only wrote checks
for the findings already closed). Don't add a check for something the harness structurally cannot
observe (Safari chrome color, keyboard animation timing) — write those down as known limits instead,
the same way every phase since Phase 2 has.

**On success (all five acceptance criteria hold on device):** bump `LAYOUT_DEBUG_VERSION` in
`CategoryBlitzGame.tsx` from `cbz-p4-keyboard-contract` to `cbz-v9-<strategy>` per the plan's
existing Phase 8 bullet, update this doc's top status line, append a short as-built section under
Phase 8, and record the outcome in `docs/category-blitz-claude-code-handoff.md` so the attempt
history stays complete. Also: nothing in Phases 0-7 has been committed yet — that's a separate,
deliberate decision for whoever closes this out, not an oversight.

---

### Phase 8 — Device acceptance

- Andrew runs the five acceptance criteria at the top of this doc on a real iPhone.
- Each criterion is checked individually and reported individually. "It works" is not an exit —
  six previous rounds ended with a fix that looked right and was not.
- If a criterion still fails, capture the Phase 0 debug panel for **that specific criterion**
  before anyone writes code. The failure of attempts 1–6 was not bad fixes; it was a loop that
  never closed on evidence.
- On success: bump the debug marker to `cbz-v9-<strategy>`, update this doc's status, append a
  short as-built section, and record the outcome in `docs/category-blitz-claude-code-handoff.md`
  so the attempt history stays complete.

**Model: Opus 5 · effort: medium.** Interpreting ambiguous device evidence and deciding whether
to iterate or escalate — judgment, not volume.

#### Phase 8 — round 1 device capture (2026-08-03): the magenta is closed, a NEW defect is open

**A real device capture finally arrived** — `After-Fixes.png` in the same
`category-blitz-broken/` folder, taken on an iPhone 16 Pro (1206×2622 @3x = 402×874 CSS pt)
against the LAN dev server (`192.168.1.157`), keyboard open, mid-round. It was taken **without**
`?cbzDebug=1`, so the four-number branch table from the Phase 4/5/6/7 handoffs is still formally
unanswered — but the screenshot settles the question those numbers were proxies for:

- **Criterion 2 passes.** There is **no magenta anywhere** — not the keyboard-open band, not the
  left/right edge strips from Finding G. The page is `#020617` from the status bar to the top of
  the keyboard, *including* the zone behind the floating URL pill and the `^ v ✓` accessory bar,
  which is exactly the region that was magenta in `after-open-keyboard.PNG`. **Findings F and G
  are closed**, and the Phase 4 pixel-measurement reframing was right: that zone is Safari's own
  chrome, outside `visualViewport`, and the fix was never frame sizing — it was what paints
  underneath. The backdrop (Phase 4) + magenta-layer deletion (Phase 3) + `theme-color` (Phase 5)
  did it between them; this capture cannot apportion credit among the three, and doesn't need to.
- **Criterion 1 passes** in this still: rows are intact, correctly positioned, not torn, not
  overlapping, not scaled. No band of any color.
- **Criterion 3 and 4 pass**: no page scroll, no legal footer.

**The new defect (Andrew's report, visible in the capture): only 2–3 answer rows are usable with
the keyboard open, and moving between rows means constant scrolling.** Requested: **at least 5**
visible, and scroll-then-tap-another-field should be easy. This is not a regression from Phases
0–7 — it was equally true before, just invisible underneath a magenta band that made the whole
lower half unreadable. It is a genuine miss in the acceptance criteria as written, which never
quantified usable rows.

**Measured cause.** With the keyboard open the visible viewport is ~410 CSS px. Chrome was
consuming ~180 px of it, leaving ~136 px of answer list — **2 rows** at a ~57 px row pitch:

| Consumer | Cost |
|---|---|
| Back bar (`Header`, `py-3` + `h-8` button + border) | ~57 px |
| Invite-banner grid row (`pt-2`, banner itself null at 3+ players) | ~8 px |
| Answering header: `h-14 w-14` letter badge + 2-line mode rule + `py-3` | ~93 px |
| Editor: `min-h-[4.25rem]` card, `pt-3`, safe-area `pb`, 2-line helper text | ~150 px |

**Fix — `compactChrome`, a keyboard-open chrome reduction** (`CategoryBlitzGame.tsx` only, plus
harness). While `activeAnswerIndex !== null` (i.e. exactly while a row is being typed into), the
game sheds everything that isn't the letter, the timer, the list, and the editor:

- The **Back bar unmounts** (`Header` gained a `compact` prop and returns `null`). It lives in the
  root component, above `AnsweringScreen`, so the state is lifted: `AnsweringScreen` gained an
  `onEditingChange` callback and the root holds an `answerEditing` boolean. `setAnswerEditing` is
  passed straight through — a `useState` setter is referentially stable, so Phase 6's `memo` on
  `AnsweringScreen` still bails on the root's 4 Hz tick.
- The **invite-banner row**, the **2-line mode rule**, and the editor's **"answers save
  automatically" helper line** stop rendering; the **letter badge** goes `h-14`→`h-9`
  (`text-4xl`→`text-2xl`); header `py-3`→`py-1.5`; progress bar `mt-2`→`mt-1`; the editor card
  `min-h-[4.25rem]`→`min-h-[3.25rem]` with `pt-3`→`pt-2` and the safe-area `pb` flattened to
  `pb-2` (the home indicator is behind the keyboard, so that inset buys nothing while typing).
- **Everything returns the instant the keyboard closes** — `handleKeyboardInputBlur` already nulls
  `activeAnswerIndex`, so the ✓ accessory button restores full chrome with no extra wiring.
- **Gated on `!morphActive`** so the round-start FLIP always measures the letter badge at full
  size. The badge is a shared-`layoutId` morph target and resizing it mid-projection is precisely
  the stale-rect tear Phase 2 scoped projection away from. In practice they can't overlap (nothing
  is focused during the 570 ms morph window) — this is belt-and-suspenders on the one invariant
  every handoff since Phase 2 has said not to break.
- New `data-category-blitz-compact-chrome` marker on the answering grid root, following the
  `data-category-blitz-row-projected` / `data-animation-overlay` / `data-category-blitz-dev-only`
  convention, so the harness asserts the state directly rather than inferring it from rects.

**Harness extended** (`scripts/verify-category-blitz-mobile-shell.cjs`, +10 checks → **20 total**),
per the Phase 7 handoff's instruction to add the DOM-observable signal for any new device bug:
both chrome states (marker absent + Back bar present at rest; marker present + Back bar gone while
typing), a **fully-visible row count ≥ 5** (a row counts only if entirely inside *both* the scroll
container and the visual viewport — a half-clipped row is not a usable target), editor focus, and a
scroll-then-tap sequence asserting the focus correction does not yank a manually-scrolled list back.

**A/B measured, not reasoned about** — the same run with `compactChrome` forced to `false`, at a
**410 px viewport chosen to match the device capture's real budget**:

| | list height | rows fully visible |
|---|---|---|
| Before (`compactChrome` forced off) | 136 px | **2** |
| After | 351 px | **6** |

The "before" number independently reproduces Andrew's device report ("2–3") from a headless
harness, which is the first time in this entire plan that headless Chromium has reproduced a
reported device symptom — because this one is pure layout arithmetic, not iOS paint behavior.
The 4 new assertions fail against the forced-off build and pass against the fixed one, so they
discriminate (Phase 7's exit criterion for any harness check).

**Verified:**

| Check | Result |
|---|---|
| `npx tsc --noEmit`, `npm run lint` | ✅ clean |
| Full `vitest` | ✅ 1317 passed, 13 skipped — unchanged |
| `npm run category-blitz:verify-mobile-shell` (504 px sim) | ✅ **20/20**, 7 rows in a 445 px list |
| Same at the 410 px device budget | ✅ 20/20, **6 rows** in a 351 px list |
| A/B with `compactChrome` off, 410 px | 16/20 — 4 new checks fail, 2 rows in a 136 px list |
| Rendered `<meta name="theme-color" content="#020617">` and `interactive-widget=resizes-content` | ✅ confirmed in page source (Phase 5 shipped) |

#### Phase 8 — round 2 (2026-08-03): the duplicate field is gone; rows own their inputs

**Andrew's call, on seeing `After-Fixes.png`:** the pinned editor above the keyboard is a second
copy of the active row (same category label, same answer) and should not exist — the caret should
be in the row the player tapped.

**This reverses a documented guardrail, deliberately.** "Answer rows stay display controls; exactly
one native input" came from **attempt #2** in `docs/category-blitz-claude-code-handoff.md`
("Single Hidden Keyboard Proxy"), whose stated intent was to *stop Safari panning the page to
reveal focused row inputs*. That attempt **also failed on device**, so removing the row inputs was
never validated as necessary — it was a guess that rode along, and the actual cause turned out to
be the magenta backdrop (Findings F/G), closed in Phases 3–5. What the guardrail *did* cost was a
visible duplicate field. The page-pan risk it hedged against is now covered **structurally**
rather than architecturally: `html`/`body` are `overflow: hidden` + `overscroll-behavior: none`,
the game is a fixed backdrop + frame, focus uses `preventScroll: true`, and both the contract test
and the harness assert `window.scrollY === 0` and no `.scrollIntoView(`.

**What changed** (`CategoryBlitzGame.tsx`, plus test + harness):

- **`AnswerRow` is now a `<label>` wrapping a real `<input>`**, not a `<button>`. A label forwards
  the tap to its own control **natively and synchronously inside the gesture**, which is exactly
  what Phase 4 established iOS requires — so this is *more* aligned with the Phase 4 mechanism than
  the shared editor was, not less. The `onPointerDown` + `preventDefault()` pair is gone: it
  existed to stop a tap blurring the shared editor, and would now cancel the native focus.
- **The pinned editor is deleted.** What replaces it is a footer holding only submit-error recovery
  and the autosave line — and it renders **nothing at all** while a row is being typed into, so
  `compactChrome` now hands the list the footer's entire height too.
- Focus plumbing rewritten: `handleRowFocus` (records the active row, never re-focuses — it runs
  *from* the focus event), `handleRowBlur` (80 ms debounce, because moving between rows blurs one
  input before focusing the next), `focusAnswerRow` (programmatic, queries
  `[data-category-blitz-answer-input="N"]` rather than threading twelve refs through a memoized
  component), `handleRowSubmit` (Return advances, or blurs on the last row). The fake blinking
  caret span and the caret-to-end effect are gone — twelve real inputs each keep their own caret.
- The `?cbzDebug=1` panel's `activeMarker` now reports `row-input-N`, and `editorInputs`/`rowInputs`
  invert to `0`/`12` — which is itself the proof the architecture flipped.

**Three GLOBAL `!important` rules in `app/globals.css` apply to every `input` in the app and had to
be overridden on this input only** — this was the whole difficulty, and it is worth recording
because none of it is visible from the component source:

| Global rule | Cost on a 12-row board | Override |
|---|---|---|
| `min-height: 36px !important` (mobile media query) | input rendered **36px** instead of 21px — **12px × 12 rows**, i.e. two entire answer rows of keyboard-open space | `!min-h-0` |
| `border: 1px solid #334155 !important` + `border-radius: 12px` | a second box drawn inside the row's own border | `!border-0` |
| `input:focus { box-shadow: 0 0 0 2px … }` | a nested rounded box inside the focused row — visually the very "duplicate field" this change removes | `focus:!shadow-none` |

The global rules are untouched for the rest of the app. Row padding also went `py-2.5`→`py-2`, and
the input is pinned to its 24px line box (`h-6 leading-6 p-0`). `text-base` (16px) is mandatory and
now asserted by the contract test — the old display `<p>` was `text-sm` and could afford to be; a
real input under 16px makes iOS zoom the page on focus, which is the one way this approach could
genuinely reproduce the corruption this plan chased.

**Measured, at the 410px device budget** (row 53px, pitch 60px, input 21px):

| Build | list | rows fully visible |
|---|---|---|
| Before Phase 8 | 136 px | 2 |
| Round 1 (`compactChrome`, shared editor) | 351 px | 6 |
| Round 2 (row inputs, no duplicate) | 351 px | **5** + a partial 6th |

Round 2 trades one visible row for the removed duplicate — the row inputs are 16px where the old
display text was 14px, and that is a required floor, not a tunable. Still comfortably above the
5-row target, and rows stay 53px (above the 44px touch-target minimum).

**The harness's ≥5-row assertion now runs at 410px, not 504px** — the real budget from the device
capture rather than a roomier simulation — plus four new checks that the rows own their inputs
(12 row inputs, 0 pinned editors, typing lands in the tapped row, no other input mirrors the
answer). **25 checks, all passing.** Both board states were also screenshotted and eyeballed.

**Still open — criterion 5 and the device re-check.** Typing feel (criterion 5) cannot be read off
a still frame and was not reported on; Phase 6's work there remains headless-verified only. And
`compactChrome` itself has **not been seen on a real device** — the 6-row result is headless
arithmetic at a viewport chosen to match the capture, which is strong for a pure-layout change but
is not the device gate. `LAYOUT_DEBUG_VERSION` is deliberately **left at
`cbz-p4-keyboard-contract`**: the plan bumps it to `cbz-v9-<strategy>` only on full acceptance, and
it doubles as proof of which build a screenshot came from — bumping it now would make the next
capture ambiguous.

---

## Model & effort summary

| Phase | Work | Model | Effort |
|---|---|---|---|
| 0 | Device diagnostics — screenshots in, numeric instrumentation still needed | Sonnet 5 | medium |
| 1 | Retire string-contract test | Sonnet 5 | low |
| 2 | ✅ done — scope layout projection to the morph (secondary suspect) | **Opus 5** | high |
| 3 | ✅ done — dedicated play shell, magenta layer deleted (Findings F & G) | **Opus 5** | high |
| 4 | ✅ done — backdrop + transform frame, sync focus, one settled scroll | **Opus 5** | **xhigh** |
| 5 | ✅ done — chrome / overlays / magenta (`theme-color`, ad exclusion, transition sweep, z-ladder) | Sonnet 5 | medium |
| 6 | ✅ done — `AnswerRow` memo boundary, glow/shake remount-on-transition fix | Sonnet 5 | medium-high |
| 7 | ✅ done — Regression harness (incl. Finding G rect check) | Sonnet 5 | medium |
| 8 | ← **next** — Device acceptance | **Opus 5** | medium |

Opus is reserved for the three phases where being wrong costs another device round-trip
(2, 3, 4) plus the judgment call at the end. Everything else is well-specified enough that
Sonnet 5 will produce the same diff for less.

## Guardrails carried forward

- Do not reintroduce `--cbz-layout-height`, the hidden proxy input, or the pinned-editor +
  keyboard-shield strategy. All three are falsified (handoff §4, §2, §5).
- Do not narrow `shouldShowLegalNotice` again — `components/ui/AppShell.tsx:42-55` records why.
- ~~Answer rows stay display controls; exactly one native input.~~ **Reversed 2026-08-03 (Phase 8
  round 2), on Andrew's explicit call** — each row now owns a real `<input>` and the pinned editor
  is gone. See the Phase 8 round-2 section for why the original rationale (attempt #2) did not
  hold up and what replaced it structurally.
- Do not stage unrelated billing/ad work from this worktree.
- Every phase runs `npx tsc --noEmit`, `npm run lint`, and the Category Blitz suite before commit.
