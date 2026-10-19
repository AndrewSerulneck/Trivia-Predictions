# Category Blitz 400 categories — Phase 2 handoff (2026-10-19)

## For Andrew (plain English)

- **What changed:** the category library now has exactly the 400 new categories: 200 for normal rounds and 200 for
  Majority Rules. The game's letter list (`category-letter-index.json`) was rebuilt from it.
- **Is it live? No.** Nothing is committed or pushed. Players see the new categories only after Phase 3's commit and
  your deploy.
- **Majority Rules O is fixed:** O went 12 → 35 categories, N 19 → 50, E 21 → 51, I 28 → 53. Normal rounds: I 30 → 55,
  N 37 → 55, E 49 → 72, O 48 → 75. Every letter is still playable in both modes.
- **How the Majority Rules gap was filled:** 154 of the first batch passed, so I wrote 68 more "popular/famous X"
  candidates; 47 passed and 46 were kept. **No existing categories were retagged** (Q1(b) wasn't needed).
- **Cost:** about 68 extra small Claude calls on top of Phase 1's 439 (total ≈ 507, around $2). Running cost of the game
  is unchanged. I did not run `category-blitz:simulate` (it writes to the shared production database; needs your yes).
- **Needs you:** nothing now. Push/deploy after Phase 3 is your call.

---

## For the next agent (Phase 3: commit and release, Sonnet 5.5, low effort)

### 1. Goal and scope
Plan §5 Phase 3: commit, then (Andrew's call) push/deploy; cost follow-up. **Out of scope:** any further category edits
(if you must, re-run `npm run category-blitz:build`; never hand-edit the index or cache).

### 2. Starting state
- Branch `main`, last commit `1c50259`, not pushed. Nothing from Phases 1–2 is committed.
- Changed by this work: `data/category-blitz/category-pool.json` (483 → 883; diff vs `1c50259` is 401 added lines and one
  removed line — the old last entry "A famous Netflix show" gained a trailing comma), `…/category-letter-index.json`
  (regenerated), `…/letter-cache-abundant.json` (543 → 1,050-ish keys incl. kept rejects; old entries unchanged),
  the plan, and the Phase 1 and 2 handoffs.
- Unrelated uncommitted edits, NOT ours, leave out of the commit: `CLAUDE.md`, `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`.
- Undo: `git checkout 1c50259 -- data/category-blitz/` (safe here because these three files contain only this work).

### 3. Decisions already made
Q1 = (b) but unused (no shortfall after one replacement round); Q2 cap of 40 "Something…" didn't bite; custom-pool
venues unchanged (nothing touched them). Andrew's earlier go-ahead covers the 400.

### 4. What was done
- Standard: removed the 51 failed candidates; of 211 passers trimmed 11 → 200: "A street food", "An appetizer",
  "An item found in a backpack", "A word for a sound", then five-letter ones with no thin letters (E I N O G):
  "A leafy green or lettuce", "A type of salad", "Something that is orange", "Something that is pink",
  "Something with a lid", "Something that bounces", "A salty food".
- Majority Rules: removed the 32 failed + the Phase 1 swap "A famous 80s or 90s cartoon" (4 letters); 154 kept; appended
  68 replacements (all `"modes": ["B"]`, theme "entertainment"); 47 passed, 21 removed, 1 more trimmed ("A popular
  school supply", 5 letters, no thin letters) → 46 added. Kept replacements (letter count): A popular girl's name (15) ·
  boy's name (17) · A common first name (18) · fast food restaurant (6) · restaurant chain (10) · grocery store (6) · snack
  brand (8) · soda brand (6) · clothing brand (12) · shoe brand (6) · social media app (5) · mobile app (9) · card game
  (6) · animal (15) · beach (6) · national park (5) · US city (11) · Caribbean island (7) · sport (8) · profession (12) ·
  tourist attraction (13) · fish (7) · herb (6) · beer (6) · alcoholic drink (8) · tea (5) · actor (14) · actress (12) ·
  A famous superhero (8) · rapper (9) · author (14) · painter (6) · basketball player (13) · football player (13) ·
  A popular chip brand (6) · grocery item (11) · toy (7) · A famous witch or wizard (6) · building (8) · bridge (7) ·
  mountain (6) · river (9) · street or road (10) · restaurant (10) · hotel (6) · car (6).
  Failed replacements (don't re-propose): cereal, sports brand, streaming service, baby animal, sidekick, detective,
  robot, cat, dog, cartoon duo, couple, ice cream brand, pirate, cowboy, clown, bear, pig, mouse, duck, horse,
  doll or action figure, plus the 3 already rejected as old cache entries (berry, pastry, color — not added).
- Pool edits were line-based (each entry is one line) so formatting and order of old entries are untouched.

### 5. Verification (all at the working tree above)
- `npm run category-blitz:build`: exit 0; usableLetters and bUsableLetters both 18/18.
- Pool: 883 entries = 553 standard + 330 Majority Rules; zero duplicate texts; max length 40; first 483 entries identical
  to `1c50259`.
- Per-letter counts now — standard: A182 B385 C498 D266 E72 F261 G104 H241 I55 L223 M305 N55 O75 P479 R207 S504 T389 W224.
  Majority Rules: A147 B238 C289 D188 E51 F163 G70 H146 I53 L153 M212 N50 O35 P253 R138 S302 T227 W161.
  Targets met (MR O 35 ≥ 20, N 50 ≥ 25, E 51 ≥ 28; standard I 55 ≥ 40, N 55 ≥ 45).
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 4,809 pass / 13 env-gated skips / 0 fail (incl.
  `tests/lib.category-blitz-pool.test.ts`); `npm run build` exit 0 (run after, not alongside, tsc).
- Not run: `npm run category-blitz:simulate` (live Haiku + shared prod DB; ask Andrew first). No browser check.

### 6. Facts and traps
- `--dry-run` writes the cache; the real build only billed the 68 new texts.
- Some good "popular X" ideas already existed in the pool as "famous X" (popular car brand, video game, vacation
  destination, villain, monster…), so the near-duplicate check removed them before the build.
- Scratch files (may be gone) in the session scratchpad: `pool.before.json`, `cache.before.json`, `index.before.json`
  (Phase 2 starting point), `build.log`, `dry2.log`.

### 7. Open questions
None blocking. Optional: Andrew's yes for `category-blitz:simulate`.

### 8. Recommended first steps (Phase 3)
1. `git add` only the three `data/category-blitz/*.json`, the plan and both handoffs; commit (Co-Authored-By line per
   the session reminder). Leave the four unrelated files out.
2. Tell Andrew it's ready to push/deploy; after deploy, watch one Majority Rules round on O or N if possible.
3. Cost follow-up: confirm the Anthropic bill for the builds was about $2 or less; per-round usage should be unchanged.
