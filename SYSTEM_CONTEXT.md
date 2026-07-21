# Technical System Context (Single Source of Truth)

- **Project Name:** Hightop Challenge
- **Project Essence:**
  - A mobile-first, venue-based social gaming platform where users join a specific physical venue and compete in game experiences: Live Trivia, Speed Trivia, Sports Bingo, Pick'em, and Fantasy Sports.
  - Core value loop: shared, location-scoped competition → leaderboard progression → challenge wins → prizes (venue discounts/coupons) → users return to earn more → larger audience → higher ad revenue.
  - Venue Home third panel is **Rewards** (campaign-style progression toward venue-offered prizes), while legacy **head-to-head user challenges** remain a separate subsystem.

## 0. Strategic Direction (Next Few Weeks — READ FIRST)
> This section describes where the product is deliberately heading. When making routing, navigation, or IA decisions, align with this direction even if the current code does not yet reflect it. The step-by-step build is tracked in **`docs/partner-dashboard-plan.md`** (canonical plan).

- **`/info` becomes the apex homepage.** Today `hightopchallenge.com` (apex) lands on the player game login (`/` → `JoinFlow`). We are flipping this: `/info` will become the apex/home page — the marketing site we want Google to index and the page a first-time visitor sees. Treat `/info` as the future home page in copy, canonical URLs, and internal links.
- **The player game login relocates to `play.hightopchallenge.com`.** The current apex login (`/` → `JoinFlow`) and all venue/game routes move under the `play.` subdomain. Apex host → marketing (`/info`); `play.` host → the game. This is enforced at the edge in **`proxy.ts`** (the live Next.js 16 edge gate — the framework renamed `middleware.ts` → `proxy.ts`; do **not** add a `middleware.ts`, it's a build error) via `lib/domainSplit.ts`, **shipped behind `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` (off = today's single origin, fully inert).** To flip it live without downtime, follow the exact runbook: **`docs/phase-6-domain-split-runbook.md`** (DNS + envs + smoke tests; reversal is one flag). The split layers in front of `proxy.ts`'s existing (live) cookie auth-gate without changing it.
- **The old "payments page" is becoming the mobile-first Partner Dashboard.** The `/owner/*` surface (currently owner auth + subscription/billing, reached via the "Partner Login" button on `/info`) is being expanded into a mobile-first **Partner Dashboard** for subscriber venues. A subscriber venue is a venue that pays for our geofenced platform so their guests can play. From their phone, a partner will be able to:
  1. **Schedule live games** their whole venue plays together at the same time (Live Trivia, Category Blitz, and future live games). Scheduling is currently **admin-only** (`requireAdminAuth`); it must become **owner-scoped** so partners can self-serve for their own venue(s).
  2. **Put the display/TV URL on their venue's screens.** The public venue screen already exists at `/venue/[venueId]/screen` (a "follow-along" display for guests not playing on their phone). The dashboard will surface this URL/QR for the partner to open on a smart TV or TV-app (Amazon/Google/Apple TV apps do not exist yet — we are browser-only today; those are a future native build).
  3. **Submit payment / manage subscription.** Billing today runs on **SlimCD** (`lib/slimcd.ts`, hosted-payment sessions). We are migrating billing to **Stripe** this week; the Partner Dashboard is the surface for subscribe / update card / invoices.
- **Terminology:** prefer **"Partner Dashboard"** and **"subscriber venue" / "partner"** in new UI copy. "Owner" persists in code/table names (`venue_owners`, `venue_owner_venues`, `/owner/*`, `requireOwnerAuth`) — do not rename those without a deliberate migration.

## 1. Project Essence
- Website type:
  - Location-aware, geofenced-style gaming web app for bars/venues.
  - Users create a global account (username + PIN or passkey), then bind to one or more venues and play short-session competitive games.
- Product pillars:
  - Venue identity + community competition.
  - Fast mobile gameplay loops.
  - Persistent user points, standings, and prize incentives.
  - Ad-supported monetization with controlled frequency/placement logic.
  - Challenge-based prize delivery: users win venue discounts/coupons by meeting challenge goals.

## 2. Key User Flows
- Landing -> Account Creation -> Venue Selection (auth-first):
  - Entry starts at `/` using `JoinFlow`. The canonical panel order is: "How do you want to continue?" (Face ID/Touch ID, Username/PIN, or Create Account) -> username -> PIN/passkey -> **only then** the venue list.
  - User creates or logs into a **global account** via `/api/join/account` (username + PIN, or passkey via WebAuthn). The `accounts` table holds global identity; points/leaderboards are venue-specific.
  - **Geolocation runs only after authentication succeeds, never before.** The venue list is built exactly once post-auth (`buildVenueListAfterAuth` in `JoinFlow.tsx`): God Mode accounts (`accounts.god_mode`) see ALL venues with zero geolocation calls; every other account gets a single geolocation check and sees only in-range venues. There is no unauthenticated god-mode lookup — see `CLAUDE.md`'s "Join/Login Flow (Auth-First)" section and `docs/join-flow-location-error-plan.md` for the full rationale.
  - **God Mode venue entry is server-authoritative.** `/api/join/profile` reads `accounts.god_mode`; browser geolocation, `locationVerified`, and localStorage flags must never be able to block Andrew, marc, Rick, or any future God Mode account from joining any venue.
  - User chooses/arrives with venue context (`venueId`), profile is ensured via API (`/api/join/profile`, `/api/join/ensure-venue`).
- Venue Selection -> Home Screen:
  - User lands at `/venue/[venueId]` (rendered by `VenueHubClient`), which is the venue home hub.
  - Home includes game cards, user status, badges, leaderboard, and a Rewards panel with progress-gauge cards toward venue-offered prizes.
- Home Screen -> Game Entry (Live Trivia / Speed Trivia / Bingo / Pick'Em / Fantasy):
  - Selecting a game card triggers an app-like transition (`runVenueGameOpenTransition`).
  - Game routes use `GameLandingExperience` as an intermediate rules/entry surface before full play state.
  - Inside game experience, Back to Venue uses coordinated return transitions (`runVenueGameReturnTransition`).
- Resume behavior:
  - `GameLandingExperience` checks resumable sessions (`hasResumableSession`) and can auto-resume into active gameplay.
- Prize flow (Rewards system, `docs/rewards-system-plan.md`):
  - Users win prizes by crossing a point threshold in a Reward (progress mode only —
    leaderboard mode is retired from creation). Each Reward has a `winner_quota`: up to that
    many users win per cycle, enforced atomically via the `award_cycle_winner` RPC against the
    `challenge_cycle_winners` ledger.
  - When a user wins, their Rewards card flips to a "check your Redeem Prizes page" state and
    they receive an in-app notification routed to `/redeem-prizes`.
  - Non-winners see a "quota exhausted, congrats to `<winners>`" message once the cycle's quota
    fills.
  - Prize delivery is in-app coupon + staff-taps-redeemed (no POS/gift-card-issuance
    integration): the coupon (menu item discount or gift card) renders on `/redeem-prizes`
    (`components/prizes/PrizeWalletPanel.tsx`) until staff mark it redeemed or it expires.

## 3. Component Architecture (UI Layering Model)
- Root shell (`app/layout.tsx`):
  - Global app container with decorative background layers.
  - Global systems mounted once: auth guards, transition overlay, popup ads, mobile adhesion ads, scroll recovery.
- Page shell (`PageShell`):
  - Standardized screen scaffold with compact top nav/header, safe-area handling, and `tp-page-main` content surface.
- Venue home:
  - `VenueHubClient` provides multi-screen/swipeable home behavior, game cards, leaderboard, and venue-specific states.
- Game layer:
  - `GameLandingExperience` wraps game routes with background layer, rule card stage, play-state stage, and back-to-venue controls.
- Overlay layer:
  - `GlobalTransitionOverlay` for cross-route visual continuity.
  - `PopupAds` for modal ad interruptions.
  - `MobileAdhesionAd` for bottom-fixed banner experience.
  - Challenges rules modal (`VenueHubClient`) is rendered above home content but below `GlobalTransitionOverlay`.
- Scroll/lock infrastructure:
  - `scrollLock` utilities and rescue sentinels prevent stuck mobile viewport states after transitions/popups.

## 4. Game Descriptions

### Live Trivia (canonical name: "Live Trivia" or "Live Trivia Showdown" — never "Live Showdown")
- Host-run, scheduled game. All users at the venue play simultaneously and their gameplay is synchronized.
- Live Trivia rounds are category-pure: each round draws all of its questions from one category. For example, Round 1 may be Science & Tech and Round 2 may be History, but a single round must not mix Science, History, Sports, etc. Question freshness logic must preserve this category-separated round structure.
- Players write in open-ended answers (no multiple choice). Questions must pass a rigorous validation to ensure answers are "rigid identifiers" (proper nouns, specific facts) — this narrows the acceptable answer field and eases grading burden.
- Two question pools exist: `live_showdown` (for Live Trivia) and `anytime_blitz` (legacy name for Speed Trivia pool — do not use this name in UI or docs). The pools differ because answer formats and difficulty standards are entirely different.
- Nightly question generation: `scripts/generate-live-trivia-nightly.cjs` → calls `generate-live-trivia-questions.cjs`.
- Internal lib: `lib/liveShowdown*.ts` (engine, grading, submission, emcee, comments, closest-guess, admin). These files are named "liveShowdown" internally but always surface to users as "Live Trivia."

### Speed Trivia (formerly called "Anytime Blitz" — do not use that name anywhere)
- Solo game, available at any time, no host required.
- Multiple choice questions, any topic or difficulty.
- Nightly question generation: `scripts/generate-trivia-nightly.cjs` → calls `generate-trivia-questions.cjs`.

### Category Blitz (formerly called "Scategories")
- Scattergories-style word game. Each round draws one **set** of 12 categories and one shared **letter**; players race to name an answer for each category that starts with that letter. Unique answers score points (`lib/categoryBlitz.ts`).
- **Answer grading:** Claude Haiku is the sole judge of whether a player's answer fits a category (`validateAnswersWithLLM` in `lib/categoryBlitz.ts`). This is why category quality matters so much — the category must be objective enough for an LLM to grade fairly.
- **Category design is governed by `data/category-blitz/CATEGORY_TEST.md` (canonical).** Every category must pass BOTH gates: (1) **Is-A** — "[Answer] IS A(N) [Category]" is objectively/definitionally true, never situational or opinion-based; (2) **Letter-Coverage** — broad enough to have common answers for ~10+ of the 18 game letters (`ABCDEFGHILMNOPRSTW`; Q/U/V/X/Y/Z/J/K excluded as too hard). Reject only genuinely closed rosters (a baseball position, a planet). Always use that file's prompt — do not re-derive the rules.
- **Content pipeline (pool → build → sets):**
  - `data/category-blitz/category-pool.json` is the canonical library. To add categories, append them here (only ADD — keep existing good categories; rounds are always mixed, never themed; the `theme` tag is just an internal mixing aid).
  - `data/category-blitz/category-sets.json` is **generated, never hand-edited.** Run `npm run category-blitz:build` (`scripts/build-category-blitz-sets.cjs`) to compose mixed sets of 12 and compute each set's derived `allowedLetters`.
  - Since one letter applies to all 12 categories in a set, each set stores an `allowedLetters` array; the round only draws from it (`pickLetterForSet`). It is model-derived, cached in `data/category-blitz/letter-cache.json` (so only new categories are billed — this is what makes scaling to thousands cheap). Never hand-write it.
  - Generation/analysis model: Claude Opus 4.8 (rejects the deprecated `temperature` param). Scripts run via `node --env-file=.env.local` and accept `ANTHROPIC_USERNAME_MODERATOR_API_KEY` locally.

### Sports Bingo
- Players mark off bingo squares based on real sports events tied to live NBA, WNBA, and MLB games.
- Each square has a `resolver` — a typed rule that defines what must happen for the square to be marked hit or miss. Resolver types include:
  - **NBA/WNBA player stat milestones:** e.g. "LeBron scores 25+ points" (`nba_player_stat_at_least`)
  - **NBA/WNBA team stats:** e.g. "team outrebounds opponent", "team scores first", "leads at halftime"
  - **NBA/WNBA player achievements:** double-double, triple-double, perfect FT, zero turnovers, etc.
  - **MLB webhook events:** batter/pitcher prop events delivered in real time (e.g. home run, strikeout)
  - **Moneyline / spread / game total / team total / player prop:** settled when game is final
- Squares resolve to `hit`, `miss`, or remain `pending` during live play.

**Real-time update pipeline (latency goal: near-instant — same as Fantasy):**
- BallDontLie webhooks → `/api/webhooks/balldontlie` → `resolveBingoSquares()` runs immediately on every NBA/WNBA player stat event, checking all pending squares for that game against the incoming stats.
- MLB prop squares are resolved via `applyMlbWebhookPropEvent()` and `applyMlbPlayerSnapshotEvent()` on each MLB stat event.
- `refreshSportsBingoProgress()` is called after every webhook event (with throttled invalidation) to push updated state to clients.
- Fallback: `/api/cron/bingo-progress` runs every 1 minute.
- Squares that depend on game outcome (moneyline, spread, totals) are resolved when the game-final event arrives via webhook, triggering `refreshSportsBingoProgress({ limit: 500, bypassCache: true })`.

### Pick'Em
- Users select the winner from a list of that day's games across one or more sports.
- Pick outcomes are settled via `lib/pickem.ts`.
- **Settlement latency goal: as close to instant as possible after a game ends.**
  - Primary fast path: BallDontLie sends a game-final webhook event → `/api/webhooks/balldontlie` detects `isGameFinal` (via event type or game status) → immediately calls `settlePendingPickEmPicks()`. This fires the moment the data provider registers the game as over.
  - Fallback: `/api/cron/pickem-settle` runs every 1 minute to catch anything the webhook missed.
- **Note:** Pick'em does NOT use Polymarket. The old `/api/predictions` route and `lib/userPredictions.ts` use Polymarket for legacy prediction enrichment only. That system is deprecated and not user-facing.

### Fantasy Sports (Daily)
- Users draft a fresh roster each day from players whose teams are playing that sport that day.
- One roster per sport per day (NBA, WNBA, MLB; NFL support coming when season starts).
- Once a player's real-life game is in progress, they can no longer be drafted.
- **NBA / WNBA:** Standard daily roster rules.
- **MLB:** Being simplified — users draft 3 hitters and 3 pitchers.
- **NFL:** Planned for the upcoming NFL season; rules TBD.

**Real-time update pipeline (latency goal: near-instant):**
- The time between a player doing something on live TV and a user seeing their Fantasy score update should be as close to instant as possible. The same applies to Bingo.
- BallDontLie sends stat webhooks to `/api/webhooks/balldontlie` as plays happen in real time. This is the primary live update trigger.
- The webhook handler (`lib/webhooks/balldontlie.ts`) processes incoming stat events, upserts `live_player_stats`, and immediately triggers fantasy progress refresh and bingo square resolution for affected games.
- Backup cron jobs run every 1 minute as a safety net: `/api/cron/fantasy-live-sync` (live stat polling) and `/api/cron/fantasy-progress` (score refresh). These are fallbacks — the webhook path is the fast path.
- `/api/cron/bingo-progress` also runs every 1 minute as a bingo fallback.

**Scoring models (computed in `lib/webhooks/balldontlie.ts`):**
- **NBA / WNBA:** `pts + (reb × 1.2) + (ast × 1.5) + (stl × 3) + (blk × 3) − tov`
- **MLB batters:** `(singles × 10) + (doubles × 20) + (triples × 30) + (HR × 50) + (runs × 10) + (RBI × 10) + (SB × 15) − (strikeouts × 5)` (floor: 0)
- **MLB pitchers:** `(K × 10) + (outs × 5) − (earned runs × 15) − ((walks + hits allowed) × 5)` (floor: 0)
- **NFL:** TBD when season starts.

**Data providers:**
- **Live stats:** BallDontLie API (`lib/balldontlie.ts`) — NBA, WNBA, MLB real-time box scores and play-by-play events delivered via webhook.
- **Player headshots:** TheSportsDB (`lib/thesportsdb.ts`) — fetched and synced via nightly scripts (`scripts/sync-nba-headshots.cjs`, `sync-wnba-headshots.cjs`, `sync-mlb-headshots.cjs`). Stored in Cloudinary.
- **Game schedules / draftable player lists:** BallDontLie API, queried at draft time to show only players on teams playing that day whose games haven't started yet.

## 5. Ad System Logic
- Core model: deterministic, frequency-aware ad rotation.
- Deterministic queue behavior:
  - Client increments local counters (`lib/adFrequency.ts`) per slot/context key.
  - Counter is passed to `/api/ads/slot` as `clientCounter`.
  - Server picks ad deterministically using modulo selection (`chooseAdByCounter` in `lib/ads.ts`), producing stable round-robin rotation for competing ads.
- Ad types + slots:
  - Banner: primarily `mobile-adhesion` (bottom-fixed mobile unit).
  - Pop-up: `popup-on-entry` and `popup-on-scroll` slots (plus round-end flow in popup orchestration).
  - Inline: content slot patterns (for example leaderboard or pick 'em inline placements).
- Triggers:
  - On-load: initial ad fetch on route/surface load; used for popup-on-entry and default banner/inline fetch paths.
  - On-scroll: activated after thresholded scroll depth; used by popup-on-scroll and fallback banner delivery.
  - Round-end: popup orchestration supports trivia round-end ad checks.
- Gating and priority controls:
  - Transition gate blocks disruptive ads during venue/game transitions.
  - Ad tier arbitration (`adPriority`) prevents competing overlays from stacking.
  - Cooldowns (`popupCooldownSeconds`) and dismiss timing (`dismissDelaySeconds`) enforce UX constraints.
- Targeting:
  - Venue, multi-venue, and geo targeting (city/ZIP/county/state/region) in `lib/ads.ts`.
  - Active ad page keys are `join`, `venue`, `trivia`, `sports-bingo`, `pickem`, and `fantasy`.

## 6. Analytics System
- Purpose: dual audience — (1) operator/advertiser data (ad performance, slot pricing) and (2) internal user engagement and retention.
- Client-side event tracking (`lib/analytics.ts`):
  - Queued event emission with batched flush every 10s and heartbeat every 60s.
  - Tracks: site sessions, game sessions, ad interactions (view/click/convert), geo data.
  - Uses `navigator.sendBeacon` for session-close flushing.
  - Consent-gated via `tp:analytics-consent` localStorage key.
  - Game types tracked: `trivia`, `bingo`, `pickem`, `fantasy`, `speed-trivia`, `live-trivia`.
- Server-side analytics (`lib/adminAnalytics.ts`, `lib/analyticsQueries.ts`):
  - Short cache TTL (15 min), hard query windows (90 day max), row caps (50k) to keep reads cheap.
  - Geographic grouping via `lib/geographicHierarchy.ts`.
- Admin dashboard: `/admin/user-analytics`.
- Analytics runtime component: `components/analytics/AnalyticsRuntime.tsx`.

## 7. Notifications
- Two canonical notification types:
  1. **Points earned:** Brief and specific. Format: `"[Event]. +[N] points."` e.g. `"Knicks won. +10 points."` Never wordy.
  2. **Prize won:** Notifies user they won a challenge prize and routes them to `/redeem-prizes`.
- The clickable challenge badge on a won challenge also routes to `/redeem-prizes`.
- Lib: `lib/notifications.ts`, API: `/api/notifications`.

## 8. Prizes (Rewards system — built)
- Central to the monetization loop: venues offer prizes (menu-item discounts, gift cards) to attract more players → more players → higher ad revenue.
- Venues don't author prizes free-form — they run the **Create Reward wizard**
  (`components/rewards/CreateRewardWizard.tsx`, shared by admin and the Partner Dashboard)
  which picks a **reward definition** (registry: `lib/rewardDefinitions.ts`; today, the Live
  Trivia Challenge), a cadence gated on the venue's existing Live Trivia schedule, a prize
  (menu item + dollar/percent discount, or gift card), and a winner quantity per cycle.
- Backend reuses `challenge_campaigns` (progress mode only) with Rewards-specific columns
  (`winner_quota`, `reward_definition_id`, `prize_kind`, etc. — see the plan §3a) and a
  count-guarded, atomically-capped multi-winner ledger (`challenge_cycle_winners` +
  `award_cycle_winner` RPC — see the plan §3b).
- Prize delivery is **in-app coupon + staff-taps-redeemed**: winners see a coupon on
  `/redeem-prizes` (`components/prizes/PrizeWalletPanel.tsx`); staff visually verify and mark
  it redeemed, or it expires. No POS or gift-card-issuance integration in scope.
- Rollout flag: `NEXT_PUBLIC_REWARDS_ENABLED` (`lib/rewardsFlags.ts`) — off clamps every
  reward to single-winner behavior (today's Challenges/Competitions parity), fully reversible.
- `/redeem-prizes` page is accessible from the hamburger menu.

## 9. Admin Panel
- Route: `/admin` and `/admin/[section]`.
- Current sections:
  - **Venue Users** — manage users at a venue.
  - **User Analytics** — engagement/retention dashboard (planned expansion).
  - **Venue Profiles** — venue configuration.
  - **Trivia Questions** — question bank management, create question, question review.
  - **Advertising** — manage ads, create ad, placement builder, ad analytics.
  - **Rewards & Events** — Rewards manager (Create Reward wizard + list), Live Trivia schedules.
  - **Operations** — Pick'em settlement.
- Venue-operator-facing dashboard: **now in active development** as the **Partner Dashboard** (`/owner/*`, reached via "Partner Login" on `/info`). See §0 Strategic Direction and `docs/partner-dashboard-plan.md`. Distinct from `/admin` (internal staff): the Partner Dashboard is owner-scoped (`requireOwnerAuth`, `venue_owner_venues`) and mobile-first, letting subscriber venues self-serve scheduling, the TV display URL, and billing for only their own venue(s).

### Partner / Owner surface (current state)
- **Auth:** `venue_owners` + `venue_owner_venues` tables; guarded by `lib/requireOwnerAuth.ts`. Pages: `/owner/login`, `/owner/register`, `/owner/forgot-password`, `/owner/reset-password`, `/owner/dashboard`, `/owner/billing`, `/owner/billing/setup`. Shared shell: `components/owner/OwnerShell.tsx`.
- **Rewards:** `/owner/competitions` (Rewards page) hosts the shared `CreateRewardWizard` (`variant="owner"`) in place of the old raw-field Competitions template gallery — see §8 and `docs/rewards-system-plan.md`.
- **Billing (SlimCD today → Stripe this week):** `app/api/owner/billing/*` (`billing`, `subscription`, `session`, `return`, `card`; `subscribe` is a deprecated 410 stub). `lib/slimcd.ts` creates hosted-payment sessions; `billing_subscriptions` stores `slimcd_recurring_token`, status, period. The Stripe migration replaces the session/return/card flow and recurring-token model — see the plan.
- **Live-game scheduling (to be owner-scoped):** `app/api/category-blitz/schedules/*` + `lib/categoryBlitzSchedules.ts` currently require **admin** auth. The Partner Dashboard needs owner-scoped create/list/delete restricted to the caller's `venue_owner_venues`.
- **TV display URL:** public venue screen at `app/venue/[venueId]/screen` + `app/api/venue-screen/state`; surfaced (URL + QR) in `app/owner/display/page.tsx`. The URL is built with `gameUrl()` from `lib/domainSplit.ts`, so it automatically points at `play.` once the domain split is enabled.
- **Domain split (Phase 6):** host-based routing lives at the top of the live edge gate `proxy.ts` (via `lib/domainSplit.ts`), flag-gated off behind `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` and inert until enabled. `proxy.ts` is Next 16's renamed middleware file — never add a `middleware.ts`. Cutover steps: **`docs/phase-6-domain-split-runbook.md`**.

## 10. Design System & Brand Guidelines
- **Canonical source of truth for brand:** `design-system/hightop-challenge-design-system/project/colors_and_type.css` — defines all CSS custom properties for colors, typography, and surface tokens.
- **Code implementation:** `lib/themeTokens.ts` — maps brand tokens to Tailwind class strings per game/context. Must stay in sync with the design system.
- **Rule:** When brand guidelines change (fonts, colors, etc.), update `colors_and_type.css` first, then propagate to `lib/themeTokens.ts` and any Tailwind config. Never change individual component colors without updating these central files first.
- Typography:
  - Headings: **Bree Serif**
  - Body/UI: **Nunito** (weights 400–900)
  - Kalam is explicitly excluded (legacy "comic" era — never use on any player-facing surface).
- Color philosophy:
  - Every screen is dark-native; no light mode.
  - Canvas: `#020617` (slate-950). Surface: `#0f172a` (slate-900). Elevated: `#1e293b` (slate-800).
  - Each game/section carries one accent color (see `GAME_THEME` in `lib/themeTokens.ts`).
  - Exit/back actions use a specific warm red-orange gradient (`--ht-exit-*`) — the only warm element on screen.
- Game accent identities:
  - Live Trivia: cyan → sky → blue
  - Speed Trivia: sky → blue → violet
  - Sports Bingo: orange → red → pink
  - Pick'Em: blue → violet → pink
  - Fantasy: violet → blue → cyan
  - Prizes / redeem: gold (`#d89a4f`)

## 11. Technical Stack
- Framework/runtime:
  - Next.js (App Router), React, TypeScript.
- Styling/UI:
  - Tailwind CSS, custom utility classes, responsive safe-area/mobile viewport handling.
  - Brand tokens: `design-system/hightop-challenge-design-system/project/colors_and_type.css` (CSS vars) + `lib/themeTokens.ts` (Tailwind class maps).
- Motion/interaction:
  - Framer Motion (dependency present), custom transition systems for route/game entry animations.
- Backend/data:
  - Supabase (`@supabase/supabase-js`) with server/admin access patterns.
- Sports data:
  - balldontlie (NBA/WNBA/MLB stats), thesportsdb (headshots), apisports.
- Question generation:
  - Gemini API via nightly Node scripts (`scripts/generate-trivia-nightly.cjs` for Speed Trivia, `scripts/generate-live-trivia-nightly.cjs` for Live Trivia).
- Testing/tooling:
  - Vitest, ESLint, PostCSS, TypeScript compiler.

## 12. Known Constraints and Architectural Rules
- **Speed Trivia source-of-truth rule:** Speed Trivia (`question_pool='anytime_blitz'`, `answer_format='multiple_choice'`) is canonical in the Admin UI / Supabase `trivia_questions` table. Files under `data/trivia/categories/` are export artifacts for approved Speed Trivia rows.
- **Live Trivia source-of-truth rule:** Files under `data/live-trivia/categories/` are the canonical source of truth for Live Trivia question content, answers, and acceptable answers.
- **No reverse sync into Live Trivia JSON:** Supabase, local dev database state, production database state, or other remote sources must never overwrite or regenerate `data/live-trivia/categories/`.
- **Pool separation rule:** Speed Trivia must stay `anytime_blitz` + `multiple_choice`; Live Trivia must stay `live_showdown` + write-in-compatible answer formats. Never mix these rows, import paths, or JSON directories.
- **No historical snapshot rewrites for trivia JSON:** Do not use `git show`, `HEAD`, or any older snapshot as the input source for trivia JSON rewrite/backfill scripts unless the user explicitly asks for a history restore.
- **Live Trivia question edits belong in local JSON first:** If the user asks to add, remove, revise, or audit Live Trivia questions or answers, the intended changes should be made in the local JSON files.
- **Speed Trivia sync direction:** Nightly Gemini generation writes directly to Supabase as `pending_review`; approved Speed Trivia rows can be exported from Admin Review into `data/trivia/categories/` through a GitHub PR.
- **Preserve on-disk trivia JSON in scripts:** Any script that updates trivia JSON must read the current local file contents first and only make incremental requested changes.
- **Naming rule — Live Trivia:** Always "Live Trivia" or "Live Trivia Showdown." Never "Live Showdown." Internal lib files use `liveShowdown*` naming but this must not surface in UI copy, comments, or documentation.
- **Naming rule — Speed Trivia:** Always "Speed Trivia." Never "Anytime Blitz" (old internal name).
- **Predictions is deprecated:** The old Predictions feature (Polymarket-backed, any-category picks) is no longer user-facing. Polymarket (`lib/polymarket.ts`) is only used as a fallback to enrich legacy pick records in `/api/picks`. Do not reactivate or expand this system. Pick'em is its functional replacement.
- **Brand centralization rule:** All color/font changes must flow through `design-system/` → `lib/themeTokens.ts` → components. Never hardcode colors in components that belong in the token system.
- Z-index hierarchy is critical:
  - Header, game surfaces, transition overlays, popup ads, and adhesion ads rely on strict stacking order; regressions here can break navigation or ad visibility.
- Transition handling is stateful:
  - Venue→game and game→venue flows use session-backed transition gates/snapshots; avoid bypassing transition helpers when adding new game entry points.
- Scroll-lock resilience is required:
  - Mobile scroll can be corrupted by modal/popup transitions; existing recovery hooks/classes must be preserved.
- Ad delivery must remain deterministic:
  - Rotation depends on client counters and server modulo selection; randomization should not replace this without a product-level decision.
- Sports logic uses American-odds ecosystem assumptions:
  - Sports modules are built around U.S. market conventions and sportsbook-like market keys/probabilities; new sports features should stay compatible.
- Home/game boundary contract:
  - `GameLandingExperience` is the canonical boundary between venue home and deep game view; keep resume checks, entry cards, and back behavior consistent across game types.
- Challenge system separation contract:
  - **Head-to-head user challenges** remain on existing endpoints/modules (`/api/challenges`, `lib/competition.ts`, `PendingChallengesPanel`).
  - **Campaign challenges (the Rewards system)** use separate modules/endpoints (`lib/challengeCampaigns.ts`, `/api/challenge-campaigns`, admin resource `challenge-campaigns`) plus the Rewards-specific layer on top (`lib/rewardDefinitions.ts`, `lib/rewards.ts`, `/api/owner/rewards`).
  - Do not merge or repurpose one model into the other without a deliberate migration plan.
- Rewards system contract:
  - Reward creation is registry-driven, not free-form — new reward types are added as one entry in `lib/rewardDefinitions.ts` (see `AGENTS.md`), never as a bespoke form.
  - Leaderboard mode is retired from Reward creation; only progress (threshold+quantity) rewards are created going forward.
  - Multi-winner quota enforcement must go through the `award_cycle_winner` RPC (atomic, advisory-locked) — never a plain count-then-insert in application code.
- Supabase migration security contract:
  - For any Supabase-related task (new table, schema change, policy update, grants), agents must review and follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` before writing SQL migrations.
