# Category Blitz 200 categories — Phase 2 handoff (2026-10-18)

## For Andrew (plain English)

- **What changed:** the category library now has exactly 200 new categories (100 normal, 100 Majority Rules),
  and the file the game reads (`category-letter-index.json`) has been rebuilt from it.
- **Is it live? No.** Nothing is committed or deployed. It goes live on the deploy after Phase 3's commit.
- **Result:** Majority Rules rounds can now use **all 18 letters** (was 9 of 18: only B C D F L M P S T). Normal
  rounds gained categories on the thin letters: E +14, G +15, N +12, O +14, **I +8** (target was +10, missed by 2; I is
  still fine at 30 categories, it just isn't as deep as the others).
- **Checks:** typecheck, lint, all tests (4,809 pass, 13 skipped as before) and the production build pass.
  One existing test needed a one-line fix (see §5).
- **Cost:** the replacements cost 20 more small Claude calls (about 260 in total across both phases, well under $1). No change to
  running cost.
- **Needs you:** nothing now. Phase 3 (commit/push/deploy) is your call. The optional live round simulation
  (`npm run category-blitz:simulate`) writes to the shared production database, so it needs your OK first.

## For the next agent (Phase 3: commit and release, Sonnet 5.5, low effort)

### 1. Goal and scope
Plan §6 Phase 3: commit the files below only, then (Andrew's call) push/deploy and watch one Majority Rules round.
Out of scope: any code/engine change, editing the original 283 categories, the simulate script unless Andrew says yes.

### 2. Starting state
- Branch `main`, last commit `78198b7`; nothing from Phases 1–2 is committed or pushed.
- **Commit exactly these:** `data/category-blitz/category-pool.json`, `category-letter-index.json`,
  `letter-cache-abundant.json`, `data/category-blitz/CATEGORY_TEST.md`, `tests/lib.category-blitz-pool.test.ts`,
  `docs/category-blitz-200-categories-plan.md`, and the two handoffs (`…_PHASE_1_HANDOFF.md`, `…_PHASE_2_HANDOFF.md`).
- **Do NOT commit** the unrelated edits already in the tree: `CLAUDE.md`, `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`.
- Run `git stash list` only to look: `stash@{0}` ("category-blitz-scoring-cadence … root snapshot") is old and not ours. I
  accidentally ran `git stash -- data` mid-phase and popped it straight back; the working tree was verified intact afterwards.

### 3. Decisions made
- Final pool = 483: original 283 untouched (checked: first 283 entries identical to `HEAD`; the diff's only non-addition is
  the comma added after "A boring hobby"), +100 standard, +100 Majority Rules (`modes: ["B"]`).
- Phase 2 replacements (all billed, in the cache): 12 standard, 8 Majority Rules. 6 standard replacements failed
  (<5 letters) and were removed: A school supply, A type of candy bar, A winter sport or activity, A type of sweater or
  knitwear, A type of dessert topping, A type of ice or frozen treat. All 8 Majority Rules replacements passed.
- Trim rule (§4): lowest letter count first. Dropped from standard: A leafy green or lettuce, A type of salad. Dropped from
  Majority Rules: A famous fast food menu item, A popular comfort food, A famous TV sitcom, A famous kids' TV show,
  A famous duo or pair, A famous 90s song, A famous fairy tale (all 5 letters; I kept the flagship "A fast food chain" over
  "A famous fairy tale" by judgment). Every kept new category has ≥5 letters.
- Rejected candidates remain in `letter-cache-abundant.json` on purpose (plan §3); the cache is 523+20 entries, the
  index reads only pool texts.

### 4. Per-letter counts (categories per letter in the index)
| | A | B | C | D | E | F | G | H | I | L | M | N | O | P | R | S | T | W |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Standard before | – | – | – | – | 35 | – | 54 | – | 22 | – | – | 25 | 34 | – | – | – | – | – |
| Standard after | 113 | 238 | 309 | 153 | 49 | 148 | 69 | 153 | 30 | 127 | 200 | 37 | 48 | 304 | 125 | 314 | 235 | 129 |
| Majority Rules after | 66 | 95 | 107 | 85 | 21 | 72 | 35 | 67 | 28 | 67 | 88 | 19 | 12 | 101 | 60 | 113 | 90 | 67 |

Majority Rules before: usable BCDFLMPST only (E 5, G 5, I 4, N 5, O 1). `usableLetters` 18, `bUsableLetters` 18.
Majority Rules **O is only 12** (the minimum to be usable), so an O round has no spare variety; N is 19.

### 5. Files changed and the one test edit
- `tests/lib.category-blitz-pool.test.ts` ("Majority Rules respects a custom pool…"): it assumed a 12-category pool taken
  from letter `bUsableLetters[0]` could only fill that letter. With the larger pool the same 12 also fill other letters, so
  the engine (correctly) picked C. The assertion now accepts any letter that contains the whole pool and still checks the
  board equals the pool. No engine change.
- Data files are generated/appended only; do not hand-edit the index or cache.

### 6. How to verify (all done on 2026-10-18)
`npx tsc --noEmit` (clean), `npm run lint` (clean), `npm run test` (404 files pass, 4,809 tests pass, 13 skipped),
`npm run build` (success; run separately, never alongside typecheck). Pool check script: 483 entries, 130 B-tagged,
353 standard, original prefix identical. Not run: `npm run category-blitz:simulate` (needs Andrew's OK).

### 7. Open questions for Andrew
1. Custom-pool venues keep their own list (default no new categories there): still unconfirmed.
2. OK to push and deploy? After deploy, watch one Majority Rules round (every 5th round of a session) and check the letter
   and board look sensible.

### 8. Recommended first steps for Phase 3
1. `git status`; `git add` only the files in §2; commit as `feat(category-blitz): add 200 categories (100 standard + 100 Majority Rules)`.
2. Ask Andrew before pushing. Cost follow-up: no recurring change expected; confirm with Andrew that the Anthropic bill for the build was under $1.
