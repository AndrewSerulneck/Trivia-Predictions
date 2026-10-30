# Category Blitz Letter Die — Phase 8 handoff (board cascade without a remount)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md`

## For Andrew (plain English)
- **What changed:** after the die lands, the 12 categories slide in. If you tapped a category while they were
  still sliding, the keyboard used to open and then **close by itself about a second later, mid-word**, and the
  screen could jump. Now the rows that slide in are the same rows you type in for the whole round, so the
  keyboard stays open and what you typed stays. The top bar also shrinks for typing as quickly as it did before
  the die (after about half a second, not 1.2 seconds).
- **Live?** No. Nothing committed, pushed or deployed (main is frozen for App Store review). No cost, no database
  or server change.
- **Needs from you:** nothing now. In Phase 11 on your phone: tap a category while they are still sliding in. The
  keyboard must stay open and nothing may jump.

## For the next agent (Phase 9, Sonnet 5.5, medium — Back stays reachable + dev panel fixes)
1. **Goal / scope:** plan §5 Phase 9 (findings 4, 7, 9: raise `Header` above the die, dev panel buttons above the
   die, one `LETTER_DIE_DEMOS` record). Out of scope: Phase 10, the engine, the venue TV, merging to `main`.
2. **Starting state:** branch `after-app-review`, last commit `c3ecdb8a`. **Nothing from Phases 1–8 is committed.**
   No data, migration, env or cron touched. Never push `main`, deploy, `supabase db push`, or change Production env.
3. **Decisions:** plan §2 items 1–13. Phase 8 followed the plan's text; one wording correction (below, item 5).
4. **Files changed (Phase 8):**
   - `components/category-blitz/CategoryBlitzGame.tsx`, `AnsweringScreen` (~lines 1546–1660 and the row map
     ~2085–2135):
     - New `const [cascadeIn] = useState(cascadeRows)` (read once at mount). When true, every row renders as a
       `motion.div` with NO `layout`/`layoutId`, the cascade `initial`/`animate`/`transition`, and a new marker
       `data-category-blitz-row-cascade`, for the whole round. Never swapped to a plain div.
     - `morphActive` governs only what has a partner: the badge, and rows on the RoundStartReveal path (layoutId →
       plain div at `LAYOUT_MORPH_SETTLE_MS` = 570 ms, unchanged). The `morphSettleMs` stretch is deleted; both paths
       use 570 ms, so `compactChrome` is held off ≤ 570 ms.
     - Comments at `morphActive`, `cascadeIn`, `compactChrome` and the `cascadeRows` prop doc updated (the old "nothing
       is focused during the morph window" claim is gone).
   - `lib/categoryBlitzMotion.ts` — deleted `cbRowCascadeAfterDieEndMs` (its only user was `morphSettleMs`; it had no
     test). `CB_ROW_CASCADE_*` constants stay (RoundStartReveal + AnsweringScreen use them).
   - `tests/components.category-blitz-letter-die-wiring.test.ts`:
     - The `framer-motion` mock now wraps `motion.div` (a stable `forwardRef` behind a `Proxy`) and records every
       answer row rendered with `layout`/`layoutId` into `layoutRows` (cleared in `beforeEach`).
     - New helpers `cascadeRows()`, `rowInput(i)`, `compactChrome()`, `advanceUntilBoard(maxMs)`; `afterEach` now
       also `vi.unstubAllGlobals()`.
     - First test's assertions updated (cascade rows present, 0 projected rows, same rows after the cascade).
     - New `describe("8 …")` with 5 tests: focused row survives the cascade (same node, `activeElement`, value kept);
       no row takes `layout`/`layoutId`; compact chrome engages at ~600 ms; RoundStartReveal path unchanged (rendered
       on `AnsweringScreen` directly); `cascadeRows` read once at mount.
5. **Facts and traps:**
   - **framer-motion 12.38 gives EVERY html `motion.div` a projection node** (`createProjectionNode` in
     `use-visual-element`), so the plan's "no projection node" is slightly off. It is inert: `willUpdate` returns early
     when the node has no `layout`/`layoutId` (`motion-dom/.../create-projection-node.mjs` ~line 438), so it is never
     measured or animated on the keyboard resize. Finding A stays fixed; the comments say this precisely.
   - **framer's frame loop captured jsdom's real `requestAnimationFrame` at import**
     (`motion-dom/dist/es/frameloop/frame.mjs`), so in these tests framer animations advance on real-time frames, not
     fake timers. RoundStartReveal's `onAnimationComplete` → `onDone` therefore fires only when the test happens to run
     first (later in the file the board arrives by the 3 s cutoff with nothing to morph from). That's why the
     non-die-path test renders `AnsweringScreen` directly; `morphActive` itself runs on the faked `setTimeout`.
     Don't write a game-level test that depends on a framer animation completing.
   - jsdom has no `Element.prototype.scrollBy`; focusing a row scrolls the list, so the Phase 8 `describe` stubs it in
     its own `beforeEach`/`afterEach`. Typing autosaves via `fetch` after a debounce; that test stubs `fetch`.
6. **Gates run:** `npx tsc --noEmit` clean; `npx eslint` clean on the 3 touched files; `npm run test` 5,654 pass / 13
   skipped / 4 fail (the known Bingo star-index freshness tripwires `tests/lib.sportsBingo.{mlb,nfl}-star-index{,-freshness}.test.ts`);
   `npm run build` exit 0. **Mutation-checked:** a `layoutId` on cascade rows; swapping cascade rows to plain divs when
   the morph ends; reading the `cascadeRows` prop live; a 1,350 ms settle window — each fails at least one test.
   Unverified: real browser/phone (Phase 11).
7. **Open questions:** none new. (Still open from earlier: Andrew's view on judgment call 11; the intermission's
   "Next round in" copy on a final round — ask Andrew first.)
8. **First steps for Phase 9:** read plan §5 Phase 9; `Header` is ~line 2170 of `CategoryBlitzGame.tsx`, the die mount
   (`dieKey !== null && !dieSkipped`) ~line 2800; `DevAnimationPanel.tsx` for 9.2/9.3. Run
   `tests/navigation-controls-contract.test.ts` (part of `npm run test`) after touching the header.
