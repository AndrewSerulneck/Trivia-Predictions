# Game themes — Phase 3 handoff (Reel motion per game)

## For Andrew (plain English)

Share to social **Reels** now move in a way that fits each game before they land on the finished picture:

- **Live Trivia:** a buzzer flash as the title appears, and searchlights sweeping the stage.
- **Category Blitz:** a letter die tumbles in, bounces and lands on "B", then flies into the sample round card.
- **Pick 'Em:** a football is thrown across the field and a soccer ball bounces past. At the end both fly into
  their places above the title.
- **NFL Pick 'Em:** the stadium starts dark and the light towers switch on one after the other, with camera
  flashes in the stands.
- **Super Bowl Squares:** squares on the grid get claimed one by one, then the "?" square lights up.
- **March Madness:** two winners move through the bracket and meet at a trophy, and the bracket lights up again
  when the prize is shown.

The Reel's length, its sounds and the finished picture it ends on are the same as before. I also fixed a small
bug that was already there: on the Category Blitz Reel the "CATEGORY" letter tiles ran off both sides of the
screen at the start.

**It is not live yet.** Like Phases 1–2, this is on the `after-app-review` branch, not committed, and goes live
when that branch is merged after the App Store review. Reels are made on the partner's phone, so there is
**no new server work, database or cost.** All three phases of this plan are now built. Before merging, it's worth
making one Reel per game on a real iPhone from the owner dashboard, to see the motion and hear the sound together.

## For the next agent

### 1. Next step: goal and scope
All phases in `docs/game-themes-plan.md` are built. What's left:
1. **Check on a device:** make a Reel for each game on a real iPhone in the owner Share to social sheet (preview and
   saved MP4), with and without a prize.
2. **Commit** Phases 1–3 together on `after-app-review` once Andrew has seen them (he hasn't seen the Phase 2
   previews or the Phase 3 motion yet).
3. **Merge** with the branch after the App Store review.
Out of scope: changing the Reel's length, beats or sound cues (`lib/promo/promoReel.ts`), the still pictures,
Venue Home buttons, Instagram posting (promo plan Phases 6–7 are on hold).

### 2. Starting state
- Branch `after-app-review`, last commit `7e7a6a75`. **Nothing from game-themes Phases 1–3 is committed.** The
  working tree also holds the uncommitted Share to social Phase 5 work (`app/owner/dashboard/page.tsx`,
  `components/owner/share/ShareDetailsPanel.tsx`, `components/owner/social/ShareToSocialSheet.tsx`,
  `lib/promo/promoCopy.ts`, `lib/socialShare/shareVenue.ts`, `lib/venueShareDetails*.ts`, their tests, the promo
  plan docs). Don't revert any of it, and never `git checkout -- <file>` (it wipes all uncommitted changes there).
- Not pushed, not deployed. No migrations, env vars, data changes, crons or paid APIs in Phase 3.
- `main` is frozen while the App Store review is open: never push `main`, `supabase db push`, or change Production env.

### 3. Decisions already made (don't re-ask)
- G1–G6 in `docs/game-themes-plan.md` §2.
- Phase 3 choices made without asking Andrew (they're within the plan's description):
  - Motion plays **under** the beats' text (after the backdrop and light bars, before the rows), so it never hides
    the title, the time or the prize.
  - Motion is mostly in the title beat (0–3 s), cleared by the time the title moves up for "when". The exceptions:
    Live Trivia's searchlights and NFL's flares and camera flashes run through the beats and fade as the end card
    settles. The Live Trivia flash and the March Madness bracket also come back on the prize reveal.
  - The Category Blitz die lands on "B" because the sample round card shows B.
  - Pick 'Em is the only theme with a `beatBackdrop` (the field without the balls). That removes the Phase 2 quirk
    where the moving title passed over the backdrop balls.
  - Live Trivia flash peak 0.45 and searchlight alpha 0.2, toned down after the first look.

### 4. Files created or changed (Phase 3)
- **New** `lib/promo/promoMotion.ts`: pure helpers: `progress`, `flash`, `faded` (multiplies opacity, empty at
  ~0), `pointAlong`, `polylineUpTo` (a line being drawn), `quadAt`.
- `lib/promo/promoThemeTypes.ts`: `ReelMotionFrame` {t, plan, stage, settle} and `ThemeReel`
  {beatBackdrop?, motion}. `PromoTheme.reel` is **required**, so a new game won't compile without motion.
- `lib/promo/promoEndCard.ts`: `PromoEndCardLayout.stage` (the `ThemeStage` the backdrop got). Nothing else changed.
- `lib/promo/promoReelRender.ts`: `beatStage` canvas (painted once) when the theme has a beat backdrop; each
  pre-hold frame paints `theme.reel.motion(...)` with fonts resolved once per font string (`motionFont`). The title's
  beat size now uses the row's full horizontal extent (text and boxed shapes; paths are skipped).
- Themes in `lib/promo/themes/`:
  - `liveTrivia.ts`: `SEARCHLIGHTS`, `reelMotion`.
  - `categoryBlitz.ts`: `roundCard(scale)` / `roundTileOf(top, height)` are now the round card's single source of
    measurements, shared by the art row and the die. `dieAt(t)` is the tumble: `IMPACTS`, `HOPS`, `FACES`.
  - `pickem.ts`: the backdrop is split into `fieldOf(stage)` + `ballsOf(stage, at?)`. `ballsOf` with no `at`
    gives exactly the backdrop's ball blocks. `PASS`, `KICK`, `reelMotion`.
  - `nflPickem.ts`: `TOWERS` (switch-on times 0.3 s / 0.72 s), `lit()` flicker, `FLASH_SPOTS`, `reelMotion`.
  - `squares.ts`: `cellsFor()` (the tilted grid's squares on screen, claim order from `seededRandom(7)`, the "?"
    square nearest 74% down), `reelMotion`.
  - `bracket.ts`: `LEFT_RUN` / `RIGHT_RUN` (Post coordinates, scaled by `scaleY`), `runsFor()`, `reelMotion`.
- `scripts/preview-promo-themes.cjs`: the three loose Reel frames are replaced by one contact sheet per game, plus
  printed seam and frame-time numbers.
- `tests/promo-themes-contract.test.ts`: new describe block "Share to social Reel motion per game" (see §6).
- Docs: `docs/game-themes-plan.md` (status, Phase 3 section, table, Standing rules) and
  `docs/partner-social-promo-plan.md` (status line, §9 rule).

### 5. Facts and traps
- `settle` = `easeOut((t − plan.end[0]) / REEL_SETTLE_S)`. From `reelHoldStartS(plan)` on, the renderer copies the
  pre-painted end card and doesn't call `motion`. Settled, the beat backdrop plus the motion must equal the backdrop
  (tested). Pick 'Em meets this by returning `ballsOf(stage)` unmoved. A moving ball's speed lines get `opacity`
  only below 1, so the settled blocks match exactly.
- The one known seam difference: Pick 'Em's moving balls are painted after the yard numbers, but in the still
  picture they're painted before them. That only shows where a ball overlaps a 32%-opacity number, for one frame.
  The measured seam is about the same for every game (below).
- The renderer lays the Reel out in **Story** size (1080×1920). Motion coordinates are Story pixels. Mockup (Post)
  coordinates go through `scaleY(height)`.
- Text in motion uses `font()` faces already in `PROMO_END_CARD_FONTS`. A new weight or italic face there would
  need adding to the loaded fonts.
- `drawShape` applies `transform` before the fill, so gradient coordinates are in the shape's local space (see
  the searchlights and flares).
- Category Blitz: `roundTileOf` works out the art row's scale from its height (`(height − 30) / 258`). If the
  round card's measurements change, change `roundCard()` only.

### 6. Build, run, test
- `npx tsc --noEmit` passes. `npx eslint lib/promo tests/promo-themes-contract.test.ts scripts/preview-promo-themes.cjs` passes.
- `npx vitest run tests/promo-themes-contract.test.ts tests/lib.promo.test.ts`: 67 + 36 pass. The new tests run
  every game × with/without prize: every pre-hold frame at 30 fps has text ≥ `STORY_TEXT_FLOOR_PX` and < 120 blocks;
  the settled motion equals the backdrop (above); no `Math.random`/`Date.now`/`performance.now` in themes or
  `promoMotion.ts`; `promoReelRender.ts` names no game.
- `npm run test`: 485 files pass; **4 fail, unrelated**: the sports-bingo star-index date tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`), the same 4 as Phases 1–2. Fixing them is Andrew's call.
- Visual: `node scripts/preview-promo-themes.cjs` (or `… webkit`) writes `tmp/promo-previews/<engine>/` (git-ignored):
  the 32 Post/Story pictures plus `<game>-reel-sheet.jpg` (frames at 0.15–2.4 s, 3.2 s, 5 s, the prize, the settle,
  the hold). It also prints two numbers per game:
  - **Seam** (mean difference per channel, last moving frame vs held end card): Chromium 1.03–1.87/255, WebKit
    0.92–2.04/255. Live Trivia's motion is already empty at that frame, so this level is the renderer's normal
    sub-pixel settle. The motion adds nothing visible.
  - **Draw time** for a full-size frame on this Mac (Chromium): 1.6–6.0 ms. Live Trivia is the slowest because of
    its full-frame gradients. Budget: 33 ms.
  It needs Nunito from `.next/**/static/media/*-s.p.*.woff2` or `NUNITO_WOFF2=…`. No database, no network. All six
  sheets were checked by eye in Chromium; NFL and Live Trivia were also checked in WebKit.
- **Not yet verified:** a real iPhone (preview playback and the encoded MP4, with sound), and how it looks once
  posted to Instagram.

### 7. Open questions for Andrew
None blocking. Show him the six contact sheets (or a Reel per game on a phone) before commit/merge, together with
the Phase 2 pictures he hasn't seen yet.

### 8. Recommended first steps
1. Run `node scripts/preview-promo-themes.cjs` and look at the six `*-reel-sheet.jpg` files.
2. On a phone against a preview deploy (not Production; `main` is frozen), open the owner dashboard → Share to
   social → Reel for each game, play the preview, save the MP4 and check it in Photos.
3. If Andrew wants a motion changed, edit only that game's `reelMotion` in `lib/promo/themes/<game>.ts` and re-run
   the contract tests and the preview.
4. Model and effort for follow-up tweaks: **Claude Sonnet 5.5, medium** (well-specified visual tweaks inside one
   theme file). Use **Opus 5.5, high** for anything that touches `promoReelRender.ts`, `promoReel.ts` or the end-card
   layout. This phase was done with Claude Opus 5.5, as the plan names. The agent can't see the session's effort
   setting.
