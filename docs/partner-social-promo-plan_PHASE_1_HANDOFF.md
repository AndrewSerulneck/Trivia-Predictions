# Share to social: Phase 1 handoff (Post + Story pictures and the sheet)

**For Andrew:** the Partner Dashboard now has a **"Share to social"** button under Active Prizes. It opens one
screen where a partner picks a game, ticks which prizes to show, and picks Post or Story. The screen then shows
the finished picture (the same end card you approved, no QR) and a ready-made caption, with Share, Download and Copy
caption buttons. It's built and tested on the `after-app-review` branch. **It is not committed, pushed or live.**
Nobody has clicked through it in a real browser yet. The pictures themselves were drawn by the real code in a
headless browser and checked by eye. To try it: run your dev server, open `/owner/dashboard`, and tap "Share to
social". It only reads data. The Reel test page also changed: the whistle is gone, the Reel opens with applause,
and the music stays at full volume throughout (test page version 5). Next is Phase 2, Reels with sound.

## For the next agent

### 1. Next phase (Phase 2) goal and scope
Add **Reel** to the sheet's Size choice and a **Sound** picker (music track or "No music"), porting the approved
spike: `docs/partner-social-promo-spike/reel-sound-test.html` (= artifact version 5,
https://claude.ai/artifact/Mex9BDgSGEaircnafoqCmz). Reel = 15 s with a prize (10 s without), beats per plan §4.1
and D21 (no whistle: applause at 0 s; drumroll; crowd + ka-ching on the prize reveal; music at full level
throughout, faded only at the end), **ending on the held end card**: reuse `buildPromoEndCardSpec` for the last
~3 s so the Reel's last frame is identical to the Post/Story picture. Add `lib/promo/promoSounds.ts` (licence
record required, plan §4.2/§6) and the converted sounds in `public/promo/sounds/<id>-v1.m4a` with an immutable
cache header (`next.config.*`, like `/brand/web/:path*`). Install `mediabunny` + `@mediabunny/aac-encoder` (pin exact
versions at least 2 weeks old; Phase 0 used 1.61.6) and lazy-load them only when Reel is chosen.
**Out of scope:** end-of-flow prompts (Phase 3), anything Meta (Phases 4–7), committing unless Andrew asks.
Model / effort: **Opus 5.5, high** (plan §5.1).

### 2. Starting state
- Branch `after-app-review`, last commit `5fd76ed9`. **Nothing for this feature is committed.** Main is frozen
  (App Store review): never push main, `supabase db push` or change Production env.
- Uncommitted, modified: `AGENTS.md`, `CLAUDE.md`, `app/owner/dashboard/page.tsx`,
  `components/owner/share/ShareDetailsPanel.tsx`, `lib/ownerSchedule.ts` (comment only), `lib/ownerSheetParams.ts`,
  `lib/rewardDefinitions.ts` (comment only), `lib/socialShare/storyCanvas.ts`, `types/index.ts` (comment only).
- Uncommitted, new: `lib/promo/` (6 files), `components/owner/social/` (2 files), 3 test files,
  `data/promo-sounds/originals/` (2 Pixabay MP3s + README + SOURCES), `docs/partner-social-promo-plan.md`,
  the Phase 0 and Phase 1 handoffs, `docs/partner-social-promo-spike/reel-sound-test.html`.
- No migration, env var, cron, data change or deploy. No new server route.

### 3. Decisions (plan §2, D1–D22; don't re-ask)
- D13 one design per game with the prize on it.
- D17 the end card is the Post/Story and the Reel's last frame.
- D19 no QR.
- D21 no whistle, applause opening, music at full level throughout.
- **D22 (new, my call): the sheet is ONE screen, not steps.** There's one design per game, so there's nothing to
  pick between. If Andrew wants steps, it's a layout change only.
- Model and effort per phase: plan §5.1 (added at Andrew's request).

### 4. Files and how they fit
- `lib/promo/promoTemplates.ts`: **the design registry**, one entry per game (`live_trivia`, `category_blitz`,
  `pickem`, `nfl_pickem`, `squares`, `bracket`). Each entry has its title lines, accent colour,
  `scheduleGameType`, `prizeGameTypes`, `standingWhen` + `standingOffer` ("always" / "with-prize" / a check;
  Category Blitz checks `isContinuousDefaultEnabled`), hashtags and file slug. Nothing else names a game id.
- `lib/promo/promoPrizes.ts`: `promoPrizeOf(campaign)` gives `{ headline, inSentence, howToWin }`.
  - Prize wording: `describeRewardPrizeInSentence`.
  - How to win: the definition's requirement copy by `winCondition`, with "at this venue" removed.
  - Ranked places lead with 1st place plus "· Top N win". Pick 'Em tiers use the top tier.
  - `prizesForGame(campaigns, game, scheduleId)`: active and not won, matched by definition `gameType`; a prize
    pinned to other games (`gameWinnerSlots`) is left out.
  - Pre-Rewards campaigns (no `rewardDefinitionId`) are never promoted.
- `lib/promo/promoSubjects.ts`: `promoOptions({schedules, prizes, nowMs})` lists upcoming active scheduled games
  (soonest first), then standing games. `scheduleWhen` gives e.g. "Every Thursday" + "8 PM" in the venue's time
  zone. Two days are written in full, three or more abbreviated; a one-off game gives "Thursday, Nov 5".
- `lib/promo/promoCaptions.ts`: `promoCaption(...)`, the editable caption. Uses `SHARE_PLAY_LINE` +
  `APP_DOWNLOAD_DISPLAY_URL` and adds hashtags plus a venue hashtag.
- `lib/promo/promoEndCard.ts`: **pure** `buildPromoEndCardSpec({format, template, when, venueName,
  instagramHandle, prizes, measure})` returns a `StoryRenderSpec`.
  - The rows are stacked, then centred in Instagram's safe zone (`STORY_SHARE_SIZES`).
  - If they don't fit, it drops the brand line, then shrinks the title (118 → 96 → 80 px).
  - The "when" line is two-tone (time in the accent). It shrinks (px → 64 → 56), then splits onto two lines.
  - Prize panel: 1 prize = big card; 2–3 = a list; more than 3 = the first 3 plus "+ N more prizes".
  - `measure` is injected so tests run without a canvas.
- `lib/promo/promoRender.ts` (browser): loads the fonts, measures with a real canvas, then calls
  `renderStoryImage` and produces a **JPEG** (quality 0.92).
- `lib/promo/promoCopy.ts`: every on-screen word.
- `components/owner/social/ShareToSocialSheet.tsx`: the `?sheet=social` sheet.
  - Hosted inside `DashboardBody` (`app/owner/dashboard/page.tsx`) so it gets `games`, `rewards` and
    `gamesAsOfMs` with **no extra request**.
  - Re-draws the picture 120 ms after any change and keeps the old one dimmed meanwhile; Share/Download only act
    on the current picture. Object URLs are revoked.
  - Share uses `shareStoryImage` (Web Share with files); Download uses `saveStoryImageToDownloads`. Both copy the
    caption to the clipboard first.
  - `ShareDetailsPanel` sits at the bottom, so the partner can set their @handle there.
- `components/owner/social/ShareToSocialEntry.tsx`: the dashboard button.
- `components/owner/share/ShareDetailsPanel.tsx`: new optional `onDetails(details)` prop, called when details
  load or save. No extra request.
- `lib/socialShare/storyCanvas.ts`: `resolveCanvasFont` and `loadCanvasFonts` are now **exported** (no
  behaviour change).
- `lib/ownerSheetParams.ts`: `"social"` added to `OWNER_SHEET_IDS`.

### 5. Facts and traps
- **The OwnerCompetition list on the dashboard may not include Pick 'Em Prize tier fields** (`pickemTiers`,
  `pickemPickLimit`): the types say they are "NOT in the shared campaign select". Without them a Pick 'Em tier
  prize falls back to the top-level prize fields and the definition's requirement text. Check against a real
  Pick 'Em prize before Phase 3. If it reads badly, add those fields to the owner competitions response.
- Live Trivia uses **cyan** (Andrew approved it on the Reel), not the player share's violet. Other accents come
  from the player share palette.
- Pick 'Em and NFL Pick 'Em are always offered ("Make your picks every week"). Squares and March Madness appear
  only while the venue has an active prize for them. Category Blitz without a schedule appears only when
  `NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT` is on.
- `/owner` never opens in the native app, so Share is the website's Web Share. Desktop browsers without
  file-sharing support show Download only.
- The full test run has **4 failures that predate this work**: the sports bingo NFL/MLB "star index snapshot
  staleness" tripwires. Those snapshots were last generated 2026-10-14 and are date-checked. Not touched here.
- `npm run lint` reports 309 errors, **all in the git-ignored `tmp/` folder**. The project's own files lint clean.
- Headless check recipe (used here): bundle a small entry that calls `renderPromoPicture` with
  `npx esbuild <entry> --bundle --alias:@=. --define:process.env.NODE_ENV='"production"' --define:process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT='""'`,
  load it in Playwright Chromium (from the repo's `node_modules`) on a page that loads Nunito and sets
  `--ht-font-body`, and save the JPEGs.

### 6. Build / test, verified vs not
- `npx tsc --noEmit`: clean.
- `npx eslint lib/promo components/owner/social …`: clean.
- `npm run test`: 480 test files pass; the 4 failures are the stale bingo snapshots above.
- New tests: `tests/lib.promo.test.ts` (23), `tests/promo-coverage-contract.test.ts` (5),
  `tests/components.share-to-social-sheet.test.ts` (5, jsdom with the renderer mocked).
- **Verified by eye** (real code, headless Chromium + Nunito): Live Trivia Post and Story with 1 prize; NFL Pick 'Em
  Story with 4 prizes (lists 3 + "+ 1 more prize"; the brand line drops to fit); Category Blitz Post with no prize
  and a long "Every Monday & Thursday · 9:30 PM" (splits onto two lines).
- **Not verified:** the sheet itself in a real browser (layout on a phone, the Share sheet on iPhone/Android,
  Download on desktop), and real venue data (especially Pick 'Em tier prizes, see §5).

### 7. Open questions for Andrew
1. Try the sheet on your dev server (`/owner/dashboard` → Share to social) and on your phone. Are one screen and
   the button's spot under Active Prizes OK?
2. Still open from Phase 0: confirm the two Pixabay links in `data/promo-sounds/originals/SOURCES.md`.

### 8. Recommended first steps for Phase 2
1. Read plan §4.1, §4.3, §6, D17–D22, and the spike HTML (`drawFrame`, `buildAudio`, the Mediabunny pipeline).
2. Add `lib/promo/promoSounds.ts` + convert the two crowd files with `afconvert` into `public/promo/sounds/`; add the
   immutable cache header; extend the coverage test so every sound has an allowed licence.
3. Build `lib/promo/promoReel.ts`: a timeline per template drawing title → when → drumroll → prize reveal → **the
   end card from `buildPromoEndCardSpec`** (render the spec onto the frame canvas for the last ~3 s), then encode.
4. Add "Reel" to `PROMO_FORMATS` in the sheet with a Sound picker and a progress bar. Hide Reel when
   `canEncodeVideo("avc")` is false.
