# Phase 4c.6 handoff — Speed answers in a fair, hidden order (D31)

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c.6" (and its "As built" block). Done 2026-11-16 on
Opus 5.5 / high, the plan's model and effort.

## For Andrew (plain English)

- **What changed (Speed Trivia only):**
  - Each question's four answers now show in a mixed-up order. The order is fixed per question, so a refresh or a
    resumed round shows the same order. Before, the right answer was in slot C 43% of the time. On today's 2,524 active
    questions it now lands in A / B / C / D 24.8 / 26.3 / 23.6 / 25.3% of the time.
  - Answers like "All of the above" or "Both Steel and Kevlar" always stay last. 8 questions have one (5 live, 3 waiting).
  - The browser no longer receives the right answer before the player taps, so it can't be read with developer tools.
    The server grades the tap and sends the answer back with the result.
  - The cost: the right answer appears about 0.1–0.3 seconds after the tap, instead of instantly. The tapped answer
    is highlighted, with a spinner, while it waits.
  - A time-out now says "Time's up. Correct answer: …" (before, it was quickly replaced by "Incorrect").
- **Is it live?** No. Uncommitted on `feature/speed-trivia-variety`, like 4c.1–4c.5. No database change, no data change,
  no paid call. The app picks it up from the website when it's deployed; no app update is needed.
- **Cost:** $0. No extra reads or writes.
- **What's left:** 4c.7 (Report button) → 4c.4 (checks, migrations, then commit, merge and deploy). Nothing here needs you.

## For the next agent (Phase 4c.7)

### 1. Next phase goal and scope

Phase 4c.7: a Report button after answering, in both games (D32). Plan §4 "Phase 4c.7": reason lists, a new
`question_reports` table (grants, RLS, abuse limits), a player API route, an export for Andrew. Its migration is
written and PGlite-tested, **not applied** (4c.4 applies it). Out of scope: deploys and `supabase db push`.
4c.7 edits `components/trivia/TriviaGame.tsx` too, so build on this phase's version of the answer handler (below).

### 2. Starting state

- Branch `feature/speed-trivia-variety`, last commit `1aa32e4e`. **All 4a–4c.6 work is uncommitted** by design (D23).
  Never `git checkout -- <file>`, `git stash` or `git reset`.
- No migration in 4c.6. Still waiting for 4c.4 to apply: `20261117025917_live_publish_pr_open.sql` (4c.2) and
  `20261117033637_speed_trivia_expire_undated_current_events.sql` (4c.3).
- Production was **read only** (one paged read of `trivia_questions` `id, question, options, correct_answer, status`,
  Speed pool, `active` + `pending_review`: 2,524 + 2,412 rows). Nothing was written. The scratch outputs (with ids and
  stored answers) stay in the session scratchpad and must never be committed.

### 3. Decisions made in this phase

- Implemented as the plan specifies, with one **departure**: `order: 1` is on **each question**, not once on the GET
  response. Questions outlive the response in the warm cache (`lib/warmupCache.ts`, sessionStorage, 5 min, written by
  `components/venue/VenueHubClient.tsx` ~line 1102) and the interrupted-round snapshot (`tp:trivia:live-preview:v1`,
  local + session storage, 1 hour). A question saved by the pre-deploy script has no `order` and stored-order options,
  so the new script posts it without `order` and the server grades it in stored order. A per-response flag couldn't
  tell those apart.
- **Check-first result:** 8 "lean on the others" options, all already in stored slot D (ids in the plan's "As built").
  The pin regex (`isPinnedLastOption`): `^(all|none) of (the above|these|them)`, `^all (three|four)`, `^both`,
  `^neither`, case-insensitive, whole word. "Bothell", "All Saints", "Nonesuch" don't match (tested).
- PRNG: seed = first 8 bytes of `sha256(questionId)` (big-endian), SplitMix64, Fisher–Yates over the unpinned indexes;
  pinned indexes follow in stored order. No secret: the order doesn't reveal the answer.
- A pick outside `0..n-1` (including `-1` time-out) passes through unchanged, so it's stored as today and graded wrong.
- **Never commit production ids together with stored answers** (the algorithm is public). The slot-spread test uses
  synthetic uuid-shaped ids with production's stored mix (419 / 800 / 1,077 / 228).

### 4. Files created or changed

- **New** `lib/triviaOptionOrder.ts`: `optionOrder`, `questionOptionOrder`, `isPinnedLastOption`, `storedIndexFor`,
  `shownIndexFor`. Uses `node:crypto`, so server only in practice (the client never needs it).
- `types/index.ts`: **new** `PlayerTriviaQuestion` (`id, question, options, category?, difficulty?, imageUrl?,
  imageCredit?, order?: 1`; no answer field). `TriviaQuestion` is unchanged (Admin still uses it).
- `lib/trivia.ts`: `toPlayerTriviaQuestion` (built field by field), `getPlayerTriviaQuestions` (wraps the unchanged
  `getTriviaQuestions`); `submitTriviaAnswer` gains `shownOrder?: boolean` → `storedAnswer` (graded and inserted) and
  `correctAnswer` (shown index) on all four reply paths (normal, already answered, 23505 race, unsaved/fallthrough).
- `app/api/trivia/route.ts`: GET → `getPlayerTriviaQuestions`; POST body `order?: number`, passes
  `shownOrder: body.order === 1`.
- `components/trivia/TriviaGame.tsx`: `PlayerTriviaQuestion` throughout; `normalizeTriviaQuestion` no longer requires
  `correctAnswer` and keeps `order`; `chooseAnswer` sends `order: 1` when the question has it, and does **nothing
  visible until the reply** except the selected/busy pick (existing `isSubmitting` spinner). From the reply:
  `setRevealedCorrectAnswer(reply.correctAnswer)`, then already-answered text, or Correct (animation +
  `updateAnimationPayload(correctAnimationId, { pointsAwarded })`, pulse, points flow), Time's up, or Incorrect
  (`SPEED_TRIVIA_WRONG`). `triggerCelebration(wasCorrect)` once. `forfeitQuestion` (answer `-1`) is unchanged: `-1`
  needs no order.
- `lib/warmupCache.ts`: type only (`PlayerTriviaQuestion`).
- **New tests:** `tests/lib.trivia-option-order.test.ts` (8), `tests/api.speed-trivia-answer-order.test.ts` (9),
  `tests/components.speed-trivia-answer-reveal.test.ts` (5), `tests/speed-trivia-answer-hidden-contract.test.ts` (5).
- Docs: plan status line, 4c.6 "As built", §7 standing rule reworded (`questionOptionOrder`, `PlayerTriviaQuestion`,
  never publish ids with answers).

### 5. Facts and traps

- The waiting Speed status is `pending_review`, not `waiting`.
- **Phase 5 slot check:** `trivia_answers.answer` holds the **stored** index. To measure the shown slot of the right
  answer, recompute `questionOptionOrder(id, options)` per question and take `perm.indexOf(correct_answer)`; only
  answers made after the D23 deploy count.
- Component test trap: `TriviaGame`'s bootstrap effect depends on `useRouter()` and `useVenuePresence()` through
  callbacks. Mocks must return **stable** objects, or the effect re-runs, the first run's recovery is cancelled, and
  the round falls through to a GET. The test enters the round through the interrupted-question snapshot (question 2,
  no countdown); 4c.7 can reuse that harness.
- `tests/speed-trivia-correct-points.test.ts` scans `TriviaGame.tsx` for `correctAnimationId = triggerAnimation("SPEED_TRIVIA_CORRECT")`
  and `updateAnimationPayload(correctAnimationId, { pointsAwarded })`; keep both strings if the handler moves.
- The contract test fails if `TriviaGame.tsx` reads `.correctAnswer` from anything but `payload.result`, or if
  `TriviaGame.tsx` / `lib/warmupCache.ts` mention `TriviaQuestion`.
- Without `SESSION_SECRET` (dev only), a POST without a user id is graded unsaved and returns the answer. Production
  enforces the session, so every graded answer is saved (one per player per question). Unchanged by this phase.
- Speed points still use a plain `users.points` update in `submitTriviaAnswer` (pre-existing; not this phase's scope).

### 6. Build, run, test

- `npx vitest run tests/lib.trivia-option-order.test.ts tests/api.speed-trivia-answer-order.test.ts tests/components.speed-trivia-answer-reveal.test.ts tests/speed-trivia-answer-hidden-contract.test.ts tests/speed-trivia-correct-points.test.ts tests/api.speed-trivia-current-events.test.ts` → all pass.
- `npm run test` (2026-11-16) → 572 files passed (1 skipped), 7,457 tests passed, 13 skipped, 0 failed.
- `npx tsc --noEmit`: clean outside `.next/`. `npx eslint` on every changed file: clean.
- **Unverified:** a real browser round (the jsdom test covers the reveal logic; the real tap-to-reveal delay is
  unmeasured) and a deploy-day open tab on the old script (covered by the no-`order` API test and the old-shape
  component test). 4c.4 or 4d can play one round on the preview deploy.

### 7. Open questions for Andrew

- None new. Still open from 4c.3: page the Live admin dropdown's read (it stops at 1,000 rows)?

### 8. Recommended first steps for 4c.7

Model **Opus 5.5 / high** (plan table). Read plan §4 "Phase 4c.7", D32 and `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`.
Write the migration with `supabase migration new` (never edit existing ones), add it to the PGlite test list after
4c.3's, then the route, then the Report button: in Speed it goes after the reply arrives (`revealedCorrectAnswer !==
null`), in `TriviaGame.tsx`'s answer area. Handoff: `speed-trivia-backlog-and-quality-plan_PHASE_4C7_HANDOFF.md`.
