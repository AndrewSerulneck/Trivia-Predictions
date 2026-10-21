# Super Bowl Squares + March Madness — phone and TV checklist (for Andrew)

Only a real phone and a real TV can judge this: a headless browser has no address bar, no Back gesture,
no haptics and no TV-sized screen. Tick each box and write what you saw next to anything that looks wrong.
Plan: `docs/squares-and-brackets-plan.md`.

**Section A (Squares)** is done during the Phase 6.7 rehearsal, on the Preview deployment the rehearsal uses,
at the hidden test venue `venue-hightop-test`. You need **two** player accounts (two phones, or one phone plus
a private browser window) and one partner account that owns the test venue. **Section B (Brackets)** is done during
the Phase 10.6 replay rehearsal, set up the same way.

---

## A. Super Bowl Squares

### A1. Devices
- [ ] iPhone, Safari (in the browser)
- [ ] iPhone, the Hightop Challenge app
- [ ] Android, Chrome
- [ ] Android, the Hightop Challenge app
- [ ] An iPhone SE-size screen (or Safari narrowed to the smallest width): the grid still fits with no
  sideways scrolling.
- [ ] A TV (or a desktop browser at full screen, 1920 × 1080) for A7.

### A2. Finding the game
- [ ] The venue-home card only shows Feb 1–15, so in the rehearsal open `/squares` directly (the rehearsal
  handoff gives the Preview link). Check the card itself on Feb 1, on the live site.
- [ ] The tutorial cards read well at phone size: text on top, picture below, nothing cut off.
- [ ] Every word on screen is at least as big as the small grey text elsewhere in the app (12px floor).

### A3. Claiming squares (before the lock)
- [ ] The grid is 10 × 10. Open squares, taken squares and your own squares are clearly different colours.
- [ ] Tap an open square: a small sheet opens with **Claim**. Tap Claim: the phone buzzes once and the
  square turns "mine". The line under the grid says **1 of 2 used**.
- [ ] Claim a second: **2 of 2 used**. Try a third: you're told you've used both.
- [ ] Tap one of your squares: the sheet offers **Release**. Release it: back to 1 of 2.
- [ ] On the second phone, tap the first player's square: the sheet shows **their username** and no
  Claim button.
- [ ] Both phones try to claim the same open square at the same moment: only one gets it; the other is
  told it's taken.
- [ ] Android: with the sheet open, the phone's **Back** closes the sheet (doesn't leave the game).
- [ ] Put the phone to sleep for a minute, wake it: the board shows the other player's newest claim
  within about 30 seconds.

### A4. The lock and the draw
- [ ] At the lock time, Claim stops working (the sheet says claims are closed).
- [ ] Within a minute or two, the numbers appear on both edges of the grid. Column numbers sit under the
  AFC team's name, row numbers beside the NFC team's.
- [ ] The numbers along each edge are 0–9 in a jumbled order, each digit once.

### A5. During the game
- [ ] The live score shows and updates within about 30 seconds of the real score (compare with a sports
  app).
- [ ] The **leading square** (the one that would win right now) is highlighted, and tapping it shows who
  holds it.
- [ ] At the end of Q1, within about two minutes: the Q1 winner shows, and the winner's phone shows the
  points. Repeat at halftime, Q3 and the final.
- [ ] If nobody held the winning square, the screen says nobody won that quarter. Nothing rolls over.
- [ ] Hide the app for 10 minutes mid-game, come back: it catches up straight away.

### A6. Prizes and Results
- [ ] Before the rehearsal, the partner account creates a **Super Bowl Squares** prize at the test venue,
  paying (say) Q1 and the final. The wizard never shows the "Minimum players" step.
- [ ] After Q1, the Q1 winner sees a gift card on **Redeem Prizes**. The coupon names the quarter.
- [ ] Redeem it with **Confirm Redemption**: it's used once and can't be redeemed again.
- [ ] Partner Dashboard → **Results**: the Squares game appears on the right day with each quarter's
  winner and the prize next to the quarter it paid.
- [ ] (If an admin void is rehearsed) after a void + re-grade, the old winner's **unused** coupon disappears
  and they get a notice; the corrected winner gets one. A coupon already redeemed is kept.

### A7. The TV
- [ ] Open the venue's TV screen (`/venue/venue-hightop-test/screen`) before the draw: it looks like it
  always does (the idle screen).
- [ ] After the draw: the TV switches to the Squares board: grid with usernames, numbers on the edges,
  live score, leading square, and each quarter's winner as it happens.
- [ ] From across the room: the usernames, the score and the numbers are readable. Long usernames are cut
  short neatly, not overlapping.
- [ ] Nothing is cut off at the bottom or right of the screen at 1920 × 1080.
- [ ] Start a Live Trivia game at the venue during the rehearsal: the TV switches to trivia, then back to
  Squares when it ends.
- [ ] Leave the TV on for an hour: the picture drifts slightly (burn-in protection) but never jumps.

### A8. After the game
- [ ] The game shows as finished on both phones (final score, four quarters, winners).
- [ ] The next day, the player screen still shows the finished board, not an empty one. (The TV goes back
  to its idle screen 7 hours after kickoff, on purpose.)
- [ ] Venue points: each winner's venue total went up by 25 (Q1, half, Q3) or 50 (final), once.

---

## B. March Madness Brackets

Finished in Phase 10 (2026-10-20). Done during the 10.6 replay of the March 2026 tournaments on `venue-hightop-test`
(admin → Brackets → Create a rehearsal; `NEXT_PUBLIC_BRACKETS_ENABLED` on a Preview, `BRACKETS_REHEARSAL_ENABLED` on
Production, where the cron runs). The replay clock lets the admin skip from one round to the next, so the whole
tournament takes an evening, not three weeks. Same accounts as section A.

### B1. Fill out
- [ ] The Venue Home card opens `/bracket`; the three tutorial cards show their art (bracket, lock rows, doubling bars) and
  nothing is cut off on the smallest phone.
- [ ] The summary says "Fill out your bracket" with the lock time in your own time zone.
- [ ] Each region (15 games) fits a thumb: two big buttons per game, the picked team turns amber with a check.
- [ ] Choosing a team for a later round only offers the two teams you picked before it. Changing an early pick clears the
  later ones that depended on it; the count ("41 of 63") goes down.
- [ ] Next / Back stay at the bottom while scrolling; Android Back inside the app steps back, then leaves.
- [ ] Leave half-way, reopen: the picks are still there (a draft saves on each step and when you leave).
- [ ] Finish: tiebreaker accepts 0–400 only; Save bracket returns to "Your bracket is in".
- [ ] A venue where you already filled one out offers "Copy my picks from <venue>", and asks before replacing picks.
- [ ] Rotating the phone / the keyboard opening on the tiebreaker doesn't hide the Save button.

### B2. After the lock
- [ ] "My bracket" shows your score, best possible, right / wrong / still alive, and each pick with Right / Wrong /
  Still alive in words.
- [ ] "Standings" lists the venue, your row is highlighted, "Find a player" filters, Refresh works.
- [ ] Men's / Women's and Bracket / Second chance switch without losing your place.
- [ ] Before the lock, Second chance isn't offered yet. After the Round of 32 it appears; fill it out (12 games, then the
  Final Four) and it locks at the first Sweet 16 tip.

### B3. Corrections (admin, during the replay)
- [ ] After a round is complete, the admin overrides one of its results: both players' scores change, and their venue
  points for that round come back within a few minutes (after 10.1, also after the final).
- [ ] "No result" on a game keeps it undecided; the next sync doesn't put the feed's result back (after 10.1).
- [ ] Moving the main lock to a minute after the first Round-of-64 tip is refused with a plain message; a time before it
  is saved (after 10.2).
- [ ] On the championship row, enter both final scores with the winner and Override: the tournament shows "championship
  total" and, a minute later, the prizes settle (after 10.2).

### B4. Prizes and Results
- [ ] Before the replay, the partner account creates a **March Madness bracket** prize at the test venue for the men's
  bracket and the men's second chance, 1st/2nd/3rd. The wizard asks for a minimum number of players; nothing is
  pre-selected.
- [ ] The bracket screen never mentions a prize.
- [ ] After the championship, the winners see gift cards on **Redeem Prizes**; each coupon names the bracket and the place.
- [ ] Partner Dashboard → **Results**: each bracket appears in the week it was settled, with its prize row. Tap it: full
  standings with "Find a player". Tap a player: each pick, right or wrong, with its points.

### B5. The TV
- [ ] Before any bracket at the venue locks, the TV shows its usual idle screen.
- [ ] After the lock: the venue's top 10 (usernames, scores), today's games with live scores, and an upset that busted
  brackets here, when there is one. Readable from across the room; nothing cut off at 1920 × 1080.
- [ ] Start a Live Trivia game during the replay: the TV switches to trivia, then back to the brackets.
