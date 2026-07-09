# Category Blitz — Category Generation Test

Use this test to generate categories for Category Blitz. **Every category must pass BOTH gates below.** This is the canonical standard; the reusable generation prompt is at the bottom.

## Why two gates

Category Blitz is **letter-first**: each round picks **one usable letter**, then draws **12 categories at random** from that letter's vetted pool, and applies the letter to all 12 at once. The letter pool is 18 letters: **A B C D E F G H I L M N O P R S T W** (Q, U, V, X, Y, Z, J, K are excluded as too hard — see `LETTERS` in `lib/categoryBlitz.ts`).

A category only enters a letter's pool if it has an **abundance** of common answers for that letter (≥3), so a category never appears on a board for a letter where it's a dead end (e.g. "A US state" never appears under B, which has none, or P, which has only Pennsylvania).

So a good category must be (1) objective enough for an LLM to grade fairly, and (2) broad enough that whatever letter comes up, most players can think of an answer. A category can be perfectly objective and still be terrible for the game if it has too few members (e.g. "a position on a baseball field" — 9 fixed answers, dead on most letters).

## Gate 1 — The Is-A Test (objective)

The statement **"[Player's Answer] IS A(N) [Category]"** must rely on a direct, universally accepted, *definitional* fact.

- PASS: "A tree" (An oak IS A tree — definitional). "A bone in the human body" (The femur IS A bone in the human body — definitional).
- FAIL: "Something found in a living room" (situational — a dog, a shoe, a cup could all be there). "A scary animal" (opinion). "Things you take to the beach" (scenario-based).

## Gate 2 — The Letter-Coverage Test (broad)

Mentally walk all 18 game letters and try to name **one common answer starting with each**:

> A B C D E F G H I L M N O P R S T W

The category PASSES if you can fill **at least ~10 of the 18 letters** with answers a typical adult would recognize. A moderately narrow category like "a bone in the human body" (~8) or "a type of cake" (~10) is still safe, because the letter-first build only ever pairs a category with letters where it has an abundance of answers — it simply won't appear on boards for its weak letters. Reserve rejection for genuinely closed rosters — a position on a baseball field, a planet — which clear the abundance bar for too few letters (a category needs enough abundant letters to be worth including at all).

Practical proxy: the category should be an **open class with roughly 40+ real-world members** (ideally hundreds), not a closed/fixed roster.

**IMPORTANT — this reverses the old, wrong guidance.** An earlier version of this test told the model to keep categories to "15–60 answers, not too broad like Animals." That is backwards for this game. A one-letter-per-round game needs *broad* open classes. "Animals" only fails because it's slightly fuzzy at the margins — but "A bird species," "A tree," "A fish species," "A fruit" are both objective AND broad, which is exactly the sweet spot. Prefer broad.

### Broad category families that reliably pass both gates

- **Living things:** a bird species, a fish species, a wild mammal, a tree, a flower, an insect, a dog breed, a cat breed, a snake species, a reptile, a breed of horse, a dinosaur.
- **Foods & drinks:** a fruit, a vegetable, a type of cheese, a spice or seasoning, a type of pasta, a dessert, a type of bread, a type of soup, a candy, a cocktail, a type of coffee drink, an alcoholic beverage, a national cuisine.
- **Human body:** a bone in the human body, a muscle in the human body, an organ in the human body, a part of the human body.
- **Commercial inventories (templated & reliably broad):** "an item sold in a [hardware / grocery / office supply / pharmacy / pet / toy / clothing / garden] store," "an item found in a [kitchen / bathroom / garage / office / classroom / hospital]."
- **Parts of large systems:** a part of a [motor vehicle / desktop computer / house / bicycle / airplane / ship / guitar / camera / tree].
- **Everyday objects:** a tool, a kitchen utensil, a musical instrument, an article of clothing, a piece of furniture, a household appliance, a gemstone, a metal, a type of fabric, a type of bag, a mode of transportation.
- **Geography:** a country, a city, a river, a capital city, a language, a US state, an island, a mountain range, a body of water, a nationality.
- **Misc broad:** an occupation, a sport, a color, a type of rock or mineral, a type of dance, a crop grown by farmers.

### Category families to AVOID (fail Gate 2 even when objective)

- Fixed sports rosters: positions on a baseball/football/etc. field, weight divisions.
- Small closed sets: parts of a flower, branches of the military, cabinet departments, planets, oceans, days/months.
- Anything so specialized it clusters on a few letters: a type of igneous rock, a spider family, a pastry-kitchen rank.

## Workflow: pool → build → letter index

The canonical library is **`data/category-blitz/category-pool.json`** — a flat list of categories. To add categories, append them there (the optional `theme` tag is a legacy field, unused by the letter-first build). Only add; keep existing good categories.

`data/category-blitz/category-letter-index.json` is **generated**, never hand-edited. Run:

```
npm run category-blitz:build            # resolve abundant letters + build the letter → categories index
npm run category-blitz:build:dry-run    # preview per-letter counts without writing
```

### How the letter index is built (abundance)

For each distinct category the build asks the model which of the 18 letters have an **abundance** of common answers — at least `--threshold` (default 3) different common answers that IS-A a member of the category and start with that letter. A single well-known answer does NOT qualify the letter (this is what keeps "P" for "A US state" out). The results are inverted into `letters[L] → [categories]`, and `usableLetters` is the set of letters with at least `--set-size` (default 12) categories — the only letters a round may draw. A cache (`data/category-blitz/letter-cache-abundant.json`) keyed by category text means unchanged categories are never re-billed — this is what makes scaling to thousands cheap.

At round time (`lib/categoryBlitz.ts`) the runtime picks a usable letter (avoiding letters already used earlier in the session), shuffles that letter's category pool, and takes 12 — so boards are freshly assembled every round.

## Reusable generation prompt

> You are generating categories for "Category Blitz," a game where each round picks ONE random letter (from A B C D E F G H I L M N O P R S T W — 18 letters) and applies it to all categories at once. Generate [N] unique categories. Each MUST pass BOTH gates:
>
> **Gate 1 (Is-A / objective):** "[Answer] IS A(N) [Category]" must be definitionally true, never situational or opinion-based.
>
> **Gate 2 (Letter coverage / broad):** For the 18 letters above, you must be able to name a common answer for at least ~10 of them. Prefer broad open classes (a bird species, a fruit, an item sold in a hardware store, a part of a car). Reject only genuinely closed rosters (a baseball position, a planet) that cluster on a few letters.
>
> For each candidate, silently walk the 18 letters and count how many you can fill; only output categories that reach ~10+. Output a clean numbered list, no preamble.
>
> (Add the results to `data/category-blitz/category-pool.json`, then run `npm run category-blitz:build` to compose sets and compute each set's `allowedLetters`.)
