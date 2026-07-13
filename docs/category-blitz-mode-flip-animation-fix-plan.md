# Category Blitz "Blend In!" Flip Animations — Why They're Broken + Fix Plan

> **Self-contained brief.** The full-screen mode-flip takeover (3 variants: card /
> split-flap / overspin) and possibly the top-right ModeSign render as flat,
> "half-finished" squashes instead of real 3D flips. This doc explains exactly why
> and gives a phased plan. Files involved:
> `components/animations/CategoryBlitzModeFlipTakeover.tsx`,
> `components/category-blitz/ModeSign.tsx`,
> `components/category-blitz/DevAnimationPanel.tsx` (dev preview/selector),
> `lib/categoryBlitzModes.ts`, `app/globals.css`.

## TL;DR

The animations were ported from a **browser-verified standalone HTML prototype** (raw
CSS `@keyframes` + real 3D depth) into **framer-motion springs**, and the port silently
destroyed the CSS 3D rendering context. Every flip is being **flattened to 2D**, so you
see a horizontal squash with both faces bleeding through instead of a card turning through
space. Three separate, independently-fatal CSS-3D mistakes cause this. None are visible to
`tsc`, ESLint, or vitest — this is a **runtime, browser-only** failure, and there was **no
browser verification step**, which is the meta-cause.

---

## Root causes (confirmed by reading the code against the CSS spec)

### RC-1 — `filter` flattens `transform-style: preserve-3d` (kills the **card** + **overspin** variants)
`CategoryBlitzModeFlipTakeover.tsx` line ~67:
```tsx
<motion.div style={{ rotateY, transformStyle: "preserve-3d", filter }}>
```
Per the CSS spec, **any `filter` value other than `none` — including `blur(0px)` — forces
the element to render into a flattened plane**, and `transform-style: preserve-3d` is
ignored. The two faces then collapse into one 2D plane instead of front/back in 3D space.
Worse, the `filter` motion value (a constant `blur(0px)`) is passed **unconditionally**, so
the "card" variant — which never wanted blur at all — is flattened too. **Both** the card
and overspin variants are structurally broken by this single line.

### RC-2 — perspective never reaches the rotating element (kills the **split-flap** variant)
`CategoryBlitzModeFlipTakeover.tsx` lines ~87 / ~111 / ~112. Structure is:
```
<div perspective:1600>              ← perspective set here (grandparent)
  <div overflow-hidden>             ← slat wrapper: no perspective, no preserve-3d, and
                                       overflow:hidden creates its own flattening context
    <motion.div preserve-3d rotateY>← the element that actually rotates (grandchild)
```
CSS `perspective` applies **only to direct children** unless **every** intermediate ancestor
also carries `transform-style: preserve-3d`. The slat wrapper has neither, and its
`overflow: hidden` independently flattens 3D. So each slat rotates with **zero perspective** —
an orthographic (depth-less) squash. Broken for the same visual reason, different mechanism.

### RC-3 — no depth separation + unreliable backface hiding (degrades all variants, worst on iOS)
The two faces both sit at Z=0 (front at `rotateY(0)`, back at `rotateY(180)`, neither pushed
out on Z). Even with a healthy 3D context they z-fight and overlap. The prototype deliberately
gave the card **real thickness** — `translateZ(±9px)` on the faces plus an `.edge` slab — none
of which survived the port. Also, backface hiding uses the Tailwind arbitrary property
`[backface-visibility:hidden]`; this is a **mobile-first app**, and iOS Safari needs
`-webkit-backface-visibility: hidden`. Whether autoprefixer emits the `-webkit-` prefix for a
Tailwind *arbitrary property* is not guaranteed, so on iOS the backface can bleed even after
RC-1/RC-2 are fixed.

### RC-4 — this is the codebase's first-ever 3D CSS (the systemic cause)
`grep` for `preserve-3d | perspective | backface | rotateY` across the whole repo returns
**nothing** outside these two new files. There is no shared, verified 3D pattern to copy, no
helper utilities, and the port compressed the prototype's carefully layered structure (stacked
slices, edge slab, `translateZ` separation, per-variant dissolves, motion-blur on a *non-3D*
layer) into a thin two-face stack that only looks right if the 3D context survives — which,
per RC-1/RC-2, it never does.

### RC-5 — why the greens lied
`npx tsc --noEmit`, ESLint, and all 340 vitest tests pass. **None of them can observe a
flattened 3D context** — it is a pixels-in-a-browser failure. No `/verify` run and no
Playwright screenshot were taken, so "all checks pass" gave false confidence. This is the
habit to fix, not just the CSS.

### Secondary issues (real, but downstream of the above)
- **Spring overshoot** on overspin (`damping: 9`) pushes `rotateY` past 180°; with backface
  hiding broken you get a mirrored-face flash on landing.
- **Uniform opacity-fade dissolve** replaced the prototype's three distinct dissolves
  (bloom-out / snap-shut columns / mask burn-through), so even once flips work the
  land→dissolve→board-reveal beat will feel abrupt versus what you approved.
- **ModeSign** (top-right persistent sign) uses the same two-face / no-`translateZ` /
  arbitrary-backface pattern. Its perspective chain is technically correct (rotating element
  is a *direct* child of the perspective parent, and it has no `filter`), so it may partly
  work — but it shares RC-3 and should be fixed with the same verified pattern.

---

## Strategic recommendation (read before Phase 1)

**Port the prototype faithfully, don't re-derive it.** The standalone HTML the user approved
was **already verified in a browser** and uses raw CSS `@keyframes` with correct 3D depth. The
Sonnet pass "upgraded" it to framer-motion springs and, in doing so, broke the 3D. The
lowest-risk path is to **preserve the prototype's proven CSS technique** — real `translateZ`
depth, an edge slab, `filter`/motion-blur only on a **non-preserve-3d** wrapper, per-slat
perspective, and its per-variant dissolves — and use React/framer-motion **only for
mount/orchestration/timing**, not to replace the 3D CSS. Springs are optional polish, added
last, and never on a `preserve-3d` node.

---

## Phased plan

Effort: XS (<1h) · S (~½ day) · M (~1 day) · L (~2 days). All build work: **Opus 4.8** — this
is fiddly cross-browser CSS-3D where the failure mode is invisible to the type/lint/test
tooling, so it needs careful reasoning + real browser verification, not fast codegen.

### Phase 0 — Reproduce in a real browser + stand up the verification harness (do this FIRST) ✅ DONE (2026-07-12)
Open the app with `Test mode: on` → Animations dev panel, play each of the three previews, and
capture what actually renders (screenshot each). Add a repeatable check: the `/verify` skill or
a small Playwright script that drives the dev panel and screenshots each variant mid-flip and on
landing, in a mobile viewport **and** desktop. This is the step that was skipped; it becomes the
gate for every later phase. Nothing is "fixed" until it's confirmed here.
- **Model:** Opus 4.8 · **Effort:** S

**Outcome:** Failure reproduced and confirmed on all three variants; harness landed.
- Harness: `scripts/verify-mode-flip.mjs` — drives the live DevAnimationPanel on
  `/category-blitz/play`, screenshots a timed burst (180/360/600/1000/1500 ms) per variant in
  mobile (390×844) + desktop (1440×900), regenerates its own auth cookies via
  `scripts/print-test-auth-cookies.cjs`. Output → `tmp/mode-flip-shots/` (gitignored).
- Baseline "before" shots + pass/fail criteria: `docs/mode-flip-baseline/`.
- Confirmed live: **card** mid-flip = mirror-reversed 2-D squash, and it **lands on the standard
  blue face still mirrored — never reveals the pink "Blend In!" reverse face** (RC-1 + RC-3);
  **split-flap** = depth-less vertical bars (RC-2); **overspin** = card squashed to a sliver, no
  blur, no depth (RC-1). All orthographic 2-D squashes with mirrored same-face bleed-through,
  exactly as predicted — nothing turns through 3-D space. This is the gate for every later phase.

### Phase 1 — Establish one correct, reusable 3D foundation ✅ DONE (2026-07-12)
Create verified primitives so every flip shares a known-good context:
- Add small utilities to `app/globals.css` with explicit `-webkit-` prefixes:
  `.tp-3d-scene { perspective: … }`, `.tp-3d-layer { transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d }`, `.tp-backface-hidden { backface-visibility: hidden;
  -webkit-backface-visibility: hidden }`. (Tailwind arbitrary props are unreliable for these —
  see RC-3.)
- **Hard rule, enforced structurally:** `filter` (blur, motion-blur, etc.) must **never** sit
  on a `preserve-3d` element. It goes on a *separate ancestor or sibling* layer.
- Fix the perspective chain: the rotating element must be a **direct child** of the
  perspective/`preserve-3d` parent (or every ancestor between them must carry `preserve-3d`).
  For split-flap, give **each slat its own `perspective`** rather than one shared grandparent,
  and rethink the `overflow: hidden` clip so it doesn't sit on the flattening path.
- Give the two faces real depth: `translateZ(+d)` / `translateZ(−d)` (+ optional edge slab), and
  apply `.tp-backface-hidden`.
- **Effort:** M

**Outcome:** 3D context is correct; the flattening (RC-1/RC-2/RC-3) is gone, browser-verified.
- Added `.tp-3d-scene` / `.tp-3d-layer` / `.tp-backface-hidden` to `app/globals.css` with explicit
  `-webkit-` prefixes (RC-3), next to the other `tp-*` utilities.
- `CategoryBlitzModeFlipTakeover.tsx` refactored onto them: the `blur()` `filter` now sits on a
  **non-3D wrapper** so it can no longer flatten `preserve-3d` (RC-1); the rotating `.tp-3d-layer`
  is a **direct child** of a `.tp-3d-scene`; **split-flap gives each slat its own perspective** with
  `overflow:hidden` moved to the outermost clip (off the flattening path) (RC-2); both faces are
  pushed out on Z (`FACE_DEPTH_PX = 3`) with prefixed backface hiding (RC-3). `Face` is now pure
  content; wrappers own positioning/depth/backface.
- **Browser-verified** via `scripts/verify-mode-flip.mjs`: the **card** variant turns through real
  perspective (visible keystoning mid-flip) and **lands upright on the pink "Blend In!" reverse
  face** — the old mirror-reversed 2-D squash is gone. Overspin turns in real 3D with upright faces.
  Split-flap slats render in real per-slat 3D. `tsc`, ESLint, and all 340 vitest tests pass.
- **Deferred to Phase 2 (variant fidelity, per the plan's own boundary — NOT foundation bugs):**
  (a) split-flap's trailing slats top out mid-turn because `progress` animates only to `target`
  while each slat subtracts a stagger offset — the "staggered wave that all lands" is Phase 2 work;
  (b) overspin's `target = 180 × 1.5 = 270°` lands **edge-on** (currently masked by the landing
  flash) — Phase 2 already calls for clamping/settling so it doesn't overshoot past the final face.

### Phase 2 — Rebuild the three variants faithfully to the prototype ✅ DONE (2026-07-12)
Using the Phase-1 foundation, restore each treatment to match the approved standalone file:
- **Card turn:** single deliberate 3D turn with wind-back + settle, edge/thickness, sheen sweep.
- **Split-flap:** staggered per-slat wave, each slat with its own perspective + depth.
- **Overspin:** 1.5 turns, screen-shake, landing flash — **and put the motion-blur on a non-3D
  wrapper** (this is the RC-1 fix in practice). Clamp/settle so the spring (or keyframes) doesn't
  overshoot past the final face and flash the backface.
Prefer porting the prototype's `@keyframes` timing directly; only use framer-motion for
mount/hold/dissolve orchestration.
- **Effort:** L

**Outcome:** all three rebuilt on keyframe tweens (springs dropped) and browser-verified; each
turns in real 3D and **lands flat on the reverse "Blend In!" face**. "After" shots in
`docs/mode-flip-baseline/*-PHASE2.png`.
- **Driver:** per-variant `VARIANT_ANIM` keyframes replace the old shared spring. `animate(..., {
  type: "tween" })` is set explicitly — framer defaults a 2-keyframe value animation (the
  split-flap driver) to a *spring* that ignores `duration` and collapses the wave; forcing tween
  makes every variant honour its keyframes/times/ease/duration.
- **Card:** wind-back anticipation → turn → small overshoot → settle (`[0,-18,198,180]`), real
  `EdgeWall` side slabs for thickness, and a screen-space sheen glint. Lands upright on reverse.
- **Split-flap:** a genuine staggered louver wave that now **fully lands** (all slats aligned).
  Three real bugs fixed: (1) the shared driver runs to `180 + stagger` and each slat clamps to
  `[0,180]` so trailing slats complete; (2) each slat is a full-width plane turning about its OWN
  column-centre axis (layer via framer `originX`, back face via matching CSS `transform-origin`) so
  the two 180° turns compose to identity and the slice lands back in its column; (3) **`maxWidth:
  "none"` inline** — the global `.tp-page-main :where(…, div, …){ max-width:100% }` was clamping the
  >100%-wide layer to one column, which is why only slat 0 ever landed before. All sizing is in %
  of the takeover (not `vw`) because a transformed ancestor makes `vw` ≠ the takeover width.
- **Overspin:** now **540° (1.5 full turns → lands flat on reverse)** instead of the edge-on 270°,
  with the motion-blur on the non-3D wrapper (Phase-1 RC-1 fix), screen-shake + landing flash on
  impact, and a small settle that stays within the reverse face's arc (no backface flash).
- `tsc`, ESLint, and all 340 vitest tests pass. Verified via `scripts/verify-mode-flip.mjs`
  (mobile + desktop). Debugging note for future 3D work: the `max-width:100%` clamp and framer's
  spring-default were both invisible to type/lint/test — found only by dumping live DOM geometry.
- **Deferred to Phase 3 (by design):** the land → hold → dissolve → board-reveal handoff is still
  the uniform opacity fade; per-variant dissolves are Phase 3.

### Phase 3 — Restore the land → hold → dissolve → board-reveal beat ✅ DONE (2026-07-12)
Bring back per-variant dissolves (bloom-out / column snap-shut / mask burn-through) or a single
deliberately-designed handoff, and make sure the underlying game board is correctly revealed as
the takeover clears. Verify the hero text is always `MODE_CONFIG[mode].puckLabel` (no invented
mode name) throughout.
- **Effort:** M

**Outcome:** the three named per-variant dissolves are implemented and browser-verified; each
clears to reveal whatever's beneath (in live play the round reveal → board). "After" shots in
`docs/mode-flip-baseline/*-dissolve-*-PHASE3.png`.
- **Card → bloom-out:** the landed panel swells (`scale 1.12`) and fades while a central light
  bloom expands — it clears into light.
- **Split-flap → column snap-shut:** the panel snaps closed vertically (`scaleY → 0`, `easeIn`)
  like a departure-board flap, revealing the board above/below.
- **Overspin → mask burn-through:** an animated `radial-gradient` `mask-image` (a `burn` motion
  value driving the hole radius, with `-webkit-mask-image` for iOS) eats a transparent hole
  outward from the centre; `opacity → 0` is kept as an iOS fallback if mask-image isn't honoured.
- **Hero text:** always `MODE_CONFIG[side].puckLabel` ("Blend In!") — the `Face` component reads
  it directly; no invented mode name anywhere. Confirmed across every captured frame.
- **Reduced motion:** the dissolve collapses to a plain opacity fade (no bloom/snap/mask) — the
  `prefers-reduced-motion` matrix is formally signed off in Phase 5.
- `tsc`, ESLint, and all 340 vitest tests pass. Verified via a focused late-window capture
  (`tmp/dissolve-shots`, gitignored). **Note:** the dev-panel harness has no live board beneath
  the takeover, so board-*reveal* is verified only as "clears to whatever is underneath"; the
  reveal→board handoff timing is exercised live via the `showReveal` trigger in CategoryBlitzGame.

### Phase 4 — Apply the same verified pattern to ModeSign ✅ DONE (2026-07-12)
Refactor `ModeSign.tsx` onto the Phase-1 primitives (depth separation, prefixed backface,
correct perspective chain) so the persistent top-right sign and the full-screen takeover share
one proven approach instead of two hand-rolled ones.
- **Effort:** S

**Outcome:** `ModeSign.tsx` now shares the `.tp-3d-*` primitives with the takeover; the sign turns
edge-on through real 3D and lands flat/upright on the reverse "Blend In!" face, browser-verified
on mobile + desktop.
- The rotating layer is `.tp-3d-layer` (replacing the unprefixed inline `transformStyle:
  preserve-3d`), a direct child of a `.tp-3d-scene` perspective host. The shared 1600px
  perspective is far too flat for a 92px sign, so both `perspective` **and** `WebkitPerspective`
  are overridden inline to 340px (≈3.5× the width) so the two values agree on every engine.
- Both `SignFace`s use `.tp-backface-hidden` (replacing the unreliable Tailwind arbitrary
  `[backface-visibility:hidden]`, which doesn't emit the `-webkit-` prefix iOS needs) and are
  pushed out on Z (`FACE_DEPTH_PX = 3`, reverse pre-rotated 180°) so the sign reads as a solid
  slab, not two decals z-fighting at Z=0.
- **Harness:** added a permanent **"Mode sign (persistent)"** demo to `DevAnimationPanel.tsx`
  (`ModeSignDemo` flips the mode on a 2.6s loop) — ModeSign is otherwise only mounted mid-round in
  live play. `scripts/verify-mode-sign.mjs` drives it and captures a dense burst across a full flip
  in mobile (390×844) + desktop (1440×900); shots → `tmp/mode-sign-shots/` (gitignored).
- **Browser-verified:** mid-turn frame shows the sign edge-on (just the cord + a narrowed shadow
  sliver — the shadow's `scaleX` tracks `cos(rotateY)`), i.e. it turns through depth rather than
  flat-squashing with both faces bleeding; it lands upright on the pink "Blend In!" reverse face
  reading correctly (not mirror-reversed). `tsc`, ESLint, and all 340 vitest tests pass.
- **Note (desktop clip quirk, not a bug):** a transformed ancestor of the play surface makes the
  `position: fixed` sign anchor to the centered content's right edge, not the viewport edge, on
  wide viewports — so the harness captures full-page rather than a fixed top-right clip.

### Phase 5 — Cross-browser verification matrix (standing gate) ⚠️ MOSTLY DONE — real-iOS gate still open (2026-07-12)
Confirm all variants on: desktop + mobile viewport, dark theme, **iOS Safari specifically**
(the `-webkit-` path), and `prefers-reduced-motion` (static fallback still reads correctly).
Capture screenshots into the repro harness from Phase 0. Make "browser-verified on iOS" the
required sign-off for any future 3D animation work.
- **Effort:** S

**Outcome:** matrix harness landed and every dimension verifiable *in this environment* passes;
the one dimension that is NOT verifiable here — **real iOS Safari** — is explicitly still open and
must be checked on a real device / iOS Simulator before this phase is signed off.
- **Harness:** `scripts/verify-mode-flip-matrix.mjs` parameterised by `ENGINE=chromium|webkit`
  and `REDUCE=1` (emulates `prefers-reduced-motion: reduce`), covering all three takeover variants
  + ModeSign in mobile (390×844) + desktop (1440×900). Shots → `tmp/mode-flip-matrix/` (gitignored).
- **✅ Desktop + mobile (Chromium):** covered across Phases 1–4; re-confirmed here.
- **✅ Dark theme:** the app is dark-only (no `prefers-color-scheme`/`data-theme`/`dark:` anywhere),
  so the default render *is* the dark theme.
- **✅ `prefers-reduced-motion: reduce`:** on BOTH engines the takeover collapses to a static reverse
  "Blend In!" face (no 3D turn) and ModeSign snaps to the current face (no wobble), both reading
  correctly — static content, so the capture is trustworthy on either engine.
- **❌ Real iOS Safari — NOT closed, and headless WebKit is NOT a valid substitute.** Playwright's
  headless WebKit flattens `preserve-3d` and ignores `backface-visibility` **even for a static,
  minimal, spec-correct 3D probe** (`tmp/mode-flip-matrix/static3d/`: a fixed `rotateY(55deg)` on
  the `.tp-3d-*` primitives — no animation, no framer, no WAAPI). Chromium renders that identical
  probe correctly (keystoned front face, back hidden); headless WebKit shows the mirror-reversed
  BACK face, flat and full-width. Because the SAME CSS is correct on Chromium, the divergence is in
  Playwright's headless-WebKit compositor, **not** our code — real iOS Safari has supported the
  `-webkit-` `preserve-3d`/`backface-visibility` path for years. The earlier confusing WebKit
  takeover frames had a second artifact on top: framer drives `rotateY` via WAAPI, whose tween
  collapses to near-instant under headless WebKit + Playwright's default `animations:"disabled"`
  screenshot fast-forward. **Net:** headless WebKit gives false negatives for CSS-3D and must not
  be used as the iOS gate. The real gate is a physical iPhone / iOS Simulator Safari — still TODO.
- `tsc`, ESLint, and all 340 vitest tests pass; no product code changed in this phase (harness +
  docs only). See [[project_category_blitz_mode_flip_3d]] for the reusable 3D + verification rules.

---

## The one-line takeaway for the fix chat
> The flips are flattened, not mistimed. Do **not** re-derive them as framer-motion springs —
> faithfully port the browser-verified CSS-`@keyframes` prototype, keep `filter` off every
> `preserve-3d` node, give each rotating element a real perspective parent + `translateZ`
> depth + prefixed backface hiding, and **verify in a browser (incl. iOS Safari) before
> calling anything done.**
