# Category Blitz How-to-Play Plan — Phase 2 Handoff (Tutorial cards + local-build fix)

**Date:** 2026-10-14 · **Plan:** `docs/category-blitz-how-to-play-plan.md` · **Phase 2 status:** built and
tested locally. **Not committed, not pushed, not deployed.** Phase 1 is committed as `b1030fd`.

## For Andrew (plain English)

- **The Category Blitz tutorial now has your 7 cards** (intro + 6), word for word. The small labels like
  "What is it?" are gone. On every card the text sits above the picture, in larger type than before.
- **New pictures for cards 3–6:**
  - Card 3: a stopwatch reading "3:00".
  - Card 4: modelled on your example. "BIRDS" sits in the middle, with "Ostrich" (Sam) and "Owl" (Jess) on either side, each under a "+2" burst.
  - Card 5: the same layout. "FRUIT" in the middle, "Prickly Pear" (Maya) with "+2" plus an amber "+1 alliteration bonus" tag, and "Peach" (Leo) with "+2".
  - Card 6: a small Majority Rules example in the Majority Rules colours. Animal → Alligator, 5 players said it → +5 pts.
- **The page dots under the card are now real small dots.** They used to render as big squares, because the
  tap-target styling enlarged the dot itself. With 7 cards they would have run off small phones. Each dot still
  has a full-size tap area.
- **Your local `npm run build` works again.** `tmp` is now excluded from `tsconfig.json`, so the type check
  skips the git-ignored Speed Trivia probe in `tmp/`. That probe file itself wasn't touched.
- **Phase 1 is committed** (`b1030fd`). Phase 2 is not committed yet: committing, pushing and deploying are
  your call.

## Follow-up tweaks (2026-10-14, Andrew's review)

- Cards 4, 5 and the last card now show **cartoon people** (Sam, Jess, Maya, Leo, Kai) instead of animal faces.
  `PersonFace` / `PERSON_LOOKS` in `CategoryBlitzTutorialArt.tsx` replaced the critter faces; there are 4 hair styles and varied skin tones.
- Cards 4 and 5: the category is no longer in the middle. It is a **"CATEGORY  BIRDS" / "CATEGORY  FRUIT" banner
  above both answers**, and the two answers sit in a 2-column grid under it.
- The last card's small text is larger. The paragraph went from `clamp(0.95rem,4vw,1.1rem)` to
  `clamp(1.05rem,4.6vw,1.2rem)` in `CategoryBlitzStatementPanel` (`GameIdentityPanel.tsx`). Only that card has a
  `detail`. The "5 players said it / +5 pts" line went from 13px to 15px.
- Andrew: **card 5's bonus pill is fine as is.** That question is closed.
- Re-checked: tsc clean, eslint clean, full vitest 4,400 pass / 13 skip / 0 fail. Screenshots of cards 4–6 at 320×568
  and 390×844 (scratchpad clone, Reduce Motion) show no overflow.

## For the next agent

### 1. Next phase goal and scope

**Phase 3 — Rules popup, footer removal, lobby-flash fix** (plan §5 Phase 3). Model: **Claude Sonnet 5.5,
effort medium.** The popup must read the rules list from `CATEGORY_BLITZ_RULES` in
`lib/categoryBlitzHowToPlay.ts`. Don't restate the rules anywhere else.

Out of scope: the letter band (Phase 4), sleep-when-idle (Phase 5), the cleanup of old rounds (Phase 6). Leave
the other games' tutorial cards alone, and `app/info/page.tsx` marketing copy too (plan names only
`app/faqs/page.tsx`).

### 2. Starting state

- Branch `category-blitz-scoring-cadence`. Commits on it: `b1030fd` (Phase 1 + plan + Phase 1 handoff + card-4
  example image). **Phase 2 is uncommitted.** Phase 2 files:
  - new: `lib/categoryBlitzHowToPlay.ts`, `components/venue/CategoryBlitzTutorialArt.tsx`,
    `tests/lib.category-blitz-how-to-play.test.ts`, this handoff
  - modified: `lib/venueGameCards.ts`, `components/venue/GameIdentityPanel.tsx`,
    `components/venue/CategoryBlitzOnboardingOverlay.tsx`, `lib/categoryBlitzModes.ts`, `lib/categoryBlitz.ts`,
    `tsconfig.json`, `docs/category-blitz-how-to-play-plan.md`
- The working tree still has Andrew's unrelated Speed Trivia changes. One of them, `components/venue/venueHubShared.tsx`,
  is in `components/venue/` but **isn't Phase 2's**: don't stage it. Stage by path only, never `git add -A`,
  never `git checkout -- <file>`.
- No data touched. No production access in this phase.

### 3. Decisions made (don't re-ask)

- Andrew (2026-10-14): commit Phase 1 on its own (done). Fix the local build. He picked no particular
  option, so the least invasive one was used: `"tmp"` in `tsconfig.json` `exclude`. The probe file was not edited
  or moved. Plan §5 Phase 2 step 0 records this.
- Card 5's "+1 alliteration bonus" is an **amber glowing pill** above the "+2" burst, not a second radiating burst.
  At 221px of usable width, burst text that long was unreadable. The colour differs from the white +2 burst, as
  §3 asks. Change it only if Andrew asks.
- Card 2 kept 6 answer rows. The plan allowed trimming to 4, but 6 fit at 320×568.
- The answer chips use the body font, not a handwritten one (plan: no new webfont).
- The scoring numbers moved to the client-safe `lib/categoryBlitzModes.ts`, so the copy and the server read the
  same constants: `POINTS_PER_UNIQUE_ANSWER` and `minPlayersToScoreFor(mode)`. `lib/categoryBlitz.ts` now imports
  them. Behaviour is unchanged: 2 points, minimum 3 players (2 in Majority Rules).

### 4. What changed and how it fits

- `lib/categoryBlitzHowToPlay.ts`, the single source:
  - `CATEGORY_BLITZ_TUTORIAL_CARDS`: 7 × `{ art, statement, detail? }`. Card 6 is statement "Be careful!" plus
    the rest as `detail`, with the words unchanged.
  - `CATEGORY_BLITZ_RULES`: the 7 rules from §3. Numbers are interpolated from `POINTS_PER_UNIQUE_ANSWER`,
    `ALLITERATION_BONUS_POINTS`, `MAJORITY_RULES_EVERY_N_ROUNDS` and `minPlayersToScoreFor`.
- `lib/venueGameCards.ts`:
  - `GameOnboardingStep.stepLabel` and `.body` are now optional, and `steps` is `GameOnboardingStep[]` (it was a
    3/4-tuple).
  - The `category-blitz` entry builds `steps` (heading = statement, body = detail) and `rules` from the source.
  - The rules lose their old leading "-". Both consumers, `LobbyScreen` in `CategoryBlitzGame.tsx` ~L620 and
    `GameRuleCardPanel`, strip it anyway.
- `components/venue/GameIdentityPanel.tsx`:
  - `GameOnboardingCard` renders `CategoryBlitzStatementPanel` for Category Blitz: statement on top, then art.
    The intro centres its statement.
  - The old `CategoryBlitzIllustration` and its `CB_*` helpers were deleted, and the dead Category Blitz
    branches inside the shared layout were removed. The other games' markup is unchanged.
  - `renderBody` accepts `undefined`.
- `components/venue/CategoryBlitzTutorialArt.tsx`:
  - All the card art: `CategoryBlitzTutorialArt({ art })`.
  - Inline SVG for the stopwatch, the bursts and five cartoon person faces (`PersonFace`).
  - The stopwatch hand spins only under `motion-safe:`.
  - Tailwind only, no inline `style`.
- `components/venue/CategoryBlitzOnboardingOverlay.tsx`:
  - Each dot is now a transparent 44px `tp-player-hit-target` button (the `tp-clean-button` class was dropped,
    because its `!important` border would show) wrapping a small `<span>` dot, with `aria-current="step"` on
    the active one.
  - The dot row has no gap: 7 × 44 = 308px, exactly the 320px phone's usable width.
  - The paddings above the dots and the buttons shrank slightly.

### 5. Facts and traps

- `.tp-player-hit-target` forces `min-width/height: 44px !important`. Any visual dot or icon needs to sit
  **inside** that box, not be the box. This is why the old dots were big squares.
- Phones ≤380px use a 13px root, so `rem` widths shrink there. Art sizes use px arbitrary values on purpose
  (`w-[76px]`, `text-[16px]`).
- The card caps at `22.5rem` wide, so on a 430px phone it's 315px wide with empty space around it. That
  predates this phase and was left alone.
- **Scratchpad dev server:** Turbopack refuses a symlinked `node_modules` ("points out of the filesystem
  root"). Use `npx next dev --webpack -p 3123`. When rsync-ing the tree, `--exclude native` also drops
  `components/native` and `lib/native*` dirs. Use `--exclude /native`.
- The throwaway harness page was `app/privacy/cbtest/page.tsx`. `/privacy` is a public prefix in `proxy.ts`, so
  it needs no cookies. It exists **only in the scratchpad clone**, never in the repo.

### 6. Build, run, test — what was verified

- `npx tsc --noEmit`: 0 errors, including the repo-wide run now that `tmp/` is excluded.
- `npx eslint` on every changed file: clean.
- `npx vitest run`: **371 files passed, 1 skipped; 4,400 tests passed, 13 skipped, 0 failed.** This includes the
  new `tests/lib.category-blitz-how-to-play.test.ts` (verbatim card text, steps and rules from one source, the
  numbers in the rules, other games keep their labels) and the text-size-floor contract.
- `npm run build`: **green**, 204 pages. It was red before only because of `tmp/`.
- **Fit check:**
  - Headless Chromium on the scratchpad clone (no `.env.local`, port 3123, Reduce Motion on) stepped through all
    7 cards at 320×568, 375×667, 390×844 and 430×932.
  - A script checked that no element sits outside the card and that nothing overflows the inner panel. Result:
    zero overflow everywhere.
  - Screenshots were inspected for 320 (cards 1–7) and 430 (card 7). They're in the session scratchpad, not the repo.
- **Not verified:**
  - A real phone, so text readability and how the dot taps feel are unchecked. That's Phase 7's device checklist.
  - The overlay opened from the real venue home. The harness rendered the same component directly.
  - The `verify` skill was not run, because it writes production rounds. Phase 7 owns it.

### 7. Open questions for Andrew

- Commit Phase 2 now, or bundle it with Phase 3?
- Still open from plan §7: an optional daily prune of empty rounds. Ask before adding it.

### 8. Recommended first steps for Phase 3

1. `git status`: confirm the branch and the Phase 2 files above. Ask Andrew whether to commit Phase 2 first.
2. Build `CategoryBlitzRulesSheet` on `OwnerSheet size="card"` and render `CATEGORY_BLITZ_RULES` as a numbered
   list. Check `tests/native-back-review-fixes.test.ts` for the popup list.
3. The lobby-flash fix and footer removal are in `components/category-blitz/CategoryBlitzGame.tsx` (plan §4
   line refs; Phase 1 shifted them by a few lines).
4. `app/faqs/page.tsx` L46–48: the FAQ copy can quote `CATEGORY_BLITZ_RULES[4]` and `[5]`, so it stays in sync.
5. Model: Claude Sonnet 5.5, effort medium.
