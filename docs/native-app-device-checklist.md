# Native App — Device Checklist (Andrew)

Created in Phase 3 of `docs/native-app-store-plan.md` (2026-10-09); updated in Phase 3B.1 (same day) for
the **player-only app** (partners use the website, never the app). This is the standing check for the
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
2. It opens on the player sign-in, with **no "Home" button and no partner link** at the bottom (Phase 3B.1).
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
9. **(Android)** As a player, open the venue menu (or any game's sheet/overlay). Press Back: the
   overlay closes first, before the page goes back.

## D. Things that open in the browser, not the app

10. **No partner page in the app.** Any link to a partner page (for example
    `hightopchallenge.com/owner/login`, or the TV page `hightopchallenge.com/tv`) opens in Safari/Chrome.
    If one is reached from inside the app some other way, the app shows **"The Partner Dashboard is on our
    website"** (or "The venue TV screen is on our website") with an **Open in browser** button that opens
    it. There is no sign-in, dashboard, billing or Subscribe screen anywhere in the app.
11. **Partners on the website are unchanged:** in mobile Safari/Chrome (not the app), sign in at
    `hightopchallenge.com/owner/login` and use the dashboard and Billing exactly as before.
12. Any link to `/info`, the FAQ or Advertise opens in Safari/Chrome. Privacy, Terms, Rules, Support and
    Delete Account stay **inside** the app.
13. A God Mode admin sign-in that goes to `/admin`: the app shows **"Admin opens in your browser"**.

## E. Legal pages keep app features (Android)

14. **(Android)** Open Privacy or Support from the player menu, press the phone's Back: you return to
    where you were. (Once the domain split is on, these pages live on `hightopchallenge.com`; this proves
    the app's bridge still reaches them.)

## F. Links and the join QR (only after the paid accounts — skip until then)

These need the paid Apple account and the Play Console (plan Phase 0), plus two Vercel settings
(`APPLE_TEAM_ID`, `ANDROID_APP_CERT_SHA256`). Until then, links open the browser as before.

15. With the app installed, scan the **join QR** on a coaster with the phone's Camera app: the **app**
    opens on the player sign-in.
16. Tap a partner link (a `hightopchallenge.com/owner/…` link in an email): it opens in **Safari/Chrome**,
    never the app.
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
  sideways**. (The 2E remembered-partner launch was removed in Phase 3B.1 — skip those steps.)
- The Phase 2A per-item checklist (`docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md`, A1–A14).

## I. Phase 4 — share, buzz and QR scanner (rebuild the app AFTER the web deploy)

The buttons only appear once the website is deployed AND the app is rebuilt (`cd native && npx cap sync`,
then run from Xcode / Android Studio). The Android shell now needs Android 8 or newer (API 26).

20. **Invite a friend:** Category Blitz alone at a venue → "Invite a friend" opens the phone's share sheet
    with the join link. Cancel → nothing happens. In a phone browser → share sheet or "Link copied".
21. **Buzz:** a right Speed Trivia answer, a Bingo square, a Bingo win → a tap/buzz. With iOS Reduce Motion
    on → silence.
22. **Story picture (Android):** finish Live Trivia / Category Blitz, tap share on your story → the share
    sheet opens **with the picture attached** (Messages/WhatsApp show it). iPhone: same as before.
23. **Scan QR code** (player sign-in screen and venue list; app only, never in a browser): tap it → the
    camera permission question appears **now, not at launch** → allow → point at the printed join QR
    (`https://play.hightopchallenge.com`, e.g. `public/store/qr/hightop-challenge-qr.png` on another
    screen) → you stay put and see "That's the Hightop join code…".
24. Scan a QR for something else (a website, a Wi-Fi code) → "That's not a Hightop code." Nothing opens.
25. Tap the X to close the scanner → no message. Refuse the camera → "Camera access is off…".
26. (Optional) Scan a venue link `https://play.hightopchallenge.com/?v=<a real venue id>` → the app opens
    that venue's join step, same as the phone's Camera app does today.

## J. Phase 9 — "Share my win" (9a–9e; added 2026-10-22, plan Phase 9f)

**Best done after fix phases 9f.1 and 9f.3–9f.5 are deployed** (plan, "Phase 9f fix phases"; 9f.2 needs an app
rebuild): several of these checks fail today for known reasons (items 38, 41 are marked; 35 was fixed in 9f.1; 33 is the 9f.2 check). Do each item on four devices: **iPhone app, Android app,
iPhone Safari, Android Chrome** — write "app/web" in the Results table. The app needs a rebuild after the web
deploy for the in-app Instagram Story (9d) and the 9f.2 fix.

**Set up once:** on the Partner Dashboard of a venue you can play at, Game Settings → "On shared pictures" →
Change → enter your own Instagram handle, leave all three on → Save. Win something there (a Category Blitz round,
a Pick 'Em pick, or a prize in `/redeem-prizes`).

27. **No camera needed:** tap "Share my win" → the sheet opens on ready-made designs (Spotlight / Card / Night),
    no camera question. Switch Story ↔ Post → the pictures redraw at the new shape.
28. **The picture:** headline is "I just won … at <bar>!", the bar's name, street + city, your @handle under the
    name, a QR, and "hightopchallenge.com/app". Nothing is cut off on a small phone (iPhone SE if you have one).
29. **The QR:** post (or just save) a Story, then scan the QR on it from ANOTHER phone's camera → it opens
    `play.hightopchallenge.com` (the player sign-in) today; after the store launch, the right store.
30. **Copy caption + link:** tap it → "Copied". Paste into Notes → the headline, `@yourhandle`, and
    "Play on Hightop Challenge: https://hightopchallenge.com/app".
31. **Each destination:** Instagram Story, Instagram post, Facebook, X, Messages, Save, More. For each, note
    which app opens (or which share sheet), what hint the sheet shows, and what text arrives in the other app.
    Expected: every one copies the caption first; X and Messages carry the text with the picture; Save keeps
    the picture (in the app: the share sheet's "Save Image"). On a computer, X opens x.com in a new tab
    and the sheet says "Opening X with your caption." (not "Couldn't open X"; fixed in 9f.1).
32. **In-app Instagram Story (app only, Instagram installed):** Instagram's Story editor opens with the picture
    already in it. Add a link sticker → Paste → the app link appears.
33. **Same, iPhone app — the 9f.2 check** (needs the 9f.2 website change deployed AND a new app build on the
    phone; with only one of them it still fails). In Instagram's Story editor add a link sticker → Paste. Expected:
    the caption + link pastes (before 9f.2 nothing did). Record exactly what pastes. Two things to watch: (a) if
    nothing pastes, Instagram cleared the pasteboard when it read the picture → tell Claude to build 9f.2's
    honest-wording fallback; (b) the whole caption goes into the link field, not just the link — note whether
    Instagram accepts it or you have to delete the words before the `https://` (same on Android, item 32).
34. **In-app Instagram Story, Instagram NOT installed:** the button falls back to the share sheet (or, after
    9f.1, says "Instagram didn't open. Tap More…"). Nothing freezes.
35. **Double-tap Instagram Story quickly (fixed in 9f.1):** Instagram should open once.
36. **Selfie (optional extra):** "Take a selfie instead" → camera question → take one → the same destinations
    share it. Refuse the camera → the ready-made designs still share.
37. **Back:** Android Back (app) from the selfie → back to the designs; again → the sheet closes.
38. **Category Blitz finish screen (fixed in 9f.3):** open the sheet while the points count up → the
    designs draw once and stay (no endless grey placeholders); Share becomes tappable. Also: pick "Take a selfie
    instead", then "Designs" again → the thumbnails show (not broken pictures).
39. **Prize:** `/redeem-prizes` → "Share my win" on a won prize → "I just won $15 off my tab at <bar>!" (or "a
    Free Appetizer"). The picture shows the prize NAME only — no code, no QR to redeem, no card number.
40. **What a share shows (9e):** on the Partner Dashboard switch each choice and re-share, one at a time:
    name off → the headline has no " at <bar>" and no bar line; address off → no street/city; handle off → no
    @handle on the picture or in the caption, the nudge says "Tag <bar>"; all three off → only the win + the
    app panel.
41. **A change reaches players (fixed in 9f.4):** after a partner change, wait 10 minutes (or use a phone that
    hasn't opened that venue's home), then open a share from a game you reached WITHOUT going through the venue
    home first (a bookmark) → for a moment the sheet says "Getting your picture ready…" and the app buttons are
    greyed, then the picture shows the NEW choice. With Wi-Fi off on a phone that never visited the venue →
    the picture names no bar (only the win + the app panel), and still shares.
42. **Partner box:** the "On shared pictures" box appears on Schedule → Review, the Prize wizard's Confirm screen
    and Game Settings. Change in one → the others show it. A bad handle ("my bar!") → a plain message, nothing
    saved. Turn Wi-Fi off, open Game Settings → "Couldn't load this setting" and a "Try again" button (9f.5); turn Wi-Fi on, tap it → the setting loads. Switch venue (if you have two) → the box shows that venue's choices, never the other's half-edited ones.

## Results

| # | iPhone | Android | Notes |
|---|---|---|---|
| | | | |
