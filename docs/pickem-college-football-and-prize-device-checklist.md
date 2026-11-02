# Pick 'Em: College Football + Pick 'Em Prize — Phone Checklist (Andrew)

Plan: `pickem-college-football-and-prize-plan.md` (written by the Phase 7 review, 2026-11-01). Only a real phone can
sign this off: the automated tests can't show you the screen, the push, or a real Saturday of college games.

**Columns:**

| Column | What |
|---|---|
| A | iPhone app |
| B | Android app |
| C | Phone browser (Safari or Chrome) — the website |
| D | Partner Dashboard / Admin on the website (any device) |

Tick a column when it passes; write a note when it doesn't. A dash means "doesn't apply".

**Before you start:**

- **When:** after Phases 1–6 **and** fixes 7.1–7.5 are deployed, with 7.1's database change applied. Until then
  production still runs the old Pick 'Em (Collect button, 10-pick limit) and none of this is there.
  (A Vercel Preview shows the screens, but the every-minute grading/prize job only runs on Production, so prizes
  never pay there unless Claude triggers the job by hand. Production is simpler.)
- **Which day:** a college Saturday — Nov 7, 14, 21 or 28, conference championships Dec 5, then bowl games from
  mid-December. The prize sections (5–7) need games that finish that day; start in the morning.
- **The test bar:** use **Hightop Test Bar** (`venue-hightop-test`). **It is NOT hidden** (checked 2026-11-01) and 48
  player profiles belong to it. A prize created from the **Partner Dashboard** sends a "News from your bars" push to
  those players; one created from **Admin → Prizes** doesn't. Create the test prizes from Admin unless you want the push.
- **Join it from anywhere** with your God Mode account.
- **Clean up afterwards:** archive every test prize (section 9).

---

## 1. Pick 'Em basics (no limit, no bonus, no Collect)

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 1.1 | Venue home → Pick 'Em card rules and the tutorial don't mention "10 picks", "double" or "triple". | | | | — |
| 1.2 | Make **more than 10 picks** in one day (any sports). No limit message appears. | | | | — |
| 1.3 | No "Collect points" button, no Pick Tracker bar. Under the title, one grey line: "Every correct pick is worth 10 points, added automatically." before any picks, then "Today: N right · +X points". | | | | — |
| 1.4 | Leave the screen open while one of your games ends: within about a minute a small **"+10 points"** badge appears, and your points in the header go up — without tapping anything. | | | | — |
| 1.5 | Close and reopen: the points are still there (they were added once, not twice). | | | | — |

## 2. College Football — against the spread (the default)

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 2.1 | Pick 'Em sport list shows **College Football** (FBS, 🏈). Under the list: "Looking for the NFL? NFL Pick 'Em is its own game." with a link **Open NFL Pick 'Em**. | | | | — |
| 2.2 | Open College Football: the same NFL line at the top, then "Picks use the spread: your team must win by more than its line, or lose by less. Lines lock at kickoff." | | | | — |
| 2.3 | Each team shows its line under its name (e.g. **−13.5** / **+13.5**; **PK** when even). Only FBS games are listed (no FCS-vs-FCS games). | | | | — |
| 2.4 | A game with no line yet shows **"Line coming soon"**; tapping a team says "This game's line isn't out yet. Check back soon." and doesn't pick. | | | | — |
| 2.5 | Pick a team, then switch to the other team before kickoff: allowed. After kickoff: locked. | | | | — |
| 2.6 | After a game ends: your pick is graded by the line (a favourite that wins by less than its line is a loss for its pickers). A game that lands exactly on the line says **"Push (landed on the line)"** and pays nothing. | | | | — |
| 2.7 | A correct pick adds 10 points automatically (as in 1.4). | | | | — |

## 3. College Football — pick the winner

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 3.1 | Partner Dashboard → Game Settings: a **College Football Pick 'Em** card (Spread / Pick the winner) next to the NFL one. Choose **Pick the winner**, Save. Reload: still saved. Admin → Game Settings shows the same. | — | — | — | |
| 3.2 | Player's college list: no lines, no spread sentence. New picks are graded straight up. | | | | — |
| 3.3 | A pick you made **before** the switch still shows its line and is graded by it. | | | | — |
| 3.4 | Switch back to **Spread** when done. | — | — | — | |

## 4. NFL signpost

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 4.1 | Tap **Open NFL Pick 'Em** (sport list and the college list): NFL Pick 'Em opens, inside the app on A/B. | | | | — |
| 4.2 | NFL Pick 'Em itself looks and grades as before; its correct picks now also add 10 points automatically. | | | | — |

## 5. A tiered prize, end to end ("X out of N")

Small numbers so it finishes in one Saturday. **Admin → Prizes → Create**, venue **Hightop Test Bar**, **Pick 'Em**.

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 5.1 | Games: turn on **College Football**. When: **one day**, today. How to win: **X out of N**, N = **3**; tiers **1 right**, **2 right**, **3 right**, each with its own small prize (quantity 1–2). The confirm step says "Players at your bar will be limited to 3 college football picks on Sat, Nov 14, so everyone plays the same 3." Create. | — | — | — | |
| 5.2 | Player, college list: a slim line **"Prize today: 1, 2 or 3 of 3 right · 3 picks left"**. Picks you made earlier today count (the number goes down for them). | | | | — |
| 5.3 | Make picks until **0 picks left**: the line adds "This bar's prize counts your first 3 college football picks today, and you've already used all 3." Games you haven't picked are greyed out; tapping one shows that sentence. | | | | — |
| 5.4 | You can still switch sides on a picked game (before kickoff), and clearing a pick gives one pick back. | | | | — |
| 5.5 | Prizes tab card for this prize describes it in words: "Get 1, 2 or 3 of your 3 college football picks right on Sat, Nov 14. 1 right wins …, 2 right wins … and 3 right wins …." | | | | — |
| 5.6 | After your 3 games end (allow a minute or two): one coupon in the prize wallet for the **highest tier you reached only**, saying e.g. "You got 2 of 3 college football picks right on Sat, Nov 14". A push says you won. | | | | — |
| 5.7 | Venue home Prizes card (needs fix 7.2): no "0 / 3 pts" gauge; after the win it says **You Won**; after the day it no longer says "In Progress". | | | | — |
| 5.8 | Partner Dashboard → Results: the prize win appears on that day. | — | — | — | |

## 6. Overlap refusal

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 6.1 | With section 5's prize still active, create **another "X out of N"** for College Football on the same day. Refused at the end, in red, naming the first prize: "Your college football prize on Sat, Nov 14 already limits picks for some of these games on the same day. Only one prize with a pick limit can cover a game." | — | — | — | |
| 6.2 | Create **"Most picks right"** for College Football the same day with **minimum picks 5** (more than N = 3): refused — "…gives players 3 picks, so this prize can't require 5." | — | — | — | |
| 6.3 | Create **"Get N right"** for College Football the same day: allowed (a target can overlap a limit). Archive it straight away. | — | — | — | |
| 6.4 | (Migration `20261102021619` is applied, confirmed 2026-11-01.) Open the prize wizard in **two tabs** on the same bar, fill both as an "X out of N" for the same games and day, and tap Create in both as close together as you can. One is created; the other is refused — either "Another Pick 'Em Prize is being saved for this bar. Try again in a moment." or the 6.1 overlap message. Never two prizes. Archive the one that was created. | — | — | — | |

## 7. "Most picks right" + the tiebreaker

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 7.1 | Archive section 5's prize first if you want a clean list. Create **Most picks right**, College Football, one day = today, minimum picks 1. (Minimum players: "No minimum" for the test.) | — | — | — | |
| 7.2 | Player, today's college list: a line "Prize today: most picks right" and a **Tiebreaker** card: "How many total points will be scored in X at Y?" — the last game to start today. | | | | — |
| 7.3 | Type a number (0–400) and Save: "Saved!", then "Your guess of N is saved". Reload: still there. 401 or a blank is refused. | | | | — |
| 7.4 | After that game kicks off: the card shows "Your guess: N" and can't be changed. | | | | — |
| 7.5 | After the day's games end: the player with the most right gets the coupon (with a tie, the closest guess). | | | | — |

## 8. Small screens

Check on an **iPhone SE** (289 px of card) or with Settings → Display → Display Zoom → **Larger Text**, and on a normal phone.

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 8.1 | Prize wizard (Partner Dashboard on a phone) → **When**: the 7 weekday chips fit on one row, readable. | — | — | — | |
| 8.2 | Prize wizard → **How to win** → X out of N with 3 tiers: each tier row (right / how many / remove) fits; nothing cut off. | — | — | — | |
| 8.3 | Player college list: the prize line, "picks left", the limit sentence, the greyed-out games and the line under each team all fit and are readable. | | | | — |
| 8.4 | Tiebreaker card fits; the number box and Save button sit on one line. | | | | — |
| 8.5 | Only if the light theme is on: the prize line and tiebreaker card in **Light** and **Dark**. | | | | — |

## 9. Clean up

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 9.1 | Archive every test prize at Hightop Test Bar. | — | — | — | |
| 9.2 | College Football Pick 'Em setting back on **Spread** at the test bar (or wherever you changed it). | — | — | — | |

**Admin → Rewards and Pick 'Em Prizes (Phase 7.6.1, built 2026-11-01):** a Pick 'Em Prize row has no **Edit** button, and
**Enable** is greyed out once it is off (hover it for why). Disable and Delete still work. Bulk Enable on a selection that includes
one turns the others on and says how many weren't changed. To change a Pick 'Em Prize, archive it and create a new one. Until this
code is deployed, the old warning stands: don't press Enable or Edit on one (plan §11, F21).
