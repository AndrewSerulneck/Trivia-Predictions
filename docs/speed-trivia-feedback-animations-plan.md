# Speed Trivia feedback animations — plan

**Status:** Phases 1–3 done 2026-10-13 (uncommitted). Phase 2 = option **B · Medal card** (Andrew's pick), **switched to A · Glow pill on 2026-10-13 after Andrew saw it, and slowed down** (see the Phase 3 handoff's "Post-phase change"); Phase 3 added the real-points chip (Andrew's request) and ran the checks; handoff `docs/speed-trivia-feedback-animations-plan_PHASE_3_HANDOFF.md`. Only Andrew's phone pass remains.

## For Andrew (plain English)

Two fixes to what a player sees after answering a Speed Trivia question:

1. **Wrong answer — sad-emoji rain.** Today the emojis vanish partway down the screen. After the fix
   they fall all the way and slide off the very bottom edge of the phone.
2. **Right answer — "✓ Correct" + "+2 pts".** Today these are two separate pop-ups with see-through
   backgrounds that get lost on the bright trivia background. After the fix they are **one** badge:
   a solid, dark-backed card with a bright glowing green rim, "✓ CORRECT" and "+2 pts" stacked inside
   it, still popping in with a spring and sparkles.

**You do NOT need the Claude web interface for this.** Both are plain code animations (no images or
artwork). The agent will show you design options as a preview page before building Phase 2, and you
pick one. Your only other job is the phone check in Phase 3.

| Phase | What | Model | Effort |
|---|---|---|---|
| 1 | Emoji rain falls off the bottom of the screen | Sonnet 5.5 | Medium |
| 2 | One combined, readable Correct + points badge | Opus 5.5 | Medium (design judgment) |
| 3 | Badge shows the real points (Challenge multiplier) + checks + your phone pass | Sonnet 5.5 (+ Andrew) | Low |

To run a phase, open a new chat and say: *"Do Phase N of `docs/speed-trivia-feedback-animations-plan.md`."*

---

## For the agent

Read `CLAUDE.md` first (text-size floor ≥12px, Reduce Motion, no `any`, `@/` imports, Tailwind first).
Write a handoff note `docs/speed-trivia-feedback-animations-plan_PHASE_<N>_HANDOFF.md` at the end of
each phase and update the status line above. Do not commit/push unless Andrew asks.

### Where the code is (verified 2026-10-13 at commit `2d6211e`)

- **Emoji rain** — `components/trivia/TriviaGame.tsx`, not the animation registry.
  - Constants ~lines 60–88: `INCORRECT_EMOJIS`, `RAIN_ITEM_COUNT = 14`, `RAIN_SIZE_OPTIONS`
    (`text-4xl`…`text-7xl`), `RAIN_HIDE_DELAY_MS = 2700`.
  - `createRainToken()` ~line 178: `delayMs` 0–250, `durationMs` 1500–2500, `drift` ±48px.
  - `triggerCelebration(isCorrect)` ~line 646: sets `rainEmojis`, unmounts them after `RAIN_HIDE_DELAY_MS`.
  - Render ~line 1774: `<div className="pointer-events-none absolute inset-0 z-20">` inside the game
    root (`relative … overflow-hidden`, ~line 1760); each emoji is `absolute top-[-20px] animate-tp-rain`.
  - Keyframes: `app/globals.css` `@keyframes tp-rain` (~line 1681) + `.animate-tp-rain` (~1696);
    Reduce Motion rules at ~2422 (`animation: none`) and ~2465 (`visibility: hidden`).
  - `animate-tp-rain` is used ONLY in `TriviaGame.tsx` (rain + the `fireworks` layer, which is
    always set to `[]` — effectively dead code; leave it unless removing it is trivial and safe).
- **Correct badge + points** — `components/animations/SpeedTriviaCorrectAnimation.tsx`
  (framer-motion; badge layer + separate rising `+2 pts` span + 10 CSS particles; `onComplete` at
  1400ms). Registered as `SPEED_TRIVIA_CORRECT` in `components/animations/animationRegistry.ts`,
  rendered by `components/animations/AnimationOverlay.tsx` (`fixed inset-0 z-[1200]`), triggered by
  `triggerAnimation("SPEED_TRIVIA_CORRECT")` in `TriviaGame.tsx` ~line 986. Haptic mapping is pinned
  in `tests/native-share-haptics-contract.test.ts` (`SPEED_TRIVIA_CORRECT` → `"success"`) — keep the key.
- Behind the badge at the same moment: the trivia background (`tp-trivia-bg`, bright) plus
  `TriviaGame`'s full-screen `bg-emerald-500/35` feedback flash for 1300ms. That is why today's
  `bg-emerald-500/20` badge and the yellow text-shadowed points are hard to read.

### Phase 1 — emoji rain drips off the bottom (Sonnet 5.5, medium)

**Root causes (three stacked; fix all):**
1. **Clipping.** The rain layer is `absolute inset-0` inside the game root, which is `overflow-hidden`
   and sits inside more `overflow-hidden` wrappers in `components/venue/GameLandingExperience.tsx`
   (~lines 322–329). Its bottom edge is not the screen's bottom. That wrapper also has
   `animate-tp-surface-enter` (a transform), which makes `position: fixed` descendants position
   against it, so simply changing to `fixed` is NOT enough — **portal the rain layer to
   `document.body`** (`createPortal`, mount-guarded for SSR) as `fixed inset-0`, with a z-index above
   the game content but below `AnimationOverlay`'s `z-[1200]`.
2. **Fade-out.** The keyframe fades opacity linearly to `0.02` by the end, so emojis are faint well
   before the bottom. Keep opacity at 1 through the fall (optionally a slight fade only in the last
   few % once fully off-screen — invisible anyway).
3. **Early unmount.** `RAIN_HIDE_DELAY_MS` (2700) is less than the worst case delay+duration (250 +
   2500 = 2750). Derive the unmount time from the tokens (max `delayMs + durationMs` + ~150ms buffer)
   instead of a fixed constant.

**Travel distance:** end at `translateY(calc(100dvh + 1.2em))` from a start of `top: -1em` (em = the
emoji's own size), so the emoji's top edge clears the bottom of the viewport. Use `dvh` (mobile
browser bars) with a `vh` fallback. Consider an ease-in (gravity) timing instead of `linear`;
keep the 20% "hang" beat if it still looks right. Prefer a new keyframe name (e.g. `tp-rain-drip`)
only if you also keep the old one working for the fireworks layer; otherwise edit `tp-rain` in place.
Add the new class to BOTH Reduce Motion blocks in `globals.css` if renamed.

**Done when:** on a 390×844 and a 430×932 viewport, every emoji visibly exits past the bottom edge
before unmounting; no emoji is cut off by a horizontal line; Reduce Motion still hides the rain;
nothing in the game becomes untappable (layer stays `pointer-events-none`).

### Phase 2 — one combined, readable Correct badge (Opus 5.5, medium)

1. **Design preview first.** Build a throwaway HTML preview (scratchpad, or a private Artifact) that
   shows 2–3 badge options animating over a screenshot/recreation of the bright trivia background
   **with the green flash on top**. Ask Andrew to pick. Suggested direction for all options:
   - One unit: a rounded card/pill containing "✓ CORRECT" (top) and "+2 pts" (below, smaller, yellow).
   - Near-opaque dark backing (e.g. deep green-black at ~90–95% opacity, optional `backdrop-blur`) so
     the text has guaranteed contrast regardless of what's behind it.
   - "Pop" comes from the rim and light, not the fill: bright emerald border (2–3px), strong outer
     glow, a quick shine sweep or inner highlight; text bright emerald-200/white and yellow-300.
   - Aim for ≥4.5:1 text contrast against the backing; text ≥12px (it will be far larger).
2. **Implement** the chosen option inside `SpeedTriviaCorrectAnimation.tsx`: delete the separate
   `pointsControls` layer, render points inside the badge (a short staggered reveal of the `+2 pts`
   line inside the card is fine), keep the spring entrance, settle, hold, exit and the particle
   burst (particles may originate from the badge edge). Keep `pointsLabel` prop, export name,
   registry key and total duration (~1400ms; don't lengthen the gap before the next question without
   asking). Don't touch `LiveTriviaCorrectAnimation.tsx` or the Wrong animation.
3. Reduce Motion: check how `AnimationOverlay`/`useReducedMotion` handles this today and keep parity
   (badge still readable; no travel/scale bounce).

**Known gap → moved into Phase 3 (Andrew, 2026-10-13: "the real points always show up on the
badge"):** the overlay always showed `+2 pts`, even when a Challenge multiplier awarded more.

### Phase 3 — real points on the badge, checks + phone pass (Sonnet 5.5, low; Andrew)

- **Real points (added at Andrew's request).** The badge still pops instantly on the local outcome;
  only its points chip waits for the server. `triggerAnimation` returns the animation id, and a new
  `updateAnimationPayload(id, patch)` in `AnimationTriggerProvider` merges late data into a queued or
  playing animation. `TriviaGame` passes the server's `pointsAwarded` (multiplier included) as
  `payload.pointsAwarded`; the chip reveals on its usual 180 ms beat if the number is already in,
  else the moment it lands. No number (save failed, already answered, server says wrong, zero
  points) → no chip, never a guessed "+2". The chip's space is reserved so the card never jumps.

- `npx tsc --noEmit`, `npm run lint`, `npm run test` (includes text-size floor, haptics and
  navigation contracts), `npm run test:pwa-contract`, then `npm run build` (never concurrently with
  typecheck).
- Browser check per CLAUDE.md "Manual Testing & Auth Storage" (cookies before navigating) or the
  `verify` skill; never kill Andrew's `next dev` on :3000.
- Andrew on a real phone (headless browsers can't judge this): answer wrong → emojis leave via the
  bottom edge; answer right → one badge, clearly readable over the background; also try with the
  installed app/PWA and with Reduce Motion on.
