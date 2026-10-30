# Store Submission Pack — copy/paste answers for App Store Connect and Google Play Console

Written in Phase 6 of `docs/native-app-store-plan.md` (2026-10-23). Andrew pastes these into the two consoles.
Everything here is **players only** (plan §2 item 12): no partner line, no pricing. Facts come from
`app/privacy/page.tsx`, `lib/legalInfo.ts`, `native/ios/App/App/Info.plist`, the Android manifest and
`lib/analytics.ts` as of 2026-10-23. **Re-check anything marked VERIFY against the console on the day** (Apple and
Google change their forms). Andrew's legal review (plan §2 item 10) comes before pressing Submit.

**Reviewer setup updated 2026-10-25:** `appreview` exists, its supplied PIN works, and God Mode allows joining without
location. Select **Hightop Test Bar**, **1010 Pacific St, Brooklyn, NY 11238, USA** (`venue-hightop-test`, now visible).
Andrew chose to keep **iPhone + iPad** support. The PIN stays out of this document; paste the value supplied in chat
into the stores' private access forms. **Google Production update, 2026-10-25:** Andrew manually uploaded build 2,
resolved the shadowed-build-1 error, and reported **In review**. No agent upload/submission; no approval/live-store
verification yet. Apple submission remains unverified. Current handoff records exact build/key facts.

## 1. Listing basics

| Field | Value |
|---|---|
| App name | Hightop Challenge |
| Publisher | Hightop Challenge LLC (Organization account) |
| Bundle / package id | `com.hightopchallenge.app` (permanent once uploaded — reconfirm, plan §6 item 1) |
| Version / build | 1.0.0 / 1 (iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`; Android `versionName` / `versionCode`) |
| Availability | United States only |
| Price | Free, no in-app purchases |
| Apple category | Games → Trivia (alternative: Entertainment) |
| Google category | Games → Trivia |
| Support URL | https://hightopchallenge.com/support |
| Privacy policy URL | https://hightopchallenge.com/privacy |
| Terms / rules | https://hightopchallenge.com/terms · https://hightopchallenge.com/rules |
| Account deletion URL (Google) | https://hightopchallenge.com/delete-account |
| Marketing URL (Apple, optional) | https://hightopchallenge.com/info |
| Support email | support@hightopchallenge.com |

## 2. Listing copy (players only)

**Subtitle (Apple, ≤30):** Bar trivia, bingo & pick 'em
**Short description (Google, ≤80):** Play trivia, bingo and pick 'em at your local bar and win real prizes.

**Promotional text (Apple, ≤170):** Join your bar's leaderboard. Speed trivia, live trivia, bingo, pick 'em and more — compete with the people around you for bragging rights and real prizes.

**Full description (≤4000):**

> Hightop Challenge turns your night out into a game. Walk into a participating bar or restaurant, open the app, and compete with the people in the room.
>
> **Games**
> • Trivia — quick Speed Trivia any time, and Live Trivia nights hosted by the venue
> • Bingo — sports bingo that fills in as the game happens
> • Pick 'Em and NFL Pick 'Em — call the winners, climb the board
> • Fantasy and Category Blitz
>
> **Why you'll like it**
> • Every venue has its own leaderboard — your points at one bar don't affect another
> • Win real prizes from the bar: show your in-app coupon to staff and confirm redemption
> • Sign in with a username and PIN — no email or phone number needed
> • Scan the QR code on a table to jump straight to your bar
> • Share your wins with friends
> • Optional notifications for game starts, prizes and news from your bars — switch each kind on or off in the menu
>
> Games are free to play. No purchase is required to play or to win. Venues check that you are at the bar using your phone's location; the app uses it only to check, and does not store it.
>
> Hightop Challenge is for adults of legal age where you play. See the Official Rules in the app for details.

**Do not say:** anything about partners sending push messages ("send notifications to regulars" — partner messages, Phase 5.5, are still flag-off), pricing, subscriptions, "gambling", "betting", or "wager". Keywords (Apple, ≤100): `trivia,bingo,pick em,bar games,leaderboard,prizes,live trivia,sports bingo,fantasy,pub quiz`.

**What's new (1.0):** First release.

**Passkey update 2026-10-25:** Andrew verified passkey creation and Face ID sign-in in the iPhone app, plus use of
that passkey in iPhone Safari, after approved migration `20261025150000`. The shared listing remains username/PIN
only until Android's release signing association and end-to-end passkey checks are ready. Seasonal-game launch
flags are still separate; keep those features out of promises until their own release checks pass.

## 3. App Review notes (Apple) / access instructions (Google)

> Hightop Challenge is a venue-based game. Normally a player must be physically inside a participating bar, so we
> created a review account that can join any venue from anywhere.
>
> Sign-in: choose "Username / PIN" → username **`appreview`**, PIN **«paste the PIN Andrew supplied privately»**.
> After sign-in, pick **Hightop Test Bar** (1010 Pacific St, Brooklyn, NY 11238) from the venue list.
> Things to try: Speed Trivia (any time), Bingo, Pick 'Em; the menu (☰) → Notifications switches and → Delete my
> account (please do not delete this account); earned prize coupons appear on the Prizes screen; "Scan QR code" on the
> venue list uses the camera only to read a code.
> Location is requested only to check venue range; it is not stored. Camera only for the QR scanner. Push
> notifications are optional and asked for on a screen inside the app. The app is for players only: partners use our
> website. There is no purchase, subscription or payment of any kind in the app. Prizes are given by the venues
> for free play; nothing is bought to enter. Contest rules: https://hightopchallenge.com/rules

(Contact for review: Andrew's phone + support@hightopchallenge.com.)

**Apple-only native feature note (verified 2026-10-25):** on an iPhone, the menu's Set Up Passkey saves a passkey;
after signing out, Face ID / Touch ID signs the player back in. The same passkey works in iPhone Safari. Keep the
shared review account's username/PIN as the primary reviewer access; a reviewer's own Apple prompt is optional.

Setup verification: live sign-in and joining Hightop Test Bar without location both returned HTTP 200 on 2026-10-25;
the join issued a player session cookie. Speed Trivia's shared active catalog is available. No demo prize coupon was
seeded; do not promise one is waiting. Scheduled/live sports depend on actual availability and are not verified by
this account setup.

## 4. Apple App Privacy ("nutrition label")

Tracking: **No** (no ads network, no data shared with data brokers; ads are our own; no App Tracking Transparency
prompt is needed — `lib/analytics.ts` posts only to our own `/api/analytics/events`; Firebase Analytics must stay
unlinked, CLAUDE.md). Confirm no third-party SDK was added since 2026-10-23 before submitting.

Declare as **collected, linked to the user, not used for tracking** (conservative; location is discarded after the
check but declaring it is the safe reading — VERIFY with Andrew's legal review):

| Apple data type | Why (purpose) |
|---|---|
| Location → Precise Location | App functionality (venue range check) |
| Identifiers → User ID (username / account id) | App functionality |
| Identifiers → Device ID (push token, only if the player turns on notifications) | App functionality |
| User Content → Other User Content (answers, picks, bingo cards, lineups) | App functionality |
| Usage Data → Product Interaction (games opened, sessions) | Analytics, App functionality |
| Usage Data → Advertising Data (our own ad views/taps) | Third-party advertising: **No**; Analytics: Yes |
| Diagnostics → none | — |
| Other → IP address and device/browser type (server logs) | Analytics, security (declare under "Other Data" if the console offers no better type) |

Not collected: name, email, phone, address, contacts, photos/videos (story pictures stay on the phone), health,
financial info, purchases, browsing history, search history, sensitive info.

## 5. Apple age rating (answer honestly; this is the proposed set)

| Question | Answer |
|---|---|
| Cartoon / fantasy / realistic violence, sexual content, profanity, horror, mature themes | None |
| Alcohol, tobacco or drug references | **Infrequent / mild** — played at bars; the app sells and promotes no alcohol, but prizes can be "off your tab" |
| Simulated gambling | **None** (points have no cash value; no wagering) |
| Real-money gambling | No |
| Contests | **Yes** — free-to-enter prize contests (Official Rules linked) |
| Unrestricted web access | No (links to our own pages; marketing pages open in the system browser) |
| User-generated content / chat | Usernames only and moderated answers; no chat |
| Medical / health | None |

Expected rating: **12+** or **17+ if the alcohol or contest answers push it** — accept whatever the console computes; do not
under-answer to get a lower number. VERIFY the exact new-style questionnaire.

## 6. Google Play forms

**Content rating (IARC):** category *Game → Trivia*; violence none; sexuality none; language none; controlled
substance: **references to alcohol — mild** (venue setting); gambling: **none (no simulated gambling, no real money)**;
user interaction: usernames visible to other players at the same venue, no chat, shares location? **No** (location is
not shared with other users); digital purchases: No.

**Ads:** "Contains ads" = **Yes** (first-party venue ads).

**Data safety** (all data encrypted in transit: yes; deletion: yes — in-app + https://hightopchallenge.com/delete-account):

| Data type | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Approximate + precise location | Yes | No | App functionality | Required to join a normal venue |
| User IDs (username) | Yes | No | App functionality, analytics | Required |
| Device or other IDs (push token) | Yes | Yes — with Google Firebase Cloud Messaging / Apple, as a service provider (declare as "shared" only if the console treats service-provider transfer as sharing; VERIFY) | App functionality | Optional |
| App interactions | Yes | No | Analytics, app functionality | Required |
| Other in-app content (answers, picks) | Yes | No | App functionality | Required |
| Photos/camera | **No** (scanner reads, never stores) | | | |
| Financial / personal info / contacts | No | | | |

**Contests / prizes policy declaration:** free to enter, no purchase necessary, official rules at /rules, venues award prizes;
no cash gambling. **Target audience:** 18+ (adults at bars) — the privacy policy says under-13 not directed; choose
"18 and over" if the console allows (VERIFY: choosing a child-inclusive audience triggers Families policy).
**Permissions declaration:** location (foreground only, venue check), camera (QR scan), notifications (optional). No
background location. **Government/news/health/finance apps:** none. **App access:** provide the same review account.

**Notification permission checked 2026-10-25:** the cached debug merged app manifest at
`~/Library/Caches/hightop-native/android/app/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml`
declares `android.permission.POST_NOTIFICATIONS`; the merger report attributes it to
`@capacitor-firebase/messaging`. Recheck the final signed release AAB; no release AAB was built in this setup.

**Approximate-location handling verified 2026-10-25 for manual Console entry:** select **Collected**, leave **Shared**
unchecked; ephemeral processing **No**; **Data collection is required**. Raw coordinates are discarded, but the app
retains venue-derived ZIP/city/state in `user_geographic_data` (JoinFlow's `syncUserGeographicData`,
`app/api/analytics/events/route.ts`) and presence-check results (`lib/venuePresence.ts`). Therefore the location
category is not entirely memory-only. Ordinary venue play requires location; denying OS permission does not make
required core-function collection optional. No individual location transfer to an independent third party was found;
service-provider processing and fully anonymized aggregates are exempt from sharing under Google's definitions:
https://support.google.com/googleplay/android-developer/answer/10787469?hl=en.
This clarification concerns approximate location; do not automatically copy the ephemeral answer to other data types.

## 7. Screenshots

**Google Play feature graphic ready (2026-10-25):** `assets/app-store/google-play-feature-graphic-v3.png`.
1024×500, opaque RGB PNG, **310,236 bytes**, visually checked. Existing Hightop logo + Nunito, dark navy/cyan,
“It's game time.” on one line, per Andrew's wording/layout revision. Local re-render:
`node scripts/render-google-play-feature-graphic.cjs` (Playwright Chromium + Sharp; no network/app server).
Alt text: “Hightop Challenge: It's game time.”
This is the feature graphic only; real device screenshots remain open.

Required sizes change; check the console first. Draft sizes to VERIFY: iPhone 6.9" (1320×2868) and 6.5"; iPad 13" (2064×2752) — **Andrew confirmed 2026-10-25: keep iPad support. The iOS target stays universal (`TARGETED_DEVICE_FAMILY = 1,2`); include iPad screenshots**; Google:
2–8 phone screenshots (≥ 1080 px short side) and a **1024×500 feature graphic**.
Suggested five frames (take on a God Mode account at the demo venue so nothing real shows):
1. Venue home (games grid) 2. Speed Trivia question 3. Bingo board 4. Leaderboard / points 5. Prize coupon (use a demo
prize). Optional 6. "Share my win" picture. Use a clean demo username. No real bar names unless the owner agreed.
The 5 ready-made share pictures (`npm run share-card:render -- --sheet`) can also serve as marketing frames.

**Apple header and search results creative assets ready (2026-10-26):**
- Header: `assets/app-store/apple-product-page-header-v1.png` — 3840×1646, 2,516,961 bytes.
- Search results: `assets/app-store/apple-search-results-v1.png` — 3840×2560, 4,235,309 bytes.

Both are opaque sRGB RGB PNGs with the existing logo, Nunito, navy/cyan background and one-line “It's game time.”
copy. Upload each to its matching Header and Search Results placement; use App Store Connect Preview to check
actual crops. They complement the required device screenshots. No upload/submission has been performed.
Rebuild: `node scripts/render-apple-store-creative-assets.cjs` (local Playwright Chromium + Sharp, network blocked).
Specifications checked 2026-10-26:
https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications

## 8. Order of clicks (Andrew)

**iOS distribution file ready locally, 2026-10-25:**
`/Users/andrewserulneck/Downloads/Hightop-Challenge-iOS-1.0.0-1.ipa` (1.0.0 / build 1, iPhone+iPad).
App Store export and local distribution signature/profile checks passed; **not uploaded or server-validated** yet.
Create/confirm the App Store Connect app record for com.hightopchallenge.app, then upload using Transporter or the
Xcode archive in `~/Library/Caches/hightop-native/releases/Hightop-Challenge-1.0.0-1.xcarchive`.
Use TestFlight before App Review; APNs delivery, screenshots and legal review remain separate prerequisites.

**Android upload file ready, 2026-10-25:** `/Users/andrewserulneck/Downloads/Hightop-Challenge-1.0.0-2.aab`.
Signed with the newly authorized upload key; signature and archive/payload checks passed. Package
`com.hightopchallenge.app`, version 1.0.0 / code 2, 23,324,192 bytes. Upload to **Internal testing** first, use
Play App Signing with Google's app-signing key, then test the installed build before production review. Back up
the private upload keystore/credentials from the locations in plan §7 to your password manager. The cache's
`app-release.aab` remains unsigned; use the signed Downloads file. Google Play acceptance/device behavior are not
verified yet. Once Play provides its **app-signing** SHA-256, use that for Android passkey/Digital Asset Links setup;
the upload certificate is a different key.

1. Reconfirm app id → create the app record in both consoles.
2. Reviewer setup is done (§9): paste the supplied PIN into the private access forms and select Hightop Test Bar.
3. Upload the build: Xcode → Archive → TestFlight (internal); Android Studio → AAB → Internal testing.
4. Fill privacy/data safety/age rating from §4–§6, paste copy from §2–§3, upload screenshots.
5. Test the TestFlight / internal builds on the phone (device checklist `docs/native-app-device-checklist.md`).
6. Legal review → Submit for review. Record any rejection text verbatim in the Phase 6 handoff.
7. After approval fill the store URLs (`lib/appDownloadLink.ts`) → Phase 7.

## 9. Reviewer account — what exists and what to do

**Completed in production 2026-10-25**, on Andrew's instruction to use whichever venue option was easiest:

- Created `appreview` with the live normal account API, which salts/hashes the supplied PIN. The plaintext PIN was
  not written to any file. Enabled `accounts.god_mode` using `scripts/make-app-review-account.cjs` (dry run first,
  then `--confirm`). Live login verified the supplied PIN and the bypass.
- Un-hid **Hightop Test Bar**, `venue-hightop-test`, **1010 Pacific St, Brooklyn, NY 11238, USA**; set `hidden = false`
  and `rehidden_at = null`. No name, address, coordinates, POS settings or billing records were changed.
  `venue-hightop-test-2` stays hidden. Anonymous player read confirmed the demo is visible; normal players still
  require the existing location check, while God Mode sees all visible venues.
- Joined the demo through the live profile API without supplying location; HTTP 200, session cookie issued, 0 points.
  The global active Speed Trivia bank is available without stocking a separate venue catalog. No game or prize was
  created. This verifies account access, not a full native-device gameplay pass.

Private baseline/action/undo evidence (no PIN or session cookies):
`tmp/native-app-review-2026-10-25/provisioning.json` (git-ignored). Current next steps and rollback details:
`docs/native-app-store-plan_PHASE_6_HANDOFF.md`.

Do not disable reviewer access while store review is pending. After approval, coordinate any change so future store
updates can still be reviewed. The existing reversal command is
`node --env-file=.env.local scripts/make-app-review-account.cjs --username appreview --off --confirm`.
