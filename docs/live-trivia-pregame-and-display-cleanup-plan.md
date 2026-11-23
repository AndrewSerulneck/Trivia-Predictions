# Live Trivia pre-game screen, no ads on the display, Direct-URL-only TV setup, Category Blitz yields to Live Trivia

**Status:** **LIVE 2026-11-14.** PR #16 (Phase 1) merged as `491ae015`, PR #17 (Phases 2–6 + review fixes `27d37d9a`) merged as
`536208a4`, deployed to production; `tv_pairing_codes` dropped by `20261114200841_drop_tv_pairing_codes.sql` after the deploy
(row saved in `…_PHASE_5_DROP_LOG_2026-11-14.json`). Left: real-TV check (Andrew), ~2026-11-21 poll-count compare.
Release details: `…_PHASE_6_HANDOFF.md` §Release. Phase handoffs: `docs/live-trivia-pregame-and-display-cleanup-plan_PHASE_<N>_HANDOFF.md`.

## Summary for Andrew

Four changes to the venue display (`/venue/[venueId]/screen`) and the Partner Dashboard's Display page:

1. **Pre-game screen.** 15 minutes before a Live Trivia game, the display switches to a "Live Trivia starts in 14:59"
   screen with three steps: download the app (QR code), sign in, tap **Live Trivia** (shown as the real Venue Home button).
2. **No ads on the display.** The Carrabba's pop-up was a player ad leaking onto the TV. Cause found (below); Phase 1
   blocks it, and should ship first on its own.
3. **Remove "Link a TV".** The Display page shows the venue's **Display URL** (a new short link like
   `hightopchallenge.com/tv/K7M2`), your two steps, and short Fire Stick steps. `/tv` itself redirects to `/info`; the
   pairing code and its table are deleted.
4. **Category Blitz only while someone plays it.** The display's "Next up" never shows Category Blitz (any day). The
   display shows Category Blitz only while someone is playing a round, and never while Live Trivia (pre-game, game or
   final standings) is on. When nothing is on, the display shows a gently moving screen with a QR code to download the
   app (Phase 3).

**On "avoid typing altogether":** three ways, all in the Fire Stick steps:
- **Screen mirroring** (your Step 2): nothing is typed on the TV.
- **Fire TV's phone keyboard:** when the Fire Stick's on-screen keyboard is open, a QR code appears next to it.
  Scanning it opens a page on your phone where you can **paste** the link. Phase 4 checks this on a real Fire Stick,
  because one older forum post says pasting didn't work in Silk.
- **Bookmark once:** after the first visit, Silk shows the site on its start page and in bookmarks, so there's nothing to type next time.

A shorter domain (~$10–60 a year): not now (Andrew, 2026-11-14).

## 1. Decisions already made (don't re-ask)

| # | Decision | Source |
|---|---|---|
| D1 | Pre-game screen starts **60 minutes** before the scheduled start and stays up until the game goes live. (Was 15 minutes; changed by `docs/fire-tv-app-plan.md` D13, 2026-11-22. A Category Blitz round in play keeps the screen until 15 minutes out, D14, once R2 turns Category Blitz back on.) | Andrew |
| D2 | Pre-game steps: download the Hightop Challenge app (QR), sign in, tap **Live Trivia** (shown as the Venue Home button). | Andrew |
| D3 | No ads of any kind on the display URL. Ads on the Live Trivia display may come later as a deliberate feature, never by leakage. | Andrew |
| D4 | Remove Link a TV. `/tv` → redirect to `/info`; delete pairing pages/APIs/lib/tests; a **new** migration drops `tv_pairing_codes` (`supabase db push` asks Andrew first). | Andrew (Q 2026-11-14) |
| D5 | Add a **short display link** per venue. | Andrew (Q 2026-11-14) |
| D6 | Display page copy: label **Display URL** (never "Manual Setup"); "Step 1: Copy the display URL into your device's web browser." / "Step 2: Screen mirror your device with a TV or projector." plus short Fire Stick (Silk) steps. | Andrew |
| D7 | ~~Category Blitz card hidden on Live Trivia days.~~ **Superseded (Q1):** no Category Blitz "Next up" card ever (scheduled or on-demand). No "Live Trivia today" computation. | Andrew (Q1 2026-11-14) |
| D8 | Display precedence: Live Trivia active (incl. final standings) > Live Trivia pre-game > Category Blitz (only a session in play: continuous awake, or scheduled running) > Squares > Bracket > idle. A Category Blitz round started during pre-game stays on phones only. | Andrew item 4, Q2 |
| D12 | Idle (no Live Trivia content, nobody playing Category Blitz): a gently animated screen with a QR to download the app (`APP_DOWNLOAD_URL`). Never static. | Andrew (Q1 2026-11-14) |
| D13 | Pre-game shows a small "Round 1: <category>" only when the category is set. | Andrew (Q3) |
| D14 | No short domain for now; the short link uses `hightopchallenge.com/tv/<CODE>`. | Andrew (Q4) |
| D9 | Short link shape: `hightopchallenge.com/tv/<CODE>`, 4 characters from the Crockford alphabet in `lib/tvPairingShared.ts` (`0-9A-Z` minus I L O U; ~1M codes), case-insensitive. Reuses the `/tv` path, which is already public in `proxy.ts` and served on every host by `lib/domainSplit.ts`. Bare `/tv` still → `/info`. | Planner (Andrew picked "short link"; path is the planner's choice) |
| D10 | The QR on the pre-game screen encodes `APP_DOWNLOAD_URL` (`lib/appDownloadLink.ts`, `hightopchallenge.com/app`, permanent). It already sends each phone to the right store and sends app users to sign-in. | Planner |
| D11 | Display paths get **none** of the player runtime (ads, adhesion banner, gameplay animation overlay, venue transition overlay, player analytics), not just no pop-ups. The display has its own effects engine. | Planner |

## 2. Findings (2026-11-14)

**Why the Carrabba's ad appeared (item 2):**
- `components/ui/PlayerRuntime.tsx` mounts `PopupAds` + `MobileAdhesionAd` on every path where
  `isPlayerRuntimePath()` (`lib/playerRuntimePaths.ts`) is true. Only `/owner` and `/admin` are excluded, so
  `/venue/<id>/screen` and `/tv` count as player paths.
- `PopupAds`'s `resolvePageKey` matches `/^\/venue\/[^/]+/`, so the display resolves to page key `venue`.
- Production row `advertisements.id = 374a6bcb-7e51-423e-9b8b-cbc625870caf` (Carrabba's, `popup-on-entry`, `page_key
  venue`, `display_trigger on-load`, venue `venue-carrabba-s-italian-grill-east-brunswick`, active) therefore fires on
  every display load at that venue. `MobileAdhesionAd` matches `/venue/` the same way. The ad row is fine; the client
  bug is the fix. **Don't touch the ad row.**
- `tests/player-runtime-contract.test.ts:36` currently *asserts* `/tv` is a player path. It has to change.
- The dashboard preview iframe (`app/owner/display/page.tsx` `ScaledPreview` / `FullscreenExpander`) loads the same
  screen URL, so partners could see the ad there too.

**Link a TV (item 3):** `tv_pairing_codes` holds 1 row ever (2026-10-12), 0 claimed. Nobody depends on it. Surface:
`app/tv/page.tsx`, `components/venue-screen/TvPairingDisplay.tsx`, `lib/tvPairing.ts`, `lib/tvPairingShared.ts`,
`app/api/tv-pair/route.ts`, `app/api/tv-pair/[code]/route.ts`, `app/api/owner/tv-pair/claim/route.ts`, tests
`tests/lib.tvPairing.test.ts`, `tests/api.tv-pair.test.ts`; mentions in `proxy.ts:51-53`, `lib/domainSplit.ts:151-155`,
`lib/nativeAppLinks.ts:24`, `app/in-app-notice/[page]/page.tsx`, `lib/useKeepScreenAwake.ts`,
`lib/email/sendVenueAddedEmail.ts:26` (`tvSetupUrl: gameUrl("/tv")`), migrations `20260713140000_tv_pairing_codes.sql` and
the grants baseline. Partner page: `app/owner/display/page.tsx` (Link a TV card lines ~141-198, "Manual setup" accordion ~201-240).

**Display state (items 1 and 4):** `lib/venueScreen.ts` `getVenueScreenState` → `selectVenueScreenState`. Live Trivia
already beats Category Blitz while `liveTrivia.isGameActive`. There is no pre-game state. The idle "Next up" carousel
(`IdleVenueScreen.tsx` → `TvIdleAttract.tsx`) adds a Category Blitz card from `nextCategoryBlitz` (scheduled venues)
or `categoryBlitzOnDemand` ("Play anytime / Start it on your phone", continuous venues asleep). That card is the "Category
Blitz game button under Next up". `getLiveShowdownState(...).nextSchedule` already carries `startTime`, `timezone`,
`title`, `firstRoundCategory`, `recurringDays`, so the pre-game window needs **no new database read**.
- Production flags: `NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT` set; `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM` **not
  set**, so a venue's display only shows its own players' Category Blitz. "Someone actively playing" = at this venue.
- The TV only **peeks** at Category Blitz (`peekCategoryBlitz`); it must never start a round (Category Blitz standing rules,
  `tests/category-blitz-sleep-contract.test.ts`). The scheduled fallback path calls `driveVenueCategoryBlitz`; leave that alone.
- The go-live takeover (`VenueScreenClient.tsx`, `previousMode` in the poll effect) fires on a poll-observed change into
  `live-trivia`/`category-blitz` from another mode. A new pre-game mode must keep it firing at the real start
  (pre-game → live-trivia) and never on reload.
- The Venue Home button art: `GAME_TILE_THEMES.live_trivia` in `components/game-themes/gameTileThemes.tsx` (already
  used by `TvIdleAttract`); the phone tile is rendered in `components/venue/VenueGamesPanel.tsx`.

## 3. Constraints every phase keeps

- Read the Standing rules in `docs/venue-display-hype-and-intro-stinger-plan.md` §8 (stinger, `useFx` keys, tiers,
  reduced motion, keep-awake) and `docs/game-themes-plan.md` (a theme styles the name, never rewords it).
- Tailwind only, except `components/venue-screen/*` (tokens `lib/venueScreenBrand.ts`). No text under 12px. Nunito.
  Minimal copy. "Prize", never "Reward".
- Dev and production share one database. Browser-test from a scratchpad clone with no `.env.local` and mocked routes.
  Never use Andrew's `:3000` server, never `pkill next`.
- Migrations are new files only; grant rules per `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; `db push` only with
  Andrew's go-ahead.
- `/owner`, `/tv`, `/admin` never open in the native app (`docs/native-app-store-plan.md` Standing rules). `/tv/<code>` stays web-only.

## 4. Phases

| Phase | What | Model | Effort | Why |
|---|---|---|---|---|
| 1 | Block ads and player runtime on display paths | Sonnet 5.5 | medium | Small, well-specified; the trap is the existing contract test |
| 2 | Display state: pre-game mode, Live Trivia priority, Category Blitz suppression | Opus 5.5 | high | Shared display engine, timezone date logic, takeover timing |
| 3 | Pre-game screen UI | Sonnet 5.5 | high | Well-specified UI, but display effects rules are easy to break |
| 4 | Short display link + Display page rewrite + Fire Stick steps | Opus 5.5 | high | Migration + backfill + public redirect route + partner page |
| 5 | Remove Link a TV (code, then table) | Sonnet 5.5 | medium | Mechanical deletions; the table drop is one guarded migration |
| 6 | Verify, release, docs | Sonnet 5.5 | medium | Checklists, deploy, rule updates |

Order: **1 ships alone first** (live bug). 2 → 3. 4 → 5. Branches 2–3 and 4–5 can run in parallel. 6 last.

### Phase 1 — No ads on the display

1. `lib/playerRuntimePaths.ts`: add `isVenueDisplayPath(pathname)`, true for `/venue/<id>/screen` (and anything below it),
   `/tv`, `/tv/<anything>`. `isPlayerRuntimePath` returns false for those. Keep "fails open" for `null`. (The screen
   is server-rendered with a real pathname, so `null` only happens before hydration and the next render corrects it.
   Note this in the comment.)
2. Defense in depth: `PopupAds` and `MobileAdhesionAd` `resolvePageKey` return `null` / skip for `isVenueDisplayPath`, so a
   future refactor of `PlayerRuntime` can't bring the ad back.
3. Update `tests/player-runtime-contract.test.ts` (remove `/tv` from the player list; add display paths to the
   non-player list). Add `tests/venue-display-no-ads-contract.test.ts`: the predicate excludes display paths; both ad
   components bail on them; nothing under `components/venue-screen/` or `app/venue/[venueId]/screen/` imports
   `lib/ads`, `PopupAds`, `MobileAdhesionAd` or `/api/ads/`.
4. Check: `npm run test`, `npx tsc --noEmit`, `npm run lint`; scratchpad-clone browser check of `/venue/x/screen` with
   `/api/ads/slot` mocked to return the Carrabba's row → no pop-up, no network call to `/api/ads/slot`.

**Done when:** no request to `/api/ads/*` from the display or the dashboard preview; Venue Home still shows its ads.

### Phase 2 — Display state

1. `lib/venueScreen.ts`: new mode `"live-trivia-pregame"` with
   `pregame: { gameId, title, startsAt, firstRoundCategory }`, where `gameId = scheduleId:occurrenceDate` (same shape
   the live mode uses).
   Selected when `!liveTrivia.isGameActive && nextSchedule && startsAt - 15 min <= now < startsAt`. Constant
   `LIVE_TRIVIA_PREGAME_LEAD_MS = 15 * 60_000` in `lib/venueScreenTiming.ts`.
2. Precedence per D8. Category Blitz mode only when nothing Live Trivia is on. Squares/bracket reads stay gated on
   `wouldBeIdle`, which now also requires not pre-game.
3. ~~"Live Trivia today" (D7).~~ **Amended (Q1):** drop `idle.nextCategoryBlitz` and `idle.categoryBlitzOnDemand`
   entirely, and the Category Blitz card in `IdleVenueScreen`. The scheduled-engine `listSchedules` read (only used for
   that preview) goes too. **Done.**
4. Client: `VenueScreenClient` renders the new mode (placeholder panel until Phase 3); `getScreenTransitionKey` →
   `ltp:<gameId>`; `modeToGameLabel` → `"Live Trivia"`; header chip "Live Trivia". The go-live takeover must fire on
   pre-game → live-trivia (it does if detection is "mode changed into a live mode"; confirm and pin with a test) and
   must **not** fire on idle → pre-game. **Done as:** the old check was `previousMode === "idle"` only, so pre-game →
   live would NOT have fired; now `isGoLiveTransition` (`lib/venueScreenTiming.ts`). `modeToGameLabel` stays null for
   pre-game; the header chip reads "Live Trivia" and the theme is Live Trivia's.
5. Poll pace (`getVenueScreenPollIntervalMs`): pre-game 10 s; in the last 60 s, 2 s so go-live lands on time.
6. Debug: add `"live-trivia-pregame"` to `VENUE_SCREEN_DEBUG_MODES` and `applyVenueScreenDebugMode`.
7. Tests (`tests/lib.venueScreen*.test.ts`): window edges (15:00 before, 0:00, game active, final window); Category Blitz
   awake during pre-game → pre-game wins; Category Blitz awake with no Live Trivia → Category Blitz; no Category Blitz
   on the idle payload; peek-only contract still passes. (The "today"/midnight tests are dropped with D7: the window
   is plain millisecond math on the engine's occurrence start.)

**Cost:** no new reads per poll (one fewer for scheduled-mode Category Blitz venues: `listSchedules` removed). Extra polls only during pre-game: ~14 min ÷ 10 s + 60 s ÷ 2 s ≈ 114 instead of ~45 at
idle → **~70 extra function calls per display per game**. At 100 venues × 7 games/week that is ~30k calls/month,
negligible on current billing. Measure after release with a log counter (no Observability Plus).

### Phase 3 — Pre-game screen

1. `components/venue-screen/TvLiveTriviaPregame.tsx`, rendered for the new mode. Layout (16:9, one focal point):
   - Top: "Live Trivia" + big countdown `mm:ss` to `startsAt` (reuse `formatIdleCountdown` / the idle flip digits; heartbeat under 5 min per Phase 4 of the hype plan).
   - Three numbered steps, few words: **1 Get the app** + QR (`QRCodeSVG` from `qrcode.react`, value
     `APP_DOWNLOAD_URL`, caption `APP_DOWNLOAD_DISPLAY_URL`), **2 Sign in**, **3 Tap Live Trivia** + a non-interactive
     replica of the Venue Home Live Trivia tile built from `GAME_TILE_THEMES.live_trivia` and `gameTileTitleLines`
     (extract a shared presentational tile from `VenueGamesPanel` if needed, so the TV and phone can't drift apart).
   - Small line: first round category if known ("Round 1: History") (D13). Phase 2 already sends
     `pregame.firstRoundCategory` (null when unset).
   - Copy says "Tap", not "click" (phones). Final wording for Andrew's review in the handoff.
2. Effects: ambient `BrandStage`; one entrance moment keyed `pregame:<gameId>` via `useFxMoment`; QR stays perfectly
   still and high-contrast (never covered or animated, keep a quiet zone); reduced-motion and `lite`/`off` tiers; burn-in drift.
3. Check at 1920×1080, 3840×2160, the 1280×720 dashboard preview and Expand on a phone; QR scans from ~4 m on a 55"
   TV (test with a phone on a monitor at equivalent size); text ≥12px.
4. Accelerated-clock Playwright run: idle → pre-game at T-15:00 (no takeover) → countdown → live at T-0 (takeover fires once).
5. **Idle screen (D12, added 2026-11-14).** Replace the `TvIdleAttract` "Next up" carousel's job with an app-download
   attract: one focal QR (`QRCodeSVG`, value `APP_DOWNLOAD_URL`, caption `APP_DOWNLOAD_DISPLAY_URL`) with "Get the app"
   (few words), gentle motion around it (ambient `BrandStage`, the existing 75 s idle moment, wordmark shine, burn-in
   drift), the QR itself never moving or covered. Default (Q5): if a Live Trivia game is scheduled, keep one small
   line with its day/time or countdown (reuse `getIdleGameDisplay`); otherwise just the QR. Drop the "Live Trivia ·
   Category Blitz" tagline (`TvIdleAttract.tsx`). Keep the idle contract tests (`tests/venue-screen-idle-*`) passing
   or update them for the new layout. Venue sponsor slots (`idle.sponsorSlots`) are the partner's own, not ads: keep
   whatever the current screen does with them.
6. Remove the Phase 2 placeholder `LiveTriviaPregamePanel` in `VenueScreenClient.tsx`.

### Phase 4 — Short display link + Display page

1. Migration (new file): `venues.display_code text unique` (check `^[0-9A-HJKMNP-TV-Z]{4}$`), backfill every existing
   venue with a unique random code, and a `before insert` trigger that fills it for new venues (retry on collision). No
   new table → no new grants; confirm `tests/supabase-migration-grants-contract.test.ts` and the SECURITY DEFINER rule
   (the trigger function should be plain `SECURITY INVOKER`). Backfill log → `docs/live-trivia-pregame-and-display-cleanup-plan_PHASE_4_BACKFILL_LOG_<date>.json`
   (pattern of earlier backfill logs). `db push` only after Andrew approves.
2. `app/tv/[code]/route.ts` (GET): normalize case, look up `display_code` via `supabaseAdmin`, 307 →
   `gameUrl("/venue/<id>/screen")`; unknown code → `/info`. `app/tv/page.tsx` → redirect `/info` (replaces the pairing
   page; done in this phase so `/tv` never 500s once Phase 5 deletes the APIs). Keep `/tv` public in `proxy.ts` and
   host-agnostic in `lib/domainSplit.ts`; update their comments.
3. `/api/owner/venues` (or the display page's own read) returns `displayCode`; owner-scoped as today.
4. `app/owner/display/page.tsx`: delete the Link a TV card, claim state and `normalizePairingCode` import; delete the
   "Manual setup" accordion. New single card:
   - Label **Display URL**, the short URL (`hightopchallenge.com/tv/K7M2`), **Copy** button ("Copied").
   - "Step 1: Copy the display URL into your device's web browser."
   - "Step 2: Screen mirror your device with a TV or projector."
   - Collapsible **Amazon Fire Stick** (draft, keep this short):
     1. Open **Silk Browser** (free in the Fire TV app store).
     2. Select the address bar. Scan the QR code beside the keyboard with your phone and paste the display URL, or type it.
     3. Bookmark it for next time.
   - Keep Preview + Expand as they are.
5. `lib/email/sendVenueAddedEmail.ts`: `tvSetupUrl` → the Display page (`/owner/display`) or the venue's short link;
   update `tests/lib.email.venueAddedEmail.test.ts`.
6. **Real-device check (needs Andrew or a Fire Stick):** confirm the keyboard-QR paste works in Silk today, and that
   Silk opens the screen full-screen. If paste doesn't work, drop "paste" from step 2 (type only) and record it.
7. Tests: code format/normalize; route redirects (known, lowercase, unknown); display page contract (no "Link a TV",
   no "Manual setup", has "Display URL" and both step lines).

**Done as (2026-11-14):** migration `20261114190044_venue_display_code.sql` applied to production (Andrew approved;
16/16 venues have unique codes). The trigger fills a NULL code on insert **or** update of `display_code`, and the
column is `NOT NULL`. Bare `/tv` is a route handler (`app/tv/route.ts`, 307), not a page. The display codes come from
`GET /api/owner/venues?with=displayCode`. The email button opens `/owner/display`. The Fire Stick paste check (step 6) still needs Andrew.

### Phase 5 — Remove Link a TV

**Done as (2026-11-14):** steps 1, 2 and 4 done; step 3 (drop migration) intentionally not written yet. The Crockford move was already done in Phase 4 (`lib/displayCode.ts` has its own copy), so `lib/tvPairingShared.ts` was simply deleted.

1. Delete: `components/venue-screen/TvPairingDisplay.tsx`, `lib/tvPairing.ts`, `app/api/tv-pair/route.ts`,
   `app/api/tv-pair/[code]/route.ts`, `app/api/owner/tv-pair/claim/route.ts`, `tests/lib.tvPairing.test.ts`,
   `tests/api.tv-pair.test.ts`. Move the Crockford alphabet / `normalize` used by Phase 4 out of
   `lib/tvPairingShared.ts` into `lib/displayCode.ts` first, then delete `lib/tvPairingShared.ts`.
2. Clean mentions: `proxy.ts`, `lib/domainSplit.ts`, `lib/useKeepScreenAwake.ts`, `app/in-app-notice/[page]/page.tsx`,
   `lib/nativeAppLinks.ts` (keep `/tv` web-only), the intro-stinger and brand-chrome contract tests that reference `/tv`,
   and `docs/venue-display-hype-and-intro-stinger-plan.md` §8 (`/tv` keep-awake line). Leave the untracked
   `tests/* 2.ts` duplicates alone (not ours; ask Andrew).
3. After the code deploy is live: new migration `drop table if exists public.tv_pairing_codes;` (`db push` asks Andrew).
   Dropping after deploy means the old deployment never queries a missing table.
4. `grep -rn "tv_pairing\|tvPairing\|tv-pair\|Link a TV\|TvPairing"` returns only migration history and this plan.

### Phase 6 — Verify and release

1. `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (not at the same time as typecheck).
2. Scratchpad-clone browser pass of every display mode, including pre-game at 15:00 / 4:59 / 0:01, and the Display page at 350 px and 289 px.
3. PR, `/code-review`, merge, deploy; check both domains serve `/tv/<code>` and the display has no `/api/ads` calls.
4. Real TV: Andrew opens the short link on a Fire Stick at a venue with a Live Trivia game; watches pre-game → go-live.
5. Docs: add **Standing rules** to this plan (below) and a `CLAUDE.md` feature-rules row; update `SYSTEM_CONTEXT.md`
   §0 item 2 (Direct URL only, short link) and §5 (ads never on display paths).
6. ~1 week after release: compare display poll counts against the Phase 2 estimate.

## 5. Risks

- **Takeover timing:** the pre-game mode could swallow or double the go-live burst. Pinned by the Phase 2 test and the Phase 3 clock run.
- **Fire TV paste** may not work in Silk. The fallback is typing a 26-character link; step text adjusts in Phase 4.
- **Short codes are guessable** (~1M space). They only reveal a page that is already public (the display), so there's no
  rate limit. Never put anything private on the display.
- **Fails-open predicate:** a `null` pathname briefly mounts the runtime before hydration. The Phase 1 ad-component guards cover it.

## 6. Open questions for Andrew

**Answered 2026-11-14** (recorded as D7 superseded, D8, D12–D14): Q1 → no Category Blitz "Next up" card at all;
Category Blitz shows only while someone plays it; otherwise a gently animated screen with an app-download QR. Q2 → yes.
Q3 → yes, small, only if known. Q4 → no domain yet.

- **Q5 — answered 2026-11-14 (Andrew): yes.** The idle app-download screen keeps one small line for the next scheduled
  Live Trivia game ("Live Trivia · Thursday 8:00 PM"; "Today"/"Tomorrow" when it is), only when one is scheduled.

## 7. Standing rules (Phase 6, 2026-11-14)

- No ads, adhesion banners, player animations, transition overlay or player analytics on display paths
  (`isVenueDisplayPath`); a future Live Trivia display ad is its own feature, not the player ad runtime.
- Display precedence is D8 and lives only in `selectVenueScreenState`. Since 2026-11-22 (`docs/fire-tv-app-plan.md`
  Phase 9): Live Trivia > pre-game's last 15 min > Category Blitz > pre-game 60→15 min > Squares > Bracket > idle;
  Category Blitz, Squares and Bracket are switched off on every display (`VENUE_SCREEN_RESERVED_GAMES_ENABLED`, D21)
  until reserved phase R2.
- The display never offers Category Blitz as "Next up"; it shows Category Blitz only while a session is in play.
- The pre-game window is `LIVE_TRIVIA_PREGAME_LEAD_MS` (60 minutes since 2026-11-22, `docs/fire-tv-app-plan.md` D13); the
  go-live takeover fires at the real start, never at pre-game start.
- The TV only peeks at Category Blitz.
- Set up by Display URL (`hightopchallenge.com/tv/<display_code>`), or by connecting the Hightop Challenge TV app (QR or
  display code); a connection grants a venue id only (`docs/fire-tv-app-plan.md` D2, D9, Phase 3, 2026-11-22).
- Idle is the carousel (`docs/fire-tv-app-plan.md` D20, Phase 11): Next Live Trivia, Pick 'Em board, All-Time Leaderboard,
  Prizes, Get the app; 15 s each; slides with nothing to show skip themselves. The ticker (D15) shows only on the carousel,
  never on a Live Trivia or Category Blitz screen. The corner "Get the app" QR (D16, `TvAppDock`) shows on carousel slides
  1–4, the pre-game (its step 1), and the Live Trivia round break and final standings; never on a question, a reveal, a
  Category Blitz round or the Connect screen. It never moves, is never covered, and the stage twinkles stay off every screen
  that carries it. Every display screen says "Hightop Challenge" in full, never "Hightop" alone. Rules in `lib/tvCarousel.ts`.
