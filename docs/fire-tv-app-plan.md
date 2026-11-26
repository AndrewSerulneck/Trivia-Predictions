# Fire TV app plan ("Hightop Challenge TV")

**Status:** Plan written 2026-11-21. **Phase 7: 1.0.0 (vc1) submitted 2026-11-23** (no DRM, Fire TV only; App ID `amzn1.devportal.mobileapp.40a765b23bb84ce49109cafe420be156`). **Phase 8b done 2026-11-23:** `npm run fire-tv:release` (see `native-tv/scripts/release.cjs`; keys `AMAZON_APPSTORE_CLIENT_ID/_SECRET` in `.env.local`; dry-run verified; Amazon blocks it while a release is in review). **Phase 1 done 2026-11-21** (mockups, handoff
`docs/fire-tv-app-plan_PHASE_1_HANDOFF.md`). **Phase 2 done 2026-11-22** (round 1 → D10–D20, round 2 → D21–D25).
**Phases 3 and 4 merged and deployed 2026-11-22** (PRs #36, #37; handoffs `_PHASE_3_HANDOFF.md`, `_PHASE_4_HANDOFF.md`).
**Phase 5 moved to the end (D34): Andrew reviews the store build once Amazon approves it**; an emulator smoke test ran instead and fixed the
Back-after-demo keyboard bug. **Phase 6 done 2026-11-22** (ahead of Phase 5): upload key, signed release APK, store
images, screenshots and `docs/fire-tv-store/listing.md`. See `docs/fire-tv-app-plan_PHASE_6_HANDOFF.md`. Signing
keys backed up 2026-11-22 (an encrypted image in iCloud Drive; handoff §2). Phase 6 merged via PR #38. Phase 7
(submit) waits for Phase 5 to pass. **Phase 9 merged and deployed 2026-11-23** (PR #39, `92af7e06`; data off until
Phase 11 flips `TV_CAROUSEL_DATA_ENABLED`; migration `20261122174439_tv_sports_snapshot.sql` applied to production
2026-11-23; the 3–7 day usage baseline started at deploy). See `docs/fire-tv-app-plan_PHASE_9_HANDOFF.md`.
**Phase 10 built 2026-11-23** on `feat/fire-tv-phase-10` (PR #41; Pick 'Em Live Board + All-Time Leaderboard slides; preview only,
via `?mode=carousel&slide=pick-em|all-time`, until Phase 11 rotates them). See `docs/fire-tv-app-plan_PHASE_10_HANDOFF.md`.
**Phase 11 merged and deployed 2026-11-23** (PR #49; carousel, ticker, "Get the app" QR, pre-game title; carousel data switched ON; `docs/fire-tv-app-plan_PHASE_11_HANDOFF.md`). **2026-11-23:** Andrew answered the Phase 9/10 questions: the Prizes slide drops its progress bar (D28); the NHL Pick 'Em
start-time bug is now phases N1–N3 of this plan (D29). Two tests fail on `main` and turn every PR's CI red
(including #41); the fixes are phases T1–T2 (D30). **T1 done 2026-11-23 (PR #43 merged; `docs/fire-tv-app-plan_PHASE_T1_HANDOFF.md`).** #41 merged 2026-11-23. **T3 done 2026-11-23 (PR #45; `docs/fire-tv-app-plan_PHASE_T3_HANDOFF.md`).** **T2 done and live 2026-11-23 (PRs #45, #46 merged; first run 45268818494 committed `467fcd35`; `docs/fire-tv-app-plan_PHASE_T2_HANDOFF.md`).** **N1 done 2026-11-23 (read-only; fix chosen, D33; no NHL picks exist; `docs/fire-tv-app-plan_PHASE_N1_HANDOFF.md`).** **N2 merged 2026-11-23 (PR #48; `docs/fire-tv-app-plan_PHASE_N2_HANDOFF.md`).** **2026-11-23: device reviews (Phases 5 and 12) moved to the end, on the store build (D34).** **N3 done 2026-11-23 (`docs/fire-tv-app-plan_PHASE_N3_HANDOFF.md`; D29 closed; one follow-up oddity noted).** **T4 built 2026-11-23 (PR #51 merged 2026-11-24, `72ff0638` + `287a1951`; `docs/fire-tv-app-plan_PHASE_T4_HANDOFF.md`; D35).** **T4 reviewed 2026-11-23 (two passes): the fix is right, but its new test can't catch the bug, plus four smaller issues → remedial phases T4.1 (finish T4 on PR #51) and T4.2 (pre-existing Quick Review bugs); D36.** **2026-11-23: no other phase of this plan has had a code review** (no PR review, no handoff mentions one), so review phases CR1–CR3 were added (D37). **T4.1 done 2026-11-24 (on PR #51; `docs/fire-tv-app-plan_PHASE_T4.1_HANDOFF.md`).** **T4.2 done 2026-11-24 (PR #52 merged; `docs/fire-tv-app-plan_PHASE_T4.2_HANDOFF.md`).** **CR1 done 2026-11-24 (PR #54; read-only; nothing urgent; findings F7–F43 under "CR1 review findings"; remedial phases CR1.1–CR1.7 approved by Andrew 2026-11-24, F41 yes, CR1.2 and CR1.6 in `docs/bingo-pickem-reliability-plan.md`; `docs/fire-tv-app-plan_PHASE_CR1_HANDOFF.md`).** **CR1.1 done 2026-11-24 (`docs/fire-tv-app-plan_PHASE_CR1.1_HANDOFF.md`).** **CR1.2 done 2026-11-24 (`docs/bingo-pickem-reliability-plan_PHASE_CR1.2_HANDOFF.md`); it added CR1.2.1 (F44, NFL screen) to the Pick 'Em plan, awaiting Andrew's OK.** **CR1.3 done 2026-11-24 (PR #59 merged; `docs/fire-tv-app-plan_PHASE_CR1.3_HANDOFF.md`).** **CR1.4 done 2026-11-24 (PR #60 merged; D38; `docs/fire-tv-app-plan_PHASE_CR1.4_HANDOFF.md`).** **CR1.5 done 2026-11-25 (PR #61 merged; `docs/fire-tv-app-plan_PHASE_CR1.5_HANDOFF.md`).** **CR1.6 done 2026-11-25 (`docs/bingo-pickem-reliability-plan_PHASE_CR1.6_HANDOFF.md`).** **CR2 done 2026-11-25 (read-only; nothing urgent; findings F45–F66 under "CR2 review findings"; remedial phases CR2.1–CR2.3 awaiting Andrew's OK; `docs/fire-tv-app-plan_PHASE_CR2_HANDOFF.md`).** Next: CR3; CR2.1–CR2.3 once Andrew says yes (CR2.2 before CR1.7); CR1.7 waits for Amazon; everything else waits for Amazon's approval. The phase table under "Phases, model and effort" is in
run order (2026-11-23); work down it.
Handoff notes go next to this file as `docs/fire-tv-app-plan_PHASE_<N>_HANDOFF.md`.

## Summary for Andrew

Today a partner shows the venue display on a Fire TV Stick by opening Silk, signing in, clicking **Display** and
copying the URL. This plan adds an Amazon Appstore app, **Hightop Challenge TV**, that does it in one step:

1. Plug in the Fire TV Stick and open **Hightop Challenge TV**.
2. The TV shows a QR code. Scan it with the phone you use for the partner dashboard and tap **Connect**. You can also
   type your 4-character display code with the remote.
3. The TV shows the venue display from then on, including after it's turned off and on.

**What the TV shows at launch (D21):** Live Trivia and Pick 'Em only. Category Blitz, Super Bowl Squares and
March Madness screens are kept but switched off until you say go (reserved phase R2).
- During Live Trivia it shows the screens it shows today.
- For the hour before Live Trivia it shows only the pre-game screen: a big "LIVE TRIVIA", the countdown and the
  "Get the app" QR.
- Between games it shows a **rotating carousel** of "sports bar" screens that keep the room looking up and get
  watchers to scan in:
  1. **Next Live Trivia** ("Every Thursday · 8:00 PM").
  2. A **Pick 'Em Live Board** with the games that matter most at that bar right now.
  3. The bar's **All-Time Leaderboard**.
  4. **Prizes up for grabs**.
  5. **Get the app**.
- A **score ticker** runs along the bottom of the carousel, never over Live Trivia or Category Blitz.
- Every screen except live questions and the Connect screen has a **"Get the app" QR** in the same corner.
- Bingo **"Closest to Bingo"** is designed but reserved. It isn't built until you say go.

**The app is a thin shell around the website.** The screens stay on hightopchallenge.com. So any screen we improve
later reaches every TV automatically, without an app update or another Amazon review.

**Two kinds of Fire TV Stick.** Most sticks run **Fire OS** (based on Android). Some newer ones run **Vega OS**, which
can't run Android apps. We build and launch the Fire OS app first. A Vega version follows on the same store listing,
and you'll need a Vega stick (about $30–40) to test it.

**Amazon rejection risk.** Amazon rejects apps that are "just a website". This app does things a browser tab can't:
- Its own connect screen.
- The screen never sleeps (fixed natively, not with browser tricks).
- Full remote control support.
- A "can't connect" screen that recovers by itself.
- A **Try demo** button so Amazon's reviewers can see a game without a venue account.

**What you do yourself:**
- Phase 2: review the mockups.
- Phase 5: once Amazon approves the app, install it from the Appstore on a Fire Stick and test it.
- Phase 7: submit the app to Amazon.
- Phase 12: check the sports screens on a real TV (same day as Phase 5 if it's a game day).
- Phase 14: test the Vega version and submit it.
- Say yes when an agent asks to change the database (once, in Phase 3).

Every step for each of these is in **"Andrew's steps"** below.

**Cost:**
- **Money:** $0 to Amazon, plus a Vega stick (about $30–40).
- **Hosting:**
  - A TV running the app costs the same as the same TV running the Display URL in Silk today.
  - Connecting a TV costs a few hundred tiny requests, once.
  - The sports screens reuse data our existing jobs already collect. They add no new paid sports-data calls and no
    new scheduled jobs.
  - Phase 9 measures today's usage before anything is built and tells you if the sports screens would change the
    bill.

## How connecting a TV works (plain English)

The TV never signs in, and it never needs your password.

1. The app opens on a **Connect** screen. It shows a QR code made just for that TV, which expires after 10 minutes.
2. You point your phone camera at it. Your phone opens a Hightop Challenge page, like scanning a menu QR code.
3. If your phone is already signed in to the partner dashboard (sign-in lasts 90 days on a phone), the page shows
   your venue name and a **Connect** button. If you have more than one venue, you pick one first. If you aren't signed
   in, you sign in with your email and password once, and the page comes back.
4. When you tap **Connect**, your phone tells our server "the TV showing this QR code belongs to my venue". The TV
   asks the server every few seconds whether anyone has connected it. Within about 3 seconds it gets the answer and
   switches to your display.
5. The TV remembers your venue. From then on, opening the app goes straight to your display. You can switch venues
   from the remote's **Menu** (☰) button.

**Why it's safe:** the TV only gets your venue's display, which is already public (anyone with your Display URL can
see it). The TV is never signed in to your account. So nobody at the bar can use it to get into your dashboard.

**The typing option:** your 4-character display code (the one in hightopchallenge.com/tv/K7P2) already identifies the
venue's display. Typing it with the remote connects the TV the same way, with no phone. The QR code is the main
option, because typing with a remote is slow. The code is a backup when no signed-in phone is around.

**One catch:** a phone camera opens your phone's default browser (Safari on iPhone). If you use the dashboard in a
different browser, you'll be asked to sign in once.

## Decisions

| # | Decision | Who / when |
|---|---|---|
| D1 | Fire OS app first. A Vega OS build follows on the same Appstore listing. | Andrew, 2026-11-21 |
| D2 | Both ways to connect are on one TV screen: **phone QR (main)** and **typing the 4-character display code (backup)**. This replaces the "Display URL only, no pairing" rule (`docs/live-trivia-pregame-and-display-cleanup-plan.md` D4 / Standing rules). The Display URL in Silk keeps working unchanged. | Andrew, 2026-11-21 ("ease, speed and simplicity are paramount") |
| D3 | All four sports concepts get mockups first: Pick 'Em Live Board, Bingo "Closest to Bingo", ticker rail, rotating idle carousel. Andrew picks, edits or cuts each one before any build. | Andrew, 2026-11-21 |
| D4 | Uses Andrew's existing Amazon developer account. The store title is **Hightop Challenge TV**. | Andrew, 2026-11-21 |
| D5 | The app is a thin native shell. Every screen is a web page on hightopchallenge.com, and the app's start page is `/tv-app`, shared by the Fire OS and Vega builds. | Planner, 2026-11-21. Reason: one set of screens, and no app update or Amazon review per screen change. |
| D6 | The TV app identifies itself with its own user-agent token, `HightopChallengeTV/<version>`, read only by a new `lib/tvApp.ts`. It must never send `HightopChallengeApp/`, the phone app's token, or `proxy.ts` would swap the display for the "web only" notice. | Planner. Reason: the phone app is players-only (`docs/native-app-store-plan.md` Standing rules). |
| D7 | Native value for Amazon review: connect screen, native keep-awake (`FLAG_KEEP_SCREEN_ON`), D-pad / Back / Menu handling, a native offline screen with auto-retry, and **Try demo**. | Planner. Reason: Amazon's "goes beyond a simple website" rule. |
| D8 | The sports screens read only rows that existing crons already write: no new cron, no new API-Sports calls, no per-TV provider calls. **Relaxed by D27** (feed calls allowed, only while a TV is on, shared by all TVs). | Planner. Reason: global cost rule. |
| D9 | A connection gives the TV a venue id only, never a partner session or any partner privilege. | Planner. Reason: the display is public data, and a TV sits in a public room. |
| D10 | **Name:** every TV screen says **"Hightop Challenge"** in full, never "Hightop" alone. **Connect screen:** the two ways to connect sit side by side as equal choices, labelled **"Option 1 · Scan with your phone"** and **"Option 2 · Type your display code"**, with a gold **OR** between them, so nobody thinks they need both. Try demo stays a small button top right. | Andrew, 2026-11-22 (asked for "Method #1 / #2 or something like that"; planner chose "Option", easy to change) |
| D11 | **New carousel slide: All-Time Leaderboard.** The venue's top 10 by all-time points (the same `users.points` the player leaderboard's all-time view reads, `getLeaderboardForVenue` in `lib/leaderboard.ts`). Gold #1 only. Skipped when fewer than 3 players have points. The ticker shows on it. | Andrew, 2026-11-22 |
| D12 | **Next Live Trivia slide:** "LIVE TRIVIA" is the largest text on the slide. The line under it follows the wording rules in Phase 9 step 3 (for example, a weekly Thursday game on a Tuesday reads **"Every Thursday · 8:00 PM"**). | Andrew, 2026-11-22. He asked whether "every Thursday" exists today: partly. The state already carries the schedule's `recurringDays`, but the idle line (`lib/venueScreenIdleLine.ts`) only says "Live Trivia · Thursday 8:00 PM", even when the game is 9 days away. |
| D13 | **Final hour:** from 60 minutes before a scheduled Live Trivia game, the TV shows only the pre-game screen (today's `TvLiveTriviaPregame`, which already has the countdown and the "1 Get the app" QR), with a big "LIVE TRIVIA" title added. The window grows from 15 to 60 minutes (`LIVE_TRIVIA_PREGAME_LEAD_MS`). No carousel, no ticker in that hour. This replaces D1 ("15 minutes") of `docs/live-trivia-pregame-and-display-cleanup-plan.md`. | Andrew, 2026-11-22 (chose "stretch the pre-game screen" over a second, similar slide) |
| D14 | **Precedence in the final hour (planner recommendation, not yet confirmed by Andrew):** from 60 to 15 minutes before the start, a Category Blitz round people are already playing keeps the screen (it's a live game; cutting it off would hide a round in progress). In the last 15 minutes pre-game wins, as today. Squares and Bracket yield to pre-game for the whole hour. | Planner, 2026-11-22. Reason: D13 would otherwise hide up to 45 minutes of live Category Blitz play. Andrew can overrule in round 2. |
| D15 | **Ticker:** only on the idle carousel slides (all five, including the All-Time Leaderboard). **Never** on any Live Trivia screen (questions, reveals, standings, round breaks, pre-game) or any Category Blitz screen. Also off on Squares and Bracket (they are scoreboards of their own; planner choice). On the Pick 'Em slide the ticker skips games already on the board. | Andrew, 2026-11-22 (agreed with the no-ticker-during-questions recommendation and extended it to every in-game Live Trivia screen); Squares/Bracket and skip-on-board are planner choices. |
| D16 | **"Get the app" QR on every screen** (`hightopchallenge.com/app`, the existing `AppDownloadQr` and `APP_DOWNLOAD_URL`), in one fixed bottom-right spot: every carousel slide (big on slide 5), pre-game (step 1, as today), Live Trivia standings, round breaks and final standings, Category Blitz intermission and results, Squares, Bracket. **Not** on Live Trivia questions or answer reveals, Category Blitz rounds, or the Connect screen. **One QR per screen:** it replaces the Pick 'Em board's "Scan to play" join QR. `/app` already sends phones to the store with a "No thanks, play in the browser" link, so nobody is stuck. A dedicated "Get the app" slide stays (slide 5). | Andrew, 2026-11-22 ("all screens should show the QR code and 'Get the app'"; chose "between questions only" for game screens). One-QR-per-screen is the planner's recommendation. |
| D17 | **Bingo "Closest to Bingo" is reserved.** Its design stays in the mockups (section G). No code, no data reads, no slide until Andrew says go; then the reserved phase **R1** runs. | Andrew, 2026-11-22 ("not go live yet, but keep it reserved"; chose "build later") |
| D18 | **Most relevant sports first.** The Pick 'Em board and ticker rank today's games for each venue with a rule-based score (Phase 9 step 4): this venue's own pick counts, league weight by local day and time, live > starting soon > final, and a boost for postseason or national primetime when the feed marks it. Seasons need no calendar: a league only counts when it has games today. The board shows the top 4 games (2×2); the ticker carries the next ones. No new provider calls (D8 stands). | Andrew, 2026-11-22 (asked for NFL on Sundays, college football on Saturdays, college basketball or NBA on other days); rules and top-4 layout are the planner's. |
| D19 | **College basketball (men's and women's) is out of this plan.** Pick 'Em has no college basketball today (its leagues are in `lib/pickemSports.ts`). Adding it is a separate small plan that checks the sports provider's coverage and price first and asks Andrew before any cost. When it lands, D18's ranking includes it with no TV change, as long as its weights are added to the table. | Andrew, 2026-11-22 (chose "separate project, priced first") |
| D20 | **Carousel:** 1 Next Live Trivia · 2 Pick 'Em board · 3 All-Time Leaderboard · 4 Prizes · 5 Get the app. 15 s each, 75 s loop (matches `IDLE_MOMENT_MS`). Slides with nothing to show are skipped. Bingo is not in the loop (D17). | Andrew, 2026-11-22 (from D11 and D17; 15 s confirmed in round 2, D23) |
| D21 | **Launch content: Live Trivia and Pick 'Em only.** At launch the TV shows Live Trivia (pre-game, questions, reveals, standings) and Pick 'Em (NFL Pick 'Em and the other Pick 'Em leagues: Pick 'Em board, ticker, All-Time Leaderboard, Prizes, Get the app). **Category Blitz, Super Bowl Squares and March Madness Bracket TV screens are reserved:** the code stays and keeps working, but the display doesn't show them until Andrew says go (reserved phase **R2**). Try demo shows only launch content. **Applies to every display**, the Display URL in Silk included (D26). | Andrew, 2026-11-22 ("I want to have it available, but I don't want it to be there when we go live with this. Let's start off with Live Trivia content and NFL Pick 'Em and Pick 'Em content first.") |
| D22 | **Store art: Option 2 for every size** (mockups v2 section H: `icon2` 512×512 brand blue, `fire2` 1280×720 logo centered, `ban2` 320×180 logo only). **Keep the coin logo:** Andrew isn't concerned about the simulated-gambling question. The content-rating answers still state the facts: free to play, no wagering, venue prizes. | Andrew, 2026-11-22 ("I like Option 2 for the logos. I'm not concerned about the simulated gambling.") |
| D23 | **Timing:** every slide stays up **15 s** unless a decision says otherwise. Try demo also shows each screen for 15 s. | Andrew, 2026-11-22 |
| D24 | **Andrew's stick runs Fire OS** (he believes so; Phase 5 confirms with Settings → My Fire TV → About before installing). Vega OS stays planned (D1, Phases 13–14). | Andrew, 2026-11-22 |
| D25 | Everything else in mockups v2 and D10–D20 is approved as drawn, including the planner choices flagged in round 1: "Option 1 / Option 2" (D10), D14 (applies once Category Blitz is turned back on, R2), D15, D16 and D18. | Andrew, 2026-11-22 ("I'll keep the rest of what you have here, it seems good.") |
| D26 | **D21 covers every display.** Category Blitz, Squares and Bracket also stay off TVs that use the Display URL in Silk. So the Phase 9 switch in `selectVenueScreenState` is global: no `&src=tv-app` flag, and idle responses stay shared-cached by URL. | Andrew, 2026-11-22 ("should also stay off TVs that use the Display URL in Silk today. One behavior is simpler and costs less.") |

| D27 | **Sports data: refresh only while a TV is on.** Today's games and live scores weren't stored anywhere (Pick 'Em asks BallDontLie per page view; the every-minute Pick 'Em job asks only after a picked game starts, and production had 38 picks in 30 days, so reusing its data would leave the board empty most days). So one shared copy of today's games (`tv_sports_games`) serves every venue. An idle state request reads it and, after its response, refreshes the leagues that are due (`claim_tv_sports_refresh`): 2 min while a league has a game live or starting within 2 h (MMA and tennis 10 min), 15 min with games later today, 6 h with none, 30 min when the feed is silent. No TV on the carousel → no feed requests. No cron. BallDontLie is a flat subscription, so $0 more. | Andrew, 2026-11-22 (chose "Refresh only while a TV is on" over "no new feed calls", in Phase 9) |
| D28 | **Prizes slide: no per-player progress bar.** The mockup's bar shows one player's progress, which doesn't fit a TV that a whole room reads. Phase 11 builds the slide without it. | Andrew, 2026-11-23 ("This is fine with me.") |
| D29 | **NHL Pick 'Em start-time bug is fixed in this plan** as phases N1–N3 (found in Phase 9: NHL games show and lock at 7 AM New York time). They are website-only, independent of the TV phases, and can run any time. | Andrew, 2026-11-23 ("Can you add that as a phase (or multiple phases) to this plan?") |
| D30 | **The two tests that fail on `main` are fixed in this plan** as phases T1–T2. T1 fixes both now. T2 stops the NFL snapshot test from failing again every two weeks in season. Neither comes from TV work, but both turn every PR's CI red, PR #41 included. | Andrew, 2026-11-23 ("Develop solutions to these two failures … add those solutions as a phase (or multiple phases) to this plan") |
| D31 | **`tests/lib.sportsBingo.nfl-star-tilt.test.ts` "puts stars on boards materially more often than chance" is seeded (phase T3).** It draws unseeded random boards and failed CI on PR #41 (star share 0.27 vs > 0.3), then passed on rerun. | Andrew, 2026-11-23 ("Sure") |
| D33 | **NHL Pick 'Em fix (N1's choice): prefer a real timestamp in every league.** `extractEventStartIso` takes the first full timestamp and falls back to a date-only field only when none exists. NHL `startsAt` and `game_id` move to the real puck-drop; every other league's are unchanged (each already sends a full timestamp first). No migration: production has no NHL picks, tiebreaker guesses or lines. N2 also stops grading a pick whose game the feed still calls "scheduled" (NHL sends 0–0 before puck-drop, which the 4-hour rule would grade as a push), and labels NHL periods with the TV's hockey helper. Replaces the planner's "keep the id" recommendation in N1 step 4. | N1 agent, 2026-11-23, from evidence in `docs/fire-tv-app-plan_PHASE_N1_HANDOFF.md` §4–5. Andrew may overrule. |
| D32 | **The weekly NFL star-snapshot refresh (T2) commits straight to `main`, no PR.** The script's `--guard` refuses to write when a BallDontLie fetch fails or the current slate shrinks below half, because no person reads the diff before it lands. The "Allow GitHub Actions to create and approve pull requests" setting is not needed and stays as it was. | Andrew, 2026-11-23 ("Just commit it straight to main unless there's a problem. I don't want to have to merge a PR every week.") |
| D34 | **Device reviews move to the end.** Phases 5 (app test) and 12 (sports screens on a real TV) run after Amazon approves 1.0.0, on the **store build** installed from the Amazon Appstore, not a sideloaded APK. Nobody outside Hightop Challenge is told about the app before then, so a device bug found late reaches no one. Phase 8's dashboard link waits for Phase 5 to pass, because that link is how partners find the app (planner's call, to keep the app unannounced until reviewed). | Andrew, 2026-11-23 ("I don't have a firestick currently, but no one is going to use the Fire TV app before us anyway … let's just move the review phases to the end of this plan and we'll review the app ourselves when it is available on the Amazon Fire TV store.") |
| D35 | **`tests/components.live-trivia-quick-review.test.ts` "shows a possible repeat … undoes with Z" is made reliable (phase T4).** It failed CI once on PR #49 (2026-11-23: no `live-review-card` after pressing Z, timed out at 1033 ms), then passed on the same commit. It is a timing race, not random data, so it can't be seeded like T3 (D31). | Andrew, 2026-11-23 ("Add the fix to the intermittent test to the plan.") |
| D36 | **Quick Review keys while a save is running (T4.2):** a **Z** pressed while a Keep or Reject is still saving is remembered and runs the moment that save finishes, but only if it still undoes that same question (a failed save drops it). Every other key pressed while busy stays ignored, as today, because the next question isn't on screen yet and a key must never decide a question the reviewer hasn't seen. The same rule stops Keep / Reject / Skip / Edit while "Loading…" shows. No new on-screen text: the disabled buttons already show it's busy. | Planner, 2026-11-23, from the T4 review. Reason: undo is the one key that always means a question already seen. Andrew may overrule (e.g. "just ignore Z too"). |
| D37 | **Every merged phase of this plan gets a code review (CR1–CR3)**, riskiest first. Reviews are read-only: they record verified findings and propose fixes as remedial phases marked "awaiting Andrew's OK". Nothing is fixed without his yes, except that a live security or data-loss problem is reported to him at once. | Andrew, 2026-11-23 ("Yes, add the review phase to the plan"), after the T4 review showed no other phase had been reviewed. Split into three phases and their order: planner. |
| D38 | **CR1.4 departs from two written steps, for correctness (agent, 2026-11-24).** (1) F15: a league's feed is `ok` only when **every** request it needed answered (each day, the soccer teams list, UFC events and fights), not when "any" did: with "any", one failed day plus an empty other day would read as "no games", delete that league's live rows and wait 6 h. All 24 request types answered 200 on 2026-11-24, so no league is stuck on the 30-minute retry. (2) F17: before skipping rows with no TV start, `extractTvStartIso` also reads `date` / `game_date` (date-only values still skipped): NFL, college football, WNBA, MLB and club soccer give their kickoff only in `date`, so the literal step would have blanked them. UFC rows now carry their event timestamp as the TV start. | Agent, 2026-11-24 (CR1.4), from live-feed checks |

If you disagree with D5–D9, say so at the start of any phase.

## Phases, model and effort

**The rows are in run order. Work down them.** The top rows are done or waiting on Amazon; start at the row marked **Next**. If a row's
"Starts when" isn't true yet, skip it and come back. Run one row at a time: each code phase branches from up-to-date
`main` after the previous PR merges.

**Agents: keep this table in run order (Andrew, 2026-11-23).** When you finish a phase, update its status cell in
place. When you add a phase, insert it where it should run. Never re-sort the rows by phase number.

"Agent" = a Claude Code session. Start each in a new session with: *"Do Phase N of docs/fire-tv-app-plan.md. Read the
handoff of the row above it first."*

| Phase | What | Who | Model / effort | Starts when / status | Why this model |
|---|---|---|---|---|---|
| 1 | Mockups of every new TV screen + app icon/banner concepts | Agent | Sonnet 5.5 / high | Done 2026-11-21 | Visual design, no production code. High effort (instead of the usual medium for UI) because a weak mockup wastes your review and a session. |
| 2 | Review the mockups: keep / change / cut | **Andrew** | (reply in the Phase 1 chat) | Done 2026-11-22 (round 1 → D10–D20, round 2 → D21–D25) | Your taste decides it. An agent recording a round and republishing the mockups uses Sonnet 5.5 / medium (copy and mockup edits, no production code). |
| 3 | Connect backend + `/tv-app` start page + Try demo + phone Connect page | Agent | Opus 5.5 / high | Done; merged and deployed 2026-11-22 (PR #36) | Migration, partner auth, `proxy.ts` edge rules, a public endpoint. |
| 4 | Fire OS app (`native-tv/`, Kotlin WebView shell) | Agent | Opus 5.5 / high | Done; merged 2026-11-22 (PR #37) | New native project, store rules, UA trap, security of what the WebView may open. |
| 6 | Release build, signing, store images, listing text, rating answers, reviewer notes | Agent | Sonnet 5.5 / medium | Done 2026-11-22 (PR #38) | Well-specified build and copy work. |
| 7 | Submit to the Amazon Appstore | **Andrew** | — | Submitted 2026-11-23; in Amazon review | Console steps only Andrew can do. |
| 8b | Hands-off shell releases: `npm run fire-tv:release` (bump, build, sign, verify, upload via Amazon App Submission API, submit) | Agent | Sonnet 5.5 / medium | Done 2026-11-23 (dry run passed; first real use after 1.0.0 is approved) | Well-defined build script; no data or money. |
| 9 | Sports data inventory, cost baseline, state engine: carousel data, game ranking, All-Time Leaderboard read, Next Live Trivia wording, 60-minute pre-game and its precedence | Agent | Opus 5.5 / high | Done; merged and deployed 2026-11-23 (PR #39) | Shared engine (`selectVenueScreenState`), precedence, data reads, cost measurement. |
| 10 | Build the Pick 'Em Live Board and All-Time Leaderboard slides | Agent | Sonnet 5.5 / high | Built 2026-11-23; PR #41 open; merged in the "10 (merge)" row | UI fixed by the mockups. High (not medium) because display standing rules (effects keys, no replays on poll, precedence) are easy to break. |
| T1 | Fix the two tests that fail on `main`: one test line in question-variety; refresh the NFL star snapshot (D30) | Agent | Haiku 5.5 / low | Done 2026-11-23 (PR #43) | A one-line test change and one existing generator script, with no app code, migration or deploy. Use Sonnet 5.5 / medium if the snapshot diff looks wrong. |
| 10 (merge) | Finish Phase 10: update PR #41 from `main`, confirm CI passes, merge (deploys; the slides stay preview-only until Phase 11) | Agent | Haiku 5.5 / low | After T1 merges | Mechanical: branch update, check CI, merge. No new code. |
| T2 | Keep the NFL star snapshot fresh on its own: weekly GitHub Action that commits the refresh to `main` (D30, D32) | Agent | Sonnet 5.5 / medium | Done 2026-11-23 (PR #46; ran on Opus 5.5; `_PHASE_T2_HANDOFF.md`) | A new workflow and a repo secret, both well specified. The secret needs Andrew's yes. |
| T3 | Stop the random star-tilt test from failing CI: seed its random numbers (D31) | Agent | Haiku 5.5 / low | Done 2026-11-23 (PR #45; `_PHASE_T3_HANDOFF.md`) | One test file; `installSeededRandom` already exists in it. |
| N1 | NHL Pick 'Em start time: investigate and choose the fix (read-only; D29) | Agent | Opus 5.5 / high | Done 2026-11-23 (D33; `_PHASE_N1_HANDOFF.md`) | Touches Pick 'Em `game_id`s that picks, frozen lines and reminders are keyed on; a wrong call strands players' picks. |
| N2 | NHL Pick 'Em start time: the fix, tests, PR, deploy | Agent | Opus 5.5 / high | Done; merged 2026-11-23 (PR #48; `_PHASE_N2_HANDOFF.md`) | Shared Pick 'Em engine (`lib/pickem.ts`) and pick locking; any id change is a data change. |
| 11 | Build the carousel, ticker, "Get the app" QR on every screen, and the pre-game "LIVE TRIVIA" title | Agent | Sonnet 5.5 / high | Done; merged 2026-11-23 (PR #49; ran before N3 at Andrew's request; `_PHASE_11_HANDOFF.md`) | Same reason; the QR touches existing Live Trivia and Category Blitz screens. |
| N3 | NHL Pick 'Em start time: check on the next NHL game day after N2 deploys, record results | Agent | Haiku 5.5 / low | Done 2026-11-23 (`_PHASE_N3_HANDOFF.md`) | Read-only check against a written checklist. Use Sonnet 5.5 / medium if it finds a bug to fix. |
| T4 | Stop the Live Quick Review undo test from failing CI at random: fix the race behind it (D35) | Agent | Sonnet 5.5 / medium | Done; merged 2026-11-24 (PR #51; reviewed → T4.1, T4.2) | A timing race in an admin component and its test needs diagnosis, not just a seed; small scope, no data, migration or store release. |
| T4.1 | **Remedial (T4 review):** finish T4 on PR #51: a regression test that fails on `fd3bf936`, restore the dropped check, git-ignore `.claude/worktrees/`, correct the handoff, then merge | Agent | Sonnet 5.5 / medium | Done 2026-11-24 (on PR #51; `_PHASE_T4.1_HANDOFF.md`) | One test file plus two doc/config lines, but the test must reach a React effect-timing window; Haiku would likely write another test that passes on the old code. |
| CR1 | **Code review, high risk (D37):** PRs #36 (Phase 3: connect backend, migration, partner auth, `proxy.ts`, public endpoint), #39 (Phase 9: shared state engine, migration, cost), #48 (N2: Pick 'Em locking and grading), #37 (Phase 4: WebView security), #46 (T2: Action that commits to `main`) | Agent | Opus 5.5 / high | Done 2026-11-24 (F7–F43; `_PHASE_CR1_HANDOFF.md`) | Auth, migrations, security-definer functions, points and a public endpoint, all live in production; a missed bug here costs the most. |
| CR1.1 | **Remedial (CR1, F14, F16):** TV Prizes slide shows a points target only for real points-target prizes, and only open prizes | Agent | Sonnet 5.5 / medium | **Done 2026-11-24** (approved by Andrew) | One read function and its test; web only, no data. |
| CR1.2 | **Remedial (CR1, F24–F28), in `docs/bingo-pickem-reliability-plan.md`:** Pick 'Em: a moved start time can't hide a pick or allow a second, paid one; grading waits for the real start; postponed games don't grade as a push | Agent | Opus 5.5 / high | **Approved by Andrew 2026-11-24. Done 2026-11-24** (`docs/bingo-pickem-reliability-plan_PHASE_CR1.2_HANDOFF.md`). Follow-up F44 → CR1.2.1 in that plan | Points and pick matching in the shared Pick 'Em engine. |
| CR1.3 | **Remedial (CR1, F36, F37, F39, F40, F43; asks about F41):** weekly NFL star workflow fails loudly, runs at season start, guards the prior slate | Agent | Sonnet 5.5 / medium | **Done 2026-11-24** (branch `fix/nfl-star-workflow-hardening`; handoff `fire-tv-app-plan_PHASE_CR1.3_HANDOFF.md`). Before the first scheduled run, Tue 2026-12-01 | A workflow file, one script guard and contract tests; well specified. |
| CR1.4 | **Remedial (CR1, F15, F17, F18, F19–F22):** TV sports feed: empty league isn't a failure, no noon-UTC "live" games, playoff OT labels, usage counter and finals fixes | Agent | Opus 5.5 / high | **Done 2026-11-24** (approved by Andrew; D38; `_PHASE_CR1.4_HANDOFF.md`) | Touches the shared Pick 'Em feed helper and the refresh engine; Pick 'Em callers must not change. |
| CR1.5 | **Remedial (CR1, F7–F11, F35):** TV Connect screen: last-second connect, one poll loop, clock skew, retry wording, no create per key; keep-awake readout | Agent | Sonnet 5.5 / medium | **Done 2026-11-25** (approved by Andrew; `_PHASE_CR1.5_HANDOFF.md`) | Client timing in one component plus one server helper; fake-timer tests. Web only. |
| CR1.6 | **Remedial (CR1, F38), in `docs/bingo-pickem-reliability-plan.md`:** the BallDontLie season probe keeps its one row | Agent | Sonnet 5.5 / medium | **Approved by Andrew 2026-11-24** | One fetch option and a test. |
| CR1.7 | **Remedial (CR1, F29–F34):** Fire TV shell 1.0.1: a 5xx or certificate error shows "Can't connect." and retries; bridge limited to site frames; no retries in background; crash-restart cap | Agent | Opus 5.5 / high | **Approved by Andrew 2026-11-24.** After Amazon approves 1.0.0 (a release can't be submitted while one is in review) | WebView callback order, security hardening and a store release. |
| T4.2 | **Remedial (T4 review, pre-existing bugs):** Quick Review: Z pressed while a save runs is kept (D36); no Keep / Reject while "Loading…" or from a stale category; "Loading…" (not "Nothing left.") before the first load. Live, and Speed where the same code exists | Agent | Sonnet 5.5 / high | Done; merged 2026-11-24 (PR #52; `_PHASE_T4.2_HANDOFF.md`) | Admin UI only, well specified, but async ordering: a mistake undoes or decides the wrong question, so high effort. No data, migration or store release. |
| CR2 | **Code review, display and release (D37):** PRs #41 (Phase 10 slides, plus Phase 8b's `native-tv/scripts/release.cjs`, commit `e69bc60e`), #49 (Phase 11: carousel, ticker, QR, pre-game title), #38 (Phase 6: release build, store pack, keyboard fix) | Agent | Sonnet 5.5 / high | **Done 2026-11-25** (F45–F66; nothing urgent; `_PHASE_CR2_HANDOFF.md`) | Screens with written standing rules (effects keys, no replay on poll, precedence, one QR) and one script that handles signing keys and store credentials; high effort to check each rule. |
| CR2.1 | **Remedial (CR2, F45–F47, F49–F53):** TV display polish: unknown picks aren't "No picks yet", every score change flashes once, no stale flash after a gap, a slide isn't cut short when the slide set changes, steady ticker, one QR during cross-fades, confetti misses the QR, no doubled prize line | Agent | Sonnet 5.5 / high | **Awaiting Andrew's OK** | Web only, no data; but it touches the carousel rotation and FX timing, which carry standing rules (nothing replays on a poll, one QR, keep-out), so high effort. |
| CR2.2 | **Remedial (CR2, F55–F63):** `npm run fire-tv:release` and the upload-key script: undo the bump on every failure, delete a half-made Amazon edit, never reuse a version code, stop on an unknown Amazon state or validate errors, keep the Amazon secret out of Gradle; Gradle refuses an unsigned release | Agent | Sonnet 5.5 / high | **Awaiting Andrew's OK.** Before CR1.7 (its release runs this script) | One Node script with mocked tests plus a build guard; no change to the app itself, so no store release. High effort: a mistake stalls a store release or reuses a version code. |
| CR2.3 | **Remedial (CR2, F48, F64–F66):** Connect-screen contract test guards `autoFocus`; one OK does one thing on an expired code; privacy and listing text match the code; admin Venues says when display codes didn't load | Agent | Sonnet 5.5 / medium | **Awaiting Andrew's OK** | Small, well-specified test, copy and admin-UI fixes. Web only. |
| CR3 | **Code review, small fixes (D37):** PRs #43 (T1), #45 (T3), #47 (flavor-squares timeout), #50 (Pick 'Em stale-load recheck, N3) | Agent | Sonnet 5.5 / medium | After CR2 | Small test and client fixes; Haiku tends to miss whether a test really guards what it claims (the T4 lesson), so mid tier. |
| 13 | Vega OS build (React Native for Vega + Vega WebView around `/tv-app`) | Agent | Opus 5.5 / high | After Amazon approves 1.0.0 | New SDK and toolchain, little prior art. |
| 5 | Review the app: install **Hightop Challenge TV from the Amazon Appstore** on your Fire Stick and test it (D34) | **Andrew** + agent | Sonnet 5.5 / medium | After Amazon approves 1.0.0 and you have a Fire Stick | Agent reads crash logs if needed and fixes small bugs; the device checklist is well defined. |
| 12 | Review the sports screens on a real TV on a game day, then record results (D34) | **Andrew** + agent | Haiku 5.5 / low | Same sitting as Phase 5 if it's a game day; otherwise the next game day | Andrew checks; agent only records results and files fixes. |
| 8 | Store link on `/owner/display` | Agent | Haiku 5.5 / low | After Phase 5 passes (D34: this link is how partners find the app) | One link and copy. Use Sonnet 5.5 / medium if the contract test needs new cases. |
| 14 | Test on a Vega stick, then add the Vega build to the listing | **Andrew** + agent | Sonnet 5.5 / medium | After Phase 13, with a Vega stick | Device install and console steps with agent help. |
| 15 | Close-out: usage vs. baseline, standing rules, docs | Agent | Haiku 5.5 / low | Last (about 2 weeks after Phase 8) | Doc-only, plus one read-only usage comparison. |
| R1 | **Reserved, runs only when Andrew says go (D17):** Bingo "Closest to Bingo" slide: data read, ranking of cards, UI, BINGO! moment | Agent | Opus 5.5 / high | Only when you say go (D17) | Adds a read to the shared state engine and a moment that must never replay on a poll; one phase does both. |
| R2 | **Reserved, runs only when Andrew says go (D21):** turn the Category Blitz, Super Bowl Squares and March Madness TV screens back on, add the corner "Get the app" QR to them (D16), add them to Try demo, real-TV check | Agent | Sonnet 5.5 / high | Only when you say go (D21) | Phase 9 leaves a single switch in `selectVenueScreenState`, so this is a small change, but it touches the shared engine and four display screens; high effort for the precedence and QR-placement rules. |

**Why this order (2026-11-23):**
- **T1 first:** two tests fail on `main`, so every PR's CI is red until it merges.
- **N1–N3 before Phase 11:** the NHL bug hurts players now (picks lock at 7 AM New York on every NHL game day). Phase 11
  only adds TV screens. The NHL phases are independent of the TV phases, so if you'd rather do 11 first, swap them.
- **Reviews last (D34, 2026-11-23):** Phases 5 and 12 wait until the app is live in the Amazon Appstore and you have a
  Fire Stick; you test the store build, not a sideloaded one. **Phase 8** (the dashboard link) waits for Phase 5, because
  it's how partners find the app. **13** needs Amazon's approval; **14** needs a Vega stick.
- **T4** (the intermittent test) can run any time; it's listed after N3 only because N3 is already marked Next.
- **T4.1 before T4.2:** T4.1 makes PR #51 mergeable with a test that actually guards the fix; T4.2 changes behavior, so it
  gets its own PR from `main` and isn't mixed into a test-only fix.
- **CR1 right after T4.1 (D37):** it reviews live auth, migrations and points code, which matter more than T4.2's admin
  fix. Reviews are read-only, so they don't block or wait on any branch. CR2 and CR3 follow in falling order of risk.
  Any remedial phase a review proposes is inserted right after that review's row, marked "awaiting Andrew's OK".
- **R1 and R2** run only when you say go.

## Cost estimates

The numbers are estimates. Phase 9 measures the real baseline (we have no Vercel Observability Plus, so it uses a log
counter or the Vercel usage page; see memory note `reference_vercel_observability_plus_missing`).

| Item | Estimate | Notes |
|---|---|---|
| Amazon developer account and listing | $0 | Already have the account. Free app, no fees. |
| Vega test stick (Phase 14) | ~$30–40 once | Fire TV Stick 4K Select or another stick that says Vega OS. |
| A TV left on the idle screen | ~4,300 state requests/day (one per 20 s, `IDLE_POLL_MS`) → ~130k/month per TV | **The same as Silk today; the app changes nothing per TV.** About 10–20 KB each → ~1.3–2.6 GB/month per TV. Vercel Pro includes 1M invocations and 1 TB transfer per month. Roughly 10 always-on TVs ≈ +$0–1/month; 100 ≈ ~$5–10/month. |
| A TV during Live Trivia / Category Blitz | 1 request/s during questions and rounds (existing) | Unchanged. |
| Connecting a TV | ≤ 200 tiny requests (one per 3 s, only while the Connect screen shows, 10-minute cap) + 1 short-lived table row | Once per TV. Negligible. |
| Sports screens (Phases 9–11) | **As built (Phase 9):** 4 small bounded reads added to each idle state request that reaches the function (games copy ≤ 300 rows, this venue's picks with usernames, All-Time top 10, prizes ≤ 12), minus the Category Blitz peek and the Squares/Bracket reads that D21 turns off. Plus one tiny claim call per server instance per 30 s, and feed refreshes per D27 (~15–30 BallDontLie requests per 2 min while a TV is on during games, ~0 otherwise; flat subscription). **CR1.4 (2026-11-24):** empty leagues now wait 6 h instead of 30 min, and games more than 18 h out no longer hold the 15-minute pace: about 1,200 fewer requests a day while any TV is on (2026-11-24's mix: 8 empty leagues × 27 requests a round, 48 → 4 rounds a day). About +5 KB per idle response. Same 20 s poll. | Data changes about once a minute (crons), so the TV never needs to ask faster. Idle responses are shared-cached (`s-maxage=15`), so TVs at the same venue share reads. Ranking the games is plain code: no extra reads. Phase 9 reports the measured cost before building. A faster or more costly option needs your OK first. |
| Pre-game hour (D13) | +135 requests per TV per game night | 45 more minutes at the pre-game pace (10 s) instead of idle (20 s). Pre-game responses are `no-store`. Negligible. |
| "Get the app" QR everywhere (D16) | 0 | Drawn on the TV from a fixed URL. |
| New crons / provider calls | 0 | D8. |
| Try demo | 0 DB writes | Reuses the existing debug modes. |

If many more venues put up TVs because the app makes it easy, cost grows per TV in line with the "TV left on" row.
Phase 15 compares actual usage with the Phase 9 baseline.

---

## Phase details (for the agents)

Every agent: read `SYSTEM_CONTEXT.md`, the project `CLAUDE.md`, and the Standing rules sections of:
- `docs/live-trivia-pregame-and-display-cleanup-plan.md`
- `docs/venue-display-hype-and-intro-stinger-plan.md`
- `docs/native-app-store-plan.md`

Then read the previous phase's handoff. End every phase with `docs/fire-tv-app-plan_PHASE_<N>_HANDOFF.md` and update
this file's **Status** line.

**Facts the planner found (2026-11-21):**
- **Display routes:** `/venue/[venueId]/screen`, and the short link `/tv/<code>`. The short link 307-redirects to the
  display route and drops the query string, except `awake=debug` on the keep-awake branch.
  - `/tv` handling: `proxy.ts` (~line 52) and `lib/domainSplit.ts` (~154–155).
  - Code lookup and link builders: `lib/displayCode.ts`.
  - Code alphabet (4 Crockford characters, no I L O U): `lib/tvPairingShared.ts`.
  - The column is `venues.display_code`. The old `tv_pairing_codes` table was dropped on 2026-11-14.
- **Screen state:**
  - `lib/venueScreen.ts`: `getVenueScreenState` → `selectVenueScreenState`.
  - Modes: `live-trivia`, `live-trivia-pregame`, `category-blitz`, `squares`, `bracket`, `idle` (with
    `nextLiveTrivia` and `sponsorSlots`).
  - Precedence: Live Trivia > pregame > Category Blitz > Squares > Bracket > idle.
- **Polling:** `lib/venueScreenTiming.ts` `getVenueScreenPollIntervalMs`.
  - 1 s during a question, reveal or round; otherwise 4 s.
  - Squares 15 s, bracket 30 s, idle 20 s.
  - Debug modes: `parseVenueScreenDebugMode`.
- **State API:** `app/api/venue-screen/state/route.ts`. Idle, squares and bracket use
  `s-maxage=15, stale-while-revalidate=15`; everything else is `no-store`.
- **Display path guard:** `isVenueDisplayPath` in `lib/playerRuntimePaths.ts`. No ads and no player runtime on display
  paths.
- **Partner auth:**
  - Email and password at `/owner/login`.
  - Cookie `tp_owner_sess`, HMAC-signed, 90 days (`lib/ownerSession.ts`).
  - Server guard: `lib/requireOwnerAuth.ts`. Recovery redirect: `ownerAuthRecoveryPath` (`lib/ownerAuthCodes.ts`).
- **`/owner/display` (`app/owner/display/page.tsx`):** shows the Display URL, a Fire Stick help panel, Expand and the
  keep-awake readout. Its comment says "code pairing was removed, D4"; Phase 3 updates that comment.
- **Phone app (`native/`, Capacitor):** players only. `lib/nativeApp.ts` is the only reader of the
  `HightopChallengeApp/` token, and `proxy.ts` rewrites app-UA requests for `/owner`, `/tv` and `/admin` to
  `app/in-app-notice/[page]`.
  - Android builds need `JAVA_HOME=/opt/homebrew/opt/openjdk@21`.
  - Gradle output goes in `~/Library/Caches/hightop-native/` (iCloud makes "name 2" duplicates in Documents).
- **Android tools:** `adb` is at `~/Library/Android/sdk/platform-tools/adb`, but it is **not on PATH**.
- **Signing keys:** the phone app's keys are in
  `/Users/andrewserulneck/Library/Application Support/Hightop Challenge/signing/` (folder mode 0700, files 0600, never
  printed or committed).
- **Open keep-awake work:** branch `fix/firestick-keep-awake` has uncommitted keep-awake Phase 1 code
  (`useKeepScreenAwake`, `KeepAwakeReadout`, `?awake=debug`); see `docs/firestick-keep-awake-plan.md`. Silk users
  still need it. **Don't lose that work.** Never `git checkout -- <file>`, and don't build this plan on that branch.

### Phase 1 — Mockups (Agent, Sonnet 5.5 / high)

**Goal:** one private Artifact page that shows every new TV screen at 1920×1080 (scaled to fit) with realistic fake
data, so Andrew can judge them. No repo code changes.

1. Load the `artifact-design` skill (via `Artifact` quickstart, intent `other`). Read `lib/venueScreenBrand.ts` and
   look at `components/venue-screen/` (`IdleVenueScreen.tsx`, `TvIdleAttract.tsx`, `SquaresTvScreen.tsx`,
   `BracketTvScreen.tsx`, `SponsorRail.tsx`, `AppDownloadQr.tsx`) so the mockups match today's display look.
2. Before drawing, check `types/index.ts` and `lib/pickem*.ts`, `lib/nflPickEm.ts` and `lib/sportsBingo.ts` for
   which data plausibly exists:
   - live scores and game status
   - each venue's pick split per game
   - venue leaderboards
   - bingo squares remaining per card

   Mark anything uncertain on the mockup with a small "data TBD" note for Andrew. Phase 9 confirms.
3. Screens (each a labeled section):
   - **A. Connect screen (TV app).**
     - A large QR code, "Scan to connect", and "Or enter display code" with four character boxes.
     - A small **Try demo** button.
     - A focused-state example, because the remote's D-pad moves a visible focus ring.
   - **B. Pick 'Em Live Board.**
     - Live game tiles: teams, score, clock.
     - This venue's pick split per game ("62% CHI").
     - Top 5 venue leaderboard, plus a join QR.
     - Show one "moment" state: a picked team scores and the tile flashes.
   - **C. Bingo "Closest to Bingo".**
     - The top 3–5 players' mini cards with "1 away" / "2 away".
     - The squares still needed, plus a join QR.
     - Show one "BINGO!" moment state.
   - **D. Ticker rail.** A thin bottom strip: live scores · Pick 'Em leader · "Next Live Trivia 8:00 PM". Show it:
     - over the idle screen
     - over the Live Trivia leaderboard
     - **two variants on a Live Trivia question screen: with the ticker and without it.** Andrew chooses. The
       planner recommends *without* during questions, reveals and Category Blitz rounds (one focal point rule).
   - **E. Idle carousel.**
     - 4–5 slide frames: next game countdown, Pick 'Em board, bingo board, venue prizes, join QR.
     - Proposed timing (e.g. 15 s per slide) and how it yields when a live game starts.
   - **F. Store art.** Concepts for the 1280×720 Fire TV icon, the 320×180 launcher banner and the 512×512 icon.
     Use existing brand art only, no new logos.
4. Rules for the mockups:
   - Minimal copy, one accent and one focal point per screen. No text under 12 px at 1080p.
   - **"Casino energy" means light and motion (marquee lights, gold leaderboard), never chips, slots, cards or odds.**
     Amazon's content rating asks about simulated gambling, and the games are free to play.
5. Publish the Artifact (private) and give Andrew the link. Write the handoff with the screen list, the data-TBD
   items and the Artifact URL. Phase 2 happens in the same chat. When Andrew answers, record his choices as D10+ in
   this file and in the handoff.

### Phase 2 — Mockup review (Andrew)

See **Andrew's steps → Phase 2**.

### Phase 3 — Connect backend, `/tv-app`, Try demo, phone Connect page (Agent, Opus 5.5 / high)

**Goal:** everything the TV app needs on the website, testable in a laptop browser before any app exists.

**Out of scope:** the native app; sports screens.

**Branch:** `feat/fire-tv-connect` from up-to-date `main`. Carry this untracked plan file over and commit it in this
phase.

1. **Migration** (`supabase migration new tv_device_pairings`): table `public.tv_device_pairings`.
   - **Columns:**
     - `id` uuid pk
     - `pair_code` text unique: 6 Crockford characters, shown in the QR URL
     - `poll_secret_hash` text: the TV holds the raw 32-byte secret; store only its hash
     - `venue_id` uuid null, references venues on delete cascade
     - `claimed_at` and `expires_at` (default now() + 10 minutes)
     - `created_at`
   - **Grants and RLS:** grant `service_role` only, with RLS enabled and no `anon`/`authenticated` policies. Follow
     `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; `tests/supabase-migration-grants-contract.test.ts` must pass.
   - **`supabase db push` asks Andrew first.**
2. **API (Node runtime, `lib/supabaseAdmin.ts` unchanged):**
   - **`POST /api/tv-app/pairings`**
     - Public, IP-rate-limited.
     - Creates a row and returns `{ pairCode, pollSecret, expiresAt }`.
     - Before inserting, deletes expired rows (one bounded `delete … where expires_at < now()`). No cron.
   - **`GET /api/tv-app/pairings/status`**
     - The TV sends its secret in a header, not the URL.
     - Returns `{ state: "waiting" | "connected" | "expired", venueId? }`.
     - On `connected` it deletes the row (read-once).
     - `no-store`.
   - **`POST /api/owner/tv-app/connect`**
     - `requireOwnerAuth`.
     - Body: `{ pairCode, venueId }`. Checks that the owner owns `venueId`, the code is unexpired and unclaimed.
       Sets `venue_id` and `claimed_at`.
     - Rate-limited per owner.
   - **Display-code entry:**
     - Resolve the 4-character code to a venueId by reusing `lib/displayCode.ts`. Don't write a second lookup.
     - Public and IP-rate-limited, the same exposure as `/tv/<code>` today.
     - Return only the venueId.
3. **`/tv-app` page** (the app's start URL; works in any browser):
   - If a remembered venueId exists (localStorage key `tp_tv_venue_id`, plus a native-bridge hook for Phase 4),
     navigate to the display route via `gameUrl`. Otherwise show the Connect screen from the approved Phase 1 mockup.
   - Polls status every 3 s **only while visible and unexpired**. When the code expires, it shows a new QR on the
     next focus or key press (no silent regeneration loop).
   - Code entry: 4 boxes with the on-screen keyboard. Tolerant input: uppercase it and map O→0, I/L→1, as
     `lib/tvPairingShared.ts` does.
   - Add `/tv-app` to `isVenueDisplayPath` (no ads, no player runtime) and make it public in `proxy.ts` and
     `lib/domainSplit.ts`. Choose the host per the domain split.
   - D-pad: every control reachable, a visible focus ring, sensible initial focus.
4. **Phone page `/owner/display/connect?c=<pairCode>`:**
   - Signed-out partners go through `ownerAuthRecoveryPath` and must come back to this page with the code. Add a safe
     return path if one doesn't exist; same-site only, to prevent open redirects.
   - Shows the venue name (with a picker when the owner has several) and one **Connect** button. Success copy:
     "Connected." Expired: "Code expired. Scan the new one on your TV."
5. **Try demo:** a button on `/tv-app` that cycles launch screens only (D21): idle "Get the app", pre-game, Live
   Trivia question, reveal, round break and final standings, with fake data, 15 s each (D23). No DB writes, and no
   real venue. Phase 11 adds the Pick 'Em slides; R2 adds Category Blitz, Squares and Bracket.
   - **Check whether debug modes work in production today. If not, add a demo-only path that doesn't expose debug
     on real venues.**
   - Back exits the demo.
6. **`lib/tvApp.ts`:** the only reader of the `HightopChallengeTV/` UA token (`isTvApp(userAgent)`), plus a contract
   test like `tests/native-app-contract.test.ts`. Check that `lib/nativeApp.ts` never matches it.
7. **Update the rules:**
   - In `docs/live-trivia-pregame-and-display-cleanup-plan.md` Standing rules, replace "set up by Display URL only,
     no pairing" with: "set up by Display URL, or by connecting the Hightop Challenge TV app (QR or display code);
     a connection grants a venue id only."
   - Update the matching row in the project `CLAUDE.md` feature-rules table.
   - Update the comment in `app/owner/display/page.tsx`.
   - Fix any contract test that pins the old wording.
8. **Tests:**
   - Unit tests: pairing lifecycle (create → claim → read-once → expired), ownership check, rate limits, code
     normalization.
   - Browser check from a scratchpad clone with mocked routes (never Andrew's :3000 server): Connect screen, demo
     cycle, phone page.
   - Then `npm run lint`, `npm run test`, `npx tsc --noEmit` (not at the same time as a build), `npm run build`.
9. Open a PR. After Andrew OKs, run `db push`, merge and deploy. Run a live smoke test: open `/tv-app` in a laptop
   browser, scan the QR with Andrew's phone (Andrew does this part), and confirm the laptop switches to the display.

**Cost check for the handoff:** requests per pairing ≤ 200; rows live ≤ 10 minutes; no cron.

### Phase 4 — Fire OS app (Agent, Opus 5.5 / high)

**Goal:** a debug APK of `native-tv/` that Andrew can install in Phase 5.

**Out of scope:** store submission and signing for release.

**Branch:** `feat/fire-tv-app` from `main`.

1. **Project:**
   - A new standalone Gradle project in `native-tv/` (Kotlin, one Activity, AndroidX WebView). **Not Capacitor**:
     nothing to bridge, and it keeps the phone app's rules untouched.
   - Package id: suggest `com.hightopchallenge.tv`. Confirm it doesn't clash with the phone app's id in
     `native/android`.
   - Gradle build output goes outside iCloud (`~/Library/Caches/hightop-native-tv/`).
   - `JAVA_HOME=/opt/homebrew/opt/openjdk@21`.
2. **Manifest:**
   - `android.software.leanback` required.
   - `android.hardware.touchscreen` not required.
   - A `LEANBACK_LAUNCHER` intent filter and a 320×180 `android:banner` from the Phase 1 art.
   - Landscape only, internet permission only. (Built with `ACCESS_NETWORK_STATE` too, a normal no-prompt
     permission, so the offline screen sees Wi-Fi drop while a page is up; see the Phase 4 handoff §3.)
   - minSdk: choose and justify. Planner suggests 25 (Fire OS 6 and up, sticks from about 2017 on). Older sticks' WebView may not
     run today's site.
3. **WebView:**
   - Loads `https://<host>/tv-app`.
   - JavaScript and DOM storage on.
   - `mediaPlaybackRequiresUserGesture = false`, so the stinger sound plays.
   - Appends ` HightopChallengeTV/<versionName>` to the UA. Never `HightopChallengeApp/`.
   - **Only https URLs on the site's own hosts load in the WebView. Others are blocked, not opened** (a TV has no
     browser to hand off to).
   - No file access, and no mixed content.
4. **Native features:**
   - **Keep awake:** `FLAG_KEEP_SCREEN_ON` while the activity is visible. Tell the web hook to stand down when
     `isTvApp`: `useKeepScreenAwake` should do nothing there. Coordinate with the keep-awake branch state.
   - **Offline screen:** a native screen on load failure or no network, with automatic retry (backoff up to 30 s)
     and a **Retry** button. Copy: "Can't connect." / "Retry".
   - **Remote buttons:**
     - D-pad goes to the WebView (spatial focus).
     - **Back:** inside the demo or connect flow, goes back; on the display, exits the app.
     - **Menu (☰):** a small native dialog with **Change venue** (clears the stored venue, then `/tv-app`) and
       **Reload**.
   - **Remembered venue:** a JS bridge (`HightopTV.getVenueId()` / `setVenueId()`) backed by SharedPreferences, in
     case WebView localStorage gets cleared. `/tv-app` prefers the bridge when present.
   - Resume after sleep or HDMI-off: reload if the page is stale.
5. Build a debug APK. Write the exact install command for Phase 5:
   `~/Library/Android/sdk/platform-tools/adb install -r <path>`.
6. **Tests:** unit-test the URL allow-list and UA string, plus a contract test that `native-tv/` never contains
   `HightopChallengeApp/`. If possible, run an Android TV emulator smoke test (optional; the real check is Phase 5).
7. PR (website changes, if any, plus `native-tv/`). Merge only after Andrew's OK. The handoff lists the APK path.

### Phase 5 — Device review of the store build (Andrew + agent, Sonnet 5.5 / medium)

Runs after Amazon approves 1.0.0 (D34). Andrew installs the app from the Amazon Appstore; no sideloading.

**Agent:**
1. Go through the checklist in **Andrew's steps → Phase 5** with him.
2. Only if something crashes or misbehaves: have Andrew turn on developer mode and ADB debugging (his steps, "If the
   agent asks for crash logs"), run `~/Library/Android/sdk/platform-tools/adb connect <ip>:5555` and read
   `adb logcat`. Andrew approves the TV prompt.
3. Fix small bugs. A website fix ships by deploy. A shell fix (`native-tv/`) ships with `npm run fire-tv:release`;
   to try it first, sideload the release APK with `adb install -r <path>` (the store copy is signed by Amazon, so
   uninstall it first).
4. Record results in the handoff.
5. Add a "Fire TV app" section to `docs/tv-display-physical-device-checklist.md`.

### Phase 6 — Release build and store pack (Agent, Sonnet 5.5 / medium)

1. **Upload keystore:**
   - Create a separate one for the TV app in
     `/Users/andrewserulneck/Library/Application Support/Hightop Challenge/signing/` as `fire-tv-upload.p12`, with
     credentials in `fire-tv-upload-credentials.json`. Folder 0700, files 0600, **never printed or committed**.
   - Tell Andrew to back up both files to his password manager.
   - If Amazon's console offers its own app signing, note what it uses, but keep the upload key either way.
2. **Release build:**
   - `versionCode` 1 (increase on every upload).
   - `versionName` "1.0.0" (under 50 characters).
   - Minify on, with WebView JS-bridge classes kept.
   - Pure Kotlin, so no native libraries and the 64-bit rule is met.
   - Output: an APK (or an AAB if the console prefers it on the day).
3. **Store assets** in `docs/fire-tv-store/`:
   - 114×114 and 512×512 icons, 1280×720 Fire TV icon, 1920×1080 background. PNG, no transparency.
   - 3–10 screenshots at 1920×1080: captured from the demo and real screens, no player names.
   - **Check sizes against Amazon's current docs on the day.**
4. **`docs/fire-tv-store/listing.md`:**
   - Title, short description (key point in the first 200 characters), long description, 3–5 feature bullets.
   - Keywords and category recommendation.
   - Support URL `/support`, privacy URL `/privacy`.
   - Content-rating answers, with the reason for each. No gambling: free games, venue prizes, no wagering.
   - Data-collection answers: the app stores a venue id on the device and collects no personal data.
   - **Reviewer notes:** "Press Try demo", plus a test venue display code. Ask Andrew which test venue to use, and
     don't write its owner credentials in the file.
5. Check `app/privacy/page.tsx` covers the TV app; add a short paragraph if not.
6. Handoff: the exact file paths Andrew uploads in Phase 7.

### Phase 7 — Submit (Andrew)

See **Andrew's steps → Phase 7**.

### Phase 8 — Store link on the dashboard (Agent, Haiku 5.5 / low)

1. After approval, Andrew gives the Appstore link.
2. On `/owner/display`, add a "Get the Fire TV app" link and update the Fire Stick help panel: app first, Silk
   Display URL second. Minimal copy.
3. Keep the Display URL as is.
4. Update any copy-pinning test.
5. PR, merge, deploy.

### Phase 9 — Sports data, cost baseline, state engine (Agent, Opus 5.5 / high)

**Goal:** new screen-state data for the approved sports screens, with measured cost. No new UI.

**Out of scope:** Bingo (reserved, D17 → phase R1); college basketball (D19); any UI.

1. **Inventory:** find exactly where each approved screen's data lives. For each field, write down the table, the
   cron that writes it and how often it's updated:
   - today's games across the Pick 'Em leagues, with live scores and status (the main risk: not stored today; see
     the Phase 1 handoff §5)
   - each venue's pick count and split per game
   - the venue Pick 'Em leaderboard (top 5)
   - the venue All-Time Leaderboard (top 10, `getLeaderboardForVenue(venueId, { timeframe: "all-time", limit: 10 })`
     in `lib/leaderboard.ts`; confirm it is one `users` read ordered by `points`)
   - whatever the provider gives that marks a game as postseason or national primetime (may be nothing; then that
     boost is dropped, not faked)
2. **Baseline:**
   - Measure today's `/api/venue-screen/state` use for 3–7 days: requests per day, response size and DB time per
     request. Use a temporary log counter if needed (no Observability Plus).
   - Price the new reads. **Stop and tell Andrew if the cost changes materially.**
3. **Next Live Trivia wording (D12):** a pure function next to `formatNextLiveTriviaLine` in
   `lib/venueScreenIdleLine.ts` (keep the old one until its callers move). Runs on the TV after hydration, in the TV's
   own time zone, as today. Input: `startsAt`, `recurringDays`, now. Output, with `title` "LIVE TRIVIA" shown above
   it by the slide:
   - weekly (`recurringDays` non-empty) and the next game is 1–6 days away → "Every Thursday · 8:00 PM"; several
     days → "Every Tue & Thu · 8:00 PM"
   - one-off tomorrow → "Tomorrow · 8:00 PM"; 2–6 days → "Thursday · 8:00 PM"
   - 7 or more days away (including a weekly game with a skipped week) → "Dec 4 · 8:00 PM"
   - today, more than 60 minutes out → "Tonight · 8:00 PM" from 5 PM on, otherwise "Today · 3:00 PM", plus a
     "Starts in h:mm:ss" line
   - in the past or missing → null (slide skipped)
   - Unit-test every row, plus midnight and daylight-saving edges.
4. **Game ranking (D18):** a pure, unit-tested `lib/tvSportsRelevance.ts`. Input: today's games for the Pick 'Em
   leagues, this venue's pick count per game, the venue's time zone (`venues.timezone`, added in migration
   `20260617000000_add_timezone_to_venues.sql`) and now. Output: games in order. Score from:
   - **venue interest:** pick count at this venue for the game (already read for the pick split; the strongest
     signal, and free)
   - **league weight by local day and time**, one hand-tuned table in that file. Starting values: NFL highest Sunday
     12–11 PM, Monday and Thursday nights; college football highest on Saturdays; NBA and NHL highest on weeknights;
     soccer highest on weekend mornings; UFC on Saturday nights; tennis, WNBA and MLB in between. A league with no
     games today never shows, so seasons need no calendar.
   - **status:** live > starts within 2 hours > final within the last hour > later today; finals drop after 1 hour
   - **big game:** postseason or national primetime, only if step 1 found a field for it
   - Board = top 4. Ticker = the next ones (cap about 12), minus the board's games while the board is on screen.
   - Ranking runs on the server inside the state request. Cap the games sent to the TV (≤ 16) so the idle response
     stays small.
5. **Engine:**
   - The carousel is idle-mode data only: one `idle` payload carries `nextLiveTrivia` (now with the wording inputs),
     `pickEm` (top 4 games, splits, top 5), `allTimeLeaderboard` (top 10, or null when fewer than 3 players),
     `prizes` and `ticker`. No new top-level modes for these slides.
   - **Pre-game hour (D13/D14):** `LIVE_TRIVIA_PREGAME_LEAD_MS` 15 → 60 minutes. Precedence, in
     `selectVenueScreenState` only: Live Trivia > pre-game final 15 minutes > Category Blitz > pre-game 60→15
     minutes > Squares > Bracket > idle. Update `tests/lib.venueScreen-pregame.test.ts` and D1 plus the Standing
     rules of `docs/live-trivia-pregame-and-display-cleanup-plan.md` to say 60 minutes. Check the 1-second
     look-ahead in `getVenueScreenPollIntervalMs` still lands on time.
   - **Launch content (D21):** one switch in `selectVenueScreenState` keeps Category Blitz, Squares and Bracket off
     every display, the Silk Display URL included (D26). Their reads are skipped too, so they cost nothing. No
     per-client flag.
   - Respect "missing data is unknown, never zero" (`docs/bingo-pickem-reliability-plan.md`).
   - Bounded reads only; no per-player loops.
6. **Polling:**
   - Keep the idle 20 s and the existing `s-maxage=15` caching unless the baseline says otherwise.
   - The data changes about once a minute, so 20 s is enough for every slide.
7. Add debug modes for each new slide and for the pre-game hour, so the demo and Phase 10/11 can use them.
8. Tests, then a PR.

### Phase 10 — Pick 'Em Live Board + All-Time Leaderboard slides (Agent, Sonnet 5.5 / high)

1. Build the approved designs (mockups v2 sections D and E) in `components/venue-screen/`, using
   `lib/venueScreenBrand.ts` tokens (inline styles allowed there). Pick 'Em: 4 tiles (2×2), league label on each tile,
   top 5 in the side column, no join QR (D16). All-Time Leaderboard: top 10 in two columns of 5, gold #1 only,
   points with thousands separators.
2. Leave the bottom 96 px (ticker) and the bottom-right "Get the app" spot free; Phase 11 fills them.
3. Moments (score flash) fire only through `useFx` / `useFxMoment` keys and never replay on a poll tick.
4. Check at 1920×1080 and 1280×720.
5. Browser check with debug modes from a scratchpad clone, then a PR.

### Phase 11 — Carousel, ticker, "Get the app" QR everywhere, pre-game title (Agent, Sonnet 5.5 / high)

1. **Carousel (D20):** slides 1 Next Live Trivia, 2 Pick 'Em, 3 All-Time Leaderboard, 4 Prizes, 5 Get the app (today's
   `TvIdleAttract` with "Hightop Challenge" in full). The Prizes slide has no per-player progress bar (D28). Rotates client-side from one state response, timed from the wall
   clock like `TvIdleAttract`: no extra requests per slide. Skips empty slides. Dots above the ticker. Restarts at
   slide 1 after a game.
2. **Next Live Trivia slide (D12):** "LIVE TRIVIA" largest, wording from Phase 9 step 3.
3. **Ticker (D15):** carousel only. Skips the board's games while slide 2 shows. Fixed right segment: next Live Trivia
   short form ("Live Trivia · Thu 8:00 PM").
4. **"Get the app" QR (D16):** one shared component built on `AppDownloadQr`, same bottom-right place and size on
   every screen listed in D16; never on questions, reveals, Category Blitz rounds or the Connect screen. It never
   moves, is never covered and never animates (the `AppDownloadQr` rule). Touching `LiveTriviaScreen`,
   `TvFinalStandings` and `TvRoundBreak`: check each at 1920×1080 that nothing sits under the QR. Category Blitz,
   Squares and Bracket screens get it in R2 (D21).
5. **Pre-game (D13):** add the "LIVE TRIVIA" title to `TvLiveTriviaPregame`; the countdown must handle 60:00.
6. **Name (D10):** grep the display components for a bare "Hightop" wordmark and make it "Hightop Challenge".
7. A live game takes over immediately. Sponsor slots keep their current rules.
8. Browser check, then a PR.

### Phase 12 — Real-TV sports check (Andrew + agent, Haiku 5.5 / low)

Andrew runs the checklist in **Andrew's steps → Phase 12** on a game day. The agent records the results in the
handoff and in `docs/tv-display-physical-device-checklist.md`, and lists fixes as follow-ups.

### Phase 13 — Vega OS build (Agent, Opus 5.5 / high)

1. **Re-check Amazon's current Vega docs first.** The SDK is new and changes often.
2. **Planner's notes (2026-11-21):**
   - The app is React Native for Vega with `@amazon-devices/webview`, packaged as `.vpkg`.
   - WebView loads a remote https URL with `source={{uri}}` and `hasTVPreferredFocus`. Spatial D-pad navigation is
     on by default.
   - `allowSystemKeyEvents` is needed to receive Back.
   - Web-to-native messages use `window.ReactNativeWebView.postMessage`; native-to-web uses `injectJavaScript`.
   - Debugging: `npm run build:debug`, `vda forward tcp:9229`, then `chrome://inspect`.
   - No sideloading: device tests use the Vega developer tools.
3. Put the project in `native-tv-vega/`, matching Phase 4:
   - Same `/tv-app` start URL and UA token.
   - Keep-awake via Vega's API.
   - The same offline, Menu, Back and remembered-venue behavior. The bridge is `postMessage`-based; extend `/tv-app`
     to detect it.
4. Confirm on the day that a Vega build can be added to the existing listing, and write the exact console steps for
   Phase 14.

### Phase 14 — Vega test + submit (Andrew + agent, Sonnet 5.5 / medium)

The agent installs onto Andrew's Vega stick with the Vega tools and runs the Phase 5 checklist. Andrew then adds the
`.vpkg` to the listing using the steps in the Phase 13 handoff.

### Phase 15 — Close-out (Agent, Haiku 5.5 / low)

1. About 2 weeks after Phases 8 and 11 go live: compare state-API usage with the Phase 9 baseline and report any
   material change to Andrew. **Counter limit (CR1.4, F19):** each server instance logs a `[tv-state]` line only when
   a request arrives 10+ minutes after its last line, so its last partial window is never logged (and an instance that
   lives < 10 minutes logs nothing). Totals undercount; compare **rates**: sum `requests` and `minutes` over the
   logged lines in each period and compare requests per minute (and `avgBytes`), never raw totals. A SIGTERM flush
   wouldn't help: Vercel's docs say logs printed during shutdown don't reach the dashboard. Byte counts before CR1.4 (2026-11-24) were characters, so
   `avgBytes` / `maxBytes` read slightly low on responses with non-ASCII names (F20).
2. Add a **"Standing rules (moved from CLAUDE.md, 2026-11-03)"** section to the end of this file. It holds:
   - The TV app is a shell; screens live on the website.
   - `lib/tvApp.ts` is the only reader of `HightopChallengeTV/`.
   - The WebView loads only site hosts.
   - A connection grants a venue id only.
   - Pairing rows are short-lived and need no cron.
   - Sports screens add no crons or provider calls.
   - Every TV screen says "Hightop Challenge" in full.
   - The ticker is only on the idle carousel, never on Live Trivia or Category Blitz.
   - One QR per screen, the "Get the app" QR, in one fixed place; never on questions, reveals or the Connect screen.
   - Game ranking lives only in `lib/tvSportsRelevance.ts`.
3. Add a CLAUDE.md feature-rules row for the Fire TV app.
4. Update `SYSTEM_CONTEXT.md` and the memory note.

### Phase T3 — Seed the star-tilt test (Agent, Haiku 5.5 / low)

In `tests/lib.sportsBingo.nfl-star-tilt.test.ts`, the test "puts stars on boards materially more often than chance"
(~line 343) uses real `Math.random`. Call `installSeededRandom(<seed>)` (defined ~line 218, used by the next test) at its
start. Pick a seed whose star share clears 0.3 with margin; check the share isn't borderline across several seeds so the
assertion still proves the tilt. Change only that test. Run the file, `npm run test`, `npm run lint`; website-only PR,
no store release. Short handoff: `docs/fire-tv-app-plan_PHASE_T3_HANDOFF.md`.

### Phase T4 — Make the Live Quick Review undo test reliable (Agent, Sonnet 5.5 / medium)

**The failure (D35):** `tests/components.live-trivia-quick-review.test.ts`, "shows a possible repeat and the accepted
answers, rejects with ← and undoes with Z" (~line 87), failed once in PR #49's CI (2026-11-23):
`TestingLibraryElementError: Unable to find an element by: [data-testid="live-review-card"]` after 1033 ms, i.e. the
`waitFor` at ~line 95 timed out after pressing Z. Same commit passed in the other run; 7930 other tests passed.

**Likely cause (planner's reading; confirm it):** `components/admin/sections/LiveTriviaQuickReview.tsx` registers its
`keydown` listener in a `useEffect` that depends on `undo`, and `undo` closes over `history` and `busy`. After ←, the
test sees "Nothing left." as soon as the reject renders, then presses Z at once. If the effect that swaps in the new
listener hasn't run yet, the old listener calls the old `undo`, which sees an empty `history` (or `busy`) and returns,
so the card never comes back. A slow CI runner widens that gap. A fast human pressing ← then Z could hit the same thing.

1. Branch from up-to-date `main`. Reproduce or rule out the race: e.g. run the file many times
   (`for i in $(seq 50); do npx vitest run tests/components.live-trivia-quick-review.test.ts || break; done`), and/or
   force it by pressing Z before effects flush.
2. Fix the cause, not the timeout. Preferred: the key handler reads the latest `decide` / `skip` / `startEdit` /
   `undo` / `draft` through a ref, so the listener is registered once and is never stale. Keep the same keys and
   behavior. Don't just raise the `waitFor` timeout or add a sleep. If the cause turns out to be something else, fix
   that and say what it was in the handoff.
3. Add a test that presses ← then Z with no wait in between and expects the card back (fails before the fix if the race
   is the cause).
4. Check the Speed Quick Review (`components/admin/sections/*QuickReview*.tsx`) for the same listener pattern; fix it
   the same way if present, with a test.
5. Run the file 50+ times clean, then `npm run test`, `npm run lint`, `npx tsc --noEmit`; PR. Website (admin) only: no
   store release. Short handoff: `docs/fire-tv-app-plan_PHASE_T4_HANDOFF.md`.

### T4 review findings (2026-11-23, two review passes on PR #51 / `72ff0638`)

The fix in `components/admin/sections/LiveTriviaQuickReview.tsx` (handler in `onKeyRef`, swapped in a
`useLayoutEffect`, listener bound once) is correct. Findings, with the phase that fixes each:

| # | Finding | Where | Kind | Fixed in |
|---|---|---|---|---|
| F1 | The new test "undoes with Z pressed the instant a reject renders" can't catch the bug. It waits for "Nothing left." before pressing Z, which gives the old code's effect time to swap in the fresh listener, so `fd3bf936` passes it too (the T4 handoff says so: 15/15). It also drops the `posts` check the original test has. | `tests/components.live-trivia-quick-review.test.ts:99` | Introduced by T4 | T4.1 |
| F2 | Plan status said "T4 done" while PR #51 is open; the handoff names no PR or commit. | `docs/fire-tv-app-plan_PHASE_T4_HANDOFF.md:15`, status line | Introduced by T4 | Status line and T4 row corrected 2026-11-23 with this table; handoff in T4.1 |
| F3 | The handoff says `tmp/` and `.claude/worktrees/` are "both git-ignored". Only `tmp/` is in `.gitignore`; `.claude/worktrees/` is ignored only by this machine's `.git/info/exclude`, which a fresh clone or CI doesn't have. | `docs/fire-tv-app-plan_PHASE_T4_HANDOFF.md:12`, `.gitignore` | Introduced by T4 | T4.1 |
| F4 | A key pressed while a Keep / Reject is still saving is dropped silently: `decide` and `undo` return when `busy`. On a slow network, ← then Z within the request time leaves the reject applied while the reviewer thinks it was undone. | `LiveTriviaQuickReview.tsx:95, :121` | Pre-existing | T4.2 (D36) |
| F5 | Keep / Reject / Skip / Edit still work while "Loading…" shows. `reload()` sets `loading` but leaves the old `items`, so after a category change → decides a question from the old category that isn't on screen. Out-of-order responses (A → B → C quickly) can also leave the wrong category's list showing. | `LiveTriviaQuickReview.tsx:64–92, :193` | Pre-existing | T4.2 |
| F6 | "Nothing left." flashes before the first load: `loading` starts `false` with an empty list, so the first render shows the empty message. | `LiveTriviaQuickReview.tsx:50, :248` | Pre-existing | T4.2 |

### Phase T4.1 — Finish T4 on PR #51 (Agent, Sonnet 5.5 / medium)

**Remedial (F1–F3).** Work on the existing branch `fix/live-quick-review-undo-race` (PR #51), not a new one. Don't touch
the component: its fix is right.

1. `git fetch && git checkout fix/live-quick-review-undo-race && git pull`. If `main` moved, merge `main` in.
2. **Replace the test at ~line 99** with two tests that each **fail on `fd3bf936`** and pass on the branch:
   - **a. Behavior (preferred):** press Z in the window between the commit that renders "Nothing left." and the
     passive effects that follow it. That window is exactly where the old `useEffect` swap left a stale handler. Use a
     `MutationObserver` on the container: its callback runs as a microtask after React's commit, before the
     scheduler task that flushes passive effects. In the callback, the first time "Nothing left." is in the DOM,
     disconnect and `window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" }))` (plain dispatch; `fireEvent`
     wraps `act`, which flushes effects first and closes the window). Then `await waitFor(...)` for the card and
     assert `posts.map((p) => p.action)` equals `["reject", "undo"]`.
   - **b. Structural guard:** `vi.spyOn(window, "addEventListener")`, render, make three decisions (→, ←, Z) with
     waits between, and assert `keydown` was registered exactly once. On `fd3bf936` it re-registers per changed
     handler, so the count is > 1.
   - **Prove both fail on the old code** without disturbing this checkout: `git worktree add <scratchpad>/t4-old
     fd3bf936`, copy only the new test file into it, run `npx vitest run tests/components.live-trivia-quick-review.test.ts`
     there (symlink or `npm ci` for `node_modules`), record the failures, then `git worktree remove`. **Never** run
     `git checkout -- <file>` or `git checkout fd3bf936 -- <file>` in the main checkout (memory: it destroyed work
     before). If (a) can't be made to fail on the old code reliably in jsdom, keep (b) alone, delete (a), and say so in
     the handoff; don't ship a test that passes on both.
3. Restore the dropped check: the original "rejects with ← and undoes with Z" test (~line 87) still asserts
   `["reject", "undo"]`; make sure the new test (a) does too, and that the duplicate at ~line 99 is gone.
4. Add `.claude/worktrees/` to `.gitignore` (next to `tmp/`), so the git ignore matches the `eslint.config.mjs`
   ignore on every clone (F3).
5. Fix the handoff `docs/fire-tv-app-plan_PHASE_T4_HANDOFF.md`: name PR #51 and the commits; replace "both git-ignored"
   with the truth after step 4; replace "Unverified: the race never reproduced" with what test (a)/(b) showed on
   `fd3bf936`; "Next phase: T4.2".
6. Run the test file 50× clean (`for i in $(seq 50); do npx vitest run tests/components.live-trivia-quick-review.test.ts || break; done`),
   then `npm run test`, `npm run lint`, `npx tsc --noEmit` (not at the same time as a build). Push; wait for CI
   green on PR #51; merge (website deploy of an admin page; no store release).
7. Update the plan: T4 row → "Done; merged <date> (PR #51)", T4.1 row → done, T4.2 → **Next**; status line to match.
   Short handoff: `docs/fire-tv-app-plan_PHASE_T4.1_HANDOFF.md`.

### Phase T4.2 — Quick Review: keys while busy or loading (Agent, Sonnet 5.5 / high)

**Remedial (F4–F6), pre-existing bugs, behavior per D36.** Branch `fix/quick-review-busy-loading` from up-to-date `main`
after T4.1 merges. Admin page only: website deploy, no store release, no data or migration. No new on-screen text
(CLAUDE.md minimal copy).

1. **Z while a save runs (F4, D36)** in `components/admin/sections/LiveTriviaQuickReview.tsx`:
   - Keep a ref `inFlightRef` set by `decide` to `{ id: current.id }` for the length of its POST, cleared in `finally`.
   - In the key handler: if the key is Z and `busy` and `inFlightRef.current` is set, store
     `queuedUndoRef.current = inFlightRef.current.id` and return (one slot; a second Z while still busy does nothing
     more). Z while busy with no decision in flight (an undo, edit save or publish running) stays ignored.
   - An effect on `[busy, history, undo]`: when `!busy` and `queuedUndoRef.current` is set, clear it, then call
     `undo()` **only if** `history.at(-1)?.item.id` equals the queued id. A failed or "Already decided." save adds no
     history entry, so the queued Z is dropped and never undoes an older decision.
   - Clear `queuedUndoRef` in the category-change effect (with `setHistory([])`) and when Publish starts.
   - Every other key while busy: unchanged (ignored).
2. **Nothing acts while loading (F5):**
   - `reload()` clears `items` and `beyondPage` when it starts, so `current` is null and the buttons disable.
   - `decide`, `skip`, `startEdit` and `undo` also return early when `loading` (belt and braces), and the buttons'
     `disabled` includes `loading`.
   - Ignore stale responses: a `reloadSeqRef` counter incremented per call; a response whose number isn't the latest
     sets nothing (including `loading`).
   - While loading, the "N left" line shows nothing rather than a stale or zero count.
3. **First render (F6):** `useState(true)` for `loading`, so the first paint is "Loading…".
4. **Speed Quick Review** (`components/admin/sections/SpeedTriviaQuickReview.tsx`): it shares the patterns (its
   `undo` returns on `busy` ~line 264; `loading` starts `false` ~line 76; "Nothing left." ~line 465; decisions don't
   check `loading`). Apply the same three fixes where the code is the same, mind its extra states (`repeats`,
   `exhausted`, refill at `REFILL_AT`, bulk Keep / Reject, filters), with matching tests in its test file. If a fix
   doesn't fit Speed's flow, leave Speed unchanged for that item and say why in the handoff.
5. **Tests** (`tests/components.live-trivia-quick-review.test.ts`, and Speed's), using a deferred `fetch` mock (a
   promise the test resolves by hand):
   - ← with the reject POST held, Z, release → card back, posts `["reject", "undo"]`.
   - ← with the reject POST failing (500), Z during it → no undo POST, the earlier decision stays.
   - ← held, → pressed, release → only `["reject"]` posted (unseen question not decided).
   - Category change with the GET held: → and ← post nothing, "Loading…" shows; release → new category's question.
   - Two category changes with the first GET resolving last → the second category's list shows.
   - First render with the GET held → "Loading…" present, "Nothing left." absent.
   - Keep every existing test passing unchanged (the "250 left" / "249 left" test must still pass).
6. Run both test files 50× clean, then `npm run test`, `npm run lint`, `npx tsc --noEmit`; PR; CI green; merge.
   Update the plan (T4.2 row, status line) and write `docs/fire-tv-app-plan_PHASE_T4.2_HANDOFF.md` (short note is
   enough: admin UI only, no data).

### Phases CR1–CR3 — Code review of the merged work (D37)

**Why:** as of 2026-11-23 only T4 had been reviewed. Every other code PR of this plan was merged without a review
(PR comments are only Vercel's bot; no handoff mentions one). PR #44 is doc-only and is skipped.

**How every review phase works (CR1, CR2, CR3):**

1. **Read-only.** No code edits, commits, PRs, migrations or database writes. Read-only production queries are fine
   (`node --env-file=.env.local …` with the service-role client, `select` only), to check whether a suspected bug has
   already happened in the data. Never print `.env.local` values.
2. Start from up-to-date `main`. For each PR: read its description and handoff note, then `gh pr diff <N>`, then the
   **current** code of every file it touched (later commits may have changed or fixed it). Run the review with the
   `code-review` skill at **high** effort on the PR (`/code-review high <N>`); never `max` or `ultra` unless Andrew
   asks (they're billed and start many agents). Then do the PR-specific checks below yourself; the skill doesn't know
   this project's standing rules.
3. **Verify every finding before recording it:** point at the exact line and show the failure path, or reproduce it
   with a test in a scratchpad worktree (`git worktree add <scratchpad>/cr <ref>`), never in the main checkout. Drop
   anything you can't verify, or record it as "plausible, unverified".
4. **Record findings** in this file under a heading `### CR<N> review findings (<date>)`, in the same table form as the
   T4 findings: `#` (continue the numbering: CR1 starts at F7), finding, `file:line`, kind (**introduced by the PR** /
   **pre-existing** / **nit**), severity, failure scenario, proposed fix, and the remedial phase that fixes it.
5. **Propose remedial phases** for the findings worth fixing: insert rows right after the review's row in the phase
   table (`CR<N>.1`, `CR<N>.2`, …), each with model / effort and reason, and a "Phase details" section like T4.1 / T4.2.
   Mark each **"Awaiting Andrew's OK"**. Group by branch and risk; a migration or data fix is its own phase on
   Opus 5.5 / high and needs Andrew's yes before any `supabase db push`. A fix to code another feature plan owns goes
   in that plan instead, with a pointer here (`CLAUDE.md` §Code review findings become remedial phases, 2026-11-24).
6. **Urgent:** a live security hole, data leak, wrong points or lost picks goes at the top of the handoff's summary for
   Andrew, in plain English, with what it affects today. Still don't fix it unasked.
7. Handoff: `docs/fire-tv-app-plan_PHASE_CR<N>_HANDOFF.md` (full structure, since findings may touch auth and data).
   Update the review's row and the status line.

**CR1 — high risk (Opus 5.5 / high).** Check at least:
- **#36 (Phase 3):** the pairing table's migration grants `service_role` and has RLS
  (`tests/supabase-migration-grants-contract.test.ts`); any SECURITY DEFINER function revokes `public, anon,
  authenticated`; the public connect endpoint can't be brute-forced (4-character display code: rate limits, expiry,
  attempts per code and per IP); a connection grants a venue id only, never a partner session (D9); no `auth.users`
  adoption or deletion; `proxy.ts` auth-gate default unchanged; no `middleware.ts`; Try demo writes nothing; pairing rows
  need no cron.
- **#39 (Phase 9):** `tv_sports_games` migration grants; `claim_tv_sports_refresh` execute rights and that two server
  instances can't both refresh; precedence lives only in `selectVenueScreenState` and matches D13, D14, D21, D26;
  shared-cached idle responses (`s-maxage=15`) can't serve one venue's data to another (cache key = full URL with the
  venue); missing data is "unknown", never zero; no player id leaves the server; reads are bounded as the Cost table
  says (≤ 300 games, top 10, ≤ 12 prizes); no feed calls when no TV is on (D27).
- **#48 (N2):** points move only through `pay_pickem_points`; won/lost picks are never re-graded; a "scheduled" game
  is never graded; `game_id` / `startsAt` changes strand no existing pick, frozen line or reminder (check production for
  NHL rows created since the deploy); other leagues unchanged (D33).
- **#37 (Phase 4):** the WebView loads only site hosts (redirects and `target=_blank` included); the UA is
  `HightopChallengeTV/<version>` and never contains `HightopChallengeApp/` (D6); no JavaScript bridge a web page could
  misuse; exported activities and intents; cleartext traffic off; file access off; keep-awake and offline retry can't
  loop.
- **#46 (T2):** workflow `permissions` are minimal; secrets never reach logs; no untrusted input in `run:` steps; the
  `--guard` refuses a bad or shrunken slate (D32); a failed run can't push a broken file to `main`.

**CR2 — display and release (Sonnet 5.5 / high).** Check at least:
- **#41 (Phase 10) and #49 (Phase 11):** each rule in the display standing rules
  (`docs/venue-display-hype-and-intro-stinger-plan.md`, `docs/live-trivia-pregame-and-display-cleanup-plan.md`): game
  moments only through `useFx` / `useFxMoment` keys, nothing replays on a poll tick, no player runtime or ads on display
  paths; D15 (ticker only on carousel slides, skips games already on the board); D16 (one "Get the app" QR per screen,
  fixed spot, never on questions, reveals, Category Blitz rounds or Connect); D10 ("Hightop Challenge" in full); D20 /
  D23 (slide order, 15 s, empty slides skipped); D28 (no progress bar); text ≥ 12 px; Tailwind / venue-screen token
  rules; the `TV_CAROUSEL_DATA_ENABLED` switch.
- **Phase 8b, `native-tv/scripts/release.cjs` (in #41, `e69bc60e`):** never prints or logs a key or token; stops on a
  release in review; can't upload an unsigned or debug build or reuse a version code.
- **#38 (Phase 6):** release signing config keeps keys out of the repo; the keyboard fix; store listing copy matches
  D10 and D22.

**CR3 — small fixes (Sonnet 5.5 / medium).** For each of #43, #45, #47, #50: does the change do what its title says,
and does each new or changed test fail without the fix (prove it in a scratchpad worktree, as T4.1 does)? For #50 also
check the 5-second recheck runs once, never loops or polls (cost rule), and can't overwrite newer data with an older
response. **Last step of CR3:** ask Andrew whether every future code phase should end with `/code-review high` on its PR
before merge, recorded in its handoff (costs one review per PR; would have caught the T4 test gap). Record his answer
as a decision.

### CR1 review findings (2026-11-24, on `main` `75b47740`)

Five Opus 5.5 / high review agents, one per PR, each ran `/code-review high <N>` and then the checks above. The
reviewing session then re-checked the main findings itself (F7, F8, F14, F15, F24–F26, F29, F36: by reading the
code, re-running the Pick 'Em repro, and the T2 run log). **Nothing urgent:** no security hole, data leak, wrong
points or lost picks today (production: 0 NHL picks ever; 0 duplicate picks on one game in any sport). Line numbers
are on `main` `75b47740`. Every check that passed is listed in `docs/fire-tv-app-plan_PHASE_CR1_HANDOFF.md` §6.

| # | Finding | Where | Kind | Severity | Failure scenario → fix | Phase |
|---|---|---|---|---|---|---|
| F7 | A partner who connects in the last ~3 s of a code sees "Connected." but the TV shows "Code expired". The next create deletes the claimed row. Verified (fake-timer repro). | `components/venue-screen/TvConnectScreen.tsx:236-239`; `lib/tvConnect.ts:61, :92` | Introduced (#36) | Low | Tick stops at the local deadline without a last status read → read status once before showing expired; cleanup spares rows claimed < 60 s ago. | CR1.5 (done) |
| F8 | Hiding and re-showing the Connect screen while a status fetch is in flight starts a second poll loop (20 calls in 30 s instead of 10). Verified (repro). | `TvConnectScreen.tsx:266-270` | Introduced (#36) | Low (cost) | `onVisible` calls `tick()` while the earlier tick awaits its fetch → in-flight flag or generation counter. | CR1.5 (done) |
| F9 | A TV clock ahead of the server shortens every QR's life; > 10 min ahead, every QR is expired on arrival. Verified (repro). | `TvConnectScreen.tsx:198, :238` | Introduced (#36) | Low | Server's absolute `expiresAt` compared with `Date.now()` → deadline = receipt time + TTL; server's `expired` is the authority. | CR1.5 (done) |
| F10 | Retrying a connect that already succeeded says "Code expired." | `lib/tvConnect.ts:131-141` | Introduced (#36) | Nit | Lost response, partner taps again → on 0 rows, read the code; claimed for the same venue → ok. | CR1.5 (done) |
| F11 | In "Can't connect.", every key press or focus sends a new create (each a rejected POST after a 429). | `TvConnectScreen.tsx:280-291` | Introduced (#36) | Nit | Honour `Retry-After`; renew only on OK / Enter. | CR1.5 (done) |
| F12 | `/api/tv-app/pairings/status` has no rate limit (by design, per its comment; same exposure as `/tv/<code>`). | `app/api/tv-app/pairings/status/route.ts:16` | Introduced (#36) | Nit | Accepted; an edge (WAF) limit only if Andrew wants one. | None |
| F13 | New `app/tv-app/*` pages use `function` declarations (CLAUDE.md: arrow functions); 33 other pages do too. | `app/tv-app/page.tsx:5`, `layout.tsx:12`, `demo/page.tsx:4` | Introduced (#36) | Nit | Convert when next touched. | None |
| F14 | **TV Prizes slide shows a made-up points target:** "1 pts" under game-winner / ranked prizes and "100 pts" under leaderboard prizes. `points_required_to_win` is a NOT NULL placeholder for those. **5 of 7 active prizes in production show it today.** Verified (code + production select). | `lib/venueScreenCarousel.ts:157-162`; `components/venue-screen/TvPrizesSlide.tsx:47-48` | Introduced (#39; live since Phase 11 turned the data on) | Medium (wrong text on TVs; no points move) | Show the number only when `challenge_mode = 'progress'` and win condition is `points_threshold` (null counts as that, as in `normalizeWinCondition`). | CR1.1 |
| F15 | A league with no games counts as a failed feed: 30-min retry instead of 6 h, logged as `no-reply`, which hides real outages. Verified (production `tv_sports_refresh` due times). | `lib/pickem.ts:1882` (`ok: events.length > 0`); `lib/tvSportsSnapshot.ts:66` | Introduced (#39) | Low (~800 extra BallDontLie calls a day with a TV on; flat plan, $0) | Report whether any request succeeded; empty success → `ok: true`. Optionally count "later" only for games within ~18 h. | CR1.4 (done) |
| F16 | Prizes slide can advertise closed or not-yet-open prizes (filters only `is_active` and no winner). 0 rows today. | `lib/venueScreenCarousel.ts:138-149` | Introduced (#39) | Low | Select the schedule columns and drop closed / not-open rows with the existing pure helpers; never finalize from the TV poll. | CR1.1 |
| F17 | Date-only feeds (tennis) can fall back to noon UTC and show "live" for 8 h. Plausible, unverified (no tennis rows now). | `lib/pickem.ts:1862` (with `:1164-1168`) | Introduced (#39) | Low | When `tvStartsAt` is null, skip the row on the TV. | CR1.4 (done) |
| F18 | Hockey period 5+ is labelled "SO" (playoff 2OT+), and a shootout shows "SO 0:00". Shared by the TV and, since N2, Pick 'Em. | `lib/pickem.ts:260` | Introduced (#39) | Nit (matters from April) | Postseason: 4 → "OT", n ≥ 5 → "{n−3}OT"; "SO" without a clock. | CR1.4 (done) |
| F19 | The `[tv-state]` usage counter drops each instance's last partial window, so the Phase 15 baseline undercounts. | `lib/venueScreenUsageCounter.ts:27` | Introduced (#39) | Nit | Log with the window end, or flush via `after()`; note the limit in Phase 15. | CR1.4 (done) |
| F20 | `bytes` counts characters, not bytes. | `app/api/venue-screen/state/route.ts:32` | Introduced (#39) | Nit | `Buffer.byteLength(body)`. | CR1.4 (done) |
| F21 | "Today" is 30 min short in half-hour time zones (no live impact: all 17 venues are America/New_York). | `lib/venueScreenCarousel.ts:50-57` | Introduced (#39) | Nit | Step in 15-min increments. | CR1.4 (done) |
| F22 | A failed read of existing rows resets `final_seen_at`, so a final can stay up to 8 h instead of 1 h. | `lib/tvSportsSnapshot.ts:171-177, :191` | Introduced (#39) | Nit | On that read error, keep stored values and log. | CR1.4 (done) |
| F23 | `function` declarations in new files. | `lib/tvSportsSnapshot.ts`, `lib/venueScreenCarousel.ts`, `lib/venueScreenIdleLine.ts` | Introduced (#39) | Nit | Convert when next touched. | None |
| F24 | **Pick 'Em: when a game's start time changes, its `game_id` changes;** the player's pick disappears from the list and a second pick on the same game is accepted, **and both are paid**. Verified (repro A, B). | `lib/pickem.ts:1736` (map keyed by full id, so the `providerEventId` fallback at `:2054` never matches), `:2403` (exact-id duplicate check), `:396`, `:576` | Pre-existing in every league; newly reaches NHL via #48 | Medium (0 NHL picks so far) | Key the map by provider id too; duplicate check by user + provider id. | CR1.2 (Pick 'Em plan) |
| F25 | Grading's 4-hour rule counts from the pick's stored start, so a game moved later can be graded mid-game on the live score. Verified (repro C). | `lib/pickem.ts:2986` | Pre-existing | Medium | Count from `max(row.starts_at, feed commence_time)`. | CR1.2 (Pick 'Em plan) |
| F26 | Only `status_state === "scheduled"` blocks grading; a postponed / "PRE" game at 0–0 grades as a push 4 h after start. Code path verified (repro D); real feed values unverified. | `lib/pickem.ts:2989` | Pre-existing | Low (a push pays nothing) | Decide from `status_state` and `game_state` as `extractTvFeedState` does; postponed → canceled. | CR1.2 (Pick 'Em plan) |
| F27 | Win notifications group and link by the UTC date (`/pickem?date=` opens the next day for a 7 PM ET game). | `lib/pickem.ts:2913` | Pre-existing | Low | Group by venue-local date. | CR1.2 (Pick 'Em plan) |
| F28 | Settlement's team-name fallback takes the first game with the same teams, which can be a different game. Plausible, unverified. | `lib/pickem.ts:2948` | Pre-existing | Low | Also require start within 12 h. | CR1.2 (Pick 'Em plan) |
| F29 | **Fire TV app: a 5xx hides "Can't connect." at once and stops retrying.** Current WebView fires `onPageStarted` at commit, after `onReceivedHttpError`, and it clears `mainFrameFailed`; `onPageFinished` then hides the overlay and cancels the retry. Verified from the app code + Chromium WebView source; not yet seen on a device. | `native-tv/app/src/main/java/com/hightopchallenge/tv/MainActivity.kt:181-184, :192-196, :208-209, :129-131` | Introduced (#37) | Medium (TV stays on an error page during a Vercel 502/504 until someone presses Reload; breaks D7) | Track failures per load generation; only a clean `onPageFinished` of that generation may hide. | CR1.7 |
| F30 | A certificate error on the first load shows no overlay and never retries (`loadingUrl` isn't set yet when the error arrives). Still secure (`cancel()`). Partly verified. | `MainActivity.kt:199-205` | Introduced (#37) | Low–medium | Record the main-frame URL in `load()` / `shouldOverrideUrlLoading`, or treat any SSL error during a main-frame load as offline. | CR1.7 |
| F31 | `window.HightopTV` is injected into frames of any origin (`allowsFrame` allows any https host, `data:`, `blob:`). Not exploitable today: no TV page embeds a third-party frame. The bridge can only get / set / clear the venue id. | `MainActivity.kt:93`; `native-tv/.../TvPolicy.kt:49-53` | Introduced (#37) | Low (hardening) | Limit frames to site hosts + `about:blank`; optionally `addWebMessageListener` with origin rules. | CR1.7 |
| F32 | The retry loop and network callback keep running while the app is in the background. | `MainActivity.kt:299-305` | Introduced (#37) | Nit | Pause in `onPause`, resume in `onResume`. | CR1.7 |
| F33 | The `/owner` / `/admin` block compares the raw encoded path (`/%6Fwner` passes the check). Not exploitable: production redirects all variants to `/`, and redirect targets are re-checked. | `TvPolicy.kt:40-41` | Introduced (#37) | Nit | Match the decoded, normalized path. | CR1.7 (optional) |
| F34 | A renderer that keeps crashing recreates the activity with no limit, and the destroyed WebView still gets `onPause`. Plausible, unverified. | `MainActivity.kt:215-220` | Introduced (#37) | Nit | Guard + cap at 3 restarts in 5 min, then show the offline overlay. | CR1.7 |
| F35 | In the TV app, the `?awake=debug` readout's visibility never updates (the native branch returns before the listener). | `lib/useKeepScreenAwake.ts:93-99` | Introduced (#37) | Nit (debug only; site code) | Add the listener in the native branch. | CR1.5 (done) |
| F36 | **The weekly NFL star run goes green when the guard refuses, the API fails or the key is missing**, so no email is sent. The step runs `bash -e` without `pipefail`, so `node … \| tee` exits with `tee`'s 0. The T2 handoff's "GitHub emails you" is wrong. Verified (run 45268818494 log shows `bash -e {0}`; mock repro of 7 failure cases). | `.github/workflows/nfl-star-index-weekly.yml:42-44` | Introduced (#46) | Medium (two bad Tuesdays → snapshot > 14 days → every PR's CI red, unannounced) | `shell: bash` (gives `-eo pipefail`); JSON sanity check before `git add`; fix the handoff. | CR1.3 |
| F37 | CI goes red for ~4–6 days at each season start: the window opens Sep 1, the cron runs Tuesdays only (2027: Sep 1 is a Wednesday → red until Tue Sep 7). | `nfl-star-index-weekly.yml:11`; `lib/leagueSeasonStatus.ts:98` | Introduced (#46) | Low–medium | Add a Sep 1 cron, and/or a cheap Friday run that exits unless the snapshot is > 6 days old. | CR1.3 |
| F38 | The season probe asks for 1 row with `maxPages: 1`, and `page_limit` then marks it failed and returns `[]` whenever a `next_cursor` exists, so the in-season check is always false and re-probes every 5 min. Verified (T2 run log `page_limit`; mock). | `lib/sportsBingo.ts:1245`; `lib/ballDontLieClient.ts` (`page_limit`) | Pre-existing (`62f027cd`) | Low | First-page-only probe that keeps its rows. | CR1.6 (Pick 'Em plan) |
| F39 | The guard doesn't refuse a shrunken prior slate (602 → 12) or rows from the wrong season. Verified (mock). | `scripts/refresh-nfl-star-index.cjs:56-63` | Introduced (#46) | Low (snapshot is read by tests and scripts, not at runtime) | 50 % rule for `prior` too; refuse > 5 % wrong-season rows. | CR1.3 |
| F40 | A rebase conflict on the JSON leaves the rebase stopped; all 3 attempts fail with a misleading message. Safe (nothing pushed). Verified (throwaway repo). | `nfl-star-index-weekly.yml:61-64` | Introduced (#46) | Nit | `git rebase --abort` and say "conflict with a concurrent snapshot change". | CR1.3 |
| F41 | Each weekly bot commit builds a production deploy on Vercel (~17 a season), though the file isn't read at runtime. Disclosed only after the fact. | `nfl-star-index-weekly.yml:62`; no ignored-build step | Introduced (#46) | Nit (cost) | Ignored Build Step for that one file; needs `vercel.json` or the dashboard → **Andrew decides**. | **Done 2026-11-24** in PR `chore/fewer-builds` (`scripts/vercel-ignore-build.cjs`), not CR1.3 |
| F42 | The phase table's T2, T3 and N2 rows were stale. | this file | Doc | Nit | Fixed in this review. | Done |
| F43 | `actions/checkout` keeps the `contents: write` token in `.git/config` during `npm ci`; a compromised npm postinstall could push to `main`. Plausible, standard exposure. | `nfl-star-index-weekly.yml:26` | Introduced (#46) | Nit | `persist-credentials: false`; give the token to the commit step only. | CR1.3 |
| F44 | (Found in CR1.2, not by CR1.) The dedicated NFL Pick 'Em screen has F24's moved-id bug; payment already protected by CR1.2's settlement de-dupe. | `lib/nflPickEm.ts:1389`, `:1438`, `:1649` | Pre-existing | Low | Details in `docs/bingo-pickem-reliability-plan.md` Phase CR1.2.1. | CR1.2.1 (Pick 'Em plan) |

**Dropped after checking:** "focus lost after a wrong code" (fixed by `f807f751`); "a same-document navigation hides the
overlay" (WebView doesn't post `onPageFinished` for `pushState`); "finished NHL games keep a clock label" (the TV shows
"Final"); the old-id open-page case (0 picks since deploy); Pacific / Hawaii day filtering (correct).

### Phase CR1.1 — TV Prizes slide: real targets, open prizes only (Agent, Sonnet 5.5 / medium) — Approved by Andrew 2026-11-24

**Fixes F14, F16.** Web only; no migration, data change or store release. Branch `fix/tv-prizes-slide-target` from
up-to-date `main`.
1. `lib/venueScreenCarousel.ts` `readPrizes` (≈ line 135): add `challenge_mode, win_condition` and the schedule
   columns (`start_date, end_date, end_day, end_time, recurring_type, schedule_type`) to the select. Set
   `pointsRequired` only when `challenge_mode === "progress"` and the win condition normalizes to `points_threshold`
   (reuse `normalizeWinCondition` from `lib/challengeCampaigns.ts`; null / empty = `points_threshold`); else `null`.
2. Drop rows whose window is closed or not yet open, using the existing pure schedule / close helpers in
   `lib/challengeCampaigns.ts` (find the ones `listChallengeCampaigns` uses). **Never call anything that finalizes** —
   the comment at `readPrizes` explains why a TV poll must not.
3. Tests in `tests/lib.venueScreenCarousel.test.ts` (mock `supabaseAdmin`), each failing on today's code: a
   `game_winner` row with pts 1 → `pointsRequired: null`; a `leaderboard` row with pts 100 → `null`; a `progress` /
   `points_threshold` row with pts 500 → `500`; a one-time row whose end date was yesterday and has no winner → excluded.
4. `npm run test`, `npm run lint`, `npx tsc --noEmit`; PR; CI green; merge (auto-merge rule). Check `/venue/<id>/screen?mode=carousel&slide=prizes`
   on the deploy shows no "pts" under the game-winner prizes. Short handoff note `_PHASE_CR1.1_HANDOFF.md`.

### Phase CR1.2 — Pick 'Em game id and grading guards (in `docs/bingo-pickem-reliability-plan.md`)

Fixes F24–F28. Full phase details are in that plan under "Phase CR1.2". Reproduction test:
`docs/fire-tv-app-plan_CR1_evidence/pickem-game-id-and-grading-repro.test.ts.txt`.

### Phase CR1.3 — Weekly NFL star workflow: fail loudly, run at season start (Agent, Sonnet 5.5 / medium) — Approved by Andrew 2026-11-24

**Fixes F36, F37, F39, F40, F43; asks about F41.** Do it before Tue 2026-12-01 10:00 UTC (first scheduled run) if
possible. Branch `fix/nfl-star-workflow-hardening`.
1. `.github/workflows/nfl-star-index-weekly.yml`: `shell: bash` on the refresh step (GitHub then runs
   `bash --noprofile --norc -eo pipefail`); `persist-credentials: false` on checkout and set the push URL with the
   token only in the commit step; before `git add`, `node -e "JSON.parse(require('fs').readFileSync('data/sports-bingo/nfl-star-index.json','utf8'))"`;
   on a failed `git pull --rebase`, `git rebase --abort` and print "Conflict with a concurrent snapshot change." then
   exit 1. Add a second cron so a run fires within a day of the season window opening (Sep 1, `lib/leagueSeasonStatus.ts:98`),
   e.g. `"5 0 1 9 *"`.
2. `scripts/refresh-nfl-star-index.cjs` guard (≈ lines 56-63): apply the 50 % shrink rule to `prior` against
   `previous.prior` when the prior season matches (at rollover compare against `previous.current`); refuse when more
   than 5 % of rows have `row.season` ≠ the requested season. Export the guard function so it can be unit-tested.
3. Tests that fail today: `tests/nfl-star-index-workflow-contract.test.ts` (every `run:` with `| tee` has `shell: bash`
   or `pipefail`; a schedule fires on Sep 1; checkout has `persist-credentials: false`); guard unit tests (prior
   602 → 12 refused; wrong-season rows refused; 571 → 292 current still allowed).
4. Correct `docs/fire-tv-app-plan_PHASE_T2_HANDOFF.md`'s "the run fails … and GitHub emails you" (true only after this fix).
5. **F41 — already done (2026-11-24, PR `chore/fewer-builds`; skip this step).** `vercel.json` now runs
   `scripts/vercel-ignore-build.cjs`, which skips docs-only and snapshot-only commits. Original step: **Andrew said yes (2026-11-24):** skip the Vercel build when the only changed file is
   `data/sports-bingo/nfl-star-index.json` (saves ~17 production builds a season). This is his instruction to add a
   `vercel.json` `ignoreCommand` for exactly that case; change nothing else in `vercel.json`. Short handoff note.

### Phase CR1.4 — TV sports feed fixes (Agent, Opus 5.5 / high) — Approved by Andrew 2026-11-24

**Fixes F15, F17, F18, F19, F20, F21, F22.** Web only. Branch `fix/tv-sports-feed-review`. **Pick 'Em callers of
`lib/pickem.ts` must behave exactly as today** — change TV-only wrappers where possible and keep every Pick 'Em test
passing unchanged.
1. F15: make the BallDontLie events fetch report whether any request succeeded (a TV-only wrapper or an extra return
   field), and have `listPickEmTvFeedGames` (`lib/pickem.ts` ≈ 1882) return `ok: anySucceeded`. An empty success then
   gets the 6 h interval (`lib/tvSportsSnapshot.ts:66`) and only a real error gets 30 min / `no-reply`. Optionally
   count "later" (15 min) only for games starting within ~18 h. Test: fetch mocked to 200 `{data: []}` →
   `ok === true`, next refresh 6 h out.
2. F17: in the TV feed, skip rows where `tvStartsAt` is null instead of using the date-only `startsAt`. Test with a
   tennis-shaped event whose only date is `start_date`.
3. F18: `lib/pickem.ts:260` hockey label: postseason period 4 → "OT", n ≥ 5 → "{n−3}OT"; "SO" with no clock. Test
   period 5 postseason → "2OT". This label also shows on Pick 'Em; that change is intended.
4. F19: `lib/venueScreenUsageCounter.ts` — log the last partial window (e.g. flush via `after()`), or record the
   limit in the Phase 15 compare notes. F20: `Buffer.byteLength(body)` at `app/api/venue-screen/state/route.ts:32`.
   F21: 15-minute steps in `lib/venueScreenCarousel.ts:50-57`. F22: in `lib/tvSportsSnapshot.ts` (≈ 171-191), if
   reading existing rows errors, keep stored `final_seen_at` (don't write finals) and log.
5. Estimate BallDontLie calls per day before and after (Cost table); report. Tests, lint, typecheck, PR, CI, merge;
   check `tv_sports_refresh` due times after one refresh on the deploy (select only). Full handoff (touches a shared engine).

**Done 2026-11-24** (`docs/fire-tv-app-plan_PHASE_CR1.4_HANDOFF.md`). Steps 1 and 2 changed for correctness (D38): `ok`
means every request answered; the TV start extractor reads `date` / `game_date` before rows without one are skipped.
F19 is handled by the Phase 15 note (rates, not totals). Tests: `tests/lib.tvSportsFeed.test.ts` (new), additions in
`tests/lib.tvSportsSnapshot.test.ts`, `tests/lib.venueScreenCarousel.test.ts`; one intended expectation changed in
`tests/lib.pickem-nhl-start-time.test.ts` ("SO 0:00" → "SO").

### Phase CR1.5 — TV Connect screen timing (Agent, Sonnet 5.5 / medium) — Approved by Andrew 2026-11-24

**Done 2026-11-25** (`docs/fire-tv-app-plan_PHASE_CR1.5_HANDOFF.md`).

**Fixes F7, F8, F9, F10, F11, F35.** Web only. Branch `fix/tv-connect-timing`.
1. `components/venue-screen/TvConnectScreen.tsx` poll effect (≈ 228-275): when `Date.now() >= deadline`, do one final
   status read before showing expired (F7); add an in-flight flag so `onVisible` doesn't start a second chain (F8);
   set the deadline from receipt time (`Date.now() + (Date.parse(expiresAt) − serverNow)` or `+ TV_PAIR_TTL_MS`) and
   let the server's `expired` answer decide (F9); in "Can't connect.", honour `Retry-After` and renew only on OK /
   Enter, not on every key or focus (F11, ≈ 280-291).
2. `lib/tvConnect.ts`: cleanup at `:61` spares rows claimed in the last 60 s (F7); in `claimTvPairing` (≈ 131-141), on
   0 rows read the code and return ok when it's claimed for the same venue (F10).
3. `lib/useKeepScreenAwake.ts:93-99`: add the `visibilitychange` listener in the native branch (F35).
4. Tests that fail today: jsdom + fake timers in a `TvConnectScreen` test (claim just before expiry → `tv-connected`;
   hidden / visible toggled during a held fetch → 10 status calls in 30 s, not 20; server `expiresAt` already past on
   the TV clock → still polls); `tests/lib.tvConnect.test.ts` (second claim of the same code by the same venue → ok).
   Tests, lint, typecheck, PR, CI, merge. Short handoff note.

### Phase CR1.6 — BallDontLie season probe (in `docs/bingo-pickem-reliability-plan.md`)

Fixes F38. Full phase details are in that plan under "Phase CR1.6".

### Phase CR1.7 — Fire TV shell 1.0.1: recovery and hardening (Agent, Opus 5.5 / high) — Approved by Andrew 2026-11-24

**Fixes F29–F34.** Starts only after Amazon approves 1.0.0 (`npm run fire-tv:release` refuses while a release is in
review). Branch `fix/fire-tv-shell-recovery`. Ends with a store release (CLAUDE.md §Native app releases): 1.0.1,
versionCode 2.
1. F29: in `MainActivity.kt`, stop clearing the failure in `onPageStarted`. Keep a load generation, bumped in `load()`
   and on each allowed main-frame `shouldOverrideUrlLoading`; record a failure against the current generation; only
   `onPageFinished` of a generation with no failure may `hideOffline()`. Extract the state into a small pure Kotlin
   class (TvPolicy style) and unit-test both callback orders (start → error → finish, and error → start → finish).
2. F30: record the main-frame URL in `load()` and in `shouldOverrideUrlLoading` (redirects included) and compare SSL
   errors against it, or treat any SSL error during a main-frame load as offline. Keep `handler.cancel()`.
3. F31: `TvPolicy.allowsFrame` allows only the site hosts and `about:blank`; extend `TvPolicyTest.kt` (`https://example.com`
   and `data:` frames blocked). F33 (optional): match the decoded path with repeated slashes collapsed and `;` params
   stripped; tests for `/%6Fwner/display`.
4. F32: `onPause` removes `retryRunnable` / `networkLostRunnable` and sets `paused`; `onResume` retries if the overlay
   is showing. F34: a `webViewGone` guard, and at most 3 renderer restarts in 5 minutes, then the offline overlay.
5. Verify on the emulator with a debug build: `-PtvStartUrl` pointing at a tiny local server that returns 503 → overlay
   stays and retries at 2 / 4 / 8 / 16 / 30 s; emulator clock set to 2020 → overlay and retries. Then tests, lint,
   `npm run fire-tv:release`. Record version and submission in this plan and a full handoff.

### CR2 review findings (2026-11-25, on `main` `7105f5f7`)

Three Sonnet 5.5 / high review agents, one each for #41 (slides), #49 (carousel) and #38 + `release.cjs`. Each ran
`/code-review high <N>` and then the CR2 checks. The reviewing session (Opus 5.5) re-read the code behind F45–F47,
F49–F53, F55–F57 and F62–F65. **Nothing urgent:** no security hole, leaked secret, data leak, wrong points or lost
picks. Repros the agents ran: F45 (render with `picks: null` shows "No picks yet"), F46 (two scoring games → one
flash), F49 (`carouselSlideAt` at 35 s gives `all-time` with 5 slides, `prizes` with 4), F55 / F56 (mocked
`fetch` / `child_process`: bump left in `build.gradle.kts`, Amazon edit left open), F64 (adding `autoFocus` keeps all 21
contract tests green). Production: all 7 active prizes have a name, so F53 shows nowhere today. Checks that passed are
in `docs/fire-tv-app-plan_PHASE_CR2_HANDOFF.md` §6.

| # | Finding | Where | Kind | Severity | Failure scenario → fix | Phase |
|---|---|---|---|---|---|---|
| F45 | Pick 'Em board: an unknown pick count shows "No picks yet" (unknown shown as zero). Verified (render repro). | `components/venue-screen/TvPickEmBoard.tsx:175`; `lib/tvPickEmBoard.ts:62` | Introduced (#41) | Low | Pick read fails → `picks: null` on every game → every tile says "No picks yet" → show that text only when `picks === 0`; null shows nothing. | CR2.1 |
| F46 | Two games scoring in one poll flash only one; the other is lost for good. Verified (repro). | `lib/tvPickEmBoard.ts:155` (`return` in the loop); `usePickEmScoreFlash.ts:27-28` | Introduced (#41) | Nit | Two touchdowns between polls → only the higher-ranked game flashes → return every change and queue them (each its own `useFxMoment` token). | CR2.1 |
| F47 | After polls with no Pick 'Em data, the next poll is compared with the old snapshot, so a stale "+14" flashes. | `components/venue-screen/usePickEmScoreFlash.ts:22` | Introduced (#41) | Nit | Feed gap of several polls → old-news flash → on `!games` set `previous.current = null` (next look is a first look). | CR2.1 |
| F48 | Admin Venues: a failed display-codes load is silent; codes just aren't there. Route auth is fine. | `components/admin/sections/VenuesSection.tsx:805` | Introduced (#41) | Nit | Admin session expired → blank codes, no reason → short "Codes didn't load." with Retry. | CR2.3 |
| F49 | The carousel jumps to another slide when the set of non-empty slides changes between polls (index = elapsed ÷ 15 s mod count). Verified (repro). | `lib/tvCarousel.ts:40-44`; `components/venue-screen/TvCarousel.tsx:77, :88` | Introduced (#49) | Low | All-Time read returns null at 35 s → slide jumps to Prizes mid-dwell; also when games or prizes come and go → keep the current slide id and its start time; advance after 15 s, or at once if its slide is gone. | CR2.1 |
| F50 | The ticker's content swaps at the Pick 'Em slide boundary (board games removed, D15), so the scroll jumps; with ≤ 4 games and no leader the bar unmounts and remounts. Its comment says it "keeps scrolling across … slide changes". Verified (repro: 9 → 5 segments). | `components/venue-screen/TvCarousel.tsx:92`; `TvTicker.tsx:12, :63` | Introduced (#49) | Nit | Sunday, slide 1 → 2 → ticker text jumps → cross-fade the track on a content change (key it by the segment list) and fix the comment. | CR2.1 |
| F51 | During the 0.6 s cross-fade into or out of "Get the app", two QRs show (big one fading, corner dock instant). Verified by reading. | `components/venue-screen/TvCarousel.tsx:97, :129` | Introduced (#49) | Nit (D16 for ~0.6 s) | Slide 5 → 1 → dock appears under the fading big QR → hide the dock until the `app` slide's exit finishes (`onExitComplete`), and show it only after. | CR2.1 |
| F52 | Live Trivia final standings: the 3.6 s confetti shower covers the corner QR (no `area`; FX canvas z 60 over the dock). Disclosed in the Phase 11 handoff. | `components/venue-screen/TvFinalStandings.tsx:75`; `VenueScreenClient.tsx:442` | Introduced (#49) | Nit (keep-out standing rule) | Final screen → confetti over the QR for 3.6 s → pass an `area` that stops left of the dock, or show the dock after the shower. | CR2.1 |
| F53 | A prize with a blank name prints its headline twice (name falls back to the headline). 0 rows today. | `lib/venueScreenCarousel.ts:197`; `components/venue-screen/TvPrizesSlide.tsx:44-45` | Introduced (#49) | Nit | Partner leaves the name blank → "Free Pint / Free Pint" → skip the second line when it equals the first. | CR2.1 |
| F54 | New venue-screen files hard-code hex colours instead of `SCREEN_COLORS`; `TvSlideCanvas` repeats the 2304 stage width. Same as the folder's existing convention. | `TvCarousel.tsx`, `TvTicker.tsx`, `TvAppDock.tsx`, `TvPrizesSlide.tsx`, `TvPickEmBoard.tsx`; `TvSlideCanvas.tsx:11` | Introduced (#41, #49) | Nit | Drift only → convert when next touched. | None |
| F55 | `fire-tv:release`: a wrong signing certificate exits without undoing the version bump (`fail()` exits before the `catch`). Verified (mock). | `native-tv/scripts/release.cjs:99` (revert at `:126-129`) | Introduced (`e69bc60e`) | Low | Key mismatch → `build.gradle.kts` left at vc2 → a later run or commit skips a code → `build()` throws; revert in one `finally`. | CR2.2 |
| F56 | Any failure after the bump (upload, validate, commit, Ctrl-C) leaves the bump, and any failure after `POST /edits` leaves an open Amazon edit, so the next run refuses until someone deletes it in the console. Verified (mock: replace → 500). | `release.cjs:36-39, :67, :142-159` | Introduced (`e69bc60e`) | Low–medium | Network blip during upload → release blocked → on failure after the edit opens, delete the edit (confirm the API allows it) and revert; SIGINT / SIGTERM revert. | CR2.2 |
| F57 | The next version code comes only from the local file, and the script never commits the bump (it only says to). A forgotten commit or another checkout rebuilds the same code and fails late, after opening an edit. | `release.cjs:104-106, :160` | Introduced (`e69bc60e`) | Low–medium | Release from clean `main` after an uncommitted bump → same vc → Amazon rejects after the build → use `max(local, highest vcN in the releases folder, Amazon's current APK versionCode)`; refuse before the upload if Amazon's ≥ next. | CR2.2 |
| F58 | The in-review guard treats any 200 without `id` as "no edit"; what `GET /edits` returns while a release is in review is unproven (the dry run passed with 1.0.0 in review). Plausible, unverified. | `release.cjs:110-116` | Introduced (`e69bc60e`) | Low | Amazon wraps or changes the response → guard skipped → script builds and fails at `POST /edits` → only `{}` or 404 mean "none"; anything else stops. Investigate first (one read-only `GET /edits`). | CR2.2 |
| F59 | The `validate` response body is ignored; a 200 listing errors goes on to `commit`. Plausible, unverified (Amazon's shape unknown). | `release.cjs:157` | Introduced (`e69bc60e`) | Low | Invalid edit submitted, or a vague commit error → fail on any errors in the body. | CR2.2 |
| F60 | Gradle (and every plugin and test it runs) gets the whole environment, including `AMAZON_APPSTORE_CLIENT_SECRET`. Nothing prints it. | `release.cjs:95` | Introduced (`e69bc60e`) | Nit | A build task that dumps its env would leak it → pass a copy without `AMAZON_*`. | CR2.2 |
| F61 | Small robustness: `apksigner` runs without `JAVA_HOME`; build-tools version and cache paths hard-coded; a saved APK of the same name is overwritten; no lock against two runs. | `release.cjs:26-29, :97, :132-133` | Introduced (`e69bc60e`) | Nit | Fails on another machine / overwritten archive → pass `JAVA_HOME`; refuse to overwrite; lockfile. | CR2.2 |
| F62 | `create-upload-key.cjs` writes the credentials file before running `keytool`; if `keytool` fails, a re-run is refused and Gradle builds unsigned. | `native-tv/scripts/create-upload-key.cjs:43-44` | Introduced (#38) | Nit | Missing JAVA_HOME on first run → stray file, manual cleanup → delete the credentials file if the keystore wasn't made. | CR2.2 |
| F63 | A release build with no key files is silently unsigned (not debug-signed). The release script catches it (`apksigner`), a manual `assembleRelease` doesn't. | `native-tv/app/build.gradle.kts:20, :48, :71` | Introduced (#38) | Nit | Manual release build on a new machine → unsigned APK that looks normal → fail release tasks with a clear message when `uploadSecrets == null`. | CR2.2 |
| F64 | The contract test "never auto-focuses the code input" doesn't check `autoFocus`; adding it to the input (the original Phase 5 bug) keeps all 21 tests green. Verified (mutation). It also pins exact line breaks. | `tests/tv-app-contract.test.ts:163-170`; fix at `components/venue-screen/TvConnectScreen.tsx:233` | Introduced (#38) | Low | Someone adds `autoFocus` → keyboard over the QR again, test passes → assert no `autoFocus` on the input; match tokens, not lines. | CR2.3 |
| F65 | Privacy page and store listing say the app "collects no personal information", then mention the IP address; and say the connected venue is kept once used, but the row is deleted when the TV reads it. | `app/privacy/page.tsx:81-84`; `docs/fire-tv-store/listing.md:98`; `lib/tvConnect.ts:105` | Introduced (#38) | Nit | Text disagrees with itself and with the code → "no account or contact details"; "deleted once the TV connects, or after 10 minutes". Keep the Amazon answer "No" (the app stores only a venue id on the TV). | CR2.3 |
| F66 | On an expired / failed code, one OK press both renews the QR (window handler) and opens the code input (boxes handler); after the input blurs, focus isn't returned to the boxes. Plausible, unverified on a device. | `components/venue-screen/TvConnectScreen.tsx:298-304, :372-376, :513` | Introduced (#38, with CR1.5) | Nit | OK after "Code expired." → QR flickers and keyboard opens → `stopPropagation` when the boxes handle Enter; on input blur (not to the demo button) refocus the boxes. | CR2.3 |

**Dropped after checking:** the old `IdleVenueScreen` rendering an empty board (Phase 11 replaced it); a stale flash on
slide re-entry (`useFxMoment` claims the key once); `formatNextLiveTriviaShort` untested (covered in
`tests/lib.nextLiveTriviaWhen.test.ts:83-88`); burn-in drift of the dock (existing design); the plan status calling
#38 merged while its handoff said "not merged" (written before the merge).
**Question for Andrew (not a finding):** the corner QR sits higher on carousel slides (`bottom: 130`, above the
ticker) than on Live Trivia (`bottom: 44`). Is that fine for D16's "one fixed spot"? The review thinks yes (the ticker
needs the room).

### Phase CR2.1 — TV display polish (Agent, Sonnet 5.5 / high) — Awaiting Andrew's OK

**Fixes F45–F47, F49–F53.** Web only; no migration, data change or store release. Branch `fix/tv-display-polish` from
up-to-date `main`. Read the standing rules at the end of `docs/venue-display-hype-and-intro-stinger-plan.md` and
`docs/live-trivia-pregame-and-display-cleanup-plan.md` first. Write each test first and see it fail on `main`.
1. **F45** `TvPickEmBoard.tsx:175`: render "No picks yet" only when `game.picks === 0` (add `picksKnown` or the raw
   count to `TvTileView` in `lib/tvPickEmBoard.ts`); null → empty caption. Test: `picks: null, homePickPct: null` →
   markup has no "No picks yet"; `picks: 0` → it does.
2. **F46** `detectScoreFlash` → `detectScoreFlashes` returning every change (board order). `usePickEmScoreFlash` keeps
   a short queue and hands the board one at a time (each held until played, or `TV_SCORE_FLASH_KEEP_MS`); each keeps
   its own `pickem-score:<key>:<a>-<h>` token, so `useFxMoment` still plays each once. Test: two games score in one
   poll → both tokens come out, one after the other; an identical poll adds nothing.
3. **F47** `usePickEmScoreFlash.ts:22`: `if (!games) { previous.current = null; return; }`. `renderHook` test: KC 14
   → `undefined` → KC 28 → no flash.
4. **F49** Make the rotation stateful in `TvCarousel` with a pure helper in `lib/tvCarousel.ts`
   (`nextCarouselSlide(slides, current, shownAtMs, nowMs)`): stay on the current slide for 15 s even if the list
   changes; if the current slide is gone, go to the next one in `TV_CAROUSEL_ORDER` that is present. Keep a pinned
   `?slide=` and "a poll tick never moves it". Tests: All-Time on screen at 35 s and Pick 'Em drops out of the list →
   All-Time stays for its full 15 s; All-Time itself drops out → the next present slide (Prizes) shows at once.
5. **F50** `TvTicker`: key the scrolling track by the joined segment keys and cross-fade on change; keep the bar
   mounted (its "next Live Trivia" segment, or empty bar) when segments go to zero mid-carousel. Fix the header comment.
6. **F51** `TvCarousel.tsx:129`: show the dock only when neither the entering nor the leaving slide is `app` (track
   the leaving slide until `AnimatePresence` `onExitComplete`). RTL test with fake timers through 5 → 1: at most one
   `[data-testid=app-download-qr]` at every step.
7. **F52** `TvFinalStandings.tsx:75`: give the shower an `area` that ends left of the dock's box (use the dock's
   constants, not new numbers), or delay the dock until the shower ends (~4.6 s). Contract test either way.
8. **F53** `TvPrizesSlide.tsx:45`: skip the second line when `prize.name === prize.prize`. Render test.
9. `npm run test`, `npm run lint`, `npx tsc --noEmit`; check `/venue/<id>/screen?mode=carousel` from a scratchpad
   clone with mocked routes (CLAUDE.md §Manual Testing); PR; CI green; merge (auto-merge rule). Short handoff note.

### Phase CR2.2 — Release script hardening (Agent, Sonnet 5.5 / high) — Awaiting Andrew's OK

**Fixes F55–F63.** Tooling only: `native-tv/scripts/release.cjs`, `native-tv/scripts/create-upload-key.cjs`,
`native-tv/app/build.gradle.kts` (build guard only). The app itself doesn't change, so **no store release**; the next
real release (CR1.7, 1.0.1) uses the hardened script, so do this first. Never run the script for real in this phase,
never print or open keys (`~/Library/Application Support/Hightop Challenge/signing/`) or `.env.local` values.
1. Investigate F58 first with one read-only call: a tiny script (run with `node --env-file=.env.local`) that gets a
   token and prints only the **shape** of `GET /edits` (keys and `status`, never the token). Record what it returns
   while 1.0.0 is in review (or after approval). If Amazon documents edit deletion and validate errors, note the links.
2. Refactor `release.cjs` so nothing calls `process.exit` below `main()`: helpers throw; `main()` has one
   `try / finally` that restores the original `build.gradle.kts` unless the commit succeeded, and a `catch` that deletes
   the open edit (`DELETE /edits/{id}`, with `if-match`) when one was opened and not committed (F55, F56). Add
   `SIGINT` / `SIGTERM` handlers that do the same.
3. F57: before the bump, `next.code = max(local, highest vcN in the releases folder, Amazon's live APK versionCode) + 1`
   (read the live APK from the last committed edit or the apks endpoint found in step 1); after upload, the saved
   APK name must not exist yet (F61). After a successful commit, print the exact `git commit` line to run.
4. F58: "no edit" only for `{}` / empty body / 404; anything else without an `id` → stop with the shape. F59: fail on
   any `errors` in the validate body. F60: Gradle gets `process.env` minus every `AMAZON_*` key. F61: pass `JAVA_HOME`
   to `apksigner`; a lockfile in the releases folder.
5. F62: in `create-upload-key.cjs`, delete the credentials file if `keytool` fails and the keystore doesn't exist.
   F63: in `build.gradle.kts`, fail any `assembleRelease` / `bundleRelease` task with a clear message when
   `uploadSecrets == null` (a `gradle.taskGraph.whenReady` check); debug builds unchanged.
6. Tests: `tests/fire-tv-release-script.test.ts` running the script in a child process with a preload that mocks
   `fetch` and `child_process` (the CR2 agent's approach): wrong cert, gradle failure, upload 500, validate errors,
   `GET /edits` returning `[]`, Amazon's versionCode ahead of local → each exits 1, gradle file byte-identical, edit
   deleted where one was opened, sentinel secret never in output or in Gradle's env. Each must fail on `main` first.
7. `npm run test`, `npm run lint`; `npm run fire-tv:release -- --dry-run` only after Amazon has no release in review
   (it builds and reverts; it uploads nothing). PR; CI green; merge. Short handoff note.

### Phase CR2.3 — Connect test, privacy text, admin codes (Agent, Sonnet 5.5 / medium) — Awaiting Andrew's OK

**Fixes F48, F64–F66.** Web and docs only. Branch `fix/cr2-connect-privacy`.
1. **F64** `tests/tv-app-contract.test.ts:163`: add `expect(screen).not.toMatch(/autoFocus/)`; loosen the other
   regexes to tokens (`boxesRef.current?.focus()` inside the `view === "connect"` effect, `ref={boxesRef}`,
   `tabIndex={0}`, `codeRef.current?.focus()` inside the Enter branch). Prove: adding `autoFocus` to the input fails it.
2. **F66** `TvConnectScreen.tsx`: when the boxes handle Enter, `event.stopPropagation()` so the window handler doesn't
   also renew; on the input's blur (unless focus goes to the demo button) refocus the boxes. Fake-timer RTL test: Enter
   on the boxes with an expired code → one create call and the input opened, not both.
3. **F65** `app/privacy/page.tsx:81-84`: "It has no sign-in and asks for no account or contact details. … We keep a
   short connect code for up to 10 minutes; it's deleted once the TV connects." Match `docs/fire-tv-store/listing.md`
   "Privacy and data" notes (keep the "Collects personal information: No" answer). Fewest words (CLAUDE.md).
4. **F48** `VenuesSection.tsx:805`: on a failed load show "Codes didn't load." with Retry (refetch). Test with a
   rejected fetch.
5. `npm run test`, `npm run lint`, `npx tsc --noEmit`; PR; CI green; merge. Short handoff note.

### Phase N1 — NHL Pick 'Em start time: investigate and decide (Agent, Opus 5.5 / high)

**The bug (found in Phase 9; see `docs/fire-tv-app-plan_PHASE_9_HANDOFF.md`):** `extractEventStartIso` in
`lib/pickem.ts` tries `event.game_date` before `event.start_time_utc`. BallDontLie's NHL feed sends `game_date` as a
date only, which normalizes to 12:00 UTC (7 AM New York). So NHL Pick 'Em lists the wrong time and probably locks
picks from 7 AM. `formatPeriodLabel` also labels NHL periods "Inn. 1". The venue TV is not affected: it uses
`tvStartsAt`, `tvFeedState` and `tvPeriodLabel` ("P1 9:16").

**Why it needs care:** `buildPickEmGameId` puts `startsAt` inside the id (`<providerId>__<startsAt>__<home>__<away>`).
Correcting the time changes every NHL `game_id`. Ids are stored in `pickem_picks`, the frozen lines
(`lib/pickemFrozenLines.ts`), push game-reminder opt-ins (`push_game_reminder_optins`) and possibly tiebreakers
(`lib/pickemPrizeTiebreaker.ts`, `lib/nflPickEmTiebreaker.ts`). Settlement already falls back to the provider id and
then to team names (`lib/pickem.ts`, the pending loop), so old picks should still grade, but a player's existing pick
might show as "not picked" on the list, or let them pick twice.

Read-only. No code changes, no writes to production.
1. **Every league, not just NHL.** For each league in `BDL_PATH_BY_SPORT_KEY` (`lib/pickem.ts`), fetch one day of
   real feed rows (a handful of calls in total; BallDontLie is a flat subscription) and record which start fields each
   league sends and in what form. List every league where `extractEventStartIso` picks a date-only or wrong field.
2. **Every place a Pick 'Em `game_id` is stored or matched:** grep `game_id` and `gameId` across `lib/`, `app/api/`,
   `components/` and `supabase/migrations/`. For each: table or file, how it matches (exact id, provider id, team
   names), and what breaks if the id changes.
3. **Production counts (read-only, `node --env-file=.env.local`):** open NHL picks, NHL frozen lines, NHL reminder
   opt-ins, and NHL picks in the last 30 days. Does any current pick show the lock problem (an NHL pick placed after
   12:00 UTC on game day that was refused, or `starts_at` at `T12:00:00`)?
4. **Choose the fix.** Planner's recommendation: **keep the id, fix the time.** Build the NHL id from the same
   value it uses today (the date-normalized `game_date`), but use `start_time_utc` for `startsAt`, the list and the
   lock. No id changes, no data migration, nothing for players to notice except the right time. If step 2 shows the
   id can't stay stable safely, write the fallback instead (new ids plus a one-time remap of open rows in a new
   migration, applied only with Andrew's yes) and ask Andrew before N2.
5. Also decide the NHL period label for the Pick 'Em list (reuse the TV's hockey label helper rather than adding a
   second one).
6. Write the decision, the evidence and N2's exact steps into the N1 handoff.

### Phase N2 — NHL Pick 'Em start time: fix (Agent, Opus 5.5 / high)

**N1 chose D33** (real timestamp first in every league; NHL ids change; no migration). Its handoff §8 has the exact
steps and supersedes steps 2 and 4 below where they differ.

1. Branch from up-to-date `main`. Follow the N1 handoff's chosen fix.
2. Tests first: an NHL row with both `game_date` and `start_time_utc` gives the real start time and (with the
   recommended fix) the same `game_id` as today; every other league's id is unchanged (snapshot a sample row per
   league); a pick is open until the real puck-drop and locked after it; NHL periods read as hockey periods, not
   "Inn.".
3. Points move only via `pay_pickem_points`, and won/lost picks are never re-graded
   (`docs/pickem-college-football-and-prize-plan.md`, `docs/bingo-pickem-reliability-plan.md` standing rules).
4. If N1 chose the fallback: a new migration for the remap, with an undo log, applied only after Andrew says yes.
5. `npm run test`, `npm run lint`, `npx tsc --noEmit`, then a PR. Website only: no store release.

### Phase N3 — NHL Pick 'Em start time: game-day check (Agent, Haiku 5.5 / low)

On the first NHL game day after N2 deploys (read-only):
1. The NHL list shows each game's real puck-drop time in the venue's zone.
2. A pick can be placed after 7 AM New York and before puck-drop; it locks at puck-drop.
3. Picks made before N2 still show as picked and settle after the game (check `pickem_picks` rows). N1 found none
   on 2026-11-23; if N2's pre-deploy check also finds none, record "none to check".
4. The live period label reads "P1", "P2", "OT", not "Inn.".
5. Record results in the N3 handoff; close D29 in this file's status line, or list fixes for a follow-up.

### Phase T1 — Fix the two tests that fail on `main` (Agent, Haiku 5.5 / low)

Both tests fail every time, on `main` and in PR #41's CI (`validate` job, run 45251097245: 2 failed, 7889 passed).
Neither failure comes from TV work. Ship one small PR from `main`, then re-run #41's CI.
1. Branch `fix/main-red-tests` from up-to-date `main`.
2. **Question variety.** `tests/lib.question-variety.test.ts`, test "covers every Live Trivia category file plus Current
   Events" (around line 112). It builds the expected list as `[...live, map.CURRENT_EVENTS]`. PR #40 (`34039de3`) added
   `data/live-trivia/categories/current-events.json`, whose `categoryName` is `"Current Events"`. So `live` already holds
   it and the expected list names it twice (10 entries against 9 received). The code is right: `draft.games.live` has
   each category once. The fix is to change only the test, to `[...new Set([...live, map.CURRENT_EVENTS])].sort()`, which
   keeps it passing whether or not a Current Events file exists. Don't touch the draft map, `lib/question-variety/` or
   the Live Trivia JSON (CLAUDE.md: that JSON is canonical).
3. **NFL star snapshot.**
   - **Cause.** `tests/lib.sportsBingo.nfl-star-index-freshness.test.ts` fails while NFL is in season when
     `data/sports-bingo/nfl-star-index.json` is more than 14 days old (`NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS`,
     `lib/sportsBingoNflStars.ts`). The snapshot's `generatedAt` is `2026-11-09T06:32:05Z`, so it went stale on
     2026-11-23.
   - **Preview.** Run `npm run bingo:stars:nfl:dry-run` and read the diff it prints: entrants, drop-offs and biggest
     movers. Sanity check: the names are real current NFL starters, the slate isn't empty, and there's no mass
     drop-off.
   - **Refresh.** Run `npm run bingo:stars:nfl` and commit the file it writes. Never hand-edit the snapshot. It's
     generated (`docs/prop-bingo-nfl-plan.md` Phase 9c).
   - **Requirements and cost.** The script needs `.env.local` (`BALLDONTLIE_API_KEY`) and makes a few BallDontLie calls
     on the flat subscription, so no extra cost.
   - **Live effect.** None: `resolveNFLStarIndex` already refreshes itself on a 24 h cache. The snapshot is only the
     cold-start fallback and the baseline for the diff.
4. Run the two files alone (`npx vitest run tests/lib.question-variety.test.ts
   tests/lib.sportsBingo.nfl-star-index-freshness.test.ts`), then `npm run test` and `npm run lint`. Open the PR with
   the snapshot diff summary in its body, then merge. It's website-only, so no store release.
5. After it merges, update #41 from `main` (or re-run its CI) and confirm `validate` passes. Short handoff:
   `docs/fire-tv-app-plan_PHASE_T1_HANDOFF.md`.

### Phase T2 — Keep the NFL star snapshot fresh on its own (Agent, Sonnet 5.5 / medium)

**Why.** The freshness test exists so nobody has to remember to refresh (prop-bingo plan 9c #4). But each refresh only
lasts 14 days. Until the NFL season ends in February, CI goes red again every two weeks unless someone reruns T1 step 3.
T2 automates that run. **Superseded by D32:** it commits straight to `main` (no PR) behind the script's `--guard`;
steps 1–3 below describe the original PR design and are kept for history.
1. **Ask Andrew first.** He adds a GitHub secret `BALLDONTLIE_API_KEY`. The agent never reads or handles the value. He
   runs `gh secret set BALLDONTLIE_API_KEY` (it prompts for the value) or uses GitHub → Settings → Secrets → Actions.
   Today's secrets don't include it: `CRON_SECRET`, `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `OPENAI_API_KEY`, `SPEED_TRIVIA_ADMISSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `THESPORTSDB_API_KEY`,
   `VERCEL_DEPLOY_HOOK_URL`. Also ask whether he wants the bot's PR merged by him, or committed straight to `main`. The
   recommendation is a PR, because the plan's "the diff is the check-in" means a person reads it.
2. **Add `.github/workflows/nfl-star-index-weekly.yml`**, modelled on `headshots-weekly.yml`.
   - **Triggers:** Tuesdays at 10:00 UTC (after Monday night's stats settle), plus `workflow_dispatch`.
   - **Setup:** Node 20 like `ci.yml`, then `npm ci`.
   - **Run:** `node --conditions react-server --import tsx scripts/refresh-nfl-star-index.cjs`, with `env` from
     secrets. There's no `.env.local` in CI.
   - **Skip off-season:** first check `resolveLeagueSeasonStatus("americanfootball_nfl")` with a short `node` step, and
     do nothing when it isn't `in_season`. The freshness test is inert off-season anyway.
   - **Output:** force-push the new snapshot to the fixed branch `bot/nfl-star-index`, then open a PR (or update the
     open one) with `gh pr create`. Put the script's diff output in the PR body.
   - **Permissions:** `contents: write` and `pull-requests: write`.
3. **Traps.**
   - **No checks on the bot's PR.** A PR opened with `GITHUB_TOKEN` doesn't trigger other workflows. That's fine for
     one data file, but it's why the diff goes in the PR body.
   - **Repo setting.** "Allow GitHub Actions to create and approve pull requests" must be on. Check it with `gh api
     repos/AndrewSerulneck/Trivia-Predictions/actions/permissions/workflow`. Changing it needs Andrew's yes.
   - **The file always changes.** The script rewrites `generatedAt` on every run, so every run produces a diff.
4. **Cost.** About 17 runs per season. Each makes a few BallDontLie calls (flat subscription, $0) and uses about 3
   GitHub Actions minutes, so roughly 50 minutes a season within the free allowance. Off-season runs exit in under a
   minute.
5. **Verify.** Trigger it with `gh workflow run nfl-star-index-weekly.yml`, confirm the PR it opens and its diff body,
   and record the run id in the handoff.
6. **Fallback if Andrew declines the secret.** Keep T1's manual refresh and add a reminder line to the plan's status
   line. Don't weaken the test into a skip on CI, because then nobody would notice a stale snapshot.

### Phase R1 — Bingo "Closest to Bingo" (reserved; Agent, Opus 5.5 / high)

Runs only when Andrew says go (D17). Design: mockups v2 section G (`bingo1`, `bingo2`).
1. Data: the top few active cards for the venue's live Bingo game and "squares away" from `sports_bingo_squares`
   (see the Phase 1 handoff §5). One bounded read; only while a game with active cards is live.
2. Add it as a carousel slide (with ticker and the corner "Get the app" QR, no join QR), skipped when no game is live.
3. The BINGO! moment fires through `useFx` / `useFxMoment` keys only, once per win, never on a poll tick.
4. Measure the added cost against the Phase 9 baseline before merging.

---

## Andrew's steps

You never need to type code. When a step says "tell the agent", type it in the Claude Code chat.

### Before you start: what kind of Fire TV Stick do you have?

This decides whether your stick can run the first version.

1. On the TV, press **Home** on the remote, then go right to **Settings** (the gear icon).
2. Choose **My Fire TV**. On some sticks it's called **Device & Software**.
3. Choose **About**. Write down the device name on the first line (e.g. "Fire TV Stick 4K Max").
4. Look at the **Software version** line:
   - **Fire OS** (e.g. "Fire OS 8.1"): this stick works for Phase 5.
   - **Vega OS**: this stick is for Phase 14. For Phase 5 you'll need a stick that runs Fire OS. Most Fire TV Stick
     4K Max and Fire TV Cube models do; check that the store listing says "Fire OS" before buying.
5. Tell the agent in Phase 4 or 5 what you found.

### Phase 2: review the mockups

**Done 2026-11-22.** Round 1 became D10–D20 (mockups version 2); round 2 became D21–D25. The steps below are kept
for history.

1. Open https://claude.ai/artifact/YNP2Wft36uz6gtTq8WnDNE (private). It works best on a laptop or big screen.
   "What changed since version 1" at the top lists your round-1 changes.
2. For each section (A–H), choose **Keep**, **Change** (say what), or **Cut**.
3. At the bottom, answer:
   - which carousel slides to keep and how long each stays up
   - store art options, and whether to keep the coin logo
   - whether your Fire TV Stick runs Fire OS or Vega OS (see "Before you start")
4. Also say whether you agree with D14 (a Category Blitz round in progress keeps the screen until 15 minutes before
   Live Trivia).
5. Press **Copy** and paste it into the same Claude Code chat. The agent records it and updates the plan. When
   nothing is left to change, start Phase 3 in a new session.

### Phase 3: say yes to the database change, then try connecting on a laptop

1. During Phase 3 the agent will ask something like *"OK to run supabase db push?"*. It adds one small table that
   holds TV connection codes for 10 minutes. Reply **yes**.
2. When the agent asks to merge the pull request, reply **yes, merge it**. If it asks you to merge on GitHub instead:
   1. Open the link it gives you.
   2. Click the green **Merge pull request** button, then **Confirm merge**.
   3. The website updates by itself in about 2–5 minutes.
3. **Try it on a laptop:**
   1. Open **hightopchallenge.com/tv-app** in the laptop's browser. You should see the Connect screen with a QR code.
   2. On your phone, open the partner dashboard and make sure you're signed in.
   3. Point your phone camera at the laptop's QR code and tap the link that pops up.
   4. Tap **Connect**. Within a few seconds the laptop should switch to your venue display.
   5. Tell the agent what happened. Say "it worked", or describe what you saw.

### Phase 5: install the app from the Amazon Appstore and test it

Do this once Amazon has approved the app and you have a Fire Stick (D34). Start the Phase 5 chat first.

1. **Install it:** on the TV, search the Appstore for **Hightop Challenge TV** (or open the store link from Amazon's
   approval email on your phone and choose your Fire Stick), then **Get**. Open it from **Your Apps & Channels**.
2. **Test it:** go through the checks in step 6 below and tell the agent the result of each.
3. **If the agent asks for crash logs,** do steps 1–4 below (developer mode). Otherwise skip them.

**If the agent asks for crash logs:** your Mac and the Fire Stick must be on the **same Wi-Fi**.

1. **Turn on developer mode:**
   1. On the TV: **Settings → My Fire TV → About**.
   2. Highlight the **first line** (your device name) and press the **center button 7 times**.
   3. A message says you're now a developer.
   4. Press **Back** once. A new item, **Developer Options**, appears under My Fire TV.
2. **Turn on the debugging switch:** **Settings → My Fire TV → Developer Options → ADB debugging → ON**. If a warning
   appears, choose **OK**.
3. **Find the Fire Stick's address:**
   1. Go to **Settings → My Fire TV → About → Network**.
   2. Write down **IP Address**. It looks like `192.168.1.37`.
   3. Tell the agent: *"Fire Stick IP is 192.168.1.37."*
4. **Allow the connection:** the agent connects from your Mac.
   1. The TV shows **"Allow USB debugging?"**.
   2. Tick **Always allow from this computer** and choose **OK**.
   3. If you miss it, tell the agent and it will try again.
5. **Open the app** (after the agent installs a fix):
   1. The agent installs it.
   2. On the TV press **Home**, then open **Your Apps & Channels** (the icon of small squares) and scroll to the end.
      You'll find **Hightop Challenge TV** there.
   3. To move it to the front, highlight it, press **Menu (☰) → Move**.
6. **Test it.** Tell the agent the result of each check:
   - The app opens on the Connect screen.
   - **Scan the QR** with your phone and tap Connect. The TV switches to your display within a few seconds.
   - **Menu (☰) → Change venue**, then connect again by **typing your display code** with the remote.
   - **Try demo** shows game screens; **Back** leaves the demo.
   - **Leave it on for 2 hours.** The TV never goes to the screensaver or sleeps.
   - **Turn off your Wi-Fi** (or unplug the router) for 1 minute. The TV shows "Can't connect". Turn the Wi-Fi back
     on. The display comes back by itself within about 30 seconds.
   - **Press Home, then reopen the app.** It goes straight to your display, with no Connect screen.
   - **Turn the TV off and on.** The display comes back.
   - **During a real or test Live Trivia game,** questions, timer and sound work.
7. **When the agent says you're done,** you can turn **ADB debugging** off again. Leave it on if more fixes are
   coming.

### Phase 6: save the signing key

The agent creates the app's signing key. **If this key is lost, you can never update the app.**

**Done 2026-11-22:** with your permission, the agent saved the keys in a password-locked image in iCloud Drive. The
password is in the Apple Note "Hightop Challenge TV – Amazon upload key". The steps below are for any future key.

1. The agent gives you the names of two files in your Mac's private signing folder.
2. Open your password manager and make a new secure note called **"Hightop Challenge TV – Amazon upload key"**.
3. Attach both files, or paste the contents of the credentials file. The agent will tell you which. Save it.
4. Tell the agent: *"Backed up."*

### Phase 7: submit to the Amazon Appstore

Have the Phase 6 handoff open. It lists the exact files and text to paste. Amazon renames screens now and then; if
something doesn't match, take a screenshot and show the agent.

1. Go to **developer.amazon.com**, click **Sign in**, then open the **Developer Console**.
2. Go to **Apps & Services → My Apps**, then click **Add New App** → **Android** (Fire OS apps are Android apps).
3. **App title:** `Hightop Challenge TV`. **Category:** the one in `docs/fire-tv-store/listing.md`. Click **Save**.
4. **Availability & Pricing:**
   - Choose the countries in the listing file (expected: United States).
   - Choose **free**.
   - For **release date**, choose as soon as it's approved.
   - Save.
5. **App File(s):**
   1. Click **Upload** and choose the app file named in the Phase 6 handoff.
   2. When it lists devices, **keep only the Fire TV devices checked**. Uncheck Fire tablets and non-Amazon devices.
   3. Language: **English**. DRM: **No**.
   4. Tick the export-compliance box. Save.
6. **Description:** paste the title, short description, long description, feature bullets and keywords from the
   listing file. Save.
7. **Images & Multimedia:** upload each image from `docs/fire-tv-store/` into the box with the matching size. Upload
   the screenshots. Save.
8. **Content Rating:** answer each question as written in the listing file. Save.
9. **Privacy and data:**
   - Privacy policy URL: `https://hightopchallenge.com/privacy`.
   - Answer the data questions as in the listing file. Save.
10. **Notes for the reviewer** (the field is often called *Testing instructions*): paste the reviewer notes from the
    listing file.
11. **Optional but recommended: Live App Testing first.**
    1. Open the **Live App Testing** tab, add yourself as a tester and start the test.
    2. Amazon emails you a link. Install the app from Amazon onto your Fire Stick and check that it opens and connects.
    3. Then come back.
12. Click **Submit App**. The status changes to **Under review**.
13. **Wait 3–10 working days.** It sometimes takes up to 2–3 weeks. Amazon emails you either way.
    - **Approved:** the email or the console has the app's store link. Save it. Start Phase 13 (Vega) and, when you
      have a Fire Stick, Phase 5 (D34); paste the link into Phase 8 after Phase 5 passes.
    - **Rejected:** start a new chat: *"Fire TV app was rejected. Fix it per docs/fire-tv-app-plan.md."* Paste the
      whole rejection email. Don't argue with Amazon in the console until the agent has read it.
14. If the console stops you with a **tax or payment interview**, stop and tell the agent. Free apps usually don't
    need it, but Amazon sometimes asks anyway.

### Phase 12: check the sports screens on a real TV

On a day with live games:
1. Open **Hightop Challenge TV** (or the Display URL) at a venue.
2. Note whether each carousel slide shows while nothing else is running, is readable from across the room, and has
   the right scores.
3. Check that the Pick 'Em board shows the games your crowd cares about (NFL on Sunday, college football on Saturday,
   NBA or NHL on a weeknight).
4. Check that the ticker never appears on a Live Trivia or Category Blitz screen.
5. Scan the "Get the app" QR from across the room with your phone. It should open the store or the app page.
6. One hour before a scheduled Live Trivia game, the TV should switch to the pre-game screen and stay there.
7. Start a Live Trivia or Category Blitz game. It must take over the screen right away.
8. Tell the agent what you saw. Photos of the TV help.

### Phase 14: Vega stick

1. Buy a Fire TV stick that says **Vega OS** (e.g. Fire TV Stick 4K Select), about $30–40. Set it up with your Amazon
   account.
2. Turn on developer mode the same way as in Phase 5, steps 1–2. Vega menus may differ slightly; the agent will
   guide you.
3. Run the same tests as in Phase 5, step 6.
4. Add the Vega build to the store listing by following the steps in the Phase 13 handoff.
