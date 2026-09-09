# CLAUDE.md — Hightop Challenge Project Rules

> **Be concise by default.** Keep responses short — direct answers, no restating the task, no trailing summaries unless asked. Save exhaustive detail for when the user explicitly asks for it. This saves tokens and the user's time; don't wait to be told each time.
>
> **Read `SYSTEM_CONTEXT.md` before starting any task.**
>
> **`/info` IS the home page.** Any control that means "go to the home page" — a Back button, a nav logo, a marketing link — must target **`/info`**, never `/`. Until the domain split flips, apex `/` still serves `JoinFlow` (the *player sign-in*), so pointing "home" at `/` silently drops partners and first-time visitors on a login screen. Use `marketingHref("/info")` from `lib/domainSplit.ts` so the link stays relative today and becomes an absolute apex URL after the split.
>
> **Strategic direction (next few weeks):** the player game login is moving to `play.hightopchallenge.com` (which is what finally moves `/` off the apex); and the `/owner/*` payments surface is becoming the mobile-first **Partner Dashboard** (self-serve live-game scheduling, TV display URL, and Stripe billing). See `SYSTEM_CONTEXT.md` §0 and the canonical build plan in `docs/partner-dashboard-plan.md`.
>
> **`proxy.ts` is the live edge gate — do NOT add a `middleware.ts`.** In Next.js 16 the middleware convention was renamed to `proxy.ts`; it is auto-detected and runs in production (the build lists it as `Proxy (Middleware)`). Adding `middleware.ts` is a hard build error. Its cookie auth-gate is live — never change its default behavior without an explicit, separately-verified decision.
> **Domain split is built, flag-gated off.** The apex→`play.` host routing is layered at the top of `proxy.ts` (via `lib/domainSplit.ts`) behind `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` (off = today's single origin, fully inert). When ready to switch over, execute **`docs/phase-6-domain-split-runbook.md`** exactly (DNS + envs + `.hightopchallenge.com` cookie domain + smoke tests; reversal is one flag).

## Build and Test Commands
- Dev server: `npm run dev`
- Build: `npm run build`
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Tests: `npm run test` (Runs Vitest)

## Mental Model & Terminology
- **Core Concept:** Users join a specific physical venue and earn points playing mini-games (Trivia, Pick'em, Bingo, Predictions, Fantasy) scoped strictly to that venue. 
- **Data Scoping:** Authentication is global (passkeys/username), but points, leaderboards, and game states are entirely venue-specific. Users can belong to multiple venues with completely independent point totals.
- **Naming Rule:** Always use "credit allocation" instead of "credit limit" for recurring game balances.

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
- **Continuous mode is the universal default, flag-gated (`NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT`).** When on, every venue runs an endless randomized continuous loop with zero admin setup — no schedule, no start/end time, no "number of rounds." A `category_blitz_continuous_config` row is an optional **per-venue override** (custom pacing/pool, or `is_active = false` to explicitly opt a venue back onto the scheduled engine); "no row" now means "on with global defaults." The flag follows the same reversible convention as `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`: off = today's legacy scheduled behavior, fully inert. Resolver: `resolveContinuousConfig` in `lib/categoryBlitzPool.ts`; the scheduled engine (`driveVenueCategoryBlitz` / `runCategoryBlitzEngine`) stands down for any continuous venue via `standDownScheduledIfContinuous`. Cron `/api/cron/category-blitz-continuous` advances rounds for venues with an open continuous session. Full plan: `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md`.
- **Global room pooling exists, flag-gated off (`NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`).** When on, every venue's Category Blitz gameplay collapses onto one shared hidden room (`hc-cbz-live`, `venues.hidden = true`, never appears in any venue list) so sparse venues clear the 3-player/2-player scoring gate. Off = today's per-venue isolation, fully inert — same reversible convention as the flags above. Single indirection point: `resolveCategoryBlitzRoomId` in `lib/categoryBlitzShared.ts`, applied ONLY at gameplay boundaries (never venue join/geofencing/`users.venue_id`). Concealed from the frontend two ways: API responses remap `session.venueId` back to the caller's real venue, and the realtime channel name is hashed (`categoryBlitzChannelName`) so the raw room/venue id never reaches the client. Per-venue challenge-campaign points still attribute correctly under pooling (read from each submission's own `venue_id`, not the pooled room's). Full plan + cutover runbook: `docs/category-blitz-global-room-plan.md`.

## Rewards System (venue-home Rewards panel, admin, Partner Dashboard)
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
- **Redemption = in-app coupon, staff-taps-redeemed.** No POS or gift-card-issuance
  integration; winners see a coupon on `/redeem-prizes` (`components/prizes/PrizeWalletPanel.tsx`).
- **The NFL Pick 'Em Challenge is the one reward that does NOT gate on a venue schedule.**
  It gates on the NFL season calendar (`nfl_pickem_weeks`), so it takes none of the Live
  Trivia schedule machinery: a partner picks a **week scope** — `weekly` or `season`, and
  only those two; arbitrary week ranges are explicitly rejected — and
  `lib/nflPickEmRewardWeeks.ts` derives cadence, quota, `activeDays` (all seven days,
  **`"thu"` first**, or the cycle anchor and accrual gate both break) and date bounds from
  it. "Most picks right" is locked to **1 winner** (refused server-side, not clamped) and
  needs **3+ pickers** at the venue or nobody wins; ties are broken by a per-week tiebreaker
  question (`lib/nflPickEmTiebreaker.ts`). Accrual is **1 point per correct pick, not 10**
  (`lib/nflPickEmRewardAccrual.ts`, a separate sweep — daily Pick 'Em's settlement path is
  untouched). Full as-built record, deviations and remaining work:
  `docs/nfl-pickem-reward-plan.md`.

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
- **Host shells own the Back slot, not the pages.** Player content pages pass
  `PageShell backTo={…}`; `/owner/*` pages pass `OwnerShell backTo={…}` (plus
  `showAccountMenu` for Sign Out); the four `GameAppBar` games inherit it from
  `components/venue/AppBar.tsx`'s defaulted `leading` slot. Do not add a page-level
  back link that bypasses its shell.
- **Run `npm run test` after touching any navigation control** —
  `tests/navigation-controls-contract.test.ts` is the standing static tripwire (7
  assertions: no raw `←` in player-facing TSX, no retired warm-pill literals, the
  sign-out/endpoint allowlists, the `WizardFooter`/`SignOutButton` host allowlists, and
  that `BackButton.tsx` stays deleted). It runs under plain `npm run test`, not a named
  `test:*` script. Phase 1 also touched the landscape bingo chrome, so
  `npm run test:pwa-contract` applies there, and any change to `JoinFlow`'s wizard
  footer still requires `npm run test:god-mode-join`.

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
- **Imports:** Always use absolute path alias `@/` (e.g., `@/lib/supabase`, `@/components/ui/PageShell`). No relative imports (`../`).
- **Styling:** Tailwind utility classes only. No custom CSS, no CSS modules, no inline `style={{}}`. Design tokens reside in `lib/themeTokens.ts`.
  - **Exception — `components/venue-screen/*` (the venue TV display):** inline `style={{}}` is permitted for dynamic/animated values — framer-motion keyframes, computed gradients, per-rank/per-entry colors — that Tailwind utility classes genuinely can't express. `lib/venueScreenBrand.ts` is the intentional second token source for this feature area (mirrors `lib/themeTokens.ts`'s role but scoped to the TV surface). Static, non-dynamic styling on this surface should still prefer Tailwind classes where practical.

## Manual Testing & Auth Storage
- **Dual-layer auth identity:** User identity (`tp_user_id`, `tp_venue_id`) and session (`tp_sess` when `SESSION_SECRET` is configured) are stored **both in cookies and localStorage** by the client.
  - **Cookies** (`lib/storage.ts` — `setCookie`, `readCookie`): Server-side gate in `proxy.ts` uses these to enforce access control on every request. Direct navigation (e.g., Playwright, curl, direct-to-URL) will redirect to `/` if cookies are missing — **even if localStorage is populated**.
  - **localStorage** (`lib/storage.ts` — `writeLocalStorage`, `readLocalStorage`): Client-side components use these for display and temporary state; `getVenueId()` and `getUserId()` fall back to cookies if localStorage is empty, so cookies are the only essential layer.
  - **Session cookies** (`lib/serverSession.ts`): When `SESSION_SECRET` is set (production, or enforced locally), the `tp_sess` cookie must be a valid HMAC-signed payload. Unsigned payloads will be rejected. Use `createSessionCookie(userId)` to generate a valid value, or see [Phase 2 optional tooling](#phase-2--ship-a-reusable-print-test-auth-script) for a helper script.
- **For test harnesses:** Always set cookies before navigating. Populate localStorage only if you need to test client-side fallback behavior (rare). Setting cookies via `page.context().addCookies([...])` (Playwright), `-b` (curl), or equivalent for your tool is required for direct navigation to succeed.
- **Source of truth:** `proxy.ts` (server-side route gate), `lib/storage.ts` (read/write contract), `lib/serverSession.ts` (signature validation).
