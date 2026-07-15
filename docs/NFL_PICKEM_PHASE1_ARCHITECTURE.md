# Phase 1: Architecture & Requirements

## 1.1 Existing Codebase Analysis

### 1.1.1 Pick 'Em Core Infrastructure

**File**: [`lib/pickem.ts`](lib/pickem.ts:1)

The existing Pick 'Em system is well-architected and battle-tested. Key characteristics:

```typescript
// Line 1-10: Core type definitions
export type PickEmSportSlug = "nba" | "mlb" | "nhl" | "soccer" | "nfl" | "mma" | "tennis";
type PickEmPickStatus = "pending" | "won" | "lost" | "push" | "canceled";
type PickEmGameStatus = "scheduled" | "live" | "final";
```

**Important**: NFL is already defined as a sport slug (line 7), but marked as not clickable:
```typescript
// Line 299-305 in lib/pickem.ts
{
  slug: "nfl",
  label: "NFL",
  subtitle: "National Football League",
  isInSeason: false,    // ← Currently disabled
  isClickable: false,   // ← Users can't select it
  sportKeys: ["americanfootball_nfl"],
},
```

**Code Review Insight**: The existing NFL support fetches games daily (lines 1725-1785), but doesn't support the weekly model we need. The week calculation logic exists but is incomplete.

### 1.1.2 Database Schema Deep Dive

**File**: [`supabase/migrations/20260427113000_add_pickem_tables.sql`](supabase/migrations/20260427113000_add_pickem_tables.sql:1)

Existing `pickem_picks` table structure:

```sql
-- Lines 1-24
CREATE TABLE IF NOT EXISTS pickem_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id text NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  sport_slug text NOT NULL CHECK (sport_slug IN ('nba', 'mlb', 'nhl', 'soccer', 'nfl', 'mma', 'tennis')),
  sport_key text NOT NULL,
  league text NOT NULL,
  game_id text NOT NULL,
  home_team_id text,
  away_team_id text,
  selected_team_id text,
  winning_team_id text,
  game_label text NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  starts_at timestamptz NOT NULL,
  selected_team text NOT NULL,
  selected_side text NOT NULL CHECK (selected_side IN ('home', 'away')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'push', 'canceled')),
  home_score integer,
  away_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  reward_points integer NOT NULL DEFAULT 10,
  reward_claimed_at timestamptz
);
```

**Analysis**: This schema is PERFECT for NFL Pick 'Em. We don't need to modify it. The `sport_slug = 'nfl'` constraint already exists.

### 1.1.3 Frontend Component Analysis

**File**: [`components/pickem/PickEmGameList.tsx`](components/pickem/PickEmGameList.tsx:1)

Key patterns to replicate:

1. **State Management** (lines 206-256):
```typescript
const [games, setGames] = useState<PickEmGame[]>([]);
const [selectedDate, setSelectedDate] = useState(todayDateKey);
const [nflWeekStartDate, setNflWeekStartDate] = useState("");
```

**Code Review Insight**: The component already has `nflWeekStartDate` state (line 208), but it's not fully implemented. This shows the NFL weekly model was partially planned.

2. **Optimistic Updates** (lines 668-759):
```typescript
const submitPick = useCallback(async (game: PickEmGame, pickTeam: string) => {
  // Optimistic UI update
  setGames((current) =>
    current.map((row) =>
      row.id === game.id
        ? { ...row, userPickTeam: isDeselect ? undefined : pickTeam, userPickStatus: "pending" }
        : row
    )
  );
  // ... API call
}, []);
```

3. **Loading States** (lines 351-447):
```typescript
const loadGames = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
  // Implements background refresh for live games
}, []);
```

### 1.1.4 API Route Patterns

**File**: [`app/api/pickem/games/route.ts`](app/api/pickem/games/route.ts:1)

Current implementation handles date-based queries:

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sportSlug = searchParams.get("sportSlug");
  const date = searchParams.get("date");
  const weekStartDate = searchParams.get("weekStartDate"); // Already supports week param!
  
  const result = await listPickEmGames({
    sportSlug: sportSlug!,
    date: date || undefined,
    weekStartDate: weekStartDate || undefined, // Passes through to lib
    // ...
  });
}
```

**Key Finding**: The API already accepts `weekStartDate` parameter! This means we can build on existing infrastructure.

### 1.1.5 BallDontLie Integration

**File**: [`lib/pickem.ts`](lib/pickem.ts:177-245)

API configuration:
```typescript
// Line 219-229
const BDL_PATH_BY_SPORT_KEY: Record<string, { path: string; league: string }> = {
  americanfootball_nfl: { path: "/nfl/v1/games", league: "NFL" },
  nfl: { path: "/nfl/v1/games", league: "NFL" },
  // ... other sports
};

// Line 177-178
const BALLDONTLIE_API_BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY?.trim() ?? "";
```

**API Endpoint Reference**: From [`BDL-API docs/NFL API .html`](BDL-API%20docs/NFL%20API%20.html:1316):

```
GET https://api.balldontlie.io/nfl/v1/games
Query Parameters:
  - dates[]: YYYY-MM-DD format (can pass multiple)
  - seasons[]: Season year (e.g., 2024)
  - weeks[]: Week number (1-18)
  - per_page: Max 100
```

## 1.2 Requirements Specification

### 1.2.1 Functional Requirements

| ID | Requirement | Priority | Existing Support |
|----|-------------|----------|------------------|
| FR-1 | Display all NFL games for a week | P0 | Partial - needs weekly grouping |
| FR-2 | Navigate between weeks | P0 | No - new feature |
| FR-3 | Show current week by default | P0 | No - new feature |
| FR-4 | Show previous weeks with results | P0 | Partial - daily only |
| FR-5 | Lock picks at Thursday kickoff | P0 | No - new feature |
| FR-6 | Allow pick changes before lock | P0 | Yes - existing |
| FR-7 | Auto-save picks | P0 | Yes - existing |
| FR-8 | Display lock countdown | P1 | No - new feature |
| FR-9 | Show final scores for completed games | P0 | Yes - existing |
| FR-10 | Award 10 points per correct pick | P0 | Yes - existing |
| FR-11 | Track weekly user statistics | P1 | No - new table needed |

### 1.2.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | API response time | < 500ms |
| NFR-2 | Page load time | < 2 seconds |
| NFR-3 | Pick submission | < 1 second |
| NFR-4 | Availability | 99.9% during NFL season |
| NFR-5 | Mobile responsiveness | Full support |
| NFR-6 | Browser support | Last 2 versions |

### 1.2.3 Constraints

1. **Must use existing `pickem_picks` table** - Don't create new pick table
2. **Must follow existing auth patterns** - Supabase RLS policies
3. **Must reuse existing settlement logic** - `settlePendingPickEmPicks()`
4. **Must work with balldontlie API limits** - 5 req/min free tier
5. **Must handle NFL bye weeks** - Not all weeks have Thursday games

## 1.3 Architecture Decisions

### Decision 1: Extend vs. Separate

**Option A: Extend Existing Pick 'Em** (SELECTED)
- Use existing `pickem_picks` table with `sport_slug = 'nfl'`
- Create new `nfl_pickem_weeks` metadata table
- Build new frontend components
- Reuse settlement and grading logic

**Option B: Completely Separate Game**
- New table `nfl_pickem_picks`
- Separate settlement logic
- Independent from existing Pick 'Em

**Rationale for Option A**:
- 80% of code is reusable
- Consistent user experience
- Single source of truth for picks
- Less maintenance overhead

### Decision 2: Week Data Storage

**Where to store week information?**

Option A: Database table `nfl_pickem_weeks` (SELECTED)
- Persistent, queryable
- Can store lock times
- Supports multiple seasons

Option B: Calculate on-the-fly
- No migrations needed
- Always up-to-date
- Harder to customize lock times

**Rationale**: Need persistent storage for lock times and week status tracking.

### Decision 3: Lock Time Determination

**How to determine when picks lock?**

Algorithm:
1. Query balldontlie for Thursday games in the week
2. Find earliest kickoff time
3. If no Thursday game, find first game of week
4. Store lock time in `nfl_pickem_weeks.thursday_kickoff`

**Edge Cases**:
- Thanksgiving: Multiple Thursday games
- Bye weeks: No Thursday game
- International games: Different time zones
- Weather delays: Game time changes

### Decision 4: Frontend Architecture

**URL Structure**:
```
/nfl-pickem                    → Current week
/nfl-pickem?week=2024-w07      → Specific week
```

**State Management**:
- URL parameter for selected week
- Local state for UI (optimistic updates)
- Server state cached with SWR/React Query pattern

**Component Hierarchy**:
```
NFLPickEmPage
├── NFLPickEmGameList
│   ├── WeekSelector
│   ├── LockCountdown
│   ├── NFLGameCard (×N)
│   └── PointsSummary
```

## 1.4 Technical Stack

### Backend
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Next.js App Router | Consistent with existing |
| Database | Supabase PostgreSQL | Existing infrastructure |
| ORM | Supabase Client | Already used in lib/pickem.ts |
| API | REST (Next.js Route Handlers) | Consistent with /api/pickem/ |
| Cron | Vercel Cron | Already used for pickem-settle |

### Frontend
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | React 18 | Existing |
| Styling | Tailwind CSS | Existing |
| Animation | Framer Motion | Already used in PickEmGameList |
| Icons | Lucide React | Existing |
| State | React useState/useCallback | Simple enough for this use case |

### External APIs
| Service | Endpoint | Usage |
|---------|----------|-------|
| balldontlie | `/nfl/v1/games` | Game schedule and scores |
| balldontlie | `/nfl/v1/teams` | Team information (if needed) |

## 1.5 Integration Points

### 1.5.1 With Existing Pick 'Em

**Shared Resources**:
- `pickem_picks` table (same schema)
- `settlePendingPickEmPicks()` function
- Points calculation logic
- RLS policies pattern

**Differences**:
- Weekly vs daily date range
- Week selector vs date picker
- Lock deadline vs game start time

### 1.5.2 With Venue Hub

Add to [`lib/venueGameCards.ts`](lib/venueGameCards.ts:19):

```typescript
{
  key: "nfl-pickem",
  title: "NFL Pick 'Em",
  path: "/nfl-pickem",
  cardClassName: "bg-emerald-700 text-white",
  visibleOnVenueHome: true,
  rules: [
    "-Pick winners for all NFL games each week",
    "-Picks lock at Thursday Night Football kickoff",
    "-10 points per correct pick",
    "-View past weeks to see your results",
  ],
  steps: [
    {
      stepLabel: "Weekly Picks",
      heading: "Pick every game, every week.",
      body: "Navigate through the NFL season week by week. Pick winners for all games before Thursday Night kickoff.",
    },
    {
      stepLabel: "Lock Time",
      heading: "Thursday Night is the deadline.",
      body: "All picks lock when the first Thursday Night Football game kicks off. No changes after that!",
    },
    {
      stepLabel: "Track Results",
      heading: "See how you did.",
      body: "View previous weeks to check your picks and see the final scores. Build your season record!",
    },
  ],
}
```

Also update `VENUE_HOME_GAME_KEYS` (line 223):
```typescript
export const VENUE_HOME_GAME_KEYS: VenueGameKey[] = [
  "speed-trivia", 
  "category-blitz", 
  "live_trivia", 
  "bingo", 
  "fantasy", 
  "pickem",
  "nfl-pickem"  // ← Add this
];
```

And update `inferVenueGameKeyFromPath` (line 225):
```typescript
export function inferVenueGameKeyFromPath(pathname: string): VenueGameKey | null {
  if (pathname.startsWith("/trivia/live")) return "live_trivia";
  if (pathname.startsWith("/trivia")) return "speed-trivia";
  if (pathname.startsWith("/pickem")) return "pickem";
  if (pathname.startsWith("/nfl-pickem")) return "nfl-pickem";  // ← Add this
  // ... rest
}
```

### 1.5.3 With Analytics

Add to existing analytics events:
- `nfl_pickem_pick_submitted`
- `nfl_pickem_week_viewed`
- `nfl_pickem_lock_reached`

## 1.6 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER                                        │
└──────────────┬──────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BROWSER                                          │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │  NFLPickEmGameList  │◄───│   WeekSelector      │                     │
│  │  - Week state       │    │   - Week navigation │                     │
│  │  - Game cards       │    └─────────────────────┘                     │
│  │  - Pick submission  │                                             │
│  └──────────┬──────────┘                                             │
└─────────────┼──────────────────────────────────────────────────────────┘
              │
              │ HTTP Requests
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         NEXT.JS API                                      │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │ /api/nfl-pickem/    │    │ /api/nfl-pickem/    │                     │
│  │     weeks           │    │     games           │                     │
│  │ - List weeks        │    │ - Get week games    │                     │
│  │ - Current week      │    │ - User picks        │                     │
│  └──────────┬──────────┘    └──────────┬──────────┘                     │
│             │                          │                                │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │ /api/nfl-pickem/    │    │ /api/cron/          │                     │
│  │     picks           │    │   nfl-week-sync     │                     │
│  │ - Submit pick       │    │ - Sync from BDL     │                     │
│  │ - Clear pick        │    │ - Update weeks      │                     │
│  └──────────┬──────────┘    └──────────┬──────────┘                     │
└─────────────┼──────────────────────────┼────────────────────────────────┘
              │                          │
              ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         LIBRARY LAYER                                    │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │  lib/nflPickEm.ts   │    │ lib/pickem.ts       │                     │
│  │  - Week logic       │    │ - Pick CRUD         │                     │
│  │  - Lock times       │    │ - Settlement        │                     │
│  │  - BDL integration  │    │ - Shared types      │                     │
│  └──────────┬──────────┘    └──────────┬──────────┘                     │
└─────────────┼──────────────────────────┼────────────────────────────────┘
              │                          │
              ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                                   │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │  balldontlie API    │    │   Supabase          │                     │
│  │  - /nfl/v1/games    │    │   - pickem_picks    │                     │
│  │  - Schedule         │    │   - nfl_pickem_weeks│ ← New table        │
│  │  - Scores           │    │   - User data       │                     │
│  └─────────────────────┘    └─────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1.7 File Structure

```
lib/
├── pickem.ts                    # Existing - keep unchanged
├── nflPickEm.ts                 # NEW - NFL-specific logic
├── nflWeekUtils.ts              # NEW - Week calculation utilities
└── venueGameCards.ts            # MODIFY - Add nfl-pickem card

app/
├── api/
│   ├── pickem/                  # Existing
│   │   ├── games/route.ts
│   │   ├── picks/route.ts
│   │   └── sports/route.ts
│   ├── nfl-pickem/              # NEW
│   │   ├── weeks/route.ts       # List weeks
│   │   ├── games/route.ts       # Get week games
│   │   └── picks/route.ts       # Submit picks
│   └── cron/
│       ├── pickem-settle/route.ts   # Existing
│       └── nfl-week-sync/route.ts   # NEW - Weekly sync
├── nfl-pickem/                  # NEW
│   ├── page.tsx                 # Main page
│   ├── layout.tsx               # Layout wrapper
│   └── loading.tsx              # Loading state
└── pickem/                      # Existing
    ├── page.tsx
    └── [sportSlug]/
        └── page.tsx

components/
├── pickem/                      # Existing
│   ├── PickEmGameList.tsx
│   ├── PickEmRecentPicks.tsx
│   └── PointsBank.tsx
└── nfl-pickem/                  # NEW
    ├── NFLPickEmGameList.tsx    # Main component
    ├── WeekSelector.tsx         # Week navigation
    ├── LockCountdown.tsx        # Countdown timer
    ├── NFLGameCard.tsx          # Individual game
    └── WeeklySummary.tsx        # Stats display

supabase/migrations/
├── 20260427113000_add_pickem_tables.sql         # Existing
├── 20260715000000_add_nfl_pickem_weeks.sql      # NEW
└── 20260715000100_add_nfl_pickem_user_weeks.sql # NEW

tests/
├── lib.pickem.test.ts           # Existing
├── lib.nfl-pickem.test.ts       # NEW - Week logic tests
└── api.nfl-pickem.test.ts       # NEW - API tests
```

## 1.8 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| balldontlie API rate limits | Medium | High | Cache responses, implement backoff |
| NFL schedule changes | Low | Medium | Sync job runs frequently |
| Lock time calculation error | Medium | Critical | Test with real schedule data |
| User confusion on lock deadline | Medium | Medium | Prominent countdown, clear messaging |
| Performance at scale | Low | Medium | Add indexes, paginate if needed |
| Bye week edge cases | Medium | Medium | Handle missing Thursday games |

## 1.9 Success Criteria

### Phase 1 Complete When:
- [ ] All existing code reviewed and documented
- [ ] Architecture decisions documented with rationale
- [ ] Integration points identified
- [ ] File structure planned
- [ ] Risk assessment complete

### Overall Project Success Metrics:
- [ ] 100% of NFL weeks sync correctly (18 weeks)
- [ ] Lock time accurate to within 1 minute
- [ ] API response time < 500ms (p95)
- [ ] Zero pick data loss
- [ ] Users can view past 4 weeks of results
- [ ] Auto-grading completes within 5 min of game end

---

**Next**: Proceed to [Phase 2: Database Schema](docs/NFL_PICKEM_PHASE2_DATABASE.md)
