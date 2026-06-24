# Live Trivia Randomness Phase 1

## Status Note

This document is an older phase-1 design note and contains assumptions that are now partially stale relative to the current codebase.

Use [live-trivia-randomness-execution-plan.md](/Users/andrewserulneck/Documents/Trivia-Predictions/docs/live-trivia-randomness-execution-plan.md:1) as the primary implementation handoff and execution reference for all future work on Live Trivia randomness.

The frozen V1 thresholds, similarity signals, source-band rules, and fallback order now live in that document's `Phase 1 Frozen Rules` section.

## Goal

Increase the randomness of Live Trivia question order within categories so players are less likely to see the same category presented with the same or similar question sequence at another venue.

Phase 1 is an audit and design pass only. No runtime behavior changes are included here.

## Current Behavior

Live Trivia currently has two important seeding paths.

1. Admin schedule creation and editing

File: `lib/liveShowdownAdmin.ts`

The admin schedule path uses `buildLiveShowdownQuestionMatrix(numRounds)` to build the initial `trivia_session_questions` rows when a schedule is created or when `numRounds` changes.

Current traits:

- Loads active `trivia_questions` where `question_pool = 'live_showdown'`.
- Filters to questions with usable write-in answers.
- Buckets questions by normalized category.
- Shuffles each category bucket with `Math.random()`.
- Selects round categories first.
- Requires a category to have at least `QUESTIONS_PER_ROUND` questions before it can support a full round.
- Attempts to avoid category repeats by cycling through shuffled eligible categories.
- Fills each round from the selected category.
- Allows at most one standalone numeric answer per round unless forced by fallback.

This path is already conceptually category-first, but it is not deterministic. It is also separate from the newer per-occurrence runtime seeding path.

2. Per-occurrence runtime seeding

File: `lib/liveShowdownEngine.ts`

The cron endpoint `app/api/cron/seed-live-trivia-occurrences/route.ts` calls `findOccurrencesToSeed()` and then `seedOccurrenceQuestions(scheduleId, occurrenceDate, venueId, numRounds)`.

Current traits:

- Seeds only active or next-24-hour occurrences.
- Is idempotent for `(schedule_id, occurrence_date)`.
- Loads venue-level seen slugs from `venue_seen_questions`.
- Loads active `live_showdown` question slugs in sorted order.
- Splits the full pool into unseen and seen slugs.
- Applies deterministic seeded shuffle using `djb2(`${venueId}${occurrenceDate}`)`.
- Fills all slots sequentially from the shuffled global unseen pool, then the shuffled seen pool.
- Writes rows to `trivia_session_questions` by round and question index.
- Records selected slugs in `venue_seen_questions`.

This path is deterministic and venue-aware, but it is global-pool-first. It does not bucket by category or intentionally randomize question order within a selected category.

## Root Cause

The user-facing issue is most likely caused by the runtime occurrence seeder replacing the older category-first mental model with a single global shuffle.

When a Live Trivia occurrence is seeded through `seedOccurrenceQuestions`, the system no longer says:

1. Choose a category for the round.
2. Shuffle questions inside that category.
3. Fill the round from that shuffled category.

Instead, it says:

1. Shuffle all eligible Live Trivia slugs together.
2. Pour the result into round slots.

That can make the question order within categories feel repeated or accidental, especially if categories appear repeatedly across venues and the underlying slug order plus seeded shuffle creates similar local clusters.

## Design Principles

The next implementation should preserve the useful guarantees from both paths.

- Keep idempotency: reseeding the same `(scheduleId, occurrenceDate)` should not change an already seeded occurrence.
- Keep deterministic generation before insert: if the same occurrence has no rows yet and the same inputs are used, it should produce the same result.
- Keep venue variation: different venues should receive different category and question ordering.
- Keep date variation: the same venue on different dates should receive different category and question ordering.
- Keep category-first rounds: a round should represent a category, and question ordering within that category should be explicitly shuffled.
- Keep venue-level de-duplication: unseen questions at that venue should be preferred before seen questions.
- Avoid repeats within a single occurrence unless inventory forces a fallback.
- Avoid crossing pools: only `question_pool = 'live_showdown'` should be used.
- Preserve Live Trivia answer constraints: selected questions should remain write-in-compatible.
- Preserve admin controls: manual question swaps and round replacement should still work.

## Target Behavior

For each occurrence, the seeder should:

1. Load active Live Trivia questions with at least `slug`, `category`, `options`, and `correct_answer`.
2. Filter out blocked categories and non-write-in-compatible questions.
3. Build category buckets using the same category normalization as the admin path.
4. Load `venue_seen_questions` and split each category bucket into unseen and seen candidates.
5. Build an eligible category list.
6. Select round categories using deterministic seeded shuffle.
7. For each selected category, pick `QUESTIONS_PER_ROUND` questions using deterministic seeded shuffle.
8. Prefer unseen questions within the selected category.
9. Fall back to seen questions within the selected category if needed.
10. Fall back to repeated categories only if there are not enough eligible categories for the requested number of rounds.
11. Fall back to repeated questions only if a selected category cannot otherwise fill the round.
12. Insert `trivia_session_questions` with the same occurrence-aware uniqueness behavior as today.
13. Upsert selected slugs into `venue_seen_questions`.

## Seeding Key Proposal

Use distinct seed strings for each randomness layer so category order and question order vary independently but remain reproducible.

- Category order seed: `live-trivia:categories:${venueId}:${occurrenceDate}:${scheduleId}`
- Category cycle seed: `live-trivia:category-cycle:${venueId}:${occurrenceDate}:${scheduleId}:${cycleIndex}`
- Question order seed: `live-trivia:questions:${venueId}:${occurrenceDate}:${scheduleId}:${category}:${roundNumber}`
- Seen fallback seed: `live-trivia:seen:${venueId}:${occurrenceDate}:${scheduleId}:${category}:${roundNumber}`

The exact string format is less important than keeping the layers separate and stable.

## Phase 2 Implementation Shape

Recommended extraction:

- Add a small shared helper in `lib/liveShowdownEngine.ts` or a new server-only module such as `lib/liveShowdownSeeding.ts`.
- Reuse that helper from both `seedOccurrenceQuestions` and `buildLiveShowdownQuestionMatrix` if practical.
- Keep Phase 2 focused on the occurrence seeder if shared extraction creates too much risk. Phase 3 can unify the admin path afterward.

Suggested helper responsibilities:

- normalize category names
- determine write-in eligibility
- bucket questions by category
- seeded shuffle
- select round categories
- pick questions for one category round

## Acceptance Criteria

- A seeded occurrence still creates exactly `numRounds * QUESTIONS_PER_ROUND` slots when enough inventory exists.
- Every question in a normal round comes from that round's selected category.
- Re-running seeding after rows exist returns skipped rows and does not mutate the occurrence.
- The same empty occurrence inputs produce the same rows.
- Different venue IDs produce different category or question ordering for the same schedule/date.
- Different occurrence dates produce different category or question ordering for the same venue/schedule.
- The seeder prefers venue-unseen slugs before venue-seen slugs.
- No slug repeats within an occurrence unless total eligible inventory forces repetition.
- No category repeats within an occurrence unless the number of rounds exceeds eligible category count.
- The implementation does not select Speed Trivia questions.
- Manual admin replacement and single-question swap behavior remains compatible with seeded occurrence rows.

## Test Plan

Add focused unit tests around pure helper logic where possible.

Recommended cases:

- `selects categories before questions`: selected rounds are category-homogeneous.
- `is deterministic for same seed`: same input produces identical category and question order.
- `varies by venue`: changing venue ID changes the output.
- `varies by date`: changing occurrence date changes the output.
- `prefers unseen within category`: unseen candidates are consumed before seen candidates.
- `falls back to seen within category`: seen candidates are used when unseen candidates cannot fill the round.
- `avoids duplicate slugs`: no repeats while enough inventory exists.
- `cycles categories only when needed`: category repeats only after all eligible categories have been used.
- `excludes non-live pool`: `anytime_blitz` rows are ignored.
- `excludes blocked categories`: blocked Live Trivia categories do not appear.

Integration-level coverage can stay light:

- Mock Supabase responses for `seedOccurrenceQuestions`.
- Verify inserted `trivia_session_questions` rows have expected schedule, occurrence date, round numbers, question indexes, and selected slugs.
- Verify `venue_seen_questions` upsert receives the selected unique slugs.

## Open Questions

- Should category history also be tracked per venue, separate from question history?
- Should we bias away from categories used in the last N occurrences at the same venue?
- Should admin-created preview schedules keep their current random question matrix, or should they become deterministic by schedule/date too?
- Should the admin UI expose a "reshuffle occurrence" action for future, unplayed occurrences?

## Recommendation

Phase 2 should update the per-occurrence seeder first. That is the runtime path most likely responsible for players seeing similar question order across venues.

Phase 3 should then unify the admin matrix builder with the same category-first helper to prevent the schedule preview path and the live runtime path from drifting again.
