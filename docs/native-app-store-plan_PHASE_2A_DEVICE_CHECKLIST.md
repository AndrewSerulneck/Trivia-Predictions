# Phase 2 Part A — your device checklist (iPhone + Android emulator)

For: Andrew. About 45 minutes. Nothing here changes the live website or anyone's data, **except**
step A10, which you must NOT finish (don't press the final delete button on your real account).

Write the result next to each item: **Pass**, **Fail** (plus what you saw), or **Skipped**. Then tell
Claude, "Phase 2A device results are in the checklist." The next agent reads this file.

What Claude already tested in the iPhone Simulator and the Android emulator is in
`docs/native-app-store-plan_PHASE_2A_HANDOFF.md` §6. The items below need a real sign-in, a real
phone, or a human eye.

---

## Part 1 — Put the test app on your iPhone (one time, ~10 minutes)

The test app is called **Hightop Challenge** and has a plain placeholder icon. It's a temporary
test build, so it disappears after 7 days. That's normal for a free Apple account; Part B uses the
paid account.

1. Plug your iPhone into the Mac with a cable. Unlock it and tap **Trust This Computer** if asked.
2. On the iPhone: **Settings → Privacy & Security → Developer Mode → On**. The phone restarts.
   Confirm **Turn On** after the restart.
3. On the Mac, open **Terminal** and paste:
   `cd ~/Documents/Trivia-Predictions/native && npx cap open ios`
   Xcode opens the project.
4. In Xcode's left sidebar, click the blue **App** icon at the top. Then click **App** under
   "TARGETS", then the **Signing & Capabilities** tab.
5. Tick **Automatically manage signing**. Under **Team**, choose **Andrew Serulneck (Personal Team)**.
   If there's no team, click **Add an Account…** and sign in with your Apple ID. Leave the
   **Bundle Identifier** as `com.hightopchallenge.spike`. Don't change it to
   `com.hightopchallenge.app`, which is saved for the real paid account.
6. At the top of the Xcode window, click the device menu (next to "App") and choose **your iPhone**.
7. Press the **▶ (Run)** button. The first build takes a few minutes.
8. If Xcode says the developer isn't trusted: on the iPhone go to **Settings → General → VPN & Device
   Management → (your Apple ID) → Trust**, then press ▶ again.
9. The app opens on your iPhone, showing the Hightop sign-in screen.

## Part 2 — The Android emulator

The **Android Emulator** window ("hightop_api36", a Pixel 8 running Android 16) is already open on
your Mac with the test app installed. Click its icon to open it if needed.

- **If the emulator window is closed:** open Android Studio → **Device Manager** (phone icon on the
  right) → press ▶ next to **hightop_api36**. Then, in Terminal, paste:
  `~/Library/Android/sdk/platform-tools/adb install -r ~/Library/Caches/hightop-native/android/app/outputs/apk/debug/app-debug.apk`
- **Location on the emulator:** click the **⋯** (More) button on the emulator's side toolbar →
  **Location** → search for your venue's address → **Set Location**. The emulator has no real GPS.
- **Rotate:** use the two rotate buttons on the emulator's side toolbar.
- **Back button:** use the **◁** at the bottom of the emulator screen, or swipe in from the left
  edge.
- **"Swipe the app away":** open the recent-apps view (the square button, or swipe up and hold),
  then swipe the Hightop card up.

---

## Part 3 — The tests

Do each test on the **iPhone** and on the **emulator**. Use your normal player account (or a God Mode
account) so you don't have to be at a venue.

| # | Test | iPhone | Android emulator |
|---|---|---|---|
| A1 | **Sign in.** Open the app → Enter Username/PIN → sign in → pick your venue. You reach the venue home page. | | |
| A2 | **Stay signed in after closing the app.** Within 10 seconds of reaching the venue page, swipe the app away. Reopen it. Are you still signed in, without typing your PIN again? | | |
| A3 | **Stay signed in after a longer close.** Use the app for a minute, swipe it away, wait 5 minutes, reopen. Still signed in? | | |
| A4 | **Location prompts.** Sign out first, or delete and reinstall the app (on the iPhone, press ▶ in Xcode again). As a normal (non-God-Mode) account, go through sign-in to the venue list. Count the location pop-ups. **Expected today on iPhone: TWO** (one from the app, one saying "play.hightopchallenge.com would like to use your current location"). Write down exactly what each one said. Then close and reopen the app and go to the venue list again: does the website pop-up come back every time? | | |
| A5 | **Partner sign-in.** On the sign-in screen tap **Home** → scroll to **Partner Login** → sign in with your partner account. Does the Partner Dashboard load **inside the app** (no Safari/Chrome)? Open the menu and a sheet or two (Schedule, Rewards). Anything broken? | | |
| A6 | **Payments open outside the app.** In the Partner Dashboard, open the menu → **Billing** and tap **Update** next to "Card on file" (it opens Stripe's billing page). Does Stripe open in **Safari / Chrome**, not inside the app? Close it without changing anything. Back in the app, is the dashboard still there? | | |
| A7 | **Bingo full screen.** As a player, open Prop Bingo, turn the phone sideways, and go through the same checks as `docs/bingo-fullscreen-pwa-device-checklist.md` (board fills the screen, nothing hidden under the notch or camera cut-out, no white bars, rotating back works). Note anything different from the website. | | |
| A8 | **Live updates come back after the app sleeps.** Open a game with live updates (Live Trivia during a game, Category Blitz, or the Bingo board during a live game). Press the Home button, wait **5 minutes**, reopen the app. Within about 10 seconds, does the screen update again (new question, scores, squares) without you pulling to refresh? | | |
| A9 | **Android back button** (emulator only). From the venue home, open a game, then a sub-page. Press **◁** repeatedly. Each press should go back one screen. On the very first screen, back currently does **nothing** (it doesn't close the app). Is anything surprising, such as skipping several screens at once or leaving the venue? | n/a | |
| A10 | **Delete-account screen** (look, don't delete). Open the menu → **Delete my account**. Read the page. Tap into the box and type DELETE with the phone keyboard. Does the keyboard cover the button? Is the page readable? **Do NOT press the final button.** Go back. | | |
| A11 | **Legal pages.** From the menu, open Privacy, Terms, Rules, Support. Each page opens, can be read, and Back returns you to the game. | | |
| A12 | **First launch on mobile data.** Turn Wi-Fi off on the iPhone, force-close the app, open it. How long until the sign-in screen appears? Anything blank for more than ~5 seconds? | | n/a |
| A13 | **Airplane mode.** Turn on Airplane Mode, force-close, open the app. What do you see? (We expect a "No connection — Try again" screen; a blank white screen is also useful to know.) Turn Airplane Mode off and tap **Try again**. | | |
| A14 | **Anything else odd**: text too small, things under the status bar or notch, the keyboard covering inputs, slow screens. | | |

## When you're done

- Tell Claude the results (or fill in this table and say so).
- The iPhone test app expires by itself after 7 days. To remove it sooner, press and hold its icon →
  **Remove App**.
- Leave the emulator alone or close its window; nothing needs cleaning up.
