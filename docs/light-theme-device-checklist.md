# Light Theme — Phone Checklist (Andrew)

Plan: `light-theme-plan.md`. Only a real phone can sign this off. A headless browser can't show the
status bar, the iPhone home-screen app, Reduce Motion or what the colours look like in daylight.

**Phones and columns:**

| Column | What |
|---|---|
| A | iPhone app |
| B | Android app on **Android 15 or newer** |
| C | Android app on **Android 14 or older** (skip if you don't have one) |
| D | iPhone Safari (website) |
| E | Android Chrome (website) |

Tick a column when it passes; write a note when it doesn't. A dash means "doesn't apply".

**Before you start:**

- **Website only (D, E): use a Preview first.** In Vercel → Settings → Environment Variables, add
  `NEXT_PUBLIC_LIGHT_THEME_ENABLED` = `true` for **Preview** only, then redeploy that preview.
- **The apps (A, B, C) load the live site**, so they only show the new row once the variable is on
  for **Production** (then Redeploy). That is the real rollout: every player sees the Appearance row,
  but everyone still starts on **Dark**, so nobody's screen changes until they choose Light.
- To undo at any point: remove the variable (or set it to `false`) and Redeploy.
- No new App Store / Play Store build is needed.

---

## 1. The Appearance row

| # | Check | A | B | C | D | E |
|---|---|---|---|---|---|---|
| 1.1 | Venue home → menu. Above "Delete my account" there's **APPEARANCE** with two buttons: Dark / Light, and one line: "Light works on Venue Home, Pick 'Em, NFL Pick 'Em and Fantasy. Other games stay dark." | | | | | |
| 1.2 | **Dark** is selected the first time. | | | | | |
| 1.3 | Tap **Light**: the venue home behind the open menu turns light straight away. The menu itself turns light too. | | | | | |
| 1.4 | Close the app / tab completely and open it again: still light, and **Light** is still selected. | | | | | |
| 1.5 | Tap **Dark**: everything goes back to exactly how it looked before. | | | | | |
| 1.6 | Both buttons fit on one line, the same width. | | | | | |
| 1.7 | **Smallest screen:** iPhone SE, or Settings → Display → Display Zoom → Larger Text. Row still fits; nothing cut off. | | | | | |

## 2. The four light screens (choose Light first)

For each screen check that every word is easy to read, nothing is white-on-white or grey-on-grey, and
nothing still looks like a dark leftover.

| # | Check | A | B | C | D | E |
|---|---|---|---|---|---|---|
| 2.1 | **Venue Home → Games**: light page, white header; game tiles keep their own colours. | | | | | |
| 2.2 | **Venue Home → Leaderboard**: your row is clearly highlighted; ranks and points readable. | | | | | |
| 2.3 | **Venue Home → Prizes**: progress bars and "Claim" pill readable; prize pop-up readable. | | | | | |
| 2.4 | **Pick 'Em**: day bar, sport buttons, the tickets (white with faint navy/magenta halves), won/lost/push marks, the "10 picks" notice. | | | | | |
| 2.5 | **Pick 'Em → make a pick**: the pick animation and "picked" highlight look right. | | | | | |
| 2.6 | **NFL Pick 'Em**: week dropdown, summary card, game cards (live, final, tie), tiebreaker card, leaderboard, prize banner. | | | | | |
| 2.7 | **Fantasy → build a roster**: player list, picked rows, lineup slots, the bottom "Submit" button. | | | | | |
| 2.8 | **Fantasy → My Sweat (live)**: the scoreboard stays a dark green chalkboard (on purpose); everything around it is light. | | | | | |
| 2.9 | **Fantasy → Leaderboard tab**: your row highlighted, points readable. | | | | | |
| 2.10 | Do the tutorial cards ("Make your picks", "Play Fantasy") still look the same as before? (They're artwork and stay as they were.) | | | | | |

## 3. Moving between screens

| # | Check | A | B | C | D | E |
|---|---|---|---|---|---|---|
| 3.1 | Light venue home → **Live Trivia**: Live Trivia is dark, with **no flash of white** on the way in. | | | | | |
| 3.2 | Back from Live Trivia to venue home: light again, no flash of dark. | | | | | |
| 3.3 | Same for **Speed Trivia**, **Bingo** and **Category Blitz**: always dark. | | | | | |
| 3.4 | Light venue home → **Pick 'Em** and → **Fantasy**: the loading screen in between is light (logo on a pale page), **not** a black flash. | | | | | |
| 3.5 | Prize wallet (`Redeem Prizes`) and the TV screen stay dark. | | | | | |
| 3.6 | Choose Light **while inside a game** (menu in Live Trivia): the game stays dark; the note under the buttons explains why. Go back to venue home: it's light. | | | | | |
| 3.7 | Switch Light ↔ Dark while a game's own pop-up is open (e.g. a Pick 'Em result): nothing breaks. | | | | | |

## 4. (Removed 2026-10-22: "Match my phone" was dropped; the choice is Dark or Light.)

## 5. The bar at the top of the screen

| # | Check | A | B | C | D | E |
|---|---|---|---|---|---|---|
| 5.1 | **Apps:** on a light screen, the clock/battery strip is **white with dark icons**. | | — | | — | — |
| 5.2 | **Android 15+ app:** the strip **stays navy with white icons** on a light screen. That's expected (Android doesn't let the app recolour it). The icons are never dark on navy. | — | | — | — | — |
| 5.3 | **Apps:** open Live Trivia: the strip goes back to navy with white icons. | | | | — | — |
| 5.4 | **Apps:** at no point do the clock and battery disappear (white icons on a white strip, or dark on navy), even when moving quickly between screens. | | | | — | — |
| 5.5 | **Android ≤14 app:** on a light screen, rotate the phone to landscape and back. The icons stay dark on the white strip. | — | — | | — | — |
| 5.6 | **Websites:** Chrome's bar above the page turns white on a light screen and navy on a dark one. (Safari may or may not tint; either is fine.) | — | — | — | | |

## 6. iPhone home-screen app (installed from Safari)

Safari → Share → **Add to Home Screen**, then open it from the home screen.

| # | Check | iPhone |
|---|---|---|
| 6.1 | On a light screen, a thin **navy band** sits behind the clock so the white clock stays readable. | |
| 6.2 | On a dark screen there's no visible band change (it's navy anyway). | |
| 6.3 | Nothing you need to tap is hidden under the band. | |

## 7. Reduce Motion

Turn on Reduce Motion (iPhone: Settings → Accessibility → Motion; Android: Settings → Accessibility →
Remove animations).

| # | Check | A | B | C | D | E |
|---|---|---|---|---|---|---|
| 7.1 | Light venue home, Pick 'Em and Fantasy look and work the same; nothing is stuck mid-animation. | | | | | |
| 7.2 | The loading logo between screens fades instead of bouncing, on a light page. | | | | | |

## 8. Two tabs (website only)

| # | Check | D | E |
|---|---|---|---|
| 8.1 | Open venue home in two tabs. Choose Light in one, then switch to the other: it has turned light too, and its menu shows **Light** selected. | | |

---

## When you're done

- Everything passes → keep the variable on in Production (or turn it on now). That's the launch.
- Anything fails → tell me the check number, phone and a screenshot. Nothing else needs to change
  while you test: with the variable off every screen is exactly as it was.
- **Your decision, any time:** should new players start on **Light** instead of Dark?
  (`DEFAULT_THEME_PREFERENCE`, plan §6 Q1.) Today everyone starts on Dark.
