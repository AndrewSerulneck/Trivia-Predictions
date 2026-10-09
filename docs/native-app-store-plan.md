# Native App Store Plan — Hightop Challenge on the App Store and Google Play

**Status:** Plan written 2026-10-08; Andrew's answers folded in the same day (§2 items 4–11).
**Phases 1a and 1b are DONE and deployed (2026-10-08)** — latest handoff
`docs/native-app-store-plan_PHASE_1B_HANDOFF.md` (1a: `…_PHASE_1A_HANDOFF.md`). Migration
`20261008044524_player_account_deletion.sql` is applied to production. Phase 0 is Andrew's, in
progress (D-U-N-S requested, Xcode and Android Studio installed). **Phase 2 is split into Part A
(now: Xcode free provisioning + Andrew's iPhone + the Android emulator) and Part B (after the paid
Apple account is approved: passkeys and the 7-day login test)** — see Phase 2. **Part A: automated
simulator/emulator checks done 2026-10-08; waiting on Andrew's device checklist**
(`docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md`); handoff
`docs/native-app-store-plan_PHASE_2A_HANDOFF.md`. **Andrew's first device report (2026-10-08) added Phases 2C, 2D and 2E** (see "Andrew's first
device report" under Phase 2). **Phase 2C (venue-list leak) is DONE locally, 2026-10-08 — not yet
committed or deployed** (Andrew's call); handoff `docs/native-app-store-plan_PHASE_2C_HANDOFF.md`.
2D or 2E is next (either order). Each finished phase writes `docs/native-app-store-plan_PHASE_<N>_HANDOFF.md` and updates
this line.

**Goal:** one "Hightop Challenge" app, live on the Apple App Store and Google Play. Players get the
games and partners can sign in to the Partner Dashboard. The `/info` home page links visitors to both
stores. The website keeps working exactly as it does today.

---

## 1. Plain-English summary for Andrew

**What we're building.** A thin "native shell" app built with **Capacitor** (made by the Ionic team,
free and open source). The shell is a real iPhone and Android app that opens
`https://play.hightopchallenge.com` inside itself. On top of the website it adds the phone features
a website can't have: push notifications, a QR scanner, Face ID passkey sign-in, the phone's share
sheet and haptics (vibration feedback). This approach avoids rewriting the app. A full rewrite in a
native language would take months, and every design tweak after that would need an app-store
review.

**Can you still tweak and update it like today? Yes, and this is the main reason for this design.**
The app loads the live website, so a change to colours, layout, copy, games or the dashboard goes
live in the app the moment Vercel deploys. That works the same as today, with no store review.
Only changes to the shell itself need a new store release, which Apple usually reviews in about
1–2 days and Google in hours to a few days:
- the app icon, name or splash screen;
- a new phone permission or capability (for example contacts or Bluetooth);
- a new native plugin;
- updates to Capacitor itself.

There are two real but small costs:
1. **Old app versions stay in use.** People don't update apps promptly. A web change that relies on a
   brand-new native feature must check that the feature is present before using it. Phase 3 builds
   this check, plus a "please update" screen for when an old version truly can't work.
2. **Apple's rules apply to the app.** Normal design and game changes are fine. Turning the app into
   something materially different without a review, or adding in-app selling of digital goods, is
   not.

**One app or two? One app.** Players are the audience that needs the "this is legit" signal, and
partners are a small group. One app means one listing, one review and one set of screenshots. A
partner-only app is also more likely to be rejected as "just a website". The app opens to the player
experience. A small "Venue partner? Sign in" link opens the Partner Dashboard. **Partner signup and
Stripe payment open in the phone's normal web browser, never inside the app.** This keeps us clear of
Apple's in-app-purchase rules. We can split partners into their own app later if they ever need one.

**Is this dangerous or risky? Not dangerous.** Nothing in this plan changes the live website's
behaviour until a phase ships, and every website change is reversible by redeploying. The honest
risks:

| Risk | How likely | What we do about it |
|---|---|---|
| Apple rejects the first submission as "just a website" (guideline 4.2) | Moderate. This is common for first submissions. | Push, QR scanner, passkeys, share and haptics, a native offline screen, and clear reviewer notes. Expect possibly one rejection-and-resubmit round. |
| Face ID passkeys don't work inside the app's web view | Real technical unknown | Phase 2 tests this first. The fallback is that username/PIN works in the app while passkeys get a native plugin. |
| Player account deletion (required by both stores) touches `auth.users`, which players and partners share | Data-safety risk if done carelessly | Its own phase, top model, the existing seven-table guard, and no shortcuts. |
| Prizes count as a "contest" under store rules (Apple 5.3, Google contests policy) | Low, if the paperwork is done | An Official Rules page, a "no purchase necessary" statement and an "Apple is not a sponsor" statement. Players never pay, which keeps it legal. |
| Payment rules differ by country and keep changing | Low, if US-only | Launch in the **United States only** at first, with no purchase buttons in the app. |

**Money.** Apple Developer Program: $99/year. Google Play: $25 one-time. D-U-N-S number: free.
Push notifications through Firebase Cloud Messaging: free. Extra Vercel/Supabase usage is roughly
nothing (estimate in Phase 5). You already have the Mac you need for Xcode.

**What needs you.** You'll need to do these yourself:
- the business and account paperwork (Phase 0);
- testing on your iPhone, and on the free Android Studio emulator for Android (Phase 2 onward);
- legal review of the privacy policy, terms and contest rules (Phase 1a). You will do this yourself
  once admitted to the New York bar;
- the final "Submit for review" clicks.

---

## 2. Decisions already made (Andrew, 2026-10-08). Do not re-ask.

1. **The publisher is a registered business** (LLC or corporation, enrolled as an *Organization* on
   both stores). The listing shows the company name. This also exempts us from Google's rule that
   new *personal* accounts need 12 testers for 14 days.
2. **One app for players and partners.** It is player-first. The Partner Dashboard is reached through
   a sign-in link inside the app. Partner **signup and every Stripe page open in the system browser**.
   This supersedes, for the native app only, the PWA rule "`/owner/*` and `/admin` stay an ordinary
   website": the *PWA* stays player-only, but the native app may show `/owner/*`. `/admin` is never
   reachable in the app; it opens in the system browser.
3. **First-version native features: all four.** Push notifications, an in-app QR scanner, Face ID
   passkey sign-in, and native share plus haptics.
4. **Test devices: Andrew's iPhone plus the free Android Studio emulator** (revised by Andrew
   2026-10-08: "we'll probably want to use an Android simulator since it's free" — no Android phone
   is bought for now). Use a **Google Play** emulator image (Android 16 / API 36, arm64), signed in
   to a Google account where a check needs one (passkeys). The emulator counts as a pass for Android.
   Known emulator blind spots, to note in each checklist: real GPS (the emulator's location is set
   by hand), real camera for the QR scanner (the emulator has a virtual scene), and low-end phone
   performance. If a store reviewer or a player reports an Android-only bug the emulator can't
   reproduce, revisit buying a phone. No outside testers are needed: the Organization account skips
   Google's 12-tester rule.
5. **Approach: Capacitor shell over the live site** (`server.url`). There is no React Native or Expo
   rewrite, and no bundled copy of the site. Recommended by Claude and accepted with this plan.
6. **Launch in the United States only** (confirmed by Andrew 2026-10-08). Other countries are a
   later decision and need a fresh check of the payment rules.
7. **Account deletion REMOVES the player's data** (Andrew, 2026-10-08). Their scores leave every
   leaderboard; nothing is anonymised to "Deleted player". See the Phase 1b traps.
8. **Retire the PWA "Add to Home Screen" prompt** once the store apps are live (Andrew, 2026-10-08).
9. **The website stays a first-class way to play and manage a venue on a phone, with no app
   required** (Andrew, 2026-10-08). The home page offers "Get the app" *and* "Play in your browser"
   for players, and "Partner sign in" for partners. No page may force or nag anyone into the app:
   banners are dismissible, and no feature that works on the web today becomes app-only.
10. **Legal review: Andrew**, once admitted to the New York bar, before the Phase 6 submission.
11. **App id `com.hightopchallenge.app`** (Claude's recommendation; Andrew asked what it is and
    raised no objection, 2026-10-08). It is permanent once published. Confirm once more before the
    first upload to either store, because that is the point of no return.

---

## 3. Facts discovered while writing this plan (verified 2026-10-08)

- **The domain split is already LIVE in production.** `curl -I https://hightopchallenge.com/venue/x`
  returns `308 → https://play.hightopchallenge.com/venue/x`. `SYSTEM_CONTEXT.md` §0 and the runbook
  still describe it as "flag-gated off"; they are out of date on this point. Consequence: the app
  loads `play.` for players, and `/owner/*` lives on the **apex**. The shell must allow navigation
  to both hosts.
- **There is no privacy policy, no terms page, no official contest rules and no player self-serve
  account deletion** anywhere in `app/` or `components/`. Both stores require a privacy policy URL
  and in-app account deletion; Google also wants a web deletion URL. These are hard blockers, so they
  are Phase 1.
- **Ads are first-party.** `components/ui/PopupAds.tsx`, `MobileAdhesionAd.tsx` and `AdBanner` serve
  rows from our own `advertisements` table, with no AdSense or AdMob. That matters because AdSense
  forbids ads inside app web views. No cross-app tracking means no App Tracking Transparency prompt
  is expected. Confirm in Phase 6 by checking `components/analytics/AnalyticsRuntime.tsx`.
- **There is no web push today.** In-app notifications exist: the `notifications` table, with
  `createNotification()` in `lib/notifications.ts`, called from `lib/challengeCampaigns.ts` and
  `app/api/cron/prize-expiry-warnings/route.ts`. **Trap:** the Bingo atomic-grading RPC
  (`20260914010000_bingo_atomic_grading.sql`) inserts notifications **in SQL**, bypassing
  `createNotification()`. A push hook placed only in TypeScript misses Bingo wins.
- **Passkeys:** `lib/webauthn.ts` uses RP ID `hightopchallenge.com` (`PROD_RP_ID_DEFAULT`),
  `@simplewebauthn/server` 13.x, with allowed origins from `WEBAUTHN_ALLOWED_ORIGINS`.
- **`proxy.ts` gates any extensionless path** (`/\.[a-z0-9]+$/` is the "static file" test, in
  `proxy.ts:55` and `lib/domainSplit.ts:99`). `/.well-known/apple-app-site-association` has **no
  extension**, so Phase 3 must explicitly let `/.well-known/*` through on **both** hosts. Never
  change the auth gate's default behaviour to do this; add a narrow allow.
- **The geofence makes App Review hard.** Apple's reviewers are not at a venue. God Mode
  (`accounts.god_mode`, server-authoritative in `/api/join/profile`) already solves this: a
  dedicated reviewer God Mode account plus a demo venue with "anytime" games (Speed Trivia, Bingo,
  Pick 'Em) gives them something to play. The hidden venue `venue-hightop-test` exists already.
- **The permanent join QR** (`https://play.hightopchallenge.com`, `lib/joinQr.ts`) is printed on
  merch. With Universal Links / App Links (Phase 3), scanning it with the phone camera **opens the
  app if installed** and the website if not. The URL is never changed.
- **Capacitor and the existing PWA rules:** a Capacitor app has **no service worker** (that rule
  stays), and `app/manifest.ts` is unaffected. Inside the native app, the PWA "Add to Home Screen"
  prompt must be hidden (Phase 3).
- **No third-party social login** (we use username/PIN/passkey), so Apple's "must also offer Sign in
  with Apple" rule (4.8) does **not** apply. Do not add Google or Facebook login without revisiting
  this.

---

## 4. Phases

Model rule (Andrew): **never more capable than Opus 5.5.** Models: `claude-opus-5-5`,
`claude-sonnet-5-5`, `claude-haiku-4-5-20251001`. "Effort" is the Claude Code reasoning level
(low / medium / high / xhigh / max).

| Phase | What | Who / model | Effort | Rough duration |
|---|---|---|---|---|
| 0 | Business, D-U-N-S, Apple and Google developer accounts, tools installed | Andrew (Sonnet 5.5 only to answer questions) | low | 1–3 weeks of waiting, ~2 h of work |
| 1a | Privacy Policy, Terms, Official Contest Rules, Support pages | Sonnet 5.5 | medium | 1 session |
| 1b | Player self-serve account deletion (in-app + web URL) | **Opus 5.5** | **high** | 1–2 sessions |
| 2 | Native shell spike on iPhone + Android phone (prove the risky parts) | **Opus 5.5** | **xhigh** | 1–2 sessions + Andrew's iPhone test |
| 2C | Venue-list leak fix (website bug found in Andrew's device test) | **Opus 5.5** | medium | 1 session |
| 2D | App fits the screen: safe areas, venue-home gap, smaller logos | **Opus 5.5** | high | 1 session + Andrew's iPhone |
| 2E | App front door (guests → games, partners → dashboard), no `/info`, false-offline fix | **Opus 5.5** | high | 1–2 sessions + Andrew's iPhone |
| 3 | Production shell: icons, offline screen, native detection, partner/billing link-outs, Universal Links, minimum-version gate | **Opus 5.5** | high | 2 sessions |
| 4a | Native share + haptics | Sonnet 5.5 | medium | 1 session |
| 4b | In-app QR scanner | Sonnet 5.5 | high | 1 session |
| 4c | Face ID passkeys in the app (based on the Phase 2 result) | **Opus 5.5** | **xhigh** | 1–2 sessions |
| 5 | Push notifications (device registry, sending, preferences) | **Opus 5.5** | high | 2 sessions |
| 6 | Store listings, privacy labels, reviewer account, TestFlight/internal test, submit | Sonnet 5.5 (copy) + Andrew (clicks) | medium | 1 session + review wait |
| 7 | App Store / Google Play badges on `/info`, Smart App Banner, `/app` redirect link | Sonnet 5.5 | medium | 1 session |
| 8 | Release process doc + first native update dry run | Haiku 4.5 | low | short |

Phases 0 and 1 run in parallel; Phase 0 is mostly waiting on paperwork. Phase 2 can start once
Xcode is installed. Free Apple provisioning can put a test build on Andrew's own iPhone before the
paid account is approved. Phases 4a/4b/4c/5 can run in any order after Phase 3. Phase 6 needs
everything before it. Phase 7 needs live store URLs, so it starts after approval. The badges can
be built behind a flag earlier.

---

### Phase 0 — Accounts and tools (Andrew; no code)

**Goal:** everything an agent cannot do for you.

1. **Confirm the legal business** (LLC or corporation) and its exact legal name, address and phone.
   The store shows this name.
2. **Get a D-U-N-S number** for the business: free through Apple's D-U-N-S lookup page, and it can
   take up to ~2 weeks. Apple and Google both require it for Organization accounts.
3. **Apple Developer Program, as an Organization:** $99/year. You need a business website on our
   domain (`hightopchallenge.com/info` works) and a work email on the domain is preferred. Apple may
   phone to verify.
4. **Google Play Console, as an Organization:** $25 one-time. It includes identity verification, and
   the D-U-N-S number is needed here too.
5. **Install Xcode** (Mac App Store, free, large) and **Android Studio** (free). Sign into Xcode with
   your Apple ID.
6. **Create a Firebase project** (free) named "Hightop Challenge". It is used for push in Phase 5.
7. **Pick a support email** that the store listing will show, for example `support@hightopchallenge.com`.
8. ~~Buy a cheap Android phone~~ — **dropped 2026-10-08 (Andrew): Android testing uses the Android
   Studio emulator** (§2 item 4). Phase 2 Part A creates the emulator.
9. **Decide the app's display name** (default "Hightop Challenge") and confirm nobody else has it in
   either store (search both).

**Done when:** both developer accounts are approved, Xcode and Android Studio open, and the Firebase
project exists. No handoff file is needed for this phase; record the details below in §7 instead.

---

### Phase 1a — Legal and support pages (Sonnet 5.5, medium)

**Goal:** the public pages both stores require. These ship to the live website and are useful even
without an app.

- New marketing pages on the **apex**, like `/info`, `/faqs` and `/advertise`: `/privacy`, `/terms`,
  `/rules` (Official Contest Rules), `/support`. Add each to the apex "marketing" list in
  `lib/domainSplit.ts` (`classifyPage`) so `play.` redirects them to the apex. Add them to
  `app/sitemap.ts`. Link them from the `/info` footer, the player account drawer and the Partner
  Dashboard menu.
- The privacy policy must truthfully list what we collect:
  - username and PIN hash;
  - passkeys;
  - **precise location** (geofence check);
  - venue membership and game activity;
  - prize coupons;
  - first-party analytics;
  - partner email, address, and billing through Stripe;
  - push tokens (Phase 5);
  - camera use, for the QR scanner only, with nothing stored.

  Also list the processors: Supabase, Vercel, Stripe, Google Maps, Resend, Anthropic (question
  generation, not user data, so verify), Square/Clover (partners who connect a POS), and Firebase.
  **Inventory this from the code, not from memory.**
- The Official Rules must say: free to play, no purchase necessary; prizes are provided by the
  participating venue; eligibility (age, US); how winners are chosen; and **"Apple is not a sponsor
  of, and is not involved in, any contest or sweepstakes."** That last sentence is required by
  Apple 5.3.3.
- Copy is drafted by Claude and **reviewed by Andrew (NY bar) before the app is submitted.** Put a
  visible "Last updated" date on each page. Players are in many states, so flag sections that
  state law drives (California privacy rights, contest and sweepstakes rules in states like New York
  and Florida) for Andrew's attention.
- Text-size floor and navigation rules apply (`ExitBackButton` → `marketingHref("/info")`).

**Tests:** extend the domain-split tests for the new marketing paths, then run
`npm run test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`.

---

### Phase 1b — Player self-serve account deletion (Opus 5.5, high)

**Goal:** a player can delete their own account from inside the app (Apple 5.1.1(v), Google Play
policy). There must also be a public web page explaining how, which Google requires as a URL.

**This is the most dangerous phase in the plan. Read the `auth.users` standing prohibition in
`CLAUDE.md` first.**

- Add a "Delete my account" control in the player account drawer (near, but not adjacent to,
  `SignOutButton`) with a typed confirmation. It calls a new authenticated route bound to the
  signed session through `resolveRequestUserId()`, so a forged id gets 403.
- Delete **only the caller's own** rows. First map every table keyed to `accounts` / `users` /
  `auth_id`, using `tests/lib.auth-users-fk-guard.test.ts` as the starting map. **Andrew decided:
  remove, don't anonymise.** The player's scores, picks, cards and submissions are deleted, and venue
  leaderboards shift accordingly. Delete the `auth.users` row **only after** every consumer is
  handled, and only for the caller's own `auth_id`.
- **Traps to check before deleting (raise with Andrew if they apply):**
  - **Winner quota rows:** deleting the player's `challenge_cycle_winners` row for a *current* cycle
    frees a slot that `award_cycle_winner` counts, so one extra person could win that cycle's
    prize. Either leave past and current-cycle winner rows with the user link cleared, or accept
    the extra winner. Ask Andrew.
  - **Money ledger:** `pos_reward_applications` (Square gift cards) is a financial record that
    partners may need for their books. Recommend keeping the row with every personal identifier
    removed. Ask Andrew; this is the one place "remove" may need an exception.
  - **Scores already settled into a finished reward** (an NFL Pick 'Em season winner, a Live Trivia
    winner) must not re-run winner resolution after the player's rows are gone.
- Prefer one Postgres function (a new migration that grants `service_role`; follow
  `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`) so the deletion is all-or-nothing.
  **`supabase db push` needs Andrew's explicit go-ahead.**
- Unredeemed prizes are lost on deletion. Say so in the confirmation copy.
- Partners: deleting a *partner* account involves Stripe and is not self-serve here. The
  `/support` page says "email us" for partner account closure. That is acceptable to Apple for a
  business account; confirm in Phase 6 review notes.
- Add a public `/delete-account` page explaining the steps and the support email, for Google's
  form.

**Tests:** route tests for forged id → 403, the happy path, and partial failure → nothing deleted.
Re-run `npm run test` (the FK guard), `npm run test:god-mode-join`, and the full checks.

---

### Phase 2 — Native shell spike (Opus 5.5, xhigh)

**Goal:** prove the risky parts on Andrew's real iPhone and on the Android emulator **before**
building the polished shell. Whatever is learned goes in the handoff. Some spike code may be thrown
away.

**Split into two parts (Andrew, 2026-10-08)** so the spike doesn't sit idle while Apple processes
the D-U-N-S number and the paid developer account:

- **Part A — now.** Needs only Xcode (free "Personal Team" provisioning puts a build on Andrew's own
  iPhone) and the Android emulator. Covers: the setup below; item 1's *kill-and-relaunch* half;
  items 2, 3, 4, 6, 7 and 8; and a look at the menu → "Delete my account" screen (typing DELETE with
  the native keyboard, never pressing the button on a real account) and the legal pages inside the
  app. Handoff: `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`.
- **Part B — after the paid Apple Developer account is approved.** Covers item 5 (passkeys, iOS and
  Android) and item 1's *7+ days* half. Why it must wait: a free Personal Team **cannot** use the
  Associated Domains entitlement that passkeys need, and a free-provisioned build **expires after 7
  days**, which would end the 7-day test early. Android passkeys sit in Part B too because both
  platforms need `/.well-known/*` files served from the live site (a narrow `proxy.ts` allow), so
  one web change serves both. Handoff: `docs/native-app-store-plan_PHASE_2B_HANDOFF.md`.

Setup:
- Create a separate folder **`native/`** with its own `package.json`, the current Capacitor major
  (check the version at start), and `@capacitor/ios` + `@capacitor/android`. It must not touch the
  Next.js build, `tsc`, lint or Vercel; check that `vercel build` ignores it and add it to
  `.vercelignore` if needed. Set `server.url = https://play.hightopchallenge.com` and
  `server.allowNavigation = ["play.hightopchallenge.com", "hightopchallenge.com"]`. `webDir` is a
  tiny bundled offline page.
- App id: **`com.hightopchallenge.app`** (permanent once published, so confirm with Andrew).
- Append a user-agent token, for example `HightopChallengeApp/<version> (ios|android)`, so the server
  and the web code can tell they're inside the app.

Prove each item, recording pass or fail:
1. Player login (username/PIN) survives a full app kill and relaunch, and still works after 7+ days.
   That checks WKWebView storage purging; if it fails, test WKAppBoundDomains.
2. Geolocation: one clean permission prompt, not a double app-then-website prompt. If doubled, route
   through `@capacitor/geolocation`, without changing God Mode's server-authoritative path
   (`npm run test:god-mode-join`).
3. Partner flow: `play.` → apex `/owner/login` → dashboard, staying inside the app. The owner cookie
   survives across hosts (`.hightopchallenge.com` cookie domain). The Capacitor bridge is present on
   the apex page too.
4. Stripe Checkout / billing portal and `/admin` open in the **system browser**, not the web view.
5. **Passkeys:** with an Associated Domains `webcredentials:hightopchallenge.com` entitlement and an
   `apple-app-site-association` file, does the existing web passkey flow work in WKWebView? On
   Android, check the WebView WebAuthn support (androidx.webkit `WebSettingsCompat` web
   authentication) plus `/.well-known/assetlinks.json`. If either fails, prototype a native passkey
   plugin. Then the server must accept the native origin: iOS reports `https://hightopchallenge.com`,
   while Android reports `android:apk-key-hash:<hash>`, which must be added to
   `WEBAUTHN_ALLOWED_ORIGINS`.
6. Bingo landscape fullscreen, the notch/safe area and the status bar, compared against
   `docs/bingo-fullscreen-pwa-device-checklist.md`.
7. Android hardware back button: it should behave like `ExitBackButton`/history, not quit the app.
8. Realtime (Supabase channels) reconnects after the app is backgrounded for 5 minutes.

**Done when:** every item has a recorded result and the handoff names the approach Phase 3 uses
for each one.

---

### Andrew's first device report (2026-10-08) and the fix phases it created

Andrew ran the Part A test app on his iPhone and reported seven things. The first agent to start
2C, 2D or 2E copies this list into `docs/native-app-store-plan_PHASE_2A_HANDOFF.md` §9.

| # | What Andrew saw | Cause (what was checked) | Fixed in |
|---|---|---|---|
| R1 | On the iPhone, everything sits too high. The sign-in logo, the venue-home menu and alerts buttons, and the Back buttons are cut off under the status bar, so Back can't be tapped. | iOS draws the web page under the status bar (`contentInset: "never"` in `native/capacitor.config.json` + `viewportFit: "cover"` in `app/layout.tsx`). Some screens add `env(safe-area-inset-top)` padding and some don't. The venue-home header (`components/venue/VenueHubHeaderBar.tsx`) *does* add it but is still cut off, so on the real phone the inset may be read as 0. Not yet diagnosed on the device; the simulator looked fine. | **2D** |
| R2 | Big gap between the game buttons and the Games / Leaderboard / Rewards bar; the "Next Live Trivia Showdown in…" box is pushed far down. | The venue home leaves a fixed-height gap for its pinned header (`components/venue/VenueHubClient.tsx`, `h-[calc(max(env(safe-area-inset-top),0px)+8rem)]`) instead of measuring the header. A guessed height is wrong whenever the header's real height differs. | **2D** |
| R3 | Signed in as **Rick** (not Andrew), all venues show, wherever he is. | **Working as designed.** Production `accounts` has `god_mode = true` for exactly three accounts: `Andrew`, `marc` and **`Rick`** (checked 2026-10-08). God Mode sees every venue. To test as a normal player, use a fresh account. If Rick should be a normal player, turn God Mode off for him in the admin. Andrew to decide; nothing to build. | none |
| R4 | A **new** player briefly sees every venue behind the "share your location" question. After they allow location, only the nearby ones remain. | **Real bug, on the website too, not only the app.** In `components/join/JoinFlow.tsx`, sign-out (`handleSignedOut`) and going back to the sign-in choice (`handleBackToAuthMethodSelection`) reset `venueListBuiltRef` but **not the `venueList` state**. The previous account's God Mode list (Rick's) stays on screen while `buildVenueListAfterAuth` waits for the new player's location. The deep-link path also fills `venueList` with every venue (`setVenueList(venues)` before the geofence check). Only phones where a God Mode account signed out are affected, but a non-God Mode player must never see an out-of-range venue. | **2C** |
| R5 | `/info` shouldn't be part of the app. The app should send guests to the games and partners to the dashboard. | A design change: today every "home" control points at `/info` (`marketingHref("/info")` in `LegalPage`, `app/owner/login`, `JoinFlow`, `SignupShell`, `SignupWizard`, `DeleteAccountPanel`, `app/owner/billing/setup`). | **2E** |
| R6 | Back from a legal page shows "No connection… check your connection" while the internet is fine. "Try again" then goes to the player sign-in. | Back on legal pages goes to `https://hightopchallenge.com/info` (domain split is live). Most likely cause: `useExitNavigation` calls `history.back()` and then, 150 ms later, its fallback navigation. The cancelled first navigation is reported as a failed load, and the shell shows `server.errorPath`. "Try again" in `native/www/offline.html` reloads the app's start URL, not the page that failed. To confirm on the device. | **2E** |
| R7 | The app still works with Wi-Fi off. | Expected: the phone switched to mobile data. There is no offline caching (no service worker, by rule). To test the real offline screen, use **Airplane Mode**. | 2E re-tests |

All three phases change only the shell and the web pages' layout and routing. No database changes,
no new env vars, no new cron jobs, and no new recurring cost (2E adds no request; see its cost
note).

---

### Phase 2C — Venue-list leak fix (Opus 5.5, medium) — ships to the website now

**Status: built and tested 2026-10-08, not yet committed/deployed. As-built:
`docs/native-app-store-plan_PHASE_2C_HANDOFF.md`** (generation-tagged list in `lib/joinVenueList.ts`).

**Goal:** a player who isn't God Mode never sees a venue outside their range, not even for a
moment, and not after a God Mode account used the same phone. This is a website bug, so it ships
on its own without waiting for the app.

- In `components/join/JoinFlow.tsx`, **clear `venueList` (set it to `[]`) everywhere
  `venueListBuiltRef` is reset** (`handleSignedOut`, `handleBackToAuthMethodSelection`, and any
  other reset), **and** at the start of `buildVenueListAfterAuth` before it awaits anything. While
  the location check runs, show the "Finding venues near you…" loading state, never a list.
- Deep-link path (`setVenueList(venues)` around line 946): stop putting every venue into
  `venueList`. Use a local variable for that path's own single-venue check, or clear the list before
  the venue-list panel can show.
- Belt and braces: the venue-list panel renders a list only when it was built **for the current
  sign-in**. For example, keep a build id or owner (account id + God Mode) next to the list and
  render nothing when it doesn't match.
- Don't touch God Mode's server path (`/api/join/profile`), and don't add any god-mode lookup before
  sign-in (CLAUDE.md: that would let anyone find out which usernames exist).

**Tests:** a new test that signs in as God Mode, signs out, then signs up a normal player, and checks
that the venue list is empty until location resolves and then shows only in-range venues. Also the
deep-link case. Run `npm run test:god-mode-join`, `npm run test`, `npx tsc --noEmit`,
`npm run lint` and `npm run build`. Andrew's device check: sign out of Rick, create a new player, and
confirm that no venue shows behind the location question.

---

### Phase 2D — Fit the screen inside the app: safe areas, header gap, smaller logos (Opus 5.5, high)

**Goal:** inside the iPhone app, nothing sits under the status bar or the notch / Dynamic Island,
every Back and menu button can be tapped, and the venue home has no dead gap. The website must
look the same as today, or better.

**Needs Andrew's iPhone plugged into the Mac** (Safari → Develop menu → the phone → the app's page;
`webContentsDebuggingEnabled` is already on in the debug build).

1. **Diagnose first, on the real phone.** On the sign-in page, the venue home and a legal page, read
   the real value of `env(safe-area-inset-top)`. For example, set a test element's `padding-top`
   to it and read `getComputedStyle`. Also read `window.scrollY` and the header's
   `getBoundingClientRect().top`. Also say what Andrew's iPhone model is. This tells which of the two
   problems we have:
   - **(a) the inset reads as 0** inside the app → fix the shell (step 2);
   - **(b) the inset is right, but some screens ignore it** → fix the web pages (step 3).
   It may be both.
2. **Shell option (try first; fixes every screen at once).** Make the iPhone app start the page
   *below* the status bar, the way Android already does. Try either `ios.contentInset: "always"`, or
   the `@capacitor/status-bar` plugin with the web view not drawn under the bar, then set the bar's
   colour to the site's dark navy `#020617`. Check that it doesn't break the fixed headers, the
   bottom bars, the keyboard, or **Bingo landscape fullscreen**
   (`docs/bingo-fullscreen-pwa-device-checklist.md`). A shell change needs `npx cap sync ios`
   and a rebuild on the phone, but **no website deploy**. If it causes layout side effects, fall
   back to step 3.
3. **Web option.** Audit every top-of-screen element for safe-area padding. Known: the join /
   sign-in screens (`components/join/JoinFlow.tsx`) and the `/owner/login` page. Check also
   `ExitBackButton`'s host shells (`PageShell`, `OwnerShell` / `OwnerAppBar`, `AppBar`,
   `LegalPage`). Use one shared Tailwind pattern (`pt-[max(env(safe-area-inset-top),Xpx)]`) rather
   than per-page guesses. Add a contract test that every host shell carries it.
4. **Venue-home gap (R2):** replace the fixed `8rem` spacer in `VenueHubClient.tsx` with the
   header's **measured** height (a `ResizeObserver` on `VenueHubHeaderBar` writing a CSS variable),
   or make the header `sticky` so the page flows under it with no spacer. Inline `style` isn't allowed
   outside the TV display, so set the CSS variable through a ref (`element.style.setProperty`) or a
   Tailwind arbitrary value. Then the game buttons sit right under the Games / Leaderboard / Rewards
   bar, and the "Next Live Trivia Showdown" box sits right under the buttons. Check this on the
   **website too**: if the same gap shows in mobile Safari, this fixes it there as well.
5. **Smaller logos (Andrew asked):** shrink the logo on the **player sign-in** screen and on the
   **Partner Dashboard and partner sign-in** (`components/owner/OwnerAppBar.tsx`,
   `app/owner/login/page.tsx`) so they fit neatly. Roughly 15–25% smaller; show Andrew before/after
   screenshots. Use the existing `/brand/web/*.webp` files, so no new artwork is needed.
6. Android: the page already starts below the status bar there. Check that nothing regressed, and
   colour the white status bar dark if step 2 adds the status-bar plugin (Phase 3 would otherwise do
   it).

**Tests:** `npm run test:pwa-contract` (landscape CSS must not leak into portrait), the new
safe-area contract test, `npm run test`, typecheck, lint and build. Andrew's device check: the
sign-in logo, the menu and alerts buttons and every Back button are fully visible and tappable on
the sign-in page, the venue home, a game, a legal page and the Partner Dashboard; and the venue home
has no gap. Also confirm the website in mobile Safari looks unchanged or better.

---

### Phase 2E — App front door: guests to games, partners to the dashboard, no `/info` (Opus 5.5, high)

**Goal (R5, R6, R7):** inside the app, there is no marketing page. The app opens on a front door
that sends a **bar guest** to the player sign-in and games, and a **venue partner** to the Partner
Dashboard. Back never leads to `/info` or to a false "No connection" screen. The website, including
`hightopchallenge.com/info`, is unchanged.

**How other apps do it, and the recommendation (Andrew asked).** Big two-sided products usually ship
**two apps**: Uber and Uber Driver, DoorDash and DoorDash Merchant, Yelp and Yelp for Business,
OpenTable and OpenTable for Restaurants. They do this because each side is a large audience with its
own daily workflow. Smaller products, and ones whose business side is just "manage your account",
usually ship **one app with two sign-in doors**. **Recommendation: keep one app (§2 item 2), with a
clear front door, and revisit a separate "Hightop Partner" app only if partners grow into the
hundreds and ask for one.** Reasons:
- Apple rejects thin "just a website" apps (guideline 4.2). A partner-only app would be mostly a
  dashboard and is the likelier one to be rejected. It would also be judged as a near-copy of the
  player app (4.3).
- Two apps means two listings, two reviews, two sets of screenshots and privacy labels, and twice the
  release work, all for a small partner group.
- Partners pay on the web anyway (Stripe in the system browser), so a partner app adds little.
- Going to two apps later is easy (a second shell over the same site). Merging two apps into one
  later is hard.

**Build:**
1. **`lib/nativeApp.ts`** (pulled forward from Phase 3): `isNativeApp()` reads the
   `HightopChallengeApp/<ver>` user-agent token or `window.Capacitor`. It is the only reader, pinned
   by a contract test. Phase 3 then adds `nativePlatform()`, `nativeAppVersion()` and
   `hasNativeCapability()` to this file, not a second helper.
2. **One "home" for the app.** Add one helper, for example `homeHref()` in `lib/domainSplit.ts`
   beside `marketingHref`: on the website it returns `marketingHref("/info")` (today's behaviour,
   CLAUDE.md rule unchanged), and **in the app** it returns the app front door. Switch every
   current `marketingHref("/info")` "home" control to it (list in R5). A contract test forbids a bare
   `marketingHref("/info")` in those files. CLAUDE.md's "`/info` IS the home page" rule gets a
   one-line note: *on the website*.
3. **Front door = the player sign-in screen** (`play.` `/`, `JoinFlow`'s
   `auth-method-selection`), which guests already see first, plus a plain **"Venue partner? Sign
   in"** link at the bottom that goes to `/owner/login`. In the app, the `/owner/login` Back goes to
   that same front door.
4. **Remember the side.** When a partner signs in inside the app, remember "partner" on the phone
   (localStorage, a convenience only, never trusted for access). On the next launch, if the partner's
   session is still valid, open straight on `/owner/dashboard`. Otherwise show the front door. A
   partner who signs out goes back to the front door. Do it in the web page, not `proxy.ts` (never
   change its default gate behaviour).
5. **Marketing pages leave the app.** In the app, `/info`, `/faqs`, `/advertise` and any other
   apex marketing page open in the system browser (same link-out mechanism Phase 3 uses for Stripe
   and `/admin`). Legal pages (`/privacy`, `/terms`, `/rules`, `/support`, `/delete-account`) stay
   **inside** the app, because Apple wants them reachable in the app.
6. **R6: the false "No connection" screen.** On the phone, reproduce Back from a legal page with the
   Safari inspector open. Check whether the cancelled `history.back()` plus the fallback navigation is
   what trips `server.errorPath`. Fix both ends:
   - web: with item 2 in place, Back in the app goes to the app home by one navigation, not two
     racing ones;
   - shell: show the offline page only for real network errors (ignore "navigation cancelled",
     iOS `NSURLErrorCancelled` −999 and the Android equivalent), and make "Try again" in
     `native/www/offline.html` reload **the page that failed** (pass its URL in), not the start URL.

   Phase 3's "Offline screen" bullet is then mostly done; Phase 3 only polishes its look.
7. **R7:** re-test the offline screen in **Airplane Mode** on the iPhone and the emulator, and record
   it.

**Cost note:** no new requests; item 4 reuses the dashboard's existing single first-load call
(`GET /api/owner/dashboard`).

**Tests:** contract tests for `isNativeApp()`'s single-reader rule and for `homeHref()`; a unit test
for the front-door choice (no stored side → front door; "partner" + valid session → dashboard;
"partner" + expired session → front door); `npm run test:god-mode-join` (JoinFlow is touched); and
the full checks. Andrew's device check: the app opens on the front door; the partner link works;
relaunching as a signed-in partner opens the dashboard; no in-app control reaches `/info`; Back from
each legal page works with no "No connection"; Airplane Mode shows the offline screen and "Try
again" returns to the same page.

**Order:** 2C first (it's a live website bug and independent). 2D and 2E can then run in either
order; both need Andrew's iPhone for the final check. Phase 3 follows and skips whatever 2E already
built.

---

### Phase 3 — Production shell (Opus 5.5, high)

**Goal:** the app you would actually ship, minus the Phase 4/5 features.

- **One native-detection helper**, for example `lib/nativeApp.ts`: `isNativeApp()`,
  `nativePlatform()`, `nativeAppVersion()`, and `hasNativeCapability(name)`. It reads the
  user-agent token or `window.Capacitor`. It is the **only** reader, and a contract test pins this,
  the same pattern as the flag readers. The web side may add `@capacitor/core` plus plugin JS
  packages, **lazy-loaded only when `isNativeApp()`**, so website visitors download nothing extra.
  Test it with `scripts/measure-owner-load.cjs`.
- **Link-out rules:** inside the app, the following open in the system browser:
  - partner signup (`/owner/signup`, `/owner/register`);
  - every Stripe URL;
  - `/owner/billing/*` payment actions;
  - `/admin`;
  - any non-Hightop link.

  Use Capacitor's Browser or App plugin. The in-app partner menu shows billing status but **never a
  "Subscribe" / "Pay" button**; it says "Manage billing on the web" and opens the browser. Pin this
  with a contract test.
- **Hide the PWA install prompt** inside the app (`isInstallPromptEnabled()` callers also check
  `!isNativeApp()`).
- **Universal Links (iOS) / App Links (Android)** for `play.hightopchallenge.com`, so the printed QR
  and shared links open the app. Serve `/.well-known/apple-app-site-association` (with no extension,
  `Content-Type: application/json`) and `/.well-known/assetlinks.json` from Next route handlers on
  **both** hosts. Add a narrow `/.well-known/*` pass-through in `proxy.ts` and `lib/domainSplit.ts`,
  with tests in `tests/proxy.behavior.test.ts`.
- **Offline screen:** a bundled native "No connection, tap to retry" page instead of a blank web
  view.
- **Minimum-version gate:** a public `GET /api/app/config` returning
  `{ minSupportedVersion, latestVersion }` from server env vars (no redeploy needed). The shell shows
  a "Please update Hightop Challenge" screen below the minimum. Cost: one tiny request per cold
  launch. Cache it with `s-maxage` at the CDN so it costs nearly nothing.
- **Icons and splash** generated from the brand art under a **new file name** (the `/brand/web/`
  files are immutable-cached), using `@capacitor/assets`. Status bar colour matches the theme.
- **Android back button** wired to the same behaviour as `useExitNavigation`, without duplicating
  that logic in the shell; call into the page.
- Permissions strings (`Info.plist`): location, camera, and Face ID usage descriptions, written in
  plain friendly copy.

**Tests:** contract tests for the helper's single-reader rule and the link-out rules; the proxy
`.well-known` tests; `npm run test:pwa-contract`; and the full checks. Andrew: device checklist
`docs/native-app-device-checklist.md`, created in this phase.

---

### Phase 4a — Native share + haptics (Sonnet 5.5, medium)

- "Invite friends" and "share my win" use `@capacitor/share` in the app and `navigator.share` or
  copy-link on the web. Haptics (`@capacitor/haptics`) fire on a correct answer, a bingo or a prize
  won. They respect Reduce Motion and are capability-checked through `hasNativeCapability`.
- No new server work.

### Phase 4b — In-app QR scanner (Sonnet 5.5, high)

- A "Scan QR" button on the join and venue-list screens, **app only**. Use a maintained Capacitor
  barcode plugin; pick one at implementation time and check its maintenance status.
- **Only accept our own URLs** (`play.hightopchallenge.com` / `hightopchallenge.com`). Anything else
  shows "That's not a Hightop code." Never navigate to an arbitrary scanned URL.
- Camera permission is requested only on tap, never at launch.

### Phase 4c — Face ID passkeys in the app (Opus 5.5, xhigh)

- Implement whichever approach Phase 2 proved, either the web view's own WebAuthn or a native
  plugin. If native: add the Android origin to `WEBAUTHN_ALLOWED_ORIGINS` (via `vercel env add`,
  never `vercel env rm`/`pull`) and keep `lib/webauthn.ts` the single verifier.
- Re-run the cross-device matrix in `docs/PASSKEY_CROSS_DEVICE_MATRIX.md` and add app rows. A passkey
  made in the app must work on the website and the other way round, since both use the same RP ID.

---

### Phase 5 — Push notifications (Opus 5.5, high)

**Design (cost-conscious):**
- **Firebase Cloud Messaging for both platforms.** FCM delivers to iOS through an APNs auth key
  (`.p8`, created in the Apple Developer account). It is one free API.
- A new table `push_devices` (user id, venue id, platform, token, app version, created/last-seen,
  disabled). It needs a migration with an explicit `service_role` grant per
  `SECURE_TABLE_MIGRATION_CHECKLIST.md`, no browser access, and `tests/supabase-migration-grants-contract.test.ts`
  must pass. Registration and refresh go through an authenticated route bound to the session.
  Unregister on sign-out, wired into `performSignOut`, which is the only teardown path.
- **Hook point:** push is sent wherever an in-app notification is created. For the TypeScript paths,
  fan out from `createNotification()` in `lib/notifications.ts`. **Bingo wins are written by the
  atomic-grading SQL RPC**, so either have the Bingo caller send after the RPC succeeds, or add a
  small outbox sweep to an **existing** per-minute cron (`/api/cron/bingo-progress`). Do **not** add
  a new cron without asking Andrew (`vercel.json` boundary).
- **"Live game starting soon" at your venue:** add it to an existing scheduled path. The live-trivia
  crons already run every 5–15 minutes. One bounded query per run (games starting in the next window)
  → one batched FCM send per venue. Never one query per user.
- **Preferences:** a per-category on/off in the account drawer (game starting, prizes, results).
  Marketing pushes are **off unless the player opts in** (Apple 4.5.4). Ask for permission at a
  meaningful moment, after the first game, not at launch.
- Dead tokens returned by FCM get disabled immediately (no retry storms).

**Cost estimate to confirm in-phase:** FCM is $0. For 1,000 active players, 3 pushes/day ≈ 3,000
sends/day spread across a handful of batched calls per cron run: well under 1,000 extra function
invocations/day, and a few thousand small DB reads/writes per day. That is negligible at current
volume and stays small at 10×. Measure a baseline before and after, and report the difference.

---

### Phase 6 — Store listings and submission (Sonnet 5.5, medium + Andrew)

- **Reviewer access:** create a God Mode reviewer account (for example username `appreview`) and a
  demo venue with anytime games stocked. Put the credentials and these points in the App Review
  notes:
  - venues are location-based, and this account bypasses that;
  - the partner sign-in link and a demo partner login (to a hidden demo venue, never a real
    partner's);
  - which native features to try.
- **Apple:** App Privacy labels (from Phase 1a's inventory), the age-rating questionnaire (answer
  honestly; bar/alcohol references and contests may raise it), category (Games → Trivia, or
  Entertainment), screenshots at the sizes App Store Connect currently requires (check at the time),
  the support and privacy URLs, and **US-only availability**. TestFlight internal test first.
- **Google:** the Data safety form, the content rating questionnaire (IARC), declaration of the
  contests/prizes policy, phone screenshots and a feature graphic, US-only availability, the
  account-deletion URL (`/delete-account`). Internal testing track first, then production.
- Write the listing copy for **players** ("Play trivia, bingo and pick 'em at your local bar —
  compete for bragging rights and real prizes"), with one line for partners.
- Plan for possibly one rejection round; the handoff records any rejection text verbatim.

### Phase 7 — Home page links (Sonnet 5.5, medium)

- Official **App Store** and **Google Play** badges on `/info`, using each company's official badge
  artwork and following their usage rules (no custom-drawn badges). Show the right one first by
  device; on desktop, show both plus a QR code.
- An Apple Smart App Banner (`<meta name="apple-itunes-app" content="app-id=…">`) on `play.` pages.
  It shows only in iOS Safari, never inside the app. On Android, a small dismissible "Get the app"
  bar, hidden inside the app.
- A new short link **`/app`** that sends iPhones to the App Store, Android to Google Play, and
  desktops to `/info#app`. It is for future printed material. **The existing printed QR stays
  `play.hightopchallenge.com`**; it already opens the app through Universal Links.
- Store URLs come from env vars or one constants file, not scattered literals.
- **Retire the PWA install prompt** (decided). Remove the prompt UX and its flag reader in
  `lib/pwa.ts` / `components/bingo/SportsBingoHome.tsx`, and update `npm run test:pwa-contract`
  plus `docs/pwa-install-rollout-runbook.md`, marking it superseded. **Keep `app/manifest.ts` and the
  Apple meta tag:** they still give browser players fullscreen Bingo landscape and are harmless.
- **The browser path stays visible** (decided). `/info` shows the store badges *next to* a "Play in
  your browser" button (→ `gameHref("/")`) and the existing "Partner Login". The Smart App Banner
  and the Android "Get the app" bar are dismissible and stay dismissed (per-viewer `localStorage`,
  wrapped in try/catch). `/app` on desktop, or anywhere a store can't be detected, lands on `/info`
  with both choices, never a dead end.

### Phase 8 — Release process (Haiku 4.5, low)

- Write `docs/native-app-release-runbook.md`. It covers:
  - which changes are web-only (deploy as today) and which need a store build;
  - how to bump the version;
  - building and archiving in Xcode / Android Studio;
  - TestFlight and the internal track;
  - phased release;
  - raising `minSupportedVersion`.
- Do one dry-run native update, such as a trivial splash tweak, end to end.

---

## 5. Hard rules for every phase

- Everything in `CLAUDE.md` still applies: the `.env.local` append-only rule, migrations as new
  files only, `supabase db push` only with Andrew's go-ahead, no `middleware.ts`, no service worker,
  `vercel.json` untouched unless asked, the text-size floor, the navigation primitives, and no
  `any`.
- **Never** put a purchase or subscribe button for anything digital inside the app. Physical merch
  (the Join Merch store, currently look-only) is allowed under Apple's rules, but when it starts
  taking orders, re-check this.
- **Never** change the permanent join QR URL.
- The website must behave identically for non-app visitors after every phase. Native-only code is
  gated by `isNativeApp()` / `hasNativeCapability()`.
- Store signing keys (the iOS distribution certificate, the Android upload keystore, the APNs `.p8`)
  are **never committed** and never printed. Andrew keeps them in a password manager, and the
  handoff records only *where* they are. **Losing the Android upload key** is recoverable only
  through Google support, so use Play App Signing.

## 6. Open questions for Andrew

1. **App id `com.hightopchallenge.app`:** reconfirm before the first store upload (§2 item 11).

Answered 2026-10-08 and moved to §2: US-only, remove deleted accounts, retire the PWA prompt and
keep the browser path, Andrew does the legal review, Android testing on the emulator (no phone). Answered in
Phase 1b (2026-10-08): a deleted winner keeps the reward slot with the name blanked; the Square
gift-card ledger is kept, unlinked. Legal: New Jersey LLC, New Jersey governing law, no liability
dollar cap.

## 7. Account details (Andrew fills in during Phase 0; no secrets here)

- Legal business name: Hightop Challenge LLC (New Jersey) — `LEGAL_ENTITY_NAME` in `lib/legalInfo.ts`
- D-U-N-S number:
- Apple Team ID:
- Google Play developer account name:
- Firebase project id:
- Support email: support@hightopchallenge.com — `SUPPORT_EMAIL` in `lib/legalInfo.ts`
- Where the signing keys and APNs key are stored (location only):
