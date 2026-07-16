# Category Blitz Continuous Mode - Implementation Handoff Document

**Date:** 2026-07-15  
**Status:** Phases 1-4 Complete, Phase 5 Ready  
**Author:** Kimi K2.5  
**Recipient:** Claude Sonnet 4.5 (Phase 5 Implementation)

---

## Executive Summary

This document provides a complete handoff of the Category Blitz Continuous Mode feature. Phases 1-4 (Backend Infrastructure, Core Engine, Category Management System, and Admin UI) are fully implemented and tested. Phase 5 (Client-Side Adaptations) is ready for implementation.

**Key Achievement:** Category Blitz can now run in two modes:
- **Scheduled Mode** (existing): Time-boxed sessions with start/end times
- **Continuous Mode** (new): Infinite loop with randomized rounds, no schedules

---

## Files Created/Modified

### New Files (11)

```
supabase/migrations/20260715091637_category_blitz_session_type.sql
supabase/migrations/20260715091652_category_blitz_continuous_config.sql
lib/categoryBlitzPool.ts (274 lines)
app/api/category-blitz/continuous-config/route.ts
app/api/category-blitz/pool/route.ts
app/api/category-blitz/pool/validate/route.ts
components/category-blitz/CategoryBlitzContinuousSettings.tsx
components/category-blitz/CategoryPoolManager.tsx
components/category-blitz/LetterCoverageVisualizer.tsx
app/owner/category-blitz/page.tsx
```

### Modified Files (3)

```
lib/categoryBlitz.ts (+361 lines)
types/index.ts (+18 lines)
tests/lib.venue-screen.test.ts (+1 line - added sessionType to fixture)
```

---

## Phase 1-4 Implementation Details

### Phase 1: Architecture & Data Model

#### Database Schema Changes

**1. `category_blitz_sessions` table (migration: `20260715091637`)**

Added column:
```sql
session_type text not null default 'scheduled'
  check (session_type in ('scheduled', 'continuous'))
```

- Default `'scheduled'` maintains backward compatibility
- Index `idx_category_blitz_sessions_type` for filtering
- All existing sessions are automatically `'scheduled'`

**2. `category_blitz_continuous_config` table (migration: `20260715091652`)**

Full table schema:
```sql
create table public.category_blitz_continuous_config (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id) on delete cascade,
  is_active boolean not null default false,
  round_duration_seconds integer not null default 180,
  intermission_seconds integer not null default 300,
  mode_selection text not null default 'random',
  category_pool text[] not null default '{}',
  min_categories_per_letter integer not null default 12,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint uq_category_blitz_continuous_config_venue unique (venue_id),
  constraint category_blitz_continuous_config_mode_check
    check (mode_selection in ('random', 'weighted_standard', 'weighted_reverse')),
  constraint category_blitz_continuous_config_round_duration_check
    check (round_duration_seconds >= 30),
  constraint category_blitz_continuous_config_intermission_check
    check (intermission_seconds >= 0),
  constraint category_blitz_continuous_config_min_categories_check
    check (min_categories_per_letter >= 5)
);
```

**RLS Policies:**
- Owners/admins: Full CRUD on their venue's config
- Players: SELECT only (to know game mode)

#### Type Definitions (`types/index.ts`)

```typescript
// New types
export type CategoryBlitzSessionType = 'scheduled' | 'continuous';
export type CategoryBlitzModeSelection = 'random' | 'weighted_standard' | 'weighted_reverse';

// Extended interface
export interface CategoryBlitzSession {
  // ... existing fields
  sessionType: CategoryBlitzSessionType;  // NEW - required field
}

// New interface
export interface CategoryBlitzContinuousConfig {
  id: string;
  venueId: string;
  isActive: boolean;
  roundDurationSeconds: number;
  intermissionSeconds: number;
  modeSelection: CategoryBlitzModeSelection;
  categoryPool: string[];
  minCategoriesPerLetter: number;
  createdAt: string;
  updatedAt: string;
}
```

---

### Phase 2: Core Engine (`lib/categoryBlitz.ts`)

#### New Functions Added

**1. `getContinuousSession(venueId: string)`**
- Returns active continuous session for venue (status: lobby/active/scoring)
- Returns null if no continuous session exists
- Used by engine to check if continuous mode is running

**2. `createContinuousSession(venueId: string, testMode?: boolean)`**
- Creates new continuous session with `session_type: 'continuous'`
- Sets `status: 'active'` (skips lobby entirely)
- Sets `scheduled_end_at: null` (no end time - runs forever)
- Sets `starts_at: now()` (immediate start)
- Validates that continuous config exists and is enabled
- Broadcasts `continuous_session_created` event

**3. `startContinuousRound(sessionId: string, config: {...})`**
- Pure random letter selection: `pickRandomLetter()` (no repeat avoidance)
- Weighted mode selection: `pickRandomMode(config.modeSelection)`
- Uses custom timing from config (not hardcoded values)
- Assembles board from custom pool or all categories
- Same round creation as scheduled mode, just different selection logic

**4. `driveContinuousCategoryBlitz(venueId: string, now?: Date)`**
- Main engine function (mirrors `driveVenueCategoryBlitz` for scheduled)
- Returns `ContinuousSessionResult | null`
- Flow:
  1. Check if continuous config exists (return null if not)
  2. Score any expired rounds
  3. Get or create continuous session
  4. If no rounds exist → start first round immediately
  5. If round in progress → return "round_in_progress"
  6. If intermission not elapsed → return "waiting_intermission"
  7. Start next round

**5. `endContinuousSession(sessionId: string)`**
- Gracefully stops continuous session
- Scores any active round first
- Sets status to 'complete' with completed_at timestamp
- Broadcasts `continuous_session_ended` event

**6. `runContinuousCategoryBlitzEngine(now?: Date)`**
- Cron-compatible batch processor
- Finds all venues with `is_active: true` in config
- Calls `driveContinuousCategoryBlitz` for each
- Returns stats: driven venues, started rounds, errors

#### Key Integration Points

```typescript
// From lib/categoryBlitzPool.ts (imported at top of lib/categoryBlitz.ts)
import {
  isContinuousModeEnabled,
  getContinuousConfig,
  pickRandomLetter,
  pickRandomMode,
  assembleRandomBoard,
} from "@/lib/categoryBlitzPool";

// Uses existing functions (no duplication):
// - scoreRound() - same scoring logic
// - broadcastCategoryBlitz() - same broadcast system
// - scoreExpiredRoundForVenue() - same cleanup logic
```

---

### Phase 3: Category Management (`lib/categoryBlitzPool.ts`)

#### Key Functions

**1. `getContinuousConfig(venueId: string)`**
```typescript
Returns: {
  isActive: boolean;
  roundDurationSeconds: number;
  intermissionSeconds: number;
  modeSelection: 'random' | 'weighted_standard' | 'weighted_reverse';
  categoryPool: string[];
  minCategoriesPerLetter: number;
} | null
```
- Returns null if config doesn't exist or is not active
- Used by engine to determine if continuous mode should run

**2. `validateCategoryPool(pool: string[], minPerLetter?: number)`**
- Checks coverage for all 18 usable letters (A, B, C, D, E, F, G, H, I, L, M, N, O, P, R, S, T, W)
- Returns gaps (letters with insufficient categories)
- Returns coverage counts per letter
- Used before enabling continuous mode

**3. `pickRandomLetter(): string`**
- Pure random from `USABLE_LETTERS` array
- No tracking of used letters (unlike scheduled mode)
- Can return same letter consecutively

**4. `pickRandomMode(selection: ModeSelection): 'standard' | 'reverse'`**
- `'random'`: 50/50 chance
- `'weighted_standard'`: 75% standard, 25% reverse
- `'weighted_reverse'`: 25% standard, 75% reverse

**5. `assembleRandomBoard(letter: string, categoryPool?: string[]): string[]`**
- Shuffles available categories for letter
- Takes first 12 (ROUND_CATEGORY_COUNT)
- Filters by custom pool if provided
- Pure random selection (no "used categories" tracking)

**6. `addCategoriesToPool(venueId: string, categories: string[])`**
- Adds categories to venue's custom pool
- Persists to database
- Clears in-memory cache
- Broadcasts `pool_updated` event

**7. `removeCategoriesFromPool(venueId: string, categories: string[])`**
- Removes categories from venue's custom pool
- Persists to database
- Clears in-memory cache
- Broadcasts `pool_updated` event

**8. `getVenuePoolState(venueId: string)`**
- Returns full pool state for admin UI
- Includes config, coverage per letter, validity status

---

### Phase 4: Admin UI

#### API Routes

**`GET /api/category-blitz/continuous-config?venueId=xxx`**
- Returns `{ config, poolState }`
- No auth required (players need to know mode)

**`POST /api/category-blitz/continuous-config`**
- Body: `{ venueId, isActive, roundDurationSeconds, intermissionSeconds, modeSelection, categoryPool, minCategoriesPerLetter }`
- Requires admin auth
- Validates pool coverage before accepting
- Returns updated `{ config, poolState }`

**`GET /api/category-blitz/pool?venueId=xxx`**
- Returns `{ poolState, allCategories }`
- `allCategories` is deduplicated list of all available categories

**`POST /api/category-blitz/pool`**
- Body: `{ venueId, categories: string[] }`
- Adds categories to pool
- Broadcasts `pool_updated` event

**`DELETE /api/category-blitz/pool`**
- Body: `{ venueId, categories: string[] }`
- Removes categories from pool
- Broadcasts `pool_updated` event

**`POST /api/category-blitz/pool/validate`**
- Body: `{ categories, minCategoriesPerLetter }`
- Returns `{ valid, gaps, coverage }` without persisting
- For preview/validation before save

#### React Components

**`CategoryBlitzContinuousSettings`**
- Toggle switch for `isActive`
- Numeric inputs for `roundDurationSeconds` (30-600) and `intermissionSeconds` (0-600)
- Dropdown for `modeSelection`
- Shows coverage warning if insufficient
- Save button with loading state

**`CategoryPoolManager`**
- Search box for filtering categories
- Letter filter dropdown
- Two-column layout: Available | In Pool
- "Add All Visible" bulk action
- "Clear All" to reset to default
- Shows count badges

**`LetterCoverageVisualizer`**
- 18-letter grid (A-Z, colored by coverage)
- Green: ≥12 categories
- Yellow: <12 but >0
- Red: 0 categories
- Stats cards: Sufficient / Low / Missing
- Warning banners for problematic letters

**Owner Dashboard Page: `/owner/category-blitz`**
- Venue selector dropdown
- Renders all three components
- Back link to schedule page
- Uses `OwnerShell` layout

---

## Phase 5: Client-Side Adaptations - EXTREME DETAIL

### Overview

Phase 5 modifies the player-facing game UI to handle continuous mode gracefully. Unlike scheduled mode which has clear session boundaries (lobby → rounds → game over → wait for next session), continuous mode is an infinite loop.

**Key Differences:**
| Aspect | Scheduled Mode | Continuous Mode |
|--------|---------------|-----------------|
| Lobby | Yes (60s dwell) | No (rounds start immediately) |
| Session End | Game Over screen, wait for next session | Intermission, then next round |
| Next Game | Show schedule countdown | Show intermission countdown |
| Indicator | "Game Over" | "∞ Continuous" |

### Target File

**Primary:** `components/category-blitz/CategoryBlitzGame.tsx` (1,735 lines)

**Secondary:** `lib/categoryBlitzRealtime.ts` (800 lines) - may need minor hook updates

### Specific Implementation Tasks

#### Task 1: Add Continuous Mode Indicator in Header

**Location:** Lines 1176-1195 (StatusHeader component or inline in main component)

**Current Code:**
```tsx
<p className={`text-[0.7rem] font-black uppercase tracking-[0.16em] ${TEXT_ACCENT}`}>
  {phase === "lobby" ? "Lobby" : phase === "answering" ? "Round Active" : phase === "scoring" ? "Scoring" : phase === "reveal" ? "Revealing" : phase === "results" ? "Results" : phase === "complete" ? "Game Over" : "Category Blitz"}
</p>
```

**Required Change:**
When `session?.sessionType === 'continuous'`, show "∞ Continuous" indicator.

Options:
1. Replace "Game Over" with "∞ Continuous" when in complete phase
2. Add badge alongside existing text
3. Show in all phases for continuous mode

**Recommended Implementation:**
```tsx
// Around line 1187-1189
const isContinuous = session?.sessionType === 'continuous';

<p className={`text-[0.7rem] font-black uppercase tracking-[0.16em] ${TEXT_ACCENT}`}>
  {isContinuous 
    ? (phase === "complete" ? "∞ Continuous" : "∞ Continuous")
    : (phase === "lobby" ? "Lobby" : phase === "answering" ? "Round Active" : phase === "scoring" ? "Scoring" : phase === "reveal" ? "Revealing" : phase === "results" ? "Results" : phase === "complete" ? "Game Over" : "Category Blitz")
  }
</p>
```

Or add a separate badge:
```tsx
{isContinuous && (
  <span className="ml-2 px-1.5 py-0.5 bg-ht-cyan-500/20 text-ht-cyan-300 text-[0.6rem] rounded">
    ∞ Continuous
  </span>
)}
```

#### Task 2: Modify CompleteScreen for Continuous Mode

**Location:** Lines 405-600 (CompleteScreen component)

**Current Behavior:**
- Shows "Game Over" with final standings
- Shows `NextGameStatus` component with countdown to next scheduled window
- If no schedule, shows "No further games are scheduled"

**Required Behavior for Continuous:**
- Still show final standings (points accumulate over "session")
- Show intermission countdown instead of "Next Game"
- Change messaging from "Game Over" to "Round Complete" or similar
- Auto-transition to next round after intermission

**Current Code (lines 476-485):**
```tsx
<div className="min-w-0 flex-1">
  <p className={TEXT_LABEL}>{viewerRank === 0 ? "Game Over · Champion" : "Game Over"}</p>
  <p className="truncate text-lg font-black leading-tight text-white">{viewerEntry?.username ?? "You"}</p>
</div>
```

**Change for Continuous:**
```tsx
const isContinuous = session?.sessionType === 'continuous';
// ...
<p className={TEXT_LABEL}>
  {isContinuous 
    ? (viewerRank === 0 ? "Round Complete · Champion" : "Round Complete")
    : (viewerRank === 0 ? "Game Over · Champion" : "Game Over")
  }
</p>
```

**Current Code (lines 440-443, empty standings fallback):**
```tsx
<div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
  <p className={TEXT_LABEL}>Game over</p>
  <p className="mt-3 text-xl font-black text-white">The session has ended.</p>
  <p className="mt-2 text-sm text-slate-400">Thanks for playing!</p>
</div>
<NextGameStatus info={nextWindowInfo} />
```

**Change for Continuous:**
For continuous mode with no standings (rare, but possible), show intermission countdown instead of "Next Game".

**NextGameStatus Component (lines 377-403):**

This component shows countdown to next scheduled window. For continuous mode, we need similar component showing intermission countdown.

Options:
1. Modify `NextGameStatus` to accept `intermissionSeconds` prop
2. Create new `IntermissionCountdown` component
3. Use existing `IntermissionStatus` component if suitable

**Recommended:** Check if `IntermissionStatus` (imported at line 23) can be reused. If not, create simple countdown:

```tsx
function ContinuousIntermission({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(r => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  
  return (
    <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-4 text-center`}>
      <p className={TEXT_LABEL}>Next Round</p>
      <p className="mt-1 font-black tabular-nums text-ht-cyan-300 text-2xl leading-none">
        {formatMmSs(remaining)}
      </p>
    </div>
  );
}
```

#### Task 3: Auto-Dismiss Complete Screen for Continuous Mode

**Location:** Lines 1305-1310 (useEffect for dismissComplete)

**Current Code:**
```tsx
const hasCompleteStandings = phase === "complete" && !!results && results.totals.length > 0;
useEffect(() => {
  if (phase !== "complete" || hasCompleteStandings) return;
  const t = window.setTimeout(() => { dismissComplete(); }, 3000);
  return () => window.clearTimeout(t);
}, [phase, hasCompleteStandings, dismissComplete]);
```

This auto-dismisses only when there are NO standings (empty session). For continuous mode, we want to auto-dismiss after intermission.

**Required Change:**
```tsx
const isContinuous = session?.sessionType === 'continuous';
const hasCompleteStandings = phase === "complete" && !!results && results.totals.length > 0;

useEffect(() => {
  if (phase !== "complete") return;
  
  // For continuous mode, auto-dismiss after intermission to transition to next round
  if (isContinuous) {
    // Use intermission from config, default to 300s if unavailable
    const intermissionMs = (session?.intermissionSeconds ?? 300) * 1000;
    const t = window.setTimeout(() => { dismissComplete(); }, intermissionMs);
    return () => window.clearTimeout(t);
  }
  
  // For scheduled mode, keep existing behavior (only dismiss if no standings)
  if (hasCompleteStandings) return;
  const t = window.setTimeout(() => { dismissComplete(); }, 3000);
  return () => window.clearTimeout(t);
}, [phase, hasCompleteStandings, dismissComplete, isContinuous, session?.intermissionSeconds]);
```

**Wait - Problem!** The `session` object from `useCategoryBlitzSession` doesn't have `intermissionSeconds`. We need to either:
1. Add it to the session object (requires backend change)
2. Fetch config separately in the component
3. Use a reasonable default (300s)

**Recommendation for Phase 5:** Use default 300s for now. Add a TODO comment to fetch actual config later.

#### Task 4: Handle Lobby Differently (Optional Enhancement)

**Location:** Lines 181-298 (LobbyScreen component)

In continuous mode, there is no lobby dwell. The session goes straight to "active" status and rounds start immediately. However, players might still see "lobby" phase briefly if they join between rounds.

**Question:** Should we skip the LobbyScreen entirely for continuous mode?

**Analysis:**
- Current flow: Lobby → Answering → Scoring → Reveal → Results → (intermission) → Next Round
- Continuous flow: (No Lobby) → Answering → Scoring → Reveal → Results → (intermission) → Next Round
- But players joining mid-intermission might see "lobby" state

**Recommendation:** Keep LobbyScreen for now but modify messaging when in continuous mode. The backend (`createContinuousSession`) already skips lobby by setting `status: 'active'`, so this is mostly theoretical.

If you want to be thorough:
```tsx
// In LobbyScreen, around line 244
{phase === "lobby" && isContinuous ? (
  <div className="...">
    <p>Next round starting soon...</p>
  </div>
) : phase === "lobby" ? (
  // existing lobby UI
) : null}
```

### Data Flow for Continuous Mode

```
Player opens game
  ↓
API: GET /api/category-blitz/sessions?venueId=xxx
  ↓
If no continuous session AND continuous config is active:
  driveContinuousCategoryBlitz() creates session
  ↓
Session returns with sessionType: 'continuous'
  ↓
Game component detects isContinuous = true
  ↓
CompleteScreen shows "Round Complete" instead of "Game Over"
  ↓
Intermission countdown shown (from nextRoundStartsIn)
  ↓
Auto-dismiss after intermission
  ↓
Poll/Realtime picks up new round
  ↓
Player continues to next round (infinite loop)
```

### Critical Implementation Notes

1. **DO NOT break scheduled mode**
   - All changes must be behind `isContinuous` checks
   - Scheduled mode should work exactly as before
   - Test both modes thoroughly

2. **Timing considerations**
   - `nextRoundStartsIn` from `useCategoryBlitzSession` is the authoritative countdown
   - Use this for intermission countdown, not a separate timer
   - The backend `driveContinuousCategoryBlitz` handles the actual timing

3. **Animation sequencing**
   - Do NOT interrupt RoundStartReveal, GradingCascade, or SessionCompleteFireworks
   - Auto-dismiss should only happen AFTER animations complete
   - Current animation timing is handled by `markRevealDone` and `markResultsRevealDone`

4. **Session boundaries**
   - In continuous mode, the "session" never truly ends
   - Points accumulate across rounds within the same session
   - Game Over / Complete screen is really "Round Complete"

### Testing Checklist for Phase 5

#### Continuous Mode Tests
- [ ] Enable continuous mode for venue
- [ ] Start game - should go straight to answering (no lobby)
- [ ] Play through round
- [ ] See "Round Complete" instead of "Game Over"
- [ ] See intermission countdown
- [ ] Auto-transition to next round after intermission
- [ ] Points accumulate across rounds
- [ ] "∞ Continuous" badge visible in header

#### Scheduled Mode Regression Tests
- [ ] Scheduled mode still shows "Lobby"
- [ ] Scheduled mode shows "Game Over"
- [ ] Scheduled mode shows next scheduled window countdown
- [ ] No "∞ Continuous" badge
- [ ] Sessions end properly and wait for next schedule

#### Edge Cases
- [ ] Join mid-round as spectator
- [ ] Join during intermission
- [ ] Network disconnect/reconnect
- [ ] Admin ends continuous session manually
- [ ] Switch venue from continuous to scheduled

### Files to Modify in Phase 5

**Primary:**
- `components/category-blitz/CategoryBlitzGame.tsx` (estimated 50-100 lines changed)

**Optional:**
- `lib/categoryBlitzRealtime.ts` (if hook needs to expose `sessionType` differently)

### Recommended Implementation Order

1. **Add continuous indicator** (30 min)
   - Add `isContinuous` check
   - Show badge in header

2. **Modify CompleteScreen text** (30 min)
   - Change "Game Over" to "Round Complete" when continuous
   - Update champion text too

3. **Add intermission countdown** (60 min)
   - Create or reuse countdown component
   - Show instead of NextGameStatus when continuous

4. **Add auto-dismiss** (30 min)
   - Modify useEffect
   - Use intermission timing

5. **Testing & refinement** (60 min)
   - Test continuous mode
   - Test scheduled mode (regression)
   - Fix any issues

**Total: ~3.5 hours**

---

## Questions for Phase 5 Implementer

1. Should the "∞ Continuous" badge show in ALL phases or only specific ones?
2. Should we show a different color/theme for continuous mode?
3. Should players be able to see their "session total" points vs "round points"?
4. What happens when an admin manually ends a continuous session - should there be special messaging?

---

## Appendix: Broadcast Events

The following events are broadcast on the channel `category-blitz-session:${venueId}`:

| Event | Payload | Trigger |
|-------|---------|---------|
| `round_started` | `{ round: { id, letter, categories, startedAt, endsAt, mode } }` | New round starts |
| `round_scored` | `{ roundId, totals }` | Round completes scoring |
| `session_ended` | `{ sessionId }` | Scheduled session ends |
| `session_abandoned` | `{ sessionId }` | Admin deletes schedule mid-game |
| `schedule_updated` | `{ scheduleId }` | Admin modifies schedule |
| `continuous_session_created` | `{ sessionId }` | NEW - Continuous session created |
| `continuous_session_ended` | `{ sessionId }` | NEW - Continuous session ended |
| `pool_updated` | `{ action: 'added' \| 'removed', categories: string[] }` | NEW - Pool modified |

---

## Contact

For questions about this handoff:
- Review the code in the created files
- Check TypeScript compilation: `npx tsc --noEmit --project tsconfig.json`
- Refer to the detailed comments in the source code

**Good luck with Phase 5!**
