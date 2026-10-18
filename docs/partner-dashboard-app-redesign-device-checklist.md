# Partner Dashboard redesign — phone checklist (for Andrew)

Only a real phone can judge this: a headless browser has no address bar, no keyboard and no
Back gesture. Do this **after the change is deployed** (nothing has been pushed yet). Tick each
box; write what you saw next to anything that looks wrong. Plan: `docs/partner-dashboard-app-redesign-plan.md`.

Use a partner account with a venue. For the "populated" checks, have at least one scheduled
game and one reward; for the "empty" checks use a venue with neither (or a fresh self-serve venue).

## A. Devices to cover
- [ ] iPhone, Safari (in the browser, not installed to the Home Screen)
- [ ] Android, Chrome
- [ ] (If you have one) an iPad or a desktop window at phone width

## B. Menu and top bar
- [ ] The small logo is top-left and looks tappable (☰ badge on its corner).
- [ ] **First visit only:** the badge pulses about three times. Open the page again: no pulse.
  (To re-test, clear this site's data, or open a private tab.)
- [ ] Tap the logo: the menu slides in from the left. Rows in order: Venue Display, Billing,
  Partner Manual, Game Settings, Account Settings, then **Sign Out last**, below a line.
- [ ] Tap outside the menu, and the Back gesture: menu closes. The page behind doesn't scroll
  while the menu is open.
- [ ] Partner Manual row: menu closes, the manual slides up. Its text says "tap the logo in the
  top-left… then Venue Display" and "Tap Offer Prizes on your dashboard".
- [ ] Billing, Display, Game Settings, Account Settings each open a page with **Back** top-left
  (no logo menu, no Sign Out), and Back returns to the dashboard.
- [ ] With 2+ venues: tapping the venue name switches venues and both lists reload.

## C. Schedule a live game
- [ ] Empty venue: "Schedule a live game" is a big dashed card; the dashed outline is easy to see.
- [ ] Tap it: the sheet slides up with the dashboard peeking at the top. Steps slide sideways.
- [ ] **Keyboard:** tap the date/time field, the rounds and the name field. The keyboard must not
  cover the field you are typing in or the Next button.
- [ ] Back gesture on step 2 goes back one step; on step 1 it closes the sheet (and does not
  leave the dashboard).
- [ ] Enter a date, then tap **Close**: it asks **"Discard this game?"**. Keep editing keeps your
  answers; Discard closes. Close with nothing entered closes at once.
- [ ] Finish a game: the sheet slides down, a toast says "Live Trivia scheduled: …", and the new
  row glows with a blue ring for about 2 seconds (scrolled into view if needed). The toast
  disappears by itself after a few seconds.
- [ ] Tap a game: Edit and Cancel game both work. After a cancel of a game that had a reward,
  the amber notice stays until you dismiss it.

## D. Offer a reward
- [ ] "Offer a reward" card opens on **Which reward?**; questions slide one at a time.
- [ ] **Keyboard:** type in "Custom target", "Item name" and "Gift card amount". The field stays
  visible above the keyboard.
- [ ] Past the first question, **Close** asks "Discard this reward?".
- [ ] Create a reward all the way through: toast "… reward created", new row rings.
- [ ] Tap a reward: terms + top players + **End reward**. Try both Archive and Delete anyway
  (use a throwaway reward). The toast wording matches what happened.
- [ ] Pick a reward whose game isn't scheduled: **Schedule Live Trivia** swaps to the Schedule
  sheet (two sheets animating at once should still look fine). After saving the game, the toast
  offers **"Now offer a reward for it →"**; tapping it reopens the reward questions.
- [ ] `/owner/competitions` and `/owner/schedule` (type the address) open the dashboard with the
  matching sheet already up.

## E. Back gesture asks too (your 2026-09-30 decision)
- [ ] Schedule: enter a date on the first step, then use the phone's **Back** gesture. The sheet
  stays up and asks **"Discard this game?"**. Keep editing keeps the date; Discard closes the sheet
  and you are on the dashboard (one Back, not two).
- [ ] With nothing entered, Back just closes. On a later step, Back goes back one question
  without asking (your answers are still there).
- [ ] Reward: pick a reward whose game isn't scheduled → **Schedule Live Trivia** → enter a date →
  Back. It asks "Discard this game?"; Discard lands on the reward sheet, not the dashboard.
- [ ] Watch for a flicker: when Back asks, the sheet should not visibly slide down and back up.
  Note it if it does (it is cosmetic).
- [ ] After scheduling a game, the browser's **Forward** button (desktop) must not reopen a
  "Scheduling…" screen.
- [ ] Menu → Billing (or any row): the menu slides away, then Billing opens **at the top of the page**.

## F. Display settings
- [ ] **Landscape:** rotate the phone with a sheet open. Close, Next and the fields are all reachable.
- [ ] **Reduced motion:** iPhone Settings → Accessibility → Motion → Reduce Motion (Android:
  Remove animations). Sheets, steps and the drawer change instantly, and the ☰ pulse does not show.
- [ ] **Large text:** Settings → Display → Text Size at the largest. Rows and buttons still fit;
  nothing is cut off.
- [ ] Screen reader (VoiceOver / TalkBack), quickly: the logo reads "Open menu"; a sheet reads its
  title; the toast is announced; Close / Keep editing / Discard read clearly.

## G. Sign Out
- [ ] Menu → Sign Out signs you out and lands on the partner login.

## H. The Hightop loader (new, 2026-10-01 — it replaced the orange basketball everywhere)
The logo drops in spinning, lands, then hops: one full turn clockwise, a beat on the ground,
one full turn back. You should never see a grey placeholder box or a bouncing basketball again.
- [ ] **Cold open.** Force-quit the browser, then open the Partner Dashboard. You see the logo
  animation, then **Live Games and Offer Prizes appear together, in one step** — not the logo,
  then two grey boxes, then the real thing.
- [ ] **Sign in.** From the partner login, tap Sign In. The animation covers the form the instant
  you tap, and stays until the dashboard is ready.
- [ ] **Menu → Billing → Back → menu → Game Settings.** Each screen shows the animation while it
  loads. Watch for **two** logos at once, or one that jumps position — note either.
- [ ] **A fast screen should show nothing.** On good WiFi, some screens open too quickly for the
  animation. That is correct; it only appears when a load takes longer than a blink.
- [ ] **Slow connection.** Turn WiFi off (cellular only) or use a weak signal and reopen the
  dashboard. The animation should keep hopping smoothly — not stutter, freeze, or get cut off at
  the top of the screen.
- [ ] **It must never get stuck.** If a loader is still hopping after ~10 seconds on any screen,
  write down which screen and what you did.
- [ ] **Reduced motion** (Settings → Accessibility → Motion → Reduce Motion): the logo does not
  hop or spin at all — it just fades gently in and out. No shadow underneath.
- [ ] **Player side too.** Open a venue and a game or two (Pick 'Em, Bingo, Prize wallet, NFL
  Pick 'Em). Wherever the orange basketball used to be, you should now see the logo with the same
  wording underneath it as before.
- [ ] Screen reader: a loading screen should announce "Loading…" (or the screen's own wording)
  once — not read out an image.

## I. Two fixes from the Phase 7 review (2026-10-01)
Both are narrow, and both only matter on a real phone.
- [ ] **Switch venue away and back** (only if your account has two or more venues). On the
  dashboard, schedule a game at venue A. Switch to venue B. Switch back to A. **The game you just
  scheduled must still be listed.** Before this fix, coming back to A showed the list as it was
  when you first opened the dashboard, so a game added since then disappeared until you reloaded.
- [ ] **Sign-in that goes nowhere** (optional, fiddly to stage): sign in, and the moment you tap
  Sign In turn the phone's network off. After about 12 seconds the animation should go away and
  give you the form back with "You're signed in, but the dashboard didn't open. Please try again."
  It must not leave you stuck on a hopping logo with a dead button.

## J. Results page (new, 2026-10-16 — one timeline, replaces "Game Results")
Open the menu → **Results**. Use a venue that has run Live Trivia (Garden State Bar).
- [ ] **One title.** The sheet says "Results" once, with the venue name as a quiet line under it. No tabs.
- [ ] **The timeline.** Newest game first, grouped Month → Week → Day. Each game shows "Live Trivia · <game name>",
  the player count, and the winner with points. Only the newest month and week start open.
- [ ] **Rewards.** A reward won at a game shows as a 🎁 line on that game's card. A weekly reward ("Top players this
  week") is a row at the bottom of its week. A reward with no game that day is its own row, never missing.
- [ ] **Show more** adds older results under the ones you already have.
- [ ] **Tap a game.** Full standings, everyone who scored (not just 10). "Find a player" filters as you type,
  upper or lower case. The search box is easy to tap and the keyboard doesn't hide the list.
- [ ] **Tap a player.** One row per question they answered: ✓ or ✗, the points, the question on one line. The
  Total at the bottom equals their score in the standings. You never see what they typed. A "Deleted player"
  row does nothing when tapped.
- [ ] **Back.** The phone's Back gesture goes player → game → list → closes. Coming back from a player keeps
  your search text. Open a reward from a game's screen and Back returns to that game.
- [ ] **Reload on a detail screen** (pull to refresh while on a player): it lands on the timeline, not a blank page.
- [ ] Text is readable at arm's length; nothing is cut off at the edges on the smallest phone you own.

## K. "How many players must play?" step (new, 2026-10-17 — Create Prize)
Menu → **Offer Prizes** → create one prize of each kind below. Do it on a 350 px phone and again on the smallest
phone you own (289 px, an iPhone SE).
- [ ] **Live Trivia, Winner of the game.** After the rules, the next button says **Next: Minimum Players** and opens
  its own screen titled "How many players must play?". Neither **No minimum** nor **Set a minimum** is selected and
  the next button is greyed out until you tap one.
- [ ] **Set a minimum** shows a number box already holding **3**. Clear it or type 1: a red line explains and the
  next button stays greyed. Type 5: it turns on.
- [ ] **Live Trivia, Top players this week.** Same screen, with the "that week" sentence under the buttons.
- [ ] **NFL Pick 'Em, Most picks right** (weekly, then whole season). Same screen; the sentence says "make picks that
  week" / "that season", and mentions that with no minimum even one player can win.
- [ ] **A points target** (Live Trivia or NFL): there is no such screen. The rules go straight to **Prize**.
- [ ] **Confirm** shows a "Minimum players" line (At least N / None) for all three contest kinds, and none for a
  points target.
- [ ] **Phone Back.** From Prize it returns to the players screen with your answer still there; from the players
  screen it returns to the rules. Nothing gets stuck or skipped.
- [ ] Close the sheet while on the players screen: it asks "Discard this reward?".
- [ ] Text readable and buttons easy to tap at both widths; nothing cut off.

## L. Player game tutorials and account menu (new, 2026-10-17)
Do this on an iPhone SE (or the smallest phone you own) and on a normal iPhone, signed in as a player.
- [ ] Open each game's tutorial card (Category Blitz, Bingo, Pick 'Em, Predictions, Fantasy, Live and Speed Trivia):
  statement on top, picture below, nothing clipped, no "…" in game names, text readable.
- [ ] Venue home: open **Menu**. Scroll down to **Sign Out**. The page behind does not scroll.
- [ ] Tapping the dark area or **Close** closes the menu.
- [ ] Inside a game (e.g. Bingo): open the menu, same checks. **Change Username** pop-up shows and takes typing.
- [ ] In the real app on Android: Back closes the menu first; on the venue home with no menu open, Back minimises.

## M. "Rewards" is now "Prizes" (new, 2026-10-18)
Nothing on any screen should say "Reward" any more. Do this on a normal phone, then glance at the smallest one you own.
- [ ] Player, venue home: the third panel is titled **Prizes**; cards read naturally (no "prize prize" sentences).
- [ ] A won prize: the card says **PRIZE** (not REWARD) and the Redeem Prizes page still works.
- [ ] NFL Pick 'Em: the banner says "Details in Prizes".
- [ ] Partner Dashboard: the menu row and sheet say **Offer Prizes**; create one end to end (Create Prize wizard) and read every screen.
- [ ] Results: a game card shows "Prizes won at this game"; tap a prize and the detail opens.
- [ ] Open an OLD bookmark, `/owner/dashboard?sheet=rewards`: it opens the Prizes sheet. Phone Back closes it.
- [ ] Partner email preview (`npm run email:preview`): says "Offer Prizes" and "Redeem Prizes".
- [ ] `/rules`: read it once, as the official contest rules (changed sentences are listed in `docs/rewards-to-prizes-rename-plan_PHASE_4_HANDOFF.md`).

When every box is ticked (or a problem is written next to it), send the list back.
