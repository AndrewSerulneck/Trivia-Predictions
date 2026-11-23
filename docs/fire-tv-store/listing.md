# Hightop Challenge TV: Amazon Appstore listing (Fire TV)

Paste-ready text for the Amazon Developer Console (`docs/fire-tv-app-plan.md` Phase 7). Written 2026-11-22 (Phase 6).
Amazon renames fields now and then; match by meaning. Character limits were checked on 2026-11-22; recheck if the
console complains.

## App basics

| Field | Value |
|---|---|
| App title | `Hightop Challenge TV` |
| Category | **Entertainment** (see note) |
| Countries | United States only |
| Price | Free |
| In-app purchases | None |
| Language | English |
| DRM | No |
| Devices | **Fire TV devices only.** Uncheck Fire tablets and non-Amazon Android devices. |
| Release date | As soon as approved |
| Support URL | `https://hightopchallenge.com/support` |
| Privacy policy URL | `https://hightopchallenge.com/privacy` |
| Website | `https://hightopchallenge.com` |

**Category note:** the TV shows the game; people play it on their phones. Under **Games → Trivia**, a reviewer may
expect to play with the remote and fail the app for "no gameplay". **Entertainment** describes what the TV app does.

## Amazon console IDs (not secret)

Recorded 2026-11-23. Not used by the app (no DRM, no in-app purchases); keep for Amazon support.

| Field | Value |
|---|---|
| App ID | `amzn1.devportal.mobileapp.40a765b23bb84ce49109cafe420be156` |
| Release ID (first release) | `amzn1.devportal.apprelease.8d69b4bca5344d92aae2f7cb2e0ffc5f` |

## Short description

Paste as is (≈ 190 characters; the key point is in the first sentence):

```
Put your bar's live trivia on the big screen. Hightop Challenge TV shows questions, timers, answers and leaderboards while your guests play on their phones.
```

## Long description

```
Hightop Challenge TV turns any TV at your bar or restaurant into the scoreboard for Hightop Challenge games.

Guests play free on their phones. The TV shows everyone the same game: the question and timer, the answer reveal, round-by-round standings and the champion at the end of the night. Between games it shows when the next Live Trivia starts and a QR code guests can scan to get the app.

Connecting a TV takes seconds:
• Option 1: scan the QR on the TV with your phone while signed in to your Partner Dashboard.
• Option 2: type your venue's 4-character display code with the remote. You'll find it on your Partner Dashboard under Display.

Built for a TV that runs all night:
• The screen never goes to sleep or the screensaver.
• If the Wi-Fi drops, the TV says so and reconnects by itself.
• The TV remembers its venue, so it comes straight back after a restart.
• The remote's Menu button lets staff change the venue or reload.

New to Hightop Challenge? Press Try demo to see a full trivia game on screen.

Hightop Challenge TV is for venues that run Hightop Challenge games. Learn more at hightopchallenge.com.
```

## Product feature bullets

```
Shows live trivia questions, timers, answers and standings on your venue's TV
Connect in seconds: scan a QR with your phone or type a 4-character code
Stays awake all night and reconnects by itself after a Wi-Fi drop
Try demo shows a full game without an account
Free for Hightop Challenge venues
```

## Keywords

```
trivia, bar trivia, pub quiz, trivia night, live trivia, scoreboard, leaderboard, bar games, restaurant, venue display, game night, quiz
```

## Content rating

Answer each question with the facts below. Amazon's wording varies; the reason column is for you, not for pasting.

| Topic | Answer | Reason |
|---|---|---|
| Violence (cartoon, fantasy or realistic) | None | Trivia questions and scoreboards only. |
| Nudity or sexual content | None | |
| Profanity or crude humor | None | Questions are written and reviewed by Hightop Challenge. |
| Drugs | None | |
| Alcohol or tobacco | **Infrequent / mild references** | The app is shown in bars, venue names can include words like "Tavern", and a trivia question may mention a drink. Answering "mild" is the honest, safe choice; it doesn't stop approval. |
| Intolerance or hate | None | |
| Gambling: real money | **No** | Free to play. No wagering, no purchases, no cash prizes in the app. |
| Gambling: simulated | **No** | No casino games or betting. The coin logo is branding (D22). |
| Contests or prizes | Venues may award their own prizes (e.g. a free appetizer) to winners. Nobody pays to play, and nothing is won or redeemed in the TV app. | Only if asked. |
| Account creation or login | **No** | The TV app has no sign-in. |
| Collects personal information | **No** | It stores only the connected venue's id on the TV. |
| Shares location | **No** | The TV app never asks for location. |
| Advertisements | **No** | No ads on any display screen. |
| User-generated content / users communicate | **Limited: usernames.** Players' usernames appear on leaderboards. Usernames are checked by a blocklist and an automated moderator when chosen. No chat, no messages, no photos. | |
| Target audience | **General / adults**. Not directed at children under 13. | Players are bar and restaurant guests. |

## Privacy and data questions

- **Does the app collect user data?** No personal data. The app stores one value on the TV: the id of the venue it
  is connected to.
- **What reaches our servers?** The same as any website visit: the TV's IP address and device type. When a TV is
  connected, a one-time code that expires after 10 minutes and, once used, the venue id are stored.
- **Shared with third parties?** No. **Sold?** No. **Used for ads or tracking?** No.
- **Encrypted in transit?** Yes, HTTPS only (the app refuses plain http).
- **Can users ask for deletion?** There is no user data in the TV app. Menu → Change venue removes the stored venue
  from the TV.

## Notes for the reviewer (Testing instructions)

```
Hightop Challenge TV shows a venue's trivia game on the bar's TV; guests play on their phones.

Quick look, no account needed:
1. Open the app. The Connect screen appears.
2. Press Up on the remote to highlight "Try demo", then press Select. A full trivia game plays on screen (question, answer, round break, champion), 15 seconds per screen.
3. Press Back to return to the Connect screen.

Connect to a real test venue:
1. On the Connect screen, highlight the 4 code boxes and press Select. The on-screen keyboard opens.
2. Type the display code J6NK. The TV opens the "Hightop Test Bar" display.
3. Press the Menu (☰) button: "Change venue" returns to the Connect screen; "Reload" reloads the display.

Option 1 on the Connect screen (scan the QR) needs a venue owner's phone, so please use the display code above.

Other features: the screen stays awake (no screensaver), and if the network drops the app shows "Can't connect." and reconnects by itself when the network returns.
```

Test venue OK'd by Andrew on 2026-11-22: **Hightop Test Bar**, code `J6NK`, venue id `venue-hightop-test`. Before
pasting, open `https://hightopchallenge.com/tv/J6NK` and check it still shows that display. Never put owner login
details in this field.

## Files to upload

| Console box | File |
|---|---|
| App file (APK) | named in `docs/fire-tv-app-plan_PHASE_6_HANDOFF.md` §6 (outside the repo; not committed) |
| Small icon 114×114 | `docs/fire-tv-store/images/icon-small-114x114.png` |
| Large icon 512×512 | `docs/fire-tv-store/images/icon-large-512x512.png` |
| Fire TV icon 1280×720 | `docs/fire-tv-store/images/fire-tv-icon-1280x720.png` |
| Fire TV background 1920×1080 | `docs/fire-tv-store/images/fire-tv-background-1920x1080.png` |
| Screenshots 1920×1080 (in this order) | `docs/fire-tv-store/screenshots/01-question` … `07-connect` (7 files) |

All images are opaque (no transparency). The screenshots are from Try demo and the Connect screen, captured on an
Android TV emulator; the demo uses a made-up venue ("Demo Bar") and made-up player names.
