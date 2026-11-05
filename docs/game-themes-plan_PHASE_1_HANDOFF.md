# Game themes — Phase 1 handoff (Venue Home game buttons)

## For Andrew (plain English)

The nine game buttons on Venue Home now have their own fun designs, the ones you approved in the design canvas:
spotlights and a marquee sign for Live Trivia, a stopwatch for Speed Trivia, letter tiles for Category Blitz, a
football and soccer ball for Pick 'Em, and so on. Everything else on the buttons works as before (the red count
badge, the "LIVE" tag, the "Opening…" spinner). **It is not live yet**: the work sits on the `after-app-review`
branch, not committed, and goes live when that branch is merged after the App Store review. Nothing needs you
right now. Next is Phase 2: the same designs on Share to social Posts and Stories.

## For the next agent

### 1. Next phase: goal and scope
**Phase 2** of `docs/game-themes-plan.md`: rebuild the Share to social Post (1080×1350) and Story (1080×1920)
pictures in the per-game themes, matching the approved Post mockups (canvas rows 1–2,
https://claude.ai/artifact/3L19UXs5tFxSW19wLXvoat; read it with the Artifact tool's `read` action, files
`project/Main.dc.html` (Live Trivia), `CategoryBlitz`, `PickEm`, `NflPickEm`, `Squares`, `Bracket` `.dc.html`).
Out of scope: Reel motion per game (Phase 3), Venue Home buttons (done), any change to captions, prizes data,
posting to Instagram.

### 2. Starting state
- Branch `after-app-review`, last commit `7e7a6a75`. **Nothing from Phase 1 is committed.** The working tree also
  holds uncommitted Share to social Phase 5 work from before this phase (`app/owner/dashboard/page.tsx`,
  `components/owner/share/ShareDetailsPanel.tsx`, `components/owner/social/ShareToSocialSheet.tsx`,
  `lib/promo/promoCopy.ts`, `lib/promo/promoEndCard.ts`, `lib/promo/promoReelRender.ts`, `lib/socialShare/shareVenue.ts`,
  `lib/venueShareDetails*.ts`, their tests, and the promo plan docs). Don't revert any of it.
- Not pushed, not deployed. No migrations, no env vars, no data changes in Phase 1.
- `main` is frozen while the App Store review is open: never push `main`, `supabase db push`, or change Production env.

### 3. Decisions already made (don't re-ask)
G1–G6 in `docs/game-themes-plan.md` §2: the Post mockups and button mockups are approved; footballs, not helmets,
on NFL Pick 'Em; a soccer ball next to the football on Pick 'Em; a "fun" exception to the minimal design rule,
for game themes only; no logos.

### 4. Files created or changed in Phase 1
- **New** `components/game-themes/gameTileThemes.tsx`: `GAME_TILE_THEMES` (`Record<VenueGameKey, GameTileTheme>`:
  `surfaceClass`, `backdrop?`, `art`, `splitTitle`, `renderTitle(lines)`, `subtitleClass?`) and
  `gameTileTitleLines(key)`. The art SVG uses `viewBox="208 0 150 176"`, i.e. the right-hand 150 px of the 358×176
  mockup, so mockup coordinates carry over unchanged. Backdrops use `viewBox="0 0 358 176"` with
  `preserveAspectRatio="xMaxYMid slice"`.
- **New** `components/game-themes/sportBalls.tsx`: `Football`, `SoccerBall` (needs a unique `clipId`), `Basketball`.
- **Changed** `components/venue/VenueGamesPanel.tsx`: the button markup (grid: text column + `min(40%,170px)` art
  column; `[container-type:inline-size]` on the button; sizes in `cqw` via `clamp()`). Removed the `next/image`
  icon and the inline `style` blocks. Badge / LIVE / Opening overlays got `z-10`.
- **Changed** `components/venue/venueHubShared.tsx`: removed `VENUE_HUB_TILE_GRADIENT_BY_KEY` (no users).
  `GAME_CARD_ICON_BY_KEY` (PNG icons) stays, because the prize badges (`ChallengeIconBadge`) use it.
- **New** `tests/game-tile-themes-contract.test.ts`; **changed** `tests/seasonal-games.test.ts` (title lines are now
  separate spans instead of `<br/>`).
- Docs: `docs/game-themes-plan.md` (new), `CLAUDE.md` (Feature rules row), `docs/light-theme-plan.md` decision 5
  pointer, `docs/partner-social-promo-plan.md` status pointer.

### 5. Facts and traps
- **Fonts don't load inside an SVG used as an image** (`<img>` or canvas `drawImage`). The buttons use inline SVG,
  so their `<text>` gets Nunito from the page. For Phase 2's canvas, keep glyphs out of rasterised SVG (draw them as
  canvas text, or as paths).
- The share renderer (`lib/socialShare/storyCanvas.ts`, `StoryRenderSpec`) supports rounded rects with
  solid/linear fills, images and text only. Plan for an extension or for rasterised art.
- `promoReelRender.ts` animates `PromoEndCardGroup` rows into place, then holds the end card. Keep the row
  structure so Reels keep working until Phase 3.
- Tailwind 3.4 arbitrary values: spaces inside `bg-[…]` gradients are written `_`. `cqw` units resolve against the
  button because it carries `[container-type:inline-size]`.
- The light theme leaves tiles alone (decision 5), so the themes have no light values on purpose.

### 6. Build, run, test
- `npx tsc --noEmit` passes. `npx eslint` on the changed files passes.
- `npm run test`: 484 files pass. **4 fail, unrelated to this change**: the sports-bingo star-index date tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`, "snapshot … is not itself stale"). They fail on the date
  alone. Fixing them means regenerating the snapshots, which is Andrew's call.
- Visual check: the panel was rendered to static HTML (`tsx` + `renderToStaticMarkup`), CSS compiled with
  `npx tailwindcss -c tailwind.config.ts -i app/globals.css --content <html>`, then screenshotted with Playwright
  (Chromium and WebKit) at 320, 390 and 480 px. All nine buttons fit with no overlap; LIVE tag and count badge
  sit clear of the art. Not yet seen on a real phone or in the light theme on device.

### 7. Open questions for Andrew
None.

### 8. Recommended first steps for Phase 2
1. Read `docs/game-themes-plan.md` §3 Phase 2 and `docs/partner-social-promo-plan.md` Standing rules (§9).
2. Read `lib/promo/promoEndCard.ts`, `lib/socialShare/storyCanvas.ts`, `lib/promo/promoReelRender.ts`,
   `lib/promo/promoTemplates.ts`.
3. Decide how art reaches the canvas: extend the renderer with circles/polygons/rotation, or rasterise
   text-free SVG art to images. Then add a per-game `theme` to `PromoTemplate`, port Live Trivia first, and check
   it against the mockup before doing the other five.
4. Model and effort for Phase 2: **Claude Opus 5.5, high effort** (`docs/game-themes-plan.md` §3 table).
5. Keep `tests/lib.promo.test.ts`, `tests/promo-coverage-contract.test.ts` and the sheet tests green.
