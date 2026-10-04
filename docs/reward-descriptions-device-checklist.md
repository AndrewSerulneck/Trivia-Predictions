# Reward Descriptions — phone checklist (Andrew)

**Plan:** `docs/reward-descriptions-plan.md` (Plan A) · **Written:** 2026-10-03 (Phase 4) ·
**Updated:** 2026-10-04 for the review fixes (`docs/reward-descriptions-review-fixes-plan.md`)
**Who closes it:** Andrew, on a real phone. Tick each box, or write what you saw next to it.

## Before you start

1. **The new code must be live** where you test: either deployed, or `npm run dev` on your Mac and the
   phone pointed at it. **Deployed to production 2026-10-04** — test on the live site.
2. Use a **test venue** you can sign in to as a partner (Partner Dashboard) and join as a player.
   Give it a Live Trivia schedule with:
   - a **weekly Tuesday 8:00 PM** game,
   - a **weekly Thursday 9:00 PM** game,
   - a **one-off** game on a future Tuesday at 8:00 PM.
   (The example wording below assumes these times and a **$50 gift card** prize. Your words will
   use your own prize and dates.)
3. Times must always be the **venue's** time, never the phone's. If you can, do one pass with the
   phone set to a different time zone (Settings → General → Date & Time → turn off "Set
   Automatically", pick another city). The times on screen must **not** change.
4. Where to look, for every reward below:
   - **Card** = the reward card on the venue home page → shows only the **first sentence**.
   - **Pop-up** = tap the card → first sentence, then the **when** line, then the **fine print**.
   - **Redeem** = the Redeem screen → same three lines under the reward.
5. Delete each test reward when you are done (Partner Dashboard → reward → End reward).

## A. One line per reward type (plan §3)

Create each one in **Partner Dashboard → Rewards → Create reward**. On the last (Confirm) step,
check the **"What guests will see"** box says the same words you then see on the card and pop-up.

| ✓ | Reward to create | Card + pop-up first sentence | Pop-up "when" line | Pop-up fine print |
|---|---|---|---|---|
| ☐ | NFL Pick 'Em · most picks right · weekly | Get the most NFL picks right this week and win a $50 gift card. | A new contest starts every Thursday of the NFL season. Make your picks before each game kicks off. | Ties are broken by this week's tiebreaker question. At least 3 players need to make picks for a winner to be named. |
| ☐ | NFL Pick 'Em · most picks right · rest of season (from Week N) | Get the most NFL picks right from Week N through the end of the regular season and win a $50 gift card. | One contest, all season long. Make your picks every week before kickoff. | Ties are broken by the final week's tiebreaker question. At least 3 players need to make picks for a winner to be named. |
| ☐ | NFL Pick 'Em · get N picks right · weekly (e.g. 10, 3 prizes) | Get 10 NFL picks right this week and win a $50 gift card. | Resets every Thursday during the NFL season. | The first 3 players to get there each week win. |
| ☐ | NFL Pick 'Em · get N picks right · season (e.g. 60, 3 prizes) | Get 60 NFL picks right by the end of the regular season and win a $50 gift card. | Counts from Week N on. | The first 3 players to get there win. |
| ☐ | Live Trivia · win the game · pick the **Tuesday** game | Win Live Trivia on Tuesday night and win a $50 gift card. | Live Trivia starts at 8:00 PM every Tuesday. Be here and signed in when it starts. | One winner per game. |
| ☐ | Live Trivia · win the game · pick **Tuesday and Thursday** | Win Live Trivia on Tuesday and Thursday nights and win a $50 gift card. | Live Trivia starts at 8:00 PM every Tuesday and 9:00 PM every Thursday. Be here and signed in when it starts. | One winner per game. Win any of these games: Tuesday 8:00 PM or Thursday 9:00 PM. |
| ☐ | Live Trivia · win the game · pick the **one-off** game | Win Live Trivia on Tue, Oct 13 and win a $50 gift card. *(your date)* | It starts at 8:00 PM. One game only. | One winner. |
| ☐ | Live Trivia · win the game · *older reward with no game picked* (only exists if the game picker is off; skip if you can't make one) | Win any Live Trivia game this week and win a $50 gift card. | Live Trivia runs Tuesdays at 8:00 PM and Thursdays at 9:00 PM. | One winner per game. |
| ☐ | Live Trivia · earn points · weekly (e.g. 500 pts, 3 prizes) | Earn 500 points in Live Trivia this week and win a $50 gift card. | Live Trivia runs Tuesdays at 8:00 PM and Thursdays at 9:00 PM. Your points reset every Tuesday. | The first 3 players to hit 500 each week win. |
| ☐ | Live Trivia · earn points · daily / monthly (if offered) | …this **day** → "today" / …this **month** | …Your points reset every day / on the 1st of every month. | …each day / each month win. |
| ☐ | Live Trivia · earn points · one-off game | Earn 500 points at Live Trivia on Tue, Oct 13 and win a $50 gift card. | It starts at 8:00 PM. | The first 3 players to hit 500 win. |
| ☐ | An **older hand-written reward** (General Saloon has three) | Its own hand-written words, unchanged | *(nothing)* | *(nothing)* |

## B. Special situations

| ✓ | What to do | What you should see |
|---|---|---|
| ☐ | **Game moved or deleted:** after creating the "Tuesday game" reward, delete (or move) that Tuesday schedule | Pop-up "when" line becomes **"Check the Live Trivia schedule for the next game."** — never the old time. |
| ☐ | **Prize already won this week** (a recurring reward whose winner is already picked) | The "Congrats to …" line as before, and the pop-up "when" line says **"Next contest starts Tue, Oct 6."** (the next game's date). |
| ☐ | **NFL reward that hasn't started yet** (only possible before a season / before its first week) | Pop-up "when" line: **"Starts Thu, Sep 4. Get your picks in early."** — shown **once**, not twice. |
| ☐ | **Ended reward:** a recurring reward whose winner is already picked, then End it (or let its end date pass) | The pop-up **never** says "Next contest starts …". The normal "when" line shows instead. |
| ☐ | **Game changed from weekly to one-off:** after creating the "Tuesday game" reward, edit that Tuesday schedule to a one-off game | Pop-up "when" line becomes **"Check the Live Trivia schedule for the next game."** — never "8:00 PM every Tuesday". |
| ☐ | **NFL weekly reward created mid-season:** on the Confirm step | "What guests will see" says **"A new contest starts every Thursday of the NFL season."** — not "Starts Thu, Oct 9". |
| ☐ | **Venue whose only Live Trivia game is a one-off:** create a "win the game" reward | The Confirm step shows the **"What guests will see"** box (it used to be missing). |
| ☐ | **Partner changes a game time** for a reward that is already live | Guests' cards may show the old time for **up to 5 minutes** (expected — saves database reads). The Partner Dashboard and admin page show the new time straight away. |
| ☐ | **Plural custom prize**: create a reward whose prize is a custom menu item named "Chicken Wings" at 20% off | First sentence ends **"…and win 20% off Chicken Wings."** (not "a Chicken Wings"). |

## C. Every other screen

| ✓ | Screen | What you should see |
|---|---|---|
| ☐ | Reward card / pop-up / Redeem screen for a **new-style** "win the game" reward | The words **"Awarded to the winner."** do **not** appear. |
| ☐ | Same screens for an **older hand-written** "win the game" reward | **"Awarded to the winner."** **does** appear (it says how the prize is won). |
| ☐ | **Admin → Rewards → edit** a new-style reward | Instead of an editable Rules box: the guest wording, read-only, and the note **"Guests see this automatic description. Change the schedule, prize or target to change it."** An older hand-written reward still has the editable box. |
| ☐ | Any reward wording anywhere | Never says **"this venue"** or **"at this venue"**. |
| ☐ | **NFL Pick 'Em page** banner (the 🏆 box at the top of /nfl-pickem) | The same first sentence as the venue card (e.g. "Get the most NFL picks right this week and win a $50 gift card."). |
| ☐ | **Prize wallet** (Redeem Prizes) coupon from a new-style reward | Says what you won it for, e.g. **"You got the most NFL picks right in Week 5"** or **"You won Live Trivia on Tue, Oct 7"** — not "Won from: …". *(Needs a real win; skip if none yet.)* |
| ☐ | Prize wallet coupon from an older hand-written reward | Still **"Won from: {reward name}"**. |
| ☐ | Prize wallet coupon whose reward was **edited after the win** (e.g. points target or NFL scope changed) | Goes back to **"Won from: {reward name}"** instead of a possibly wrong sentence. |
| ☐ | Prize wallet coupon from a **late Live Trivia game** (e.g. 11:30 PM in a Central-time venue) | The win date is the **game's** day (e.g. "Tue, Oct 6"), not the next day. |
| ☐ | **Partner Dashboard** Rewards rows | Under each reward's name: the guest first sentence, then the terms line (e.g. "… — 1 per week"). |
| ☐ | **Create reward → Confirm step** (partner) | A **"What guests will see"** box with the first sentence, when line and fine print, matching the card after publishing. |
| ☐ | Long words on a small phone (iPhone SE size, if you have one) | No text runs off the card or pop-up. |

## Result

- Date checked: ________ · Phone / iOS: ________ · Deployed build or local: ________
- Anything wrong (screen, reward, what it said): ________
