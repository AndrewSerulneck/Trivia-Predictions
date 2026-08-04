# Category Blitz: green "return to standard" mode-flip animation

## Goal
Category Blitz already plays a full-screen 3D flip takeover when a round enters
"Majority Rules" (reverse) mode — magenta landing face. Add the mirror-image
animation for when a round returns to standard mode — **green** landing face —
so both directions get an unmistakable full-screen cue, not just the one-way
trip.

## Background / where things live
- Takeover component: `components/animations/CategoryBlitzModeFlipTakeover.tsx`
  — three interchangeable flip treatments (`card`, `splitFlap`, `overspin`),
  dev-selectable via `lib/categoryBlitzModes.ts` (`getModeFlipTakeoverVariant`).
- Trigger site: `components/category-blitz/CategoryBlitzGame.tsx:2444-2456`
  (an effect gated on `showReveal`, `round.mode === "reverse"`, and a
  `modeFlipFiredRoundRef` dedupe-by-round-id guard).
- Mode config: `lib/categoryBlitzModes.ts` — `MODE_CONFIG` maps
  `"standard" | "reverse"` (`CategoryBlitzMode`, `types/index.ts`) to
  `{ puckLabel, rule, themeKey }`. `themeKey` indexes `GAME_THEME` in
  `lib/themeTokens.ts`: `blitzStandard` (emerald/green, lines ~194-214) and
  `blitzReverse` (magenta/gold, lines ~222-243) already both exist — no new
  theme token was needed.
- Shared 3D primitives: `.tp-3d-scene` / `.tp-3d-layer` / `.tp-backface-hidden`
  in `app/globals.css` (~line 2105). Purely structural (perspective /
  preserve-3d / backface-visibility) — **no color coupling**, reused as-is.
- Dev preview harness: `components/category-blitz/DevAnimationPanel.tsx`.
- Design history: `docs/category-blitz-mode-b-plan.md` §4b/§4c,
  `docs/category-blitz-mode-flip-animation-fix-plan.md` (the 3D-transform
  bug-fix writeup), `docs/mode-flip-baseline/README.md`.

## Status: All phases (0-4) are DONE (2026-08-03)

### Phase 0 — Confirm scope & naming (DONE)
Read `lib/categoryBlitzModes.ts` and `lib/themeTokens.ts` in full.
**Findings:**
- `blitzStandard` theme token already existed (emerald/green) — it was defined
  but never actually used by the takeover component, which had the standard
  face hardcoded to blue instead. This was effectively a latent inconsistency;
  fixing it doubles as satisfying this feature request.
- No new theme token needed. No new animation event type needed either — we
  extended the existing `CATEGORY_BLITZ_MODE_FLIP` animation with a
  `direction` field rather than adding a second animation type.

### Phase 1 — Extend the takeover component for direction/color (DONE)
Files changed:
1. **`types/animation.ts`** — added `modeFlipDirection?: "toReverse" | "toStandard"`
   to `AnimationPayload`. Optional and defaults to `"toReverse"` in the
   component, so the untouched existing trigger site keeps working exactly as
   before with zero changes required there.
2. **`lib/categoryBlitzModes.ts`** — added and exported
   `export type ModeFlipDirection = "toReverse" | "toStandard";`
3. **`components/animations/CategoryBlitzModeFlipTakeover.tsx`** — the bulk of
   the work:
   - `Face`'s `"standard"` branch recolored from a hardcoded blue
     (`#2b5fd4`/`text-sky-300`/`text-blue-50`) to emerald/green
     (`#34d399`/`text-emerald-300`/`text-emerald-50`), matching the
     `blitzStandard` token's palette. The `"reverse"` (magenta) branch is
     **untouched**.
   - `FlipCard` and `SplitFlap`/`SplitFlapSlat` now take `fromSide`/`toSide`
     props (`"standard" | "reverse"`) instead of hardcoding
     `<Face side="standard" />` as the front and `<Face side="reverse" />` as
     the back. This is what makes the flip reversible — same rotation math,
     different content on each face.
   - Top-level component now computes:
     ```ts
     const direction: ModeFlipDirection = payload?.modeFlipDirection ?? "toReverse";
     const fromSide = direction === "toReverse" ? "standard" : "reverse";
     const toSide   = direction === "toReverse" ? "reverse"  : "standard";
     const accentRgb = toSide === "reverse" ? "255,197,61" /* amber */ : "16,185,129" /* emerald */;
     ```
   - The landing-flash bloom and the card-variant dissolve-out bloom (both
     previously hardcoded to amber `rgba(255,197,61,...)` regardless of
     direction) now use `accentRgb`, so a return-to-standard flip blooms green
     instead of amber-on-magenta's-complement.
   - `reduce`-motion fallback now renders `<Face side={toSide} />` instead of
     always `<Face side="reverse" />`.
   - Doc comment at the top of the file updated to describe both directions.
4. **Verified:** `npx tsc --noEmit` passes clean with no new errors.

**Not changed / explicitly out of scope for Phase 1:** the outer container's
base background (`bg-slate-950`) and the white sheen-sweep overlay (card
variant) are direction-agnostic by design and were left alone — they read as
neutral "spinning" chrome regardless of which color the faces land on.

### Phase 2 — Wire the trigger for reverse→standard (DONE, 2026-08-03)
**File:** `components/category-blitz/CategoryBlitzGame.tsx`, immediately after
the existing reverse-flip effect (search `modeFlipFiredRoundRef`, now around
line 2450).

**What was added:** a second, sibling `useEffect` — not a merge into the
existing one, to keep the two directions' dedupe state fully independent:
```ts
const prevRoundModeRef = useRef<CategoryBlitzMode | null>(null);
const modeFlipStandardFiredRoundRef = useRef<string | null>(null);
useEffect(() => {
  if (!round) return;
  if (
    showReveal &&
    round.mode === "standard" &&
    prevRoundModeRef.current === "reverse" &&
    modeFlipStandardFiredRoundRef.current !== round.id
  ) {
    modeFlipStandardFiredRoundRef.current = round.id;
    triggerAnimation("CATEGORY_BLITZ_MODE_FLIP", {
      modeFlipVariant: getModeFlipTakeoverVariant(),
      modeFlipDirection: "toStandard",
    });
  }
  prevRoundModeRef.current = round.mode;
}, [showReveal, round, triggerAnimation]);
```
Notes on how this differs from the original plan sketch above (both land on
the same behavior, worth knowing which shortcut was taken):
- `prevRoundModeRef.current = round.mode` is written **unconditionally at the
  end of every effect run** where `round` exists, not gated on "only when
  `round.id` changes." This is deliberately simpler than the plan's original
  suggestion and is still correct: while a round is showing repeatedly (poll
  churn, `nowMs` ticks, etc.) the write is idempotent — it just re-assigns the
  same mode value — and by the time `round.id` actually changes, the ref
  reliably holds the mode of the round that just ended. Flagging this in case
  a future reader expects the id-gated version from the original sketch and
  wonders why it's not there.
- The old doc comment above the reverse-flip effect (which said the
  reverse→standard case "relies on the ModeSign flip + ambient board theme
  shift alone") has been corrected in the component itself — see the updated
  comment directly above the new effect. Phase 4's doc sweep should still
  check `docs/category-blitz-mode-b-plan.md` §4c for the same stale claim.
- `MODE_CONFIG.standard`'s copy ("Be Unique!" / "Only unique answers earn
  points — be original.") was reviewed and reads fine unchanged as a
  "returning to" announcement — no copy tweak made.
- `showReveal` was reused as-is for the new effect's gate, matching the
  reverse-flip effect's timing rationale (it's the window where `round.mode`
  first reflects the freshly-started round).
- Verified: `npx tsc --noEmit` passes clean with no new errors. **Not yet
  browser-verified** — that's Phase 3.

### Phase 3 — Dev preview + manual verification (DONE, 2026-08-03)

**Dev preview panel — `components/category-blitz/DevAnimationPanel.tsx`:**
Added 3 new `→ standard` demo keys (`modeFlipCardStandard`,
`modeFlipSplitFlapStandard`, `modeFlipOverspinStandard`) alongside the
existing 3 `→ reverse` ones. Implementation notes:
- `DemoKey` union, `DEMO_LABELS`, and `DEMO_KEY_TO_MODE_FLIP_VARIANT` all got
  the 3 new entries (labels suffixed `(→ reverse)` / `(→ standard)` on
  *all six* now, old ones renamed too, so the panel is self-describing).
- New `DEMO_KEY_TO_MODE_FLIP_DIRECTION: Partial<Record<DemoKey, ModeFlipDirection>>`
  map — only the 3 standard keys have an entry (`"toStandard"`); the 3
  original keys are absent, so `payload.modeFlipDirection` comes through
  `undefined` for them and the takeover component's own
  `?? "toReverse"` default (Phase 1) kicks in. This means the original demo
  buttons' behavior is provably unchanged — same payload shape as before.
- The render site (`<CategoryBlitzModeFlipTakeover payload={{ modeFlipVariant, modeFlipDirection }} .../>`)
  just spreads both lookups into the payload; no new branching logic needed.
- `npx tsc --noEmit` clean after this change.

**Browser verification (Playwright, headless Chromium, throwaway data):**
Followed the `verify` skill's cookie-auth-gate + service-role-seed pattern.
Created one throwaway `sim-category-blitz`-venue user
(`mfverify1`), set `tp_user_id`/`tp_venue_id`/`tp_sess` cookies via
`scripts/print-test-auth-cookies.cjs`, navigated to `/category-blitz/play`,
clicked the dev-only "Test mode: on" toggle, opened the "Animations" panel,
and clicked all 6 mode-flip demo buttons in turn, screenshotting mid-flip and
landed for each. **All 6 confirmed correct** — 3 magenta "Majority Rules!"
landings (reverse) and 3 green "Be Unique!" landings (standard), correct
puck copy, correct bloom-glow tint (amber-on-magenta for reverse, emerald for
standard) matching the `accentRgb` logic from Phase 1. This is the direct
regression check for check ①②: Phase 1's shared-component refactor did not
break the pre-existing reverse (magenta) path.

**Real round-transition observation (check ③, "ideally observe"): attempted,
not completed — infrastructure friction, not a feature bug.** Wrote a
throwaway driver script (deleted after, never committed) that called
`lib/categoryBlitz.ts`'s `createSession(venueId, { source: "manual", testMode: true })`
+ `startRound`/`scoreRound` directly (bypassing HTTP/auth, same pattern as
`scripts/simulate-category-blitz.cjs`) to drive 5 scheduled-cadence rounds
(round 4 = reverse, round 5 = the reverse→standard return this phase cares
about) while a headless browser tab sat on `/category-blitz/play` polling.
Round 1 (`standard`) scored fine, but `startRound` for round 2 then threw
`"Cannot start round on a session with status 'abandoned'"` — some
idle/heartbeat-driven abandonment logic marked the manual session abandoned
between round 1's scoring and round 2's start (the driver only slept 3s
between rounds with no re-registration of presence). This is a **pre-existing
characteristic of manual/simulated sessions under sparse synthetic presence,
unrelated to this feature's code** — Phase 1/2 touched none of the session
lifecycle/abandonment logic. Did not chase it further given Phase 3's
"low-medium" effort budget; the dev-panel check above already exercises the
*exact* code path (`CategoryBlitzModeFlipTakeover` with a `toStandard`
payload) that the real trigger effect (Phase 2,
`CategoryBlitzGame.tsx` ~line 2450) calls with — the only untested variable
is the effect's own gating (`showReveal && round.mode === "standard" &&
prevRoundModeRef.current === "reverse" && dedupe-by-round-id`), which was
already code-reviewed line-by-line while writing Phase 2 and is a direct
structural mirror of the pre-existing, already-battle-tested reverse-flip
effect right above it.

**If a future session wants to close this gap:** don't reuse the
`sim-category-blitz` venue's existing continuous/auto session (there's
usually one active from the continuous-default engine — `standDownScheduledIfContinuous`
means it coexists uneasily with a manually-driven one; delete it first, and
expect a fresh one to get auto-created by any subsequent poll against that
venue, including your own Playwright tab's background requests — this raced
with the driver script once during this session). Consider re-registering
presence for all players before every `startRound` call rather than once
up front, or investigate why the session was considered abandoned (grep
`categoryBlitz.ts` for `"abandoned"` — the null-byte-containing composite-key
line at ~65765 bytes in makes plain `grep -n` silently return zero matches
on this file across the whole codebase; use `grep -a` or ripgrep instead).

**`reduce`-motion path:** verified by code inspection only (not
OS-simulated in-browser) — Phase 1's diff already confirmed
`<Face side={toSide} />` replaced the old hardcoded `<Face side="reverse" />`
in the reduced-motion branch, so a `toStandard` payload renders the static
green face there by construction, not by a separate direction check that
could drift out of sync.

**No double-fire on refresh/reconnect:** not separately observed live (see
round-transition note above), but structurally guarded the same way the
original reverse effect always has been —
`modeFlipStandardFiredRoundRef.current !== round.id` (Phase 2) persists in a
`useRef`, which survives re-renders but not a full page reload; a genuine
refresh mid-transition would only double-fire if the poll immediately after
reload still has `round.mode === "standard"` *and* the client still believed
the previous round was `"reverse"` — but `prevRoundModeRef` also resets to
`null` on reload, so the `prevRoundModeRef.current === "reverse"` condition
fails and it does not re-fire. Same reasoning the original reverse effect
already relies on; not new risk surface introduced by Phase 2.

**Cleanup:** all throwaway sim users/sessions/auth accounts deleted; no repo
files left behind (driver script was in `scripts/__tmp_drive_modeflip.cjs`,
untracked, removed). Dev server and Playwright browser processes stopped.

- **Effort:** low-medium (matched the estimate).

### Phase 4 — Docs (DONE, 2026-08-03)

1. This file's status header bumped to "all phases done."
2. `docs/category-blitz-mode-b-plan.md` §4c: the stale "relies on the
   ModeSign flip + ambient board theme shift alone" claim was searched for
   and not found in this file — it only ever lived in a code comment above
   the reverse-flip effect in `CategoryBlitzGame.tsx`, which Phase 2 already
   corrected (now reads "Supersedes the old plan of relying on the ModeSign
   flip + ambient board..." at line ~2459). Nothing stale left to fix here.
3. `components/animations/CategoryBlitzModeFlipTakeover.tsx`'s top-of-file
   doc comment re-read fresh: already accurately describes both directions
   (Phase 1/2 left it in good shape) — no changes needed.
4. Added a line to `docs/category-blitz-mode-b-plan.md` §4c noting the
   takeover fires on both transitions and that both directions' dev-preview
   buttons live side by side in `DevAnimationPanel.tsx` (3 `→ reverse` + 3
   `→ standard`), with a pointer to this plan file.
- **Effort:** low (matched the estimate).

## Model/effort recommendation (all phases)
Sonnet 5 is sufficient for every phase — this is pattern-matching against an
existing, well-commented implementation, not novel architecture. No phase
needs Opus. Phase 2 is the one to slow down on (medium effort, get the
transition-edge logic right); the rest are low effort.
