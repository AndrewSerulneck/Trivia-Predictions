# Game themes: one fun, game-specific look for each game's Venue Home button and its Share to social designs

**Status (2026-11-04):** **Phases 1–3 built** (Venue Home game buttons; Share to social Post + Story pictures; Reel
motion per game), uncommitted on `after-app-review`, not deployed. They go live when `after-app-review` is merged
after the App Store review (`CLAUDE.md` branch rule). Handoffs: `docs/game-themes-plan_PHASE_1_HANDOFF.md`,
`docs/game-themes-plan_PHASE_2_HANDOFF.md`, `docs/game-themes-plan_PHASE_3_HANDOFF.md`. All phases done; left: a
look on a real iPhone, then commit and merge with the branch.

## 1. Summary for Andrew

Every game gets its own look: Live Trivia is a stage with spotlights and a marquee sign, Category Blitz has letter
tiles, Pick 'Em is a football field with a football and a soccer ball, NFL Pick 'Em is a night stadium, Super Bowl
Squares shows a squares board, March Madness has a basketball on a hardwood court, Speed Trivia a stopwatch, Prop
Bingo a bingo card and Fantasy Sports a hand of jersey cards. The same looks go on:

1. **The game buttons on Venue Home** (Phase 1, built).
2. **Share to social Posts and Stories** (Phase 2, built): the partner's picture uses the game's look, with the prize
   shown as a fitting object (a ticket stub for trivia, a scoreboard for Pick 'Em, a trophy plaque for March Madness).
3. **Share to social Reels** (Phase 3): motion that fits each game (dice rolling, a ball flying, squares filling).

Approved mockups: the "Share to Social Game Themes" design canvas (https://claude.ai/artifact/3L19UXs5tFxSW19wLXvoat),
rows 1–2 = Posts, row 3 = Venue Home buttons.

## 2. Decisions

| # | Decision (Andrew, 2026-11-04) |
|---|---|
| G1 | The Post designs in the canvas are approved ("I like these"). |
| G2 | The Venue Home game buttons use the same themes ("can we also make these the designs of the game buttons"). |
| G3 | NFL Pick 'Em: footballs, not helmets. Pick 'Em: add a second sport ball (soccer) so it reads as more than football. |
| G4 | The nine button designs in canvas row 3 are approved ("these are great"), incl. the three new themes (Speed Trivia, Prop Bingo, Fantasy Sports). |
| G5 | Exception to the "minimal, one accent" design rule for game themes only (buttons + Share to social): Andrew asked for "fun" and "relevant to the games' themes". Everything else on the site keeps the minimal rule. |
| G6 | No team, league or event logos in any artwork. Generic balls, boards and courts only. |

## 3. Phases

| Phase | Model | Effort | Why |
|---|---|---|---|
| 1 — Venue Home buttons | Claude Opus 5.5 | medium | Done. Nine SVG themes plus a responsive layout; low risk, no data. |
| 2 — Post + Story pictures | Claude Opus 5.5 | high | Done. Extends the shared canvas renderer and the end-card layout that Reels depend on; needs matching against the mockups and has font traps. |
| 3 — Reel motion | Claude Opus 5.5 | high | Done. Per-game animation timed against sound cues, encoded on the device; easy to break Reels for every game. |

### Phase 1 — Venue Home game buttons (built 2026-11-04)
- `components/game-themes/gameTileThemes.tsx`: `GAME_TILE_THEMES: Record<VenueGameKey, GameTileTheme>` (surface
  background, optional full-bleed backdrop SVG, the picture SVG, how the title is drawn) and `gameTileTitleLines()`.
- `components/game-themes/sportBalls.tsx`: `Football`, `SoccerBall`, `Basketball` SVG groups (reused in Phase 2).
- `components/venue/VenueGamesPanel.tsx`: each button wears its theme; badges, LIVE tag, "Opening…" and the Category
  Blitz "Group game in progress!" state are unchanged. `VENUE_HUB_TILE_GRADIENT_BY_KEY` removed (unused).
- Contract: `tests/game-tile-themes-contract.test.ts`.

### Phase 2 — Share to social Post + Story in the themes (built 2026-11-04)
The six approved Post mockups, ported to the end card for Post (1080×1350) and Story (1080×1920), with each game's
prize object. Category Blitz (no prizes) shows the sample round card (letter tile, three blank categories, 3:00).
- **Renderer** (`lib/socialShare/storyCanvas.ts`, `contracts.ts`): shapes can now be any SVG path (`path`), stroked
  (`stroke`, incl. dashes), moved/turned/scaled (`transform`), faded (`opacity`) and clipped (`clip`); text can be
  turned (`rotate`), letter-spaced and faded; a spec has a `backdrop` layer painted under everything else. All
  artwork is vector, drawn with Nunito as canvas text, so the SVG font trap never applies and the Reel can paint a
  frame synchronously. The older designs (`shareDesigns.ts`) are unchanged.
- **Themes:** `lib/promo/promoThemes.ts` (`PROMO_THEMES: Record<PromoGameId, PromoTheme>`), one file per game in
  `lib/promo/themes/`, types in `lib/promo/promoThemeTypes.ts`, drawing helpers and the canvas versions of the
  Phase 1 balls in `lib/promo/promoArt.ts`, and one prize-panel engine (`lib/promo/promoPrizePanel.ts`: a "header"
  card with a WIN bar, or a "side" card with a stub/tile/trophy).
- **End card** (`lib/promo/promoEndCard.ts`): reads the theme, never a game id; new optional `art` row (Squares
  board, Category Blitz round card). Fits by steps: smaller title/art/gaps → 2 listed prizes → no brand line →
  no sample art.
- **Reel** (`lib/promo/promoReelRender.ts`): the beats play over the game's background + backdrop (painted once)
  instead of the old navy glow; same timing, sounds and encoding. Per-game motion is still Phase 3.
- Departures from the mockups, on purpose: the Pick 'Em title is 200 px (230 ran edge to edge) and NFL's 184 px
  (200); the "follow" tag stays inside the safe zone; a stack too tall for a Post shrinks (see fit steps).
- Contract: `tests/promo-themes-contract.test.ts`; `tests/lib.promo.test.ts` updated.

### Phase 3 — Reel motion per game (built 2026-11-04)
Each game's own motion plays under the beats (title, when, prize) and is gone, or in its picture place, by the time
the end card is held. Length, beats, sound cues and on-device encoding are unchanged (`lib/promo/promoReel.ts`).
- **Hook:** `PromoTheme.reel` (`lib/promo/promoThemeTypes.ts`, required): `motion(frame)` returns vector blocks for
  the frame at `t` (`ReelMotionFrame`: t, plan, the Story `stage`, `settle` 0→1), and optional `beatBackdrop(stage)`
  = the backdrop during the beats when the motion moves part of it. `buildPromoEndCardLayout` now also returns the
  `stage` it gave the backdrop. Helpers: `lib/promo/promoMotion.ts` (`progress`, `flash`, `faded`, `pointAlong`,
  `polylineUpTo`, `quadAt`).
- **Renderer** (`lib/promo/promoReelRender.ts`): paints the beat stage once (the beat backdrop, or the backdrop),
  paints `theme.reel.motion` each frame after the light bars and before the rows; never names a game. Also fixed:
  the title's big beat size is measured across the whole row (shapes too), so Category Blitz's letter tiles no
  longer run off both edges.
- **Per game** (each in its `lib/promo/themes/*.ts`): Live Trivia — buzzer double flash as the title lands (and on
  the prize), two searchlights sweeping. Category Blitz — a green letter die tumbles in, bounces, lands on B, then
  flies into the round card's B tile. Pick 'Em — a football thrown across the field and a soccer ball bouncing by;
  at the settle both fly into their places above the title (the beats run on the field without them). NFL — the
  stadium starts dark, the towers clunk on one after the other with flares, camera flashes in the stands. Squares —
  the backdrop grid's squares get claimed one by one, then the "?" square lights up. March Madness — two winners
  advance through the bracket, meet at a trophy; the bracket lights up again on the prize reveal.
- Checks: `node scripts/preview-promo-themes.cjs` now writes one Reel contact sheet per game
  (`<game>-reel-sheet.jpg`) and prints the seam (last moving frame vs held end card) and ms per full-size frame.
- Contract: `tests/promo-themes-contract.test.ts` "Share to social Reel motion per game".

## Standing rules (moved from CLAUDE.md, 2026-11-03)

- **Every game has a theme.** A Venue Home game = one entry in `GAME_TILE_THEMES`
  (`components/game-themes/gameTileThemes.tsx`); it is a `Record<VenueGameKey, …>`, so a new game does not compile
  without one. A new schedulable or prize game also needs its Share to social design
  (`docs/partner-social-promo-plan.md`, `lib/promo/promoTemplates.ts`) in the same theme: one entry in
  `PROMO_THEMES` (`lib/promo/promoThemes.ts`, a `Record<PromoGameId, …>`), its file in `lib/promo/themes/`.
- **Share to social artwork is vector, drawn by the one share renderer** (`lib/socialShare/storyCanvas.ts`): paths,
  shapes and canvas text only. No image files, no rasterised SVG (fonts don't load inside one), no external URLs.
  `lib/promo/promoEndCard.ts` never names a game; what differs lives in the theme. The prize panel is the shared
  engine in `lib/promo/promoPrizePanel.ts`; prizes reach it only through `prizes` (promo plan D13).
- **Backdrop is decoration** (`spec.backdrop`): it may run outside Instagram's safe zone and never carries content;
  all content text stays inside the safe zone and at or above `STORY_TEXT_FLOOR_PX`, for every game, size and
  prize count. The end card's rows (`PromoEndCardGroup`) are what the Reel animates: keep them.
- **A theme styles the name, never rewords it.** Title words come from `GAME_TITLE_LINES_BY_KEY`
  (`gameTileTitleLines()` only splits a one-line name after its first word).
- **Tile colours are fixed artwork, the same in dark and light** (light-theme plan decision 5). Tailwind only, no
  inline `style` in the theme files or `VenueGamesPanel.tsx`.
- **Artwork is decoration:** every SVG on a button is `aria-hidden`; letter tiles carry an `sr-only` word.
- **No logos** (G6). Sizes use `cqw` on the button (the size container) so a design fits 288–448 px tiles; no text
  under 12 px (`lib/textSizeFloor.ts`).
- **Reel motion lives in the theme** (`PromoTheme.reel`): `lib/promo/promoReelRender.ts` never names a game. Motion
  is vector blocks only, deterministic (no `Math.random`/clock: use `seededRandom`), small per frame (< 120 blocks;
  a phone draws 300–450 frames to encode). Settled (`settle` = 1), the beat backdrop plus the motion must equal the
  picture's backdrop (no `beatBackdrop` → the motion is empty), so the held end card is the still picture (D17).
  Don't change the Reel's length, beats or sound cues for a theme's sake (`lib/promo/promoReel.ts`).
- Pinned by `tests/game-tile-themes-contract.test.ts` and `tests/promo-themes-contract.test.ts`.
