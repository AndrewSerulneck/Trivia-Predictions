# Fire TV app — Phase 1 handoff (mockups)

> **Update 2026-11-22 (Phase 2 done):** Andrew's round-1 changes are D10–D20 (mockups version 2, same link) and his
> round-2 answers are D21–D25 (see "Andrew's choices" below). Phase 3 started the same day on `feat/fire-tv-connect`.

## For Andrew (plain English)

- **What changed:** I made one private page showing every new TV screen at 1080p: the Connect screen, the Pick 'Em Live
  Board, Bingo "Closest to Bingo", the ticker rail, the idle carousel and the store art. Nothing in the website or app
  was changed or built.
- **Link:** https://claude.ai/artifact/YNP2Wft36uz6gtTq8WnDNE (private; only you can open it unless you share it).
  Best on a laptop.
- **Live?** No. It is a design page only.
- **What I need from you (Phase 2):** under each screen pick Keep, Change or Cut. At the bottom are three more
  questions (ticker during questions, which carousel slides and how long, which store art). The page writes your
  answers as text. Press **Copy** and paste it into this chat.
- **Three things the data check found, worth reading before you decide:**
  1. **Live scores and game clock are not stored anywhere for Pick 'Em today.** The sports provider is asked when a
     page loads. To show scores on TVs without new provider calls (plan rule D8), Phase 9 would save what the
     1-minute settling job already fetches. If that is not possible without cost, I will tell you first.
  2. **Pick split, top 5 and Bingo cards are already stored,** so those screens need no new data collection.
  3. **The brand logo has gold coins.** The mockups never add chips, slots, cards or odds, but Amazon's rating form
     asks about simulated gambling. Say if you want a coin-free mark on the Fire TV store art.
- **Cost:** none so far. No code, no database, no provider calls.

---

## For the next agent

You have none of the Phase 1 conversation. Everything you need is below.

### 1. What comes next

- **Phase 2 (Andrew):** he replies in the Phase 1 chat with his choices. **The agent in that chat** (or the first agent
  that sees his reply) records them in `docs/fire-tv-app-plan.md` as **D10, D11, …** (one row each in the Decisions
  table, dated, "Andrew") and appends them to this file under "Andrew's choices" below. Then update the plan's Status
  line.
- **Phase 3** (after that): Opus 5.5 / high, per the plan's table. Read the plan's Phase 3 section; the facts below
  adjust it in two places (see §5).
- **Out of scope for the Phase 2 recording step:** any code.

### 2. Starting state

- Branch: `fix/firestick-keep-awake` (checked out when the plan was written, and still). Last commit `8be5b3cd`
  ("Keep the screen awake in Expand; add awake=debug readout"). That branch holds uncommitted keep-awake Phase 1 work.
  **Do not lose it.** Never `git checkout -- <file>`, and do not build the Fire TV work on that branch. Phase 3 branches
  `feat/fire-tv-connect` from up-to-date `main`.
- Nothing committed, pushed or deployed by Phase 1. New untracked files from this phase:
  - `docs/fire-tv-app-plan_PHASE_1_HANDOFF.md` (this file)
  - `docs/fire-tv-app-plan_PHASE_1_MOCKUPS.src.html` (the mockup page source; see §4)
- Edited (tracked? no, the plan itself is still untracked): `docs/fire-tv-app-plan.md` Status line only.
- `git status` also lists dozens of untracked iCloud duplicates named like `"foo 2.ts"`. They are not ours. Do not
  commit them, and do not stage with `git add -A`.
- Data: nothing read from or written to Supabase. No env files touched.

### 3. Decisions already made

Everything in the plan's Decisions table (D1–D9) still stands. Phase 1 added none. Andrew's mockup answers (D10+) are
**pending**.

Choices I made in the mockups that Andrew has not confirmed (flagged on the page; he may change them):
- Pick 'Em board uses an emerald + gold wash; Bingo uses violet + cyan; the rest reuse `lib/venueScreenBrand.ts`
  themes. Pick 'Em and Bingo have no theme entry today.
- Idle carousel loop is 5 slides × 15 s = 75 s, chosen to match `IDLE_MOMENT_MS = 75_000` in
  `components/venue-screen/TvIdleAttract.tsx`.
- Recommendation (not a decision): no ticker during Live Trivia questions, reveals and Category Blitz rounds.

### 4. What was made

- **Artifact:** https://claude.ai/artifact/YNP2Wft36uz6gtTq8WnDNE (private). **Version 2 published 2026-11-22**
  (version id `1795346751-d96a`) with Andrew's round-1 changes. Source: `docs/fire-tv-app-plan_PHASE_1_MOCKUPS.src.html`.
  Since v2 the logo is a published side file, not base64: republish with the Artifact tool, `url` = the link above,
  `file_path` = the source file, `files` = `{"logo.webp": "public/brand/web/htc-logo-512.webp"}`. (Read the artifact
  with `action: "read"` first in a new session, or the publish is refused.)
- **v2 screen ids** (JS object `SCREENS`; these supersede the v1 list below): A `connect1/2/3`; B carousel `car1`–`car5`
  (1 Next Live Trivia, 2 Pick 'Em, 3 All-Time Leaderboard, 4 Prizes, 5 Get the app); C `next1` (weekly, "Every
  Thursday"), `next2` (game day, "Tonight" + countdown), `pregame` (final 60 min); D `pick1` (NFL Sunday), `pick3`
  (Tuesday NBA/NHL mix), `pick2` (score moment); E `lead1`; F `stand` (standings with corner QR), `quest` (question,
  no QR); G `bingo1/2` (reserved); H `icon1/2`, `fire1/2`, `ban1/2`. Shared pieces: `dock()` is the fixed
  bottom-right "Get the app" QR (210 px plate; `bottom: 130px` above the ticker, `44px` without); `ticker(items)`
  is 96 px tall.
- v2 was checked once in headless Chromium (Playwright from the repo's `node_modules`, scratchpad copy): no console
  errors; Connect, Next Live Trivia, pre-game, Pick 'Em (Tuesday), All-Time Leaderboard, standings, Get the app and
  Prizes frames looked right. Two alignment fixes were made after that look and not re-checked.
- The v1 notes below describe version 1 and stay for history.
- **Screens and ids in the source** (JS object `SCREENS`): `connect1/2/3` (A), `pick1/2` (B), `bingo1/2` (C),
  `tickIdle/tickStand/tickQ/noTickQ` (D), `car1`–`car5` (E), `icon1/2`, `fire1/2`, `ban1/2` (F). Phases 6, 10 and 11
  build from these.
- **Key design facts to reproduce:**
  - **A Connect:** title "Connect this TV"; large QR on a white plate (right) with "Scan to connect"; "Or enter
    display code" with four boxes; small **Try demo** pill; focus ring = cyan border + glow. States: first open (focus
    on first box), Try demo focused, "Connected" + venue name. Expired code: "Press OK for a new code" (not on the
    page as a frame; stated in its notes).
  - **B Pick 'Em:** header "Pick 'Em Live" + venue + "NFL · Week 11"; 6 tiles (3 rows × 2) each with status, pick
    count, both teams' scores, a pick-split bar and "62% KC"; right column "Top 5 here" (gold rank 1), join QR
    "Scan to play" with `play.hightopchallenge.com`. Moment: tile glows amber with a "TOUCHDOWN +7" ribbon and "19 here
    picked KC".
  - **C Bingo:** header "Closest to Bingo" + game and clock; 3 mini cards (5×5, "1 away" amber / "2 away" grey,
    amber pulsing squares finish a line); "Also close" chips; right column "Squares that win it" (3 rows) + join QR.
    Moment: full-screen overlay with the winning card (gold line), "BINGO!", username, "+100 pts".
  - **D Ticker:** 96 px bottom strip at 1080p: "LIVE" tag, scrolling scores and Pick 'Em leader, fixed "Next Live
    Trivia 8:00 PM" at right. Shown over idle, standings, and a question (with and without).
  - **E Carousel:** 1 Next Live Trivia (big time + countdown), 2 Pick 'Em board, 3 Bingo board, 4 "Prizes up for
    grabs" (3 prize cards with progress bar), 5 today's "Get the app" QR. Dots at the bottom. Rules: live game takes
    over at once, then restart at slide 1; slides with no data are skipped; one state response feeds all slides.
  - **F Store art:** each of 512×512, 1280×720 and 320×180 in two options, using `public/brand/web/htc-logo-512.webp`
    on a solid ground. Banner option 1 adds the app name in plain type.
- All copy is minimal; all text is ≥ 28 px at 1080p (the page's own labels are normal web text).

### 5. Facts and traps found (read before Phase 3 / 9)

- **Idle today is the "Get the app" QR screen** (`TvIdleAttract.tsx`, QR to `hightopchallenge.com/app`), not a game
  card. Any carousel keeps it as one slide (the plan's D12 note in that file: "idle is an animated app-download
  screen").
- **Live scores/clock are not stored for Pick 'Em.** `listPickEmProviderGames` in `lib/pickem.ts` fetches from
  BallDontLie on demand (`fetchBallDontLieEventsForSportKey`). `app/api/cron/pickem-settle/route.ts` runs every
  minute and calls `settlePendingPickEmPicks()`, which probably fetches the same provider data (**unverified**).
  Squares (`lib/squaresTv.ts` → `liveScore`) and brackets have their own score sources, only in season. Phase 9 must
  confirm whether a stored copy is possible without new provider calls, and **tell Andrew before paying for anything**
  (global cost rule, plan D8). This is the main risk to the plan.
- **Pick split:** `pickem_picks` stores `venue_id`, `game_id`, `selected_side`, `status` per pick (migration
  `20260427113000_add_pickem_tables.sql`), so a per-game count at one venue is one bounded read. Picks can only be
  read server-side (`pickem_picks_server_only_writes`; the display API uses the service role).
- **Bingo:** `sports_bingo_cards` (status active/won/lost, `won_line`) and `sports_bingo_squares` (25 per card, status
  pending/hit/miss/void/replaced, `is_free`) are per venue. "Squares away" is computed from these. `lib/sportsBingo.ts`
  is `server-only`. The 1-minute `bingo-progress` cron already refreshes them.
- **Plan wording:** players and partners see "Prize", never "Reward". The carousel slide says "Prizes up for grabs".
  `tests/prizes-wording-contract.test.ts` will fail on "Reward" in screen copy.
- **The join QR URL is permanent** `https://play.hightopchallenge.com` (`lib/joinQr.ts`, per `SYSTEM_CONTEXT.md` §0.4;
  I did not open the file). Reuse that, never a new join URL.
- **Coin art:** see "For Andrew" point 3. Phase 6's content-rating answers must say free to play, no wagering.
- **Mockup QR codes are samples** made with `qrcode-generator` from cdnjs, not the real pairing URL.
- The Artifact tool cannot print or download. The page does have a Copy button for his answers.

### 6. How to build, run, test; what was verified

- No build or tests apply to Phase 1.
- Verified: the page loads with no console errors in headless Chromium (Playwright from the repo's `node_modules`) at
  1300 px wide; I looked at each section once and fixed what I saw (squashed QR on the Bingo screen, clipped banner
  wordmark, overlapping ribbon, see-through Bingo overlay). I did **not** re-look after those fixes, and I did not check
  the page at phone width or in light mode (it is intentionally dark-only).
- Not verified: how the mockups look on Andrew's screen; whether Amazon requires text on the banner; Amazon's current
  image sizes (Phase 6 checks).

### 7. Open questions for Andrew

- Keep / Change / Cut for A–F.
- Ticker during questions and Category Blitz: yes or no (I recommend no).
- Which carousel slides, and seconds each.
- Store art: option 1 or 2 for each size; coin-free mark or not.
- Idle carousel replaces the single "Get the app" idle screen. OK?
- Which Fire TV Stick he owns (Fire OS or Vega OS); the plan's "Before you start" steps explain how to check. Phase 4/5
  need it.

### 8. Recommended first steps

1. Wait for Andrew's reply. Record D10+ in `docs/fire-tv-app-plan.md` and below, then update the plan Status line.
2. If he cuts or changes a screen, republish the Artifact (same URL, from the source file in §4) only if he asks to see
   the change again.
3. Commit the plan, this note and the source HTML on the Phase 3 branch (`feat/fire-tv-connect`), not on
   `fix/firestick-keep-awake`.
4. Start Phase 3 in a new session: **Opus 5.5 / high**. Phases 6, 10, 11 use **Sonnet 5.5** (high/medium/high) per
   the plan. The agent doing Phase 1 here was Sonnet 5.5 / high, as planned.

### Andrew's choices (Phase 2)

#### Round 1 — 2026-11-22 (recorded as D10–D20 in the plan; mockups republished as version 2)

His reply, verbatim:

> 1. On the connect screen (and most other screens) it just says "Hightop." It should say "Hightop Challenge." Also,
> it should be more obvious to users that they have a choice between entering a display code OR scanning to connect.
> Right now it may look like people have to do both. Maybe label them "Method #1" and "Method #2" or something like
> that.
> 2. We need to add a screen to the Carousel that shows the venue's overall (all time) leaderboard.
> 3. On the Next Live Trivia screen, we need "Live Trivia" to be larger so people know what's coming.
>
> I agree with your recommendations on the ticker.
>
> Let's not go live with the Bingo Baord Slide yet, but keep it reserved for when I do want to go live with it.
>
> If it's Tuesday and Live Trivia isn't scheduled until Thursdays (for example) it should say "Live Trivia every
> Thursday at [time]!" Is that what exists already?
>
> All screens should have a QR code to download the app so users can play somewhere on it. I still want a dedicated
> "Get the app" screen, but all screens should show the QR code and "Get the app" somewhere.
>
> When a Live Trivia game is happening within 1 hour, we should only show the "Next Live Trivia" slide with a QR code
> telling people to download the app so they can play.
>
> For the Pick 'Em screen and the ticker, I want the most popular sports for that day and time of year to appear.
> Sunday during the NFL season is dominated by the NFL, Saturday's during the College Football Season is dominated by
> College Football. But other days/times, College Basketball (men and women's) might be more popular. Other
> days/times, the NBA will be more popular. Can the system be smart enough to always show the most popular/relevant
> sporting event?
>
> Also I don't wan the ticker over any of the in-game screens for Live Trivia, but we can show it for the new screen
> showing the venues overall all-time leaderboard.

His answers to four follow-up questions (all chose the recommended option):
- Final hour: **stretch the existing pre-game screen to 60 minutes** (not a second slide) → D13.
- "Get the app" QR on game screens: **between questions only** (standings, round breaks, intermissions; not
  questions or reveals) → D16.
- College basketball: **separate project, priced first** → D19.
- Bingo: **build later, when he says go** → D17, reserved phase R1.

Planner choices made in round 1 that he has **not** confirmed (flagged on the v2 page; ask in round 2 if he doesn't
mention them): "Option 1 / Option 2" wording (D10), Category Blitz precedence in the final hour (D14), ticker off
Squares/Bracket and skipping board games (D15), one QR per screen replacing "Scan to play" (D16), top-4 board and
ranking rules (D18).

#### Round 2 — 2026-11-22 (recorded as D21–D25 in the plan; mockups not republished, nothing to redraw)

His reply, verbatim:

> Let's also reserve Category Blitz content, Super Bowl Squares content, and March Madness bracket content. I want
> to have it available, but I don't want it to be there when we go live with this. Let's start off with Live Trivia
> content and NFL Pick 'Em and Pick 'Em content first. I like Option 2 for the logos. I'm not concerned about the
> simulated gambling. I'll keep the rest of what you have here, it seems good. Leave slides up for 15 seconds each
> (unless we have specified otherwise). My Fire TV Stick runs Fire OS I believe, but that doesn't mean we shouldn't
> plan for Vega OS as well.

Recorded as: D21 launch content is Live Trivia + Pick 'Em only, with Category Blitz / Squares / Bracket TV screens
reserved (phase R2; open: Display URL in Silk too, or TV app only); D22 store art Option 2 for every size, coin logo
kept; D23 15 s per slide; D24 Fire OS stick, Vega still planned; D25 the rest of v2 and the round-1 planner choices
(including D14) approved. Phase 2 is done.
