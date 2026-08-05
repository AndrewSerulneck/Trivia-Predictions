# Bingo Fullscreen + PWA — Physical Device Checklist

**Nothing on this page has been verified.** Every row is open. Phases 0–6 ran headlessly, and a
headless browser has no browser chrome at all — no address bar, no tab bar, no iOS status bar —
so the exact condition this whole plan is about does not exist in that environment, and
standalone PWA mode is unreachable outside a real installed app on a real phone
(`docs/bingo-fullscreen-pwa-plan.md` §4). Automated coverage stops at build, typecheck, lint,
unit tests and `npm run test:pwa-contract`. Everything visual is here.

**Who runs this:** Andrew, with a phone, at a venue with a live Bingo game.

## Before you start

- Devices: one iPhone (Safari), one Android phone (Chrome). An iPad is a bonus — it has the
  Fullscreen API that iPhone lacks, so it exercises Layer B without an install.
- A venue with an **active** Bingo card and a **scored** one, so the Active/Scored tabs and the
  won-board "Collect N Points" button both have real content.
- Note your iOS version. Rows §3 behave differently before/after iOS 17.4.
- **Do not flip `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`** to run §1–§4. It stays off; §5 is the
  only section that needs it, it is not blocking, and it must not be flipped in production
  before the domain split (`docs/pwa-install-rollout-runbook.md`).

**Blocking** = must pass before this work is considered shipped to players.
**Nice-to-have** = record the result, don't hold the rollout.

---

## 1. Browser — iPhone Safari (Layer A, the squeeze)

This is the section that matters most: it is what every player gets today, with no install and
no tap.

| # | Steps | Expected | Blocking | Pass/Fail |
|---|---|---|---|---|
| 1.1 | Open a Bingo card in portrait, rotate to landscape | Enhanced landscape board appears, no blank frame, no flash of the portrait layout | **Blocking** | ☐ |
| 1.2 | Compare the board to a pre-change screenshot (or to memory) | Squares are visibly bigger — target is ~40×44px → ~57px square, label font 8px → 11px | **Blocking** | ☐ |
| 1.3 | Read the prop bet on the longest-labelled square | Full text readable; up to 4 lines, truncation only past 32 characters | **Blocking** | ☐ |
| 1.4 | Look at the top of the screen | The old landscape header row (eyebrow, title, tabs) is gone; that content now sits in the panel on the right | Nice-to-have | ☐ |
| 1.5 | Look at the bottom edge of the board | Board is not clipped. **Phase 1 dropped the bottom safe-area inset in browser mode on the assumption Safari's toolbar already covers the home-indicator strip.** If the board's bottom row is cut off, that assumption is wrong and the inset must come back | **Blocking** | ☐ |
| 1.6 | Check whether Safari's URL bar collapsed | **Expected: it did NOT.** Phase 1 attempted and rejected URL-bar collapse — it needs dropping `overflow/touch-action: none !important`, which hands the scroll lock to `ScrollRescueGuard`. Record what you see; a still-present URL bar is the known state, not a bug | Nice-to-have | ☐ |
| 1.7 | Drag/flick vertically on the board | No rubber-banding, no page scroll, no white gap above or below | **Blocking** | ☐ |
| 1.8 | Swipe left/right between boards, tap the arrow buttons | Board changes; horizontal gesture still works (the shell is `touch-action: pan-x`) | **Blocking** | ☐ |
| 1.9 | Look for an ad banner over the board | No adhesion ad. Test on the smallest phone available — the ad is `md:hidden`, so only SE-class hardware was ever at risk | **Blocking** | ☐ |
| 1.10 | Switch to the Scored tab, then back to Active | Tabs work; on a short display they are icon-only, and the icons have accessible labels | Nice-to-have | ☐ |
| 1.11 | Open a **won** board in landscape | The right-hand panel fits headline + progress + legend **without clipping the "Collect N Points" button**. This is the tightest layout case in the feature | **Blocking** | ☐ |
| 1.12 | If the phone is an iPhone 16 Pro Max (440px tall in landscape) | The `max-height: 430px` compaction block does **not** apply there — confirm the roomier base-token layout still looks right and nothing overlaps | Nice-to-have | ☐ |
| 1.13 | Look at the control row in the panel | **Nothing** in the fullscreen slot — no button, no "Fullscreen unavailable" pill. iPhone Safari has no Fullscreen API and the static pill was deleted | **Blocking** | ☐ |
| 1.14 | Rotate back to portrait | Returns to the normal portrait Bingo view cleanly; page scrolls again; the adhesion ad comes back; no leftover locked/blank state | **Blocking** | ☐ |
| 1.15 | Rotate to landscape, then navigate away (back button) while still rotated | No permanently locked document — scrolling works on the next screen | **Blocking** | ☐ |

## 2. Browser — Android Chrome (Layer B, one-tap fullscreen)

| # | Steps | Expected | Blocking | Pass/Fail |
|---|---|---|---|---|
| 2.1 | All of §1.1–§1.14 on Android | Same expectations | **Blocking** | ☐ |
| 2.2 | Rotate to landscape, then tap **anywhere** once | Chrome goes true fullscreen (its chrome disappears) | **Blocking** | ☐ |
| 2.3 | Make that first tap land on a **square** | The square toggles as normal **and** fullscreen engages — the arming listener must not swallow the tap | **Blocking** | ☐ |
| 2.4 | Repeat 2.3 with the first tap on an arrow button, and again on a tab | Underlying action still fires in both cases | **Blocking** | ☐ |
| 2.4a | Rotate to landscape and make the very first tap the **fullscreen button itself** | Enters fullscreen and **stays** there. This is the likeliest first tap on Android/iPad and it was broken until the review pass: the arming listener toggled on `pointerdown` and the button's own `onClick` toggled straight back out. If it flashes in and out, the enter-only split in `enterLandscapeFullscreen` regressed | **Blocking** | ☐ |
| 2.4b | Immediately after 2.4a, tap the board | Still fullscreen — the flash-exit above also used to latch the "user exited" flag, permanently killing one-tap fullscreen for the session. If tapping now does nothing and the button is the only way back in, that latch is firing again | **Blocking** | ☐ |
| 2.4c | On a device/browser where the request is refused (an unsupported browser, or fullscreen blocked by policy) tap once, then tap again | The second tap retries. The listener is deliberately not `{ once: true }` — a rejected first request must not disarm the feature for the rest of the session | Nice-to-have | ☐ |
| 2.5 | Watch the hint | "Tap anywhere for full screen" appears once, dismisses after ~7s, and never appears again on later rotations (localStorage-backed) | Nice-to-have | ☐ |
| 2.6 | Exit fullscreen with the on-screen button, then tap the board again | Stays exited — it must **not** re-enter fullscreen | **Blocking** | ☐ |
| 2.7 | Exit fullscreen with the system gesture (swipe down / back), then tap the board | Same — stays exited | **Blocking** | ☐ |
| 2.8 | After a deliberate exit, rotate to portrait and back to landscape | **Open question for you to decide.** Phase 2 made the "user exited" flag last for the component's lifetime, so it does **not** re-arm after rotating. If you'd rather each fresh rotation offer fullscreen again, say so — that's a one-line change | Nice-to-have | ☐ |
| 2.9 | While fullscreen, check the bottom edge | The home-indicator inset is now paid (it is conditional on fullscreen/standalone), so the board is not under the gesture bar | **Blocking** | ☐ |
| 2.10 | iPad Safari, if available: rotate and tap once | Fullscreen button is present and works — iPad has the Fullscreen API that iPhone lacks | Nice-to-have | ☐ |

## 3. Installed PWA — iPhone

Install by hand: Share → **Add to Home Screen**. There is no in-app prompt (that's §5, flag-off).

| # | Steps | Expected | Blocking | Pass/Fail |
|---|---|---|---|---|
| 3.1 | Install from the site, then launch from the home screen | The window is **chromeless** — no URL bar, no Safari toolbar. On iOS < 17.4 this depends on the legacy `apple-mobile-web-app-capable` meta Phase 3 added by hand; note your iOS version either way | **Blocking** | ☐ |
| 3.2 | Cold launch (force-quit first) | Lands on the **welcome carousel**, then auth-method-selection. Not a redirect loop, no flash of a gated route. (Phase 4 traced this: an empty cookie jar makes `shouldShowJoinWelcome()` true, so the carousel comes first — this is expected) | **Blocking** | ☐ |
| 3.3 | Confirm you are logged out inside the app | Expected. iOS gives the installed app its own cookie/localStorage jar; Safari's session does not carry over | **Blocking** | ☐ |
| 3.4 | Log in with **passkey / Face ID** | Works on the first launch with no re-enrollment — passkeys live in iCloud Keychain keyed to the RP ID, not the storage jar | **Blocking** | ☐ |
| 3.5 | Log in with **username + PIN** instead | Requires one re-entry, then persists. Expected, not a bug | **Blocking** | ☐ |
| 3.6 | Grant location and join a venue | Location prompt appears fresh (new permission jar) and the venue joins. If you deny it, the retry card's instructions must be the **device-Settings** steps, not "tap the lock icon in your address bar" — there is no address bar | **Blocking** | ☐ |
| 3.7 | Open Bingo, rotate to landscape | Board is genuinely **edge-to-edge** — the full physical display, no browser chrome anywhere. This is the payoff row for the whole plan | **Blocking** | ☐ |
| 3.8 | Look at the notch/Dynamic Island and the home indicator | Nothing important hidden under either; the bottom inset is now paid (standalone), so the board's bottom row is clear | **Blocking** | ☐ |
| 3.9 | Check `/` (join), `/redeem-prizes`, `/activity` in portrait | Status-bar clearance at the top, home-indicator clearance at the bottom, and **no doubled gap** under the header on routes that already have a fixed PageShell header | **Blocking** | ☐ |
| 3.10 | At the very first screen after launch, tap the in-app **Back** button | Navigates somewhere sensible instead of doing nothing. There is no browser back button and no history at the launch entry point; Phase 4 short-circuits to the internal referrer or the fallback route | **Blocking** | ☐ |
| 3.11 | On an ordinary scrollable page, pull down from the very top ~110px | "Keep pulling to reload" → "Release to reload" pill appears, and releasing reloads. This is the only reload escape hatch in standalone | **Blocking** | ☐ |
| 3.12 | Try the same pull inside **Bingo landscape**, and inside **Category Blitz** | **Nothing happens** — no pill, no reload. The hatch must bail on locked surfaces or it fights the scroll lock | **Blocking** | ☐ |
| 3.13 | Try the same pull inside a modal / scrolled partway down a page | Nothing happens (it only arms at `scrollY === 0`) | **Blocking** | ☐ |
| 3.13a | From the top of a **long** page, flick down hard and fast, then let go | **No reload.** Past 110px the pill must also be held ~350ms before it says "Release to reload" — a flick is over well before that. A reload here would throw away in-progress game state | **Blocking** | ☐ |
| 3.13b | Tap into a text field (PIN entry, username, a write-in trivia answer) so the keyboard is up, then drag down from the top | Nothing happens — the hatch bails while a field has focus, so dismissing the keyboard can't reload and lose what you typed | **Blocking** | ☐ |
| 3.13c | Do the deliberate pull on a **game** page that scrolls normally (Live Trivia, Pick 'Em, portrait Bingo) | It still works. The hatch is deliberately *not* disabled across all game routes — a wedged game page is exactly where the only reload escape hatch matters | Nice-to-have | ☐ |
| 3.14 | Background the app mid-round (home gesture), wait ~30s, return | Game state resumes correctly; realtime reconnects; no logged-out screen | **Blocking** | ☐ |
| 3.15 | Tap an ad or an `/info` link | Opens in Safari. Correct behavior, just confirm it isn't a dead tap | Nice-to-have | ☐ |
| 3.16 | Check the home screen icon | Hightop logo on the dark `#020617` background, not a generic screenshot or a white box | Nice-to-have | ☐ |

## 4. Installed PWA — Android

| # | Steps | Expected | Blocking | Pass/Fail |
|---|---|---|---|---|
| 4.1 | Install via Chrome's own menu → Install app | Installs; icon is the maskable variant (logo inset, not cropped into a white circle) | **Blocking** | ☐ |
| 4.2 | Cold launch | Same as §3.2 | **Blocking** | ☐ |
| 4.3 | Log in and join a venue | Same as §3.4–§3.6 | **Blocking** | ☐ |
| 4.4 | Bingo landscape in the installed app | Edge-to-edge, no chrome, bottom inset paid | **Blocking** | ☐ |
| 4.5 | Back gesture at the launch entry point | Same as §3.10 | **Blocking** | ☐ |
| 4.6 | Pull-to-reload | Same as §3.11–§3.13 | Nice-to-have | ☐ |

## 5. Install prompt (flag-gated, OFF — do not run in production)

Run only in a local/preview build with `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED=true`. This is
**not blocking for the current rollout**: the flag must stay off until the domain split ships,
because `start_url`/`scope` are baked into every install at install time and an apex install
would break permanently when traffic moves to `play.hightopchallenge.com`.

| # | Steps | Expected | Blocking | Pass/Fail |
|---|---|---|---|---|
| 5.1 | Flag **off** (production today): rotate to landscape on iPhone and Android | No coach card, no Install button, nothing new anywhere | **Blocking** | ☐ |
| 5.2 | Flag on, Android Chrome, rotate to landscape | Compact "Install" button appears in the panel; one tap opens Chrome's install dialog; the button disappears after installing | Nice-to-have | ☐ |
| 5.3 | Flag on, iPhone Safari, rotate to landscape | Coach card reads "Add to Home Screen for full screen" with a Share icon that **matches the icon in this iOS version's Share sheet** | Nice-to-have | ☐ |
| 5.4 | Dismiss the coach card, reload, rotate again | Stays dismissed | Nice-to-have | ☐ |
| 5.5 | Flag on, open the site in **Chrome on iOS** and **Firefox on iOS** | No coach card — those browsers cannot install a PWA. This is what `isIOSSafari()`'s UA exclusion list is for, and UA strings drift | Nice-to-have | ☐ |
| 5.6 | Flag on, already-installed app | No coach card, no Install button inside the app itself | Nice-to-have | ☐ |

## 6. Regression sweep

Commit 35115fc once leaked a Category Blitz viewport clamp onto five other game routes
(`docs/mobile-game-screen-blackout-plan.md`). Phase 1 added a comparable pile of viewport CSS,
so re-walk the same routes on at least one real device. `npm run test:pwa-contract` covers the
static half of this; these rows cover what it cannot see.

| # | Steps | Expected | Blocking | Pass/Fail |
|---|---|---|---|---|
| 6.1 | **Portrait** Bingo: open a card, scroll top to bottom | Unchanged from before this work — same square sizes, same truncation, page scrolls, nothing clipped | **Blocking** | ☐ |
| 6.2 | Speed Trivia (`/trivia`) | Loads, scrolls, bottom buttons reachable | **Blocking** | ☐ |
| 6.3 | Category Blitz (`/category-blitz`) — play a full round with the keyboard up | No magenta band, no torn frame, no page pan | **Blocking** | ☐ |
| 6.4 | Pick'em (`/pickem`) | Loads, scrolls, bottom content reachable | **Blocking** | ☐ |
| 6.5 | Fantasy (`/fantasy`) | Same | **Blocking** | ☐ |
| 6.6 | Predictions (`/predictions`) | Same | **Blocking** | ☐ |
| 6.7 | Venue home + `/redeem-prizes` in a normal browser tab | Unchanged — no new top/bottom padding. The standalone safe-area CSS is scoped to `html.tp-standalone` and must be invisible in a tab | **Blocking** | ☐ |
| 6.8 | Partner Dashboard (`/owner/*`) in a normal browser tab, run a Stripe Checkout round-trip | Returns to a correct, refreshed billing state. The PWA is players-only so partners should never be installed, but Phase 4 added a defensive `visibilitychange` refetch — exercise it in a plain tab | Nice-to-have | ☐ |
| 6.9 | Admin (`/admin`) in a normal browser tab | Unchanged | Nice-to-have | ☐ |

---

## If something fails

- **§1.5 (board clipped at the bottom in Safari):** restore the unconditional bottom inset —
  in `app/globals.css`, move `--bingo-landscape-pad-bottom: max(env(safe-area-inset-bottom), 0.35rem)`
  out of the `display-mode` blocks and into the base `.tp-bingo-landscape-shell` rule.
- **§1.11 (Collect button clipped):** the compaction block is
  `@media (orientation: landscape) and (max-height: 430px)` in `app/globals.css`; tighten the
  aside token there rather than restating the board-stage formula.
- **§2.6/§2.7 (fullscreen re-arms after a deliberate exit):** `userExitedLandscapeFullscreenRef`
  in `components/bingo/SportsBingoHome.tsx`.
- **§3.1 (chrome still visible in the installed app):** check that the legacy
  `apple-mobile-web-app-capable` meta survived in `app/layout.tsx` — Next's metadata API does
  not emit it.
- **§3.12/§3.13 (reload hatch fires where it shouldn't):** the locked-surface bail is in
  `components/ui/StandalonePwaRuntime.tsx`.
- **Anything in §6:** run `npm run test:pwa-contract` first — if it also fails, the static guard
  found the leak and points at the file.
