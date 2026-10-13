# Deferred Speed Trivia editorial proposal

**Deferred by Andrew on 2026-10-13; never executed. This is historical planning, not an active phase or a prerequisite for cleanup/generator release.** Andrew considers current questions good and wants repetition fixed first. The active sequence goes directly from completed Phase 4 to final Phase 5. Retain these ideas only for a separately requested future improvement; no editorial implementation, paid trial, migration or deployment is authorized by this archive.

The former 4.1–4.4 descriptions below preserve the proposal, not current instructions. Current plan: [Speed Trivia uniqueness](speed-trivia-uniqueness-plan.md).

## 8.1. Phase 4.1 — editorial contract and evaluation set

**Model: GPT-6.1 Sol / high.** Define the editorial acceptance contract before implementation; no paid evaluation or candidate admission in this phase.

1. Give each candidate separate verdicts for factual soundness/unambiguous answer; clear natural wording; distinct plausible distractors without answer-length/grammar/category clues; and worthwhile knowledge. Reject unsupported time-sensitive facts, arbitrary numeric/date obscurity and disposable celebrity detail. Fame alone does not make a fact worthwhile or worthless. Allow accessible surprising facts, durable cultural/scientific/historical knowledge and fair difficult questions. Different facts about one artist remain valid.
2. Require explicit pass/fail/uncertain reasons for each dimension, bound to final content hash and versioned rubric/judge. Any failed or uncertain dimension prevents admission to normal review. Numeric aggregate scores cannot hide a failed dimension. Automated judgments remain fallible; do not promise guaranteed interest or truth.
3. Freeze a labeled evaluation set with sound/weak/ambiguous/misleading/awkward questions across all nine categories, answer-position clues, implausible/duplicate distractors, culturally narrow coverage, durable versus disposable facts, worthwhile hard versus arbitrary obscure questions and same-person distinct facts. Separate calibration/held-out cases; record disputed labels as a small list rather than a large new manual queue. Sanitized examples only.
4. Define topic/difficulty spread from measured existing inventory and recent admissions. Keep category/subtopic policy independent of fact uniqueness, avoid subject concentration, and make easy/medium/hard intelligible to players. Specify achievable small-batch targets and report deviations; never fill a quota with weak or repeated questions. Zero output is acceptable.
5. Estimate quality-call/rewrite/cache executions, tokens/bytes and current/10×/retry-sensitive costs. Preserve the approved $0.50 total per operation. No new provider/model/paid grounding or extra pilot allowance is authorized merely by this phase; compare a prompt-only/reject-only lower-cost option.

**Exit:** versioned editorial rubric, measurable frozen evaluation gates, topic/difficulty policy, cost design and `speed-trivia-uniqueness-plan_PHASE_4.1_HANDOFF.md`. No subjective “interestingness guarantee.”

## 8.2. Phase 4.2 — build and evaluate the editorial gate

**Model: GPT-6.1 Sol / high.** Implement locally; nightly remains disabled.

1. Use one shared Speed-only editorial module for generation and applicable manual create/edit/import/approval boundaries. Check the final candidate content, not its pre-rewrite wording. Decide and document legacy-row handling: do not mass-certify or mass-edit the existing bank; failed edited/generated questions stay out of ordinary review. Keep Live content/import paths unchanged.
2. Add explicit editorial rules to generation prompts. Run cheap deterministic checks before a bounded structured editorial judgment. Keep factual uncertainty separate from style preference. Bind cached editorial evidence to final question/options/correct answer/context and rubric/provider version; content or policy changes invalidate it.
3. Reject weak facts. A limited rewrite may repair wording/distractors while preserving the fact, but cannot automatically make an unsupported fact true. Default to reject if rewrite budget is unavailable. Globally cap rewrite attempts/candidates/time/tokens/requests; every generation, editorial, rewrite and uniqueness call shares the same $0.50 operation budget with worst-case reservations before calls and conservative lost-call accounting.
4. Every rewritten candidate must pass the whole editorial contract and existing frozen uniqueness gate again before DB admission. Never add rejected/uncertain candidates to normal review or bypass signed admission. Report quality failures, rewrites/rewrite successes, final difficulty/subtopic/subject and quality-cache/call usage privately. Keep final accepted batch diversity checks after rewriting.
5. Make editorial failure/unavailable services fail closed at writing boundaries. Prefer a separate versioned signed editorial receipt if DB enforcement is needed; any new schema requires a new migration, not editing applied `20261013120000`. Prepare its exact rollout before any project-required confirmation. The current approval explicitly names only the existing migration; future migration confirmation is separate.
6. Run meaningful rejection/rewrite/budget/cache/version/race and manual/generated/Live-separation tests plus frozen editorial and unchanged uniqueness held-out gates. No paid pilot here. Record exactly what evidence is synthetic, replayed or actually observed.

**Exit:** locally validated editorial gate, measured offline costs/call bounds, concrete release instructions and `speed-trivia-uniqueness-plan_PHASE_4.2_HANDOFF.md`. No automatic publication or extra paid run implied by adding this phase.

## 8.3. Phase 4.3 — single capped editorial pilot and generator release

**Model: GPT-6.1 Sol / high.** Use the **one already-approved $0.50 pilot**, including generation, editorial review, rewrites and uniqueness checking together. Do not spend a second pilot allowance by splitting the operation.

1. Stage/release the validated editorial implementation with generation still paused, verify exact app/workflow revisions and all prerequisites. Any additional migration still needs its concrete confirmation. Run one deliberately small candidate batch under the shared $0.50 global budget and existing time/token/retry limits. Stop safely when the earliest ceiling is hit; zero output is valid.
2. Privately retain every generated candidate and each stage's verdict/reason, final accepted content, rejection/uncertainty/rewrites, generated/quality-passing/unique/admitted counts, actual billed tokens/spend versus conservative reservations, latency/calls/cache use and exact policy/model/revision/commit/run/deployment IDs. Reports must not expose player records or credentials.
3. Independently review the small sample against the frozen rubric, reporting automated versus independently assessed quality. Measure topic/subtopic/subject spread, intended and independently judged difficulty, answer-position distribution, misleading clues, useful-question yield and **cost per independently useful question**. Distinguish editorial pass, uniqueness pass, pending admission and Andrew approval. If no useful questions pass, report cost/yield and an undefined cost-per-useful denominator; do not invent a successful quality result.
4. Require every admitted pilot question to satisfy editorial and uniqueness gates, no known weak/clued/ambiguous candidate admitted, held-out editorial regressions blocked and achievable small-batch mix met or shortfall explained. Do not approve or activate pilot rows merely to make the metrics look good. Preserve isolated success evidence if the live pilot has zero admissions. Failed pilot leaves generation paused; a second paid pilot needs a new explicit allowance.
5. Report measured benefit/cost versus Phase 4 baseline and the cheaper reject-only/fewer-question option. Resume the recorded nightly enabled state only after release gates pass. No automatic budget increase, provider swap or target-volume increase.

**Exit:** actual capped pilot evidence, editorial gate verified before normal-review admission, measured useful yield/diversity/cost, exact deployment and generator resume facts, and `speed-trivia-uniqueness-plan_PHASE_4.3_HANDOFF.md`.

## 8.4. Phase 4.4 — operational quality and cost monitoring

**Model: GPT-6.1 Sol / medium.** This replaces the former Phase 6 so Phase 5 remains final. Observe seven consecutive scheduled runs under the same $0.50/run cap; no additional manual pilot is authorized.

Measure generated/editorially passed/rejected/uncertain/rewritten/unique/admitted counts, independent bounded quality samples, topic/subtopic/subject/difficulty mix, player-facing wording/clue problems, review backlog, latency/retries/DB transfer/calls/cache use, tokens/spend and cost per useful/admitted/approved question where each denominator exists. Audit new admissions incrementally rather than rechecking the entire bank nightly. Record any Andrew-reported weak or repeated question as a regression. Tune diversity/prompts only within frozen correctness/editorial gates; substantive policy changes invalidate affected cache/evaluation evidence and require revalidation. A materially higher recurring-cost option requires informed approval.

**Exit:** seven-run evidence, actual versus baseline quality/performance/cost, cap adherence, final editorial release record/context pointers and `speed-trivia-uniqueness-plan_PHASE_4.4_HANDOFF.md`. Next and final phase is Phase 5 cleanup.

