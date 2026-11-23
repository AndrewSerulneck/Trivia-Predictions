# Fire TV app plan ("Hightop Challenge TV")

**Status:** Plan written 2026-11-21. **Phase 7: 1.0.0 (vc1) submitted 2026-11-23** (no DRM, Fire TV only; App ID `amzn1.devportal.mobileapp.40a765b23bb84ce49109cafe420be156`). **Phase 8b done 2026-11-23:** `npm run fire-tv:release` (see `native-tv/scripts/release.cjs`; keys `AMAZON_APPSTORE_CLIENT_ID/_SECRET` in `.env.local`; dry-run verified; Amazon blocks it while a release is in review). **Phase 1 done 2026-11-21** (mockups, handoff
`docs/fire-tv-app-plan_PHASE_1_HANDOFF.md`). **Phase 2 done 2026-11-22** (round 1 → D10–D20, round 2 → D21–D25).
**Phases 3 and 4 merged and deployed 2026-11-22** (PRs #36, #37; handoffs `_PHASE_3_HANDOFF.md`, `_PHASE_4_HANDOFF.md`).
**Phase 5 waiting on a Fire Stick** (Andrew has none to hand); an emulator smoke test ran instead and fixed the
Back-after-demo keyboard bug. **Phase 6 done 2026-11-22** (ahead of Phase 5): upload key, signed release APK, store
images, screenshots and `docs/fire-tv-store/listing.md`. See `docs/fire-tv-app-plan_PHASE_6_HANDOFF.md`. Signing
keys backed up 2026-11-22 (an encrypted image in iCloud Drive; handoff §2). Phase 6 merged via PR #38. Phase 7
(submit) waits for Phase 5 to pass. **Phase 9 merged and deployed 2026-11-23** (PR #39, `92af7e06`; data off until
Phase 11 flips `TV_CAROUSEL_DATA_ENABLED`; migration `20261122174439_tv_sports_snapshot.sql` applied to production
2026-11-23; the 3–7 day usage baseline started at deploy). See `docs/fire-tv-app-plan_PHASE_9_HANDOFF.md`.
**Phase 10 built 2026-11-23** on `feat/fire-tv-phase-10` (PR #41; Pick 'Em Live Board + All-Time Leaderboard slides; preview only,
via `?mode=carousel&slide=pick-em|all-time`, until Phase 11 rotates them). See `docs/fire-tv-app-plan_PHASE_10_HANDOFF.md`.
**Phase 11 built 2026-11-23** on `feat/fire-tv-phase-11` (carousel, ticker, "Get the app" QR, pre-game title; carousel data switched ON; PR open, awaiting merge; `docs/fire-tv-app-plan_PHASE_11_HANDOFF.md`). **2026-11-23:** Andrew answered the Phase 9/10 questions: the Prizes slide drops its progress bar (D28); the NHL Pick 'Em
start-time bug is now phases N1–N3 of this plan (D29). Two tests fail on `main` and turn every PR's CI red
(including #41); the fixes are phases T1–T2 (D30). **T1 done 2026-11-23 (PR #43 merged; `docs/fire-tv-app-plan_PHASE_T1_HANDOFF.md`).** #41 merged 2026-11-23. **T3 done 2026-11-23 (PR #45; `docs/fire-tv-app-plan_PHASE_T3_HANDOFF.md`).** **T2 done and live 2026-11-23 (PRs #45, #46 merged; first run 45268818494 committed `467fcd35`; `docs/fire-tv-app-plan_PHASE_T2_HANDOFF.md`).** **N1 done 2026-11-23 (read-only; fix chosen, D33; no NHL picks exist; `docs/fire-tv-app-plan_PHASE_N1_HANDOFF.md`).** **N2 built 2026-11-23 (PR #48, all checks green; waiting for Andrew to merge; `docs/fire-tv-app-plan_PHASE_N2_HANDOFF.md`).** Next: merge #48, then N3 on the first NHL game day after deploy. The phase table under "Phases, model and effort" is in
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
- Phase 5: install a test version on your Fire Stick and test it.
- Phase 7: submit the app to Amazon.
- Phase 12: check the sports screens on a real TV.
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
| T2 | Keep the NFL star snapshot fresh on its own: weekly GitHub Action that commits the refresh to `main` (D30, D32) | Agent | Sonnet 5.5 / medium | After T1; within 14 days of T1's refresh while NFL is in season. Needs your yes on the secret | A new workflow and a repo secret, both well specified. The secret needs Andrew's yes. |
| T3 | Stop the random star-tilt test from failing CI: seed its random numbers (D31) | Agent | Haiku 5.5 / low | Anytime; before N1 | One test file; `installSeededRandom` already exists in it. |
| N1 | NHL Pick 'Em start time: investigate and choose the fix (read-only; D29) | Agent | Opus 5.5 / high | Done 2026-11-23 (D33; `_PHASE_N1_HANDOFF.md`) | Touches Pick 'Em `game_id`s that picks, frozen lines and reminders are keyed on; a wrong call strands players' picks. |
| N2 | NHL Pick 'Em start time: the fix, tests, PR, deploy | Agent | Opus 5.5 / high | Built 2026-11-23 (PR #48 green, awaiting merge; `_PHASE_N2_HANDOFF.md`) | Shared Pick 'Em engine (`lib/pickem.ts`) and pick locking; any id change is a data change. |
| N3 | NHL Pick 'Em start time: check on the next NHL game day after N2 deploys, record results | Agent | Haiku 5.5 / low | First NHL game day after N2 deploys | Read-only check against a written checklist. Use Sonnet 5.5 / medium if it finds a bug to fix. |
| 11 | Build the carousel, ticker, "Get the app" QR on every screen, and the pre-game "LIVE TRIVIA" title | Agent | Sonnet 5.5 / high | Built 2026-11-23 (PR open, awaiting merge; ran before N3 at Andrew's request; `_PHASE_11_HANDOFF.md`) | Same reason; the QR touches existing Live Trivia and Category Blitz screens. |
| 12 | Real-TV check of the sports screens on a game day, then record results | **Andrew** + agent | Haiku 5.5 / low | A game day after Phase 11 deploys | Andrew checks; agent only records results and files fixes. |
| 5 | Install a test build on your Fire Stick and test it | **Andrew** + agent | Sonnet 5.5 / medium | When you have a Fire Stick. Do it as soon as one arrives, even out of order | Agent runs install commands and fixes small bugs; the device checklist is well defined. |
| 8 | After approval: store link on `/owner/display` | Agent | Haiku 5.5 / low | After Amazon approves 1.0.0 | One link and copy. Use Sonnet 5.5 / medium if the contract test needs new cases. |
| 13 | Vega OS build (React Native for Vega + Vega WebView around `/tv-app`) | Agent | Opus 5.5 / high | After Amazon approves 1.0.0 | New SDK and toolchain, little prior art. |
| 14 | Test on a Vega stick, then add the Vega build to the listing | **Andrew** + agent | Sonnet 5.5 / medium | After Phase 13, with a Vega stick | Device install and console steps with agent help. |
| 15 | Close-out: usage vs. baseline, standing rules, docs | Agent | Haiku 5.5 / low | Last | Doc-only, plus one read-only usage comparison. |
| R1 | **Reserved, runs only when Andrew says go (D17):** Bingo "Closest to Bingo" slide: data read, ranking of cards, UI, BINGO! moment | Agent | Opus 5.5 / high | Only when you say go (D17) | Adds a read to the shared state engine and a moment that must never replay on a poll; one phase does both. |
| R2 | **Reserved, runs only when Andrew says go (D21):** turn the Category Blitz, Super Bowl Squares and March Madness TV screens back on, add the corner "Get the app" QR to them (D16), add them to Try demo, real-TV check | Agent | Sonnet 5.5 / high | Only when you say go (D21) | Phase 9 leaves a single switch in `selectVenueScreenState`, so this is a small change, but it touches the shared engine and four display screens; high effort for the precedence and QR-placement rules. |

**Why this order (2026-11-23):**
- **T1 first:** two tests fail on `main`, so every PR's CI is red until it merges.
- **N1–N3 before Phase 11:** the NHL bug hurts players now (picks lock at 7 AM New York on every NHL game day). Phase 11
  only adds TV screens. The NHL phases are independent of the TV phases, so if you'd rather do 11 first, swap them.
- **Phase 5** needs a Fire Stick and **8 / 13** need Amazon's approval. They sit where they're likely to become possible,
  but run them as soon as they can.
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
| Sports screens (Phases 9–11) | **As built (Phase 9):** 4 small bounded reads added to each idle state request that reaches the function (games copy ≤ 300 rows, this venue's picks with usernames, All-Time top 10, prizes ≤ 12), minus the Category Blitz peek and the Squares/Bracket reads that D21 turns off. Plus one tiny claim call per server instance per 30 s, and feed refreshes per D27 (~15–30 BallDontLie requests per 2 min while a TV is on during games, ~0 otherwise; flat subscription). About +5 KB per idle response. Same 20 s poll. | Data changes about once a minute (crons), so the TV never needs to ask faster. Idle responses are shared-cached (`s-maxage=15`), so TVs at the same venue share reads. Ranking the games is plain code: no extra reads. Phase 9 reports the measured cost before building. A faster or more costly option needs your OK first. |
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

### Phase 5 — Device test (Andrew + agent, Sonnet 5.5 / medium)

**Agent:**
1. When Andrew gives the Fire Stick's IP, run `adb connect <ip>:5555`. Andrew approves the TV prompt.
2. Install the APK and watch `adb logcat` for crashes.
3. Go through the checklist in **Andrew's steps → Phase 5** with him. Fix small bugs, rebuild and reinstall.
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
   material change to Andrew.
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

### Phase 5: install the test app on your Fire Stick

**Get ready:** your Mac and the Fire Stick must be on the **same Wi-Fi**. Start the Phase 5 chat first; the agent
will ask for the IP address in step 3.

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
5. **Open the app:**
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
    - **Approved:** the email or the console has the app's store link. Start Phase 8 and paste the link.
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
