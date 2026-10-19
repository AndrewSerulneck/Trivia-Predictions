# Category Blitz — add 400 more categories (200 standard + 200 Majority Rules)

> **Status (2026-10-19):** Phase 3 done — committed locally, NOT pushed/deployed (Andrew's call). Pool 883 = 553
> standard + 330 Majority Rules. Handoff: `docs/category-blitz-400-categories-plan_PHASE_3_HANDOFF.md`
> (Phase 2: `…_PHASE_2_HANDOFF.md`, Phase 1: `…_PHASE_1_HANDOFF.md`). Andrew accepted all §3
> recommendations (Q1 = b, Q2 = 40 cap, custom pools unchanged). Builds on `1c50259` (not pushed yet).
> Phases end with `docs/category-blitz-400-categories-plan_PHASE_<N>_HANDOFF.md`.

## For Andrew (plain English)

We'll add 400 more categories: 200 for normal rounds and 200 for Majority Rules rounds (every 5th round). We use
the same recipe as the last batch: write candidates into the category library, run the build script (it asks
Claude which letters each category works for), keep the ones that work for at least 5 letters, then rebuild.

What it costs: about 450–500 small Claude calls, **about $2 or less, paid once**. The game's running cost doesn't
change: no new database reads, scheduled jobs or per-round calls. (The file the server loads grows from about
125 KB to about 230 KB, which doesn't matter.)

What it fixes: Majority Rules **O has only 12 categories**, the minimum a letter needs to be playable, so every O
round shows the same 12. N (19) and E (21) are also thin. In normal rounds, I (30) is the thinnest letter.

**The catch:** 200 more Majority Rules categories is hard. The last batch used most of the obvious "famous X"
groups, and politics is off-limits. The list below has 186 candidates and probably yields about 150. So there's
one decision for you (§3, Q1) on how to fill the gap. The recommended answer is given.

It goes live on the deploy after Phase 3's commit. **What needs you:** the §3 answers; an optional skim of the
candidate lists (Appendix A/B); the push/deploy.

---

## 1. Goal and scope

- **In scope:** add 200 standard and 200 Majority Rules categories to `data/category-blitz/category-pool.json`;
  rebuild `category-letter-index.json` and the cache with `npm run category-blitz:build`.
- **Out of scope:** any engine, scoring, UI, moderation or cadence change; editing or removing existing categories
  (except the `modes` tag if Andrew answers yes to Q1); changing the build thresholds (`--threshold=3`,
  `--set-size=12`); per-venue custom pools; `CATEGORY_TEST.md` rules (they already cover both modes).

## 2. Facts that shape the plan (checked 2026-10-19 at `1c50259`)

1. **Pool today:** 483 = 353 standard + 130 Majority Rules (`"modes": ["B"]`). Cache: 543 entries (the extra 60 are
   rejected candidates, kept on purpose). Both modes have all 18 letters usable.
2. **Categories per letter today** (standard / Majority Rules; a letter needs ≥12): A 113/66, B 238/95, C 309/107,
   D 153/85, **E 49/21**, F 148/72, G 69/35, H 153/67, **I 30/28**, L 127/67, M 200/88, **N 37/19**, **O 48/12**,
   P 304/101, R 125/60, S 314/113, T 235/90, W 129/67.
3. **What failed last time (and why it matters).** Narrow classes fail the ≥5-letter bar. Majority Rules
   rejects: pizza chain (2), coffee shop chain (3), popular candy (3), board game (3), reality TV show (3),
   game show (3), chef (3), nursery rhyme (3), Christmas movie (4), golfer (4), Star Wars character (4). Standard
   rejects: tropical fruit (2), type of chair (2), part of a newspaper (2), winter sport or activity (1), type of
   sweater (1), Japanese dish (3), nut (3), hotel chain (3). **Broad classes pass; anything with a short list of
   famous members fails.** The full list of rejects (with letter counts) is the cache entries that aren't in the
   pool; don't re-propose them.
4. **9 candidates are free and already pass.** These passed at exactly 5 letters but were cut for space last time,
   and their letters are cached, so they cost nothing: standard "A leafy green or lettuce", "A type of salad";
   Majority Rules "A famous fast food menu item", "A popular comfort food", "A famous TV sitcom", "A famous kids'
   TV show", "A famous duo or pair", "A famous 90s song", "A famous fairy tale". They're at the top of each appendix.
5. **Majority Rules rules** (`CATEGORY_TEST.md` "Majority Rules categories"): converge on the same few answers,
   one obvious spelling per answer, no politics (the moderator scores politicians 0), ≤ 40 characters,
   `"modes": ["B"]`. Answers are not checked for fit, only for safety.
6. **"Popular X" versions of standard classes** ("A popular fruit", "A popular dog breed") are the biggest
   untapped Majority Rules source, and they suit the mode ("what would everyone else say?"). They are not
   duplicates in practice: the two modes draw from separate indexes, so one can never sit on the same board as
   its standard twin. The build only refuses *exact* duplicate text. Caution: the word "popular" can shrink the
   letter count ("A popular candy" got 3 while the standard "A candy or sweet treat" passes), so expect some to fail.
7. **The build already supports dual tagging.** `"modes": ["A","B"]` puts a category in both indexes
   (`scripts/build-category-blitz-letter-index.cjs` L63–74). Retagging an existing category costs nothing, since
   its letters are cached by text. This is option (b) in Q1.
8. **Standard "Something…" categories.** The approved template is "Something with wheels", already joined by six
   from last batch ("Something with a screen"…). Appendix A has 40 more (colours, materials, qualities). They are
   broad, which is good for thin letters, but too many would make boards samey. Cap: at most 40 "Something…"
   categories in the final 200 (Q2). `CATEGORY_TEST.md`'s example *fail* is "Something **found in** a living room",
   so the candidates avoid the "found in" form (that wording appears only as "An item found in a [place]").
9. **Build mechanics (unchanged):** default model `claude-opus-4-8` (env `CATEGORY_BLITZ_LETTER_MODEL` overrides);
   API key name `ANTHROPIC_USERNAME_MODERATOR_API_KEY` is the one set; 256 max output tokens; concurrency 4;
   **`--dry-run` still calls the model and writes the cache** (it only skips the index). Last batch: 240 calls ≈
   100k input tokens. Never clear or hand-edit the cache or index.
10. **One test reads the real index:** `tests/lib.category-blitz-pool.test.ts` "Majority Rules respects a custom
    pool…" was relaxed last batch (any letter that fits the pool is accepted). It should hold, but run it.

## 3. Decisions

- **Made (Andrew, 2026-10-19):** add 200 standard + 200 Majority Rules, after committing the first 200 (done:
  `1c50259`).
- **Q1: how to fill a Majority Rules shortfall (Andrew to answer; recommended (b)).** If fewer than 200 new
  Majority Rules categories pass after Phase 1 plus one replacement round:
  - (a) keep writing narrower candidates until 200 pass (more model calls, and they'll be weaker);
  - **(b) recommended:** fill the gap by also tagging the best broad *existing* standard categories as Majority
    Rules (`"modes": ["A","B"]`). Rule: only ones with ≥10 cached letters and an obvious crowd answer (e.g. "A
    fruit", "A US state", "A color", "A dog breed"), no people or politics, at most 60. Zero model cost; the only
    "edit" to old entries is adding the tag (text and order unchanged);
  - (c) accept fewer than 200 for Majority Rules.
- **Q2: cap on "Something…" standard categories (recommended: 40 of the 200).**
- **Recommended:** Majority Rules O, N, E and I are the priority when trimming (fact 2); keep the §4 tie rules.
- **Carried over, still unanswered:** venues with their own custom category pool keep their list (default: they
  get no new categories).

## 4. Acceptance rules

- **Keep a candidate only if it has ≥ 5 letters** in the cache after the build (same bar as last time).
- **If more than 200 pass in a mode,** drop the lowest letter counts first. On a tie, keep the one that adds more
  of that mode's thin letters (standard: E I N O G; Majority Rules: O N E I G). Also drop near-duplicates of each
  other or of the same-mode pool (e.g. keep one of "A famous movie star" / "A famous action star" if space is short).
- **If fewer than 200 pass,** write replacements with the `CATEGORY_TEST.md` generation prompt (Majority Rules: its
  Majority Rules section), append, rebuild (only new text is billed), and repeat **once**. Then apply Q1.
- **Targets (the model decides letters, so these aren't hard gates):** Majority Rules O ≥ 20, N ≥ 25, E ≥ 28;
  standard I ≥ 40, N ≥ 45.
- **Final pool = 883** (553 standard + 330 Majority Rules). With Q1(b) it is 883 minus the number of retags
  (each retag counts toward Majority Rules' 330 without adding an entry). No existing entry's text changed, reordered or removed.

## 5. Phases

Each phase ends with its handoff note and a status-line update here.

### Phase 1 — Screen the candidates (Opus 5.5, medium effort)
1. Read `CATEGORY_TEST.md`, this plan and fact 3. Review Appendix A against Gate 1 and Appendix B against the
   Majority Rules section; swap weak ones. Leave the 9 free ones in.
2. Check for duplicates again against the pool *at that moment* (exact text, and text with a/an/type of/
   famous/popular/classic/common/piece of removed, same mode only) and length ≤ 40. The check script used to draft
   this plan is in Appendix C.
3. Confirm the key name (`cut -d= -f1 .env.local | sort`, names only) and that `claude-opus-4-8` still answers. If
   it doesn't, set `CATEGORY_BLITZ_LETTER_MODEL` to a current Opus **for new text only**; never clear the cache.
4. Append all candidates to the end of `category-pool.json` in the existing shape (`{ "text", "theme" }`, plus
   `"modes": ["B"]` for Majority Rules; reuse an existing `theme` value).
5. `npm run category-blitz:build:dry-run` (≈ 440 billed calls, the 9 free ones cost nothing). Save the per-letter
   output and each candidate's letter count in the handoff.

### Phase 2 — Select 200 + 200, final build, verify (Sonnet 5.5, medium effort)
1. Apply §4. Remove only rejected *new* candidates from the pool. One replacement round if short, then Q1.
2. `npm run category-blitz:build`. Record per-letter counts before/after in the handoff.
3. Check: pool size (§4), Majority Rules count 330, `git diff` on the pool shows only additions (plus `modes` retags
   if Q1(b)), `usableLetters` and `bUsableLetters` both 18.
4. `npx tsc --noEmit`, `npm run lint`, `npm run test`, then `npm run build` (never alongside typecheck).
5. Optional, **ask Andrew first** (live Haiku grading, writes and cleans test data in the shared production
   database): `npm run category-blitz:simulate`.

### Phase 3 — Commit and release (Sonnet 5.5, low effort)
1. Commit only the three `data/category-blitz/*.json` files, this plan and its handoffs (plus the test file if it
   changed). Leave unrelated working-tree edits out (on 2026-10-19 these were `CLAUDE.md`,
   `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`).
2. Push/deploy is Andrew's call. After deploy, watch one Majority Rules round on O or N if possible.
3. Cost follow-up: confirm the build bill was about $2 or less; per-round usage should be unchanged.

## 6. Open questions for Andrew

1. Q1 (§3): fill a Majority Rules shortfall by tagging the best existing standard categories as both modes?
   (Recommended: yes, up to 60.)
2. Q2 (§3): at most 40 "Something…" categories? (Recommended: yes.)
3. Custom-pool venues: still no new categories for them? (Default: yes, their list is theirs.)

---

## Appendix A — Standard candidates (262; keep the best 200)

**Free (cached, passed at 5 letters, trimmed for space last time) (2):** A leafy green or lettuce · A type of salad

**Colours (10):** Something that is red · Something that is green · Something that is yellow · Something that is blue · Something that is white · Something that is black · Something that is orange · Something that is pink · Something that is purple · Something that is brown

**Materials (8):** Something made of wood · Something made of metal · Something made of glass · Something made of plastic · Something made of paper · Something made of rubber · Something made of leather · Something made of cloth or fabric

**Qualities and features (22):** Something that is hot · Something that is cold · Something that is sharp · Something that is soft · Something that is sticky · Something that is heavy · Something that is shiny · Something that is fragile · Something with a lid · Something with a zipper · Something with legs · Something with strings · Something with a plug or cord · Something that uses batteries · Something with teeth · Something with a lock · Something that floats · Something that bounces · Something that melts · Something that rolls · Something that makes noise · Something that holds water

**Animals and nature (23):** An animal with fur · An animal with a shell · An animal with four legs · An animal with stripes or spots · An animal with claws · An animal that hibernates · An animal that eats insects · An animal that swims · An animal that lives in trees · An animal that hops or jumps · An animal found in a backyard · A swamp or wetland animal · A large animal · A small animal · A predator · A scavenger · A pest or vermin · A working animal · A songbird · A shrub or bush · A weed · A natural material · A natural resource

**Food (32):** A side dish · An appetizer · A street food · A party food · A picnic food · A food served at a barbecue · A food sold at a fair or carnival · A food sold at a ballpark · A sweet food · A salty food · A spicy food · A crunchy food · A frozen food · A canned food · A lunch food · A finger food · An American dish · A Greek dish · A Spanish dish · A Middle Eastern dish · A Southern US dish · A food made with flour · A food made with eggs · A food that grows on trees · A salad ingredient · A soup ingredient · A cooking ingredient · A flavor · A hot drink · A grilled food · A casserole or baked dish · A holiday food

**Items found in / sold in (38):** An item found in a refrigerator · An item found in a pantry · An item found in a lunchbox · An item found in a purse or handbag · An item found in a wallet · An item found in a car · An item found in a closet · An item found in an attic or basement · An item found in a backyard · An item found at the beach · An item found at a playground · An item found in a suitcase · An item found in a school locker · An item found in a nursery · An item found in a dorm room · An item found in a museum · An item found in a post office · An item found in a bank · An item found in a church · An item found in a police station · An item found in a salon or barbershop · An item found in a shed or workshop · An item found in a recording studio · An item found on a boat · An item found at a campsite · An item found at a wedding · An item found on a desk · An item found in a sewing kit · An item found in a tackle box · An item found in a makeup bag · An item sold in a gift shop · An item sold in a candy store · An item sold in an antique store · An item sold in a thrift store · An item sold in a health food store · An item sold in a coffee shop · An item sold in a hobby or game store · An item sold in a vending machine

**Parts of things (25):** A part of an animal's body · A part of a bird · A part of a fish · A part of the face · A part of a flower · A part of a kitchen · A part of a bathroom · A part of a city · A part of a hospital · A part of an airport · A part of a hotel · A part of a restaurant · A part of a website · A part of a song · A part of a story · A part of a movie · A part of a letter or email · A part of a meal · A part of a rocket or spacecraft · A part of a road or highway · A part of a neighborhood · A part of a playground · A part of a wedding · A part of a shopping mall · A part of a park

**Types, activities, sports (32):** A room in a house · A type of road or street · A type of light or lamp · A type of bed · A type of table · A costume · A type of party · A type of event · A type of school · A type of restaurant · A type of document · A medical tool or instrument · A computer accessory · A computer program or app · A road sign · A type of race · A holiday decoration · A household chore · An outdoor activity · An indoor activity · A summer activity · A team sport · An individual sport · A water sport · A sport played with a ball · A combat sport or martial art · A piece of farm equipment · A household item · A holiday tradition · A traffic or driving term · A liquid · A powder

**Terms and words (35):** A sports term · A basketball term · A golf term · A soccer term · A hockey term · A tennis term · A music term · A medical term · A computer term · An internet term · A money or finance term · A business term · A legal term · A science term · A theater term · A movie or film term · A fashion term · A sailing or nautical term · A military term · A literary term · A grammar term · An art term · An adjective · An adverb · An exclamation or interjection · A greeting or farewell · A word for a sound · A term of endearment · A title or honorific · A family member or relative · A smell or scent · A texture · A sound · A body movement or gesture · A skill or ability

**Jobs and people (16):** A job that requires a uniform · A job done outdoors · A job in a school · A job in an office · A job in sports · A job in a hotel · A job at an airport · A job in retail · A job working with animals · A job working with children · A job in TV or film · A job in a factory · A character in a fairy tale · A type of athlete · A position on a sports team · A type of musician

**Places (7):** A Canadian city · An African city · A city in California · A city in Texas · A city in Florida · A US city with a pro sports team · A tourist attraction

**Entertainment (named things) (12):** A movie · A TV series · A band or music group · A book title · A song title · A cartoon character · A video game character · A children's TV show · An actor or actress · A singer or musician · A professional athlete · A theme park ride or attraction

## Appendix B — Majority Rules candidates (186; all `"modes": ["B"]`)

**Free (cached, passed at 5 letters, trimmed for space last time) (7):** A famous fast food menu item · A popular comfort food · A famous TV sitcom · A famous kids' TV show · A famous duo or pair · A famous 90s song · A famous fairy tale

**Food and drink (popular versions of standard classes) (44):** A popular fruit · A popular vegetable · A popular pizza topping · A popular ice cream flavor · A popular dessert · A popular cocktail · A popular sandwich · A popular breakfast food · A popular snack food · A popular cheese · A popular pasta dish · A popular soup · A popular cake · A popular cookie · A popular pie · A popular bread · A popular sauce or condiment · A popular spice or seasoning · A popular seafood dish · A popular Mexican dish · A popular Italian dish · A popular Chinese dish · A popular Indian dish · A popular French food · A popular coffee drink · A popular wine · A popular party food · A popular street food · A popular side dish · A popular appetizer · A popular fried food · A popular junk food · A popular game day food · A popular fair or carnival food · A popular sweet treat · A popular drink · A popular baked good · A popular type of meat · A popular holiday food · A popular Southern food · A popular food to grill · A popular brunch food · A popular late-night food · A popular flavor

**Animals and nature (13):** A popular dog breed · A popular pet · A popular zoo animal · A popular farm animal · A popular sea creature · A popular bird · A popular insect or bug · A popular flower · A popular wild animal · A popular dinosaur · A popular tree · A popular houseplant · A famous mythical creature

**Things, activities, life (41):** A popular musical instrument · A popular kitchen appliance · A popular gadget or electronic device · A famous tech product · A popular hobby · A popular holiday · A popular style of dance · A popular music genre · A popular movie genre · A popular book genre · A popular art form · A popular college major · A popular job or career · A popular first job · A popular school subject · A popular Olympic sport · A popular sport to play · A popular outdoor activity · A popular summer activity · A popular weekend activity · A popular date night activity · A popular exercise or workout · A popular amusement park ride · A popular car model · A popular type of vehicle · A popular clothing item · A popular shoe style · A popular fashion accessory · A popular piece of jewelry · A popular piece of furniture · A popular tool · A popular piece of sports equipment · A popular piece of exercise equipment · A common last name · A popular nickname · A popular birthday gift · A popular holiday tradition · A popular Christmas decoration · A popular bar game · A famous game · A popular superpower

**Brands and stores (13):** A popular makeup or beauty brand · A popular electronics brand · A famous tech company · A popular phone or computer brand · A popular department store · A popular store or shop · A popular clothing store · A popular cleaning product brand · A popular household product brand · A popular frozen food brand · A popular toy brand · A popular airline · A popular TV channel

**Film and TV (23):** A famous 70s movie · A famous 2000s movie · A famous 2010s movie · A famous romantic comedy · A famous sports movie · A famous superhero movie · A famous Broadway musical · A famous teen movie · A famous family movie · A famous movie sequel · A famous cult classic movie · A classic kids' movie · A popular cartoon or animated show · A famous 70s TV show · A famous 80s TV show · A famous 2020s TV show · A famous Disney character · A famous Pixar character · A famous TV family · A famous movie hero · A famous book character · A famous book series · A famous fictional place

**Music (15):** A famous 60s song · A famous 70s song · A famous 2010s song · A famous dance song · A famous party song · A famous hip-hop song · A famous country song · A famous Disney song · A famous song from a movie · A famous female singer · A famous R&B singer · A famous guitarist · A famous 60s band or singer · A famous 70s band or singer · A famous 2000s singer or band

**Sports (6):** An NHL team · A famous soccer team · A famous sports team · A famous sporting event · A famous female athlete · A famous 90s athlete

**People (13):** A famous celebrity · A famous model · A famous fashion designer · A famous magician · A famous astronaut · A famous news anchor · A famous dancer · A famous movie star · A famous TV star · A famous action star · A famous children's author · A famous YouTuber or influencer · A famous child star

**Places (11):** A famous European city · A famous Asian city · A famous capital city · A famous island · A famous landmark · A famous US landmark · A famous university · A famous country · A famous European country · A popular US state · A famous theme or amusement park

Left out on purpose: anything politics-adjacent (presidents, world leaders, royals, billionaires/CEOs, historical
figures or events, religious figures), every reject listed in fact 3, and near-repeats of the existing 130.

## Appendix C — Duplicate/length check used to draft this plan

Put the candidates in `cands.json` as `{ "S": [...standard texts], "B": [...Majority Rules texts] }` (in the
scratchpad, not the repo), then run from the repo root:

```js
// node check.cjs <repo>/data/category-blitz/category-pool.json cands.json
const pool = require(process.argv[2]).categories;
const cands = require(process.argv[3]);
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "")
  .replace(/\b(a|an|the|type of|kind of|famous|popular|classic|common|piece of)\b/g, " ")
  .replace(/\s+/g, " ").trim();
const isB = (c) => (c.modes || []).includes("B");
const texts = new Set(pool.map((c) => c.text));
for (const mode of ["S", "B"]) {
  const same = new Map(pool.filter((c) => (mode === "B") === isB(c)).map((c) => [norm(c.text), c.text]));
  const seen = new Set();
  for (const t of cands[mode]) {
    if (t.length > 40) console.log(mode, "TOO LONG", t);
    if (texts.has(t)) console.log(mode, "EXACT DUP", t);
    if (same.has(norm(t))) console.log(mode, "NEAR DUP", t, "~", same.get(norm(t)));
    if (seen.has(norm(t))) console.log(mode, "DUP IN LIST", t);
    seen.add(norm(t));
  }
}
```

On 2026-10-19 it reported nothing for either list. Cross-mode near-duplicates ("A popular fruit" vs "A fruit")
are allowed on purpose (fact 6).
