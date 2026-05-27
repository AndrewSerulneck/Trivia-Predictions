# Technical System Context (Single Source of Truth)

- **Project Name:** Hightop Challenge
- **Project Essence:**
  - A mobile-first, venue-based social gaming platform where users join a specific physical venue and compete in game experiences (notably Trivia and Sports Bingo, plus Pick'em/Fantasy extensions).
  - Core value: shared, location-scoped competition with leaderboard progression, rewards, and monetization via targeted ads.
  - Venue Home third panel is now **Challenges** (campaign-style progression), while legacy **head-to-head user challenges** remain a separate subsystem.

## 1. Project Essence
- Website type:
  - Location-aware, geofenced-style gaming web app for bars/venues.
  - Users enter through a join flow, bind to a venue, and play short-session competitive games.
- Product pillars:
  - Venue identity + community competition.
  - Fast mobile gameplay loops.
  - Persistent user points, standings, and prize incentives.
  - Ad-supported monetization with controlled frequency/placement logic.

## 2. Key User Flows
- Landing -> Venue Selection:
  - Entry starts at `/` using `JoinFlow`.
  - User chooses/arrives with venue context (`venueId`), profile is ensured via API (`/api/join/profile`, `/api/join/ensure-venue`).
- Venue Selection -> Home Screen:
  - User lands at `/venue/[venueId]` (rendered by `VenueHubClient`), which is the venue home hub.
  - Home includes game cards, user status, badges, leaderboard, and a Challenges panel with campaign cards/progress.
- Home Screen -> Game Entry (Trivia/Bingo/Pick 'Em/Fantasy):
  - Selecting a game card triggers an app-like transition (`runVenueGameOpenTransition`).
  - Game routes use `GameLandingExperience` as an intermediate rules/entry surface before full play state.
  - Inside game experience, Back to Venue uses coordinated return transitions (`runVenueGameReturnTransition`).
- Resume behavior:
  - `GameLandingExperience` checks resumable sessions (`hasResumableSession`) and can auto-resume into active gameplay.

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

## 4. Ad System Logic
- Core model: deterministic, frequency-aware ad rotation.
- Deterministic queue behavior:
  - Client increments local counters (`lib/adFrequency.ts`) per slot/context key.
  - Counter is passed to `/api/ads/slot` as `clientCounter`.
  - Server picks ad deterministically using modulo selection (`chooseAdByCounter` in `lib/ads.ts`), producing stable round-robin rotation for competing ads.
- Ad types + slots:
  - Banner: primarily `mobile-adhesion` (bottom-fixed mobile unit).
  - Pop-up: `popup-on-entry` and `popup-on-scroll` slots (plus round-end flow in popup orchestration).
  - Inline: content slot patterns (for example leaderboard/sidebar inline placements).
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
  - Active ad page keys are `join`, `venue`, `trivia`, `sports-bingo`, `pickem`, and `fantasy` (legacy `sports-predictions` removed).

## 5. Technical Stack
- Framework/runtime:
  - Next.js (App Router), React, TypeScript.
- Styling/UI:
  - Tailwind CSS, custom utility classes, responsive safe-area/mobile viewport handling.
- Motion/interaction:
  - Framer Motion (dependency present), custom transition systems for route/game entry animations.
- Backend/data:
  - Supabase (`@supabase/supabase-js`) with server/admin access patterns.
- Testing/tooling:
  - Vitest, ESLint, PostCSS, TypeScript compiler.
- Domain integrations:
  - Sports data integrations (Odds API, API-Sports, balldontlie usage in sports modules).

## 6. Design Language
- Aesthetic direction: mobile-native, playful, app-like interaction model with iOS-adjacent behavior patterns.
- UX patterns in use:
  - Sticky/fixed top nav with safe-area padding.
  - Swipe/scroll-centric home navigation surfaces.
  - Layered overlays for popups and transition masks.
  - Momentum-friendly touch scrolling (`touch-pan-y`, mobile scroll guards).
  - Large tap targets (44px+), rounded pill buttons, gradient-heavy game identity cards.
  - Fast visual feedback on press/transition; route-to-route continuity animations.

## 7. Known Constraints and Architectural Rules
- Z-index hierarchy is critical:
  - Header, game surfaces, transition overlays, popup ads, and adhesion ads rely on strict stacking order; regressions here can break navigation or ad visibility.
- Transition handling is stateful:
  - Venue->game and game->venue flows use session-backed transition gates/snapshots; avoid bypassing transition helpers when adding new game entry points.
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
  - **Campaign challenges** use separate modules/endpoints (`lib/challengeCampaigns.ts`, `/api/challenge-campaigns`, admin resource `challenge-campaigns`).
  - Do not merge or repurpose one model into the other without a deliberate migration plan.
- Supabase migration security contract:
  - For any Supabase-related task (new table, schema change, policy update, grants), agents must review and follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` before writing SQL migrations.
