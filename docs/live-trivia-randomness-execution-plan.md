# Live Trivia Randomness Execution Plan

## Purpose

This document is the handoff reference for implementing stronger Live Trivia question randomization without re-deriving the design from scratch.

Use this as the primary context file when resuming the work in a later Codex 5.5 session.

## Why This Work Exists

Live Trivia questions are sometimes added to a category JSON file in batches that sound similar, use similar wording patterns, or cover closely related subtopics. When those questions are later selected for a round, the current seeding logic can still produce local clusters where:

- similar-sounding questions appear back-to-back
- questions about the same subtopic appear too close together
- questions with similar slugs appear near each other
- questions are overdrawn from one section of the category file instead of being spread across the beginning, middle, and end

The goal is to preserve deterministic, venue-aware seeding while making the resulting rounds feel more varied in wording, topic, and source-file distribution.

## Current Code Reality

The most important runtime function is:

- [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:608) `buildLiveTriviaOccurrenceSeedSlots(...)`

The most important runtime entrypoint is:

- [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:1602) `seedOccurrenceQuestions(...)`

The admin preview / schedule generation path is:

- [lib/liveShowdownAdmin.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownAdmin.ts:385) `buildLiveShowdownQuestionMatrix(...)`

Important correction versus older docs:

- The current runtime seeder is already category-first.
- It already prefers unseen questions.
- It already includes a lightweight diversity scorer based on topic tags, stems, and recent-question penalties.

Relevant current helpers live in:

- [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:470)
- [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:552)

That means this project is an upgrade of the existing diversity system, not a greenfield rewrite.

## User Requirements

The implementation must ensure that Live Trivia rounds:

1. avoid placing similar-sounding questions close together
2. avoid placing same-topic questions close together
3. avoid placing questions with similar slugs close together
4. draw questions from all sections of the source JSON file
5. distribute questions across the beginning, middle, and end of each category file as evenly as practical
6. remain deterministic per venue, schedule, and occurrence date
7. preserve unseen-first behavior and existing venue history protections

## Non-Negotiable Constraints

- Only use `question_pool = 'live_showdown'`
- Preserve write-in-compatible Live Trivia answer eligibility
- Preserve idempotent occurrence seeding
- Preserve deterministic output for the same empty occurrence inputs
- Preserve venue/date variation in seeds
- Avoid duplicate slugs within an occurrence unless inventory forces fallback
- Avoid category repetition within an occurrence unless round count forces fallback
- Keep admin replacement / swap workflows compatible

## Recommended Model By Phase

- Phases 1-6: `Codex 5.5`
- Phases 7-8: `Codex 5.4` is acceptable, `Codex 5.5` preferred if available

## Intelligence Level By Phase

- Phase 1: `medium`
- Phase 2: `high`
- Phase 3: `high`
- Phase 4: `high`
- Phase 5: `medium-high`
- Phase 6: `medium-high`
- Phase 7: `medium`
- Phase 8: `medium`

## Proposed Rule Set For V1

These are the default starting thresholds unless implementation evidence suggests slight tuning:

- `slugFamilySpacingMin = 5`
- `templateSpacingMin = 2`
- `topicWindow = 4`
- `sourceBands = ["start", "middle", "end"]`
- `bandTargetStrategy = even-as-possible-per-round`

Interpretation:

- Two questions with the same slug family should not appear within 5 positions unless fallback is forced.
- Two adjacent questions should not share the same template key unless fallback is forced.
- Topic similarity should be penalized within the last 4 selected questions.
- A 15-question round should target a `5 / 5 / 5` distribution across start, middle, and end bands when inventory allows.

## Phase 1 Frozen Rules

Status: Phase 1 complete. These rules are the canonical V1 contract for the implementation phases that follow.

### Similarity Signals

`slugFamily`

- Derived from the question slug.
- Normalize to lowercase ASCII-ish text.
- Split on punctuation, separators, and whitespace.
- Remove trailing low-information variants such as numbers, years, ordinals, roman numerals, and generic differentiators like `part`, `question`, `round`, `set`, `version`, `variant`, `copy`, or `alt`.
- Keep the remaining stable topic/name tokens in their original order.
- If stripping would leave fewer than two meaningful tokens, fall back to the normalized slug without only the final numeric/year suffix removed.
- Purpose: catch questions that are effectively siblings, such as repeated prompts about the same person, team, event, movie, or franchise.

`templateKey`

- Derived from the normalized question text, not the slug.
- Classify common openings before using a generic fallback.
- V1 template keys:
  - `what-is`
  - `what-year`
  - `who-is`
  - `which-team`
  - `which-country`
  - `which-city`
  - `which-state`
  - `which-movie`
  - `which-tv-show`
  - `name-this`
  - `identify-this`
  - `generic`
- Similar phrasings should collapse to the same key. For example, "What year..." and "In what year..." should both be `what-year`.
- Purpose: avoid a round feeling like the same sentence pattern repeated.

`topicTokens`

- Derived from category plus normalized question text.
- Lowercase, punctuation-stripped tokens.
- Remove deterministic stop words, question words, helper verbs, answer-format words, and short low-signal words.
- Keep proper nouns and domain nouns when detectable by token shape or because they survive the stop-word filter.
- Include category tokens so a question can still be clustered when the wording is sparse.
- Purpose: create a lightweight deterministic overlap signal without calling an LLM.

`topicCluster`

- Deterministic string derived from the strongest `topicTokens`.
- Prefer the first two to four stable non-stopword tokens after normalization.
- Include the normalized category when there are too few question-specific topic tokens.
- Purpose: give the scorer a coarse same-subtopic signal in addition to raw token overlap.

### Spacing Behavior

Same `slugFamily` hard spacing:

- Minimum spacing is `5` positions.
- A candidate is invalid in normal mode if any of the previous 5 selected questions in the same occurrence share its `slugFamily`.
- This applies across round boundaries, not only inside a single 15-question round, because back-to-back rounds are part of the player experience.
- The rule may be relaxed only in an explicit fallback tier after all valid unseen and seen candidates for the current category/slot have been exhausted.

Same `templateKey` adjacency:

- Minimum spacing is `2` positions.
- A candidate is invalid in normal mode if the immediately previous selected question has the same `templateKey`.
- Non-adjacent repetition is allowed but receives a soft penalty while the matching template is still inside the recent-question window.
- The hard adjacency rule may be relaxed only after unseen and seen hard-spacing-valid candidates cannot fill the slot.

Topic overlap rolling window:

- Recent topic window is `4` positions.
- Topic overlap is a soft penalty, not a hard rejection.
- Penalize repeated `topicCluster` within the window.
- Penalize each overlapping `topicToken` with a larger cost for the immediately previous question and a smaller cost for positions 2-4 back.
- Topic penalties apply across round boundaries.
- Topic penalties should never force the system to choose a seen question over an otherwise valid unseen question unless the seen candidate is meaningfully better on hard spacing and band balance in the active fallback tier.

### Source Distribution Behavior

Source bands:

- Each category file is split into three source bands: `start`, `middle`, and `end`.
- Use the row's source order within its original category file.
- Convert source order to a percentile in `[0, 1]`.
- Band mapping:
  - `start`: percentile `< 1 / 3`
  - `middle`: percentile `>= 1 / 3` and `< 2 / 3`
  - `end`: percentile `>= 2 / 3`
- For very small categories, preserve deterministic ordering and assign bands as evenly as practical rather than forcing exact percentile math to create empty bands.

Band targets:

- Use `even-as-possible-per-round`.
- For a 15-question round, target `start: 5`, `middle: 5`, `end: 5`.
- For counts not divisible by 3, assign the remainder deterministically in band order `start`, `middle`, `end`.
- Examples:
  - 10 questions: `start: 4`, `middle: 3`, `end: 3`
  - 14 questions: `start: 5`, `middle: 5`, `end: 4`
  - 15 questions: `start: 5`, `middle: 5`, `end: 5`

Band fallback:

- Prefer candidates from bands that are below target.
- Allow candidates from an at-target band when no below-target candidate is available in the current unseen/seen and hard-spacing-valid tier.
- Allow candidates from an over-target band before relaxing `slugFamily` or adjacent `templateKey` spacing.
- Thin bands do not block filling a round. If a category has little or no inventory in one band, redistribute the unmet target to the remaining bands through scoring rather than hard rejection.
- Source-band balancing is scoped to each round. Occurrence-level balance is useful as a tie-breaker, but round-level variety is the V1 product requirement.

### Fallback Order

For each slot, use this order:

1. Unseen candidate, unused in occurrence, hard-spacing valid, from a below-target source band.
2. Unseen candidate, unused in occurrence, hard-spacing valid, any source band.
3. Seen candidate, unused in occurrence, hard-spacing valid, from a below-target source band.
4. Seen candidate, unused in occurrence, hard-spacing valid, any source band.
5. Unseen candidate, unused in occurrence, relaxed source-band and relaxed template adjacency, but still respecting slug-family spacing where possible.
6. Seen candidate, unused in occurrence, relaxed source-band and relaxed template adjacency, but still respecting slug-family spacing where possible.
7. Unused candidate with relaxed slug-family spacing.
8. Repeat an already-used slug only when the selected category cannot otherwise fill the required number of slots.

Tie-breaking:

- All ties must be deterministic.
- Use seeded shuffles or seeded numeric tie-breakers based on venue, schedule, occurrence date, round, category, and slot.
- Do not use `Math.random()` in runtime seeding.

Preserved guarantees:

- Prefer venue-unseen questions before venue-seen questions within the active fallback tier.
- Do not duplicate slugs within an occurrence unless inventory forces it.
- Do not repeat categories within an occurrence unless round count or category inventory forces it.
- Continue selecting only `question_pool = 'live_showdown'`.
- Continue filtering to write-in-compatible questions.

## Key Design Decision

The system should treat each candidate question as having two types of diversity metadata:

1. semantic-ish metadata
   - slug family
   - template key
   - topic tokens / topic cluster
   - stem

2. source-order metadata
   - source order
   - source percentile within file
   - source band: `start`, `middle`, `end`

The scheduler should optimize for both types simultaneously.

## File Targets

Primary implementation files:

- [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:608)
- [lib/liveShowdownAdmin.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownAdmin.ts:385)

Recommended new helper file:

- [lib/liveTriviaSeeding.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveTriviaSeeding.ts)

Likely tests:

- [tests/lib.live-trivia-occurrence-seeding.test.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/tests/lib.live-trivia-occurrence-seeding.test.ts:1)

Likely audit script:

- [scripts/audit-live-trivia-randomness.cjs](/Users/andrewserulneck/Documents/Trivia-Predictions/scripts/audit-live-trivia-randomness.cjs)

Possible schema / import touchpoints:

- [scripts/migrate-live-trivia.cjs](/Users/andrewserulneck/Documents/Trivia-Predictions/scripts/migrate-live-trivia.cjs:1)
- [app/api/admin/trivia/questions/convert-live-export/route.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/app/api/admin/trivia/questions/convert-live-export/route.ts:1)

Canonical source files:

- [data/live-trivia/categories](/Users/andrewserulneck/Documents/Trivia-Predictions/data/live-trivia/categories)

## Phased Execution Plan

## Phase 1: Freeze The Rules

Model: `Codex 5.5` preferred, `Codex 5.4` acceptable  
Intelligence: `medium`

Status: complete. See [Phase 1 Frozen Rules](#phase-1-frozen-rules) above for the canonical V1 thresholds, similarity signals, spacing behavior, source-band behavior, and fallback order.

Goal:

Turn the user request into concrete thresholds and fallback rules before touching logic.

Work:

- Update the older planning notes if desired, but treat this document as the canonical execution reference.
- Define the exact similarity signals:
  - `slugFamily`
  - `templateKey`
  - `topicTokens` / `topicCluster`
- Define spacing behavior:
  - same slug family minimum spacing
  - same template adjacency rules
  - topic-overlap rolling window penalties
- Define source distribution behavior:
  - split each category file into `start`, `middle`, `end`
  - target even-as-possible draw across bands
  - define fallback rules when a band is thin

Acceptance:

- Written thresholds and fallback order are explicit.
- Future implementation can proceed without reinterpreting the product goal.

## Phase 2: Add Diversity Metadata Helpers

Model: `Codex 5.5`  
Intelligence: `high`

Status: complete. The reusable helper module lives in [lib/liveTriviaSeeding.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveTriviaSeeding.ts:1), with focused coverage in [tests/lib.live-trivia-seeding.test.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/tests/lib.live-trivia-seeding.test.ts:1).

Goal:

Create stable, deterministic metadata for each question.

Recommended extraction:

- Add a new helper module at [lib/liveTriviaSeeding.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveTriviaSeeding.ts) if the logic starts to crowd `lib/liveShowdownEngine.ts`.

Recommended types:

```ts
export type LiveTriviaSourceBand = "start" | "middle" | "end";

export type NormalizedLiveTriviaSeedQuestion = {
  slug: string;
  question: string;
  category: string;
  options: unknown;
  correct_answer: number;
  question_pool: "live_showdown" | "anytime_blitz";
  sourceOrder: number;
  sourcePercentile: number;
  sourceBand: LiveTriviaSourceBand;
};

export type LiveTriviaQuestionProfile = {
  slug: string;
  category: string;
  slugFamily: string;
  templateKey: string;
  topicTokens: Set<string>;
  cluster: string;
  stem: string;
  sourceBand: LiveTriviaSourceBand;
  sourceOrder: number;
};
```

Recommended helpers:

```ts
normalizeLiveTriviaCategory(value: unknown): string
normalizeDiversityText(value: unknown): string
inferQuestionStem(question: string): string
inferSlugFamily(slug: string): string
inferTemplateKey(question: string): string
inferTopicTokens(category: string, question: string): Set<string>
getSourcePercentile(index: number, total: number): number
getSourceBand(percentile: number): LiveTriviaSourceBand
buildQuestionProfile(row: NormalizedLiveTriviaSeedQuestion): LiveTriviaQuestionProfile
```

Heuristic guidance:

- `inferSlugFamily` should normalize slug tokens and strip trailing numbers, years, ordinals, and low-signal suffixes.
- `inferTemplateKey` should classify common openings such as:
  - `what-is`
  - `what-year`
  - `who-is`
  - `which-team`
  - `which-country`
  - `name-this`
- `inferTopicTokens` should be deterministic and stop-word filtered.

Acceptance:

- Each candidate question has a stable semantic profile and a stable source-order profile.

## Phase 3: Strengthen Candidate Scoring

Model: `Codex 5.5`  
Intelligence: `high`

Status: complete. The runtime occurrence picker now uses the shared `LiveTriviaQuestionProfile`, hard-spacing checks, source-band targets, and tunable scoring constants from [lib/liveTriviaSeeding.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveTriviaSeeding.ts:1).

Goal:

Replace the lightweight similarity penalties with a stricter, tunable model.

Suggested constants:

```ts
const SLUG_FAMILY_HARD_SPACING = 5;
const TEMPLATE_HARD_SPACING = 2;
const RECENT_TOPIC_WINDOW = 4;

const PENALTY_SEEN = 12;
const PENALTY_CLUSTER_IMMEDIATE = 120;
const PENALTY_CLUSTER_RECENT = 36;
const PENALTY_TEMPLATE_IMMEDIATE = 80;
const PENALTY_TEMPLATE_RECENT = 20;
const PENALTY_SLUG_FAMILY_IMMEDIATE = 150;
const PENALTY_SLUG_FAMILY_RECENT = 40;
const PENALTY_TOPIC_TOKEN_OVERLAP_IMMEDIATE = 18;
const PENALTY_TOPIC_TOKEN_OVERLAP_RECENT = 7;
const PENALTY_BAND_OVER_TARGET = 24;
```

Recommended function shape:

```ts
type RoundSelectionState = {
  recentProfiles: LiveTriviaQuestionProfile[];
  bandCounts: Record<LiveTriviaSourceBand, number>;
  targetBandCounts: Record<LiveTriviaSourceBand, number>;
};

violatesHardSpacing(
  profile: LiveTriviaQuestionProfile,
  recentProfiles: readonly LiveTriviaQuestionProfile[]
): boolean

scoreCandidate(
  profile: LiveTriviaQuestionProfile,
  state: RoundSelectionState,
  wasSeen: boolean
): number
```

Hard constraints:

- reject candidates when the same slug family appears within the last 5 picks, unless fallback mode is active
- reject adjacent same-template candidates unless fallback mode is active

Soft penalties:

- same topic cluster in recent window
- topic-token overlap
- template repetition outside the hard block
- source-band overuse
- seen-question fallback cost

Acceptance:

- The scoring model clearly prefers different wording, different topics, and better file-position spread.

## Phase 4: Replace Greedy Selection With Balanced Round Scheduling

Model: `Codex 5.5`  
Intelligence: `high`

Status: complete. Runtime occurrence seeding now uses `pickBalancedRoundQuestions(...)` with explicit per-slot fallback tiers, round-level band targets, seeded tie-breaking, and repeat-only-after-inventory-exhaustion behavior. Source bands are still derived from deterministic category order until Phase 5 adds real JSON/source-order metadata.

Goal:

Build rounds with local spacing and band-balance awareness, not just generic diversity scoring.

Recommended function shape:

```ts
buildBandTargets(count: number): Record<LiveTriviaSourceBand, number>

pickBalancedRoundQuestions(params: {
  rows: readonly NormalizedLiveTriviaSeedQuestion[];
  seenSlugs: ReadonlySet<string>;
  usedInOccurrence: Set<string>;
  scheduleSeed: number;
  roundNumber: number;
  count: number;
}): Array<{
  row: NormalizedLiveTriviaSeedQuestion;
  wasSeen: boolean;
  profile: LiveTriviaQuestionProfile;
}>
```

Suggested algorithm:

1. Split rows into unseen and seen pools.
2. Remove any row already used in the occurrence.
3. Compute source-band targets for the round.
4. Use seeded shuffles only for deterministic tie-breaking.
5. Fill round slots one at a time.
6. For each slot, try candidates in progressive fallback tiers:
   - unseen + hard-spacing valid + best band fit
   - unseen + relax band fit
   - seen + hard-spacing valid
   - seen + relaxed spacing
   - repeated questions only if inventory is exhausted
7. Pick the lowest-penalty candidate within the active tier.

Implementation note:

- This likely replaces or heavily rewrites the current `pickDiverseLiveTriviaRows(...)` helper in [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:552).

Acceptance:

- Rounds are more balanced by wording, topic, slug family, and source-file section.

## Phase 5: Make Source Order Available At Runtime

Model: `Codex 5.5`  
Intelligence: `medium-high`

Status: complete. Added nullable `source_order` and `source_file` columns via [supabase/migrations/20260624000000_add_live_trivia_source_metadata.sql](/Users/andrewserulneck/Documents/Trivia-Predictions/supabase/migrations/20260624000000_add_live_trivia_source_metadata.sql:1), stamps those fields during Live Trivia imports, and expands runtime seeding to load them. Runtime also merges canonical JSON source metadata as a fallback when DB rows are missing source fields or the migration has not reached the target database yet.

Goal:

Support beginning/middle/end balancing with real source-order data.

Important constraint:

- The source-band requirement is only trustworthy if runtime rows preserve original JSON order.

Recommended implementation:

Add persistent metadata for Live Trivia rows:

- `source_order integer null`
- `source_file text null`

Update any import or migration path that creates Live Trivia DB rows so these fields are stamped from canonical JSON order.

Runtime query target:

- [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:1643)

Expected query expansion:

```ts
.select("slug, question, category, options, correct_answer, question_pool, source_order, source_file")
```

Fallback if schema work is deferred:

- Build a `slug -> source_order` map by reading [data/live-trivia/categories](/Users/andrewserulneck/Documents/Trivia-Predictions/data/live-trivia/categories) at seed time and merge it onto pool rows before scheduling.

Preference:

- Schema-backed metadata is cleaner and more reliable if this logic will live long-term.

Acceptance:

- The scheduler can reliably classify every candidate into `start`, `middle`, or `end`.

## Phase 6: Unify Runtime And Admin Paths

Model: `Codex 5.5`  
Intelligence: `medium-high`

Status: complete. Runtime occurrence seeding and admin schedule matrix generation now both load active Live Trivia questions through `loadActiveLiveTriviaSeedQuestionPool(...)` and build slots through `buildLiveTriviaOccurrenceSeedSlots(...)`, so they share source metadata fallback, filtering, deterministic balancing, and diversity scoring. Manual replacement/swap workflows remain compatible and can be tightened further with a slot-specific replacement helper in a later pass if desired.

Goal:

Prevent behavior drift between admin preview seeding and live occurrence seeding.

Files:

- [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:1602)
- [lib/liveShowdownAdmin.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownAdmin.ts:385)

Target:

- Both paths should call the same core round-building and candidate-selection helpers.

Optional helper:

```ts
pickReplacementQuestionForSlot(params: ...): string | null
```

That would let admin question replacement respect:

- same round category
- local spacing rules
- source-band balance when possible

Acceptance:

- Admin-created schedules and runtime-seeded occurrences follow the same diversity contract.

## Phase 7: Add Tests For The New Guarantees

Model: `Codex 5.4` acceptable, `Codex 5.5` preferred  
Intelligence: `medium`

Status: complete. Added regression coverage for slug-family spacing, adjacent template avoidance, topic-window spread, exact 15-question source-band balance, lopsided band fallback, and forced-scarcity repeats. The scheduler now also prefers hard-spacing-valid candidates without meaningful recent topic-token overlap, ignoring category-only overlap so same-category rounds can still fill naturally.

Goal:

Cover the exact behaviors that matter to the product.

Primary target:

- [tests/lib.live-trivia-occurrence-seeding.test.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/tests/lib.live-trivia-occurrence-seeding.test.ts:1)

Recommended helper tests:

- `inferSlugFamily`
- `inferTemplateKey`
- `getSourceBand`
- `violatesHardSpacing`
- `buildBandTargets`

Recommended scenario tests:

- same inputs produce same seeded order
- different venue/date produces different seeded order
- same slug family does not appear within 5 positions when avoidable
- adjacent template duplicates are avoided when avoidable
- topic clustering is reduced inside the rolling window
- band distribution is near-even for 15-question rounds
- fallback behaves correctly when inventory is lopsided
- repeated questions happen only under forced scarcity

Acceptance:

- Regressions become easy to catch before rollout.

## Phase 8: Add An Audit And Tuning Script

Model: `Codex 5.4`  
Intelligence: `medium`

Status: complete. Added [scripts/audit-live-trivia-randomness.cjs](/Users/andrewserulneck/Documents/Trivia-Predictions/scripts/audit-live-trivia-randomness.cjs:1) and the `live-trivia:randomness:audit` npm script. The audit reads canonical Live Trivia JSON, simulates deterministic seeded rounds through the production seeding helper, reports collision/band/repeat metrics, and includes a baseline-vs-balanced comparison summary.

Goal:

Tune the heuristic system with data rather than intuition.

Recommended new script:

- [scripts/audit-live-trivia-randomness.cjs](/Users/andrewserulneck/Documents/Trivia-Predictions/scripts/audit-live-trivia-randomness.cjs)

Suggested CLI shape:

```bash
node scripts/audit-live-trivia-randomness.cjs --category history --rounds 100
```

Suggested output metrics:

- adjacent template-collision rate
- slug-family spacing violation rate
- repeated topic-cluster adjacency rate
- average start/middle/end distribution by round
- old-vs-new comparison summary

Acceptance:

- Penalty constants can be tuned with measurable output instead of guesswork.

## Safest First Implementation Slice

If implementation should start with the lowest-risk, highest-value path, do this:

1. Add diversity metadata helpers
2. Add `source_order` support or a temporary `slug -> source_order` merge layer
3. Replace only the per-round picker first
4. Keep category selection mostly unchanged
5. Add tests
6. Unify the admin path after the runtime path is stable

This path captures the main user-facing improvement without expanding scope too early.

## Acceptance Criteria Summary

The final implementation should satisfy all of the following when inventory allows:

- category-homogeneous rounds
- deterministic same-input results
- venue/date-based variation
- unseen-first selection
- no duplicate slug reuse within an occurrence
- no close slug-family clustering
- no adjacent template duplication
- reduced same-topic clustering
- near-even `start / middle / end` band distribution
- compatible admin and runtime behavior

## Notes For The Next Codex 5.5 Session

Start by reading:

1. this file
2. [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:470)
3. [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:608)
4. [lib/liveShowdownEngine.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownEngine.ts:1602)
5. [lib/liveShowdownAdmin.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/liveShowdownAdmin.ts:385)
6. [tests/lib.live-trivia-occurrence-seeding.test.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/tests/lib.live-trivia-occurrence-seeding.test.ts:1)

Recommended first coding move:

- Extract or add the metadata helper layer before altering the scheduler.

Recommended model:

- `Codex 5.5`

Recommended first execution target:

- runtime occurrence seeding first
- admin path second
- audit/tuning script after tests
