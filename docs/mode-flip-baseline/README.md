# Mode-flip takeover — Phase 0 baseline (BROKEN) + verification harness

Phase 0 of [../category-blitz-mode-flip-animation-fix-plan.md](../category-blitz-mode-flip-animation-fix-plan.md):
reproduce the flattened-3D flip failure in a real browser and stand up a
repeatable screenshot gate. **Done — the failure is confirmed on all three
variants.** These baseline shots are the "before"; every later phase must be
re-verified against a fresh harness run and must no longer look like these.

## What the harness proved (the bug is real, not mistimed)

Driven live via the DevAnimationPanel on `/category-blitz/play` (Test mode: on),
mobile 390×844 @2x:

- **`card-midflip-BROKEN.png`** — mid-flip, the front "Be Unique!" face is
  **mirror-reversed and horizontally squashed** (a flat 2-D `scaleX` collapse),
  not a card turning through space. → RC-1: the `blur()` `filter` flattens
  `transform-style: preserve-3d`.
- **`card-landing-BROKEN.png`** — the killer frame. After a full 180° the card
  settles on the **standard blue face, still mirror-reversed** — it never
  reveals the intended reverse-mode "Blend In!" pink face. Backface hiding fails
  along with the flattening (RC-1/RC-3), so the takeover ends on the *wrong
  message, backwards*.
- **`splitflap-midflip-BROKEN.png`** — slats collapse to thin depth-less
  vertical bars with mirrored text bleeding through. → RC-2: `perspective`
  never reaches the rotating slat (intermediate wrapper lacks `preserve-3d` and
  its `overflow:hidden` re-flattens).
- **`overspin-midflip-BROKEN.png`** — whole card squashed to a vertical sliver,
  front face mirror-reversed, no motion blur, no depth. Same RC-1 flattening.

All three: orthographic 2-D squash + mirrored same-face, no front→back reveal.

## Phase 1 result (foundation fixed)

- **`card-midflip-PHASE1-FIXED.png`** — same play, same harness: the card now
  turns through **real perspective** (trapezoidal keystoning, upright readable
  reverse face, no mirroring) instead of a flat squash.
- **`card-landing-PHASE1-FIXED.png`** — lands **upright on the pink "Blend In!"
  reverse face**, the message it was always supposed to end on.

Split-flap and overspin also turn in real 3D now, but two per-variant *fidelity*
items are deferred to Phase 2 (not foundation bugs): split-flap's trailing slats
don't all reach 180° (stagger vs. `progress` target), and overspin's 270° target
lands edge-on (masked by the landing flash). See the plan's Phase 1 outcome note.

## Phase 2 result (variants rebuilt faithfully)

Each variant now turns in real 3D with its own character and **lands flat on the
reverse "Blend In!" face**. `*-PHASE2.png`:

- **`card-midflip-PHASE2.png`** — deliberate 3D turn with a visible edge-wall
  (thickness) and a sheen glint.
- **`splitflap-wave-PHASE2.png`** — a genuine staggered louver wave (left columns
  flipped to pink, right still blue) …
- **`splitflap-landed-PHASE2.png`** — … that then lands fully aligned. (Before
  Phase 2 only the leftmost slat ever landed — a `max-width:100%` clamp + framer's
  spring default, both invisible to type/lint/test; found by dumping live DOM.)
- **`overspin-midspin-PHASE2.png`** — 1.5-turn 3D spin with motion-blur + edge.
- **`overspin-landed-PHASE2.png`** — lands flat on reverse (the 270°→540° fix),
  no longer edge-on.

## Phase 3 result (per-variant dissolves)

The uniform opacity fade is replaced by three distinct handoffs, each clearing to
reveal what's beneath. `*-dissolve-*-PHASE3.png`:

- **`card-dissolve-bloom-PHASE3.png`** — bloom-out: the panel swells + blooms into
  light as it fades.
- **`splitflap-dissolve-snapshut-PHASE3.png`** — column snap-shut: the panel snaps
  closed vertically like a flap.
- **`overspin-dissolve-burn-PHASE3.png`** — mask burn-through: a transparent hole
  eats outward from the centre.

Hero text is always "Blend In!" (`MODE_CONFIG[side].puckLabel`) throughout — no
invented mode name. Reduced motion falls back to a plain fade.

## Re-running the gate (later phases)

`scripts/verify-mode-flip.mjs` drives the panel and screenshots a timed burst
(180/360/600/1000/1500 ms after each play) for card / split-flap / overspin, in
mobile **and** desktop viewports. It regenerates its own auth cookies via
`scripts/print-test-auth-cookies.cjs`, so it survives SESSION_SECRET/user
changes.

```bash
# 1. dev server up
npm run dev
# 2. playwright installed in a scratch dir (NOT a repo dep); match npx version
cd /tmp/pw && npm i playwright@1.61.1
# 3. run the gate (output -> tmp/mode-flip-shots, gitignored)
PLAYWRIGHT_DIR=/tmp/pw/node_modules/playwright \
  node --env-file=.env.local scripts/verify-mode-flip.mjs
```

Needs the reusable `sim-category-blitz` venue + a seeded user (see the `verify`
skill / `scripts/simulate-category-blitz.cjs`). Override identity with
`TP_USER_ID` / `TP_VENUE_ID`.

**Pass condition (Phase 2+):** each variant visibly rotates through 3-D depth
and **lands on the pink "Blend In!" reverse face, upright and readable** — no
mirrored text, no horizontal squash, no depth-less bars. Verify on iOS Safari
specifically before sign-off (Phase 5, the `-webkit-` path).
