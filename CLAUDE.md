# CLAUDE.md — Hightop Challenge Project Rules

> **Be concise by default.** Short, direct answers; no restating the task, no trailing summaries unless asked.
>
> **Read `SYSTEM_CONTEXT.md` before starting any task.** Feature rules live in each feature's plan doc, in a section
> called **"Standing rules (moved from CLAUDE.md, 2026-11-03)"** at the end of the doc. **Before touching a feature
> listed under "Feature rules" below, read that section.** Most rules are also pinned by a contract test in
> `npm run test`, so a failing `tests/*-contract.test.ts` usually means you broke a rule from that section.
>
> **`/info` IS the home page — on the website.** Any "go home" control targets `/info`, never `/` (`/` on `play.` is
> the player sign-in). Inside the native app home is the front door: use `homeHref(isNativeApp())` from
> `lib/domainSplit.ts` (or `ExitBackButton` `home` / `useIsNativeApp()`), never a bare `marketingHref("/info")`
> (`tests/native-app-contract.test.ts`).
>
> **`proxy.ts` is the live edge gate — do NOT add a `middleware.ts`** (Next.js 16 renamed it; adding one is a build
> error). Never change its cookie auth-gate default without an explicit, separately-verified decision.
> **Domain split** (apex → `play.`) is built in `proxy.ts` via `lib/domainSplit.ts`, behind
> `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` (off = inert). Switch over only by `docs/phase-6-domain-split-runbook.md`.
> Strategic direction: `SYSTEM_CONTEXT.md` §0 and `docs/partner-dashboard-plan.md`.
>
> **Branch rule (2026-10-30):** while the App Store review is open, new work goes on `after-app-review`; never push
> `main`, `supabase db push`, or change Production env until Andrew confirms approval.

## Build and Test Commands
- Dev server: `npm run dev` (Andrew runs it on :3000 — never use it for tests that write data; never `pkill next`)
- Build: `npm run build` · Lint: `npm run lint` · Tests: `npm run test` (Vitest)
- Typecheck: `npx tsc --noEmit` (fresh clone: `npx next typegen` first). Never run typecheck and build at the same time.

## Do Not Touch (Hard Boundaries)
- **`.env.local` is APPEND-ONLY; values are never read, printed or exposed** (~75 live secrets). Add with
  `echo 'KEY=value' >> .env.local` (always `>>`). See names only: `cut -d= -f1 .env.local | sort`. Never
  `cat/head/tail/grep` it, never `>`, `rm`, `mv/cp` onto it, `sed -i`, `tee` without `-a`, or `vercel env pull`.
  Changing or removing a line is Andrew's call. Enforced by `.claude/hooks/protect-env-local.sh` and
  `.claude/settings.json` — if a hook denies something, fix the request, don't work around it.
- **Vercel env:** `vercel env ls` / `add` allowed; `rm` and `pull` denied. A `NEXT_PUBLIC_*` var needs a redeploy.
- **Supabase:** project `pkmxupsayzshvpirkaav` is linked and is PRODUCTION (dev shares it). `supabase migration new`
  is fine; `supabase db push` always asks first, never unprompted. Existing migration files are read-only history —
  every SQL fix is a NEW migration.
- `lib/supabaseAdmin.ts` (security boundary) and `vercel.json` (crons): don't modify without instruction.
- **New `public` table/view/sequence → grant `service_role` in the same migration** (plus `anon`/`authenticated`
  only where the browser needs it, with RLS). Template: `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; enforced by
  `tests/supabase-migration-grants-contract.test.ts`; background `docs/supabase-data-api-grants-plan.md`.
- **New SECURITY DEFINER function** that players must not call: `revoke all … from public, anon, authenticated` +
  `grant execute … to service_role` (`tests/security-definer-execute-contract.test.ts`).
- **`auth.users` is shared with players.** Only `venue_owners` is a partner credential; `accounts.auth_id` /
  `users.auth_id` are `ON DELETE SET NULL`, so deleting an auth user silently detaches a player. Never adopt, delete
  or reset a pre-existing auth user from signup/owner code; an auth user with no email is an anonymous player, never
  a partner. Full rules: signup plan §Standing rules. Tripwire: `tests/lib.auth-users-fk-guard.test.ts`.

## Architecture & Database Patterns
- Client queries: `lib/supabase.ts` (anon key, RLS). Server/API: `lib/supabaseAdmin.ts` (service role, `server-only`).
- The browser never writes `pickem_picks` or `users` (`tests/player-table-write-lockdown-contract.test.ts`).
- State: `AuthSessionProvider` + component `useState`. No Redux/Zustand.
- Types are hand-maintained in `types/index.ts` (no generated Supabase types). React Strict Mode is off.
- **Data scoping:** auth is global (passkeys/username); points, leaderboards and game state are per venue.
- **Partner geofence** (`/owner/venue-location` → `PATCH /api/owner/venues/location`): rules only in
  `lib/venueLocationRules.ts` — pin moves ≤ 1 km per save (D6); an unchanged out-of-range radius is kept (D7). The page
  changes the radius only via `GeofenceEditor`'s `onRadiusChange`, never from `onChange`.
- **Wording:** players and partners see **Prize**; code/DB keep `reward`. Never "Reward" on screen
  (`tests/prizes-wording-contract.test.ts`). Say "credit allocation", never "credit limit".
- **Cost:** no polling or per-player loops where one bounded read per run works; estimate cost before adding a cron,
  a poll or a paid API call (global rule).

## Code Style & Constraints
- TypeScript strict, no `any`; arrow functions; absolute `@/` imports only (no `../`).
- **Design: minimal and simple** — fewest words, colors and elements; one focal point, one accent
  (`design-system/hightop-challenge-design-system/project/README.md`).
- **Styling:** Tailwind only; no custom CSS, CSS modules or inline `style={{}}`. Tokens in `lib/themeTokens.ts`.
  Exceptions: `components/venue-screen/*` (dynamic/animated values; tokens `lib/venueScreenBrand.ts`) and
  `components/category-blitz/LetterDieRoll.tsx` (per-frame ref writes).
- **No text under 12px anywhere** (`lib/textSizeFloor.ts`, `tests/text-size-floor-contract.test.ts`). Use the scale
  (`text-caption` 12px, `text-footnote` 13px). Inside a venue game use those, not `text-xs`/`text-sm` (inflated there).
- Nunito is the only website font; one loader, `components/ui/HightopLoader.tsx`.
- Light `/owner` sheets carry `ht-light-surface`; global form CSS opts out via `:where()` — never `!` utilities there.

## Manual Testing & Auth Storage
- Identity (`tp_user_id`, `tp_venue_id`, signed `tp_sess` when `SESSION_SECRET` is set) lives in cookies AND
  localStorage; `proxy.ts` gates on cookies only, so set cookies before navigating in Playwright/curl.
  Sources: `proxy.ts`, `lib/storage.ts`, `lib/serverSession.ts` (`createSessionCookie(userId)`).
- Browser-test from a scratchpad clone with no `.env.local` and mocked routes — dev and live share one database.

## Trivia and Category Blitz content
- **Speed Trivia** (`anytime_blitz` + `multiple_choice`): Admin UI / `trivia_questions` is canonical;
  `data/trivia/categories/` is an export only (Admin Review PR flow). **Live Trivia** (`live_showdown`, write-in):
  `data/live-trivia/categories/` JSON is canonical — edit it there; never rebuild it from Supabase or from git
  history. Never cross the two pools. Scripts read the current file and change only what was asked.
- **Category Blitz** is letter-first. `data/category-blitz/category-pool.json` is canonical (only add);
  `category-letter-index.json` and the cache are generated by `npm run category-blitz:build` — never hand-edit.
  Write/judge categories by `data/category-blitz/CATEGORY_TEST.md`.
- **Game tutorial cards** follow the Category Blitz layout (`TutorialStatementPanel`, `STATEMENT_LAYOUT_GAMES` in
  `components/venue/GameIdentityPanel.tsx`; copy in `lib/venueGameCards.ts`). Text wins, art shrinks; check at 350 px
  and 289 px (`tests/tutorial-statement-layout-contract.test.ts`).

## Feature rules — read the doc's "Standing rules" section before touching
| Feature | Doc | The rule most often broken |
|---|---|---|
| Native app (Capacitor, players only) | `docs/native-app-store-plan.md` | `/owner`, `/tv`, `/admin` never open in the app; `lib/nativeApp.ts` is the only reader of the app UA/bridge; push, passkeys, share, haptics, QR, account deletion rules live here. |
| Partner Results page | `docs/partner-results-page-plan.md` | A competition is a registry entry; no player id ever leaves the server. |
| Bingo / Pick 'Em reliability | `docs/bingo-pickem-reliability-plan.md` | Missing data is unknown, never zero; never re-grade won/lost cards. |
| Pick 'Em scoring, College Football, Pick 'Em Prizes | `docs/pickem-college-football-and-prize-plan.md` | Points move only via `pay_pickem_points` (`lib/pickemPoints.ts`); never a plain update. |
| Light theme | `docs/light-theme-plan.md` | Colours are tokens with dark AND light values; the root layout never reads `cookies()`. |
| Group Games terminology | `docs/group-games-terminology-plan.md` | On-screen names only; internal `live*` ids stay. |
| Category Blitz engine (continuous, sleep, global room, cadence) | `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md` | A round starts only from the game page's sessions GET; everything else peeks. |
| Prizes / Rewards system | `docs/rewards-system-plan.md` | New prize = one entry in `lib/rewardDefinitions.ts`; one shared `CreateRewardWizard`; redeem only via `redeem_challenge_prize`. |
| Partner self-serve signup + `auth.users` | `docs/partner-self-serve-signup-plan.md` | An unpaid signup is not an account; `lib/pendingSignup.ts` and `lib/venueClaim.ts` are the single homes. |
| Venue visibility (`venues.hidden`) | `docs/lapsed-venue-rehide-plan.md` | `lib/venueVisibility.ts` is the one truth table; never delete a `billing_subscriptions` row. |
| Join / login flow, God Mode | `docs/join-flow-location-error-plan.md` | Geolocation only after auth; God Mode is server-authoritative. Run `npm run test:god-mode-join`. |
| Navigation (Back / Next / Sign Out), owner sheets | `docs/navigation-unification-plan.md` | Four primitives in `components/navigation/`; never `router.push` a sheet step. |
| Join Merch Store | `docs/join-merch-store-plan.md` | Look-only; the join QR URL is permanent (`lib/joinQr.ts`). |
| Multi-venue billing | `docs/multi-venue-volume-billing-plan.md` | "Which bill covers this venue" only via `lib/venueBilling.ts`; prices only in `lib/venuePricing.ts`. |
| POS (Square / Toast / Clover) | `docs/pos-rewards-integration-plan.md` | Tokens only encrypted; never log or store a Square GAN. |
| Loader, brand images, dashboard first load | `docs/partner-dashboard-merch-button-loader-speed-plan.md` | `/brand/web/*` is immutable-cached: new artwork = new file name. |
| Fonts | `docs/nunito-typography-update-2026-10-24.md` | Nunito only, via tokens. |
| PWA / bingo landscape | `docs/bingo-fullscreen-pwa-plan.md` | No service worker ever; manifest `start_url` stays `/`, no `orientation`. Run `npm run test:pwa-contract`. |
| Super Bowl Squares + March Madness Bracket | `docs/squares-and-brackets-plan.md` | Seasonal points only via `creditSeasonalPoints`; prize cycle keys only via their helper. |
