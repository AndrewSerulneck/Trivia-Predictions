# CLAUDE.md — Hightop Challenge Project Rules

> **Be concise by default.** Keep responses short — direct answers, no restating the task, no trailing summaries unless asked. Save exhaustive detail for when the user explicitly asks for it. This saves tokens and the user's time; don't wait to be told each time.
>
> **Read `SYSTEM_CONTEXT.md` before starting any task.**
>
> **`/info` IS the home page — on the website.** Any control that means "go to the home page" — a Back button, a nav logo, a marketing link — must target **`/info`**, never `/`: `/` on `play.` is `JoinFlow` (the *player sign-in*), so pointing "home" at `/` silently drops partners and first-time visitors on a login screen. **Inside the native app there is no `/info`**: home is the app's front door (the player sign-in). So use **`homeHref(isNativeApp())`** from `lib/domainSplit.ts` (or the `ExitBackButton` `home` option / `useIsNativeApp()` for rendered links), never a bare `marketingHref("/info")` — `tests/native-app-contract.test.ts` fails on one (Phase 2E, 2026-10-09).
>
> **Strategic direction (next few weeks):** the player game login is moving to `play.hightopchallenge.com` (which is what finally moves `/` off the apex); and the `/owner/*` payments surface is becoming the mobile-first **Partner Dashboard** (self-serve live-game scheduling, TV display URL, and Stripe billing). See `SYSTEM_CONTEXT.md` §0 and the canonical build plan in `docs/partner-dashboard-plan.md`.
>
> **`proxy.ts` is the live edge gate — do NOT add a `middleware.ts`.** In Next.js 16 the middleware convention was renamed to `proxy.ts`; it is auto-detected and runs in production (the build lists it as `Proxy (Middleware)`). Adding `middleware.ts` is a hard build error. Its cookie auth-gate is live — never change its default behavior without an explicit, separately-verified decision.
> **Domain split is built, flag-gated off.** The apex→`play.` host routing is layered at the top of `proxy.ts` (via `lib/domainSplit.ts`) behind `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` (off = today's single origin, fully inert). When ready to switch over, execute **`docs/phase-6-domain-split-runbook.md`** exactly (DNS + envs + `.hightopchallenge.com` cookie domain + smoke tests; reversal is one flag).

## Build and Test Commands
- Dev server: `npm run dev`
- Build: `npm run build`
- Typecheck: `npx tsc --noEmit` (on a fresh clone run `npx next typegen` first: `next-env.d.ts` is generated and git-ignored)
- Lint: `npm run lint`
- Tests: `npm run test` (Runs Vitest)

## Native app (App Store / Google Play) — planned 2026-10-08

Plan: `docs/native-app-store-plan.md` (phases, models, Andrew's decisions). One Capacitor app over
the live site, for **PLAYERS ONLY** (Andrew, plan §2 item 12): every `/owner/*` page, `/tv` and
`/admin` open in the system browser, never in-app — no partner link, sign-in, dashboard or billing
screen anywhere in the app. Partners use the website. Read the plan before any native/app-store work.

- **Player account deletion is live (Phase 1b, 2026-10-08).** One all-or-nothing RPC,
  `delete_player_account` (migration `20261008044524`), called only by `lib/playerAccountDeletion.ts`
  from `POST /api/account/delete` (signed session only; 503 without `SESSION_SECRET`, because dev
  shares the production DB). Andrew: REMOVE, don't anonymise — except a won reward keeps its
  `challenge_cycle_winners` slot with `winner_user_id` NULL (else sweeps re-award the prize), and the
  Square ledger is kept unlinked. `challenge_campaigns.winner_user_id` has NO FK on purpose (a
  "resolved" marker). A new `users` FK that is ON DELETE SET NULL must be deleted explicitly in the
  function — `tests/account-deletion-contract.test.ts` fails until it is. SQL is proven on PGlite by
  `npm run test:account-deletion-sql`. Emailed requests: `scripts/delete-player-account.cjs`.
- **`native/` is the Capacitor shell (Phase 2 spike, 2026-10-08)** — its own `package.json`, excluded
  from `tsconfig`/eslint/Vercel (`.vercelignore`). Build Android with `JAVA_HOME=/opt/homebrew/opt/openjdk@21`
  (Gradle can't run on Android Studio's Java 25); Gradle output goes to `~/Library/Caches/hightop-native/`
  because iCloud syncs `~/Documents` and makes `name 2` copies that break builds. Findings and commands:
  `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`.
- **The iPhone app's web view starts BELOW the status bar (Phase 2D, 2026-10-09)**:
  `@capacitor/status-bar` `overlaysWebView: false` + dark navy, light icons (`SystemBars.style "DARK"`;
  Android paints the edge-to-edge strip via `htc_canvas` in `styles.xml`). Don't flip it back to
  overlaying: half the player screens ignore `env(safe-area-inset-top)`. Never put safe-area top padding
  on a `<section>`/`<article>`: `.tp-page-main section` gets `0.625rem !important` on phones and silently
  replaces it (`tests/native-safe-area-contract.test.ts`).
- **The app's front door + link-outs (Phase 2E, 2026-10-09; 3B.1).** `lib/nativeApp.ts` is the ONLY
  reader of the `HightopChallengeApp/` UA token and `window.Capacitor` (`isNativeApp()`,
  `isNativeUserAgent()`); contract test. In the app `/` is the player sign-in and nothing else: no Home
  link, no partner link (`app/page.tsx` passes the server's UA check as `JoinFlow`'s `nativeAppRequest`
  so even the first paint has no Home). The 2E remembered-partner launch (`AppFrontDoor`,
  `lib/appFrontDoor.ts`, cookie `htc_app_side`) was deleted in 3B.1 — don't bring it back. Marketing pages (`plugins.HightopShell.openInBrowser` in
  `native/capacitor.config.json`) open in the system browser; legal pages stay in the app. The offline
  page is shown by our own native wrappers (`HightopBridgeViewController.swift`,
  `HightopWebViewClient.java`) only for real network errors — `server.errorPath` is deliberately unset.
- **Production shell (Phase 3, 2026-10-09; handoff `docs/native-app-store-plan_PHASE_3_HANDOFF.md`).** No
  `@capacitor/*` package in the website — `lib/nativeApp.ts` talks to the injected bridge
  (`hasNativeCapability()`, `callNative()`, `addNativeListener()`, `openInSystemBrowser()`); check the
  capability first, old app versions stay in use. Link-outs are ONE list: `lib/nativeLinkOut.ts` =
  `native/capacitor.config.json` `openInBrowser.paths`; the web-only entries are **`/owner`, `/tv`,
  `/admin`** (each = itself and everything below). The shell catches full page loads on the apex;
  everything else (Next router hops, `/owner` on `play.` while the split is off) is caught by
  **`proxy.ts`**, which rewrites an app-UA request for a web-only page to the static notice page
  `app/in-app-notice/[page]` (URL unchanged) — browsers never match, so the partner pages stay static.
  Don't add a per-page `WebOnlyInApp` layout gate (deleted in 3B.1: it made every page it wrapped a
  per-visit render). Never a Subscribe/Pay button in the app — guaranteed by `/owner` being web-only. Android Back runs the on-screen control
  (`components/navigation/nativeBackButton.ts`: overlay > step > exit) — never new navigation logic.
  Every closable player popup calls `useNativeBackHandler("overlay", open ? close : null)` with its X's close
  (list pinned in `tests/native-back-review-fixes.test.ts` — add new popups there); native Back runs
  `handleExit({ replace: true })` (a tap pushes); the venue hub is the root and Back minimises (review-fix R1).
  Native env vars (`NATIVE_APP_*`, `APPLE_TEAM_ID`, `ANDROID_APP_CERT_SHA256`) are server-side but
  need a Vercel **Redeploy** to apply. App version lives in four places, pinned equal by
  `tests/native-app-contract.test.ts`.
- **Native share, haptics and the QR scanner (Phase 4, 2026-10-09; handoffs `…_PHASE_4A_HANDOFF.md`,
  `…_PHASE_4B_HANDOFF.md`).** Plugins are capability-checked (`NativeCapability` in `lib/nativeApp.ts`:
  `Share`, `Haptics`, `Filesystem`, `CapacitorBarcodeScanner`); old app builds fall back. Share: `lib/nativeShare.ts`
  (link/text) and `lib/nativeImageShare.ts` (story picture; Android only, via Filesystem cache). Haptics have ONE native call
  site, `playHaptic` in `lib/nativeHaptics.ts`, reached from `triggerAnimation` (gameplay animations) and from
  `haptic()` in `lib/haptics.ts` (taps/submits/claims; with the plugin it skips `navigator.vibrate`, so no
  double buzz; website unchanged). Never call both for one moment. The Rewards "prize won" buzz baselines only on a successful load (`hasLoadedChallenges`). **QR scanner:** `lib/nativeQrScan.ts` — `parseHightopQr`
  accepts ONLY https `play.hightopchallenge.com` / `hightopchallenge.com` at `/` or `/join` (optional `?v=`), and the
  app navigates to a path it BUILDS (`joinPathForScan`), never to the scanned text. On the signed-in venue list a
  scan instead selects via `handleSelectVenue`, only if the venue is in the built list (`decideScannedVenue` in
  `lib/joinVenueList.ts`, R2) — a QR never bypasses the geofence. Plugin is
  `@capacitor/barcode-scanner` (the MLKit one has no Swift Package Manager support — don't swap it in);
  Android minSdk is 26 because of it. Camera is asked for only on tap. No partner surface (player-only app).
- **App download link `hightopchallenge.com/app` (Phase 9a, 2026-10-22).** `app/app/route.ts` 302s by User-Agent via
  `decideAppLinkDestination` (`lib/appDownloadLink.ts`): iPhone → App Store, Android → Play, else `/info#app`; store URLs are
  EMPTY constants there until the listings are live (until then everyone lands on the player sign-in); inside the app → the
  front door. The PATH is permanent (printed on shared pictures; literal, never env). Share cards (9b) print `APP_DOWNLOAD_URL`.
- **Share pictures v2 (Phase 9b, 2026-10-22; handoff `docs/native-app-store-plan_PHASE_9B_HANDOFF.md`).** "Create story" opens
  READY-MADE designs first (Spotlight / Card / Night, no camera), Story 1080×1920 or Post 1080×1350; "Add a selfie" is the
  old camera flow. A game is a registry entry (`lib/socialShare/shareGames.ts`; no share component/layout branches on a game id,
  test). Layouts: `lib/socialShare/shareDesigns.ts`; one renderer `storyCanvas.ts`. Headline = Andrew's line, ONLY via
  `shareWinHeadline` (`copyPresets.ts`). Every picture carries the bar (name + street + city, no directions) and the QR file
  `public/share/app-download-qr-v1.png` = `APP_DOWNLOAD_URL` (`npm run share:qr`; new value = new file name). Canvas text ≥ 34px
  (= 12px on a phone). The hub remembers its venue for the games (`rememberShareVenue`, zero requests). Visual check:
  `npm run share-card:render -- --sheet` (also decodes every QR).
- **"Share my win" (Phase 9c, 2026-10-22; handoff `docs/native-app-store-plan_PHASE_9C_HANDOFF.md`).** ONE button,
  `components/social-share/ShareWinButton.tsx` (wraps `StoryShareLauncher variant="button"`; reads the player from storage, makes
  no request). A new win screen adds it and is listed in `tests/share-win-button.test.ts`. It only appears on a result the screen
  already loaded; a prize shares `prizeCardFace` (name only — never a code/QR/card number, tested). Share analytics accept every
  registry game (`story_share_events_game_type_valid`, migration `20261023004047`, applied).
- **The share sheet (Phase 9d, 2026-10-22; handoff `docs/native-app-store-plan_PHASE_9D_HANDOFF.md`).** Still ONE sheet,
  `StoryCaptureModal` (never fork it): designs + Story/Post + caption box ("Copy caption + link") + a destinations row
  (`components/social-share/ShareDestinations.tsx`). What a tap does is pure in `lib/socialShare/shareDestinations.ts`
  (`planShareDestination`); words in `copyPresets.ts`. The clipboard write starts inside the tap before any await (browsers
  allow it only then; `lib/copyText.ts`), and the picture still goes with NO `url` field. In the app, Instagram Story uses
  our plugin `InstagramStories` (`native/…/InstagramStoriesPlugin.{swift,java}`, Meta App ID in
  `native/capacitor.config.json`; web side `lib/nativeInstagramStories.ts`, capability-checked; old builds → share sheet).
  Next: 9e (venue @handle + the partner's handle/name/address choice), 9g (`/app` "Get the app?" page), then 9f.
- **Legal pages** (`/privacy /terms /rules /support /delete-account`) take their facts from
  `lib/legalInfo.ts`; a signed-in player can read them only because `AuthNavigationGuard` allowlists
  `LEGAL_PAGE_PATHS`. `/privacy` promises usernames never go to Anthropic — keep
  `ANTHROPIC_USERNAME_MODERATOR_API_KEY` unset in Vercel unless the policy changes first.

## Partner Results page (Partner Dashboard menu → Results; built 2026-10-16)

Plan + decisions: `docs/partner-results-page-plan.md` (phases 1–5, handoffs `…_PHASE_<N>_HANDOFF.md`).
One timeline of a venue's games (Month → Week → Day, newest first): each game card shows its winner and the
rewards won at it; a weekly reward is a row at the end of its week (Andrew, 2026-10-16: single-night weekly
rewards too); tap a game for the FULL standings with a "Find a player" search; tap a player for each question
(right/wrong, points, question text). Read-only, no tabs, no CSV, usernames and points only.
- **A competition is a registry entry, not a screen.** `lib/results/competitions.ts` (labels, score unit,
  `hasBreakdown`) + one adapter under `lib/results/adapters/` + one line in `adapters/index.ts` (+ a placement
  rule in `lib/results/rewardPlacement.ts` if it has rewards). Nothing under `components/owner/results/` or
  the generic `lib/results/*` core may name a competition id (`tests/results-registry-contract.test.ts`).
  Checklist: `AGENTS.md` "Add a competition to Results". Registered: Live Trivia and Super Bowl Squares (`squares`,
  2026-10-19, no breakdown, inert while its flag is off); Category Blitz stays out unless Andrew says otherwise.
- **Routes** (all through `withOwnerVenue`, `lib/ownerHistoryRoute.ts`: owner auth + the venue is theirs BEFORE
  any read; `no-store`): `GET /api/owner/results` (timeline page), `…/results/games/[competition]/[gameKey]`
  (standings), `…/breakdown?entry=`. The reward detail keeps `GET /api/owner/history/rewards/[rewardId]`
  (`getOwnerRewardDetail`, `lib/ownerHistory.ts`). The old `kind=games|rewards` and `/history/games/…` routes and
  `GameResultsSheet` were deleted in Phase 5; the sheet id is still `history` (URL `?sheet=history`).
- **No player id ever leaves the server.** A standings row carries `entry`, an HMAC token (`lib/results/entryToken.ts`,
  `SESSION_SECRET`, bound to venue + competition + game); no secret → `entry: null` and the breakdown route 503s. The
  breakdown never selects `submitted_answer`/`normalized_answer`. Pinned by `tests/results-privacy-contract.test.ts` —
  do not weaken it.
- **Reward placement is one pure function** (`lib/results/rewardPlacement.ts`): game_winner → its game card; daily →
  the day's only game card, else a day row; weekly / ranked_places / NFL → a week row; anything else → a day row on the
  day it was finalized. Nothing is ever dropped. Keep the paging contract in that file's header when adding a rule.
- **Cost:** on demand only (no cron/polling). First page ≈ 6–7 bounded reads in one request; a game ≈ 3–5; a player ≈ 3.
- UI: `components/owner/results/` (`ResultsSheet` owns steps `game`/`player`/`reward`, mirrored in the URL; the router
  is never used for a step). A bare `<button>` inside a bordered card needs `BARE_BUTTON_CLASS` (`resultsUi.tsx`).
  Phone pass: section J of `docs/partner-dashboard-app-redesign-device-checklist.md`.

## Bingo / Pick ’Em reliability work (complete, 2026-09-19)

Current plan: `docs/bingo-pickem-reliability-plan.md`; complete and developer-accepted after
Andrew confirmed authenticated Prop Bingo works. Maintenance starts from
`docs/bingo-pickem-reliability-plan_PHASE_7_HANDOFF.md` and
`docs/bingo-pickem-reliability-release-record-2026-09-19.md`. Andrew intentionally skipped
Phase 6: do not repair historical boards, rewards or consequences. The atomic-grading migration
was applied to linked Supabase project `pkmxupsayzshvpirkaav` on 2026-09-19; application changes
were committed as `62f027cd46528d771e154ccb5cc75df24f6d8173` and pushed to `origin/main`.
Deployment status was not independently checked. Old NFL activation notes are dated history.

- Creation leagues follow actual boardable games on the player's local day; no season/flag
  override may make an empty league selectable. Shared eligibility lives in
  `lib/sportsBingoAvailability.ts` and inherits capability-filtered candidates.
- `lib/sportsBingoCapabilities.ts` admits only verified resolver/parameter families. Add
  precise label/field/ID/closure/missing-data evidence and captured-data regression cases in
  `docs/bingo-grading-capability-matrix.md` before admitting a new square. Preserve legacy parsing.
- `lib/sportsBingoQuality.ts` enforces 24 supported non-free cells, unique player-stat axes,
  max two cells per player, the NFL 10/6/8 mix, six prop subjects, both teams where possible
  and at least three early-progress opportunities. Non-composable games are unavailable.
- Normalize stored `nfl`/`nba` only at Bingo boundaries. Missing/partial data is unknown;
  never restore a blanket zero conversion to satisfy a calibration test.
- `lib/sportsBingoSettlement.ts` owns 60-second final confirmation, 2-hour delayed-final
  grace and the 48-hour no-final deadline. Recheck provisional grades; terminal corrections
  require reviewed explicit repair outside this plan. `bypassCache` never reopens won/lost cards.
- `20260914010000_bingo_atomic_grading.sql` was applied to linked Supabase project
  `pkmxupsayzshvpirkaav` at 2026-09-19T23:48Z. The column and service-only RPC were verified
  through PostgREST; the RPC saves cells/card/notification atomically. Do not reapply, remove,
  down-migrate or add a non-atomic fallback. Application rollout has not occurred.
- Regular Pick ’Em excludes NFL from discovery; old regular NFL links redirect to the
  dedicated game. Dedicated NFL types, scoring, rewards/history and shared week dropdown remain.

Core checks: `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl`,
`npm run test:bingo-mlb`, `npm run test`, `npm run build`; exact captured-data and isolated
SQL commands are in the Phase 4 handoff. Offline incident assertion:
`node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs --assert-correct`.
Final local gates: NFL 288/288, MLB 142/142, full Vitest 2,620 pass / 13 environment-gated
skip / zero fail, PWA 20/20, clean typecheck/lint and 179-page build. The 16-game Week 1
provider validator passes. Do not run typecheck concurrently with build because `.next/types`
is regenerated. Physical-device UI and real NFL plus webhook-driven live→final observation
remain optional operational monitoring, not unfinished plan work.

## Game tutorial cards (2026-10-17)
- **Every game's tutorial follows the Category Blitz layout** (Andrew: "emulate those … for future ones when we make
  new games"): no eyebrow label, the statement + detail on top at reading size (Category Blitz's clamps), the art
  below in the height left. One component, `TutorialStatementPanel` in `components/venue/GameIdentityPanel.tsx`;
  a new game goes in `STATEMENT_LAYOUT_GAMES` with its art in `GameStepIllustration`
  (`tests/tutorial-statement-layout-contract.test.ts` fails until it does). Only Speed/Live Trivia keep the old layout.
- **Text wins, art shrinks.** The art box is a size container (`[container-type:size]`): draw art that scales with
  `cqw`/`cqh` (the bingo boards) or show fewer rows — never shrink a label below 14px or let it push text off the card.
  Copy lives in `lib/venueGameCards.ts`. Check a change at a 350 px and a 289 px card (iPhone SE).

## Light theme (built 2026-10-22, flag off)
Plan + handoffs: `docs/light-theme-plan.md`; phone pass `docs/light-theme-device-checklist.md` (Andrew only).
- **Four screens have a light version: Venue Home, Pick 'Em, NFL Pick 'Em, Fantasy.** Everything else stays dark.
  `lib/theme.ts` is the one home: the flag `NEXT_PUBLIC_LIGHT_THEME_ENABLED` (`isLightThemeEnabled()`; build-time, so
  redeploy), the light paths (`LIGHT_THEME_PATH_PATTERN`), the choice (localStorage `htc_theme`, Dark / Light only —
  no "Match my phone", Andrew 2026-10-22; default Dark = `DEFAULT_THEME_PREFERENCE`, Andrew's call), `THEME_COLOR` and the Appearance copy. Flag off
  = no pre-paint script, no `ThemeRouteSync`, no Appearance row: every page dark.
- **The choice never goes to the server.** No cookie, no account column: the root layout must never read
  `cookies()`/`headers()` (it would make every static page a per-visit render; `tests/light-theme-contract.test.ts`).
- **A colour on those screens is a token with a dark AND a light value** — in `:root` and
  `:root[data-theme="light"]` of BOTH `app/globals.css` and `colors_and_type.css`, plus a `tailwind.config.ts` `ht.*`
  entry. Never an arbitrary hex, never a `dark:`/`light:` variant. Steps: `AGENTS.md` "Adding a colour".
  Dark must stay pixel-identical: `scripts/theme-screenshots.cjs` + `scripts/theme-pairs/`.
- **App status bar: `lib/nativeStatusBar.ts` is the only painter.** Dark icons only on a strip known to be white
  (Android 15+ ignores the colour, so it stays navy); never flip `overlaysWebView`. Installed iPhone PWA: a navy band
  behind the clock on light screens (`html.tp-standalone[data-theme="light"]::after`).

## Mental Model & Terminology
- **Core Concept:** Users join a specific physical venue and earn points playing mini-games (Trivia, Pick'em, Bingo, Predictions, Fantasy) scoped strictly to that venue. 
- **Data Scoping:** Authentication is global (passkeys/username), but points, leaderboards, and game states are entirely venue-specific. Users can belong to multiple venues with completely independent point totals.
- **Naming Rule:** Always use "credit allocation" instead of "credit limit" for recurring game balances.
- **Prize vs reward (2026-10-18):** players and partners see **Prize**. Code, routes and DB keep `reward` (`lib/rewards.ts`, `challenge_campaigns.reward_definition_id`, `/api/owner/rewards`). Never write "Reward" in on-screen text; `tests/prizes-wording-contract.test.ts` fails on it (only the verb "rewards" and non-screen text are allowlisted). Old `?sheet=rewards` / Results `?step=reward` URLs stay accepted forever; new ones are `prizes` / `prize`. Plan: `docs/rewards-to-prizes-rename-plan.md`.

## Do Not Touch (Hard Boundaries)
- `.env.local`: **APPEND-ONLY. Values are never read, printed, or exposed.**
  Revised 2026-09-09 on Andrew's instruction — the old rule was "never read,
  modify, or expose", which also blocked *adding* a key that a feature needs,
  and that was pure friction. What has NOT changed is the reason for the rule:
  this file holds ~75 live secrets (Stripe, Supabase service role, Anthropic,
  Google Maps, Resend, GitHub). One stray `>` destroys all of them and they are
  not all recoverable.
  - **ADDING is allowed:** `echo 'KEY=value' >> .env.local`. Always `>>`.
  - **To see what is already set, read NAMES ONLY:**
    `cut -d= -f1 .env.local | sort`. Never `cat`/`head`/`tail`/`grep` the file —
    that puts live API keys in the transcript, which is the exposure the rule
    exists to prevent.
  - **NEVER, under any circumstance:** `>` (truncate), `rm`, `mv`/`cp` onto it,
    `sed -i`, `tee` without `-a`, or `vercel env pull` (which overwrites the
    whole file). Removing or changing an existing line is Andrew's call, not
    Claude's — if a value looks wrong, say so and stop.
  - Enforced, not merely documented: `.claude/hooks/protect-env-local.sh`
    (a `PreToolUse` Bash hook) blocks every form above, and
    `.claude/settings.json` denies `Read`/`Edit`/`Write` on the file outright.
    If a hook denial looks wrong, fix the request — do not work around the hook.
- **Vercel env vars:** `vercel env ls` and `vercel env add` are allowed.
  `vercel env rm` and `vercel env pull` are DENIED (the first deletes, the
  second overwrites `.env.local`). A `NEXT_PUBLIC_*` var is inlined at build
  time — adding one requires a redeploy to take effect.
- **Supabase migrations:** the CLI is installed and the project is linked
  (`pkmxupsayzshvpirkaav`). `supabase migration new <name>` is allowed — it only
  writes a local timestamped file, and writing migrations is expected (see the
  `supabase/migrations/` boundary below). `supabase db push` applies to the
  LINKED PRODUCTION database and always asks first; never run it unprompted.
- `supabase/migrations/`: **Creating new timestamped migration files is allowed and expected.** Existing migration files are read-only history — never edit, overwrite, or delete one.
- `lib/supabaseAdmin.ts`: Security boundary. Do not modify without explicit instruction.
- `vercel.json`: Cron configurations. Do not alter without instruction.

## Supabase Data API grants (2026-10-30 Supabase change)

From **2026-10-30**, Supabase stops auto-granting `anon`/`authenticated`/`service_role` on any
NEW `public` table, view, materialized view or sequence (existing objects are unaffected;
functions/RPCs are unaffected). **Production already behaves this way since 2026-09-23**
(`20260923130842_adopt_explicit_grant_defaults.sql`; every pre-existing object's grants are
recorded in `20260923130841_explicit_api_grants_baseline.sql`), so a missing grant fails the
moment the migration is applied. Our server code reaches every table through `service_role`
(`lib/supabaseAdmin.ts`), and no migration in this repo has ever granted it explicitly. **Every
migration that creates a `public` table, view/materialized view, or sequence must grant
`service_role` in the same file** (plus `anon`/`authenticated` only where the browser needs
direct access, with RLS). Follow the template in
`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; `tests/supabase-migration-grants-contract.test.ts`
(part of `npm run test`) enforces it for every migration newer than `20260914010000` (earlier
migrations are grandfathered — see `docs/supabase-data-api-grants-plan.md`).

## Trivia Source of Truth
- **Speed Trivia is Admin/Supabase canonical:** For Speed Trivia (`question_pool='anytime_blitz'`, `answer_format='multiple_choice'`), the Admin UI and `trivia_questions` table are the source of truth. Local files under `data/trivia/categories/` are export artifacts only.
- **Live Trivia JSON is canonical:** Files under `data/live-trivia/categories/` remain the source of truth for Live Trivia question content.
- **Never cross Speed and Live Trivia pools:** Speed Trivia must stay `anytime_blitz` + `multiple_choice`; Live Trivia must stay `live_showdown` + write-in-compatible answer formats.
- **Never rebuild Live Trivia JSON from Supabase:** Database state must not overwrite, regenerate, or "restore" `data/live-trivia/categories/`.
- **Never rebuild local trivia JSON from stale git snapshots:** Do not use `git show`, `HEAD`, or other historical snapshots as the input source when editing or backfilling current trivia JSON unless the user explicitly asks for a restore from history.
- **Live Trivia question edits belong in local JSON first:** If the user asks to add, remove, rewrite, or audit Live Trivia questions/answers/acceptable answers, make those changes in the local JSON files.
- **Speed Trivia JSON export is intentional:** Only export approved Speed Trivia rows from Supabase to `data/trivia/categories/` through the Admin Review GitHub PR export flow.
- **Preserve current local file contents when scripting:** Any script that updates trivia JSON must read the current on-disk file first and only make the requested incremental changes.

## Category Blitz Source of Truth
- **The game is LETTER-FIRST.** A round picks one usable letter, then draws 12 categories at random from that letter's vetted pool — so boards are freshly assembled every round and every category is guaranteed several common answers for the called letter (no single-answer traps like "P" for "A US state").
- **The pool is canonical: `data/category-blitz/category-pool.json`.** This is the library of all categories. To add categories, append them here (a `theme` tag is an optional legacy field, not used by the letter-first build). Only ADD to the pool; keep existing good categories.
- **`data/category-blitz/category-letter-index.json` is GENERATED, not hand-edited.** It is built from the pool by `npm run category-blitz:build` (`scripts/build-category-blitz-letter-index.cjs`), which asks the model, per category, which letters have an ABUNDANCE of common answers (≥3, `--threshold`), then inverts that into `letters[L] → [categories]` plus `usableLetters` (letters with ≥12 categories). After editing the pool, re-run the build. A cache (`data/category-blitz/letter-cache-abundant.json`) means only new categories are billed to the model.
- **Always follow `data/category-blitz/CATEGORY_TEST.md` when writing or evaluating categories:** Every category must pass BOTH the Is-A gate (objective, definitional) and the Letter-Coverage gate (broad). That file contains the canonical generation prompt — reuse it rather than re-deriving the rules.
- **The abundance bar is model-derived, never hand-authored.** Don't hand-edit `category-letter-index.json` or the cache; re-run `npm run category-blitz:build` (add `--dry-run` to preview per-letter counts without writing).
- **Continuous mode is the universal default, flag-gated (`NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT`).** When on, every venue runs an endless randomized continuous loop with zero admin setup — no schedule, no start/end time, no "number of rounds." A `category_blitz_continuous_config` row is an optional **per-venue override** (custom pacing/pool, or `is_active = false` to explicitly opt a venue back onto the scheduled engine); "no row" now means "on with global defaults." The flag follows the same reversible convention as `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`: off = today's legacy scheduled behavior, fully inert. Resolver: `resolveContinuousConfig` in `lib/categoryBlitzPool.ts`; the scheduled engine (`driveVenueCategoryBlitz` / `runCategoryBlitzEngine`) stands down for any continuous venue via `standDownScheduledIfContinuous`. **The game sleeps when idle (2026-10-14):** a continuous round starts ONLY from `driveContinuousCategoryBlitz`, reached only via the game page's `GET /api/category-blitz/sessions` (no `peek`). Venue home, the admin panel and the TV only peek (`peek=1` / `peekCategoryBlitz`, never create or start anything); cron `/api/cron/category-blitz-continuous` only scores expired rounds. Tripwire: `tests/category-blitz-sleep-contract.test.ts`; plan `docs/category-blitz-how-to-play-plan.md` Phase 5. Full plan: `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md`.
- **Category Blitz cadence, bonus and rules (2026-10-14/15, `docs/category-blitz-how-to-play-plan.md`).** Majority Rules is exactly every 5th round of a session: `isReverseRound` in `lib/categoryBlitzModes.ts` (never random; the admin mode-selection control is hidden); continuous MR rounds draw from the Blend-In index. The alliteration bonus (+1, both modes, only on an answer that already scores, 2+ words all starting with the letter) lives only in `lib/categoryBlitzAlliteration.ts`. The tutorial cards and the "How to play" rules list have ONE source, `lib/categoryBlitzHowToPlay.ts` — edit copy there, not in components. The game only runs while a player has it open; venue home and the TV only peek (see the sleep rule above).
- **Global room pooling exists, flag-gated off (`NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`).** When on, every venue's Category Blitz gameplay collapses onto one shared hidden room (`hc-cbz-live`, `venues.hidden = true`, never appears in any venue list) so sparse venues clear the 3-player/2-player scoring gate. Off = today's per-venue isolation, fully inert — same reversible convention as the flags above. Single indirection point: `resolveCategoryBlitzRoomId` in `lib/categoryBlitzShared.ts`, applied ONLY at gameplay boundaries (never venue join/geofencing/`users.venue_id`). Concealed from the frontend two ways: API responses remap `session.venueId` back to the caller's real venue, and the realtime channel name is hashed (`categoryBlitzChannelName`) so the raw room/venue id never reaches the client. Per-venue challenge-campaign points still attribute correctly under pooling (read from each submission's own `venue_id`, not the pooled room's). Full plan + cutover runbook: `docs/category-blitz-global-room-plan.md`.

## Rewards System (on screen: **Prizes**; venue-home Prizes panel, admin, Partner Dashboard)
- **Rewards consolidates three prior concepts** — the venue-home Challenges panel, admin
  Challenge Campaigns, and the Partner Dashboard Competitions gallery — into one
  customer-loyalty system built on `challenge_campaigns` (reused, not rebuilt). Full design +
  phase-by-phase as-built notes: `docs/rewards-system-plan.md`.
- **Reward definitions are a registry, not free-form authoring.** Admins and partners pick
  from a small slate of pre-built definitions (today: the Live Trivia Challenge) and fill in
  cadence/prize/quantity. **Adding a new reward = one entry in `lib/rewardDefinitions.ts`** (+
  a schedule lookup in `lib/rewards.ts` only if it gates on a live game with no existing
  lookup). See `AGENTS.md` for the exact steps — do not hand-roll a new creation form.
- **One shared wizard, two hosts.** `components/rewards/CreateRewardWizard.tsx` is used by
  both the admin Rewards section (`components/admin/sections/ChallengesSection.tsx`) and the
  Partner Dashboard (`app/owner/competitions/page.tsx`) via a `variant: "admin" | "owner"`
  prop. Do not fork this component per host.
  **Minimum players has its own wizard step, `players` (2026-10-17, `docs/reward-minimum-players-plan.md`):** between
  `terms` and `prize`, asked for every contest reward (Win the game, Weekly 1st/2nd/3rd, NFL most picks), never a
  points target (`guardRewardWizardStep` sends a `?step=players` for one to `prize`). Nothing is pre-selected; Next
  stays off until "No minimum" or a valid 2–100 number (pre-fill `REWARD_MIN_PLAYERS_DEFAULT` = 3).
- **Rewards are threshold+quantity (progress) only.** Leaderboard mode is retired from
  creation; in-flight leaderboard campaigns finish their current cycle but no longer render
  standings on the venue panel.
- **Multi-winner quota is enforced atomically via `challenge_cycle_winners` + the
  `award_cycle_winner` Postgres RPC** (count-guarded insert under a transaction-scoped
  advisory lock), not in application code — never re-implement the quota check client-side or
  in a plain `INSERT`.
- **`NEXT_PUBLIC_REWARDS_ENABLED` / `lib/rewardsFlags.ts` no longer exist** (deleted in commit
  9abbb1b, 2026-07-22) — multi-winner Rewards is live unconditionally, not flag-gated. The only
  live Rewards flag today is `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED`
  (`isGamePickerEnabled()` in `lib/rewardGameSlots.ts`), which gates ONLY the wizard's
  game-picker UI branch — not cadence support, not the archive/delete split, not the slot
  cascade. Don't describe other Rewards work as "inert until a flag flips."
- **Every prize is drawn as ONE digital gift card** (`docs/prize-gift-card-redesign-plan.md`, built
  2026-10-15). One component, `components/prizes/PrizeCard.tsx` (back laid out by `PrizeCardBackFace.tsx`,
  logo `PrizeCardLogo.tsx`); what it says comes only from `lib/prizeCardFace.ts` (`prizeCardFace`,
  `prizeCardBack`); colours only from `PRIZE_CARD` in `lib/themeTokens.ts`. Never add per-prize colour
  themes, dashed/double borders or a second card. Tapping a card (not the logo) flips it; the list's
  action ("Redeem" / "Show gift card", decided by `prizeActionOf` in `PrizeWalletPanel.tsx`) is on the
  back; Confirm Redemption in the live sheet stays the only redeem. No overflow/opacity/filter on the
  flip's perspective root or rotating element (iOS flattens the 3D). A bare `<button>` on the card
  needs `!border-0` plus `[&:not(:disabled)]:!p-0`/`!min-h-0`, or the global phone button rules pad it.
  `npm run prize-card:render` draws specimens; `-- --email` writes the email picture. **Email pictures
  under `public/brand/email/` are cached long: new artwork ships under a NEW file name (`-v2`), never
  overwrite**, then update `imageFile` in `lib/email/partnerEmailCopy.ts`.
- **Redemption = in-app coupon, staff-taps-redeemed.** No POS or gift-card-issuance
  integration; winners see a coupon on `/redeem-prizes` (`components/prizes/PrizeWalletPanel.tsx`).
- **A coupon is redeemed ONLY through the `redeem_challenge_prize` RPC** (migration
  `20261005123950_reward_redeem_once.sql`, via `redeemChallengePrize()` in
  `lib/challengeCampaigns.ts`) — its conditional UPDATE is the once-only guarantee, so never write
  `prize_redeemed_at` with a plain update. It fails closed (503, `[RewardRedeem] rpc-missing`) if
  the RPC is absent. Every prize route binds `userId` to the signed session via
  `resolveRequestUserId()` (forged → 403). Plan: `docs/reward-live-redemption-plan.md`.
- **The coupon shown to staff is LIVE, not static** (`components/prizes/LiveCouponFrame.tsx`, wrapped
  around the large coupon inside `RedeemModal` only — wallet-list cards stay calm). A web page can't
  block screenshots, so it proves it is live: never-stopping shimmer band, a clock + date on the
  **server's** time (the wallet `GET /api/challenge-campaigns/redeem` returns `serverNowMs` + `venueName`
  — zero extra requests; offset math in `lib/liveCouponClock.ts`), guest username + venue name, a tap
  sparkle, and a screen wake lock. Reduce Motion drops the band and sparkle travel but keeps the ticking
  clock and a border flash. Motion is `tailwind.config.ts` keyframes (`coupon-shimmer/spark/flash`),
  transform/opacity only. The venue name comes from `getVenueDisplayName()` (`lib/venueDisplayName.ts`,
  10-min per-instance cache, failure → no name). Motion-only by Andrew's decision — no staff PIN/scan/
  rotating code.
- **The NFL Pick 'Em Challenge is the one reward that does NOT gate on a venue schedule.**
  It gates on the NFL season calendar (`nfl_pickem_weeks`), so it takes none of the Live
  Trivia schedule machinery: a partner picks a **week scope** — `weekly`, `season` or
  `single_week` (one chosen week, added 2026-10-12, `docs/nfl-pickem-single-week-reward-plan.md`),
  and only those three; arbitrary week ranges are explicitly rejected — and
  `lib/nflPickEmRewardWeeks.ts` derives cadence, quota, `activeDays` (all seven days,
  **`"thu"` first**, or the cycle anchor and accrual gate both break) and date bounds from
  it. "Most picks right" is locked to **1 winner** (refused server-side, not clamped) and
  needs **the partner's own minimum** of pickers at the venue or nobody wins — per reward,
  `challenge_campaigns.min_players`, null = no minimum (even 1 picker can win), else 2–100;
  every reward created before 2026-10-17 was backfilled to 3 (migration `20261017191219`,
  `docs/reward-minimum-players-plan.md`); a minimum is refused on a picks target. Ties are broken by a per-week tiebreaker
  question (`lib/nflPickEmTiebreaker.ts`). Accrual is **1 point per correct pick, not 10**
  (`lib/nflPickEmRewardAccrual.ts`, a separate sweep — daily Pick 'Em's settlement path is
  untouched). Full as-built record, deviations and remaining work:
  `docs/nfl-pickem-reward-plan.md`. **Single week:** the client sends only the week NUMBER;
  `createReward` accepts it only if it is on the server's fresh `selectableWeeks`
  (`buildNFLSelectableWeeks`: regular/postseason, games synced, first game not kicked off)
  and takes the dates from the server row. It is resolved by THAT week's weekly contest and
  spent after one award (`isOneOffNFLReward`); picks-target accrual uses the exact Tue→Tue
  week span (`nflSingleWeekAccrualWindow`) — never remove that argument from the sweep. A
  one-off reward's cycle key matches every week, so any per-week reader must filter with
  `nflRewardAppliesToWeek` first.

## Partner Self-Serve Signup (`/owner/signup`, flag-gated)

- **A partner can now subscribe without an admin pre-activating their venue.**
  The full-screen wizard at `/owner/signup` (six steps: name → email → password →
  address → geofence → review → Stripe Checkout) creates its own `venues` row
  (`hidden = true`, `self_serve_created_at` stamped) and owner account, then hands
  off to `/owner/billing/setup`. The Stripe webhook unhides the venue on first
  paid activation. Full plan + as-built: `docs/partner-self-serve-signup-plan.md`;
  ops cutover: `docs/self-serve-signup-runbook.md`.
- **Admin Activate-a-Venue is NOT deleted.** `components/admin/mobile/ActivateVenueFlow.tsx`
  stays — ops still needs it for offline-billed venues, second venues for an
  existing owner (self-serve is **one venue per email**), and support fixes. It is
  no longer a *prerequisite*, that is all that changed.
- **Everything is behind `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`**, single reader
  `isSelfServeSignupEnabled()` in `lib/selfServeSignup.ts` (same reversible
  convention as `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`). Off (today's default) =
  `/owner/register` keeps its venue-lookup flow and every `/api/signup/*` route
  plus `/owner/signup` 404s. On = `/owner/register` redirects to `/owner/signup`
  and the `/info` partner CTAs point there. The flag is a `NEXT_PUBLIC_*` value
  inlined at build time, so **env var, then redeploy** — a mid-rollout skew shows
  as a live wizard whose submit 404s.
- **`/api/signup/maps-key`, `/api/signup/places`, `/api/signup/venue-map`,
  `/api/signup/email-available` and `POST /api/owner/signup` are public and
  unauthenticated** (the first three are Google-billed). They are gated on the
  flag + `rateLimit()` (`lib/rateLimit.ts`, `signup_attempts` table), never
  `requireAdminAuth`.
- **An unpaid signup is NOT an account.** Account creation is **Stripe payment
  completing** — nothing earlier. Tapping "Start subscription" writes a
  `venue_owners` + `auth.users` + hidden `venues` row, but that bundle has no
  payment, no gameplay, no player linkage and **no user-visible identity**: it is
  a *pending signup*, debris with an email on it, not something to sign into,
  resume, or recover. "An account with this email already exists" must never
  appear for one. Full rationale: `docs/abandoned-signup-cleanup-plan.md` §0.1.
- **"Is this email a real partner account, or an unpaid pending signup?" has one
  home — `classifyEmailForSignup()` in `lib/pendingSignup.ts`.** It returns
  `{ exists: false }`, `{ exists: true, kind: "account", ownerId }` (paid, ever
  paid, or admin-activated — **blocks**), or `{ exists: true, kind: "pending",
  ownerId }` (unpaid, never finished — **does not block**). Built on
  `findOwnerIdByEmail` (`lib/ownerEmailAvailability.ts`, still the single
  `venue_owners`-by-email query) → `findPendingSignupByOwnerId`. Both
  `POST /api/signup/email-available` and `POST /api/owner/signup` go through it
  (contract test pins this). Fails **closed**: any read error is `{ ok: false }`,
  never a `kind`. `ownerEmailExists()` survives as a thin boolean reading of
  `findOwnerIdByEmail` but has no live caller.
- **The pending-signup predicate is `findPendingSignupByOwnerId` in
  `lib/pendingSignup.ts` — four load-bearing clauses, none optional, fails
  closed.** (1) a `venue_owners` row exists; (2) ≥1 linked venue and **every**
  linked venue is `hidden = true` AND `self_serve_created_at` stamped AND not at
  `(0,0)` — reuses `isSelfServeVenueRow` / `isPlaceholderVenueRow` /
  `isAdminHiddenVenueRow` from `lib/venueClaim.ts`, never re-derived; (3) **no
  `billing_subscriptions` row** for the owner or any linked venue, ever, any
  status (a cancelled subscriber keeps its row precisely as this proof); (4) the
  auth user is unreferenced by the seven FK consumers — calls
  `authUserIsUnreferenced(authId, { ignoreVenueOwnerId })` from
  `lib/signupSweep.ts`, never copied. Anything failing a clause is not pending
  and is never touched. `ok: false` and `pending: null` are different answers —
  a caller must never collapse them.
- **`purgePendingSignup(ownerId)` (`lib/pendingSignup.ts`) is the only
  Stripe-safe teardown.** It **re-runs the full predicate itself** before
  deleting anything (a caller's prior lookup is not permission to skip it), then:
  cancel incomplete Stripe subscriptions (via `sweepAbandonedIncompleteSubscriptions`
  in `lib/stripeIncomplete.ts` — shared with `POST /api/owner/billing/checkout`,
  which uses the OPPOSITE failure policy: checkout ignores the result, the purge
  aborts on it) → delete venues → delete `venue_owners` → delete the auth user.
  A Stripe failure aborts with **nothing** deleted; `stripe === null` is not a
  failure. A caller must not assume the email is free unless `ok === true`.
  (4.1a: the Stripe cancel is skipped entirely when every linked venue has
  `checkout_started_at IS NULL` — nothing reached Stripe to cancel.)
- **Retry is SUPERSEDE, not resume, and it works at t=0.** When
  `POST /api/owner/signup` finds a **pending** collision on the submitted email,
  it calls `purgePendingSignup()` and continues the new signup — no 409, no
  branch shown to the partner, no latency, whether they came back after ten
  seconds or ten days. Logs `[OwnerSignup] pending-signup-superseded`. The purge
  runs **before `findNearbyVenue`** or the partner's own abandoned venue is
  rediscovered as a duplicate at their own address. A `kind: "account"` collision
  still 409s. The accepted trade: a stranger who knows a partner's email can
  destroy that partner's in-flight pending signup — accepted because the record
  has no payment/gameplay/identity, the attacker learns nothing the enumeration
  oracle does not already disclose, it is rate-limited, and the cost is retyping
  an unfinished form. `docs/abandoned-signup-cleanup-plan.md` §2.
- **`POST /api/owner/signup/abandon` (auth: `requireOwnerAuth`, never an email in
  the body) is the explicit "Cancel and start over".** Resolves the caller's own
  owner id → `findPendingSignupByOwnerId` → `purgePendingSignup` → clears the
  owner session cookie on success only. A non-pending owner gets `409 { code:
  "not_pending" }` and nothing happens. Flag-gated (404 when off), **not**
  rate-limited (an authenticated owner deleting their own debris is not a spam
  vector) — deliberately NOT in `PUBLIC_SIGNUP_ROUTES`. The `/owner/billing/setup`
  button renders only when `venueId` is set and there is no subscription row.
- **A `no_venue` 401 routes to the signup flow, not the login page.**
  `requireOwnerAuth` distinguishes `no_session` (no/bad cookie → `/owner/login`)
  from `no_venue` (a **valid, correctly signed** cookie whose owner holds no
  surviving venue → `signupEntryPath()`) — the codes and `ownerAuthRecoveryPath()`
  live once in `lib/ownerAuthCodes.ts` (pure, no `server-only`; contract test
  pins the literals appear nowhere else). `no_venue` is what a purged pending
  signup looks like from the browser. Only `app/owner/billing/setup/page.tsx`
  reads the code today; the other ~15 `/owner/*` pages still bare-`push("/owner/login")`
  on any 401 — a known bounded follow-up, `ownerAuthRecoveryPath` is one line each.
- **`OWNER_EMAIL_TAKEN_MESSAGE` (still defined once in
  `lib/ownerEmailAvailability.ts`) is reachable ONLY for `kind: "account"`.**
  `EmailStep` renders its sign-in link on `error && taken`, and the wizard sets
  that state only from a `available: false` pre-check or a `409 { code:
  "email_taken" }` submit — both of which now fire only for a real account. The
  message must NOT carry a raw `/owner/login` path. A contract test pins all of
  this (`both callers go through the shared classifyEmailForSignup`).
- **`/api/signup/email-available` is an email-enumeration oracle, accepted
  narrowly.** The disclosure already existed — a signup form cannot refuse
  duplicate accounts and hide that it did — so the pre-check changes the *cost*
  of enumeration, not the fact of it. That cost is controlled by its own
  `emailCheck` bucket, which is an **hour-long window on purpose** (sized
  against someone walking a list, not against burst traffic). Do not widen it to
  a per-minute window, and do not add a GET/query-string variant.
- **The step-2 pre-check FAILS OPEN; the submit fails closed.** A 404, 503, 429
  or dead network on `/api/signup/email-available` lets the partner through,
  because `POST /api/owner/signup` re-runs the same lookup and is the authority.
  Only a definite `available: false` blocks. Never invert this — a UX pre-check
  that can wedge the whole wizard when a non-essential route is unhealthy is
  worse than the dead end it replaced. Conversely, a lookup *failure* must never
  be collapsed into `available: true`.
- **An attacker-supplied venue id must pass the SAME eligibility predicate as
  proximity discovery.** `POST /api/owner/signup` takes an optional
  `claimVenueId` from the request body; it is attacker-controlled and never
  trusted as proof of anything. The claim/placeholder/provenance predicates live
  in **one place, `lib/venueClaim.ts`** (`isClaimableVenueRow`,
  `isPlaceholderVenueRow`, `isSelfServeVenueRow`, `isAdminHiddenVenueRow`,
  `claimableDistanceMeters`, plus the shared `VENUE_CLAIM_COLUMNS` select),
  called by **both** `findNearbyVenue` and the claim branch. `route.ts` must not
  import `calculateDistanceMeters` or hand-list venue columns — the contract test
  fails the build if it does.
- **A venue at `latitude = 0, longitude = 0` is a placeholder or internal room
  and is NEVER claimable, joinable, or revealable.** Both Category Blitz global
  rooms are seeded there. This clause is `isPlaceholderVenueRow` in
  `lib/venueClaim.ts`; the Stripe webhook's reveal update also carries
  `.or("latitude.neq.0,longitude.neq.0")` (NOT two `.neq` filters — that would
  exclude a real venue on the equator or prime meridian).
- **`self_serve_created_at` is a capability grant, not a timestamp.** Writing it
  simultaneously arms `maybeRevealVenue` (publish the venue to every player's
  join list) and `sweepAbandonedSignupVenues` (the retention sweep — see the two
  TTL tiers below). Never
  stamp a row this flow did not create; guard the stamp on the stamp itself
  (`isSelfServeVenueRow`), never on `hidden`. A stranger must not get a
  `venue_owner_venues` row to an admin-created hidden venue at all —
  `isAdminHiddenVenueRow` refuses it outright on both the claim and discovery
  branches.
- **`/api/signup/maps-key` fails closed.** It serves `GOOGLE_MAPS_BROWSER_KEY`
  via `publicBrowserGoogleMapsKey()` or returns **503** with
  `[SignupMapsKey] browser-key-unset` — it must never fall back to the
  unrestricted server key. Only `/api/admin/maps-key` (authenticated) keeps the
  fallback, via `browserGoogleMapsKey()`.
- **Two Google Maps keys, one Cloud project (`lib/googleMapsKeys.ts`).**
  `browserGoogleMapsKey()` = `GOOGLE_MAPS_BROWSER_KEY` (HTTP-referrer-restricted
  to our hosts), falling back to `GOOGLE_MAPS_API_KEY` if unset — **authenticated
  surfaces only**. `publicBrowserGoogleMapsKey()` = `GOOGLE_MAPS_BROWSER_KEY` or
  `""`, no fallback. `serverGoogleMapsKey()` = `GOOGLE_MAPS_API_KEY`, and is the
  **only** server-side reader of that var (Places / Static Maps / Geocoding
  `fetch`; the shared Static Maps builder is `lib/venueStaticMap.ts`); it **must
  not be referrer-restricted** (a server request has no `Referer`). Do not
  collapse these into one key or read `GOOGLE_MAPS_API_KEY` inline anywhere else —
  the contract test enforces both. Risk #1 + the exact Cloud Console steps:
  `docs/self-serve-signup-runbook.md` §2.
- **The signup rate limiter is atomic in Postgres.** The quota decision is the
  `claim_signup_attempt` RPC — a count-guarded insert under
  `pg_advisory_xact_lock`, same pattern as `award_cycle_winner`. `lib/rateLimit.ts`
  is one `.rpc()` call and computes nothing; it fails **closed** on any error,
  including a missing function (mid-deploy skew:
  `[SignupRateLimit] claim_signup_attempt-missing`). Never re-implement the guard
  as a TypeScript read-then-write — that is the bug it replaced.
- **`POST /api/owner/signup` is limited in TWO tiers, and the order is
  load-bearing.** `rateLimitSignupSubmit()` in `lib/rateLimit.ts` is the single
  home of both: an inner bucket keyed on **`IP + normalised email`** (15/hour),
  claimed **first**, then an outer **IP-only** bucket (40/hour). Because
  `claim_signup_attempt` records only *allowed* calls, checking the narrow bucket
  first is exactly what stops one fumbling partner from eating the shared ceiling
  of everyone else on the venue's WiFi — never invert it, and never drop the
  outer bucket, which is the only thing capping an attacker who varies the email.
  The route reads the body **before** the limiter (the inner bucket needs the
  email) but still validates, looks up and writes nothing until the limiter has
  spoken, and the oversized-body **413 is returned after** it so a malformed body
  still costs a slot. `docs/abandoned-signup-cleanup-plan.md` §4.1b.
- **Public `/api/signup/*` routes return generic errors.** Upstream Google / config
  error text goes to `console.error`, never the response body
  (`/api/signup/places` is `"Address lookup is unavailable right now."`). The
  authenticated admin siblings keep their diagnostics.
- **The `/api/cron/signup-sweep` `vercel.json` cron entry
  (`{ "path": "/api/cron/signup-sweep", "schedule": "0 8 * * *" }`) was added
  2026-09-07 on Andrew's explicit instruction**, so the "do not alter
  `vercel.json` unasked" hard boundary was satisfied. Recorded here so the next
  reviewer does not re-flag it; the boundary otherwise still stands.
- **`/api/cron/signup-sweep` is deliberately un-flag-gated** and ships log-only
  (`SIGNUP_SWEEP_DELETE_ENABLED` / `SIGNUP_SWEEP_AUTH_DELETE_ENABLED`, both
  absent). An `auth.users` row with **no email** is an anonymous player session,
  never a partner — the sweep's email filter is what keeps it off the 765 orphan
  player rows in production. See the section below and
  `tests/lib.auth-users-fk-guard.test.ts`.
- **The venue sweep has TWO retention tiers (`lib/signupSweep.ts`), one scan
  partitioned in memory.** **Tier A** (`venues.checkout_started_at IS NULL` —
  never reached Stripe) = `PENDING_SIGNUP_TTL_MINUTES` (server-side env, no
  redeploy; unset/invalid → 60; below `PENDING_SIGNUP_TTL_MINUTES_FLOOR` 15 →
  clamped up with a warning). **Tier B** (stamped) = `SWEEP_ABANDON_AFTER_DAYS`
  (7), measured from the **later** of `self_serve_created_at` and
  `checkout_started_at` — stricter than "keep the 7-day window", so it can only
  KEEP a venue the old predicate would have deleted (a late-settling card, 3-D
  Secure, an overnight bank hold). Never shorten Tier B. `checkout_started_at` is
  stamped by `POST /api/owner/billing/checkout` **after `session.url` is
  confirmed, before it is returned** — placement is a correctness constraint: a
  null value is read as both "one hour is enough" (the sweep) and "nothing at
  Stripe to cancel" (`lib/pendingSignup.ts` §4.1a). The stamp is best-effort
  (logs `[OwnerCheckout] checkout-stamp-failed`, never fails the request).
  Migration `20260909120000_venues_checkout_started_at.sql`. If the column is
  absent the scan falls back to the pre-Phase-4 single 7-day window,
  `tierSplit=false`, `[SignupSweep] checkout-stamp-column-missing` — conservative
  (sweeps later, never sooner); every OTHER read error still fails closed.
  Tier A's TTL is only safe because the `no_venue` 401 (above) routes a swept
  partner into a fresh signup — if that regresses, raise the TTL.
- **Cron cadence: `vercel.json` `/api/cron/signup-sweep` is `0 * * * *`
  (hourly).** Changed from `0 8 * * *` (daily) on **Andrew's explicit written
  go-ahead, 2026-09-09** — recorded here beside the 2026-09-07 precedent so the
  next reviewer does not re-flag it; the "do not alter `vercel.json` unasked"
  hard boundary otherwise still stands. Hourly is so Tier A debris (a signup
  that never reached Stripe) clears within the hour rather than living up to a
  day. The tiers are correct at any cadence; this only tightens the ceiling.

## `auth.users` is SHARED WITH PLAYERS — standing prohibition

`auth.users` is **not** the venue-owner credential store. Seven tables reference
it, and only one of them (`venue_owners`, `ON DELETE CASCADE`) is a partner
credential. The other six belong to PLAYERS — including `accounts.auth_id` and
`users.auth_id`, both `ON DELETE SET NULL`, both actively read and written by
`app/api/join/profile/route.ts`.

`SET NULL` means **deleting an `auth.users` row does not error** — it silently
detaches a player's account from their identity. The `CASCADE` ones delete their
gameplay rows outright.

- **No signup or owner code path may adopt, delete, or reset the password of a
  PRE-EXISTING `auth.users` row.** The tempting shortcut — "this email has no
  `venue_owners` row, so just take over the auth user" — is an **account-takeover
  vector against players**. Do not build it. `POST /api/owner/signup` returns a
  support-contact 409 instead (`[OwnerSignup] orphan-auth-user`).
- Deleting an auth user is legitimate **only** for one the same request just
  created — exactly and only what that route's `unwind()` does.
- Any batch reconciliation (`/api/cron/signup-sweep`) must check
  **every** consumer table before deleting, not just `venue_owners`.
- **AN `auth.users` ROW WITH NO EMAIL IS AN ANONYMOUS PLAYER, NEVER A PARTNER.**
  `lib/auth.ts`'s `signInAnonymously()` (three call sites in `JoinFlow.tsx`)
  mints one per anonymous visit, and a visitor who never finishes joining a venue
  never gets an `accounts` or `users` row — so **765 of production's 966 auth
  users are "orphans" by the seven-table test and every one of them is a player**
  (measured 2026-09-07). The seven-table guard alone is NOT sufficient; the sweep
  additionally requires an email, and `POST /api/owner/signup` always sets one.
  Never delete an emailless auth user to "fix" a signup. Size it first with
  `npm run signup:check-orphan-auth-users` (read-only).
- **`tests/lib.auth-users-fk-guard.test.ts` is the tripwire.** It pins the exact
  set of seven tables and their on-delete rules; an eighth consumer fails it.
  Run `npm run test` after any migration that touches an `auth.users` FK.

## Venue Visibility (`venues.hidden`, the reveal / re-hide lifecycle)

- **`venues.hidden` is soft.** It removes a venue from the join list — and that
  exclusion happens in exactly **one** place, `listVenues()` in `lib/venues.ts`
  (`hidden.is.null,hidden.eq.false`). Already-joined players, direct URLs, the
  owner dashboard and the TV screen are all unaffected. Do not harden this into a
  real access gate without a separate, explicit decision.
- **`lib/venueVisibility.ts` is the single home** of `shouldRevealVenue` /
  `shouldRehideVenue` / `shouldRestoreVenue` — one truth table, all three built on
  `classifyBillingRow()` from `lib/billing.ts` and on `lib/venueClaim.ts`'s
  `isSelfServeVenueRow` / `isPlaceholderVenueRow`. Never re-derive the
  live/not-live predicate, the self-serve-provenance test, or the `(0,0)`
  placeholder clause at a call site.
- **Never compute `current_period_end < now` in a visibility path.** Stripe's
  subscription status already encodes cancel-at-period-end and dunning;
  `classifyBillingRow()` reads the status, not the dates.
- **Never delete a `billing_subscriptions` row on cancellation.** That row is the
  only thing keeping `sweepAbandonedSignupVenues` from deleting a re-hidden real
  venue.
- **Both webhook followers (`maybeRevealVenue`, `maybeRehideVenue`) are
  best-effort by design** — each fires once and swallows its error so a cosmetic
  failure can't make Stripe retry the whole billing sync. **`/api/cron/billing`
  is the repair path** (`lib/venueVisibilitySync.ts`, daily, bounded,
  `isCronAuthorized`, no `rateLimit()`): `repairMissedVenueReveals` re-does a
  missed reveal, and `reconcileLapsedVenues` runs three jobs — **restore** (a
  venue we hid, once billing is live again), **re-hide** (a lapsed self-serve
  venue), and **report** (count-only, lapsed admin-activated venues; never
  touched). A visibility bug is fixed in the reconciler, **never** by making a
  follower throw.
- **Re-hide / restore are wired, flag-gated, and ship LOG-ONLY.**
  `VENUE_REHIDE_ENABLED` (server-side, **no** `NEXT_PUBLIC_` — it flips without a
  redeploy), single reader `isVenueRehideEnabled()` in `lib/venueVisibility.ts`.
  Off (today's default) = `maybeRehideVenue` returns early and the cron's
  restore + re-hide jobs run in dry-run mode (they log `[VenueVisibility]` lines,
  write nothing); the report job always runs. `?dryRun=1` on the cron forces the
  same. Cutover: read a week of dry-run lines, then set the flag. Full plan:
  `docs/lapsed-venue-rehide-plan.md`.
- **`venues.rehidden_at` is provenance, not bookkeeping** — it is the only thing
  telling "we hid this because they lapsed" (restorable) from "an admin hid this
  on purpose" (never auto-restore). Written by `maybeRehideVenue` and the cron
  re-hide job; **cleared by `maybeRevealVenue`, `repairMissedVenueReveals` and
  the cron restore job**. Rule with no exceptions: whatever un-hides a venue
  clears `rehidden_at` in the same write. Migration
  `20260908130000_venues_rehidden_at.sql`, live.
- **Admin sees hidden venues in the "Hidden venues" panel** (bottom of the
  Venues section — `HiddenVenuesPanel`, `GET /api/admin?resource=hidden-venues`
  → `listHiddenVenues`). Rows are badged **lapsed** (`rehidden_at` set — the
  reconciler hid it), **admin-hidden** (`hidden`, no stamp), or **system room**
  ((0,0) placeholder). Only lapsed rows get a **Restore (unhide)** button
  (`POST resource=venue-visibility action=restore` → `restoreLapsedVenue`), which
  clears `rehidden_at`. The manual restore is deliberately **billing-agnostic**:
  if the subscription is still not live the nightly reconciler re-hides the venue
  on its next run, so the real fix is a live subscription — the panel copy says
  this. `restoreLapsedVenue` refuses anything that is not a genuine lapsed row
  (guarded on `hidden = true` AND `rehidden_at IS NOT NULL` AND self-serve-stamped
  AND not (0,0)), so it can never publish a Category Blitz global room.

## Architecture & Database Patterns
- **Client Queries:** Use `lib/supabase.ts` via `createClient(url, anonKey)`. Subject to RLS.
- **Server/API Queries:** Use `lib/supabaseAdmin.ts` via `createClient(url, serviceRoleKey)`. Guarded by `"server-only"`, bypasses RLS. Used for server-side mutations inside API routes.
- **State:** `AuthSessionProvider` (Context + useReducer) handles auth state. Otherwise, use component-level `useState`. Do not introduce Redux or Zustand.
- **Types:** Manually maintained in `types/index.ts`. Do not look for or assume auto-generated Supabase types.
- **Dev Mode:** React Strict Mode is disabled in `next.config.ts`. Do not assume double-mount behavior during debugging.

## Join/Login Flow (Auth-First)
- **Canonical order:** `auth-method-selection` ("How do you want to continue?" — Face ID/Touch ID, Username/PIN, or Create Account) → username → PIN/passkey → **only then** the venue list.
- **Geolocation runs after authentication, never before.** The initial page load (`JoinFlow.tsx`'s load effect) picks only the entry panel — it does not call geolocation, geofence-filter venues, or show the location-permission panel. All venue-list construction happens in `buildVenueListAfterAuth`, triggered by a `useEffect` keyed on `activePanel === "venue-list"` (guarded by `venueListBuiltRef` so it runs once per session).
- **God Mode accounts (`accounts.god_mode`) see ALL venues, with zero geolocation calls.** Every other account gets exactly one geolocation check and sees only in-range venues (existing geofence math, unchanged). `buildVenueListAfterAuth` decides this by calling `getGodMode()` — which is safe to trust only because every auth-success path (`saveGodMode(account.godMode)`) already persisted the server-confirmed value before the venue-list panel/effect can run. There is no unauthenticated god-mode lookup anywhere in this flow — do not add one; it would be a username-enumeration leak.
- **God Mode venue entry is server-authoritative.** `/api/join/profile` reads `accounts.god_mode` and must remain the source of truth for allowing Andrew, marc, Rick, and any future God Mode account to join any venue from anywhere. Do not place browser geolocation, `locationVerified`, or localStorage-based gates in front of the account-backed profile resolution path; client geofence checks are only UX prechecks for normal users and must not be able to block God Mode.
- **The join venue list is generation-tagged (Phase 2C, 2026-10-08).** `JoinFlow` never sets the list directly: `beginVenueListBuild()` empties it before any await, `commitVenueList()` drops a stale build, and the panel renders `visibleJoinVenueList()` (`lib/joinVenueList.ts`, which also owns the one geofence filter `filterVenuesInRange`). Every `venueListBuiltRef` reset goes through `discardVenueList()`. This is what stops a God Mode account's "every venue" list showing behind the next player's location check. The deep-link load path only warms the venue cache.
- **Run `npm run test:god-mode-join` after touching join/geofence/auth flow.** This named tripwire includes a static guard that fails if account-backed venue selection starts calling browser geolocation before server profile resolution again.
- **`venueListBuiltRef` must be reset** whenever the user returns to `auth-method-selection` (sign-out, back navigation) so the next login rebuilds the list fresh. It must NOT be reset by in-session back-navigation to the venue list itself (e.g. from a venue-login sub-screen) — that should reuse the already-built list, not re-prompt location.
- **Full history/rationale:** `docs/join-flow-location-error-plan.md`.

## Navigation (Back / Next / Sign Out) — unified 2026-09-05

Full as-built record, per-phase: `docs/navigation-unification-plan.md` (Phases 0–7 all
shipped; only a real-device visual pass remains, §13c).

- **There are exactly four navigation primitives, all in `components/navigation/`.**
  Do not hand-roll a fifth, and do not re-implement any of their behavior inline:
  - `ExitBackButton` — **THE** Back. "Leave this screen for its parent." A neutral
    dark-slate 34px circle with a Lucide `ChevronLeft`, exactly one per screen, pinned
    **top-left in the sticky header** — never inline in content, never at the bottom,
    never in a wizard footer.
  - `StepBackButton` + `NextButton`, composed by **`WizardFooter`** — step progression
    inside a multi-step flow. Rendering `<StepBackButton>`/`<NextButton>` anywhere but
    `WizardFooter.tsx` fails the tripwire.
  - `SignOutButton` — "leave your account." Lives as the **last** item of an account
    drawer / sidebar footer, below a divider, so it can never sit next to Back. It
    **never renders an arrow** (an arrow reads as Back).
- **Back's behavior lives in `components/navigation/exitNavigation.ts`, not in the
  component.** `useExitNavigation` owns the precedence order (`onExit` → `venueHomeFallback`
  → history), the installed-PWA hardening (`history.length <= 1` → internal referrer →
  `href`), the 150ms post-`history.back()` fallthrough, and the venue-game return
  transition. Never copy this logic to a call site.
- **The warm red-orange exit pill is RETIRED.** `.tp-exit-pill`, `.ht-btn-exit`, the
  `--ht-exit-*` CSS vars and the Tailwind `ht.color.exit` scale were all deleted in
  Phase 7. Back is neutral slate on every surface and is **never tinted per game** —
  that neutrality is exactly what lets the identical button sit on Bingo's felt,
  Category Blitz's emerald and Live Trivia's cyan. Use `tone="light"` (not a new
  component) for the admin and `/owner/*` white-card surfaces.
- **All auth teardown goes through `SignOutButton`/`performSignOut`.** `signOut()`,
  `clearVenueSession()` and the three logout endpoints (`/api/join/logout`,
  `/api/owner/auth/logout`, `/api/admin/logout`) are called from `SignOutButton.tsx`
  and nowhere else. Two allow-listed exceptions exist and are **not** sign-outs:
  `JoinFlow` dropping a stale Supabase session mid-login, and `VenueHubClient`'s
  arrival watchdog. Add teardown to the button, not to the call site.
- **The player account drawer is ONE component: `components/navigation/AccountDrawer.tsx`** (scrim, "Menu" header +
  Close, scroll lock, native Back). The venue hub and the in-game `AccountMenu` render it with their own contents as
  children; never copy the shell back into a host (`tests/account-drawer.test.ts`). Its Back registration is the one
  pinned in `tests/native-back-review-fixes.test.ts`.
- **Host shells own the Back slot, not the pages.** Player content pages pass
  `PageShell backTo={…}`; dark `/owner/*` pages pass `OwnerShell backTo={…}` (the compact
  app bar; **no Sign Out there** — see the Partner Dashboard bullet below); the four `GameAppBar` games inherit it from
  `components/venue/AppBar.tsx`'s defaulted `leading` slot. Do not add a page-level
  back link that bypasses its shell.
- **Partner Dashboard app shell (2026-09-30, `docs/partner-dashboard-app-redesign-plan.md`).**
  The dashboard's top-left is the **logo menu button** (`components/owner/OwnerAppBar.tsx`),
  not Back; it opens `OwnerMenuDrawer`, where **Sign Out is the last row** — the only place a
  dark `/owner/*` partner signs out (`OwnerAccountMenu` survives only for the orphan `/owner/category-blitz`, light variant). The
  `SignOutButton` host allowlist is `OwnerAppBar.tsx`. Two overlay primitives, both built on
  `components/owner/sheet/useModalOverlay.ts` (controlled `open`, topmost-only Escape, Tab trap,
  popup scroll lock, portal): `OwnerSheet` (slide-up, flows) and `OwnerMenuDrawer` (left).
  Flow sheets mirror their step in the URL (`?sheet=&step=`, `lib/useOwnerSheet.ts` — native
  `history.pushState` with a depth counter, so Close pops every entry) so the phone's Back
  steps back or closes; **never `router.push` a sheet step**. A step a flow can't show (a reload lost
  its data) is fixed with `nav.correctStep()`, which pops to the screen below when the sheet pushed
  it (no duplicate entry) — don't rewrite it in place by hand (join-merch plan Phase 4.2). Do not hand-roll a modal, sheet
  or toast for `/owner/*`: use those, `DiscardGuard` (closing a flow with entered answers asks
  first — Close, Escape, scrim, and a phone Back that would leave the sheet; a flow's own closes
  go through `closeWithoutAsking`) and `DashboardToast`. `CreateRewardWizard` stays one shared component — its owner
  behaviour is four opt-in props and the admin snapshots pin that it is unchanged.
  `tests/owner-menu-contract.test.ts` and `tests/owner-dashboard-contract.test.ts` are the
  tripwires; `docs/partner-dashboard-app-redesign-device-checklist.md` is Andrew's device pass.
- **Run `npm run test` after touching any navigation control** —
  `tests/navigation-controls-contract.test.ts` is the standing static tripwire (7
  assertions: no raw `←` in player-facing TSX, no retired warm-pill literals, the
  sign-out/endpoint allowlists, the `WizardFooter`/`SignOutButton` host allowlists, and
  that `BackButton.tsx` stays deleted). It runs under plain `npm run test`, not a named
  `test:*` script. Phase 1 also touched the landscape bingo chrome, so
  `npm run test:pwa-contract` applies there, and any change to `JoinFlow`'s wizard
  footer still requires `npm run test:god-mode-join`.

## Join Merch Store (Partner Dashboard — built 2026-10-01, look-only)

Plan: `docs/join-merch-store-plan.md` (phases, model/effort, Andrew's decisions). Phases 1–4.6 are
done (committed locally on `main`; push/deploy is Andrew's call — the plan's status line has the
commit and latest handoff). Phone pass: `docs/join-merch-store-device-checklist.md` (Andrew only).
Store UI: `components/owner/store/` (`MerchStoreSheet`, `MerchProductCard`, `CoasterPackSelect`,
`QuantityStepper`, `MerchOrderBar`, `MerchReviewStep`, `FreeQrDownload`). A flow sheet that swaps steps passes `scrollKey` to `OwnerSheet` so each
step opens at the top — don't hand-roll a scroll reset.
- **Light surfaces opt out of the global dark form CSS via `ht-light-surface`** (Phase 4.4). The
  light `OwnerSheet` panel carries that class, and `app/globals.css`'s bare `button` /
  `a[role=button]` / `input` / `select` / `textarea` (+ `:focus`) and `.tp-clean-button` rules are
  written `…:where(:not(.ht-light-surface *))` (zero added specificity, so nothing else changed).
  Controls inside it use plain Tailwind — **never add `!` utilities there**; a new global form rule
  that sets a border or weight must carry the same `:where()` (pinned by
  `tests/light-surface-css-contract.test.ts`).
- A menu row **Order Join Merch** (below Venue Display) opens a **white** slide-up store sheet on
  the dashboard, `?sheet=store[&step=review]` (URL-mirrored like Schedule/Rewards, not local state
  like the Partner Manual). It sells QR "join merch": Round Coasters, Square Coasters (packs of
  100/250/500/1,000 at $30/$60/$100/$175), Table Tents ($4 each), Table Card with Holder ($8 per set).
- **Look-only for now (Andrew's decision):** the final button is "Ordering opens soon". No order is
  saved, no card is charged, no request is sent. `components/owner/store/` must contain no
  `fetch(`. Real orders/payment (Phase 5) and the 3PL integration (Phase 6) are future,
  unscheduled phases. Do not start them without Andrew.
- **Visible to every partner, with no feature flag** (Andrew's decision). Don't add one unasked.
- **One cart per venue, store hosted by the page.** `lib/useVenueMerchCart.ts` keys carts by venue (a
  venue switch never moves a cart). `MerchStoreHost` in `app/owner/dashboard/page.tsx` sits outside
  `DashboardBody`, so the menu row opens the store while venues load or with no venue (`venue: null`
  → Shop + free QR work, Review is off). The menu never `router.push`es a sheet URL.
- **One file edits products/prices/copy: `lib/merchCatalog.ts`.** Money is **integer cents**.
  Pricing math lives in `lib/merchPricing.ts`. Components never hold price literals.
- **White must match the photos:** they sample ≈ `#FEFEFE`. Use the `ht-store-paper` token (never an
  ad-hoc hex) plus `mix-blend-multiply` on product images. Serve the pre-optimized WebP files in
  `public/store/web/` (`npm run store:images`); the source PNGs live in `assets/store-src/` (not served).
- `OwnerSheet` gets a `tone="light"` variant for this. The dark tone (Partner Manual, Schedule,
  Rewards) must stay unchanged.
- **No per-item price calculation** (Andrew, 2026-10-01): no per-coaster price in the UI, and the
  order draft carries no derived per-piece price. Don't reintroduce one.
- **The join QR points to `https://play.hightopchallenge.com` — PERMANENT.** It is printed on merch
  and offered as a free PNG/SVG download in the store. Its single source is the literal in
  `lib/joinQr.ts` (never env-derived). The files under `public/store/qr/` are generated by
  `npm run store:qr` (`scripts/generate-join-qr.cjs`); `tests/lib.join-qr.test.ts` decodes them and
  fails if they drift. Never change the URL — printed merch can't be updated.

## Multi-Venue Volume Billing — Phases 1–5 pushed, Phases 6–6.9 admin tools + review fixes built (flag off)

Plan: `docs/multi-venue-volume-billing-plan.md` (Andrew's answers in §2 — don't re-ask); latest handoff
`docs/multi-venue-volume-billing-plan_PHASE_6.9_HANDOFF.md`. One Stripe subscription per partner, quantity =
venues, graduated $100 / $75 / $60 / $45. Migration `20261011134820` is applied; every card subscriber is on
the graduated Price `price_1UPOUD1djkdMC76XYeVsQXKl` (lookup key `hightop_venue_graduated_monthly_v1`) at
quantity 1, and new Checkouts start on it via `getCheckoutPriceId()` in `lib/stripe.ts`
(`STRIPE_GRADUATED_PRICE_ID`, else `STRIPE_PRICE_ID`). `npm run billing:graduated-price` re-checks the live tiers.
- **"Which bill covers this venue?" has ONE home: `lib/venueBilling.ts`** (`loadBillingForVenue(s)`,
  `venueIdsEverBilled`, `venueIdsOnBill`). `billing_subscriptions.venue_id` is the bill's ANCHOR venue;
  other venues on a bill are rows in `billing_subscription_venues` (a trigger adds every bill's anchor
  row). Never `.eq/.in("venue_id")` on `billing_subscriptions` elsewhere — the destructive paths (signup
  sweep, pending-signup purge) would miss a chain venue. `tests/venue-billing-resolver-contract.test.ts`.
- **Prices have ONE home: `lib/venuePricing.ts`** (integer cents). A price change = a new Stripe lookup key.
  The Stripe webhook mirrors `amount_cents` = the whole bill (flat × quantity, or the bands for a tiered
  price, whose `unit_amount` is null) plus `quantity`.
- **Partner email wording lives in `lib/email/partnerEmailCopy.ts`** (Andrew edits it; welcome + "Venue
  added"). Preview: `npm run email:preview`. Builders only lay it out.
- **Check-paying (offline) accounts never lapse automatically** (Andrew, 2026-10-11). `/api/cron/billing`
  no longer expires an offline grant past its paid-through date; only an admin Revoke ends it. Don't
  reintroduce an expiry sweep (`tests/api.cron.billing-offline-never-lapses.test.ts`).
- **"Add a venue" (Phase 3) lives in ONE file: `lib/venueAddition.ts`.** Routes `GET /api/owner/venues/add/quote`
  and `POST /api/owner/venues/add` 404 unless `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` (single reader
  `isMultiVenueBillingEnabled()`, `lib/multiVenueBilling.ts`, which also holds the client types + refusal
  copy). Money rules: claim the ledger row first (`claim_venue_addition` RPC, advisory lock per bill, one add
  in flight, same idempotency key → same row; migration `20261011153607`), then a hidden venue stamped
  `self_serve_created_at` + `checkout_started_at` in ONE insert (sweepable, never visible first), then ONE
  `stripe.subscriptions.update` with `payment_behavior: "pending_if_incomplete"` + `proration_behavior:
  "always_invoice"` keyed on the ledger key. Paid → membership (`addVenueToBill`, the only non-anchor
  membership writer, in `lib/venueBilling.ts`) + owner link + reveal + "Venue added" email once (claim-then-
  send stamp). Declined → VOID the invoice before deleting the venue. 3-D Secure → `requires_action` +
  hosted invoice URL; `invoice.paid` (webhook) or `reconcileStaleVenueAdditions` (daily `/api/cron/billing`)
  finishes it. Completion/reconcile are deliberately NOT flag-gated. The venue is linked to the partner
  only once paid. Pinned by `tests/multi-venue-billing-contract.test.ts`; behaviour in
  `tests/api.owner.venues-add.test.ts`. `findNearbyVenue` moved to `lib/nearbyVenue.ts` (shared with signup).
- **"+ Add a venue" UI (Phase 4, 2026-10-11)** — `components/owner/add-venue/` (`AddVenueSheet`, `AddVenueReviewStep`)
  + pure logic in `lib/addVenueFlow.ts`; sheet id `add-venue` (`?sheet=add-venue[&step=map|review]`). Shown only
  when `isAddVenueAvailable()` (`lib/multiVenueBilling.ts`) = billing flag AND `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`,
  because it reuses signup's `AddressStep`/`GeofenceStep` and so `/api/signup/places` + `/maps-key`. The dashboard
  Dropdown is always a dropdown then (`footerAction`). Never price anything in the UI (the quote has every number);
  one idempotency key per Confirm (`newAttemptKey`), re-asks reuse it; a new key only after a definitive refusal.
  After a paid add the page reloads venues via `fetchOwnerVenues()` (`lib/ownerVenuesClient.ts`) — the page file must
  not name `/api/owner/venues` (first-load tripwire). `tests/add-venue-ui-contract.test.ts`. **Never exercise the
  real POST from a dev server** (live Stripe + shared DB): Andrew's `next dev` holds `.next/dev/lock`, so browser-test
  from a scratchpad clone with no `.env.local` and mocked routes (Phase 4 handoff §5), and never `pkill next-server`.
- **Remove at end of month / Undo / Add back (Phase 5, 2026-10-11) live in ONE file: `lib/venueRemoval.ts`**, route
  `POST /api/owner/venues/remove` (`action: "remove" | "undo"`, flag-gated 404). Remove = Stripe quantity −1 with
  `proration_behavior: "none"` (no credit) + membership `remove_at` = period end; the venue stays live until then, and the
  daily `/api/cron/billing` (`applyDueVenueRemovals`) hides it (`hidden = true, rehidden_at = now`) and stamps
  `removed_at`. Undo = +1, also `"none"`, only before `remove_at`. After that, putting it back is a PAID **Add back**:
  `POST /api/owner/venues/add` with `readdVenueId` (no new venue; `addVenueToBill` revives a same-bill row). Every change
  is claimed by `claim_venue_bill_change` under the SAME advisory lock as `claim_venue_addition` (migration
  `20261011210033`), and each refuses while the other is in flight — any `items` update voids an add's pending 3-D
  Secure payment. `finish_venue_bill_change` applies the membership change + re-anchor (anchor leaving → another billed
  venue becomes `billing_subscriptions.venue_id`, and Stripe `metadata.venueId` follows) only after Stripe accepted it.
  "Billed" = `removed_at IS NULL AND remove_at IS NULL` (`isBilledMembership`, = the RPC count = Stripe's quantity).
  Billing page account view: `components/owner/billing/BillVenuesPanel.tsx` + pure `lib/billAccountView.ts`; numbers come
  from `GET /api/owner/billing` `account` (only when the flag is on). Tests: `tests/api.owner.venues-remove.test.ts`.
- **A negotiated custom rate is PER VENUE (Andrew, 2026-10-11, Phase 6).** `lib/billingCustomPrice.ts` swaps the item onto
  a flat `custom_monthly_<cents>` Price and KEEPS the quantity, so the bill = rate × venues (no bands); adds/removes on
  that bill use the same rate; a coupon still applies on top. `setStandardPrice` (admin "Back to standard pricing")
  returns it to the graduated Price. **The swap is a CLAIMED change under the bill's advisory lock** (Phase 6.1:
  `claim_bill_price_change` / `finish_bill_price_change`, a `'price'` row in `billing_venue_changes`, migration
  `20261011224839`) — mutually exclusive with adds and Remove/Undo inside Postgres; never a TypeScript read-then-write;
  a missing RPC fails closed (503 `[CustomPrice] claim-rpc-missing`). A bill's rate has ONE home:
  `BillRate` in `lib/venuePricing.ts` (`billRateFromPrice` for a live Stripe item — a per-venue rate ONLY for a
  `custom_monthly_` lookup key (`CUSTOM_PER_VENUE_LOOKUP_PREFIX`, the one home of that literal); any other flat Price is
  refused, as `custom_rate` (hand-pasted) or `billing_state` (list Price) via `unratedPriceRefusal` —
  and `billRateFromMirror` for displays). Never price a chain with `monthlyTotalCents` alone where a rate is in play.
- **Confirm carries the quoted price (Phase 6.5).** Every add Confirm (partner sheet, Add back, admin "Add to their
  bill") sends the quote's `thisVenueCents` as `quotedVenueCents`; `startVenueAddition` re-checks it after the claim
  and before any venue insert or Stripe write (`quotedPriceMatches`) and refuses `quote_changed` (409) on any mismatch
  or a missing value — the client re-quotes. Any 5xx reply to an add is "unconfirmed" (`interpretAddVenueReply`):
  keep the idempotency key and Check again; a new key only after a 4xx refusal (`refusalEndsAttempt`).
- **One bill per partner is enforced at every bill-opening door** (Phase 6.3/6.5). The rule is `refusesOwnBill` on
  `unbilledVenueStates` (both `lib/venueBilling.ts`): a venue removed from a bill, comped, or whose partner already has a
  live bill elsewhere must not open its own. Owner Checkout refuses `on_partner_bill` (NOT flag-gated, before any Stripe
  call) and so does admin "Grant offline" (before the upsert; the admin list's `grantOfflineBlocked` disables the button).
  Renewing a venue's own live offline bill is unaffected. Copy: `ON_PARTNER_BILL_MESSAGES` /
  `ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES` in `lib/multiVenueBilling.ts`.
- **Admin "Link a venue to a partner" (Phase 6)** — Partner Billing → button → `LinkVenueToPartner`, server
  `lib/adminVenueAttach.ts` (`POST /api/admin/billing` `action: "attach-venue"`, Preview first). "Add to their bill" on a
  card bill runs the partner's own add flow (`startVenueAddition` with `adminAttachVenue`) — never its own Stripe call;
  on a check bill it adds a `role 'admin'` membership and only SUGGESTS the graduated amount. "Free (comped)" = link only.
  The CARD path is refused (`card_add_switched_off`) while `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` is off.
- **Daily drift check (Phase 6):** `lib/billingQuantityDrift.ts`, last job of `/api/cron/billing`, REPORT-ONLY
  (`[MultiVenueBilling] quantity-drift`): Stripe quantity vs `billedVenueCountFromRows`. One Stripe list call per run.
- **A venue whose bill was cancelled can REJOIN the partner's live bill (Phases 6.6–6.7)** — through the same paid add
  (partner Add back / admin "Add to their bill"), never a new money path. `rejoinStateOf` / pure `classifyRejoin`
  (`lib/venueBilling.ts`) say where a venue stands; `addVenueToBill` moves a membership row off a **cancelled** bill
  (`moveFromDeadBill`, the only place a row changes bill) and refuses one on another live bill. `unbilledVenueStates` gives
  `removed`/`lapsed` a `rejoin` target (`{ billId, byCard }`: the bill it left while live, else the partner's live bill);
  **`rejoinBillOf` is the one home** for both Billing views. Refusal copy: `onPartnerBillMessageKey(state, "partner" |
  "admin")` says "Add it back" only where that button exists (partner: card bill + flag; admin: check bill any time, card
  bill only with the flag), else `rejoin_unavailable` (6.9).
- **Anchor-home repair (6.6):** `bringAnchorHome(billId)` moves a LIVE bill's anchor row back from a dead bill (or inserts
  it); best-effort from the webhook's first sync and admin Grant offline, repaired daily by `repairAnchorMemberships`
  (`/api/cron/billing`, keyset-paged by `ANCHOR_REPAIR_PAGE_SIZE`). Never moves a row off another live bill (logs for an admin).
- **The Price's lookup key is mirrored (6.8, migration `20261012033356`):** every writer of
  `billing_subscriptions.stripe_price_id` writes `stripe_price_lookup_key` too (webhook, `lib/billingCustomPrice.ts`,
  Grant offline clears both — contract test). `billRateFromMirror` returns **null** for a flat Price without a
  `custom_monthly_` key (admin `rate: "unrated"`, partner "Custom monthly price", no per-venue math); the graduated key
  on a non-graduated id counts only when the amount matches the bands (a stale key, 6.9). Backfill/check:
  `npm run billing:backfill-lookup-keys` (dry run default).
- **The add ledger records who added the venue:** `billing_venue_additions.membership_role` (`added`|`admin`), set in
  the same write as `venue_id`; completion (request, webhook or cron) uses the STORED row's role. If that write matches
  no `pending` row, the add stops before Stripe (`payment_unconfirmed`, `ledger-write-missed`) — never charge on an
  in-memory copy (6.9). Missing-RPC checks share `isMissingFunction` (`lib/supabaseRpcErrors.ts`).

## POS Rewards Integration (Square / Clover; Toast deferred) — Phases 1–2 built 2026-10-04/05

Committed `27f5eea`, deployed 2026-10-05 with the flag OFF. **Phase 3 (Clover) = our own Clover register app** (Andrew,
2026-10-05): staff scan or type the coupon's code in our app on the Clover register (no staff phones, no Partner
Dashboard login); a QR + typed code on the coupon is OK. Sub-phases 3a–3f in the plan. Never build the original
web staff page. Device routes use Clover's token, never `requireOwnerAuth`.

Plan: `docs/pos-rewards-integration-plan.md`; latest handoff `docs/pos-rewards-integration-plan_PHASE_2h_HANDOFF.md` (2h real-money pilot started 2026-10-06; review fixes `docs/square-review-fixes-plan.md` R1–R5). Earlier (2e: all Square staff/partner copy lives in `lib/posStaffInstructions.ts`; printable sheet at `/owner/pos-staff-sheet`; 2c: no pilot gate; revoked webhook → `error` + "Reconnect needed"; Disconnect never calls RevokeToken while another venue shares the Square merchant. 2d: menu-item prizes → one ready-made Square discount per prize; register cap optional).
- **Dev server ≠ Pacific Street for Square.** Dev and live share one database and a venue holds one Square connection, so a sandbox reconnect from dev would replace the real one. The guard refuses cross-environment changes. Sandbox connect never worked (blank consent page), so **Andrew tests Square changes on the live site** (Andrew, 2026-10-07). The hidden venue `venue-hightop-test` remains. Plan: `docs/square-dev-test-venue-plan.md`.
- **Flag `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`, off by default**, single reader `isPosIntegrationsEnabled()`
  in `lib/pos/providers.ts`. Off = no "Point of Sale" menu row, no `?sheet=pos` host, `/api/owner/pos*` 404s.
- **POS OAuth tokens are only ever stored encrypted** via `lib/pos/crypto.ts` (`POS_TOKEN_KEY`, AES-256-GCM,
  bound to venue+provider+field). Only that file reads the key; `lib/pos/connections.ts` never selects a token
  column. Both are pinned by `tests/lib.pos-foundation.test.ts`. Never store a Square GAN in plaintext.
- Routes reach a provider only through `getPosAdapter()` in `lib/pos/registry.ts`. Register an adapter and flip
  its provider to `available` in `lib/pos/providers.ts` in the same change.
- A prize's register value has one home: `prizePosValueCents()` in `lib/pos/prizeValue.ts`.
  `prize_pos_value_cents` is written only when set and not in `CAMPAIGN_SELECT_COLUMNS` (deploy-skew safety).
- Every POS attempt that moves value for a coupon (gift card create/fund, register discount application) is a
  `pos_reward_applications` row with a UNIQUE `idempotency_key`, inserted BEFORE the provider call.
  Partner-catalog setup writes (the Phase 2d named discount) are not, because their name is their identity
  (Andrew, 2026-10-06, `docs/square-review-fixes-plan.md` #10). No polling crons; token refresh is lazy (Clover
  refresh tokens are single-use — serialise).
- **Square (Phase 2): a gift-card coupon becomes a real Square gift card** when the guest taps "Get my Square
  gift card" (`openSquareGiftCard` in `lib/pos/squareGiftCards.ts`). Order is load-bearing: ledger row →
  create an UNFUNDED card → claim via `redeem_challenge_prize(p_method 'pos_square')` → fund (ACTIVATE) → show.
  The claim sits between create and fund so "Confirm Redemption" and Square can never both pay out. In our
  records the coupon is redeemed the moment it becomes a card; the webhook (`/api/webhooks/square`,
  signature-verified, deliberately NOT flag-gated) only records spending on the ledger row.
- **A Square GAN (card number) is money: never log it, never store it.** The ledger holds the gift card id;
  the number is fetched from Square per open and returned only to its winner (`Cache-Control: no-store`).
  Square's webhook payload also carries the GAN — never log a raw webhook body. Tripwire:
  `tests/lib.pos-square.test.ts`. `SQUARE_*` env vars have one reader, `lib/pos/squareConfig.ts`.
- **Square menu-item prizes (Phase 2d, Andrew 2026-10-06: "preset discount per prize").** Each $-off / %-off /
  free-item prize becomes ONE catalog discount in the partner's Square, named by its terms
  (`squareDiscountSpec` in `lib/pos/squareDiscountSpec.ts`: "Hightop prize: 50% off Appetizer (max $12)").
  **The name is the identity** — `lib/pos/squareDiscounts.ts` searches the catalog for it and creates it when
  missing; nothing is stored, no migration. Changing the name wording mints new discounts at every partner.
  The coupon only shows staff the name (`POST /api/prizes/square-discount`); it is still redeemed ONLY by
  "Confirm Redemption" (method `guest_confirm`). Needs `ITEMS_READ ITEMS_WRITE`: connections from before 2d
  show "Reconnect Square" (`needsMenuPrizeReconnect`); a reconnect keeps the chosen location. The wizard's
  register cap is **optional** (Andrew, §6 item 3): `prize_pos_value_cents` null = no limit, never "can't use POS".

## Loading screen, brand images & the dashboard's one round trip (2026-10-01)

Plan + per-phase as-built: `docs/partner-dashboard-merch-button-loader-speed-plan.md` (Phases 1–7,
handoffs `…_PHASE_<N>_HANDOFF.md`). Measured effect on a simulated new phone (Slow 4G, 4× CPU):
Partner Dashboard **2,056 KB → 352 KB** and **10.4 s → 2.1 s** to the load event; partner sign-in
**3,714 KB → 458 KB**. Andrew's device pass (section **H** of
`docs/partner-dashboard-app-redesign-device-checklist.md`) is still open.

- **`components/ui/HightopLoader.tsx` is the ONE loading screen in this app, players and
  partners alike** (Andrew, 2026-10-01: "everywhere. Get rid of the basketball"). The logo
  pops in, then hops and spins, alternating direction. `components/ui/BouncingBallLoader.tsx`
  is **deleted** — do not reintroduce it or any second loader. Keyframes live in
  `tailwind.config.ts` (`logo-burst` / `logo-hop`, transform+opacity only), **not**
  framer-motion, so the loader can show before a page's JavaScript runs; Reduce Motion gets a
  soft fade pulse instead. Tripwires: `tests/owner-loader-contract.test.ts`,
  `tests/hightop-loader-contract.test.ts`, `tests/components.hightop-loader.test.ts`.
- **The show-delay/minimum-visible logic is `lib/useLoaderVisible.ts`, and the CALLER holds it.**
  The hook keeps a fast load from flashing a loader and a shown loader from blinking off. Drive
  it from the page that knows when its data has landed — don't put a timer inside
  `HightopLoader`, and don't add a second delay at a call site.
- **`app/owner/loading.tsx` exists so partner route transitions never fall back to the root
  player loader.** Keep it.
- **The Partner Dashboard app bar's trailing slot is an "Order Join Merch" button**
  (`ShoppingBag` + label), shown only where `OwnerAppBar` has no `leading` prop — i.e. the
  dashboard; sub-pages keep the 40 px spacer that centres their title. Below 360 px the label
  is **"Store"** (Andrew's Q3). It calls `openDashboardSheet("store")` → `pushSheet`, **never
  `router.push`**. The `ExplodingLogo` that used to sit there is gone from this bar only. The
  menu row **Order Join Merch** stays exactly where it is. Pinned by
  `tests/components.owner-app-bar.test.ts` + `tests/owner-menu-contract.test.ts`.
- **Brand logos are served from `/brand/web/*.webp`, and those files are immutable-cached for a
  year** (`next.config.ts` `headers()`, `/brand/web/:path*` only). Therefore **new artwork must
  ship under a NEW FILE NAME** — never overwrite one in place, or phones keep the old picture
  for up to a year. Generated by `npm run brand:images`
  (`scripts/optimize-brand-logo.cjs`): 96/192/512 px at 6.7/16.6/59.1 KB. The original
  1.7 MB PNGs stay in `public/brand/` deliberately (outside links, the `/info` schema.org
  `logo:` URL, `scripts/generate-pwa-icons.cjs`) — just never reference them from a page.
  There is **no global logo preload** in `app/layout.tsx` any more; that is pinned by
  `tests/brand-logo-assets-contract.test.ts`.
- **`GET /api/owner/dashboard` is the dashboard's single first-load call** — venue list + games +
  rewards behind **one** `requireOwnerAuth` (was 3 calls / 3 auth checks / ~9 queries). Each list
  carries its own `ok`/`error` so one failure still shows the other section. The per-list routes
  (`/api/owner/venues`, `/api/owner/schedule`, `/api/owner/competitions`) are **still live** and
  still serve Retry, the venue switch, post-save refetches and the sheets — do not delete them.
  `lib/ownerVenueList.ts` is the single venue-list query shared by both paths. Tests:
  `tests/api.owner.dashboard.test.ts`, `tests/app.owner-dashboard-one-round-trip.test.ts`.
- **The first-load seed is SINGLE-USE.** The page hands `DashboardBody` the payload as `initial`
  and then clears it the moment the body reports ready. `DashboardBody` is keyed by venue, so
  without that clear, switching A → B → A remounts it with the seed still matching A, which
  re-adopts a payload from the start of the session **and** suppresses both refetches — a game
  scheduled for A earlier would silently vanish. Pinned by P5 in
  `tests/app.owner-dashboard-one-round-trip.test.ts`.
- **Fonts are self-hosted through `next/font/google`** in `app/layout.tsx` (Bree Serif 400;
  Nunito variable, no `weight`), exposed as `--ht-font-display` / `--ht-font-body` on `<html>`.
  The Google Fonts `@import` is gone from `app/globals.css`. **Never write a literal
  `"Bree Serif"` / `"Nunito"` family name anywhere** — not because the generated name is hashed
  (in Next 16 it is not), but because only the `.variable` value carries `next/font`'s
  **metric-matched fallback face**, which is what stops text jumping when the webfont swaps in.
  A literal silently drops that. Use `[font-family:var(--ht-font-display)]`, never the
  `font-['Bree_Serif']` shorthand (Tailwind can't tell family from weight there). Tripwire:
  `tests/fonts-contract.test.ts`.
- **`/owner/*` and `/admin` do not download the player runtime.**
  `components/ui/PlayerRuntime.tsx` loads `AnimationOverlay`, `GlobalTransitionOverlay`,
  `AnalyticsRuntime`, `PopupAds` and `MobileAdhesionAd` through `next/dynamic` (`ssr: false`)
  and only on player paths. The predicate is **`isPlayerRuntimePath` in
  `lib/playerRuntimePaths.ts`** — one home, matched on a path **segment** (`/ownership` is a
  player path), and it **FAILS OPEN to the player**: an unknown path gets the runtime, because a
  player losing ads or gameplay animations is a real regression while a partner briefly mounting
  five no-ops costs only bytes. **Do not invert that.** Never hand-roll a
  `startsWith("/owner")` at a call site. `PlayerRuntime` must stay inside
  `AnimationTriggerProvider`. The chunks attach at hydration, so **do not add an event
  dispatcher that fires on mount without buffering** the event. Tripwire:
  `tests/player-runtime-contract.test.ts`.
- **`AuthSessionProvider` is deliberately NOT deferred.** It is the single biggest remaining win
  on `/owner/*` (a 186 KB Supabase chunk nothing there uses), but two other layout-level
  components consume its context, so splitting it is a larger change. **Ask Andrew before
  starting it** — same for server-rendering the dashboard shell.
- **The partner sign-in's post-success loader has a watchdog.** `app/owner/login/page.tsx`
  leaves `submitting` set on success so the button can't be pressed twice; a 12 s timer releases
  the form with a message if the navigation never lands, because otherwise a failed
  `router.push` strands the partner behind a `pointer-events-none` loader with no retry.
  Keep both halves. Test: `tests/app.owner-login-navigation.test.ts`.
- **`readyMs`/LCP on the dashboard is too noisy to compare** (it waits on the live Supabase call;
  two medians of the same build differed by 500 ms). Report `loadMs`, request count and bytes
  from `scripts/measure-owner-load.cjs` instead. `npx next start` serves the build that existed
  when it STARTED — restart it after a rebuild or you measure the old bundle.

## PWA / Bingo Landscape Fullscreen
- **The PWA is for PLAYERS ONLY.** `/owner/*` and `/admin` stay an ordinary website — they are better with an address bar, tabs and a real keyboard. No install promotion on those surfaces.
- **NO SERVICE WORKER, in any phase.** Do not add `next-pwa`, `workbox`, or any caching library. Offline caching is what breaks Next.js apps (stale HTML, cached auth redirects, mismatched RSC payloads); iOS does not need one to install.
- **`start_url`/`scope` in `app/manifest.ts` must stay `/`, and `orientation` must stay absent.** An installed app has its own cookie jar, so it cold-launches with no cookies and `proxy.ts` bounces any gated route; `/` (the join flow) is the only route that survives. `start_url` is baked into every install at install time — a bad value is unfixable for users who already installed. An `orientation` lock would kill the landscape board outright.
- **Install *promotion* is gated by `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`** (`isInstallPromptEnabled()` in `lib/pwa.ts`, its one reader). Off = no prompt UX anywhere. **Must not be flipped before the domain split** — see `docs/pwa-install-rollout-runbook.md`.
- **Installability itself is NOT flag-gated.** `app/manifest.ts` and the `apple-mobile-web-app-capable` meta in `app/layout.tsx` ship on every deploy, so a player can Add to Home Screen from the apex today and bake the apex `start_url` in permanently. That standing exposure is accepted (nothing advertises it; the domain split closes it) — don't describe the PWA track as "fully inert."
- **Headless browsers cannot verify this surface.** They have no browser chrome at all, so a headless pass reports success on a bug that is still there. Automated coverage stops at build/typecheck/lint/tests + `npm run test:pwa-contract`; everything visual goes on `docs/bingo-fullscreen-pwa-device-checklist.md`, which only Andrew can close.
- **Run `npm run test:pwa-contract` after touching the manifest, `lib/pwa.ts`, `StandalonePwaRuntime`, or the `.tp-bingo-landscape-*` CSS.** It also guards Phase 1's landscape CSS against leaking into portrait — the same failure mode as commit 35115fc.
- **Full plan and as-built notes:** `docs/bingo-fullscreen-pwa-plan.md` + `docs/bingo-fullscreen-pwa-run-log.md`.

## Code Style & Constraints
- **TypeScript:** Strict mode enabled. Absolutely no `any`. Use explicit types imported from `@/types`.
- **Functions:** Prefer arrow functions for components and utilities.
- **Design: minimal and simple** (2026-10-15). Show the fewest words, colors and elements a surface needs: one focal point, one accent, no decorative borders/dividers, secondary details in one muted line, motion only where it earns its place. Rule + rationale: brand README "Minimal and simple" (`design-system/hightop-challenge-design-system/project/README.md`). Prize cards: `docs/prize-gift-card-redesign-plan.md`.
- **Imports:** Always use absolute path alias `@/` (e.g., `@/lib/supabase`, `@/components/ui/PageShell`). No relative imports (`../`).
- **Styling:** Tailwind utility classes only. No custom CSS, no CSS modules, no inline `style={{}}`. Design tokens reside in `lib/themeTokens.ts`.
  - **Exception — `components/venue-screen/*` (the venue TV display):** inline `style={{}}` is permitted for dynamic/animated values — framer-motion keyframes, computed gradients, per-rank/per-entry colors — that Tailwind utility classes genuinely can't express. `lib/venueScreenBrand.ts` is the intentional second token source for this feature area (mirrors `lib/themeTokens.ts`'s role but scoped to the TV surface). Static, non-dynamic styling on this surface should still prefer Tailwind classes where practical.
- **Text-size floor — no text smaller than 12px, anywhere** (Andrew, 2026-10-07: mobile users must be able to read it). Numbers live in `lib/textSizeFloor.ts`; `tests/text-size-floor-contract.test.ts` (in `npm run test`) fails on any arbitrary `text-[…]`, inline `fontSize` or `app/globals.css` `font-size` that renders under 12px — rem is judged at the 13px root that phones ≤380px use.
  - Use the scale, not arbitrary sizes. Smallest sizes: `text-caption` (12px fixed) and `text-footnote` (13px fixed); `text-xs`/`text-sm` are floored with `max()` in `tailwind.config.ts`.
  - **Inside a venue game, use `text-caption`/`text-footnote` for small labels, not `text-xs`/`text-sm`** — `.tp-game-page .tp-page-main .text-xs` is inflated to 1.2rem in `app/globals.css`, so `text-xs` there renders ~19px.
  - If text can't fit at 12px (e.g. labels inside a decorative mini board), it shouldn't be text — drop it rather than shrink it.

## Manual Testing & Auth Storage
- **Dual-layer auth identity:** User identity (`tp_user_id`, `tp_venue_id`) and session (`tp_sess` when `SESSION_SECRET` is configured) are stored **both in cookies and localStorage** by the client.
  - **Cookies** (`lib/storage.ts` — `setCookie`, `readCookie`): Server-side gate in `proxy.ts` uses these to enforce access control on every request. Direct navigation (e.g., Playwright, curl, direct-to-URL) will redirect to `/` if cookies are missing — **even if localStorage is populated**.
  - **localStorage** (`lib/storage.ts` — `writeLocalStorage`, `readLocalStorage`): Client-side components use these for display and temporary state; `getVenueId()` and `getUserId()` fall back to cookies if localStorage is empty, so cookies are the only essential layer.
  - **Session cookies** (`lib/serverSession.ts`): When `SESSION_SECRET` is set (production, or enforced locally), the `tp_sess` cookie must be a valid HMAC-signed payload. Unsigned payloads will be rejected. Use `createSessionCookie(userId)` to generate a valid value, or see [Phase 2 optional tooling](#phase-2--ship-a-reusable-print-test-auth-script) for a helper script.
- **For test harnesses:** Always set cookies before navigating. Populate localStorage only if you need to test client-side fallback behavior (rare). Setting cookies via `page.context().addCookies([...])` (Playwright), `-b` (curl), or equivalent for your tool is required for direct navigation to succeed.
- **Source of truth:** `proxy.ts` (server-side route gate), `lib/storage.ts` (read/write contract), `lib/serverSession.ts` (signature validation).

## Super Bowl Squares + March Madness (seasonal games; Phase 1 built 2026-10-19, flags off)
Plan: `docs/squares-and-brackets-plan.md` (Andrew's decisions in §1; latest handoff on its status line).
- **Cards are date-windowed, zero requests:** `lib/seasonalGames.ts` (Eastern dates; Squares Feb 1–15 2027, Brackets
  Mar 14–Apr 6 with a teaser from Mar 1) and the ONLY readers of `NEXT_PUBLIC_SQUARES_ENABLED` /
  `NEXT_PUBLIC_BRACKETS_ENABLED`. Off = no card, routes 404. Never turn a flag on before its route exists.
- **On-screen names live only in `lib/venueGameCards.ts`** (`SQUARES_GAME_NAME`, `BRACKET_GAME_NAME`; Andrew: a rename
  must be one edit). `tests/seasonal-games.test.ts` fails on a copied literal.
- **Venue points are paid only through `creditSeasonalPoints`** (`lib/seasonalPointsCredit.ts`) → batched RPC
  `credit_seasonal_points` (≤ 500 per call; ledger `seasonal_points_credits`, unique `(source, source_key)` = pays once).
  Never `update users set points` for these games; never delete a ledger row to "re-grade" (it frees the key). Scale in
  `lib/seasonalPoints.ts`. SQL proof: `npm run test:seasonal-points-sql`.
- **Squares engine (Phase 2, 2026-10-19, migrations `20261019045030` + `20261019051458`, applied 2026-10-19):** claims only via `squares_claim`
  (`lib/squaresBoard.ts`), grading/draw only in `lib/squaresSettlement.ts` (rides on `/api/cron/pickem-settle`, zero I/O
  outside Feb 1–15 or with the flag off), voids only via `squares_void_moment` (`lib/squaresAdmin.ts`: reverses paid /
  burns unpaid credits, re-grade pays under `board:moment:grade_no`). A quarter counts only on positive evidence + a 60 s
  hold (`lib/squares.ts`); corrections are never automatic. Compare PostgREST timestamps with `Date.parse`, not strings.
  SQL proof: `npm run test:squares-sql`.
- **Squares player screens (Phase 3, 2026-10-19):** `/squares` → `components/squares/`; all rules in `lib/squaresView.ts`.
  The shared score `GET /api/squares/score` (`lib/squaresScore.ts`) is CDN-cached 15 s and carries no player or venue —
  keep it that way, and never poll the board per player after the lock (`useSquaresData`, `tests/squares-screen.test.ts`
  pins the cadence). Squares are `div role="gridcell"`, never `<button>`s. The sheet is pinned in
  `tests/native-back-review-fixes.test.ts`.
- **Squares Prizes + Results (Phase 4, 2026-10-19, migration `20261019131139`, applied 2026-10-19):** definition `squares_challenge`
  (`lib/rewardDefinitions.ts`; offered only while `isSquaresPrizeOffered`, and the server refuses once the numbers are
  drawn). The partner picks the moments that pay (`challenge_campaigns.squares_moments`, deliberately NOT in
  `CAMPAIGN_SELECT_COLUMNS`: read only by `listActiveSquaresPrizeCampaigns` / `loadSquaresPrizeMoments`). Each moment is
  its own cycle — `squaresPrizeCycleStart` in `lib/squaresPrizes.ts` (kickoff minute + moment in seconds + grade_no in
  ms) is the ONE key; never key a Squares award any other way. Awards only in `lib/squaresPrizeAwards.ts` (via
  `settleSquaresWinners`): `award_cycle_winner` quota 1, then `squares_results.prize_checked_at`. A void + re-grade pays
  the corrected winner and takes back the old coupon only if unused (Andrew: "take back if unused") — ONLY via the
  `squares_withdraw_prize_coupons` RPC (`withdrawVoidedSquaresPrizes`); never delete a coupon or ledger row by hand.
  Results: `lib/results/adapters/squares.ts` + a placement rule.
- **Squares TV view (Phase 5, 2026-10-19):** `mode: "squares"` on the venue screen REPLACES THE IDLE SCREEN only (live
  Trivia / Category Blitz still win). Built inside the existing `/api/venue-screen/state` poll — no new request loop.
  `lib/squaresTvRead.ts` (flag + Eastern-date gate = zero I/O otherwise; one board read per venue per 15 s cached) →
  `lib/squaresTv.ts` (`buildSquaresTvPayload`: shows only once drawn, a claim exists, and until kickoff + 7 h; no user ids)
  → `components/venue-screen/SquaresTvScreen.tsx`. Poll 15 s; the route CDN-caches this mode like idle.
- **Phase 6 review (2026-10-19): fixes are sub-phases 6.1–6.9, findings in plan §13.** Before turning the flag on,
  6.1–6.4 must be done. The 6.6 re-review (2026-10-21, plan §29) added 6.6.1–6.6.4, also required before the 6.7
  rehearsal. **6.1 built 2026-10-19 (committed, deploy pending):** every prize sweep pays only its own
  `rewardDefinitionId` (`isLiveTriviaGameWinnerCampaign`, `isLiveTriviaRankedCampaign`, `isNFLWeekWinnerCampaign`, the
  Squares check); a new file that calls `awardCycleWinner`/`awardRankedCyclePlaces` fails
  `tests/prize-sweep-ownership-contract.test.ts` until it does too. Never turn `NEXT_PUBLIC_SQUARES_ENABLED` on in Production before 6.9 (rehearsals run
  on a Preview).
- **Squares event lifecycle (6.2, 2026-10-19, migration `20261019142642`, applied 2026-10-19).** `squares_events.purpose`: `super_bowl` (discovery, or an admin game that is the
  season's Super Bowl, `squaresEventPurposeFor`) or `rehearsal` (any other game). `squares_claim` answers
  `rehearsal_only` for a rehearsal at any venue not `hidden = true` — the main guard; prizes check it again
  (`squaresPrizePaysAtVenue`). `set_game` never changes purpose. Discovery never re-creates an archived game; a drawn
  Super Bowl can't be archived before the window closes (`squaresArchiveRefusal`). A void stamps `reopened_at`; the tick
  watches the feed 3 h after it even past the 12 h deadline (`isSquaresReopenWatchOn`). **Rehearsal switch
  `SQUARES_REHEARSAL_ENABLED`** (server-side, one reader `isSquaresRehearsalEnabled()` in `lib/seasonalGames.ts`): ALONE it
  runs the settlement (`squaresSettlementMode` → `rehearsal`, never discovers) — that is what goes on Production for 6.7;
  with the public flag it also runs the TV read (`isSquaresServerLive`) — Preview only. Archive any rehearsal event
  before 6.9 (since 6.6.1 the season-mode cron also archives a leftover rehearsal or old season's event itself, and
  admin create refuses a rehearsal during the window).
- **Paying Squares winners (6.3, 2026-10-19, no migration).** A list of ids sent to PostgREST (`.in()`, `.overlaps()`)
  goes through `chunkIds` (`lib/postgrestIds.ts`, `POSTGREST_ID_CHUNK` = 150) — never one request with more (the URL
  limit; `tests/lib.postgrest-ids.test.ts` pins the Squares payers). A result whose points can never be paid (key paid
  to another player, or player gone: `squaresCreditBlockNote`) is stamped `credit_blocked_at` + note, logged once
  (`[Squares] credit-blocked`), never re-sent, shown in the admin panel and does NOT block Archive. Once the watch is
  over (or past the no-final deadline with no late-void watch), the tick returns before `settleSquaresWinners`: one
  event read per minute, nothing else; admin actions still settle.
- **Bracket engine (Phase 7, 2026-10-19, migration `20261019203858`, NOT applied; flag off).** Picks are SEATS
  (`lib/brackets/tree.ts`, the one slot/seat definition; an entry = `smallint[63]`). Pure rules only in `lib/brackets/`
  (`picks.ts` validity + clearing, `scoring.ts`, `games.ts` feed merge/winner seats/locks/replay mask). Entries are
  written ONLY by `bracket_save_entry` (`lib/bracketsEntries.ts`), winner seats + scores ONLY by
  `bracket_record_results` (`recordBracketResults`, `lib/bracketsStore.ts`); the sync never changes a decided result
  (admin `override_result` only). Venue points per entry per round, key `entry:r<round>:<grade_no>`, paid only in
  `lib/bracketsSync.ts`. Rehearsals: `purpose = 'rehearsal'` (hidden venues only) + `clock_offset_seconds`; switch
  `BRACKETS_REHEARSAL_ENABLED` (one reader, `lib/seasonalGames.ts`). Tests: `tests/brackets-*.test.ts`,
  `npm run test:brackets-sql`.
- **Bracket player screens (Phase 8, 2026-10-19, flag off, nothing new in the database).** `/bracket`
  (`app/bracket/page.tsx`, `notFound()` with the flag off) → `components/bracket/` (`BracketGame` switcher + modes,
  `BracketEditor`, `BracketMatchups`, `BracketReview`, `BracketStandings`, `BracketStepChips`, `useBracketData`); every
  decision is pure in `lib/bracketsView.ts` (steps, seat labels, pick states, headline, save messages). Screens call only
  the Phase 7 routes and `lib/brackets/*` — `setBracketPick` for every tap, never a rule of their own
  (`tests/bracket-screen-contract.test.ts`). **No polling:** one `GET /api/bracket/state` when the page opens, one more on
  returning to a tab away > 5 min (only while a bracket can still change), one at a live bracket's lock time, one after a
  copy; a save patches the held state (`withSavedEntry`) instead of re-reading. Drafts save on each step change, when the tab
  hides and before leaving (`BracketEditor` `flushRef`, `EXIT_SAVE_WAIT_MS`). Step buttons are the shared `WizardFooter` (its
  `-mx-2 !max-w-none` matches the app bar). Teams are in seats: an opening-round game with no linked seat shows "TBD" until an
  admin links it; linked + undecided shows "A / B". The seasonal app-bar label is `BRACKET_SHORT_NAME` ("Bracket") in
  `lib/venueGameCards.ts`.
- **Bracket Prizes, Results, TV (Phase 9, 2026-10-20, migration `20261019213121`, applied 2026-10-20; flag off).**
  Andrew: the bracket screen shows NO Prize line — Prizes tab and Results only. Definition `bracket_challenge`
  (`lib/bracketPrizes.ts`, a leaf: the registry imports it): places only, partner picks the brackets that pay
  (`challenge_campaigns.bracket_keys`, NOT in `CAMPAIGN_SELECT_COLUMNS`), the usual `players` minimum. One cycle per
  bracket per tournament, keyed ONLY by `bracketPrizeCycleStart`; settled once after the championship by
  `settleBracketPrizes` (`lib/bracketPrizeAwards.ts`, from `lib/bracketsSync.ts`) → `award_ranked_cycle_places`, then
  `bracket_tournaments.prizes_settled_at`. A later admin correction never changes settled prizes. Results adapter
  `lib/results/adapters/bracket.ts` (breakdown = picks right/wrong). TV `mode: "bracket"` replaces idle only, inside the
  existing poll (`lib/bracketsTvRead.ts` → `lib/bracketsTv.ts` → `BracketTvScreen.tsx`; zero I/O off-season).
- **Phase 10 review (2026-10-20): fixes are sub-phases 10.1–10.4, findings in plan §17.** Same rule as Phase 6: no
  in-place patches. Never turn `NEXT_PUBLIC_BRACKETS_ENABLED` on in Production before 10.1–10.4 are done and the 10.6
  replay has passed (launch is 10.8, by Mar 8, 2027). The 10.5 re-review (2026-10-21, plan §22) added 10.5.1–10.5.4,
  also required before 10.6.
- **Bracket admin corrections (10.1, 2026-10-21, migration `20261021035254`, applied).** The sync writes games
  ONLY through `bracket_save_feed_games` (`saveFeedBracketGames`), which keeps whatever an admin took over in the
  current row; admin actions write only their own columns (`updateBracketGameColumns`). Never upsert whole
  `bracket_games` rows (contract test). The sync records results only against the seats it read
  (`expectedWinnerSeats` → `stale`); every result/game admin action sets `next_sync_at = now`; "No result" =
  `result_held` (the feed never fills it until `release_result`). Plan §18.
- **Bracket lock + final-score guards (10.2, 2026-10-21, no migration).** `move_lock` asks only `lockMoveRefusal`
  (`lib/bracketsAdmin.ts`): never after the kind's first tip (tournament clock); once it has tipped, only EARLIER than
  the current lock (10.5.1), never reopened. The championship `override_result`
  takes `homeScore`/`awayScore` (both, winner higher); prizes never settle without the total, a decided final with
  none is read hourly with needsAdmin, and the sync never clears a known total. Plan §19.
- **Championship total (10.5.2, 2026-10-21, migration `20261021134157`, NOT applied).** Both writers of
  `championship_total` (sync + admin override) record ONLY `recordedChampionshipTotal` (`lib/bracketsStore.ts`); the
  feed writer keeps a stored score when the feed has none. A championship winner the stored score contradicts needs the
  corrected score (409). Plan §24.
- **Bracket shared helpers (10.4, 2026-10-21, no migration).** Stored 63-seat arrays are read ONLY through
  `bracketSeatList` (`lib/brackets/tree.ts`); a lock in real time ONLY through `bracketRealLockMs`
  (`lib/bracketsStore.ts`); "rehearsals only at hidden venues" ONLY through `bracketTournamentsShownAt`
  (`lib/bracketsEntries.ts`, screen + TV) — contract test. The TV lists only the shown bracket's tournament's games.
  Due rounds are paid in ONE pass over the entries (`payBracketRounds`, `lib/bracketsSync.ts`). Plan §21.
- **Bracket lock-passed stamps (10.7.1, 2026-10-21, migration `20261021203544`, applied).** `bracketRealLockMs` returns
  `main_lock_passed_at` / `second_lock_passed_at` once set (else lock + the current offset): a rehearsal's offset
  shrinks with every forward `set_clock`, so the old rule put the lock weeks early (no prize paid, §25 F1). Stamps are
  written once, ONLY through `lockPassedPatch` (`lib/bracketsStore.ts`), by `set_clock` and the sync — contract test.
  Plan §26.
- **Brackets LAUNCHED in Production 2026-10-21 (10.8, early; Andrew skipped the 10.7 phone pass).**
  `NEXT_PUBLIC_BRACKETS_ENABLED` = true, `BRACKETS_REHEARSAL_ENABLED` = false (Production). Card from Mar 1, sync from
  Mar 14 (zero I/O before); partners can set up a bracket Prize now. A rehearsal now needs the switch back on. Plan §27.
