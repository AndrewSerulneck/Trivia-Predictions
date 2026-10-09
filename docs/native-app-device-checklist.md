# Native App — Device Checklist (Andrew)

Created in Phase 3 of `docs/native-app-store-plan.md` (2026-10-09). This is the standing check for the
iPhone and Android apps. Run it **after the website changes are deployed** (Vercel deploys `main`): most of
the app *is* the live website, so a test before the deploy tests the old site.

- **iPhone:** the test app called "Hightop Challenge" is already on your iPhone 16 Pro (installed
  2026-10-09, version 1.0.0). It's a free-provisioning build, so it **stops opening 7 days after it was
  installed**. If it won't open, ask the agent to reinstall it (the phone must be plugged in and unlocked).
- **Android:** the emulator `hightop_api36` on the Mac. Ask the agent to start it.
- Write ✅ or ❌ next to each line, plus a note for any ❌. A screenshot helps.

Steps marked **(iPhone)** or **(Android)** apply to that phone only.

## A. Opening the app

1. Tap the app icon. The **icon** is the Hightop Challenge logo on dark navy (not the blue Capacitor
   default). While it opens you see a **navy screen with the logo**, never a white flash.
2. It opens on the player sign-in, with **"Venue partner? Sign in"** at the bottom and no "Home" button.
3. The status bar (clock, battery) is dark navy with white text, and nothing on the page sits under it.

## B. Location (iPhone: one question, not two)

4. **(iPhone)** Sign in as a normal (non-God-Mode) player and pick a venue. You are asked about location
   **once** ("Allow Hightop Challenge to use your location?"). Before Phase 3 a second box appeared:
   *"play.hightopchallenge.com would like to use your current location"*. That second box must not appear,
   on the sign-in or on any venue or game page.
5. **(iPhone)** In the phone's Settings → Hightop Challenge → Location, choose **Never**. Back in the app,
   the location screen shows the steps to turn it on in the phone's **Settings app** (not "tap the lock in
   your address bar"). Set it back to **While Using** afterwards.

## C. Back button (Android)

6. **(Android)** On the sign-in, tap **Create Account**. Press the phone's Back: you return to "How do you
   want to continue?" — the app does **not** close. (If the keyboard is open, the first Back only closes
   the keyboard. That's normal Android.)
7. **(Android)** Open Privacy from the player menu, press Back: you return to where you were.
8. **(Android)** On the player sign-in with nothing to go back to, press Back: the app goes to the
   background (like Home). Reopen it: it's where you left it.
9. **(Android)** As a partner, open the dashboard menu, then a sheet (Schedule or Rewards). Press Back:
   the sheet closes first. If you typed something into it, you're asked "Discard…?" first.

## D. Things that open in the browser, not the app

10. Partner sign-in → **"Create an account"** (or "New venue owner?"): either Safari/Chrome opens on our
    sign-up page, or the app shows **"Partner sign-up is on our website"** with an **Open in browser**
    button that opens it.
11. As a signed-in partner: menu → **Billing**. You see your plan, status and invoices, and **one** button,
    **"Manage billing on the web"**. No Subscribe, Update card, Resume or Cancel buttons in the app. The
    button opens the Billing page in Safari/Chrome (you may need to sign in there once).
12. Any link to `/info`, the FAQ or Advertise opens in Safari/Chrome. Privacy, Terms, Rules, Support and
    Delete Account stay **inside** the app.
13. A God Mode admin sign-in that goes to `/admin`: the app shows **"Admin opens in your browser"**.

## E. Partner pages keep app features (Android)

14. **(Android)** Sign in as a partner. On the dashboard, the phone's Back still works as in step 9. (This
    proves the app's bridge reaches the partner pages, which live on `hightopchallenge.com`.)

## F. Links and the join QR (only after the paid accounts — skip until then)

These need the paid Apple account and the Play Console (plan Phase 0), plus two Vercel settings
(`APPLE_TEAM_ID`, `ANDROID_APP_CERT_SHA256`). Until then, links open the browser as before.

15. With the app installed, scan the **join QR** on a coaster with the phone's Camera app: the **app**
    opens on the player sign-in — even on a phone where a partner signed in.
16. With the app already open on the Partner Dashboard, scan the QR again: the app switches to the
    player sign-in.
17. Tap a `play.hightopchallenge.com` link in Messages: it opens in the app.

## G. Offline and the update screen

18. Turn on **Airplane Mode**, then tap something that loads a new page: "No connection — Try again".
    Turn Airplane Mode off, tap **Try again**: you're back on that page.
19. (Optional, you in the Vercel dashboard — agents may add env vars but not delete them.) Add
    `NATIVE_APP_MIN_VERSION` = `9.0.0` (Production), then **Redeploy**. Wait ~5 minutes and reopen the
    app: **"Please update Hightop Challenge"** covers the screen. Delete the variable, Redeploy again;
    within ~5 minutes the app opens normally.

## H. Still open from earlier phases

- Phase 2D/2E checks (`docs/native-app-store-plan_PHASE_2E_HANDOFF.md` §6), especially **Bingo turned
  sideways** and the remembered-partner launch.
- The Phase 2A per-item checklist (`docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md`, A1–A14).

## Results

| # | iPhone | Android | Notes |
|---|---|---|---|
| | | | |
