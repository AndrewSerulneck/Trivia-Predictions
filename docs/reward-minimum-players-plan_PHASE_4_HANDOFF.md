# Phase 4 handoff — tutorial art fits on small cards

## For Andrew (plain English)

**What changed:** the picture area on the Pick 'Em, NFL Pick 'Em and Fantasy tutorial cards is now safe on small
phones. Team names ("Bucks", "Dolphins") and player names ("T. Haliburton") no longer get cut short; the check mark
is 14 px; and if a card is ever too short for its picture, the picture drops a row (the second game, the "Your picks"
bar, the second player) instead of cutting off the top.

**Is it live?** No. Nothing is committed, pushed or deployed. The edits sit in the working folder next to the
earlier uncommitted tutorial-card work.

**Honest note:** with today's wording on an iPhone SE-sized card (289 px) and a 350 px card, nothing was actually
being clipped. The truncated names were real (reproduced in a browser). The "drop a row" rules are insurance for
longer wording or larger text sizes. They were proven only by squashing the card on purpose.

**What's left:** Phases 5–7. **Needs you:** a yes/no on committing the tutorial work (see §2). Phone check is in Phase 7.

---

## For the next agent (Phase 5 — tutorial code cleanup, findings 4, 6, 8, 9, 10)

You have none of my context. Read `docs/reward-minimum-players-plan.md` §4 "Phases 4–7" first.

### 1. Phase 5 goal and scope
Goal and steps are in the plan (Phase 5, items 1–6). **Out of scope:** visual changes, the trivia games' layout,
new art, copy in `lib/venueGameCards.ts`. Model/effort named by the plan: Sonnet 5.5, medium.

### 2. Starting state
- Branch `main`, last commit `dfb62f5`. **Everything from the tutorial-card work AND this phase is uncommitted:**
  `CLAUDE.md`, `components/ui/AccountMenu.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `components/venue/VenueHubClient.tsx`, `docs/reward-minimum-players-plan.md`, `lib/venueGameCards.ts`,
  `tests/lib.category-blitz-how-to-play.test.ts`, new `tests/tutorial-statement-layout-contract.test.ts`, plus this
  handoff. The plan recommended committing the pre-Phase-4 work first so diffs stay readable. **I did not**
  (no go-ahead), so Phase 4's diff is mixed into `GameIdentityPanel.tsx`. Ask Andrew before committing.
- **Never `git checkout -- <file>` / `git restore`** (it would wipe all of the uncommitted work).
- No migrations, no data changes, nothing deployed. No cost impact (layout only).

### 3. Decisions made
- Finding 2: score and check moved to a line under the team name (plan's first option), so the name has the full
  column width. Finding 3: the Live badge moved to the position line (`PG ● LIVE`).
- Hide thresholds (container height, rem): pip bar `12.5rem`; Pick 'Em second ticket `14rem`; Fantasy second row
  `10rem`. Chosen from measured content heights (13 px root: Pick 'Em step 3 = 163 px, step 2 = 183 px, Fantasy two rows
  = 123 px) against the smallest real art box (175 px, NFL step 3 on a 264 px card).
- Fantasy at 264 px still truncates "Jayson Tatum" next to the Drafted pill. Not fixed on purpose: Fantasy's card is
  289 px on an SE (264 px only occurs for Pick 'Em, whose card has a different aspect ratio), and the finding only
  covers `FanPlayerRow`.

### 4. Files changed
- `components/venue/GameIdentityPanel.tsx`:
  - `TutorialStatementPanel` art box: added `[align-items:safe_center] [justify-content:safe_center]` after the
    `[container-type:size]` classes (Tailwind emits arbitrary properties after `items-center`, so safe wins; checked
    in the generated CSS).
  - `PETeamCol`: now `flex-col` (name on top, `h-6 w-6` / `text-[14px]` check + score below), `min-w-0` for the grid.
  - `PEPipBar` root and the waiting `PETicket` wrapper, and the second row of every `FantasyIllustration` step, carry
    `[@container(max-height:…)]:hidden`.
  - `FanPlayerRow`: Live badge on the position line.
- `tests/tutorial-statement-layout-contract.test.ts`: new test "keeps every fixed text size in the tutorial art at 14px
  or more" (reads `GameIdentityPanel.tsx`, fails on any `text-[Npx]` with N < 14).

### 5. Traps and facts
- **Line numbers in the plan have shifted** (this phase added lines). Search by function name.
- I deliberately left the `style={{ fontFamily: "ui-monospace, monospace" }}` spans (now at `PETeamCol`, `PEPipBar`,
  `FanPlayerRow`) for Phase 5 item 2. Phase 5 should convert them to `font-mono` (Tailwind default mono; the config has none).
- Phase 5 item 1 touches the same `PickEmIllustration` function I edited; re-read it before editing.
- Tailwind 3.4 emits the container variant as `@container(max-height:10rem)` (no space). Chromium accepts it
  (verified: rows hide). Not tested in Safari/WebKit; Playwright WebKit is installed (`~/Library/Caches/ms-playwright/webkit-2311`) if you want to.
- `.next/dev/static/media/*.woff2` and `.next/dev/static/chunks/*font_google_*` hold the real Nunito/Bree Serif files
  from Andrew's running dev server. I copied them for the harness; don't touch `.next`.

### 6. How I built, ran and verified
- Gates, run sequentially: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` = 402 files passed /
  1 skipped, 4,792 tests passed / 13 skipped, 0 failed. I did NOT run `npm run build` or `npm run test:pwa-contract`
  (Phase 7 runs them).
- Browser check without touching Andrew's `next dev` (:3000): a throwaway harness in the session scratchpad
  (`…/scratchpad/h/`): `esbuild` bundle of a page that renders `GameOnboardingCard` for every step, plus
  `npx tailwindcss -i app/globals.css -c tailwind.config.ts`, fonts from `.next`, Playwright Chromium. Cards must be
  rendered in an iframe or a viewport that is a REAL phone width (320 / 375): the statement text uses `vw` clamps, so a
  wide viewport gives false "clipped" results (I hit this). Real card sizes: viewport 375 → 350 px card; viewport
  320 (iPhone SE) → 289 px card (264 px for Pick 'Em, aspect 3/5.4). The scratchpad is session-local; rebuild it from
  this description if needed.
- Before/after at 350, 289, 264: truncation list went from Bucks / Nets / Dolphins / Bills / Ravens / Packers / Dodgers /
  T. Haliburton (various) to none (except Fantasy at 264, above). Also viewed Bingo and Category Blitz at 289 and 350:
  unchanged. Squashed cards (aspect 1.35 and 1.05) confirmed each hide rule fires and nothing's top is cut off.

### 7. Unverified / risky
- Real-device look (Safari, iPhone SE). Phase 7 puts it on the checklist.
- The hide thresholds assume current wording. If `lib/venueGameCards.ts` copy gets longer, the art box shrinks and rows hide sooner.

### 8. Open questions for Andrew
- Commit the uncommitted tutorial/menu work now (recommended: as its own commit, before Phase 5)?

### 9. Recommended first steps for Phase 5
1. `git status` (expect the files in §2), read Phase 5 in the plan.
2. Do items 1–5 in order; grep `GameIdentityPanel` callers before deleting anything in item 4 (ask Andrew if nothing renders it).
3. `npx tsc --noEmit`, `npm run lint`, `npm run test`, then write `docs/reward-minimum-players-plan_PHASE_5_HANDOFF.md`
   and move the plan's status line to it.
