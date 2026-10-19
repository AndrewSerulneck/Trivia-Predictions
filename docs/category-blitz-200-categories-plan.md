# Category Blitz — add 200 categories (100 standard + 100 Majority Rules)

> **Status (2026-10-19):** All phases done. Committed locally on `main`, **not pushed**. Pool is 483 (353 standard +
> 130 Majority Rules), all 18 letters usable in both modes. Waiting on Andrew: push/deploy, then watch one Majority
> Rules round. Final handoff: `docs/category-blitz-200-categories-plan_PHASE_3_HANDOFF.md`. Follow-up:
> `docs/category-blitz-400-categories-plan.md`.
> Phases end with `docs/category-blitz-200-categories-plan_PHASE_<N>_HANDOFF.md`.

## For Andrew (plain English)

We'll add 200 categories: 100 for normal rounds and 100 for Majority Rules rounds (every 5th round).
We follow the existing recipe in `data/category-blitz/CATEGORY_TEST.md`: write the categories into the
category library, then run the build script. The script asks Claude which letters each category works
for, and the game only puts a category on a board when its letter has at least 3 common answers.

What it costs: one build run of about 240 small Claude calls, **under $1, paid once**. Nothing about the
game's running cost changes: no new database reads, scheduled jobs or per-round calls.

What it fixes: Majority Rules rounds can only use **9 of the 18 letters** today (B C D F L M P S T),
because there are only 30 Majority Rules categories and 6 of them never appear at all. With 100 more,
most letters should open up. Normal rounds gain variety on their thin letters (I, N, O, E).

It goes live on the next deploy after the commit. **What needs you:** optional skim of the candidate
lists (Appendix A/B); the deploy itself; and the one decision in §3 (recommended answer given).

---

## 1. Goal and scope

- **In scope:** append 100 standard (`"Be Unique!"`) and 100 Majority Rules (`modes: ["B"]`) categories to
  `data/category-blitz/category-pool.json`; regenerate `category-letter-index.json` and the cache with
  `npm run category-blitz:build`; add a short "Majority Rules categories" section to `CATEGORY_TEST.md`,
  because the record has no Majority Rules guidance today.
- **Out of scope:** any engine, scoring, UI, moderation or cadence change; editing or removing existing
  categories; changing build-script thresholds (`--threshold=3`, `--set-size=12`); per-venue custom pools.

## 2. Facts that shape the plan (checked 2026-10-18 at commit `78198b7`)

1. **Pool today:** 283 categories = 253 standard + 30 Majority Rules (`modes: ["B"]`, none tagged both).
   Max text length is 40 characters. Keep new ones ≤ 40 so they fit the board cards.
2. **Letter coverage today** (standard / Majority Rules categories per letter; a letter needs ≥12 to be
   drawable): A 79/11, B 169/18, C 219/20, D 108/14, **E 35/5**, F 95/13, **G 54/5**, H 109/11,
   **I 22/4**, L 88/13, M 146/14, **N 25/5**, **O 34/1**, P 212/20, R 85/10, S 219/17, T 164/16, W 87/10.
   All 18 letters are usable for standard; only BCDFLMPST for Majority Rules.
3. **Opinion-only Majority Rules categories fail the letter build.** "An underrated movie", "An annoying
   rapper", "A washed-up celebrity", "A boring vacation destination" and "A celebrity power couple" scored
   0 letters, "A boring hobby" 1. These never appear. "A famous X" categories with a real-world
   roster score 9–16 letters. **So new Majority Rules categories must name a real class with famous
   members** (brands, titles, teams, famous people in entertainment or sports), not a pure opinion.
4. **Majority Rules answers are not checked for fit.** In a reverse round the fit check (does the answer
   belong in the category?) is replaced by a safety moderator (`moderateAnswersWithLLM`,
   `lib/categoryBlitz.ts` ~L278). Points = number of players who typed the same normalised answer
   (`normalizeAnswer`, ~L112: lowercase, no punctuation, drops the/a/an/city/state/of/and).
   - **The moderator scores every politician 0** ("politician, elected/appointed official… hot-button
     topic"). So no Majority Rules category whose common answers are politicians (presidents, world
     leaders, historical figures). This is why the candidate list has none.
   - "Tom Brady" and "Brady" don't match, so the crowd splits. Prefer categories whose answers have one
     obvious form (brands, titles, teams, one-name celebrities). Some people categories are fine; don't
     make them the majority.
5. **Normal rounds are graded by the fit test** ("[answer] IS A [category]", Haiku). New standard
   categories must pass Gate 1 (definitional, not situational/opinion) of `CATEGORY_TEST.md`. Its own
   example fail is "Something found in a living room", yet "An item found in a [kitchen…]" is an
   approved template. The candidates use only the approved templates.
6. **The build script** (`scripts/build-category-blitz-letter-index.cjs` + `scripts/lib/category-blitz-letters.cjs`):
   - Asks the model per category (default `claude-opus-4-8`, override `CATEGORY_BLITZ_LETTER_MODEL`),
     max 256 output tokens, concurrency 4. Caches by exact category text in `letter-cache-abundant.json`.
   - **`--dry-run` still calls the model and still writes the cache.** It only skips writing the index.
   - Fails on exact-duplicate category text. It does not catch near-duplicates (the candidate lists were
     checked against the pool by hand-written script; see §6).
   - Standard index = every category without `modes` (or with `"A"`); Majority Rules index = `modes`
     including `"B"`. New Majority Rules entries use `"modes": ["B"]`, exactly like the existing 30.
7. **Runtime:** `lib/categoryBlitz.ts` (scheduled engine) and `lib/categoryBlitzPool.ts` (continuous)
   import the index JSON at build time, server-side only. A Majority Rules round with no full B board
   falls back to the standard index (`assembleContinuousBoard`). New categories go live on deploy.
8. **Per-venue custom pools:** a venue whose `category_blitz_continuous_config` row sets a custom
   category pool only draws from that list, so it won't see the new categories. Venues with no row get
   the global pool.

## 3. Decisions

- **Made (Andrew, 2026-10-18):** 100 standard + 100 Majority Rules, following `CATEGORY_TEST.md`.
- **Recommended, Andrew may override:** Majority Rules categories are `["B"]` only (not also standard),
  matching the existing 30 and the "100 + 100" split. They are "famous/popular X" classes, not
  opinions (fact 3), and contain no politics (fact 4).
- **Recommended:** Rejected candidates stay in `letter-cache-abundant.json`. `CATEGORY_TEST.md` says the
  cache is never hand-edited; the leftover entries are harmless (the index only reads pool texts) and
  stop a later agent from paying again for a candidate that already failed.

## 4. Acceptance rules

- **Keep a candidate** only if it has **≥ 5 letters** in the cache after the build. The existing
  Majority Rules categories that actually appear in rounds have 4–16.
- **If more than 100 pass in a mode**, drop the lowest letter counts first. On a tie, drop the one that
  adds fewer of that mode's thin letters (standard: E G I N O; Majority Rules: any letter outside
  BCDFLMPST). Also drop near-duplicates of one another (e.g. keep one of "A famous band" / "A famous rock
  band" if both pass and space is short).
- **If fewer than 100 pass**, write replacements with the generation prompt in `CATEGORY_TEST.md` (for
  Majority Rules, the §5 rules), append, rebuild (only the new text is billed), and repeat.
- **Targets, not hard gates** (the model decides letters): Majority Rules usable letters go from 9 to
  ≥ 15 of 18. Standard E, I, N, O each gain ≥ 10 categories.
- Final pool = exactly **483** categories (253 + 100 standard, 30 + 100 Majority Rules). No existing entry
  changed, reordered or removed.

## 5. Majority Rules gate (to add to `CATEGORY_TEST.md` in Phase 1)

A Majority Rules category must:
1. **Converge:** a room of adults would mostly give the *same* handful of answers per letter. It names a
   real class with famous members ("A fast food chain", "A famous 90s movie"), not an opinion
   ("An overrated movie"); opinion-only ones fail the letter build.
2. **Have one obvious way to write each answer** where possible (brands, titles, teams, one-name stars),
   because matching is exact after normalising.
3. **Stay out of politics:** no category whose common answers are politicians, officials or hot-button
   topics, because the moderator scores those 0. Also nothing that invites explicit answers.
4. Clear the same letter bar (≥3 common answers per letter, the build decides), be ≤ 40 characters, and
   be tagged `"modes": ["B"]`.

## 6. Phases

Each phase ends with its handoff note (`…_PHASE_<N>_HANDOFF.md`) and a status-line update here.

### Phase 1 — Append candidates and screen them (Opus 5.5, medium effort)
1. Read `CATEGORY_TEST.md` and this plan. Do a final judgment pass over Appendix A/B against Gate 1
   (standard) and §5 (Majority Rules); swap any weak candidate for a better one.
2. Re-run the duplicate/length check: compare every candidate to the current pool (exact text, and the
   text with "a/an", "type of", "famous/popular/classic" removed) and confirm length ≤ 40.
3. Check that a usable API key name exists (names only: `cut -d= -f1 .env.local | sort`; the script
   accepts `ANTHROPIC_API_KEY`, `CATEGORY_BLITZ_ANTHROPIC_API_KEY` or `ANTHROPIC_USERNAME_MODERATOR_API_KEY`),
   and that `claude-opus-4-8` still answers. If it doesn't, set `CATEGORY_BLITZ_LETTER_MODEL` to a
   current Opus model **for the new categories only**. Never clear the cache to re-judge old ones.
4. Append all candidates to the end of `category-pool.json`, keeping the existing shape
   (`{ "text", "theme" }`, plus `"modes": ["B"]` for Majority Rules). `theme` is a legacy tag; reuse an
   existing value (`food`, `living`, `commerce`, `parts`, `object`, `entertainment`, `misc`…).
5. Run `npm run category-blitz:build:dry-run` (about 240 calls, <$1). Save its output to the handoff.
6. Add the §5 section to `CATEGORY_TEST.md`.

### Phase 2 — Select 100 + 100, final build, verify (Sonnet 5.5, medium effort)
1. Apply §4 to the cache results; remove only rejected *new* candidates from the pool. If either mode is
   under 100, write replacements, append and dry-run again.
2. `npm run category-blitz:build`. Record the per-letter counts before and after in the handoff.
3. Check: the pool has 483 entries, 130 with `modes: ["B"]`. `git diff` on the pool shows only additions.
   The index's `usableLetters` still has all 18. `bUsableLetters` should grow (§4 target).
4. `npx tsc --noEmit`, `npm run lint`, `npm run test` (the pool and continuous-engine tests read the
   index), `npm run build` (not at the same time as typecheck).
5. Optional, **ask Andrew first** (it plays real rounds with live Haiku grading and seeds and cleans
   test data in the shared production database): `npm run category-blitz:simulate`.

### Phase 3 — Commit and release (Sonnet 5.5, low effort)
1. Commit only `data/category-blitz/category-pool.json`, `category-letter-index.json`,
   `letter-cache-abundant.json`, `CATEGORY_TEST.md`, this plan and its handoffs. The working tree already
   had unrelated uncommitted edits (`CLAUDE.md`, `docs/pos-rewards-integration-plan.md`,
   `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`); leave them out.
2. Push and deploy are Andrew's call. After the deploy, play or watch one Majority Rules round and check
   the board is drawn from the new letters.
3. Cost follow-up: no recurring change is expected. Confirm the build bill matched the estimate and
   that `category_blitz_moderation` / grading usage per round looks the same as before.

## 7. Open questions for Andrew

1. OK to keep Majority Rules categories "famous/popular X" only, with no new opinion categories?
   (Recommended: yes. Fact 3 shows opinion ones mostly never appear.)
2. Should any venue with a custom category pool get the new ones? (Default: no; their list is theirs.)

---

## Appendix A — Standard candidates (120; keep the best 100)

Food & drink: A nut · A tropical fruit · A root vegetable · A leafy green or lettuce · A type of cookie ·
A type of sausage · A type of salad · A type of wine · A type of beer · A fried food · A Mexican dish ·
An Italian dish · A Chinese dish · A Japanese dish · An Indian dish · A French dish · A rice dish ·
A noodle dish · A cut of meat · A potato dish · A food made from corn · A type of pastry · A dip or spread ·
A non-alcoholic drink · A street food · A baking ingredient · A cooking method · An appetizer

Living things: A name for a baby animal · An animal native to North America · An animal native to South
America · An animal native to Asia · A fruit tree · An animal sound

Body & health: A symptom of illness · A type of injury · A medical procedure or surgery

Store and room templates: An item sold in a convenience store · …an electronics store · …a craft store ·
…an auto parts store · …a department store · …a liquor store · …a camping store · An item sold at a
farmers market · An item sold in a home goods store · …a baby store · …a dollar store · …a party supply
store · An item found in a bedroom · …a laundry room · …a hotel room · …a doctor's office · …a dentist's
office · …an art studio · …a fire station · …a toolbox · …a first aid kit · …a backpack · …a restaurant ·
…a bar or pub · …an airport · …a movie theater

Parts of things: A part of a train · …a motorcycle · …a smartphone · …a plant · …a newspaper · …a shirt or
jacket · …a stadium or arena · …a school · …a farm · …a garden · A key on a computer keyboard

Everyday objects: A type of chair · A type of knife · A type of drinking glass · A type of pants · A type
of shirt or top · A hairstyle · A type of house or home · A type of store or shop · A geometric shape ·
A cleaning product or supply · A piece of camping gear · A piece of cookware or bakeware · A paper
product · A pattern or print on fabric

"Something…" (same template as the existing "Something with wheels"): Something with a screen ·
Something with a motor or engine · Something with buttons · Something with a handle · Something that
flies · Something that is round

Named things: A car model · An airline · A clothing brand · A tech company · A retail store chain · A
hotel chain · A college or university · A Broadway musical · A magazine · A TV network or channel · An
animated TV show · A fictional place · A Latin American city

Language, science, misc: A branch of science · An emotion or feeling · A personality trait · An action
verb · A compound word · A hobby or pastime · A genre of book or literature · A school subject · An
object found in outer space · A boy's name · A girl's name · A baseball term · A football term

## Appendix B — Majority Rules candidates (120; keep the best 100; all `"modes": ["B"]`)

Brands & food: A fast food chain · A sit-down restaurant chain · A pizza chain · A coffee shop chain ·
A famous fast food menu item · A soda or soft drink brand · A beer brand · A liquor brand · A popular
candy · A breakfast cereal · A potato chip or snack brand · A famous food brand · A famous brand · A
famous brand mascot · A sneaker or shoe brand · A luxury fashion brand · A popular car brand · A store
you'd find at the mall · A grocery store chain · A popular smartphone app · A popular website · A
classic toy from childhood · A popular board game · A popular video game · A drink you'd order at a bar ·
A popular bar food · A popular comfort food · A popular Thanksgiving dish · A popular Christmas gift ·
A popular Halloween costume

Film & TV: A famous movie · A famous TV show · A famous Disney movie · A famous animated movie · A famous
horror movie · A famous Christmas movie · A famous movie franchise · A famous action movie · A famous
comedy movie · A famous sci-fi movie or show · A famous 80s movie · A famous 90s movie · A famous movie
musical · A famous TV sitcom · A famous TV drama · A famous reality TV show · A famous kids' TV show · A
famous TV game show · A famous 90s TV show · A famous villain · A famous TV character · A famous movie
character · A famous cartoon character · A famous video game character · A famous Star Wars character ·
A famous Harry Potter character · A famous Simpsons character · A famous Marvel or DC character · A
famous TV mom or dad · A famous princess · A famous monster · A famous fictional detective · A famous
fictional animal · A famous duo or pair

Music: A famous rock band · A famous band · A famous boy band or girl group · A famous rapper or hip-hop
artist · A famous country singer · A famous pop star · A celebrity known by one name · A famous 80s or 90s
music artist · A famous song · A famous rock song · A famous love song · A famous Christmas song · A
famous karaoke song · A famous 80s song · A famous 90s song · A famous 2000s song · A famous album · A
famous Beatles song · A famous dance move or dance craze

Sports: An NFL team · An NBA team · A Major League Baseball team · A college sports team · A famous NFL
player · A famous NBA player · A famous baseball player · A famous hockey player · A famous golfer · A
famous tennis player · A famous soccer player · A famous boxer or fighter · A famous pro wrestler · A
famous Olympian · A famous coach · A famous NASCAR or racecar driver · A famous sports stadium or arena ·
A popular sport to watch

People, places, stories: A famous talk show host · A famous game show host · A famous comedian · A famous
chef · A famous reality TV star · A classic Hollywood movie star · A famous poet · A famous city · A
popular vacation destination · A famous natural wonder · A famous urban legend or myth · A famous fairy
tale · A famous nursery rhyme · A famous children's book · A famous novel · A popular baby name · A
popular pet name · A popular slang word · A classic playground or party game

Dropped on purpose (answers are mostly politicians, which the moderator scores 0): A US president, A
famous world leader, A famous king or queen, A famous historical figure, A famous historical event, A
famous billionaire or CEO.
