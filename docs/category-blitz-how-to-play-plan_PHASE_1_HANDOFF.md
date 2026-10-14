# Category Blitz How-to-Play Plan — Phase 1 Handoff (Scoring & round cadence)

**Date:** 2026-10-14 · **Plan:** `docs/category-blitz-how-to-play-plan.md` · **Phase 1 status:** built and
tested locally. **Not committed, not pushed, not deployed.**

## For Andrew (plain English)

- **Majority Rules now comes up on exactly every 5th round** (rounds 5, 10, 15…), never two in a row.
  Before this it was a coin flip each round, which is how you got two in a row.
- **Majority Rules rounds now use the Majority Rules ("Blend In") category list.** Before, the
  always-on game used the normal list for them by mistake.
- **New: +1 alliteration bonus in both modes.** It applies when the answer is 2+ words, every word starts
  with the round's letter (e.g. "Prickly Pear" for P), and the answer already scored. It counts toward
  the leaderboard, the session total and Rewards progress just like other points.
- After grading, players see a small **"+1 alliteration"** tag on answers that earned it.
- The admin "Mode Selection" dropdown (Random 50/50 etc.) is gone because it no longer did anything.
  A note in its place says every 5th round is Majority Rules.
- **Nothing is live yet.** The code is on a new local branch, `category-blitz-scoring-cadence`, and is
  **not committed**. Committing, pushing and deploying are your call. Nothing in the database was
  changed, and there is no migration.
- **Needs you:** one thing outside this work. Your local `npm run build` currently fails, because of a
  Speed Trivia test file in the git-ignored `tmp/` folder (details in §6). Vercel never sees that
  folder, so deploys are unaffected.

## For the next agent

### 1. Next phase goal and scope

Next is **Phase 2 — Tutorial cards** (plan §5 Phase 2, §3 for exact copy). Model: **Claude Opus 5.5,
effort medium.** It covers the 7-card Category Blitz tutorial (intro + 6), a single copy source
(`CATEGORY_BLITZ_HOW_TO_PLAY`), and new art for cards 3–6.

Out of scope for Phase 2: the rules popup, footer removal, lobby flash and FAQ copy (Phase 3); the
letter band (Phase 4); sleep-when-idle (Phase 5); deleting old rounds (Phase 6). Don't change the
Bingo, Pick 'Em, NFL Pick 'Em or Fantasy cards.

### 2. Starting state

- Branch: **`category-blitz-scoring-cadence`**, created from `main` at `1932091`. **Nothing committed.**
  Andrew's unrelated uncommitted Speed Trivia changes came along in the working tree (they're the
  same files `git status` showed before). **Stage only Category Blitz files, by path. Never
  `git add -A`. Never `git checkout -- <file>`.**
- Phase 1 files, all uncommitted (15):
  - modified: `lib/categoryBlitz.ts`, `lib/categoryBlitzModes.ts`, `lib/categoryBlitzPool.ts`,
    `components/category-blitz/{CategoryBlitzGame,GradingCascade,DevAnimationPanel,CategoryBlitzContinuousSettings}.tsx`,
    `scripts/simulate-category-blitz.cjs`,
    `tests/lib.category-blitz-{continuous-engine,modes,pool,score-round}.test.ts`
  - new: `lib/categoryBlitzAlliteration.ts`, `components/category-blitz/AlliterationBonusChip.tsx`,
    `tests/lib.category-blitz-alliteration.test.ts`
  - None of these files had uncommitted changes from anyone else before this phase. Their whole diff is Phase 1.
- Data: nothing written. The only production access was one read-only query, which found that
  `category_blitz_continuous_config` holds a single row: `hc-cbz-live`, active, `mode_selection
  'random'`, empty `category_pool`, 180 s round, 180 s intermission. **No venue has a custom category
  pool today.**

### 3. Decisions made (don't re-ask)

- Andrew's decisions are in plan §2. Interpretations made during this phase:
  - **Cadence applies to both engines.** `isReverseRound` is shared, so the legacy scheduled engine
    (`startRound`) also moved from every 4th to every 5th round. The plan calls it "the ONE home of
    cadence", so this is intended.
  - **Fallback stays Majority Rules.** If a custom pool leaves no Blend-In letter with 12
    categories, `assembleContinuousBoard` uses the standard index but the round **stays** Majority
    Rules. The cadence never changes.
  - **Letter choice with a pool.** A letter is picked only from letters whose (pool-filtered)
    index can fill a whole board. This applies to standard rounds too, which is slightly more robust
    than before (previously: random letter, then fail if short).
  - **How alliteration is read** (`isAlliterativeAnswer`):
    - A leading "the/a/an" is dropped first, the same way `answerStartsWithLetter` does it, so "The
      Pink Panther" counts for P.
    - Words split on whitespace and hyphens (including en/em dashes).
    - Punctuation is stripped from each word. A token that is only punctuation ("&") is ignored.
    - A mid-answer "of" fails the check: "Pirates of Penzance" gets no bonus. This is Andrew's
      "every word" rule taken literally.
  - **The bonus is +1 per answer.** A Majority Rules solo answer (1 pt, "too_obscure") that
    alliterates gets 2.
- **The count query fails closed.** If the round-count read in `startContinuousRound` errors, the
  round start throws. The next poll or cron retries it. It does not silently fall back to "standard".

### 4. What changed and how it fits

- `lib/categoryBlitzModes.ts`:
  - `MAJORITY_RULES_EVERY_N_ROUNDS = 5`
  - `isReverseRound(i) = i % 5 === 4`, still the one home of the cadence.
- `lib/categoryBlitzPool.ts`:
  - **Deleted:** `pickRandomLetter`, `pickRandomMode`, `assembleRandomBoard`. Nothing else used them.
  - **Added:** `assembleContinuousBoard(mode, categoryPool)` → `{ letter, categories } | null`, built on
    two private helpers, `letterPoolFor` and `randomBoardFrom`. Reverse rounds try
    `bUsableLetters`/`bLetters` first.
  - `modeSelection` stays on `ResolvedContinuousConfig`, in the DB and in the API. It's simply ignored.
- `lib/categoryBlitz.ts`:
  - `startContinuousRound` sets the mode from
    `isReverseRound(count of rounds in session)`. The count is one
    `select("id", { count: "exact", head: true }).eq("session_id", …)`. The board comes from
    `assembleContinuousBoard`. `config.modeSelection` is still in the signature but ignored, as the
    doc comment says.
  - `scoreRound` adds `alliterationBonus(answer, letter, basePts)` in both branches (reverse ~L1512,
    standard ~L1565). Because it is part of `points_awarded`, it flows into
    `awardCategoryBlitzPoints` (users.points + Rewards) and `mergeCumulativeSessionTotals` with no
    other change. Below the player minimum, base = 0, so there is no bonus.
- `lib/categoryBlitzAlliteration.ts` (pure, client-safe):
  - `ALLITERATION_BONUS_POINTS = 1`
  - `isAlliterativeAnswer(answer, letter)`
  - `alliterationBonus(answer, letter, points)`. The server passes base points; the client passes the
    stored `pointsAwarded`. The answer is the same either way, so there's no new column or API field.
- UI:
  - `AlliterationBonusChip` (amber "+1 alliteration") is shown in `GradingCascade` rows and in the
    results card in `CategoryBlitzGame` (`ResultsScreen`).
  - `GradingAnswer` gained an optional `alliterationBonus`, set in `CategoryBlitzGame`'s
    `gradingAnswers` memo.
  - **Trap fixed:** the reverse glow tiers (`reverseGlow` / `reverseMatchGlow`) treat points as the
    matching-player count. They now receive `points - bonus`, so an alliterative 2-player match
    doesn't light up as a 3-player match.
  - The `DevAnimationPanel` mock has a "Mint Mousse" row for previewing the chip.
- `CategoryBlitzContinuousSettings.tsx`:
  - The Mode Selection `<select>` and `MODE_OPTIONS` are removed, replaced by a one-line note.
  - The stored `modeSelection` is still loaded and sent back on save, so it is never overwritten.
- `scripts/simulate-category-blitz.cjs`:
  - Default `--rounds` is now 5, so it reaches the reverse round at index 4.
  - The standard-round consistency check accepts 3 for an alliterative correct answer.
  - It imports `lib/categoryBlitzAlliteration.ts`.

### 5. Facts and traps

- The reverse explanation line still says "N players said this — +N" (`submissionExplanation`). With
  the bonus, the badge shows N+1 and the chip explains the extra 1. Left as is; reword it only if Andrew asks.
- `lib/categoryBlitz.ts` needs `grep -a` (it's read as binary).
- Blend-In usable letters are `BCDFLMPST`; standard usable letters are `ABCDEFGHILMNOPRSTW`;
  `setSize` is 12.
- The engine test fake (`tests/lib.category-blitz-continuous-engine.test.ts`) now supports
  `select(cols, { count, head })` → `{ count }`. Phase 5 can reuse it.

### 6. Build, run, test — what was verified

- `npx tsc --noEmit` reports **0 errors outside `tmp/`**. The only errors are in
  `tmp/speed-trivia-uniqueness-private/progressive-review-2026-10-14/phase-3/speed-trivia-phase3-browser-probe.ts`.
  That file is git-ignored (`.gitignore:22 tmp/`), comes from someone else's Speed Trivia work, and was
  not touched here.
- `npx eslint` on every changed file: clean.
- `npx vitest run` (full suite): **370 files passed, 1 skipped; 4,396 tests passed, 13 skipped, 0 failed.**
- `npm run build`: **"✓ Compiled successfully"**, then the TypeScript step failed on that same `tmp/`
  file. Next's type check covers every `.ts` file in the folder because `tsconfig` doesn't exclude
  `tmp/`. Vercel builds from git, so it never sees the file. To get a green local build, move or fix
  that file, or add `tmp` to `tsconfig.json` `exclude`. That's Andrew's call; it's his Speed Trivia work.
- **Not run:** `scripts/simulate-category-blitz.cjs` (it writes real rounds to the shared production
  DB; only `node --check` syntax was verified). No browser check of the chip (Phase 7 does the `verify`
  pass). No `/verify` before commit, because nothing was committed.
- New and updated tests:
  - `tests/lib.category-blitz-alliteration.test.ts`: Prickly Pear ✓, Pear ✗, Prickly apple ✗,
    Peanut-Pie ✓, wrong letter ✗, case/punctuation, leading article, bonus never on 0 points.
  - Score-round: standard 3/2/duplicate-0, below-minimum 0, LLM-invalid 0, Majority Rules 3/3/2/1/0
    plus totals.
  - Engine: rounds 1–4 standard; rounds 5, 10, 15 reverse; `weighted_reverse` ignored; reverse
    letter and categories come from the B index.
  - Pool: `assembleContinuousBoard` in both modes, custom pool, fallback, null.
  - Modes: every-5th, never back to back.

### 7. Open questions for Andrew

- Commit and push this branch now, or bundle it with later phases? (Not done — waiting on him.)
- The `tmp/` Speed Trivia probe file breaks local `npm run build` (§6).
- Optional, from plan §7: a daily prune of empty rounds. Still not planned; ask before adding it.

### 8. Recommended first steps for Phase 2

1. `git status` and confirm you're on `category-blitz-scoring-cadence` with the files in §2. Ask
   Andrew whether Phase 1 should be committed first.
2. Read plan §3 and **open `docs/category-blitz-how-to-play/card-4-example.jpg`** before drawing Cards 4 and 5.
3. Read `lib/venueGameCards.ts` (`category-blitz` entry; `steps` is a 3/4-tuple and must widen) and
   `components/venue/GameIdentityPanel.tsx` (`CategoryBlitzIllustration` ~L935, `GameOnboardingCard`
   ~L1183).
4. Card 5's "+1 alliteration bonus" burst and rules-list item 5 should reference
   `ALLITERATION_BONUS_POINTS` from `lib/categoryBlitzAlliteration.ts`. Rule 6 can use
   `MAJORITY_RULES_EVERY_N_ROUNDS` from `lib/categoryBlitzModes.ts`, so the copy can't drift from the rules.
5. Model: Claude Opus 5.5, effort medium.
