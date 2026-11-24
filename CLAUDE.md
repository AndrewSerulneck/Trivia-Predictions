# CLAUDE.md — Hightop Challenge Project Rules

> **Be concise by default.** Short, direct answers; no restating the task, no trailing summaries unless asked.
>
> **Product copy must be minimal.** Use the fewest words needed to act, decide or recover from an error.
> Omit redundant labels, obvious instructions, unsolicited helper text and implementation details.
> Confirm success with “Saved.” when sufficient. Review new and edited screens for unnecessary copy before finishing.
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

## Model and effort per phase (all coding agents)
Every multi-phase plan has a table naming each phase's **model AND effort level**, with a one-line reason.
**Name models from the planning agent's own family** — Claude plans name Claude models, Codex plans name
Codex/GPT models, any other agent names its own. Within that family, **choose the most token-efficient model
that will do the phase correctly**; phases in one plan may use different models and tiers. Cheaper isn't efficient if it causes rework:
use a top model where mistakes are costly. If Andrew names a model, use it.

Guide by phase: **top model / high effort** for auth, money, migrations, data changes, shared renderers or
engines, or a design spanning several files; **mid model / medium** for well-specified UI, copy and tests;
**small model / low** for mechanical edits and doc-only phases. Give a reason for departures. If the exact model
is unknown, state the family and uncertainty; never invent a version. An agent that can't run the named model
uses the nearest equivalent tier and records the substitution in its handoff. A new plan is incomplete without
the table.

## Code review findings become remedial phases — automatic (Andrew, 2026-11-24)
Every code review (a plan's review phase such as CR1, a `/code-review` run, or a review Andrew asks for) ends by
writing each verified finding worth fixing, with the fix you worked out, into a plan as a **remedial phase**. Do it
without being asked; a review isn't finished until its fixes are in the plans.
- **Which plan:** the plan that owns the affected code. Use the reviewed plan if one of its own phases introduced the
  bug. If the code belongs to another feature (see "Feature rules" below), put the phase in that feature's plan and
  leave a one-line pointer in the reviewed plan's findings table. If no plan owns it, use the reviewed plan.
- **Form:** a findings row (`#`, finding, `file:line`, introduced / pre-existing / nit, severity, failure scenario,
  fix, phase); a phase-table row named after the review (`CR1.1`, `CR1.2`, … or `T4.1`) with model, effort and
  reason; and a "Phase details" section a fresh agent can follow with no other context, including the test that
  must fail before the fix. Group findings by branch and risk. A migration or data fix gets its own phase on the
  top model.
- **Gate:** adding the phase is automatic; doing it waits for Andrew's OK ("Awaiting Andrew's OK"). Exception: a
  live security hole, data leak, wrong points or lost picks is reported to him at once, at the top of the handoff.
- Findings you couldn't verify are recorded as "plausible, unverified", with an investigate step if worth one.
- Update each touched plan's status line and the review's handoff to list the new phases.

## Build and Test Commands
- Dev server: `npm run dev` (Andrew runs it on :3000 — never use it for tests that write data; never `pkill next`)
- Build: `npm run build` · Lint: `npm run lint` · Tests: `npm run test` (Vitest)
- Typecheck: `npx tsc --noEmit` (fresh clone: `npx next typegen` first). Never run typecheck and build at the same time.

## Fewer PRs and builds (Andrew, 2026-11-24)
Each PR update runs CI and a Vercel preview; each merge runs a production build and CI on `main`.
- Plan, handoff and status updates go in the same PR as the code they describe. No follow-up docs-only PR to record
  a PR number or "merged": add it as another commit on the same PR, or in the next PR that touches that plan.
- Commit locally; push once when the PR is ready, then only for fixes. Small phases of one plan that are ready
  together ship as one PR.
- Docs-only changes skip Vercel (`scripts/vercel-ignore-build.cjs`) and CI (`ci.yml` `paths`); Railway rebuilds the
  heartbeat worker only for its own files (`railway.json`). A test that reads a doc must be re-included in `ci.yml`
  (`tests/build-skip-contract.test.ts`). The old `trivia-predictions` Vercel project is paused; never unpause it.

## Native app releases — automatic (Andrew, 2026-11-23)
When you finish a change to a native app's **shell** (anything under `native/` or `native-tv/`: plugins, config,
icons, permissions, version), release it yourself to every store it ships in. Don't wait to be asked. Website changes
need no release: the phone apps load `play.hightopchallenge.com` and the TV app loads the TV pages.
- **iOS + Google Play:** build with a raised build number / version code, then upload and submit using
  `native/scripts/store-release.cjs` (Google Play: `play-upload`, then `play-promote` with a staged `--fraction`;
  iOS: upload via `xcodebuild -exportArchive`, then `asc-prepare` and `asc-submit`).
  Runbook: `docs/native-app-release-runbook.md`.
- **Fire TV (Amazon):** `npm run fire-tv:release` (bump, build, sign check, upload, submit). It stops if a release is
  still in review.
- Run the tests and lint first; never release a failing build. Store review can't be skipped. Report what was
  submitted (version / build) and record it in the feature's plan and handoff.
- Keys live in `~/Library/Application Support/Hightop Challenge/signing/` and `.env.local`; never print them.

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
  `lib/venueLocationRules.ts` — pin-only moves ≤ 1 km per save (D6); an unchanged out-of-range radius is kept (D7). The page
  changes the radius only via `GeofenceEditor`'s `onRadiusChange`, never from `onChange`.
  Full address relocation uses an owner/venue-scoped signed Places selection (`lib/ownerVenueAddress.ts`),
  authorized 2026-11-05; see `docs/venue-address-change-2026-11-05.md`.
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
- **Difficulty differs by game (Andrew, 2026-11-16).** Speed is multiple choice: the answer is on screen, so players
  can RECOGNIZE it or guess, and a question can be much harder than Live. It must still be knowable for the average
  American: a recognizable subject and a fairly common fact, never specialist-only. Live is write-in: players must
  RECALL it, so it must be easier and the fact itself widely known. Code home: `lib/question-variety/factRules.cjs`.
- **AI for trivia questions: OpenAI / ChatGPT first (Andrew, repeated; recorded 2026-11-18).** Writing, grading
  (bar test), fact-checking and any new question-pipeline AI step use ChatGPT (Codex on his plan, run in the private
  writer repo `AndrewSerulneck/hightop-question-writer`) or another OpenAI model. **Gemini comes out altogether (D40,
  2026-11-19: "I simply don't trust it"):** 4f.1 deleted every Gemini writer; 4f.2 moved the repeat checks, tagging and
  the backup bar test to the OpenAI API (`lib/openai/`). No Gemini anywhere; never add one
  (`tests/no-gemini-writer-contract.test.ts`).
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
| Game themes (Venue Home buttons, Share to social looks) | `docs/game-themes-plan.md` | Every Venue Home game = one `GAME_TILE_THEMES` entry; every Share to social game (`PromoGameId`) = one `PROMO_THEMES` entry; a theme styles the name, never rewords it; vector art only, no logos. |
| Share Your Win celebration effects + Animated Story | `docs/share-win-celebration-plan.md` | Effects never cover a `keepOut` box (words, QR, panel, face) in any frame; a shared picture's `effectsKey` must match the chips; the video ends on the still. |
| Share to social (partner posts / Reels) | `docs/partner-social-promo-plan.md` | A new schedulable game or prize challenge needs a Share to social design too (`lib/promo/promoTemplates.ts`); prizes ride on the game's design. |
| Venue display intro stinger, effects, keep-awake | `docs/venue-display-hype-and-intro-stinger-plan.md` | The stinger plays on every open except `intro=0` (thumbnail only); "IT'S GAME TIME." never before 2.15 s; nothing replays on a poll tick; game moments fire only through `useFx` / `useFxMoment` keys. |
| Venue display: pre-game, no ads, Display URL, Category Blitz yields | `docs/live-trivia-pregame-and-display-cleanup-plan.md` | No player runtime or ads on display paths (`isVenueDisplayPath`); precedence lives only in `selectVenueScreenState`; the TV only peeks at Category Blitz; set up by Display URL, or by connecting the Hightop Challenge TV app (QR or display code; `docs/fire-tv-app-plan.md`), which grants a venue id only. |
