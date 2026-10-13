# Speed Trivia uniqueness — Phase 0 handoff

Date: **2026-10-12**. Next phase: **Phase 1, GPT-6.1 Sol / high**.

## Developer summary

The investigation confirms that the current duplicate checks miss rewordings of familiar facts. A separate six-phase implementation plan now covers a shared database check for all Speed Trivia writers, subject variety, safe retirement of existing duplicates, and monitoring/cost caps. **Nothing is live or changed in the database.** No workflow was paused, no model API was called for generation, and no questions were deleted. The next phase inventories current production questions and measures costs; it can begin without further policy questions.

Andrew chose to keep the best version of a repeated fact, preserve past games, allow genuinely different facts about the same artist, accept fewer or zero questions per night, and measure current costs before choosing a budget.

## To the next agent: objective and scope

Read `docs/speed-trivia-uniqueness-plan.md`, particularly sections 1–5 and 10–11. Execute **Phase 1 only**: complete live Speed inventory, recoverable private snapshot, all-writer map, six-example fact-family inventory, evaluation dataset, cost baseline and proposal. Do not apply cleanup or deploy prevention yet.

Speed scope is `anytime_blitz` + `multiple_choice`, across every category, with active/pending/deleted rows included in inventory. Live Trivia content/JSON, generation and historical player/game/reward state are out of scope. No delegation has been requested. Leave unrelated working-tree changes untouched.

## Starting state

- Workspace: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch: `main`.
- Last existing commit: `96b88658dfeeb42ef88aa09fb858d9d794631e04`.
- Git remote `origin`: `https://github.com/AndrewSerulneck/Trivia-Predictions.git` (both fetch and push). `package.json` points to `Hightop-Challenge`; do not assume it is the repository running Actions.
- Pre-existing dirty state: modified `next-env.d.ts`; untracked `.vscode/settings.json`.
- Phase 0 creates only two uncommitted documentation files: this handoff and the plan. No commit or push was performed. Recheck status/HEAD on entry; other user work may have occurred.
- No production database reads, data backups, migrations, data writes, retirements, or undo scripts were executed. There is no Phase 0 backup/undo log because there were no data mutations.
- No workflow run was triggered or disabled. Live workflow/deployment state is unknown; repository YAML is not operational proof.
- Linked database project documented in project rules: `pkmxupsayzshvpirkaav`. Verify it before any live read/write; local development shares production data.
- Private artifact directory proposed for subsequent phases: ignored `tmp/speed-trivia-uniqueness-private/<run-id>/`. `git check-ignore tmp/speed-trivia-uniqueness-private/snapshot.json` returned that path successfully. Arrange durable private backup beyond local ignored/ephemeral files before any mutation.

## Decisions already made

All developer answers were received on 2026-10-12 and incorporated in plan section 1:

1. Keep the best question for a repeated fact and retire other versions, preserving history.
2. Only repeated facts are banned; different facts about an artist are allowed. This explicitly supersedes the initial lifetime one-song/album/artist wording. Subject diversity is still desired; do not impose lifetime entity uniqueness or delete distinct Taylor Swift facts solely for concentration.
3. Quantity can drop below 100 or to zero; novelty wins over quota.
4. Measure spending first, then propose capped one-time and monthly costs. No dollar cap or provider switch is approved/chosen yet.
5. Prefer GPT-6.1 Sol; cheaper models may be evaluated. Engineering recommendations are Sol/high for Phases 1–5, Sol/medium for Phase 6, with optional Luna/medium only for mechanical Phase 6 reports. No need for Astra established.

Semantic comparisons cannot provide a mathematical universal guarantee. The plan requires exact-identity enforcement, zero escapes on the versioned example/held-out duplicate set, measured acceptance of distinct facts, and withholding uncertain generated output from the normal approval queue.

## Files and how the existing system fits together

Created:

- `docs/speed-trivia-uniqueness-plan.md`: canonical standalone implementation plan, decisions, inspected code behavior, six phases, model/effort choices, evaluation/admission/cleanup contracts, cost estimates and restart prompt.
- `docs/speed-trivia-uniqueness-plan_PHASE_0_HANDOFF.md`: this standalone starting context.

Read/inspected, not edited:

- `.github/workflows/trivia-nightly.yml`: daily 02:15 UTC; Gemini defaults/fallback; temp Speed exports → `generate-trivia-nightly.cjs` → importer `pending_review` / Speed / multiple choice.
- `scripts/generate-trivia-nightly.cjs`: `computeNightlyPlan()` uses local counts; `runGeneratorForCategory()` spawns per-category children; up to 4 refill passes.
- `scripts/generate-trivia-questions.cjs`: `buildPrompt()` shows 15 local examples; `fetchExistingDatabaseQuestionCatalog()` excludes deleted rows and returns `[]` for absent credentials; `areQuestionsNearDuplicates()` uses token Dice >=0.9; similarity is category-local. Up to 10 generation attempts; each provider request has up to 5 retry attempts before fallback considerations.
- `scripts/import-trivia-questions.cjs`: `loadExistingQuestionCatalog()`, `filterExistingQuestionRows()`, and upsert chunk loop; same lexical/category weaknesses; shared with Live imports.
- `app/api/admin/trivia/questions/route.ts`: pending GET, direct bulk status approve/delete POST.
- `app/api/admin/trivia/questions/[id]/route.ts`: edits/status changes and soft-delete; DELETE also includes Live-style replacement routines. Avoid it for bulk Speed cleanup without inspecting side effects.
- `lib/admin.ts`: `createAdminTriviaQuestion()`, `updateAdminTriviaQuestion()`, `bulkUpdateAdminTriviaQuestions()`, `updateTriviaBankQuestionByIdOrSlug()`, `deleteTriviaBankQuestionByIdOrSlug()`, and destructive `deleteAdminTriviaQuestion()` represent multiple admission/mutation paths.
- `lib/trivia.ts`: `getTriviaQuestions()` draws active Speed rows; review submission/answer lookup for already-issued questions in later phases.
- `scripts/cleanup-trivia-duplicates.cjs`: only normalized exact duplicates; active/oldest ranking and `status='deleted'`; does not supply a safe semantic manifest/undo procedure.
- `scripts/restore-deleted-speed-trivia.cjs`: `--fix` restores all deleted Speed rows; bypass/resurrection hazard.
- `scripts/backfill-trivia-question-bank.cjs`: legacy importer; its Speed reader expects an older object shape (`normal_multiple_choice`) while current export files are arrays. Inventory rather than assume this script currently imports Speed rows successfully.
- `scripts/sync-local-trivia.cjs`: reverse-syncs both Live and Speed; **do not run**, because canonical rules prohibit database rewrites into Live JSON.
- `scripts/sync-purged-trivia.cjs`, `scripts/generate-map-questions.cjs`, `scripts/generate-science-questions.js`: inspected enough to identify Live paths; not a reason to expand scope.
- `app/api/admin/trivia/questions/export-speed-json/route.ts`: approved Speed DB→GitHub PR export. Check stale files/empty categories later.
- Migrations `20260609103000`, `20260609113000`, `20260609123000`: exact normalized text uniqueness, existing unused duplicate-review fields, Speed-scoped non-deleted uniqueness. Existing migration files are read-only; live application of these was not verified.
- `tests/scripts.import-trivia-questions.test.ts`: three normalization/pool/source metadata cases; no semantic end-to-end evaluation established.
- `supabase/migrations/20260214153000_initial_schema.sql`: `trivia_answers.question_id` has a cascading FK to question UUID; physical deletion destroys answer history. Other migrations reference question slugs for scheduled sessions; preserve both IDs and slugs.

## Evidence and traps

Read-only local inspection counted **8 export files / 2,974 questions / 0 normalized exact duplicate groups**. These are export counts, not Supabase counts. Exported repeated facts exist despite zero exact matches.

Executed the actual current generator's similarity helper in a Node VM (extracted only helper declarations, without running its `main()` or any network call). Each returned `false`:

- “Which continent is the Gobi Desert primarily located in?” versus “The Gobi Desert is located on which continent?”
- “Which continent spans all four hemispheres (Northern, Southern, Eastern, Western)?” versus “What is the only continent with land in all four hemispheres?”
- “Which of these animals is known for having the longest lifespan among all vertebrates?” versus “Which animal is believed to have the longest known lifespan of all vertebrates?”
- “Which pop superstar's record-breaking \"Eras Tour\" began in 2023?” versus “Which pop star is famous for her \"Eras Tour\"?”

Local export searches also found Gobi country variants, Africa/four-hemisphere variants across categories, and longevity variants. Local Taylor Swift counts: 4 explicit question-text mentions, 7 correct-answer matches, overlapping; many additional distractor mentions must **not** count as primary subject repetition.

Important traps:

- Do not “fix” this by only raising model quality, supplying a larger prompt sample, lowering one lexical threshold, or restricting comparisons to category or equal answers.
- Include retired facts in novelty memory. Current code excludes `deleted`, allowing recurrence; guard blanket restore and stale import/upsert paths too.
- Generated fact keys and embeddings are not correctness guarantees; measure retrieval separately from semantic adjudication. Check corpus revision at transactional admission so concurrent paraphrases cannot both pass a stale snapshot.
- Query completeness matters: current unordered `.range()` paging must not become the audit snapshot protocol.
- Existing `duplicate_review_status='clear'` defaults are not successful-check receipts.
- Avoid hard-deletion helpers and mixed-pool reverse-sync scripts; preserve history and Live canonical JSON.
- zsh rejects unmatched wildcard paths (`lib/speedTrivia*`, `lib/triviaCatalog*`). Use `rg --files lib` and filter returned paths instead.
- Initial combined large reads were truncated; targeted follow-up reads were used for relevant source sections. Keep tool output bounded.
- All project hard boundaries remain in force. `.env.local` values must not be read/printed; existing Node `--env-file=.env.local` convention can inject credentials without displaying them. Do not dump environment. New migrations are allowed; applying them to linked production requires explicit confirmation under `CLAUDE.md`. No such confirmation was requested/granted in Phase 0.

## Build, run, and verification

Planning-only phase: no build, application tests, paid generation, or database commands were needed. Verification was source inspection, the read-only local counts/helper experiment above, and documentation diff checks. Exact final check result is recorded below.

Useful existing offline implementation checks:

```sh
npx vitest run tests/scripts.import-trivia-questions.test.ts tests/admin.trivia-deletion.test.ts
npx tsc --noEmit
npm run lint
npm run test
npm run build
git diff --check
```

Actions uses Node 20 and `npm ci`. Do not run build concurrently with typecheck because it regenerates `.next/types`. Phase 1 should add a read-only inventory command with explicit ordered pagination and safe output, and record its exact invocation/results in its own handoff. Do not use old cleanup apply/restore/sync package aliases as shortcuts.

OpenAI Docs skill was used for model recommendations; official model pages and deployment guidance were searched and opened on 2026-10-12. Links are in the plan. Standard token rates verified: Sol $2/M input + $10/M output; Luna $0.10/M input + $0.50/M output. Plan estimates are illustrative, not measured bills, and do not establish chat pricing. No model/provider migration occurred.

## Open questions and first steps

No developer policy answer is needed to begin Phase 1. Current database counts, six-family IDs, live schema/RLS/writer coverage, workflow runs and API billing are still unknown. Budget should be chosen after measuring them. Ask only if a required read-only capability is missing or a genuinely disputed fact/keeper needs a decision; do not re-ask retirement/artist/quantity policy.

1. Recheck git/worktree; read canonical rules and plan.
2. Build the read-only Speed inventory/snapshot tool and complete writer/dependency coverage, including `app/api/admin/route.ts` routes not yet fully traced.
3. Obtain authorized read-only live data and recent Actions evidence without exposing credentials; prove snapshot completeness and private backup integrity.
4. Populate six-family IDs, evaluation pairs, and baseline/cost proposal.
5. Write `docs/speed-trivia-uniqueness-plan_PHASE_1_HANDOFF.md`, update plan status, and stop at the Phase 1 boundary.

Phase 0 final documentation validation: `git diff --check` plus a direct new-file whitespace check passed. Both Markdown files exist and the plan links this handoff. Documentation remains uncommitted.
