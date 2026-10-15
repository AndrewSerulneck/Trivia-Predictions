# Category Blitz — How-to-Play, Cadence, Letter & Sleep-When-Idle Plan

**Status:** Plan written 2026-10-14, revised the same day with Andrew's second round of answers.
**Phase 4 re-scoped 2026-10-14** (Andrew): no full-width letter band — keep the top-left badge, slightly bigger.
**Phases 1–5 deployed to production 2026-10-15** (~01:09 UTC; `origin/main` `9208f85` + `58d57c3`, Vercel
`hightop-challenge-l71s5p89s`). Phase 5 confirmed live: zero new rounds in the first 10 idle minutes.
**Phase 6 done 2026-10-15:** 193,590 empty rounds deleted from `category_blitz_rounds` (196,295 → 2,705); all 219
rounds with answers kept. `VACUUM FULL` not run (Andrew's call).
Latest handoff: `docs/category-blitz-how-to-play-plan_PHASE_6_HANDOFF.md`. Next: Phase 7 — verification & release record.
**Owner decisions:** Andrew, 2026-10-14 (§2). Do not re-ask them.

## 1. What Andrew asked for

1. Rewrite the first-open tutorial cards (intro card + 6 cards, exact copy in §3).
2. Majority Rules every 5th round (he played two in a row).
3. A "How to play" button under the "Next round starts in" countdown that opens the rules as a
   list, in a slide-up popup like the Partner Manual.
4. Remove the answering-screen footer "Answers save automatically — graded when the timer runs out".
5. Make the round letter much bigger.
6. Stop the old lobby + old rules list flashing on screen after tapping the game on venue home.
7. Stop running the game around the clock when nobody plays ("sleep when idle").
8. Delete the old empty Category Blitz rounds.

## 2. Decisions (Andrew, 2026-10-14)

| Topic | Decision |
|---|---|
| Alliteration bonus (new — **does not exist today**) | **+1 point, in BOTH modes.** Answer must be 2+ words, every word starting with the round's letter, and must already score (standard: valid + unique; Majority Rules: passed moderation + right letter + earned crowd points). |
| Majority Rules cadence | **Exactly every 5th round** (rounds 5, 10, 15… of a session). Never random. The admin "mode selection" control is hidden because it no longer does anything. |
| Majority Rules categories | **Fix it**: continuous Majority Rules rounds use the Majority Rules ("Blend In") category index, as the scheduled engine already does. |
| Bigger letter | **Revised 2026-10-14 (Andrew changed his mind):** keep today's letter badge in the top-left of the answering header, just **slightly bigger**. No full-width band and no layout change. Andrew: the mobile keyboard handling is fragile and was hard to get working in browsers, so don't disturb it. The keyboard-open (`compactChrome`) badge stays exactly as it is. |
| Card 4 artwork | Follow Andrew's example: `docs/category-blitz-how-to-play/card-4-example.jpg` (§3). Show **+2**, not the example's +1 — real scoring is 2 per unique answer. |
| Card 5 artwork | Same layout as Card 4 (Andrew: "use this as an example for Card 5 as well"). |
| Card 6 artwork | **Small example**: Animal → "Alligator", "5 players said it → +5 pts", in Majority Rules colours. |
| Rules popup rule 7 | **Yes** — include the minimum-players rule. |
| Lobby flash | **Fix it**: loading screen until the server answers; the old lobby never shows for a continuous venue. |
| Sleep when idle | **Yes.** The game only runs while a player has it open. Opening the venue home page must no longer wake it. |
| TV screen | **Does NOT keep the game awake.** While asleep the TV shows a not-running state (e.g. "Scan to play" / last leaderboard) instead of a live round. |
| Old empty rounds | **Delete them** — one-time cleanup, **Category Blitz rounds only**, only rounds that never had a single answer. Andrew authorised this on 2026-10-14 ("I don't care about this data… just make sure you only get rid of the old empty CATEGORY BLITZ rounds"). |

## 3. The cards — exact copy

The big "CATEGORY BLITZ" title stays at the top of every card (as today). The small step labels
("What is it?", "How it works", "Scoring", "Watch out!") are **removed**. On every card the text
sits **above** the graphic and is noticeably larger than today's body text.

| # | Text (verbatim from Andrew) | Graphic |
|---|---|---|
| Intro | Here's how to play Category Blitz | Title-card treatment (big type; optional small letter badge flourish). |
| 1 | Each round, a letter and list of categories is randomly generated. | **Keep** today's step-0 art (letter badge + category grid + "3:00" pill). |
| 2 | Your job is to name something in each category that starts with that round's letter. | **Keep** today's step-1 art (timer + answer rows); may trim to 4 rows to fit. |
| 3 | Each round lasts 3 minutes! Your responses get graded when time runs out. | New: stopwatch/clock (drawn SVG or Lucide `Timer`) with a "3:00" readout. Any motion respects Reduce Motion. |
| 4 | Unique answers score points. | Per the example image: category **"BIRDS"** in large bold type in the middle; on the left an answer chip **"Ostrich"**, on the right **"Owl"**; above each chip a hand-drawn-style burst reading **"+2"**; below each chip a small player tile (simple illustrated icon + a made-up name, e.g. "Sam", "Jess"). |
| 4b | No points for same answers! | Added 2026-10-14 (Andrew). Card 4's layout, but Sam and Jess both answer **"Ostrich"** under **"BIRDS"** and each burst reads a dimmed **"0"**. |
| 5 | Bonus points are awarded for alliteration! | Same layout as Card 4: **"FRUIT"** in the middle, one player's chip **"Prickly Pear"** with a "+2" burst and a second, differently coloured **"+1 alliteration bonus"** burst. The other side can be empty or show a plain answer (e.g. "Peach", +2) for contrast. |
| 6 | Be careful! Some rounds are "Majority Rules" mode, where the point is to give the answer you think will be most popular in each category. The point is to try and predict what other people in the room will answer. Hope you're good at reading minds! | Small example (§2). "Be careful!" may be set as the large line with the rest as body text — words unchanged. |

Card 4/5 notes from the example: dark card background, white rounded answer chips with a
handwritten-style font for the answer, the burst is short radiating strokes around the number,
player tiles are white-framed squares with the name underneath. Use the Category Blitz palette and
our fonts (`--ht-font-display` / `--ht-font-body`; no new webfont), and draw the bursts and icons
in inline SVG — no stock images. Don't copy the example's caption ("score a point!") — Andrew's
card text is the caption.

### Rules list (the "How to play" popup)

One list, same order as the cards. The cards and the list must read from **one source** (§5,
Phase 2) so they can't drift:

1. Each round, a letter and a list of categories is randomly generated.
2. Name something in each category that starts with that round's letter.
3. Each round lasts 3 minutes. Your answers are graded when time runs out.
4. Unique answers score 2 points. If anyone else gives the same answer, neither of you scores.
5. Alliteration bonus: +1 point when every word of your answer starts with the round's letter
   (e.g. "Prickly Pear" for P).
6. Every 5th round is **Majority Rules**: give the answer you think will be most popular. You
   score 1 point for every player who gave the same answer.
7. Points are only awarded when at least 3 players are in a round (2 in Majority Rules).
   (`minPlayersToScore`, `lib/categoryBlitz.ts`.)

## 4. What the code and data look like today (facts found while planning)

### Game rules
- **Why two Majority Rules rounds in a row:** continuous mode (the live default) picks each round's
  mode with a 50/50 coin flip — `startContinuousRound` → `pickRandomMode(config.modeSelection)`
  (`lib/categoryBlitz.ts` ~L2138; `pickRandomMode` in `lib/categoryBlitzPool.ts` ~L271; default
  `CONTINUOUS_DEFAULT_MODE_SELECTION = "random"`). Production confirms it: 493 Majority Rules vs
  507 standard in a 1,000-round sample. Only the legacy scheduled engine uses the cadence helper
  `isReverseRound(roundIndex)` (`lib/categoryBlitzModes.ts`, today `% 4 === 3`).
- **Wrong category list:** continuous Majority Rules rounds draw from the *standard* index
  (`assembleRandomBoard` → `LETTER_CATEGORIES`), not `B_LETTER_CATEGORIES` / `B_USABLE_LETTERS`
  (`lib/categoryBlitz.ts` L56–57, used by the scheduled engine at L961–962).
- **No alliteration logic exists.** Standard scoring: `POINTS_PER_UNIQUE_ANSWER = 2`
  (`lib/categoryBlitz.ts` L40, applied ~L1559). Majority Rules: `reverseRoundPoints(matching)` =
  matching player count (`lib/categoryBlitzModes.ts`), applied ~L1507.
- `lib/categoryBlitz.ts` is detected as binary by plain `grep` (very long lines); use `grep -a`.

### Tutorial and in-game UI
- **Tutorial copy:** `VENUE_GAME_CARDS` entry `category-blitz` in `lib/venueGameCards.ts`
  (`steps` + a separate `rules` string list). `steps` is typed as a 3- or 4-tuple — must widen to 7.
- **Tutorial graphics + layout:** `components/venue/GameIdentityPanel.tsx` —
  `CategoryBlitzIllustration({ stepIndex })` (~L935) and `GameOnboardingCard` (~L1183; renders
  `stepLabel`, then graphic, then heading, then body). Shared with Bingo, Pick 'Em, NFL Pick 'Em and
  Fantasy — **their cards must not change**.
- **Tutorial host:** `components/venue/CategoryBlitzOnboardingOverlay.tsx` (fixed-aspect card
  `aspect-[3/4.9]`, swipe, dots, Back/Next/Join). `GameLandingExperience.tsx` also reads `steps`.
- **Lobby flash — cause:** `CategoryBlitzGame` renders `LobbyScreen` (old rules list, scheduled
  engine only) whenever `phase` is `idle`/`lobby` and `session?.sessionType !== "continuous"`
  (`components/category-blitz/CategoryBlitzGame.tsx` ~L2606–2624). Before the first session
  response, `session` is null → `isContinuous` is false → the old lobby renders. It is made longer
  by the hydrate delay: `useCategoryBlitzSession` gets `""` for venue/user until a `setTimeout(0)`
  sets `isHydrated` (~L2135–2149). The code comment calls it a "sub-second transient".
- **Countdown:** `components/category-blitz/IntermissionStatus.tsx` (used by `RevealSequence.tsx`
  compact and the results screen in `CategoryBlitzGame.tsx` ~L1146) and a separate
  `ContinuousWaitScreen` in `CategoryBlitzGame.tsx` (~L638) with its own "Next round starts in".
- **Footer to remove:** `CategoryBlitzGame.tsx` ~L2056–2066 (`data-category-blitz-footer`). The
  error/Retry footer just above it stays.
- **Letter badge:** `CategoryBlitzGame.tsx` ~L1867–1935 — 56px badge (`h-14 w-14`, `text-4xl`),
  36px when `compactChrome` (keyboard open). It shares `layoutId={CB_LETTER_BADGE_LAYOUT_ID}` with
  the round-start reveal so the big reveal letter morphs into the header.
- **Popup to copy:** the Partner Manual renders through `components/owner/sheet/OwnerSheet.tsx`
  (`size="card"`, dark tone), built on `useModalOverlay.ts` (Escape, focus trap, scroll lock,
  portal, Android Back via `useNativeBackHandler`). Its dark markup is snapshot-pinned in
  `tests/components.owner-sheet.test.ts` — reuse it, don't edit it.
- **Other copy that describes the rules:** `app/faqs/page.tsx` L46–48.

### Running cost (production, read-only queries, 2026-10-14)
- **12 venues run Category Blitz 24/7**, some since July: clermont-club, hightop-test,
  dock-s-corner-tavern, riverside, brunswick-grove, carrabba-s-italian-grill-east-brunswick,
  garden-state-bar, seven-sirens-brewing-company, olde-silver-tavern, pacific-street,
  overhill-country-club, wyndham-hotels-resorts. Sessions never end.
- **What wakes a venue:** any call to `GET /api/category-blitz/sessions` runs
  `driveContinuousCategoryBlitz` (creates the session, starts rounds). Callers: the game page,
  **the venue home page on every load** (`components/venue/VenueHubClient.tsx` ~L1041 — it uses the
  response to decide whether to show the Category Blitz card), and **the TV screen**
  (`lib/venueScreen.ts` ~L347). Then the every-minute cron `/api/cron/category-blitz-continuous`
  (`runContinuousCategoryBlitzEngine`, `lib/categoryBlitz.ts` ~L2338) drives every open
  continuous session forever.
- **~2,460 rounds/day** (≈205 per venue). **27 answers submitted in the last 14 days in total**
  (6 on 2026-09-30, 21 on 2026-10-13; zero on the other days). >99.9% of rounds are unplayed.
- **`category_blitz_rounds` is the largest table in the database:** 113 MB (92 MB table + 21 MB
  indexes), 195,670 rows, growing ~43 MB/month. `category_blitz_submissions` is 952 kB, ~2,021 rows.
- Cron load: each tick does ~6–8 queries per open venue → ~100–120k queries/day. AI grading costs
  nothing for empty rounds (the LLM judge/moderator only runs on submitted answers).
- Dollar cost today is small (estimate < ~$5/month; bills not inspected). It scales linearly with
  every venue that has ever been opened — ~1M queries/day and ~4 GB/year at 100 venues.
- **Foreign keys:** the only table referencing `category_blitz_rounds` is
  `category_blitz_submissions.round_id` (`on delete cascade`,
  `supabase/migrations/20260628130000_scategories.sql` L82). Deleting a round with no submissions
  therefore removes nothing else.

### Tests and scripts that pin things this plan changes
`tests/lib.category-blitz-modes.test.ts`, `tests/lib.category-blitz-pool.test.ts`,
`scripts/verify-category-blitz-mobile-shell.cjs` (footer + letter badge selectors),
`scripts/simulate-category-blitz.cjs`, `tests/native-back-review-fixes.test.ts` (lists every
closable player popup — L186 has the onboarding overlay). Search `tests/` for
`category-blitz`/`categoryBlitz` before each phase; the sleep phase will touch tests for the cron,
the sessions route and the venue screen.

## 5. Phases

### Phase 1 — Scoring & round cadence (server)
**Model: Claude Opus 5.5 · Effort: high** (touches live grading; points feed leaderboards and
Rewards accrual).

1. `lib/categoryBlitzModes.ts`: `isReverseRound = (roundIndex) => roundIndex % 5 === 4` (0-based,
   so rounds 5, 10, 15… are Majority Rules). Keep it the ONE home of cadence.
2. `startContinuousRound`: replace `pickRandomMode` with `isReverseRound(roundIndex)`, where
   `roundIndex` = count of existing rounds in the session — one `select("id", { count: "exact",
   head: true }).eq("session_id", …)` per round start. A concurrent duplicate start already
   resolves via the `23505` branch, and both racers compute the same count, so they agree on mode.
   (Phase 6 deletes old empty rounds, which lowers some sessions' counts once — harmless: the
   cadence just restarts from the new count.)
3. Continuous Majority Rules rounds use `B_LETTER_CATEGORIES` / `B_USABLE_LETTERS` (respecting a
   venue's custom `categoryPool`; if that leaves < 12 categories for the letter, fall back to the
   standard board rather than failing the round). Pick the letter from the B usable set.
4. Delete `pickRandomMode` if nothing else calls it. **Do not** drop the `mode_selection` DB column
   (no migration in this plan). Hide the "mode selection" control in
   `components/category-blitz/CategoryBlitzContinuousSettings.tsx`; the API may keep accepting it.
5. New pure module `lib/categoryBlitzAlliteration.ts`: `isAlliterativeAnswer(answer, letter)` —
   split on whitespace and hyphens, strip punctuation, require ≥2 words, every word starts with
   the letter (same normalisation as `answerStartsWithLetter`). `ALLITERATION_BONUS_POINTS = 1`.
   No server-only imports (the UI uses it too).
6. Apply the bonus in `scoreRound` **only when the answer already scores > 0**, in both branches
   (standard ~L1559, Majority Rules ~L1507). `points_awarded` includes it, so leaderboards,
   session totals and Rewards accrual pick it up with no other change. Not applied when
   `insufficientPlayers`.
7. Results/grading UI: show a "+1 alliteration" chip on qualifying scored answers
   (`GradingCascade.tsx`, results rows). Derive it client-side from the shared pure function +
   the round letter + `points_awarded > 0` — no new column, no API change.
8. Tests: update `lib.category-blitz-modes` / `lib.category-blitz-pool`; add
   `tests/lib.category-blitz-alliteration.test.ts` (Prickly Pear/P ✓, "Pear"/P ✗ single word,
   "Prickly apple"/P ✗, "Peanut-Pie" ✓, wrong letter ✗, punctuation/case); add scoring cases for
   both modes incl. "bonus not applied to a 0-point answer". Update `simulate-category-blitz.cjs`
   if it asserts the mode mix.

Cost: +1 count query per round start. Negligible (and far fewer round starts after Phase 5).

### Phase 2 — Tutorial cards
**Model: Claude Opus 5.5 · Effort: medium** (visual craft; must fit a fixed-size card on small
phones without touching the other games' cards).

0. **Unblock the local build first.** `npm run build` type-checks every `.ts` file the tsconfig
   `include` globs match, including the git-ignored scratch folder `tmp/` (`.gitignore:22`). A
   Speed Trivia probe there
   (`tmp/speed-trivia-uniqueness-private/progressive-review-2026-10-14/phase-3/speed-trivia-phase3-browser-probe.ts`)
   has type errors, so every local build fails after "Compiled successfully". Vercel builds from
   git and never sees `tmp/`. Fix: add `"tmp"` to `tsconfig.json` `exclude` (beside `native`).
   Don't edit, move or delete the probe file — it is someone else's Speed Trivia work.
1. One source of copy: a `CATEGORY_BLITZ_HOW_TO_PLAY` array (new `lib/categoryBlitzHowToPlay.ts`,
   or inside `lib/venueGameCards.ts`) holding each card's display text and its list-version text
   (§3). The `category-blitz` `steps` and `rules` are built from it; Phase 3's popup reads it too.
2. Widen `steps` to a non-empty array (7 for Category Blitz); make `stepLabel`/`body` optional or
   add a Category-Blitz "statement" layout. Other games keep their exact output.
3. In `GameOnboardingCard`, a Category Blitz-only branch: title → large statement text
   (~`clamp(1.35rem,5vw,1.9rem)`, display font; never below the 12px floor) → graphic. No step label.
4. `CategoryBlitzIllustration`: intro art, keep cards 1–2 art (trim if needed), new art for cards
   3–6 per §3. **Open `docs/category-blitz-how-to-play/card-4-example.jpg` before drawing Cards 4
   and 5.** Tailwind only (the existing inline `style` uses here are legacy — don't add more unless
   a value can't be expressed in Tailwind). Small labels use `text-caption`/`text-footnote`.
5. Fit check at 320×568, 375×667, 390×844 and 430×932 — nothing clipped inside `aspect-[3/4.9]`.

### Phase 3 — Rules popup, footer removal, lobby-flash fix
**Model: Claude Sonnet 5.5 · Effort: medium.**

1. `CategoryBlitzRulesSheet` (new, `components/category-blitz/`): renders the §3 list through
   `OwnerSheet size="card"` (dark tone, eyebrow "Category Blitz", title "How to play"). Reuse — do
   not fork or restyle `OwnerSheet`.
2. A "How to play" button directly under the countdown in `IntermissionStatus` (both full and
   compact) and in `ContinuousWaitScreen`. Local `useState` for open — no URL mirroring. Tap
   target ≥ 44px.
3. Android Back closes it: `useModalOverlay` already calls `useNativeBackHandler`; add the new
   file to the popup list in `tests/native-back-review-fixes.test.ts` if that test requires it.
4. Delete the "Answers save automatically…" footer branch; keep the error/Retry footer. Update
   `scripts/verify-category-blitz-mobile-shell.cjs` if it expects `data-category-blitz-footer`.
5. **Lobby flash:** until the first session response has landed (track a `hasLoaded` flag in
   `useCategoryBlitzSession` or the game), render `HightopLoader` (via `useLoaderVisible`, the
   house pattern — no second loader) instead of `LobbyScreen`. Render `LobbyScreen` only when a
   loaded response says the venue is on the scheduled engine. Also check the hydrate
   `setTimeout(0)` path doesn't paint `LobbyScreen` for a frame. Add a component test that the
   first render of `/category-blitz/play` never contains the old rules text.
6. Update `app/faqs/page.tsx` Category Blitz copy (every 5th round; alliteration bonus).

### Phase 4 — Slightly bigger letter badge (revised 2026-10-14)
**Model: Claude Opus 5.5 · Effort: medium** (a two-class change, but it sits next to the
mobile-keyboard chrome, which is fragile — read `docs/category-blitz-mobile-keyboard-handoff.md`
first).

Andrew changed his mind: **no full-width band.** The letter stays where it is (top-left of the
answering header, `AnsweringScreen` in `CategoryBlitzGame.tsx`, search `letterBadgeClassName`),
just slightly bigger. Do not restructure the header, move the timer or the mode rule, or touch
anything keyboard-related.

1. Keyboard **closed** only: badge `h-14 w-14` (56px) → `h-16 w-16` (64px); glyph `text-4xl`
   (36px) → `text-5xl` (48px). If the mode rule text wraps worse at 360px width, settle for
   60px / `text-[2.75rem]` rather than shrinking anything else.
2. Keyboard **open** (`compactChrome`): **unchanged** — `h-9 w-9`, `text-2xl`, `py-1.5` header.
3. Keep `layoutId={CB_LETTER_BADGE_LAYOUT_ID}` and the "drop to plain div after the morph"
   behaviour exactly as they are. The shared `letterBadgeClassName` already gives the morphing
   and plain forms identical geometry — change the size only there. Check the round-start reveal
   still lands cleanly on the larger badge.
4. Out of scope: `compactChrome` logic, `visualViewport`/keyboard detection, the footer/answer-row
   layout, the reveal badge's own size.
5. Run `scripts/verify-category-blitz-mobile-shell.cjs` and the `verify` skill; screenshot both
   modes, keyboard open and closed, at 360px and 390px widths. Keyboard-open screenshots should be
   pixel-identical in layout to before.

### Phase 5 — Sleep when idle
**Model: Claude Opus 5.5 · Effort: high** (changes the engine that runs every venue's game; a
mistake here either stalls a live game or keeps the waste).

Goal: rounds are created only while at least one player has the game open. No migration, no new
column, no flag (Andrew accepted the recommendation; behaviour change ships with the deploy).

1. **Split "peek" from "drive".** Add a read-only path that answers "is Category Blitz on at this
   venue, and what's the current state?" without creating sessions or starting rounds (e.g.
   `GET /api/category-blitz/sessions?venueId=…&peek=1`, or a separate route — pick the one that
   keeps response shapes stable). It resolves `resolveContinuousConfig` (on/off) and reads the
   latest session/round if any.
2. **Venue home uses peek.** `VenueHubClient.tsx` ~L1041 decides whether to show the Category Blitz
   card. With sleeping sessions, "a live session exists" is no longer the test — show the card when
   continuous mode is on for the venue (config resolves non-null), awake or asleep. Check
   `visibleOnVenueHome: false` in `lib/venueGameCards.ts` and whatever reads it.
3. **TV uses peek** (`lib/venueScreen.ts` ~L347): never drives. While asleep, the TV shows a
   not-running state (e.g. "Scan to play Category Blitz" with the join QR from `lib/joinQr.ts`, or
   the last leaderboard). When players wake it, the TV picks up the live round on its next poll.
4. **The game page drives.** `GET /api/category-blitz/sessions` from `CategoryBlitzGame`
   (`useCategoryBlitzSession`) keeps calling `driveContinuousCategoryBlitz` — a player with the game
   open is the wake signal. A player who arrives after idle gets a fresh round immediately (the
   intermission is long past), with the full 3 minutes.
5. **The cron stops starting rounds.** `runContinuousCategoryBlitzEngine` keeps *scoring* expired
   rounds (so a round still gets graded when every player has closed the app) but no longer starts
   the next one. Next rounds start from the open game page's round-boundary kick
   (`lib/categoryBlitzRealtime.ts` ~L135+, jittered per `kickJitterMs`). **Verify the kick path
   reaches `driveContinuousCategoryBlitz`** (directly or via the sessions route); if it only reads
   `current-round`, route it through the drive. Multiple players kicking at once is already safe
   (the `23505` one-open-round guard).
6. **Narrow the cron's scan.** Instead of driving every open continuous session every minute, query
   only rounds with `status in ('active','scoring')` whose `ends_at` has passed (one indexed query;
   check `20261007025200_category_blitz_latest_round_index.sql` for a usable index) and score
   those. Idle ticks become one cheap query.
7. **Edge cases to test:** a player alone with the game open through several rounds (keeps going);
   all players leave mid-round (round is scored by the cron, no new round); player returns hours
   later (fresh round starts at once); two players arrive within a second (one round); the scheduled
   (non-continuous) engine is untouched; the Category Blitz global-room flag
   (`NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`, off today) still resolves rooms through
   `resolveCategoryBlitzRoomId`.
8. **Measure.** Before deploy, record the baseline from §4 (rounds/day ≈ 2,460). After deploy,
   re-count rounds/day for a few days with the read-only counting script used in planning
   (`select("id", { count: "exact", head: true })` on `category_blitz_rounds` by `started_at` day)
   and report the drop to Andrew.

Cost: removes ~99% of rounds created, ~100k DB queries/day, the realtime broadcasts and ~43 MB/month
of storage growth. The every-minute cron still fires (1,440/day) but each idle run is one query.

### Phase 6 — One-time cleanup of old empty Category Blitz rounds
**Model: Claude Opus 5.5 · Effort: medium** (irreversible production delete; the script is simple
but the predicate must be exactly right). **Run only after Phase 5 is deployed**, or the table
refills at ~2,460 rows/day.

Andrew authorised the delete on 2026-10-14. Scope is **`category_blitz_rounds` only**. No other
table is touched.

1. New script `scripts/cleanup-empty-category-blitz-rounds.cjs` (service-role, same env pattern as
   other scripts; `node --env-file=.env.local`). **Dry run by default**; `--apply` deletes.
2. A round is deleted only if **all** are true:
   - it has **zero** rows in `category_blitz_submissions` (checked per batch with a fresh read
     right before the delete, never from an earlier cached list);
   - `status = 'complete'`;
   - `started_at` older than 24 hours;
   - it is **not** the latest round of its session (the engine reads the latest round to decide
     what to do next, and the TV shows the last results).
3. Delete in batches (e.g. 1,000 ids per `delete().in("id", …)`), with a short pause between
   batches, logging counts. Re-runnable: a second run finds nothing.
4. Before `--apply`, the dry run prints: total rounds, rounds that would be deleted, rounds kept and
   why (has answers / latest of session / too recent / not complete). Rounds with answers must all
   be in "kept". Paste the dry-run summary into the handoff.
5. No row export is required (Andrew: "I don't care about this data"), but do write the deleted
   ids + count to a local log under the scratchpad (not the repo) for the record.
6. Afterwards, re-run `supabase inspect db table-stats --linked`. Note: Postgres reuses the freed
   space for new rows but the reported table size won't shrink until a `VACUUM FULL
   public.category_blitz_rounds;` (locks that table for a few seconds at this size). That is
   Andrew's call — offer the exact SQL, don't run it unasked.

### Phase 7 — Verification & release record
**Model: Claude Sonnet 5.5 · Effort: low.**

1. Full gates (sequential, never typecheck during build): `npx tsc --noEmit`, `npm run lint`,
   `npm run test`, `npm run build`.
2. `verify` skill end-to-end on Category Blitz: venue home → tap game (no lobby flash) → tutorial
   (7 cards) → join → round → intermission → "How to play" popup; a second browser joins the same
   round; close both and confirm no new round starts.
3. Device checklist for Andrew (real phone): tutorial readability, popup, bigger letter badge, keyboard
   open/close, Android Back closes popup, Majority Rules on round 5, alliteration chip, TV shows the
   asleep state then wakes when a player opens the game.
4. Add a Category Blitz bullet to `CLAUDE.md`: cadence home (`isReverseRound`), alliteration home
   (`lib/categoryBlitzAlliteration.ts`), rules single source, and "the game only runs while a player
   has it open — venue home and TV only peek".

## 6. Rules for every phase

- **The working tree has many unrelated uncommitted Speed Trivia changes** (see `git status`).
  Work on a branch, stage only your files by path, never `git add -A`, never `git checkout --`
  a file (it wipes Andrew's work).
- Andrew runs `next dev` on :3000 — never `pkill next`; browser-test from a scratchpad clone
  (`CLAUDE.md`, memory note). Dev shares the production database: anything that drives a session
  from a dev server creates real production rounds.
- No migration, no feature flag, no new env var in this plan. Push/deploy is Andrew's call.
  Phase 6 runs against production on Andrew's standing 2026-10-14 authorisation, but only after
  Phase 5 is live.
- Each phase ends with `docs/category-blitz-how-to-play-plan_PHASE_<N>_HANDOFF.md` and updates the
  status line at the top of this file.

## 7. Open questions for Andrew

1. (Optional, not planned) A small daily prune of empty rounds older than 7 days, so the few
   empty rounds that still happen after Phase 5 (a player opens the game and leaves) don't pile up.
   Ask before adding it.
