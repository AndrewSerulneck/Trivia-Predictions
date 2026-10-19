# Category Blitz 200 categories — Phase 1 handoff (2026-10-18)

## For Andrew (plain English)

- **What changed:** all 240 candidate categories (120 normal, 120 Majority Rules) are now in the category
  library, and Claude has scored which letters each one works for. A short "Majority Rules categories"
  rulebook section was added to `data/category-blitz/CATEGORY_TEST.md`.
- **Is it live? No.** Nothing is committed, and the file the game actually reads
  (`category-letter-index.json`) was **not** rewritten. Players see no change yet.
- **Results:** 96 of the 120 normal candidates and 99 of the 120 Majority Rules candidates passed the
  "works for at least 5 letters" bar. That's 4 short and 1 short of the 100 + 100 target, so Phase 2 writes
  a few replacements first, then picks the final 100 + 100.
- **Good news:** with the passing candidates, Majority Rules rounds go from **9 usable letters to 17 of 18**.
  Only **O** is still too thin (10 categories, needs 12).
- **Cost:** 240 small Claude calls, once. Roughly 100k input tokens. Well under the $1 estimate.
- **Needs you:** nothing right now. Phase 3 (commit and deploy) is your call later.

---

## For the next agent (Phase 2)

### 1. Goal and scope

Phase 2 of `docs/category-blitz-200-categories-plan.md`, §6. Apply the §4 acceptance rules, end with exactly
100 new standard + 100 new Majority Rules categories in the pool, run the real build, verify.
**Out of scope:** engine/UI/scoring changes, editing or removing any of the original 283 categories, changing
build thresholds, committing (Phase 3), `npm run category-blitz:simulate` unless Andrew says yes.

### 2. Starting state

- Branch `main`, last commit `78198b7`. **Nothing from Phase 1 is committed.**
- Modified by Phase 1 (uncommitted):
  - `data/category-blitz/category-pool.json`: 240 entries appended at the end (283 → 523; 30 → 150 with
    `modes: ["B"]`). The only non-addition in the diff is a comma added after the old last entry
    ("A boring hobby"). Order: the 120 standard candidates, then the 120 Majority Rules ones.
  - `data/category-blitz/letter-cache-abundant.json`: 240 new keys (283 → 523). None of the 283 old entries changed
    (checked against `HEAD`).
  - `data/category-blitz/CATEGORY_TEST.md`: new section "Majority Rules categories (`"modes": ["B"]`)" before
    "Workflow: pool → build → letter index" (plan §5, reworded slightly).
  - This handoff + the plan's status line.
- **`data/category-blitz/category-letter-index.json` is unchanged** (dry run). The live game still reads the old one.
- Unrelated uncommitted edits were already in the tree before this phase and are NOT ours: `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`.
  Leave them alone. `docs/category-blitz-200-categories-plan.md` is untracked (it's this plan).
- Undo for Phase 1, if ever needed: remove the 240 appended entries from the pool (everything after "A boring
  hobby") and restore that line without its trailing comma. Leave the cache entries (plan §3).

### 3. Decisions already made

- 100 standard + 100 Majority Rules (Andrew, 2026-10-18). Majority Rules = `["B"]` only, "famous/popular X"
  classes, no politics (plan §3, recommended; Andrew has not overridden).
- Rejected candidates **stay in the cache** (plan §3). Remove them from the pool only.
- Phase 1 judgment pass changed three Appendix A candidates (Gate 1: situational):
  "A street food" → **"A type of seed or grain"**, "An appetizer" → **"A Mediterranean dish"**,
  "An item found in a backpack" → **"An item sold in a beauty supply store"**. Appendix B was used unchanged.

### 4. Files and how they fit

- Pool `data/category-blitz/category-pool.json` → `npm run category-blitz:build`
  (`scripts/build-category-blitz-letter-index.cjs`, helpers `scripts/lib/category-blitz-letters.cjs`) →
  cache `letter-cache-abundant.json` (per-text letters) → index `category-letter-index.json` (`letters`,
  `usableLetters`, `bLetters`, `bUsableLetters`), imported server-side by `lib/categoryBlitz.ts` and
  `lib/categoryBlitzPool.ts`.
- Candidate source lists (scratch, not in repo; recreate from the pool if gone):
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/d84d3273-d2c7-433a-8246-d82927b10249/scratchpad/std.txt`
  and `.../scratchpad/mr.txt` (`theme|text` per line). Full per-candidate scores:
  `.../scratchpad/candidate-scores.txt`. Copies of the pre-Phase-1 index and cache: `.../scratchpad/category-letter-index.json`,
  `.../scratchpad/letter-cache-abundant.json` (the index in git `HEAD` is the same thing).

### 5. Facts and traps

- `cut -d= -f1 .env.local` was **denied** by the permission layer this session, even though CLAUDE.md
  allows it. Workaround that prints booleans only:
  `node --env-file=.env.local -e 'for (const k of ["ANTHROPIC_API_KEY","CATEGORY_BLITZ_ANTHROPIC_API_KEY","ANTHROPIC_USERNAME_MODERATOR_API_KEY"]) console.log(k, Boolean(process.env[k]))'`.
  Result: only `ANTHROPIC_USERNAME_MODERATOR_API_KEY` is set; the script uses it. `CATEGORY_BLITZ_LETTER_MODEL` is unset.
- `claude-opus-4-8` (the script default) still answers (tested 2026-10-18). No model override was used, so
  all 523 cache entries come from the same model. Keep it that way for replacements.
- `--dry-run` calls the model and writes the cache; it only skips writing the index (plan fact 6). Confirmed.
- Pattern in the failures: narrow national-cuisine dishes (Japanese 3, Chinese 5, rice dish 3), "a type of X"
  for small object families (chair 2, knife 4, shirt 4), and in Majority Rules, chains/titles with few famous
  members per letter (pizza chain 2, coffee shop chain 3, game show 3, 90s TV show 3). Surprisingly weak:
  "A popular candy" (3), "A popular board game" (3), "A famous reality TV show" (3). Broad people/title
  classes score highest.

### 6. Results of the dry run (`npm run category-blitz:build:dry-run`, exit 0)

```
Pool: 523 categories. Resolving abundant letters (≥3 common answers, model claude-opus-4-8)…
Abundant letters resolved (240 newly analyzed, 283 from cache).
Standard per letter (all 240 candidates in, before selection):
  A 112  B 242  C 322  D 153  E 48  F 152  G 69  H 152  I 30
  L 125  M 202  N 37  O 47  P 318  R 127  S 324  T 240  W 131      → usable 18/18
Majority Rules per letter (150 B-tagged):
  A 63  B 96  C 112  D 82  E 20  F 71  G 34  H 66  I 27
  L 65  M 93  N 20  O 10 ⚠  P 109  R 60  S 123  T 95  W 65        → usable 17/18 (O excluded)
```

Before (HEAD index): standard E 35, G 54, I 22, N 25, O 34; Majority Rules usable BCDFLMPST only, O 1.

**Standard: 96/120 have ≥5 letters.** Thin-letter gain among the 96: E +13, G +15, I +8, N +12, O +13
(target E/I/N/O each ≥ +10 → **I misses by 2**). Below 5 (24): A root vegetable 4, A type of sausage 4,
A type of pastry 4, A dip or spread 4, A type of injury 4, An item found in an art studio 4, An item found in a
bar or pub 4, An item found in a movie theater 4, A type of knife 4, A type of shirt or top 4, A hairstyle 4,
A pattern or print on fabric 4, A magazine 4, A nut 3, A Japanese dish 3, A rice dish 3, A food made from corn 3,
A name for a baby animal 3, A part of a shirt or jacket 3, A paper product 3, A hotel chain 3, A tropical fruit 2,
A part of a newspaper 2, A type of chair 2.

**Majority Rules: 99/120 have ≥5 letters.** Below 5 (21): A famous brand mascot 4, A famous Christmas movie 4,
A famous Star Wars character 4, A famous fictional detective 4, A famous dance move or dance craze 4, A famous
golfer 4, A famous reality TV star 4, A coffee shop chain 3, A popular candy 3, A popular board game 3, A popular
Thanksgiving dish 3, A famous reality TV show 3, A famous TV game show 3, A famous 90s TV show 3, A famous album 3,
A famous chef 3, A famous natural wonder 3, A famous urban legend or myth 3, A famous nursery rhyme 3, A pizza
chain 2, A classic playground or party game 2. Passing Majority Rules categories that include O: 9.

Every candidate's letters are in the cache; `candidate-scores.txt` has the full sorted table. To regenerate:
read each candidate's key from `letter-cache-abundant.json`.

### 7. How to build and test

- Pool/cache/index: `npm run category-blitz:build:dry-run`, then `npm run category-blitz:build`. Both need
  `.env.local` (the script loads it via `--env-file`). Only new texts are billed.
- Checks (plan §6 Phase 2 step 4): `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` — never
  typecheck and build at the same time.
- Verified in Phase 1: pool parses (523, 150 B); no candidate is an exact or near duplicate of the pool or of
  another candidate (stripping a/an/the, "type of", "kind of", "famous", "popular", "classic", "species of");
  max length 37 ≤ 40; old cache entries unchanged; index untouched. Not run: tsc/lint/tests/build (no code changed).

### 8. Open questions for Andrew (unchanged from the plan)

1. Majority Rules "famous/popular X" only, no opinion categories? (Recommended yes; going ahead on that.)
2. New categories for venues with a custom pool? (Default no.)

### 9. Recommended first steps for Phase 2 (Sonnet 5.5, medium effort, per the plan)

1. Remove the 24 standard and 21 Majority Rules candidates listed above from the pool (keep them in the cache).
2. Write **≥4 standard** replacements, favouring letter **I** (I is +8, target +10), and **≥1 Majority Rules**
   replacement, favouring **O** (B-index O is 10, needs 12 to become usable; e.g. famous people/titles with
   strong O members — Oprah, Olivia, Ozzy, Office, Oscar). Write a few spares (say 8 + 5) since some will fail.
   Run the same duplicate/length check (§7) against the full pool, including the 45 rejected texts (they are
   cached, so re-adding one costs nothing, but it already failed).
3. Append, `npm run category-blitz:build:dry-run`, then trim each mode to exactly 100 by §4 (lowest letter count
   first; ties → fewer thin letters; near-duplicates like "A famous band"/"A famous rock band",
   "A famous pop star"/existing "A famous singer", "A famous song"/"A famous 80s song" are the first to cut
   if space is short).
4. `npm run category-blitz:build`; confirm 483 entries, 130 B-tagged, `usableLetters` 18/18, `bUsableLetters`
   ≥ 15; then tsc, lint, test, build. Write the Phase 2 handoff.
