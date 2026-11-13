# TV Display — Physical Device Verification Checklist (Phase 12)

> **Purpose:** Everything in Phases 8–11 was verified in headless Chromium at 1920×1080 (rendering, animation idempotency, `prefers-reduced-motion`, the `/tv` pairing flow, the answer-reveal beat, and the Category Blitz next-round countdown). **This checklist covers only what a headless browser cannot judge:** real-panel color, across-the-room legibility, QR scan-ability, pairing on an actual TV remote, and multi-hour burn-in. It must be run by someone physically on-site with the hardware. Claude cannot execute it.
>
> **2026-11 update:** section F covers the intro stinger, its sound, keep-awake and the new effects (`docs/venue-display-hype-and-intro-stinger-plan.md`).
>
> Companion: `docs/tv-display-brand-and-animation-plan.md` (§0 has the automated-coverage summary).

## Device matrix (test each you intend to support)
- [ ] Smart-TV built-in browser (e.g. Samsung Tizen / LG webOS) — the most constrained target
- [ ] Chromecast / Google TV
- [ ] Amazon Fire TV
- [ ] Apple TV (via a browser app / AirPlay from a laptop) or a generic HDMI set-top box
- [ ] A laptop → HDMI → the venue's actual TV panel (baseline: isolates panel rendering from browser quirks)

Record for each: device, browser/engine + version, panel size, and viewing distance used.

## Setup
1. On the TV browser, open **`hightopchallenge.com/tv`** (production) — do **not** use a localhost URL; TVs can't reach your dev machine.
2. Have a phone ready, signed in as a venue owner, to complete the pairing claim from **Partner Dashboard → Venue Display** (`/owner/display`).
3. To exercise live game phases on-site, either run a real scheduled/continuous game at the test venue, or have an admin drive one. (The `?mode=` debug query still works in production for a static single-phase smoke check: `…/venue/{venueId}/screen?mode=live-trivia|category-blitz|idle` — but it can't show reveal/results transitions.)

## A. Pairing flow (on the real TV)
- [ ] `/tv` shows the neutral "Setting up this display…" splash, then the pairing card — **no flash of "Resuming…"** on a first-time TV.
- [ ] The 6-character code is legible across the room; the code tiles aren't clipped at the panel's overscan edges.
- [ ] The QR code **scans from actual seating distance** (try the farthest table). If not, note the distance at which it fails.
- [ ] Claim the code from the phone → the TV redirects to the venue screen within a few seconds, **no flash-then-bounce**.
- [ ] Power-cycle the TV → it **auto-resumes** to the venue screen without re-pairing (localStorage persistence).
- [ ] Confirm nothing important sits under the panel's overscan mask (some TVs crop ~3–5% on each edge). Header, countdowns, and bottom leaderboard rows especially.

## B. Color & brand on a real panel
- [ ] Live Trivia reads cyan→blue→violet; Category Blitz reads **fuchsia→violet** (not emerald). Confirm the two games are visually distinct across the room.
- [ ] Gradients don't band badly on the panel (cheap panels posterize dark blue/violet washes).
- [ ] The emerald "Correct answer" reveal is clearly green, distinct from the cyan question theme.
- [ ] White question/answer text has enough contrast on the dark canvas at the venue's actual brightness setting.

## C. Legibility at 10 feet (walk to the farthest seat for each)
- [ ] Live Trivia **question** text is readable; long questions still fit (no overflow/clipping).
- [ ] Live Trivia **answer reveal** — the answer and "STANDINGS NEXT" countdown are readable.
- [ ] **Round break** and **Final standings** — all leaderboard rows (test with **7–8 players**, the compaction target from Phase 8) are on-screen and readable; the podium doesn't overlap the runner-up strip.
- [ ] Category Blitz **letter reveal** — the big letter and the 12-category board are legible.
- [ ] Category Blitz **results** — the "next letter in" countdown shows a **real number counting down** (Phase 11 fix), not a stuck 0.
- [ ] Idle attract — venue name, "next up" schedule, and any sponsor slots read clearly.

## D. Motion on real hardware
- [ ] Animations run smoothly (no jank/tearing) at the panel's refresh rate — reveal bloom, letter slam, podium rise, leaderboard cascade.
- [ ] The question→reveal→round-break→next-round sequence transitions cleanly with no flicker or double-fire on the ~1–4s poll.
- [ ] If the TV/OS has a "reduce motion" accessibility setting, enable it and confirm the screen still renders correctly (static fallbacks, no missing content).

## E. Burn-in / long-run (leave running unattended)
- [ ] Leave the **idle** screen up for a multi-hour stretch (2–4h+). Confirm the slow burn-in drift is active (content shifts a few px every ~5 min) and nothing is pinned perfectly static.
- [ ] After the long idle run, check the panel for image retention of static elements (header text, logo). LCD retention usually clears; OLED is the real risk.
- [ ] Confirm the screen recovers gracefully from a network blip (unplug/replug Wi-Fi): it keeps the last frame and resumes polling, no crash-to-blank.
- [ ] Confirm a live game that ends returns the screen to idle (or the next scheduled/continuous state) without manual intervention.

## F. Intro stinger, sound and effects (2026-11 hype update)

Plan: `docs/venue-display-hype-and-intro-stinger-plan.md` (§8 Standing rules). Headless results:
`docs/venue-display-hype_PHASE_6_after/README.md`. Test on a **Fire TV Stick first** (the weakest target).

**Intro stinger (every time the display opens)**
- [ ] Power on the TV / reopen the display URL → the logo bursts in with coins, then **"IT'S GAME TIME."**, then the
  navy fades away to the venue screen in about 4–5 s. It never gets stuck (worst case it vanishes at 5 s).
- [ ] The stinger runs smoothly enough to read as one motion. If it stutters badly, note how many seconds of
  stutter and the device (this is the heaviest thing on the screen).
- [ ] Reload while a game is live → the stinger plays, the game is fully visible right after it, and no game effect
  (burst, streak, confetti) replays for what was already on screen.
- [ ] Dashboard (`/owner/display`): the small preview **never** plays the stinger; **Expand** does.

**Sound**
- [ ] On the TV: the stinger is usually **silent** (TV browsers block sound that starts by itself). That's expected;
  the screen must still play normally. If the TV does play sound, note whether the boom (logo hit) and shine
  ("IT'S GAME TIME.") are in sync and not too loud for the room.
- [ ] On a phone (Chrome and iOS Safari): tap **Expand** on `/owner/display` → the boom plays with the logo hit and
  the shine with the tagline.

**Keep-awake**
- [ ] Leave the display on an evening with nobody touching the remote → no screensaver, no dimming, no sleep.
- [ ] The dashboard preview on a phone does **not** keep the phone awake.

**Effects (each should play once, never on the next refresh)**
- [ ] Idle screen: every ~75 s a shine crosses "Hightop" and coins burst from the Next-up card. Two TVs in the same
  venue burst at the same moment.
- [ ] Live Trivia: light streak on each new question; red edge glow and pulsing timer in the last 5 s; coin/spark
  burst from the green check on the answer; coin pop on the round-break row when a new player takes 1st; coins and
  confetti on final standings.
- [ ] Category Blitz: rings and sparks when the letter slams; winner row shines on results.
- [ ] Go-live: gold coin burst as "We're live" lands.
- [ ] None of the above replays while the screen sits on the same question/round (it refreshes every 1–4 s).
- [ ] Effects never cover the question or answer text for more than a moment.
- [ ] Reduced motion (if the TV has the setting): no bursts, streaks or confetti; text still fades in; nothing
  missing.
- [ ] After a full game night plus a few hours idle, effects still play and the screen isn't slower than at the
  start (if it is, note how long it had been running).

## Reporting
For each failure, note: device + browser version, phase, viewing distance, and a photo. File findings back against `docs/tv-display-brand-and-animation-plan.md`. Legibility/overscan issues usually mean a spacing/scale tweak in the relevant `components/venue-screen/Tv*.tsx`; color banding is usually a panel setting, not a code bug.
