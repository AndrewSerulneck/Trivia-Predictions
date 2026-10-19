# Category Blitz 400 categories — Phase 1 handoff (2026-10-19)

## For Andrew (plain English)

- **What changed:** all 448 candidate categories (262 normal, 186 Majority Rules) are in the category library,
  and Claude has scored which letters each one works for.
- **Is it live? No.** Nothing is committed, and the file the game reads (`category-letter-index.json`) was
  **not** rewritten (dry run). Players see no change yet.
- **Results:** **211 of 262** normal candidates pass the "at least 5 letters" bar (target 200, so 11 get trimmed).
  **154 of 186** Majority Rules candidates pass (target 200, **46 short**). As you agreed (Q1 = b), Phase 2 writes
  one round of replacements, then fills whatever is still missing by also tagging strong existing normal
  categories as Majority Rules.
- **The thin letters get much better** with just the passing candidates: Majority Rules **O 12 → 28**, N 19 → 37,
  E 21 → 40, I 28 → 46; normal I 30 → 55, N 37 → 56. All of the plan's targets are already met.
- **Cost:** 439 small Claude calls, once (the 9 "free" ones cost nothing). Not metered by the script; by the last
  batch's rate (240 calls ≈ 100k input tokens) this is ≈ 185k input tokens, in line with the "≈ $2 or less" estimate.
  Running cost of the game is unchanged.
- **Needs you:** nothing now. Push/deploy after Phase 3 is your call.

---

## For the next agent (Phase 2)

### 1. Goal and scope

Phase 2 of `docs/category-blitz-400-categories-plan.md` §5: apply §4, end with exactly 200 new standard + 200 new
Majority Rules (Q1(b) retags count toward the 200), run the real build, verify (tsc, lint, test, build).
**Out of scope:** engine/UI/scoring changes; editing or reordering existing entries (except adding `"A"` to
`modes` for Q1(b) retags — note a retag means changing an existing standard entry to `"modes": ["A","B"]`);
changing build thresholds; committing (Phase 3); `npm run category-blitz:simulate` unless Andrew says yes.

### 2. Starting state

- Branch `main`, last commit `1c50259` (not pushed). **Nothing from Phase 1 is committed.**
- Modified by Phase 1 (uncommitted):
  - `data/category-blitz/category-pool.json`: 448 entries appended at the end (483 → 931; Majority Rules
    130 → 316). Order: the 262 standard candidates, then the 186 Majority Rules ones. The only non-addition in
    the diff is a comma after the old last entry ("A famous Netflix show").
  - `data/category-blitz/letter-cache-abundant.json`: 439 new keys (543 → 982). **None of the 543 old entries
    changed** (checked against a copy taken before the run).
  - This handoff + the plan's status line.
- `category-letter-index.json` is **unchanged** (dry run).
- Undo for Phase 1: delete every pool entry after "A famous Netflix show" and drop that line's trailing comma.
  Leave the cache alone (rejects are kept on purpose).
- Unrelated uncommitted edits, not ours, leave alone: `CLAUDE.md`, `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`. The plan file itself is untracked.

### 3. Decisions already made

- Andrew (2026-10-19) accepted all the plan's recommendations: **Q1 = (b)** (retag ≤ 60 existing standard
  categories with ≥ 10 cached letters and an obvious crowd answer, no people/politics, as `["A","B"]`), **Q2 = at
  most 40 "Something…"** in the final 200 (only 31 of 35 passed, so the cap does not bite), custom-pool venues get
  no new categories, thin-letter priority O N E I G for Majority Rules ties and E I N O G for standard.
- Phase 1 judgment swaps (Gate 1: opinion/relative or situational, or a named fail in `CATEGORY_TEST.md`).
  Standard, out → in: "Something that is hot/cold/heavy/soft", "Something that makes noise", "An animal found in a
  backyard", "A large animal", "A small animal", "A costume", "A type of event", "A part of a flower", "A picnic
  food", "A lunch food" → "An item found in a backpack", "An item sold in a furniture store", "An item sold at a gas
  station", "A type of dress or skirt", "A garden plant", "A craft or handicraft", "A piece of safety gear", "An art
  form", "A type of puzzle or game", "An item found in a junk drawer", "A type of home decoration", "A recyclable
  item", "An item sold at a yard sale". (Three first-choice replacements — "A type of shirt or top", "A hairstyle",
  "A type of pastry" — were found in the cache as earlier rejects at 4 letters and were not used.)
  Majority Rules: "A famous news anchor" (politics-adjacent) → "A famous 80s or 90s cartoon".
- **Trim hint (standard, 11 to drop):** the last batch's Phase 1 judged "A street food" (8), "An appetizer" (7) and
  "An item found in a backpack" (5) situational and swapped them out; they came back in this plan's appendix
  (backpack via my swap). Prefer dropping these three first, then lowest counts / near-duplicates per §4
  (e.g. "A sound" vs "A word for a sound", "A party food" vs "A popular party food" is cross-mode and allowed).

### 4. Files and how they fit

- Pool `data/category-blitz/category-pool.json` → `npm run category-blitz:build`
  (`scripts/build-category-blitz-letter-index.cjs`, helpers `scripts/lib/category-blitz-letters.cjs`) → writes
  `category-letter-index.json` (standard `letters`/`usableLetters`, Majority Rules `bLetters`/`bUsableLetters`)
  and the cache. Categories with `modes` containing `"B"` go to the Majority Rules index; no `modes` or `"A"` in
  `modes` → standard. Runtime reads the index in `lib/categoryBlitz.ts` / `lib/categoryBlitzPool.ts`.
- Scratch files (not in the repo; may be gone): candidates `cands.json`, results `results.json`, the dup check
  `check.cjs` (Appendix C plus a check against cached rejects), backups `category-pool.before.json` and
  `letter-cache.before.json`, full log `dryrun.log`, all in
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/61eba829-9e27-4c42-b389-fcc1f4d53c66/scratchpad/`.
  Everything you need is reproducible from the pool + cache: a candidate's letters are `cache[text]`.

### 5. Facts and traps

- Key name `ANTHROPIC_USERNAME_MODERATOR_API_KEY` is set (checked names only). `claude-opus-4-8` still answers
  (one-ping test 2026-10-19); no `CATEGORY_BLITZ_LETTER_MODEL` override was used.
- `--dry-run` calls the model and **writes the cache**; it only skips the index. So the Phase 2 real build bills only
  new replacement text.
- When removing rejected candidates from the pool, also fix the trailing comma of the new last entry; the build
  refuses exact duplicate text across the whole pool (both modes), so a Majority Rules replacement must not equal
  any existing text.
- Check every replacement against cached rejects too (same `norm()` as Appendix C over cache keys not in the pool):
  this phase found three of its own picks were old rejects.
- Majority Rules failures cluster in two patterns (see appendix): **"popular" shrinking a food class** (popular cake/soup/snack food/party food/ice cream flavor/pasta dish → 3–4 letters, as plan fact 6 warned) and **narrow people or decade groups** (astronaut, magician, model, child star, YouTuber, 2020s TV show, book series). Avoid both in replacements.
- Q1(b) retag candidates: standard entries with `cache[text].length >= 10`. Retagging is free (letters cached by text).

### 6. Build / test / verify

- `npm run category-blitz:build:dry-run` (this phase; exit 0, no errors in the log, 439 analyzed / 492 cached).
- Phase 2: `npm run category-blitz:build`, then `npx tsc --noEmit`, `npm run lint`, `npm run test`, then
  `npm run build` (never alongside tsc). `tests/lib.category-blitz-pool.test.ts` reads the real index.
- Dry-run per-letter counts with **all** 931 entries (includes failing candidates, so not final):
  standard A186 B400 C536 D273 E72 F270 G105 H248 I55 L232 M312 N56 O76 P515 R213 S554 T410 W232;
  Majority Rules A128 B210 C265 D171 E40 F148 G63 H130 I48 L134 M186 N39 O29 P231 R118 S286 T203 W138.
- Per-letter counts with old pool + **passing** candidates only (Phase 2 before trimming):
  standard A183 B392 C507 D268 E72 F265 G104 H243 I55 L224 M307 N56 O75 P489 R211 S514 T395 W228;
  Majority Rules A126 B206 C249 D163 E40 F144 G61 H125 I46 L132 M180 N37 O28 P214 R117 S261 T197 W136.
  Before (pool at `1c50259`): standard E49 I30 N37 O48; Majority Rules E21 I28 N19 O12.
- Letter-count distribution — standard: 1:3 2:14 3:10 4:24 | 5:28 6:28 7:38 8:27 9:24 10:14 11:17 12:10 13:11
  14:7 15:3 16:1 17:2 18:1. Majority Rules: 2:6 3:11 4:15 | 5:28 6:26 7:19 8:22 9:13 10:14 11:8 12:9 13:6 14:5 15:3 18:1.

### 7. Open questions

None blocking. Still recorded: post-deploy watch of a Majority Rules O/N round (Phase 3).

### 8. Recommended first steps (Phase 2, Sonnet 5.5, medium effort)

1. Standard: remove the 51 failed new candidates from the pool, then trim 11 of the 211 passers (§4 + trim hint).
2. Majority Rules: remove the 32 failed; write ~50 replacements with the `CATEGORY_TEST.md` Majority Rules rules
   (avoid the two failure patterns in §5), dup-check them against the
   pool **and** cached rejects, append, `npm run category-blitz:build:dry-run` (only new text is billed). Keep
   passers up to 200; fill any remaining gap with Q1(b) retags (≤ 60).
3. Real build, verify per plan §5 Phase 2 steps 2–4, write the Phase 2 handoff.

## Appendix — every candidate's letter count (count: letters)

### Standard — passed (211)

An adjective (18: ABCDEFGHILMNOPRSTW) · A science term (17: ABCDEFGHILMNOPRST) · An adverb (17: ABCDEFHILMNOPRSTW) · A sports term (16: ABCDFGHILMOPRSTW) · A city in Texas (15: ABCDEFGHILMPRSW) · A movie (15: ABCDFGHILMPRSTW) · An animal with four legs (15: ABCDEFGHLMPRSTW) · A band or music group (14: ABCDFGMNOPRSTW) · A professional athlete (14: ABCDFHLMNPRSTW) · A singer or musician (14: ABCDEFHLMPRSTW) · A song title (14: ABCDFHILMPRSTW) · An actor or actress (14: ABCDFHLMNPRSTW) · Something made of metal (14: ABCDFHLMNPRSTW) · Something with legs (14: ABCDEFHLMPRSTW) · A city in California (13: ABCFHILMOPRST) · A computer term (13: ABCDFHIMPRSTW) · A money or finance term (13: ABCDEFILMPRST) · A part of an animal's body (13: ABCEFHLMNPSTW) · A predator (13: ABCDEFHLOPSTW) · A US city with a pro sports team (13: ABCDHLMNOPSTW) · An animal with fur (13: BCDFGHLMPRSTW) · An item found in a refrigerator (13: ABCDEFHLMPSTW) · An item found in a shed or workshop (13: BCDFHLMNPRSTW) · An item found on a boat (13: ABCDFHLMPRSTW) · Something with a plug or cord (13: BCDFHILMPRSTW) · A book title (12: BCDFGHLMPSTW) · A garden plant (12: ABCDFHLMPRST) · A military term (12: ABCDFGIMPRST) · A part of a hospital (12: ACEILMOPRSTW) · A sweet food (12: ABCDFHILMPST) · A theme park ride or attraction (12: BCDFHLMPRSTW) · A type of document (12: ACDFILMPRSTW) · A type of road or street (12: ABCDFHLMPRST) · An item found in a car (12: ACDFHLMPRSTW) · An item sold in a thrift store (12: BCDFHLMPRSTW) · A Canadian city (11: BCEHLMORSTW) · A cartoon character (11: BCDFGHLMPST) · A city in Florida (11: ACFHLMOPSTW) · A computer program or app (11: ACDFGIMPSTW) · A cooking ingredient (11: ABCFLMOPRST) · A job done outdoors (11: BCDFGLPRSTW) · A job in a factory (11: ACFILMOPSTW) · A medical term (11: ABCDFHIMPST) · A music term (11: ABCDFHMPRST) · A shrub or bush (11: ABCFHLMOPRS) · A TV series (11: BCDFHLMPSTW) · An internet term (11: BCDEHLMPSTW) · An item found in a backyard (11: BCDFGHLPSTW) · An item sold in a furniture store (11: BCDLMOPRSTW) · An item sold in a gift shop (11: ABCDFHLMPST) · Something made of rubber (11: BCDEGHPRSTW) · Something that holds water (11: BCDGLMPRSTW) · A business term (10: ACDEIMPRST) · A character in a fairy tale (10: BCFGHPRSTW) · A family member or relative (10: BCDFGHMNPS) · A household item (10: BCDFLMPRST) · A liquid (10: ABCLMOPSTW) · A part of a neighborhood (10: BCDHLMPRST) · A part of a song (10: BCHILMPRST) · A type of musician (10: BCDFGHPRST) · An animal that eats insects (10: ABCFHLPRST) · An animal that swims (10: CDEFMOPSTW) · An individual sport (10: ABCDFGRSTW) · An item sold at a gas station (10: BCDGLMPSTW) · Something that is shiny (10: BCDFGMPRST) · Something that uses batteries (10: CDFHLPRSTW) · A basketball term (9: ABCDFPRST) · A craft or handicraft (9: BCDEMPSTW) · A flavor (9: ABCLMPSTW) · A food made with flour (9: BCDFMPSTW) · A food sold at a ballpark (9: BCFHLNPST) · A hockey term (9: BCDFGHIPS) · A part of an airport (9: BCDGLPRST) · A pest or vermin (9: ACFLMRSTW) · A recyclable item (9: ABCFMPSTW) · A sailing or nautical term (9: BCDHMPRST) · A soccer term (9: CDFGHOPST) · A sound (9: BCDHPRSTW) · A type of athlete (9: BCFGHPRSW) · A video game character (9: BCDLMPRST) · An item found at a campsite (9: BCFLMPSTW) · An item found in a police station (9: BCDFHPRST) · An item sold at a yard sale (9: BCDFLPRST) · An item sold in a coffee shop (9: BCDELMPST) · An item sold in a health food store (9: ACFHOPSTW) · An item sold in an antique store (9: BCDLMPSTW) · Something made of glass (9: BCFLMPSTW) · Something that floats (9: BCDFLPRSW) · Something that is green (9: ABCFLMPST) · Something that is red (9: ABCFLPRST) · A body movement or gesture (8: BCHNPSTW) · A children's TV show (8: ABCDFPST) · A golf term (8: BCDFHPST) · A legal term (8: ACDLPSTW) · A movie or film term (8: ACDFPRST) · A part of a restaurant (8: BCDPRSTW) · A part of a website (8: BCFHLMPS) · A position on a sports team (8: CDFGPSTW) · A salad ingredient (8: ACLOPRST) · A skill or ability (8: CDLPRSTW) · A sport played with a ball (8: BCFHPSTW) · A street food (8: BCDFHPST) · A summer activity (8: BCFHPSTW) · A swamp or wetland animal (8: ACFHMPST) · A tourist attraction (8: ACELMPST) · A type of restaurant (8: BCDFIPST) · A word for a sound (8: BCHPRSTW) · An African city (8: ACDLMNPT) · An animal that hops or jumps (8: CFGHRSTW) · An exclamation or interjection (8: ABDHOPSW) · An item found in a dorm room (8: BCDLMPST) · An item found in a makeup bag (8: BCEFLMPS) · Something made of cloth or fabric (8: BCDFHPST) · Something made of wood (8: BCDFPSTW) · Something that is brown (8: BCDMPSTW) · Something that is sharp (8: BCDNPRST) · Something that rolls (8: BCDMPSTW) · A holiday decoration (7: BCLPSTW) · A job that requires a uniform (7: CDFNPSW) · A job working with animals (7: BCFHPTW) · A part of a bathroom (7: BDFMSTW) · A part of a kitchen (7: CDFOPST) · A part of a park (7: BFGPSTW) · A part of a rocket or spacecraft (7: BCFNPST) · A part of a wedding (7: BCFRSTW) · A songbird (7: BCFMRSW) · A soup ingredient (7: BCLOPST) · A Southern US dish (7: BCFGHPS) · A tennis term (7: ABDFLST) · A title or honorific (7: BCDLMPS) · A traffic or driving term (7: BCLPRST) · A type of dress or skirt (7: ABCMPST) · A type of puzzle or game (7: CDMPSTW) · A type of race (7: BDFHMRS) · An American dish (7: BCFHMPS) · An animal that lives in trees (7: CLMOPST) · An appetizer (7: BCDMNPS) · An indoor activity (7: BCDPRSW) · An item found at the beach (7: BCFPSTW) · An item found in a closet (7: BCDHPST) · An item found in a museum (7: ACFMPST) · An item found in a nursery (7: BCMPRST) · An item found in a pantry (7: BCFPRST) · An item found in a purse or handbag (7: CLMPSTW) · An item found in a tackle box (7: BFHLPSW) · An item found in an attic or basement (7: BCLMPST) · An item found on a desk (7: BCLMPST) · An outdoor activity (7: BCFHRSW) · Something made of plastic (7: BCFPSTW) · Something that is purple (7: ABEGLPS) · Something that is sticky (7: CGHMPST) · Something that is yellow (7: BCDLMPS) · Something with a zipper (7: BCDPSTW) · Something with strings (7: BCGHPST) · Something with teeth (7: BCDHPSW) · A combat sport or martial art (6: BCMSTW) · A fashion term (6: BCDPST) · A food served at a barbecue (6: BCHPRS) · A food that grows on trees (6: ACLMOP) · A frozen food (6: BCFIPS) · A grilled food (6: BCHPST) · A holiday tradition (6: CDFPST) · A job in a hotel (6: CDMPRW) · A job in a school (6: CDLPST) · A job in an office (6: ACMPRS) · A job working with children (6: BCNPST) · A part of a bird (6: BCFLTW) · A part of a meal (6: ACDMPS) · A scavenger (6: CHRSTW) · A side dish (6: BCFPRS) · A smell or scent (6: CFLMPS) · A team sport (6: BFHPSW) · A term of endearment (6: BDHLPS) · A texture (6: BCFGRS) · A type of bed (6: BCDSTW) · A type of light or lamp (6: CFHLST) · An item found at a wedding (6: BCFPRT) · An item found in a junk drawer (6: BCPRST) · An item found in a lunchbox (6: ABCFPS) · An item found in a recording studio (6: ACHMPS) · An item found in a suitcase (6: BCDPST) · Something made of leather (6: BCHPSW) · Something that is black (6: CLPRST) · A canned food (5: BCPST) · A holiday food (5: CHPST) · A hot drink (5: CHLMT) · A household chore (5: DLMSW) · A job in TV or film (5: ACDPS) · A leafy green or lettuce (5: ACRSW) · A literary term (5: ACMPS) · A Middle Eastern dish (5: BFHST) · A natural resource (5: CIOSW) · A part of a letter or email (5: ABCDS) · A powder (5: BCFST) · A salty food (5: BCFPS) · A theater term (5: ACDPS) · A type of home decoration (5: CLPRT) · A type of party (5: BCDHS) · A type of salad (5: CFPTW) · A type of table (5: CDPST) · A working animal (5: CDHMO) · An art form (5: CDMPS) · An item found in a backpack (5: BCPSW) · An item found in a bank (5: CDPST) · An item sold in a candy store (5: CLMPT) · Something that bounces (5: BPRST) · Something that is fragile (5: CEGPS) · Something that is orange (5: CMPST) · Something that is pink (5: FLPRS) · Something that melts (5: BCISW) · Something with a lid (5: BCPST)

### Standard — failed, <5 letters (51)

A casserole or baked dish (4: CLMS) · A crunchy food (4: ACPT) · A finger food (4: CFPS) · A food made with eggs (4: FOPS) · A food sold at a fair or carnival (4: CFPS) · A grammar term (4: ACPS) · A job at an airport (4: BCPS) · A job in sports (4: CPRT) · A natural material (4: CLSW) · A party food (4: CDPS) · A piece of farm equipment (4: HPST) · A spicy food (4: CHPS) · A weed (4: CDPT) · An animal that hibernates (4: BCHS) · An animal with claws (4: CLPT) · An animal with stripes or spots (4: CLPT) · An item found in a church (4: ACPS) · An item found in a salon or barbershop (4: BCST) · An item found in a school locker (4: BCPS) · An item found in a sewing kit (4: BPST) · An item sold in a hobby or game store (4: CDMP) · An item sold in a vending machine (4: CPSW) · Something made of paper (4: BCPT) · Something that is white (4: CMPS) · A computer accessory (3: MSW) · A part of a fish (3: FST) · A part of a hotel (3: LRS) · A part of a movie (3: CST) · A part of a road or highway (3: LMS) · A part of a story (3: CPS) · A piece of safety gear (3: GHS) · A Spanish dish (3: CPT) · An animal with a shell (3: CST) · An art term (3: CPS) · A Greek dish (2: ST) · A greeting or farewell (2: HS) · A job in retail (2: CS) · A medical tool or instrument (2: ST) · A part of a city (2: DS) · A part of a shopping mall (2: FS) · A part of the face (2: CL) · A room in a house (2: BL) · A type of school (2: PS) · A water sport (2: SW) · An item found in a post office (2: PS) · An item found in a wallet (2: CP) · Something that is blue (2: BS) · Something with a lock (2: DS) · A part of a playground (1: S) · A road sign (1: S) · An item found at a playground (1: S)

### Majority Rules — passed (154)

A famous celebrity (18: ABCDEFGHILMNOPRSTW) · A famous book character (15: ABCDEFGHLMPRSTW) · A famous European city (15: ABCDFGHLMNPRSTW) · A popular wild animal (15: ABCDEFGHLMPRSTW) · A common last name (14: ABCDFGHLMPRSTW) · A famous 2000s singer or band (14: ABCDEFGLMNPRST) · A famous fashion designer (14: ABCDFGHLMPRSTW) · A famous movie star (14: ABCDEHLMNPRSTW) · A popular zoo animal (14: ACEFGHLMOPRSTW) · A famous 2000s movie (13: ABCFGHILMPSTW) · A famous 2010s movie (13: ABCDFGILMPSTW) · A famous 60s song (13: ABCDHILMPRSTW) · A famous country (13: ABCFGILMNPRST) · A popular gadget or electronic device (13: ACDFHILMPRSTW) · A popular nickname (13: ABCDEFHLMPRST) · A famous 70s band or singer (12: ABCDEFLPRSTW) · A famous 70s song (12: ABCDHILMRSTW) · A famous 90s athlete (12: ABCDFHLMPRST) · A famous capital city (12: ABCDHLMPRSTW) · A famous movie sequel (12: ABCDFILMPRST) · A famous sports team (12: ABCDLMNPRSTW) · A popular job or career (12: ACDEFLMNPSTW) · A popular store or shop (12: ABCDFHLMPSTW) · A popular TV channel (12: ABCDEFHMNPST) · A famous Disney character (11: ABCDFGMPSTW) · A famous family movie (11: ABCDFHLMPST) · A famous female singer (11: ABCDLMPRSTW) · A famous fictional place (11: ACGHMNORSTW) · A popular flavor (11: ABCLMOPRSTW) · A popular hobby (11: BCDFGHPRSTW) · A popular kitchen appliance (11: BCDFMOPRSTW) · A popular piece of sports equipment (11: BCDFGHPRSTW) · A famous 2010s song (10: ABCDHLRSTW) · A famous Disney song (10: BCFHILPSTW) · A famous R&B singer (10: ABCDMPRSTW) · A famous soccer team (10: ABCLMPRSTW) · A famous superhero movie (10: ABCDILMSTW) · A famous TV star (10: BCDELMORST) · A popular bird (10: CDFHOPRSTW) · A popular breakfast food (10: BCEFHOPSTW) · A popular brunch food (10: BCEFHOPSTW) · A popular clothing store (10: ACFGHLMNPT) · A popular movie genre (10: ACDFHMRSTW) · A popular musical instrument (10: BCDFHOPSTW) · A popular pet (10: CDFGHLPRST) · A popular weekend activity (10: BCDFHPRSTW) · A classic kids' movie (9: BCDFLMPST) · A famous action star (9: ABCDLMSTW) · A famous landmark (9: BCEGLMPST) · A famous mythical creature (9: BCDGMPSTW) · A famous tech company (9: ACDIMNPST) · A popular cartoon or animated show (9: ABCDFPRST) · A popular household product brand (9: ACDFLPSTW) · A popular Indian dish (9: BCDMNPRST) · A popular insect or bug (9: BCDFLMSTW) · A popular music genre (9: BCDFHPRST) · A popular sweet treat (9: BCDFLMPST) · A popular US state (9: ACFIMNOTW) · An NHL team (9: BCDFNPSTW) · A famous 80s TV show (8: ACDFHMST) · A famous children's author (8: BCDLMPRS) · A famous dancer (8: ABCFGMPS) · A famous movie hero (8: BHILMRST) · A famous university (8: BCDHMOPS) · A famous US landmark (8: ACGHLMSW) · A popular birthday gift (8: BCFGPSTW) · A popular book genre (8: BCFHMRST) · A popular cheese (8: BCFGMPRS) · A popular clothing item (8: BCDHLPST) · A popular college major (8: ABCEHMPS) · A popular dog breed (8: BCDGLPRS) · A popular flower (8: ACDLMPST) · A popular makeup or beauty brand (8: ACLMNPRS) · A popular Mexican dish (8: BCEFMPST) · A popular Olympic sport (8: BDFHRSTW) · A popular school subject (8: BCEHLMPS) · A popular shoe style (8: BCFLMPST) · A popular sport to play (8: BCFHRSTW) · A popular street food (8: BCDFHPST) · A popular tree (8: ABCMOPSW) · A popular vegetable (8: ABCLOPST) · A famous 60s band or singer (7: BCDMRST) · A famous Asian city (7: BCDHMST) · A famous female athlete (7: BLMNSTW) · A famous song from a movie (7: CFILMST) · A popular amusement park ride (7: BCFPRST) · A popular appetizer (7: BCFMPSW) · A popular bread (7: BCFPRSW) · A popular car model (7: ACFMPST) · A popular dinosaur (7: ABCDPST) · A popular electronics brand (7: ACLMPST) · A popular exercise or workout (7: BCLPRSW) · A popular first job (7: BCDLPSW) · A popular fruit (7: ABCLMOP) · A popular Italian dish (7: CLMPRST) · A popular outdoor activity (7: BCFHRSW) · A popular side dish (7: BCFMPRS) · A popular style of dance (7: BCDHSTW) · A popular summer activity (7: BCFHPSW) · A popular tool (7: ACDHPSW) · A famous 70s movie (6: ACDGRS) · A famous Broadway musical (6: ACHPSW) · A famous cult classic movie (6: BCDFPT) · A famous game (6: BCMPST) · A famous guitarist (6: BCDEPS) · A famous hip-hop song (6: CHILPS) · A famous island (6: BCHMST) · A famous party song (6: CDIPSW) · A famous tech product (6: AIMPSW) · A popular baked good (6: BCDMPS) · A popular Chinese dish (6: CDFMPS) · A popular Christmas decoration (6: BCLSTW) · A popular cleaning product brand (6: CDFLPS) · A popular cocktail (6: BCDMPS) · A popular date night activity (6: BCDMPS) · A popular drink (6: CLMSTW) · A popular fashion accessory (6: BCHSTW) · A popular French food (6: BCMPRS) · A popular late-night food (6: BCFPST) · A popular piece of exercise equipment (6: BDESTW) · A popular pizza topping (6: BCMOPS) · A popular sauce or condiment (6: BHMPST) · A popular Southern food (6: BCFGPS) · A popular spice or seasoning (6: ABCPST) · A popular toy brand (6: FHLMNP) · A popular type of vehicle (6: BCMPST) · A famous 70s TV show (5: CHMSW) · A famous 90s song (5: BCSTW) · A famous country song (5: CFIST) · A famous duo or pair (5: BLRST) · A famous fairy tale (5: CPRST) · A famous fast food menu item (5: BCFMS) · A famous kids' TV show (5: BDPST) · A famous Pixar character (5: BDMSW) · A famous romantic comedy (5: BCPSW) · A famous sports movie (5: BCMRS) · A famous TV sitcom (5: CFMST) · A popular coffee drink (5: ACFLM) · A popular comfort food (5: BCMPS) · A popular department store (5: MNSTW) · A popular dessert (5: BCPST) · A popular farm animal (5: CDHPS) · A popular food to grill (5: BCPST) · A popular holiday food (5: CHPST) · A popular holiday tradition (5: CDFST) · A popular junk food (5: CDFPS) · A popular phone or computer brand (5: AHLMS) · A popular pie (5: ABCPS) · A popular piece of furniture (5: BCDST) · A popular sandwich (5: BCPST) · A popular sea creature (5: CDSTW) · A popular seafood dish (5: CFLPS) · A popular type of meat (5: BCPST) · A popular wine (5: CMPRS)

### Majority Rules — failed, <5 letters (32)

A famous 2020s TV show (4: BSTW) · A famous 80s or 90s cartoon (4: DGST) · A famous astronaut (4: ACGS) · A famous European country (4: FIPS) · A famous magician (4: CDHP) · A famous model (4: CHLN) · A famous teen movie (4: CMPS) · A popular fair or carnival food (4: CFPS) · A popular fried food (4: CFPS) · A popular ice cream flavor (4: CMPS) · A popular party food (4: CDPS) · A popular pasta dish (4: CLPS) · A popular piece of jewelry (4: BCPR) · A popular soup (4: CMPT) · A popular superpower (4: FIST) · A famous child star (3: DMS) · A famous dance song (3: MST) · A famous TV family (3: BCS) · A famous YouTuber or influencer (3: MPS) · A popular airline (3: ADS) · A popular art form (3: DPS) · A popular cake (3: CPS) · A popular frozen food brand (3: BHS) · A popular game day food (3: CPS) · A popular holiday (3: CHN) · A popular snack food (3: CPS) · A famous book series (2: HT) · A famous sporting event (2: SW) · A famous theme or amusement park (2: DS) · A popular bar game (2: DP) · A popular cookie (2: OS) · A popular houseplant (2: PS)

