# Speed Trivia feedback animations — Phase 2 handoff

## For Andrew (plain English)
Phase 2 is built. When a player gets a Speed Trivia question right they now see **one** badge — the
design you picked, **B · Medal card**: a dark, almost solid card with a glowing bright-green rim, a
big green ✓ disc sitting on its top edge, "CORRECT" in white, and "+2 pts" in a yellow chip just
below it. It still springs in, gets a quick shine sweep, throws sparkles out from behind it, and
floats away upward — same 1.4 seconds as before, so the next question doesn't come any later.
**Not committed, not deployed** — it's only in your working copy, alongside Phase 1 (emoji rain).
What's left is Phase 3: automated checks, and you trying it on a real phone (wrong answer → emojis
fall off the bottom; right answer → the new card, easy to read). With Reduce Motion turned on the
phone shows no celebration at all — same as before this change.

Two questions still waiting on you (not blocking): do you want the badge to show the *real* points
when a Challenge multiplier gives more than 2 (see §7)? And 3 automated tests fail in the separate,
half-finished Speed Trivia "uniqueness" work in your folder — not caused by this change (see §5).

## For the next agent (Phase 3: checks + Andrew's phone pass — Sonnet 5.5, low)

### 1. Goal and scope
Do "Phase 3" of `docs/speed-trivia-feedback-animations-plan.md`: run the full check list, a browser
look if practical, and hand Andrew the phone checklist. Out of scope: redesigning the badge (Andrew
chose B — don't re-ask), the "real points number" gap unless Andrew asks for it, Live Trivia/Wrong
animations, and anything in the unrelated uncommitted trivia-uniqueness work.

### 2. Starting state
- Branch `main`, last commit `2d6211e`. Phases 1 and 2 are **uncommitted**, mixed in the working tree
  with a lot of unrelated uncommitted Speed Trivia uniqueness/variety work (see `git status`; e.g.
  `lib/speed-trivia-uniqueness/*`, `app/api/trivia/route.ts`, a new migration
  `supabase/migrations/20261014020000_speed_trivia_variety_review.sql`). Don't revert or stage those
  by accident; never `git checkout -- <file>`. Commit only if Andrew asks, and then only this plan's
  files (list in §4).
- Nothing pushed or deployed. No data, migrations, or backups involved in this plan.

### 3. Decisions already made
- **Andrew picked option B · Medal card** from a 3-option preview (A glow pill, B medal card,
  C scoreboard strip). The preview is saved at `docs/fixtures/speed-trivia-correct-badge-preview.html`
  (open it in a browser; it loops all three over a recreated trivia screen + green flash). Delete it
  if Andrew doesn't want it kept.
- Kept: export name `SpeedTriviaCorrectAnimation`, registry key `SPEED_TRIVIA_CORRECT` (haptic
  mapping pinned in `tests/native-share-haptics-contract.test.ts`), `pointsLabel` prop (default
  `"+2 pts"`), the 1400 ms `onComplete`, the spring entrance (stiffness 480 / damping 22 / mass 0.7
  → overshoot 1.15 → settle 1.0 → hold 600 ms → exit up 40px in 300 ms).
- Reduce Motion: unchanged parity. `components/animations/AnimationOverlay.tsx` renders **nothing**
  when `useReducedMotion()` is true and completes the animation immediately — so Reduce Motion users
  never saw the old badge either. Nothing to change in the component for that.
- Did not touch `LiveTriviaCorrectAnimation.tsx`, the Wrong animation, or `TriviaGame.tsx` (the
  trigger at `TriviaGame.tsx` ~line 994 is unchanged).

### 4. Files changed
- Phase 2: `components/animations/SpeedTriviaCorrectAnimation.tsx` (only code file).
  - Deleted the separate rising `+2 pts` layer. Now one `motion.div` card (`w-[200px]`,
    `rounded-[22px]`, `border-[3px] border-[#34d399]`, gradient fill `rgba(6,32,22,.96)` →
    `rgba(3,14,10,.96)`, triple box-shadow glow) containing:
    a clipped shine sweep (`shineControls`, x −160% → 360%, delay 0.22 s, 0.55 s);
    a 56px ✓ disc on the top edge (`top-[-28px]`, `bg-[#34d399]`, dark ring);
    "Correct" (24px, uppercase, `#ecfdf5`);
    the `pointsLabel` chip (20px, `bg-[#facc15]` / `#0a0a0f` text) revealed by `pointsControls`
    (opacity 0 → 1, y 8 → 0, delay 0.18 s, 0.35 s). The chip is inside the card so it exits with it.
  - Card wrapper is `z-[2]`; particles (unchanged CSS-keyframe scatter, `zIndex: 1`) now travel
    90–150px (was 55–110) so they start hidden behind the card and burst out past its edge.
  - All styling for the card is Tailwind classes; the only inline `style` left is the pre-existing
    per-particle one (dynamic random values).
- Plan status line updated in `docs/speed-trivia-feedback-animations-plan.md`.
- New: `docs/fixtures/speed-trivia-correct-badge-preview.html` (design preview, not shipped code).
- Phase 1 files (still uncommitted): `components/trivia/TriviaGame.tsx` (rain portal — that file
  ALSO has unrelated uncommitted edits, e.g. the `SelectionInfo` import), `app/globals.css`
  (`tp-rain-drip`).

### 5. Facts and traps
- Contrast: text on the ~96%-opaque dark-green card is ≫4.5:1 (`#ecfdf5` on ≈`#06201a`; black on
  `#facc15` chip). All text ≥20px, so the 12px text-size floor contract is satisfied.
- `npm run test` (2026-10-13, after Phase 2): **4304 pass, 3 fail, 13 skip**. The 3 failures are all
  in `tests/scripts.speed-trivia-pending-review.test.ts` (pending-family atomicity / drift / admission
  replay) — the unrelated uncommitted uniqueness work. Phase 1's handoff saw 3 failures in a
  different file (`tests/scripts.speed-trivia-admission.test.ts`), which now pass — that work is
  actively changing under us. Don't try to fix those; report them to Andrew.
- The badge sits above `TriviaGame`'s 1300 ms `bg-emerald-500/35` flash and the Phase 1 rain portal
  (`z-[1100]`); `AnimationOverlay` is `fixed inset-0 z-[1200] overflow-hidden`, so the card and the
  sparkles are clipped only by the viewport.
- Don't touch `.env.local`; don't kill Andrew's `next dev` on :3000 (browser-test from a scratchpad
  clone or a separate port per `CLAUDE.md`/memory).

### 6. Verification status
- Verified: `npx tsc --noEmit` clean; `npx eslint components/animations/SpeedTriviaCorrectAnimation.tsx`
  clean; `tests/text-size-floor-contract.test.ts` + `tests/native-share-haptics-contract.test.ts`
  pass; full `npm run test` as in §5.
- The look itself was checked only in the HTML preview (same sizes/colors/timings, CSS-keyframed
  instead of framer-motion). **The real component was NOT rendered in a browser** — Phase 3 should
  look at it in the actual game (answer a Speed Trivia question correctly) and confirm: card centred,
  ✓ disc not clipped, chip appears just after the pop, shine runs once, sparkles burst out from
  behind, everything gone by ~1.4 s.
- Not run: `npm run lint` (whole repo), `npm run test:pwa-contract`, `npm run build`.

### 7. Open questions for Andrew
- **Real points on the badge?** It always shows `+2 pts` (the default `pointsLabel`), even when a
  Challenge multiplier awards more: the animation fires on the local outcome (`TriviaGame.tsx` ~994)
  before the server's `pointsAwarded` arrives (~1033). Fixing it needs a timing decision (delay the
  badge, or update the chip when the number lands). Out of scope unless he asks.
- Keep or delete `docs/fixtures/speed-trivia-correct-badge-preview.html`?
- The 3 failing pending-review tests: confirm they belong to the in-flight uniqueness work.

### 8. Recommended first steps for Phase 3 (Sonnet 5.5, low effort)
1. `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`, then
   `npm run build` (never concurrently with typecheck).
2. Browser check of both animations per `CLAUDE.md` "Manual Testing & Auth Storage" or the `verify`
   skill, at 390×844 and 430×932, without touching Andrew's dev server.
3. Give Andrew the phone checklist from the plan's Phase 3 (wrong → emojis exit the bottom edge;
   right → one readable medal card; also in the installed app/PWA and with Reduce Motion on, where
   nothing should play).
4. Write `docs/speed-trivia-feedback-animations-plan_PHASE_3_HANDOFF.md` and update the status line.
