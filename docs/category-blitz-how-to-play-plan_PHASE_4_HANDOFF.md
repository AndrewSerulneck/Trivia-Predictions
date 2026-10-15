# Category Blitz How-to-Play Plan — Phase 4 Handoff (slightly bigger letter badge)

**Date:** 2026-10-14 · **Plan:** `docs/category-blitz-how-to-play-plan.md` · **Phase 4 status:** built and checked
locally. **Not committed, not pushed, not deployed.** Phase 1 = `b1030fd`; Phases 2, 3 and 4 are uncommitted.

## For Andrew (plain English)

- The round letter in the top-left of the answering screen is a little bigger when the keyboard is closed
  (about 8% larger box, about 22% larger letter).
- It's smaller than the plan's first target (64px). At 64px, on a 360px-wide phone, the standard-round
  reminder ("Only unique answers earn points — be original.") went from 3 lines to 4 and made the header taller.
  So I used the plan's fallback size, 60px. The header is now exactly as tall as it was before, on every width
  and in both modes.
- With the keyboard open nothing changed. The small letter, the header and the answer list are all the same size as before.
- Not yet checked on a real phone. Nothing is live, and committing or pushing is your call.

## For the next agent

### 1. Next phase
**Phase 5: sleep when idle** (plan §5 Phase 5). Model: **Claude Opus 5.5, effort high.** Out of scope: Phase 6
(the empty-round cleanup, which runs only after Phase 5 is deployed) and Phase 7 (the release record).

### 2. Starting state
- Branch `category-blitz-scoring-cadence`. Only `b1030fd` (Phase 1) is committed.
- Phase 4 changed two class strings in `components/category-blitz/CategoryBlitzGame.tsx` (`AnsweringScreen`,
  `letterBadgeClassName` and `letterBadgeGlyph`), plus this handoff and the plan's status line. That file also
  has uncommitted Phase 3 edits.
- `components/venue/venueHubShared.tsx` and every Speed Trivia file are Andrew's unrelated work. Don't stage them.
  Stage by path; never run `git add -A` or `git checkout --`.
- **Data:** the harness and the screenshot script both seeded and removed throwaway rows on the `sim-category-blitz`
  venue in the **production** database (3 sim players per run, one session, and a temporary
  `category_blitz_continuous_config` row with `is_active=false`). Every run reported a clean teardown. No other
  venue was touched.

### 3. Decisions
- Keyboard closed: `h-[3.75rem] w-[3.75rem]` (was `h-14 w-14`), glyph `text-[2.75rem]` (was `text-4xl`). This is the
  plan's own fallback, so there was nothing to ask.
- Keyboard open (`compactChrome`): unchanged (`h-9 w-9`, `text-2xl`, `py-1.5`).
- The `layoutId={CB_LETTER_BADGE_LAYOUT_ID}` morph and the switch to a plain div after it are untouched. Both forms
  still share one class string.

### 4. Measurements (Chromium, rendered px; rem sizes scale with the root font: 13px at ≤380px wide, 14px at 390px)
| Size | 360 badge / header height | 390 badge / header height |
|---|---|---|
| Old `h-14` | 46 / 89 | 49 / 91 |
| Tried `h-16` | 52 / **108** (standard rule wraps to 4 lines) | 56 / 91 |
| **Shipped `3.75rem`** | 49 / 89 | 53 / 91 |
Majority Rules ("reverse") header heights were 89 / 91 for every size. The keyboard-open badge was 29 / 32 for every size.
Screenshots (old, `new/` = 64px try, and the shipped size) are in this session's scratchpad `p4/`. They are not in the repo.

### 5. Facts and traps
- **`scripts/verify-category-blitz-mobile-shell.cjs` has a flaky check that was already there:** "scroll-then-tap: the
  list did not jump back" fails as `scrolledTo=200 afterTap=190 row=3`. It failed 2 of 5 runs on the **old** badge size,
  in the keyboard-open state, where this phase changed nothing. The "at least 5 rows fully visible" check failed once
  (4 rows). The list height was the same 346px; the round's random categories had long names that wrapped to two
  lines. Neither failure comes from this change. Both are worth hardening later (fixed categories in the seed, and a
  tolerance or a deterministic row in the scroll-then-tap check).
- The harness needs Andrew's `next dev` running on :3000 and writes to the production DB (sim venue only).
- I didn't inspect the reveal morph frame by frame. The harness's "projected rows settle to 0" check passes, and the
  morph targets the badge's own size through `layoutId`.

### 6. Verification
- `npx tsc --noEmit` passes; eslint passes on the changed file; `tests/text-size-floor-contract.test.ts` +
  `tests/category-blitz-mobile-shell-contract.test.ts` + the `tests/category-blitz*` suites pass.
- Harness on the shipped size: 24/25 on all three runs. The one failure each time was a flaky check (§5).
- Not run: the full `npm run test`, `npm run build`, and a real-phone check.

### 7. Open questions for Andrew
- Commit Phases 2–4 now?
- Plan §7: an optional daily prune of empty rounds. Still not asked.

### 8. First steps for Phase 5
1. `git status`; confirm the branch and the uncommitted Phase 2–4 files.
2. Read plan §5 Phase 5 and §4 "Running cost". Start at `GET /api/category-blitz/sessions` → `driveContinuousCategoryBlitz`,
   `components/venue/VenueHubClient.tsx` (~L1041), `lib/venueScreen.ts` (~L347) and `runContinuousCategoryBlitzEngine`.
3. Use `grep -a` on `lib/categoryBlitz*.ts`; plain grep treats them as binary.
