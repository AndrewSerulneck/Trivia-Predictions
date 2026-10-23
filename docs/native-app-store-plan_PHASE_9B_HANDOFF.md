# Native app plan — Phase 9b handoff (share card v2) — 2026-10-22

## For Andrew (plain English)
- **What changed:** after Live Trivia or Category Blitz, "Create story" now opens **three ready-made pictures** — no camera
  needed. They are called Spotlight (the game's colours), Card (a gift-card look; a prize shows its real gift card) and Night
  (dark, with the prize or the place huge). A **Story / Post** switch picks the size: Story is 1080×1920, a feed post is
  1080×1350. **Share** sends the picture you picked. **Add a selfie** opens the old camera, which now uses the same layout.
- **Every picture says:** your headline ("I just won $15 off my tab at The Pour House!", "I just won a Free Appetizer at …",
  "I just won Live Trivia at …"), the username, the bar's name, street and city (no directions), "Play on Hightop Challenge",
  `hightopchallenge.com/app` and a QR code to that link. I checked all 40 combinations in a real browser: each QR scans to
  `https://hightopchallenge.com/app`.
- **Two wordings to approve (they're new; edit them in `lib/socialShare/copyPresets.ts`):** someone who played but **didn't
  win** gets "I finished 3rd in Live Trivia at The Pour House!" or, with no place, "I just played Live Trivia at The Pour
  House!". The old screens already offered sharing to every finisher, so a line was needed.
- **Live?** No. Built and tested on this computer only: **not committed, not pushed, not deployed.** It goes with 9a (also
  uncommitted).
- **Needs you:** say if you want 9a + 9b committed and pushed. To see the pictures yourself: `npm run share-card:render -- --sheet`,
  then open `tmp/share-cards/contact-sheet.png`.

## For the next agent

### 1. Next phase and scope
**Phase 9c** (Sonnet 5.5, medium, plan "Phase 9c"): put one `ShareWinButton` (wrapping `StoryShareLauncher`) on the prize-won
moment, each won card in `/redeem-prizes`, Bingo win, Pick 'Em + NFL Pick 'Em weekly results, Fantasy, Squares quarter win,
Bracket results. Out of scope: the 9d share sheet (destinations row, copy-caption button, Instagram direct-share), store badges
(Phase 7), the Meta App ID native plugin.

### 2. Starting state
- Branch `main`, last commit `9cf67f7`. **9a and 9b are both uncommitted**, alongside unrelated work by others (CLAUDE.md
  edits, `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, deleted
  `design-system/project/public/info/*.png`, `.codex/`, `.firebaserc`, `.mcp.json`, `.vscode/mcp.json`, `firebase.json`,
  `docs/reel-video-assets-plan.md`, `tests/fixtures/squares/nfl-live-capture-1392309.json`). Stage only the files below.
- No database change, no migration, no env var, no new route, no cron. Nothing deployed.

### 3. Decisions already made (don't re-ask)
- Andrew's 2026-10-22 decisions 1–9 in plan "Phases 9a–9f": camera never required; name + street + city, no directions; the
  three headline wordings; two sizes; every link/QR = `hightopchallenge.com/app`; no venue Instagram handle.
- Mine (flag to Andrew only if he objects): the non-winner wordings above; the picture prints `hightopchallenge.com/app`
  (`APP_DOWNLOAD_DISPLAY_URL`) rather than the plan's "hightopchallenge.com", because typing it reaches the same place as the
  QR; the caption the player types is drawn only on the selfie (the ready-made designs lead with Andrew's line — minimal design);
  three designs, Card first for a prize, Spotlight first for a game.

### 4. Files (9b only)
New:
- `lib/socialShare/shareGames.ts` — **the registry** (`STORY_SHARE_GAMES`, `StoryShareGameType` = its keys, `storyShareGame()`).
  Entries: live-trivia, category-blitz (pre-registry values kept, test-pinned), bingo, pickem, nfl-pickem, fantasy, squares,
  bracket, prize. Each: label (for the headline), titles, colours, background gradient, selfie frames (or null), result fields,
  points unit, file slug. Squares/Bracket names come from `lib/venueGameCards.ts` (seasonal-games test).
- `lib/socialShare/shareDesigns.ts` — layouts: `buildShareDesignSpec(prepared, design, size)`, `readyMadeDesignsFor`,
  `STORY_SHARE_SIZES` (Story safe zone top 250 / bottom 340), `STORY_TEXT_FLOOR_PX` = 34. The venue + app panel is
  `venuePanel()` (shared by all four designs).
- `lib/socialShare/shareQr.ts` + `scripts/generate-share-qr.cjs` (`npm run share:qr`) → `public/share/app-download-qr-v1.png`
  (37 modules, level Q, 16 px/module, 0.6 KB). Drawn at 6 px/module, smoothing off.
- `lib/socialShare/shareVenue.ts` — `formatShareVenueAddress` (street + "City, ST"), `rememberShareVenue` / `readShareVenue`
  (localStorage key `htc_share_venue_v1`, one venue; falls back to the join list's sessionStorage cache).
- `components/social-share/useShareVenue.ts` — reads the remembered venue; only if none AND the sheet is open, ONE
  `getVenueById` (anon Supabase) per venue. `withShareVenue(payload, venue)`.
- `components/social-share/useSharePictures.ts` — draws the ready-made pictures for the open size (selected first); the
  thumbnails are the shared blobs (nothing drawn twice); URLs revoked on size change/close.
- `scripts/render-share-cards.cjs` (`npm run share-card:render [-- --sheet]`) — esbuild-bundles the real renderer, draws every
  case × design × size in Playwright Chromium with the brand fonts, writes `tmp/share-cards/`, decodes every QR.
- Tests: `tests/share-designs.test.ts` (headline wordings, 12px floor, bar + app on every design, no-address, Story safe zone,
  sizes, selfie frame rules, address formatter, registry values, "no component branches on a game id", no "Reward" copy),
  `tests/share-card-qr.test.ts` (file decodes to `APP_DOWNLOAD_URL`; every design draws it; whole px per module).

Changed:
- `lib/socialShare/contracts.ts` — `StoryRenderSpec` gains `background`, `shapes`, `images`, `frameAssetUrl: string | null`;
  text blocks gain `fitMinPx` (shrink to fit) and `centerY`; payload gains `venueAddress`, `prize`
  (`StorySharePrize` = `PrizeCardFace` headline/kind/label only); adapter gains `renderDesign(spec)`.
- `lib/socialShare/storyCanvas.ts` — `renderStoryImage({ source?, spec })`: background or photo → frame → shapes → images →
  text; resolves `var(--ht-font-*)` to the computed next/font family (never a literal family name) and waits ≤2.5 s for
  `document.fonts`.
- `lib/socialShare/storyPayloads.ts` — registry-driven; `buildStorySharePayload(gameType, input)` (the two old builders are
  wrappers), `buildPrizeStorySharePayload`; prepared payload adds `winLine`, `shareText`, `displayUsername`, stats carry
  `field`; option `size` replaces `width/height`; `renderSpec` is the selfie at that size.
- `lib/socialShare/copyPresets.ts` — `shareWinHeadline` (THE headline), `sharePrizeInSentence`, `shareWinText`,
  `SHARE_PLAY_LINE`, `SHARE_SCAN_LINE`, design/size names; one venue caption preset added to "funny" and "confident".
- `lib/socialShare/storyAssets.ts` — frames from the registry; `STORY_FRAME_ASSET_URLS` removed.
- `lib/themeTokens.ts` — `PRIZE_CARD_PICTURE` (raw colours mirroring `PRIZE_CARD`, for the canvas).
- `components/social-share/StoryCaptureModal.tsx` — `mode` designs|camera (designs first), size toggle, design radio group,
  Share sends the chosen blob; camera permission is probed only on entering camera mode; Back in camera mode returns to the
  designs (second `useNativeBackHandler`, registered later so it wins); fallback link = `APP_DOWNLOAD_URL`.
- `components/social-share/StoryShareLauncher.tsx` — resolves the venue, image icon, default titles "Share your win/result".
- `components/venue/VenueHubClient.tsx` — `rememberShareVenue(venue)` effect.
- `app/trivia/live/page.tsx`, `components/category-blitz/CategoryBlitzGame.tsx` — dropped the "champion shot" title prop.
- `lib/analytics.ts` — queued `gameType` may be a share registry id.
- `package.json` — `share:qr`, `share-card:render`. `CLAUDE.md` — one 9b bullet. Plan status lines.

### 5. Facts and traps
- **Venue data quirk:** some venues store the whole formatted address in `street` ("1010 Pacific St, Brooklyn, NY 11238, USA").
  `formatShareVenueAddress` keeps the part before the first comma. Category Blitz passes `venueName: null`; the name comes from
  the remembered venue.
- **Analytics:** `story_share_events.game_type` has a CHECK of `('live-trivia','category-blitz')` and
  `app/api/analytics/events/route.ts` drops any other game id silently. So share events from 9c's new games won't be stored
  until a migration widens the check + the route's `STORY_SHARE_GAME_TYPES`. Decide in 9c/9d (plan says "no new table" — a
  widened check isn't a table). `template_variant` is also checked; designs/sizes aren't recorded.
- Web Share: the picture goes with `title` + `text` (`shareText` = headline + "Play on Hightop Challenge: <url>"), no `url`
  field — adding `url` next to files makes some iOS targets (Instagram) drop out. Keep it that way in 9d.
- The global phone `button` rules pad/size every button; the thumbnail buttons use `[&:not(:disabled)]:!min-h-0` /
  `!p-1` (the PrizeCard trick). Inside a game, small text must be `text-caption`, not `text-xs`.
- Canvas text floor: 34 px on a 1080-wide picture ≈ 12 px on a 390 px phone. `fitMinPx` may never go below it (tested).
- Story layouts keep the panel inside y 250–1580 (tested). The selfie frame (1080×1920 art) is drawn only at Story size.
- A new game for 9c: add a `STORY_SHARE_GAMES` entry only if it isn't there (all 9c games already are), then build its payload
  with `buildStorySharePayload("<id>", …)` at the call site. For a prize: `buildPrizeStorySharePayload({ prize: prizeCardFace(win,
  venueName) })` — only headline/kind/label are copied; never a code, QR or card number (9c contract test).
- Selfie preview in the camera view is still the old CSS overlay (chips + caption); the captured picture uses the new layout.

### 6. Build, run, test — and what was verified
- `npx tsc --noEmit` clean; `npx eslint` clean on every touched file; `npm run test` → 433 files, 5,304 pass, 13 skipped;
  `npm run build` → success (214 pages; `/app` listed as dynamic `ƒ /app`).
- `npm run share-card:render -- --sheet` → 40 pictures (5 cases × 4 designs × 2 sizes), all QRs decode to
  `https://hightopchallenge.com/app`; I viewed the contact sheet and two full-size pictures.
- **Not verified:** the modal on a real phone (iPhone Safari, Android Chrome, the app) — the share sheet hand-off, the
  Story/Post toggle feel, render speed on an old phone (3 pictures per size drawn on open), Instagram's actual compression of
  the QR. These go in 9f's device checklist. No browser test of the modal itself was run.

### 7. Open questions for Andrew
1. Approve (or reword) the two non-winner lines.
2. Commit + push go-ahead for 9a + 9b.
3. (9c/9d) Widen `story_share_events.game_type` so the new games' share analytics are kept? Needs a migration + `db push`.

### 8. Recommended first steps for 9c
Read plan "Phase 9c" and this note. Wrap `StoryShareLauncher` as `ShareWinButton`; for each win screen build the payload from
data the screen already loaded (no new request, no polling); add the tripwire test listing every win screen and the
"prize share shows the name only" contract test. Run `npm run share-card:render` after any layout change.
