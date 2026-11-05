# Game themes — Phase 2 handoff (Share to social Post + Story pictures)

## For Andrew (plain English)

The pictures partners make with **Share to social** now wear each game's own look, matching the designs you
approved: a stage with spotlights and a ticket-stub prize for Live Trivia, letter tiles and a sample round card for
Category Blitz, a football field with a scoreboard prize for Pick 'Em, a night stadium for NFL Pick 'Em, the squares
board for Super Bowl Squares, and a basketball court with a trophy plaque for March Madness. This covers the Post
(square-ish) and the Story (tall). Reels also play over the new backgrounds and end on the new picture, but the
game-specific motion (dice rolling, ball flying) is Phase 3.

Two small changes from the mockups, on purpose: the "PICK 'EM" titles are a bit smaller (at the mockup size they ran
off the edges), and when a picture has a lot on it (say four prizes on a Post) it shrinks things and lists two prizes
plus "+ 2 more prizes" so nothing gets cut off.

**It is not live yet**: like Phase 1, the work sits on the `after-app-review` branch, not committed, and goes live
when that branch is merged after the App Store review. The pictures are made on the partner's phone, so there is
**no new server, database or cost**. Nothing needs you now; if you want to see every picture, ask an agent to run
`node scripts/preview-promo-themes.cjs`.

## For the next agent

### 1. Next phase: goal and scope
**Phase 3** of `docs/game-themes-plan.md`: per-game Reel motion before the end card settles — buzzer flash +
spotlights (Live Trivia), dice tumble (Category Blitz), football/soccer ball flying (Pick 'Em), stadium lights
switching on (NFL), squares filling with the "?" square lighting up (Squares), bracket lines advancing to the trophy
(March Madness). Keep the Reel's length, sound cues and on-device encoding unchanged (`lib/promo/promoReel.ts`,
`tests/lib.promo.test.ts` "the Reel timeline and sound").
Out of scope: the still pictures (done; change them only if motion needs a hook), Venue Home buttons, captions,
prize data, Instagram posting (Phases 6–7 of the promo plan are on hold).

### 2. Starting state
- Branch `after-app-review`, last commit `7e7a6a75`. **Nothing from Phases 1 or 2 is committed.** The working tree
  also holds the uncommitted Share to social Phase 5 work from before (`app/owner/dashboard/page.tsx`,
  `components/owner/share/ShareDetailsPanel.tsx`, `components/owner/social/ShareToSocialSheet.tsx`,
  `lib/promo/promoCopy.ts`, `lib/socialShare/shareVenue.ts`, `lib/venueShareDetails*.ts`, their tests, the promo plan
  docs). Don't revert any of it.
- Not pushed, not deployed. No migrations, env vars, data changes, crons or paid APIs in Phase 2.
- `main` is frozen while the App Store review is open: never push `main`, `supabase db push`, or change Production env.

### 3. Decisions already made (don't re-ask)
G1–G6 in `docs/game-themes-plan.md` §2 (mockups approved; footballs not helmets on NFL; soccer ball on Pick 'Em; a
"fun" exception to the minimal design rule for game themes only; no logos). Made in Phase 2, without asking Andrew,
as small fixes the mockups needed:
- Pick 'Em title 200 px (mockup 230) and NFL 184 px (mockup 200): the mockup sizes run edge to edge.
- The "Follow @thehightopchallenge" tag stays inside the safe zone (tests pin it) rather than the mockups' bottom: 26 px.
- Fit order when a stack is too tall: smaller title/art/gaps → list 2 prizes instead of 3 → drop the brand line →
  drop the sample art (the Squares board). `FIT_LEVELS` in `lib/promo/promoEndCard.ts`.
- Pick 'Em accent → `#FACC15`, Squares accent → `#FBBF24` (`lib/promo/promoTemplates.ts`), to match the themes; the
  accent now only drives the Reel's drumroll ring and confetti.
- All artwork is vector (paths + canvas text), not rasterised SVG: no font trap, nothing to load per frame.

### 4. Files created or changed
- **Renderer** — `lib/socialShare/contracts.ts`: `StoryShapeBlock` gained `path` (SVG path data), `stroke`
  (`StoryStroke`, incl. `dash`), `transform` (`StoryTransform`: x, y, rotate rad, scale, scaleY), `opacity`, `clip`;
  `fill` is now optional. `StoryTextBlock` gained `rotate` (rad, about x / centerY), `letterSpacing`, `opacity`.
  `StoryRenderSpec.backdrop?: StoryBlocks` (decoration under the shapes). `lib/socialShare/storyCanvas.ts`:
  `drawShape` handles all of it via `Path2D`; `drawTextBlock` rotates/letter-spaces; `paintStoryBlocks` and
  `renderStoryImage` paint the backdrop. The older designs (`shareDesigns.ts`) don't use the new fields.
- **New** `lib/promo/promoArt.ts`: path builders (`circlePath`, `ellipsePath`, `polygonPath`, `roundedRectPath`,
  `topRoundedRectPath`, `ticketPath`), `pathShape`/`rectShape`, fills (`solid`, `linear`, `radial`, `ellipseGlow` =
  CSS elliptical radial gradient), text (`textLine`, `displayWord` = drop + glow double shadow, `glyph`), backdrop
  scaling (`scaleY`, `fromBottom`: mockups are 1350 tall; Story is 1920), and canvas ports of the Phase 1 balls
  (`footballArt`, `soccerBallArt`, `basketballArt`) plus `trophyArt`.
- **New** `lib/promo/promoThemeTypes.ts` (`PromoTheme`, `ThemeRow`, `ThemeStage`, `PrizePanelTheme`, `MeasureText`),
  `lib/promo/promoThemes.ts` (`PROMO_THEMES: Record<PromoGameId, PromoTheme>`, `promoThemeFor`), and one theme per
  game in `lib/promo/themes/` (`liveTrivia.ts`, `categoryBlitz.ts`, `pickem.ts`, `nflPickem.ts`, `squares.ts`,
  `bracket.ts`). A theme = background, backdrop(stage), brand colour + gap, title(lines, scale, measure), when
  colours, optional `art` row, prize panel style, venue colours, CTA style, follow colour.
- **New** `lib/promo/promoPrizePanel.ts`: `prizePanelRow(theme, prizes, measure, maxListed)` — "header" layout (WIN
  bar on top: Pick 'Em scoreboard, NFL, Category Blitz fallback) or "side" layout (left column drawn by the theme:
  ticket stub, WIN tile, trophy). Single prize big; 2+ listed with "+ n more".
- **Rewritten** `lib/promo/promoEndCard.ts`: same exports and row model (`PromoEndCardGroup`), plus row id `"art"`;
  `template` input now needs `game`. `PROMO_GLOW` / `PROMO_NAVY_*` are gone. `withAlpha` and `MeasureText` are
  re-exported from their new homes.
- **Changed** `lib/promo/promoReelRender.ts`: background + backdrop painted once to a `stage` canvas; beat frames
  start from it (light bars still fade out); end card = stage + rows. `"art"` fades in with the other arriving rows.
  Beat text got a soft shadow; the time beat uses `theme.when.timeColor`.
- **Tests** — new `tests/promo-themes-contract.test.ts` (every game × Post/Story × 0/1/4 prizes in the safe zone and
  ≥ 34 px, rows don't overlap, title words come from the template, WIN + prize + how-to-win in every panel, Blitz
  round card / Squares board, no image files or URLs in theme code). `tests/lib.promo.test.ts`: two tests updated
  (shapes no longer include a glow; four prizes may list two).
- **New** `scripts/preview-promo-themes.cjs`: renders all 50 previews (see §6).
- Docs: `docs/game-themes-plan.md` (status, Phase 2 section, standing rules), `docs/partner-social-promo-plan.md`
  (status line, §9 rule), `CLAUDE.md` (Feature rules row; also the model-per-phase rule now names the agent's own
  model family — Andrew's request on 2026-11-04, mirrored in `~/.claude/CLAUDE.md`).

### 5. Facts and traps
- The mockups (`project/*.dc.html` in https://claude.ai/artifact/3L19UXs5tFxSW19wLXvoat) don't fit their own frame:
  Pick 'Em wraps its title to two lines, NFL clips its prize card, Squares shows a template placeholder instead of the
  board. Our versions fix those; compare by eye, not pixel-exact.
- Nunito is loaded upright only (`app/layout.tsx`); italic titles (`font(900, px, true)`) are synthesised oblique by
  the browser. Fine on Chromium and WebKit.
- Canvas `letterSpacing` is missing on older Safari; text then just draws without spacing (`setLetterSpacing` guards).
  `drawTextBlock` shifts centred text by half the spacing (canvas adds it after the last letter too).
- `fillText(…, maxWidth)` squeezes text wider than `maxWidth` instead of overflowing; `fitMinPx` shrinks first.
- Backdrop art that sits next to a row reads `ThemeStage.rows` (Pick 'Em's balls sit above the title's letters and
  shrink when the band is short). During the Reel's beats the title moves but the backdrop doesn't, so on Pick 'Em
  the title passes over the balls for a moment — Phase 3's motion should own that.
- Test measure is ~0.55 em per character; real Nunito differs. Visual checks are the real check.

### 6. Build, run, test
- `npx tsc --noEmit` passes. `npx eslint lib/promo lib/socialShare/storyCanvas.ts lib/socialShare/contracts.ts
  tests/promo-themes-contract.test.ts tests/lib.promo.test.ts scripts/preview-promo-themes.cjs` passes.
- `npm run test`: 485 files pass; **4 fail, unrelated** — the sports-bingo star-index date tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`), the same 4 as Phase 1; fixing them is Andrew's call.
- Visual: `node scripts/preview-promo-themes.cjs` (or `… webkit`) writes 50 JPEGs to `tmp/promo-previews/<engine>/`
  (git-ignored): each game's Post + Story with 1, 4 and no prizes, and Reel frames at 1 s, 4 s and the settle. Needs
  Nunito from `.next/**/static/media/*-s.p.*.woff2` (run the app once) or `NUNITO_WOFF2=…`. No database, no network.
  All six Posts were checked side by side against the mockups (rendered from the canvas files), in Chromium and
  WebKit. **Not yet seen** on a real iPhone inside the owner sheet, or posted to Instagram.

### 7. Open questions for Andrew
None blocking. Worth showing him the previews before merge (the two smaller "PICK 'EM" titles, the 4-prize fit).

### 8. Recommended first steps for Phase 3
1. Read `docs/game-themes-plan.md` (§3 Phase 3, Standing rules) and `docs/partner-social-promo-plan.md` §9.
2. Read `lib/promo/promoReelRender.ts` (`prepareReel` → `draw`), `lib/promo/promoReel.ts` (`reelPlan`, cues) and a
   theme file, e.g. `lib/promo/themes/squares.ts`.
3. Add an optional per-theme intro hook (e.g. `PromoTheme.reel?: (context, t, plan, layout) => void` drawn after the
   stage and before the rows) so motion stays in the theme and `promoReelRender.ts` never names a game. Keep the
   held end card identical to the still picture (`tests/lib.promo.test.ts` D17).
4. Check frames with `node scripts/preview-promo-themes.cjs` (add more `t` values in its `ENTRY` if useful).
5. Model and effort: **Claude Opus 5.5, high** (`docs/game-themes-plan.md` §3 table). This phase was done with
   Claude Opus 5.5 as planned (session effort setting not visible to the agent).
