# Venue Screen Implementation Plan

This document is the source of truth for building the public venue TV/projector screen for Live Trivia and Category Blitz.

Codex should execute the phases in order unless explicitly told to skip ahead. Each phase is designed to be end-to-end and independently reviewable.

Read VENUE_SCREEN_IMPLEMENTATION_PLAN.md and execute Phase X end to end.
Use the plan as the source of truth.
Implement the code, add or update tests, verify the phase, and then summarize what was completed and what the next phase should pick up.

## Product Goal

Create a public venue screen at a simple venue URL that can be opened on a smart TV, projector browser, or Amazon Firestick browser. The screen should automatically show:

- Active Live Trivia:
  - Venue name
  - Round number
  - Current category
  - Current question
  - Countdown clock
- Live Trivia intermission:
  - Leaderboard with player ranks and usernames
- Active Category Blitz:
  - Venue name
  - Current letter
  - Active categories
  - Countdown timer
- Category Blitz intermission/results:
  - Leaderboard with player ranks and usernames
- No active game:
  - Countdown to next Live Trivia game
  - Countdown to next Category Blitz game
  - Venue branding
  - Optional sponsor/ad slots

## Final URL Strategy

Use a public, shareable venue route. Do not use a tokenized display URL.

Recommended route:

- `/venue/[venueId]/screen`

Optional debug/testing query params may be added later, such as:

- `?mode=live-trivia`
- `?mode=category-blitz`
- `?mode=idle`

## Key Product Decisions

- Live Trivia is write-in only on phones. The public screen must not show answer options.
- Live Trivia active state shows:
  - question
  - category
  - countdown
  - round number
  - venue name
- Live Trivia intermissions show leaderboard.
- Category Blitz active state shows:
  - current letter
  - active categories
  - countdown timer
  - venue name
- Category Blitz intermissions/results show leaderboard.
- Leaderboards on TV should show player names and ranks.
- If both games overlap, the main public screen should prioritize Live Trivia over Category Blitz unless product direction changes later.
- Idle state should support optional venue branding and sponsor/ad slots.

## Existing Repo Assets To Reuse

- Live Trivia state route:
  - `app/api/trivia/live/state/route.ts`
- Live Trivia engine:
  - `lib/liveShowdownEngine.ts`
- Category Blitz session route:
  - `app/api/category-blitz/sessions/route.ts`
- Category Blitz round route:
  - `app/api/category-blitz/sessions/[id]/current-round/route.ts`
- Category Blitz engine/helpers:
  - `lib/categoryBlitz.ts`
- Venue route:
  - `app/venue/[venueId]/page.tsx`
- Venue helpers:
  - `lib/venues.ts`
- Existing admin venue area:
  - `components/admin/sections/VenuesSection.tsx`

## Architectural Direction

Build one normalized server-side screen state contract rather than having the TV UI call multiple APIs and reconcile them in the browser.

Recommended new server helper:

- `lib/venueScreen.ts`

Recommended new API route:

- `app/api/venue-screen/state/route.ts`

Recommended new page route:

- `app/venue/[venueId]/screen/page.tsx`

Recommended new component area:

- `components/venue-screen/*`

## Normalized Screen State Contract

Codex should implement a single normalized screen payload that the client can poll.

Suggested shape:

```ts
type ScreenLeaderboardEntry = {
  rank: number;
  username: string;
  points: number;
};

type VenueScreenState =
  | {
      ok: true;
      mode: "live-trivia";
      venue: {
        id: string;
        name: string;
        displayName?: string | null;
        screenBrandImageUrl?: string | null;
        screenBrandPrimary?: string | null;
        screenBrandSecondary?: string | null;
      };
      liveTrivia: {
        phase: "question" | "intermission" | "final";
        roundNumber: number | null;
        totalRounds: number;
        category: string | null;
        question: string | null;
        secondsRemaining: number;
        leaderboard: ScreenLeaderboardEntry[] | null;
      };
      categoryBlitz: null;
      idle: null;
      updatedAt: number;
    }
  | {
      ok: true;
      mode: "category-blitz";
      venue: {
        id: string;
        name: string;
        displayName?: string | null;
        screenBrandImageUrl?: string | null;
        screenBrandPrimary?: string | null;
        screenBrandSecondary?: string | null;
      };
      liveTrivia: null;
      categoryBlitz: {
        phase: "round" | "intermission" | "results";
        roundId: string | null;
        letter: string | null;
        categories: string[];
        secondsRemaining: number;
        leaderboard: ScreenLeaderboardEntry[] | null;
      };
      idle: null;
      updatedAt: number;
    }
  | {
      ok: true;
      mode: "idle";
      venue: {
        id: string;
        name: string;
        displayName?: string | null;
        screenBrandImageUrl?: string | null;
        screenBrandPrimary?: string | null;
        screenBrandSecondary?: string | null;
      };
      liveTrivia: null;
      categoryBlitz: null;
      idle: {
        nextLiveTrivia: {
          startsAt: string;
          title: string;
          firstRoundCategory?: string | null;
        } | null;
        nextCategoryBlitz: {
          startsAt: string;
        } | null;
        sponsorSlots: Array<{
          title: string;
          imageUrl: string;
          linkUrl?: string | null;
        }>;
      };
      updatedAt: number;
    };
```

## Polling Strategy

Start with polling, not realtime subscriptions.

- Active Live Trivia question state: poll every 1 second
- Live Trivia intermission: poll every 3 to 5 seconds
- Active Category Blitz round: poll every 1 second
- Category Blitz intermission/results: poll every 3 to 5 seconds
- Idle state: poll every 15 to 30 seconds

This is the recommended MVP because TV browsers are usually more reliable with polling than websocket-heavy behavior.

## Schema Plan

### MVP Venue Fields

Add the following columns to `venues`:

- `screen_enabled boolean not null default true`
- `screen_brand_image_url text null`
- `screen_brand_primary text null`
- `screen_brand_secondary text null`
- `screen_sponsor_rotation_enabled boolean not null default false`

### Sponsor Slots Table

Add a new table:

- `venue_screen_sponsors`

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `venue_id text not null`
- `title text not null`
- `image_url text not null`
- `link_url text null`
- `display_order integer not null default 0`
- `is_active boolean not null default true`
- `starts_at timestamptz null`
- `ends_at timestamptz null`
- `created_at timestamptz not null default now()`

MVP note:

- If speed matters, Phase 1 may ship without full sponsor CRUD UI.
- In that case, create the table now but only read active sponsors in idle mode.

## Component Plan

Create these components:

- `components/venue-screen/VenueScreenClient.tsx`
  - polling loop
  - fullscreen-safe container
  - switches between display modes
- `components/venue-screen/VenueScreenFrame.tsx`
  - common background
  - venue title
  - brand treatment
  - optional sponsor region
- `components/venue-screen/LiveTriviaScreen.tsx`
  - category
  - question
  - round
  - countdown
- `components/venue-screen/LiveTriviaIntermissionScreen.tsx`
  - leaderboard layout
- `components/venue-screen/CategoryBlitzScreen.tsx`
  - letter
  - categories
  - countdown
- `components/venue-screen/CategoryBlitzIntermissionScreen.tsx`
  - leaderboard layout
  - intermission/results labels
- `components/venue-screen/IdleVenueScreen.tsx`
  - next game countdowns
  - venue branding
  - sponsor slots
- `components/venue-screen/ScreenLeaderboard.tsx`
  - shared leaderboard rendering
- `components/venue-screen/ScreenCountdown.tsx`
  - large format countdown
- `components/venue-screen/SponsorRail.tsx`
  - idle-state sponsor display

## Phase Plan

## Phase 1: Screen State Architecture and Public Route

### Goal

Create the new public venue screen route and the normalized screen-state API contract, wired to existing Live Trivia and Category Blitz data.

### Deliverables

- Add `lib/venueScreen.ts`
- Add `app/api/venue-screen/state/route.ts`
- Add `app/venue/[venueId]/screen/page.tsx`
- Add initial `VenueScreenClient`
- Implement mode selection logic:
  - active Live Trivia
  - Live Trivia intermission
  - active Category Blitz
  - Category Blitz intermission/results
  - idle

### Implementation Notes

- Reuse existing state from `getLiveShowdownState`
- Reuse Category Blitz session and current-round state
- Keep display selection logic centralized in `lib/venueScreen.ts`
- Live Trivia should take priority if both games overlap
- Do not build sponsor CRUD in this phase

### Tests

- Unit tests for normalized state selection
- Unit tests for overlap priority
- Unit tests for idle fallback

### Recommended Model

- Use `Codex 5.5`

### Recommended Intelligence Level

- High

### Why 5.5

- This phase defines the contract every later phase depends on.
- It includes the trickiest reasoning around overlap, display rules, normalization, and reuse of existing engine behavior.

## Phase 2: Live Trivia TV Experience

### Goal

Implement the Live Trivia active-question screen and intermission leaderboard screen using the normalized state contract.

### Deliverables

- `components/venue-screen/LiveTriviaScreen.tsx`
- `components/venue-screen/LiveTriviaIntermissionScreen.tsx`
- `components/venue-screen/ScreenCountdown.tsx`
- `components/venue-screen/ScreenLeaderboard.tsx`
- Active question view shows:
  - venue name
  - round number
  - category
  - question
  - countdown
- Intermission view shows:
  - leaderboard
  - player ranks
  - usernames
  - points

### Implementation Notes

- Do not show answer options
- Make typography and spacing usable from across a room
- Keep animation restrained and legible on TVs
- Poll every 1 second during active question state
- Poll more slowly during intermission

### Tests

- Component rendering tests where practical
- State-driven UI tests for question vs intermission branches

### Recommended Model

- Use `Codex 5.5`

### Recommended Intelligence Level

- High

### Why 5.5

- This phase benefits from stronger UI judgment and better large-screen composition.
- It also touches behavior that users will immediately notice live at venues.

## Phase 3: Category Blitz TV Experience

### Goal

Implement the Category Blitz active-round screen and intermission/results leaderboard screen.

### Deliverables

- `components/venue-screen/CategoryBlitzScreen.tsx`
- `components/venue-screen/CategoryBlitzIntermissionScreen.tsx`
- Active round view shows:
  - venue name
  - current letter
  - active categories
  - countdown
- Intermission/results view shows:
  - leaderboard
  - player ranks
  - usernames
  - points

### Implementation Notes

- Reuse shared leaderboard/countdown components from Phase 2
- Make sure results/intermission labels are explicit
- Maintain the same visual system as Live Trivia while keeping the mode visually distinct

### Tests

- UI tests for active round vs intermission/results
- Unit tests for Category Blitz display state mapping

### Recommended Model

- Use `Codex 5.4`

### Recommended Intelligence Level

- Medium

### Why 5.4

- By this point, architecture and shared UI primitives should already be established.
- This becomes mostly straightforward implementation work.

## Phase 4: Idle State, Venue Branding, and Sponsor Read Path

### Goal

Implement the idle screen shown when no live game is active, including next-game countdowns, venue branding, and sponsor/ad display read support.

### Deliverables

- `components/venue-screen/IdleVenueScreen.tsx`
- `components/venue-screen/SponsorRail.tsx`
- Server support to load:
  - next Live Trivia time
  - next Category Blitz time
  - venue branding fields
  - active sponsor slots
- Idle view shows:
  - countdown to next Live Trivia
  - countdown to next Category Blitz
  - venue branding
  - optional sponsor slots

### Implementation Notes

- Use branding fields from `venues`
- Read sponsor rows if they exist
- If sponsor slots are empty, idle screen should still look complete
- Keep sponsor visuals out of the way of key scheduling information

### Tests

- Idle state data tests
- Sponsor read-path tests
- Rendering tests for empty vs populated sponsor states

### Recommended Model

- Use `Codex 5.5`

### Recommended Intelligence Level

- High

### Why 5.5

- This phase combines data modeling, UX hierarchy, and visual composition.
- A better model will usually make the idle screen feel more intentional and less generic.

## Phase 5: Database Migration and Admin Controls

### Goal

Add schema support and admin controls for venue screen settings and sponsor management.

### Deliverables

- Supabase migration for `venues` screen fields
- Supabase migration for `venue_screen_sponsors`
- Admin UI in venue/admin area for:
  - enable/disable venue screen
  - brand image URL or asset selection
  - brand colors
  - sponsor slot CRUD
  - screen preview link

### Implementation Notes

- Extend existing venue admin areas instead of creating a parallel admin system
- Keep the first admin version practical rather than over-designed
- Validate URLs and required sponsor fields

### Tests

- API tests for screen settings persistence if new admin routes are added
- Form behavior tests where practical

### Recommended Model

- Use `Codex 5.4`

### Recommended Intelligence Level

- Medium

### Why 5.4

- This is mostly CRUD and admin wiring work once the product shape is settled.

## Phase 6: Reliability, Polish, and Launch Hardening

### Goal

Make the screen reliable for real venue use on TVs, projectors, and Firestick browsers.

### Deliverables

- Better loading and reconnect states
- Last-updated heartbeat indicator
- Auto-retry on transient failures
- Safer poll interval switching by mode
- Optional debug query params for testing
- Burn-in mitigation for long idle sessions if desired
- Final QA pass across desktop and TV-like viewport sizes

### Implementation Notes

- Optimize for long-running open tabs
- Keep the screen readable if polling temporarily fails
- Avoid motion or layout shifts that are distracting on large screens

### Tests

- Polling interval logic tests
- Recovery-state tests
- Responsive verification

### Recommended Model

- Use `Codex 5.5`

### Recommended Intelligence Level

- High

### Why 5.5

- This phase benefits from stronger review judgment, edge-case thinking, and final production hardening.

## How To Instruct Codex

Recommended prompt pattern:

1. Tell Codex to read this file first:
   - `VENUE_SCREEN_IMPLEMENTATION_PLAN.md`
2. Specify the phase number to execute
3. Tell Codex to complete the phase end-to-end, including:
   - code changes
   - tests
   - verification
   - a short summary of what remains for the next phase

Suggested prompt:

```text
Read VENUE_SCREEN_IMPLEMENTATION_PLAN.md and execute Phase 1 end to end.
Use the plan as the source of truth.
Implement the code, add or update tests, verify the phase, and then summarize what was completed and what Phase 2 should pick up next.
```

## Model Guidance Summary

- Phase 1: `Codex 5.5`
- Phase 2: `Codex 5.5`
- Phase 3: `Codex 5.4`
- Phase 4: `Codex 5.5`
- Phase 5: `Codex 5.4`
- Phase 6: `Codex 5.5`

## Intelligence Guidance Summary

- Phase 1: High
- Phase 2: High
- Phase 3: Medium
- Phase 4: High
- Phase 5: Medium
- Phase 6: High

## Fastest Sensible MVP Path

If time is tight, the minimum useful rollout is:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4 without full sponsor CRUD

That sequence gets a venue-usable public screen live before admin management is fully complete.
