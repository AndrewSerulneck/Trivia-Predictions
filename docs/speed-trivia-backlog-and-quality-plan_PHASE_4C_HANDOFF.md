# Speed Trivia backlog plan — Phase 4c handoff (the Live Trivia path)

Written 2026-11-16 by Claude (Opus 5.5, high effort, as the plan's table names; no substitution).
Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c". Previous: `..._PHASE_4B_HANDOFF.md`.
4a.1's thinning is **still waiting for your spot check** (unchanged by 4c).

## For Andrew

- **Built and tested, not live yet.** The daily writer can now write Live Trivia too. Each night the site checks
  ChatGPT's Live questions: the format rules, the variety map, the 5-per-subject cap, a Live bar test and a repeat check
  against every Live question. Up to 10 a day then wait in **Admin → Trivia Questions → Live → Quick Review**. There
  you Keep (→), Reject (←), fix the answer or the accepted spellings (E), Skip (S) or Undo (Z).
- **Publish (N)** adds your kept questions to the end of the Live Trivia files in one GitHub pull request and merges
  it. The existing questions are never changed or reordered; the code checks that byte for byte before anything is
  sent. The merge runs the existing **Sync Live Trivia** job, which loads them into the game.
- **Current Events** works the same way for Live. It gets its own file on the first Publish and shows up as a round
  only once it has 45 questions. Each one expires 12 months after its event. Sync Live Trivia now also runs on the
  1st of each month, so expired questions drop out without anyone editing the files.
- **Problem found and fixed (D24, your OK 2026-11-16): Sync Live Trivia has failed on every run since July 20.**
  `sports-new-questions.v1.json` repeated questions already in `sports.v1.json`, and IDs clashed. Because of that,
  **253 Live questions added since July (72 TV, 64 Music, 61 Art & Literature, 54 Sports, 2 others) are not in the
  game yet.** The files are fixed (uncommitted); the first Sync Live Trivia run after the merge loads the 253.
- **Database change applied** by you, 2026-11-16 (migration `20261116201904`, D25).
- **Free run done:** every Live question now has its area, era and subject (3,707 questions, through your ChatGPT plan).
- **Trial:** one free ChatGPT run on today's real Live brief wrote 11 questions; 10 passed every free check. For
  example: "Who played Holly Golightly in the 1961 film Breakfast at Tiffany's?" (Audrey Hepburn) and "Which element has
  the chemical symbol K?" (Potassium). The 11th exposed a word-count bug, now fixed. Nothing was saved.
- **Changed from the plan:** Live answers are limited to 2 words or a number (the plan said 4), because the game only
  ever asks questions with answers that short. 481 of today's Live questions have longer answers and are never asked.
- **Cost so far: about $0.01** (one Gemini call to check the Live bar test on 50 existing questions; 38 of 50 scored 3
  or more). ChatGPT: the tagging run and one trial call, on your plan.
- **Next:** your code review of 4a–4c (D23), then commit, merge, deploy and 4d.

## For the next agent

### 1. Next phase and scope

Per D23 the next step is **Andrew's code review of 4a–4c**. After it: commit, merge, deploy (migration
`20261116201904` is already applied, D25), `gh workflow enable trivia-nightly.yml`, then **Phase 4d** (trial run of both games,
Andrew rates, tune thresholds, daily schedule on). Model for 4d: **Opus 5.5 / medium**.

D24 (the Sync Live Trivia duplicate slugs) is fixed in the files; after the merge, confirm the Sync Live Trivia run
is green and imported 253 questions before 4d's Live half publishes anything. Also still open from 4a.1: the spot check, the thinning, re-enabling the Keep Queue.

Out of scope for 4c (not done): the trial run and the daily schedule (4d), `core.cjs` (frozen), anything in 3a–3d,
thinning Live (plan §7: Live JSON entries are never changed by this plan). D24 was fixed after 4c with Andrew's OK.

### 2. Starting state

- Branch `feature/speed-trivia-variety`. Last commit `1aa32e4e` (PR #19 merge). **Everything from 4a, 4a.1, 4b and 4c
  is uncommitted.** Never use `git checkout -- <file>`, `git stash` or `git reset` on it.
- **4c files (new unless marked M):**
  - `supabase/migrations/20261116201904_live_question_candidates.sql`: **applied by Andrew 2026-11-16** (D25).
  - `lib/live-trivia-quality/categories.cjs` + `.d.cts`, `audience.cjs`, `repeats.cjs`, `publish.cjs` + `.d.cts`
  - `lib/question-writer/liveProcess.cjs`; M `rules.cjs` + `rules.d.cts`, M `brief.cjs` + `brief.d.cts`, M `candidates.cjs` +
    `candidates.d.cts`, M `geminiWriter.cjs` (these four were new in 4b, so they're untracked; "M" = changed in 4c)
  - `lib/liveTriviaReview.ts`, `lib/liveTriviaGithub.ts`, `lib/liveTriviaCategoryGate.ts`, `types/liveTriviaReview.ts`
  - `app/api/admin/trivia/live-review/route.ts`, `components/admin/sections/LiveTriviaQuickReview.tsx`
  - M `components/admin/sections/TriviaPendingReviewSection.tsx` (Quick Review button on the Live tab too)
  - M `lib/liveShowdownEngine.ts`, M `lib/liveShowdownAdmin.ts` (Current Events gate)
  - M `scripts/import-trivia-questions.cjs` (`expires_on`), M `scripts/process-question-candidates.cjs` (`--game live`; new in 4b)
  - M `.github/workflows/trivia-nightly.yml` (Live step + report artifact), M `.github/workflows/sync-live-trivia.yml`
    (monthly schedule), M `eslint.config.mjs` (`lib/live-trivia-quality/**/*.d.cts`), M `SYSTEM_CONTEXT.md` §12
  - Tests: `tests/live-question-candidates-sql.test.ts` (7), `tests/lib.live-trivia-quality.test.ts` (22),
    `tests/scripts.live-question-candidates.test.ts` (8), `tests/live-trivia-current-events-gate.test.ts` (4),
    `tests/api.admin.live-review.test.ts` (7), `tests/components.live-trivia-quick-review.test.ts` (5); M
    `tests/lib.question-writer.test.ts` and `tests/api.question-writer.test.ts` (Live is now a writer game; `bingo`
    stays refused).
  - M the plan doc, and this note.
  - **D24 fix (2026-11-16, Andrew's OK):** deleted `data/live-trivia/categories/sports-new-questions.v1.json` (staged
    with `git rm`); M `sports.v1.json` (removed the second `nba-longest-winning-streak` entry, the copy from the
    deleted file); M `art-literature.json` (one line: slug `sun-tzu-art-of-war` → `sun-tzu-art-of-war-text`). M
    `scripts/tag-questions.cjs` (Live refs now use the importer's slug rule, lowercased; it used the raw `slug`).
- **Production data written by 4c:** `question_tags` rows for game `live` from the one-time tagging run
  (`tagged_by = 'codex:gpt-6.1-sol:tagging-v1'`, `question_ref` = the slug). Undo: delete `question_tags` rows where
  `game = 'live' and tagged_by = 'codex:gpt-6.1-sol:tagging-v1'` (nothing references them). No other table changed.
  D24 tag fixes: `tv-kennedy-nixon-debate-JFK` → `-jfk` (the importer lowercases); the Art Sun Tzu tag moved to
  `sun-tzu-art-of-war-text`; deleted the orphan `nadia-comaneci-country`; tagged History's `sun-tzu-art-of-war` (1
  ChatGPT call). Originals saved in the session scratchpad only. Now 3,707 tags = 3,707 slugs, no orphans.
- **Applied (Andrew, 2026-11-16):** migration `20261116201904`; verified the new columns and
  `live_candidates_publish_claim` respond.
- **Workflows:** Trivia Nightly `disabled_manually`; Speed Trivia Keep Queue `disabled_manually` (4a.1); Sync Live
  Trivia active; failing since 2026-07-20 until the D24 fix is merged.
- **Private writer repo:** unchanged. `write.mjs` already reads `WRITER_GAMES` (default `speed`); 4d sets the repo
  variable `WRITER_GAMES=speed,live`. No code change is needed there.

### 3. Decisions (don't re-ask)

- D10 (append-only Publish via a self-merging PR), D11 (Current Events ≥ 45 for Live), D16 (12-month expiry), D23
  (review after 4c) — all as the plan says.
- **Answer limit = 2 words or a number** (the plan said 4). `isLiveTriviaSeedAnswerAllowed` in
  `lib/liveShowdownEngine.ts` only seeds answers of ≤ 2 words or a pure number, so a 3–4 word answer would publish but
  never be asked. 481 of the 3,763 existing JSON entries are in that state today (not touched).
- **People's answers must list the surname** in `acceptableAnswers`: the schema carries `answerIsPerson`, and the hard
  limit `surname-missing` checks it (Jr./Sr./II–IV ignored).
- **The Live bar test is its own module** (`lib/live-trivia-quality/audience.cjs`, `bar-test-live-v1`), not a variant
  inside the Speed scorer: the Speed rule says a change to `audience.cjs` bumps its version, which would invalidate
  7,000+ stored Speed scores. It reuses the Speed checks (`hasPreamble`, `isListAnswer`) and the audience text. No
  guessing floor: only an estimate under 10% costs a point. Flag `hard-to-spell` replaces `bad-distractors`.
- **Calibration (2026-11-16, one Gemini call, $0.0068):** 50 evenly spaced existing Live questions as "keep" labels:
  scores 5:5, 4:22, 3:11, 2:9, 1:3 → 76% ≥ 3. The 12 below 3 are mostly fair (two map questions the scorer can't see,
  long wording, niche subjects). Threshold stays 3 (`vars.QUESTION_WRITER_LIVE_THRESHOLD`); 4d tunes it.
- **Live candidate lifecycle** (migration): `received → rejected | skipped | pending_review` (waiting, `question_ref` =
  proposed slug) `→ keep | reject` (Andrew; Undo returns to `pending_review`) `→ publishing → published` (`question_ref`
  = final slug, `pr_url`). "reject" (Andrew) and "rejected" (gates) are deliberately different statuses.
- **Merge:** main has no branch protection or required checks, and `allow_auto_merge` is off, so GitHub auto-merge can't
  apply. Publish merges the PR itself (squash, pinned to its commit sha), deletes the branch, and only if GitHub refuses
  requests auto-merge and reports "PR opened… Merge it on GitHub." A PAT merge triggers the push workflow.
- **The star cap counts Live candidates in review** (`pending_review`, `keep`, `publishing`), read once per night (≤ 1,000
  rows), since they aren't in `question_tags` until published. Publish writes their tags (`tagged_by = 'writer:live-publish'`).
- **Repeat corpus** = the checkout's `data/live-trivia/categories` (the nightly checks out main) + candidates in review.
  Free: the same slug or normalized question = confirmed repeat. Otherwise ≤ 12 likely matches (same answer in the
  category, then the 8 most shared words, ≥ 2 shared) → one Gemini call; nothing close = distinct with no call.
- **Live cap:** `QUESTION_WRITER_LIVE_MAX_DOLLARS`, default $0.25 per night (bar test + repeat checks), as the plan's
  cost table.
- **The Live brief's examples** come from recently imported active Live rows in `trivia_questions` (read-only; the
  importer stores the answer as `options[0]`), not from the JSON, because the deployed function can't rely on reading
  `data/` at runtime.

### 4. How the pieces fit

```
private repo (WRITER_GAMES=speed,live, from 4d)
  GET /api/question-writer/brief?game=live  ->  brief.buildBrief: question_variety_stats('live') + 120 recent Live rows
                                               -> chooseSlots over LIVE_CATEGORIES -> rules.buildLivePrompt + LIVE_OUTPUT_SCHEMA
  POST /api/question-writer/candidates      ->  candidates.parsePost (validateLivePayload) -> question_writer_receive
trivia-nightly.yml (after the Speed step, if: always())
  process-question-candidates.cjs --game live -> liveProcess.processLiveDay
     no batch -> Gemini fallback (GEMINI_LIVE_SCHEMA, regular slots only, ≤ $0.10)
     free gates (schema, slot, liveHardLimits, currentEventsLimits, validateTag) -> star cap (bank + in review)
     -> live audience (one call) -> repeats.createRepeatChecker (≤ 1 call each) -> pending_review + audience, tag,
        possible_repeat (all on question_candidates)
Admin → Trivia Questions → Live tab → Quick Review  (LiveTriviaQuickReview -> /api/admin/trivia/live-review)
  GET (≤ 200 waiting + kept count) · keep / reject / undo / edit (status-guarded single-row updates)
  publish -> live_candidates_publish_claim (advisory lock, ≤ 100, stale after 10 min)
          -> liveTriviaGithub.readLiveFiles (every Live file on main, by blob) -> publish.planPublish (fresh slugs vs all
             files; already-there = settled; appendEntries byte check) -> openPublishPr -> mergePublishPr
          -> settle published (+ pr_url) / refused -> reject ('publish:<reason>') -> question_tags upsert
  merge -> Sync Live Trivia (check, import; expired entries skipped and pruned)
Live rounds: liveShowdownEngine.buildLiveTriviaOccurrenceSeedSlots drops a category under liveCategoryMinimum (CE 45);
  liveShowdownAdmin.getLiveShowdownRoundCategories hides it too (and never lists it from the files alone).
```

### 5. Facts and traps

- **D24 (fixed 2026-11-16, uncommitted): Sync Live Trivia broke on 2026-07-20.** `npm run live-trivia:check` stops at
  the FIRST duplicate slug only, so count duplicates with a script. There were 56: 54 slugs of
  `sports-new-questions.v1.json` repeated in `sports.v1.json`, `nba-longest-winning-streak` twice inside `sports.v1.json`,
  and `sun-tzu-art-of-war` in art-literature and history. To pick which copy to keep, check `trivia_questions.slug`:
  the database copy keeps the slug, so its row, play history and tag stay attached. After the fix: JSON 3,707
  questions; database 3,454 active Live rows; **253 JSON slugs not in the database** (72 TV, 64 Music, 61 Art, 54
  Sports, 1 Geography, 1 History); 0 database rows missing from the JSON, so the first sync imports 253 and retires
  nothing. (An earlier count of 306 counted both copies of each duplicate.)
- **The importer lowercases slugs** (`tv-kennedy-nixon-debate-JFK` is stored as `-jfk`). Anything keyed by a Live slug
  must use `lib/live-trivia-quality/categories.cjs` `slugify`, never the raw `slug` field.
- `lib/liveShowdownAdmin.ts` has an old `removeLiveTriviaQuestionFromJson` that rewrites a JSON file with
  `JSON.stringify` (pre-existing, not 4c; it only runs on a local server). It is not part of Publish.
- The importer keeps `expires_on` out of the database row (a non-enumerable `__expiresOn`); `trivia_questions` has no
  expiry column. The prune's 10% safety stop still applies, so a month where > 10% of Live questions expire at once
  would stop the import (not plausible at 3 Current Events a day).
- `question_candidates` column `publish_claim` + `claimed_at` must be set together (`question_candidates_publish_check`).
- Supabase-js filter `payload->>category` is used by the Live review list (category filter).
- Typecheck (`npx tsc --noEmit`) shows errors only in `.next/dev/types` and `.next/types` for removed TV pair pages:
  stale generated files from the dev server, not source. Every source file is clean.
- Client components here don't import `.cjs` modules, so the Live category list reaches the screen through the GET
  response (`categories`).
- The engine only plays answers of ≤ 2 words (see §3). Worth telling Andrew separately: 481 existing Live questions are
  never asked for that reason.

### 6. Build, run, test

- `npm run test`: **566 files passed, 1 skipped (7,366 tests)** before the word-count fix; the three affected files re-run
  after it (37 passed). ESLint on every 4c file: clean. Typecheck: see §5.
- PGlite proves the migration keeps every 4b Speed rule (the 4b SQL tests still pass) and the Live lifecycle and claim.
- Nightly Live command: `node --env-file=.env.local scripts/process-question-candidates.cjs --game live [--threshold 3]
  [--no-fallback] [--report <dir>]`. **Paid** (≤ `QUESTION_WRITER_LIVE_MAX_DOLLARS`); run by hand only with Andrew's OK,
  and only after the migration is applied.
- **Free trial (2026-11-16, nothing written):** today's real Live brief (production read) → one `codex exec`
  (`gpt-6-astra`, high, regular slots, 51 s, ~19k plan tokens) → the free gates, star-cap read and free repeat checks.
  11 written across 8 categories and 11 areas; 10 passed the gates; 0 star-cap; every one had likely matches, so each
  would take one Gemini repeat call (~$0.0005). Examples: "Which Tolstoy novel opens with the words 'All happy families
  are alike'?" (Anna Karenina), "Who played Holly Golightly in the 1961 film Breakfast at Tiffany's?" (Audrey Hepburn;
  also Hepburn), "How many seconds were on the NBA's shot clock when it debuted in 1954?" (24). The 11th ("Schitt's
  Creek") was a false `answer-too-long`: words were counted after splitting the apostrophe. **Fixed** to count on spaces
  like the round builder, with a test. The Current Events prompt wasn't tried (its rules are shared with Speed, tried
  in 4b; it needs web search, ~51k tokens).
- **Live tagging (2026-11-16, ChatGPT `gpt-6.1-sol`, medium, batches of 80, 49 calls, ~1 h):** 3,707 of 3,707 unique
  Live slugs tagged, 0 skipped, 53 with no area. Live subjects at the cap or inside the gap: 64. Heaviest: It's Always
  Sunny in Philadelphia 25, The Simpsons 17, Arrested Development 15, Friends 12, Game of Thrones 12, Seinfeld 10. Live
  isn't thinned (plan §7); the cap keeps the writer off these. Re-run is resumable: `node --env-file=.env.local
  scripts/tag-questions.cjs --game live --apply --batch 80` (only untagged slugs are sent).
- **Not verified:** the Publish GitHub calls against the real repo (mocked in tests; the existing `GITHUB_TOKEN` must have
  contents + pull-requests write, which the Speed export already uses, and merge rights); the live endpoints and screen
  (not deployed); the paid gates on real candidates; the Gemini fallback's Live schema against the real API.

### 7. Open questions for Andrew

- D24 and D25: answered and done (see §2).
- Optional CLAUDE.md line (his call), Feature rules table: "Live Trivia Publish | `docs/speed-trivia-backlog-and-quality-plan.md`
  | Append-only: Publish adds kept writer questions at the end of a file through a PR; existing entries never change."
- Still open from earlier phases: 4a.1 spot check; 4b's two setup steps (`SECRETS_WRITE_TOKEN`, the writer's ChatGPT login).

### 8. Recommended first steps

1. Read plan §4 Phase 4c ("As built"), §6 D24–D25, §7's Phase 4c rules, and this note. `git status`, `gh workflow list --all`.
2. Support Andrew's code review of 4a–4c. Then, with his OK: commit, merge, deploy, `gh workflow enable trivia-nightly.yml`
   (no migration left to apply for 4c).
3. After the merge, check the Sync Live Trivia run is green and the database has 3,707 active Live rows. For 4d: set
   the private repo variable `WRITER_GAMES=speed,live`, then run one trial per game.
