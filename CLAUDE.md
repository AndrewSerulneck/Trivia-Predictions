# CLAUDE.md — Hightop Challenge Project Rules

> **Read `SYSTEM_CONTEXT.md` before starting any task.**
>
> **Strategic direction (next few weeks):** `/info` is becoming the apex homepage; the player game login is moving to `play.hightopchallenge.com`; and the `/owner/*` payments surface is becoming the mobile-first **Partner Dashboard** (self-serve live-game scheduling, TV display URL, and Stripe billing). See `SYSTEM_CONTEXT.md` §0 and the canonical build plan in `docs/partner-dashboard-plan.md`.
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
- `.env.local`: Never read, modify, or expose.
- `supabase/migrations/`: Read-only historical reference. Never write or alter SQL migration files directly.
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
