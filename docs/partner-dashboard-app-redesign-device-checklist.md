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
  top-left… then Venue Display" and "Tap Offer Rewards on your dashboard".
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

## E. Back gesture, decided behaviour
- [ ] The phone's Back gesture **does not** ask "Discard?" — it just steps back or closes. This is
  deliberate (see the Phase 6 handoff). Tell me if you would rather it asked.

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

When every box is ticked (or a problem is written next to it), send the list back.
