# Phase 7a handoff — the seasonal slot is chosen first (2026-11-19)

**For Andrew:** the holiday/event question slot no longer breaks the nightly variety rules: it no longer pushes Speed
below its "a third from 2000-present" minimum (101 nights a year before, 0 now), and Live no longer gets two
near-identical slots (18 nights a year before, 0 now). Not live yet: it's uncommitted on a new branch and ships in one PR
with 7b and 7c, which merges only with your OK. Nothing needs you now. Run 7b next with **Opus 5.5, medium effort**.

**For the next agent (7b, Opus 5.5 / medium; plan §4 "Phase 7b"):**

- **Branch / state:** `fix/seasonal-slots-7abc`, branched from `origin/main` at `fa6979a1` (PR #30 merge). **Nothing
  committed or pushed.** Uncommitted on the branch: `lib/question-variety/slots.cjs`,
  `tests/lib.question-variety-seasonal.test.ts`, this note, and `docs/speed-trivia-backlog-and-quality-plan.md` (which
  also carries the planning agent's earlier uncommitted additions for 7a–7j, plus a new "What runs next" box at the
  top and a "Run with" model line under each 7a–7j heading). Commit all of it with 7b/7c; never `git checkout -- <file>`,
  `git stash` or `git reset`. The untracked " 2" copies are 7c's job — leave them.
- **What changed:** `chooseSlots` in `lib/question-variety/slots.cjs` now picks the seasonal cell **before** the
  per-category loop (the event area's least-covered cell, from the category's own sorted list so `deficit` stays
  category-wide). In the event's category, `k − 1` cells come from `spread` over the list minus that cell, fallback
  slots next, then the seasonal cell (carrying `event`) last. The modern swap runs after, over every slot; a slot with
  `event` may swap only to an unused modern cell in its own area and keeps `event`. The old post-hoc replacement block
  is gone; `taken` includes the seasonal cell. Return shape unchanged. `brief.cjs` and `calendar.cjs` untouched — 7b's
  `seasonalFor` rotation plugs into the same `seasonal` argument.
- **Tests added:** "the seasonal slot over a year of nights" — every night 2026-12-01 → 2027-12-31, both games, real
  `draft-map.json` + `calendar.json` (area ids are `category|name`, empty stats): same slot counts, exactly one `event`
  slot when the category has a slot tonight, event slot in the event's area,
  `modern.actual ≥ min(required, actual without the event)`, no more reused cells than without the event. **Verified to
  fail on the old `slots.cjs`** and pass on the new.
- **Simulation (same setup, $0):** Speed 176 seasonal nights, below modern min 101 → 0; Live 24 nights, below min 23 → 7
  (the same 7 fall short without a seasonal slot — the plan's "Known limit", a map question), reused cells 18 → 0.
  Matches the planning prototype.
- **Checks run:** `npx vitest run tests/lib.question-variety tests/lib.question-writer.test.ts` (3 files, 61 tests)
  green; eslint on both files clean; `npx tsc --noEmit` clean. Full `npm run test` and build not run (7c runs them).
- **Note for 7b:** 7b changes the window (3–14 days) and rotation in `seasonalFor`; the year-simulation test asserts
  `seasonalNights > 100` (Speed) / `> 10` (Live) — adjust if the new window changes those counts. The old
  "two events … the soonest" test will need replacing for D43's rotation.
- **Open questions for Andrew:** none.
