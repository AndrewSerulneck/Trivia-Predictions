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
  animation, then **Live Games and Offer Rewards appear together, in one step** — not the logo,
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

When every box is ticked (or a problem is written next to it), send the list back.
