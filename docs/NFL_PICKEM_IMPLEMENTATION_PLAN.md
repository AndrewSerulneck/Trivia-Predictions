# NFL Pick 'Em Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to build and deploy a dedicated NFL Pick 'Em game mode for Hightop Challenge. Unlike the general Pick 'Em game that supports multiple sports, NFL Pick 'Em is structured around the NFL season calendar (Thursday-Sunday/Monday), with weekly pick entry deadlines and results tracking.

---

## Phase 1: Requirements Analysis & Architecture Design

### 1.1 Requirements Breakdown

#### Core Functionality
| Feature | Description | Priority |
|---------|-------------|----------|
| Weekly Game Display | Show all NFL games for a specific week (Thursday-Monday) | P0 |
| Week Navigation | Allow users to toggle between previous weeks, current week | P0 |
| Pick Submission | Click team to select winner; auto-save with change ability | P0 |
| Lock Mechanism | Picks lock at Thursday night kickoff time | P0 |
| Results Display | Show completed game results for past weeks | P0 |
| Scoring System | Award points for correct picks | P0 |
| API Integration | Fetch data from balldontlie NFL API & THE ODDS API | P0 |

#### Technical Requirements
- **Data Source**: balldontlie NFL API (`/nfl/v1/games` endpoint)
- **Lock Time**: First Thursday Night Football kickoff each week
- **Week Definition**: Thursday 00:00 UTC through Monday 23:59 UTC
- **Pick Limit**: All games for the week (typically 13-16 games)
- **Points per Correct Pick**: 10 points (consistent with existing Pick 'Em)

#### User Experience Flow
1. User navigates to NFL Pick 'Em from venue hub
2. System displays current week by default
3. User can toggle to previous weeks to see results
4. For current/future weeks: click team to make picks
5. Picks auto-save; can be changed until Thursday lock
6. After games complete, show results and award points

### 1.2 Architecture Decisions

#### Option A: Extend Existing Pick 'Em (Recommended)
Leverage the existing [`lib/pickem.ts`](lib/pickem.ts:1) infrastructure but create a dedicated NFL mode.

**Pros:**
- Reuses battle-tested pick submission logic
- Consistent UI patterns with existing Pick 'Em
- Shared database schema (`pickem_picks` table)
- Faster development timeline

**Cons:**
- Need to handle week-based vs day-based date ranges
- NFL-specific logic mixed with general pickem code

#### Option B: Separate Game Module
Create entirely new game type `nfl-pickem` in venue cards.

**Pros:**
- Clean separation of concerns
- NFL-specific optimizations
- Can evolve independently

**Cons:**
- Code duplication
- More maintenance overhead
- Longer development time

**Decision**: Proceed with Option A, extending existing Pick 'Em with NFL-specific configuration.

### 1.3 Key Technical Considerations

#### NFL Week Calculation
```typescript
// Week starts on Thursday, ends on Monday
function getNFLWeekRange(weekStartDate: string): { from: Date; to: Date } {
  const start = new Date(weekStartDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 5); // Thursday -> Tuesday (exclusive)
  return { from: start, to: end };
}
```

#### Lock Time Determination
- Query balldontlie API for Thursday games
- Find earliest kickoff time on Thursday
- All picks lock at that time
- If no Thursday game (bye weeks), lock at first game of week

---

## Phase 2: Database Schema & Data Model

### 2.1 Existing Schema Analysis

The current [`pickem_picks`](supabase/migrations/20260427113000_add_pickem_tables.sql:1) table:
```sql
CREATE TABLE pickem_picks (
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

### 2.2 Required Schema Changes

#### Migration 1: Add NFL Week Tracking Table
```sql
-- supabase/migrations/20260715000000_add_nfl_pickem_weeks.sql

CREATE TABLE IF NOT EXISTS nfl_pickem_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  week_number integer NOT NULL,
  week_start_date date NOT NULL, -- Thursday
  week_end_date date NOT NULL,   -- Monday
  thursday_kickoff timestamptz,  -- Lock time for picks
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'open', 'locked', 'complete')),
  games_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season, week_number)
);

CREATE INDEX idx_nfl_pickem_weeks_season ON nfl_pickem_weeks(season);
CREATE INDEX idx_nfl_pickem_weeks_status ON nfl_pickem_weeks(status);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS nfl_pickem_weeks_set_updated_at ON nfl_pickem_weeks;
CREATE TRIGGER nfl_pickem_weeks_set_updated_at
BEFORE UPDATE ON nfl_pickem_weeks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

#### Migration 2: Add NFL-Specific Pick Tracking
```sql
-- supabase/migrations/20260715000100_add_nfl_pickem_user_weeks.sql

CREATE TABLE IF NOT EXISTS nfl_pickem_user_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id text NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  nfl_week_id uuid NOT NULL REFERENCES nfl_pickem_weeks(id) ON DELETE CASCADE,
  picks_count integer NOT NULL DEFAULT 0,
  correct_picks integer NOT NULL DEFAULT 0,
  total_points integer NOT NULL DEFAULT 0,
  pick_submitted_at timestamptz, -- When all picks were finalized
  is_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id, nfl_week_id)
);

CREATE INDEX idx_nfl_pickem_user_weeks_user ON nfl_pickem_user_weeks(user_id);
CREATE INDEX idx_nfl_pickem_user_weeks_week ON nfl_pickem_user_weeks(nfl_week_id);
CREATE INDEX idx_nfl_pickem_user_weeks_complete ON nfl_pickem_user_weeks(is_complete) WHERE is_complete = false;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS nfl_pickem_user_weeks_set_updated_at ON nfl_pickem_user_weeks;
CREATE TRIGGER nfl_pickem_user_weeks_set_updated_at
BEFORE UPDATE ON nfl_pickem_user_weeks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS Policies
ALTER TABLE nfl_pickem_user_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own nfl pickem weeks" ON nfl_pickem_user_weeks;
CREATE POLICY "Users can read own nfl pickem weeks"
  ON nfl_pickem_user_weeks FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
```

### 2.3 Data Flow Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  balldontlie    │────▶│  NFL Week Sync   │────▶│ nfl_pickem_weeks│
│    NFL API      │     │    (Cron Job)    │     │    (Metadata)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                            │
                                                            ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  pickem_picks   │◄────│  Pick Submission │◄────│   User Makes    │
│  (NFL Records)  │     │     Handler      │     │     Picks       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│   Auto-Grading  │────▶│  Points Awarded  │
│   (Post-Game)   │     │  to User Account │
└─────────────────┘     └──────────────────┘
```

---

## Phase 3: Backend API Development

### 3.1 New Library Module: `lib/nflPickEm.ts`

Create a new library file for NFL-specific Pick 'Em logic:

```typescript
// lib/nflPickEm.ts
import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBallDontLieList } from "@/lib/balldontlie";
import type { PickEmPick, PickEmGame } from "@/lib/pickem";

export type NFLWeek = {
  id: string;
  season: number;
  weekNumber: number;
  weekStartDate: string; // YYYY-MM-DD (Thursday)
  weekEndDate: string;   // YYYY-MM-DD (Monday)
  thursdayKickoff: string | null;
  status: "upcoming" | "open" | "locked" | "complete";
  gamesCount: number;
};

export type NFLPickEmGame = PickEmGame & {
  nflWeekId: string;
  weekNumber: number;
  isThursdayGame: boolean;
};

export type NFLUserWeekSummary = {
  weekId: string;
  weekNumber: number;
  weekStartDate: string;
  status: string;
  picksCount: number;
  correctPicks: number;
  totalPoints: number;
  isComplete: boolean;
};

// Constants
const NFL_SEASON_START_MONTH = 8; // September (0-indexed: August = 8)
const NFL_PICKEM_SPORT_KEY = "americanfootball_nfl";
const NFL_PICKEM_LEAGUE = "NFL";
```

### 3.2 Core Functions

#### Week Discovery & Management
```typescript
/**
 * Sync NFL weeks from balldontlie API
 * Should be run weekly via cron job or on-demand
 */
export async function syncNFLWeeks(season: number): Promise<NFLWeek[]> {
  // Fetch all games for the season
  const games = await fetchBallDontLieList<NFLEvent>("/nfl/v1/games", 
    new URLSearchParams({ seasons: String(season), per_page: "100" }), 3);
  
  // Group games by week (Thursday-Wednesday)
  const weekMap = new Map<number, NFLEvent[]>();
  
  for (const game of games) {
    const gameDate = new Date(game.date);
    const weekStart = getThursdayOfWeek(gameDate);
    const weekNumber = calculateNFLWeekNumber(weekStart, season);
    
    if (!weekMap.has(weekNumber)) {
      weekMap.set(weekNumber, []);
    }
    weekMap.get(weekNumber)!.push(game);
  }
  
  // Upsert weeks to database
  const weeks: NFLWeek[] = [];
  for (const [weekNum, weekGames] of weekMap) {
    const weekStart = getThursdayOfWeek(new Date(weekGames[0].date));
    const thursdayGames = weekGames.filter(g => {
      const d = new Date(g.date);
      return d.getUTCDay() === 4; // Thursday
    });
    
    const earliestThursday = thursdayGames.length > 0 
      ? thursdayGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
      : null;
    
    const week = await upsertNFLWeek({
      season,
      weekNumber: weekNum,
      weekStartDate: weekStart.toISOString().slice(0, 10),
      weekEndDate: new Date(weekStart.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      thursdayKickoff: earliestThursday?.date || null,
      gamesCount: weekGames.length,
    });
    
    weeks.push(week);
  }
  
  return weeks;
}

/**
 * Get the current NFL week based on today's date
 */
export function getCurrentNFLWeek(weeks: NFLWeek[]): NFLWeek | null {
  const now = new Date();
  return weeks.find(w => {
    const start = new Date(w.weekStartDate);
    const end = new Date(w.weekEndDate);
    return now >= start && now <= end;
  }) || null;
}

/**
 * Check if picks are locked for a given week
 */
export function isNFLWeekLocked(week: NFLWeek): boolean {
  if (!week.thursdayKickoff) return false;
  return Date.now() >= new Date(week.thursdayKickoff).getTime();
}
```

#### Game Fetching
```typescript
/**
 * Fetch all NFL games for a specific week
 */
export async function listNFLPickEmGames(params: {
  weekId: string;
  userId?: string;
  venueId?: string;
}): Promise<{
  week: NFLWeek;
  games: NFLPickEmGame[];
  userSummary?: NFLUserWeekSummary;
}> {
  const week = await getNFLWeekById(params.weekId);
  if (!week) throw new Error("NFL Week not found");
  
  // Fetch games from balldontlie
  const fromIso = new Date(week.weekStartDate).toISOString();
  const toIso = new Date(new Date(week.weekEndDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
  
  const events = await fetchBallDontLieEventsForSportKey(
    NFL_PICKEM_SPORT_KEY,
    fromIso,
    toIso,
    NFL_PICKEM_LEAGUE
  );
  
  // Transform to PickEmGame format
  const games: NFLPickEmGame[] = events.map(event => ({
    id: event.id,
    sportSlug: "nfl" as const,
    sportKey: NFL_PICKEM_SPORT_KEY,
    league: NFL_PICKEM_LEAGUE,
    homeTeamId: event.homeTeamId,
    awayTeamId: event.awayTeamId,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    startsAt: event.startsAt,
    isLocked: isNFLWeekLocked(week) || Date.now() >= new Date(event.startsAt).getTime(),
    status: event.isCompleted ? "final" : 
            Date.now() >= new Date(event.startsAt).getTime() ? "live" : "scheduled",
    homeScore: event.homeScore,
    awayScore: event.awayScore,
    winnerTeam: event.winnerTeam,
    periodLabel: null,
    nflWeekId: week.id,
    weekNumber: week.weekNumber,
    isThursdayGame: new Date(event.startsAt).getUTCDay() === 4,
  }));
  
  // Attach user's existing picks if available
  if (params.userId && params.venueId) {
    const userPicks = await fetchUserNFLPicks(params.userId, params.venueId, week.id);
    for (const game of games) {
      const pick = userPicks.find(p => p.gameId === game.id);
      if (pick) {
        game.userPickId = pick.id;
        game.userPickTeam = pick.selectedTeam;
        game.userPickStatus = pick.status;
      }
    }
  }
  
  const userSummary = params.userId && params.venueId
    ? await getUserNFLWeekSummary(params.userId, params.venueId, week.id)
    : undefined;
  
  return { week, games, userSummary };
}
```

#### Pick Submission
```typescript
/**
 * Submit or update an NFL Pick 'Em pick
 */
export async function submitNFLPickEmPick(params: {
  userId: string;
  venueId: string;
  weekId: string;
  gameId: string;
  pickTeam: string;
}): Promise<PickEmPick> {
  const week = await getNFLWeekById(params.weekId);
  if (!week) throw new Error("NFL Week not found");
  
  // Check if week is locked
  if (isNFLWeekLocked(week)) {
    throw new Error("Picks are locked for this week. The Thursday Night Football game has already kicked off.");
  }
  
  // Use existing pickem submission logic with NFL context
  // This leverages the existing pickem_picks table
  const game = await getNFLGameById(params.gameId);
  if (!game) throw new Error("Game not found");
  
  if (game.isLocked) {
    throw new Error("This game has already started.");
  }
  
  // Submit via existing pickem logic
  const pick = await submitPickEmPick({
    userId: params.userId,
    venueId: params.venueId,
    sportSlug: "nfl",
    gameId: params.gameId,
    pickTeam: params.pickTeam,
    weekStartDate: week.weekStartDate, // Pass week context
  });
  
  // Update user's week summary
  await updateUserNFLWeekSummary(params.userId, params.venueId, week.id);
  
  return pick;
}
```

### 3.3 API Routes

#### Route 1: List NFL Weeks
```typescript
// app/api/nfl-pickem/weeks/route.ts
import { NextResponse } from "next/server";
import { listNFLWeeks, getCurrentNFLWeek } from "@/lib/nflPickEm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = Number(searchParams.get("season")) || new Date().getFullYear();
    const includeComplete = searchParams.get("includeComplete") === "true";
    
    const weeks = await listNFLWeeks(season, includeComplete);
    const currentWeek = getCurrentNFLWeek(weeks);
    
    return NextResponse.json({
      ok: true,
      weeks: weeks.map(w => ({
        id: w.id,
        weekNumber: w.weekNumber,
        weekStartDate: w.weekStartDate,
        weekEndDate: w.weekEndDate,
        status: w.status,
        isLocked: isNFLWeekLocked(w),
        isCurrent: currentWeek?.id === w.id,
      })),
      currentWeekId: currentWeek?.id || null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load NFL weeks" },
      { status: 500 }
    );
  }
}
```

#### Route 2: Get Week Games
```typescript
// app/api/nfl-pickem/games/route.ts
import { NextResponse } from "next/server";
import { listNFLPickEmGames } from "@/lib/nflPickEm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get("weekId");
    const userId = searchParams.get("userId") || undefined;
    const venueId = searchParams.get("venueId") || undefined;
    
    if (!weekId) {
      return NextResponse.json(
        { ok: false, error: "weekId is required" },
        { status: 400 }
      );
    }
    
    const result = await listNFLPickEmGames({ weekId, userId, venueId });
    
    return NextResponse.json({
      ok: true,
      week: result.week,
      games: result.games,
      userSummary: result.userSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load games" },
      { status: 500 }
    );
  }
}
```

#### Route 3: Submit Pick
```typescript
// app/api/nfl-pickem/picks/route.ts
import { NextResponse } from "next/server";
import { submitNFLPickEmPick, clearNFLPick } from "@/lib/nflPickEm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userId, venueId, weekId, gameId, pickTeam } = body;
    
    if (!userId || !venueId || !weekId || !gameId) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    if (action === "clear") {
      await clearNFLPick({ userId, gameId });
      return NextResponse.json({ ok: true });
    }
    
    if (!pickTeam) {
      return NextResponse.json(
        { ok: false, error: "pickTeam is required" },
        { status: 400 }
      );
    }
    
    const pick = await submitNFLPickEmPick({
      userId,
      venueId,
      weekId,
      gameId,
      pickTeam,
    });
    
    return NextResponse.json({ ok: true, pick });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to submit pick" },
      { status: 400 }
    );
  }
}
```

### 3.4 Cron Job for Week Sync

Add to existing cron setup:

```typescript
// app/api/cron/nfl-week-sync/route.ts
import { NextResponse } from "next/server";
import { syncNFLWeeks } from "@/lib/nflPickEm";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const currentYear = new Date().getFullYear();
    const weeks = await syncNFLWeeks(currentYear);
    
    return NextResponse.json({
      ok: true,
      weeksSynced: weeks.length,
      message: `Synced ${weeks.length} NFL weeks for ${currentYear} season`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
```

---

## Phase 4: Frontend Components

### 4.1 Page Structure

```
app/
├── nfl-pickem/
│   ├── page.tsx                    # Main entry point
│   ├── layout.tsx                  # NFL Pick 'Em layout
│   └── week/
│       └── [weekId]/
│           └── page.tsx            # Specific week view
```

### 4.2 Main Component: NFLPickEmGameList

Create a new component based on the existing [`PickEmGameList`](components/pickem/PickEmGameList.tsx:201):

```typescript
// components/nfl-pickem/NFLPickEmGameList.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { GameAppBar } from "@/components/venue/AppBar";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import type { NFLWeek, NFLPickEmGame, NFLUserWeekSummary } from "@/lib/nflPickEm";

// Types matching API responses
type WeekOption = {
  id: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
};

type GamesResponse = {
  ok: boolean;
  week?: NFLWeek;
  games?: NFLPickEmGame[];
  userSummary?: NFLUserWeekSummary;
  error?: string;
};

export function NFLPickEmGameList({ 
  initialWeekId 
}: { 
  initialWeekId?: string 
}) {
  const router = useRouter();
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [weekData, setWeekData] = useState<{
    week: NFLWeek;
    games: NFLPickEmGame[];
    userSummary?: NFLUserWeekSummary;
  } | null>(null);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingGames, setLoadingGames] = useState(false);
  const [error, setError] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [venueId, setVenueId] = useState<string>("");
  
  // Load weeks list on mount
  useEffect(() => {
    async function loadWeeks() {
      try {
        const response = await fetch("/api/nfl-pickem/weeks?includeComplete=true");
        const data = await response.json();
        
        if (!data.ok) throw new Error(data.error);
        
        setWeeks(data.weeks);
        
        // Select current week or first available
        const targetWeek = data.weeks.find((w: WeekOption) => w.isCurrent) 
          || data.weeks.find((w: WeekOption) => !w.isLocked)
          || data.weeks[data.weeks.length - 1];
        
        if (targetWeek) {
          setSelectedWeekId(initialWeekId || targetWeek.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load weeks");
      } finally {
        setLoadingWeeks(false);
      }
    }
    
    loadWeeks();
  }, [initialWeekId]);
  
  // Load games when week changes
  useEffect(() => {
    if (!selectedWeekId) return;
    
    async function loadGames() {
      setLoadingGames(true);
      setError("");
      
      try {
        const params = new URLSearchParams({ weekId: selectedWeekId });
        if (userId) params.set("userId", userId);
        if (venueId) params.set("venueId", venueId);
        
        const response = await fetch(`/api/nfl-pickem/games?${params}`);
        const data: GamesResponse = await response.json();
        
        if (!data.ok) throw new Error(data.error);
        
        setWeekData({
          week: data.week!,
          games: data.games!,
          userSummary: data.userSummary,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load games");
      } finally {
        setLoadingGames(false);
      }
    }
    
    loadGames();
  }, [selectedWeekId, userId, venueId]);
  
  // Submit pick handler
  const submitPick = useCallback(async (game: NFLPickEmGame, pickTeam: string) => {
    if (!userId || !venueId) {
      setError("Please join a venue to make picks");
      return;
    }
    
    if (game.isLocked) {
      setError("This game has already started");
      return;
    }
    
    try {
      const response = await fetch("/api/nfl-pickem/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          venueId,
          weekId: selectedWeekId,
          gameId: game.id,
          pickTeam,
        }),
      });
      
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      
      // Optimistically update UI
      setWeekData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          games: prev.games.map(g => 
            g.id === game.id 
              ? { ...g, userPickTeam: pickTeam, userPickStatus: "pending" }
              : g
          ),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit pick");
    }
  }, [userId, venueId, selectedWeekId]);
  
  // Render game card
  const renderGameCard = (game: NFLPickEmGame) => {
    const isLocked = game.isLocked;
    const hasPick = !!game.userPickTeam;
    const isCorrect = game.userPickStatus === "won";
    const isWrong = game.userPickStatus === "lost";
    
    return (
      <motion.div
        key={game.id}
        className="overflow-hidden rounded-xl border border-[#fde68a]/45 bg-[linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)]"
        whileTap={{ scale: 0.98 }}
      >
        {/* Game Header */}
        <div className="flex items-center justify-between border-b border-dashed border-[#fde68a]/45 px-4 py-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
            {game.isThursdayGame ? "🏈 Thursday Night" : "NFL Week"}
          </span>
          <span className={`text-[11px] font-extrabold ${
            game.status === "live" ? "text-emerald-300" : "text-slate-300"
          }`}>
            {game.status === "final" ? "Final" : 
             game.status === "live" ? "Live" :
             new Date(game.startsAt).toLocaleDateString(undefined, { 
               weekday: "short", 
               month: "short", 
               day: "numeric",
               hour: "numeric",
               minute: "2-digit"
             })}
          </span>
        </div>
        
        {/* Teams */}
        <div className="flex overflow-hidden bg-[#020617]/45">
          {/* Away Team */}
          <button
            type="button"
            disabled={isLocked}
            onClick={() => submitPick(game, game.awayTeam)}
            className={`tp-clean-button flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center ${
              isLocked ? "cursor-not-allowed opacity-45" : ""
            } ${game.userPickTeam === game.awayTeam ? "bg-[#fde68a]/15" : ""}`}
          >
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black ${
              game.userPickTeam === game.awayTeam
                ? "rotate-[-7deg] border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
                : "border border-[#fde68a]/45 text-transparent"
            }`}>
              ✓
            </span>
            <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
              {game.awayTeam}
            </span>
            {game.status === "final" && (
              <span className={`text-[16px] font-black tabular-nums ${
                game.winnerTeam === game.awayTeam ? "text-emerald-300" : "text-slate-200"
              }`}>
                {game.awayScore ?? "–"}
              </span>
            )}
          </button>
          
          <div className="w-px shrink-0 bg-[#fde68a]/20" />
          
          {/* Home Team */}
          <button
            type="button"
            disabled={isLocked}
            onClick={() => submitPick(game, game.homeTeam)}
            className={`tp-clean-button flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center ${
              isLocked ? "cursor-not-allowed opacity-45" : ""
            } ${game.userPickTeam === game.homeTeam ? "bg-[#fde68a]/15" : ""}`}
          >
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black ${
              game.userPickTeam === game.homeTeam
                ? "rotate-[-7deg] border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
                : "border border-[#fde68a]/45 text-transparent"
            }`}>
              ✓
            </span>
            <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
              {game.homeTeam}
            </span>
            {game.status === "final" && (
              <span className={`text-[16px] font-black tabular-nums ${
                game.winnerTeam === game.homeTeam ? "text-emerald-300" : "text-slate-200"
              }`}>
                {game.homeScore ?? "–"}
              </span>
            )}
          </button>
        </div>
        
        {/* Result Banner */}
        {game.status === "final" && hasPick && (
          <div className={`px-4 py-1.5 text-[11px] font-extrabold tracking-[0.04em] ${
            isCorrect 
              ? "bg-emerald-500/15 text-emerald-300" 
              : "bg-rose-500/15 text-rose-300"
          }`}>
            {isCorrect ? `✓ Correct pick · +10 points` : "Incorrect pick · 0 points"}
          </div>
        )}
      </motion.div>
    );
  };
  
  // ... continued component rendering
}
```

### 4.3 Week Selector Component

```typescript
// components/nfl-pickem/WeekSelector.tsx
"use client";

import { motion } from "framer-motion";

type WeekOption = {
  id: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
};

export function WeekSelector({
  weeks,
  selectedWeekId,
  onSelect,
}: {
  weeks: WeekOption[];
  selectedWeekId: string;
  onSelect: (weekId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#fde68a]/30 bg-slate-900 p-3">
      <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
        Select Week
      </h3>
      
      <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {weeks.map((week) => (
          <motion.button
            key={week.id}
            type="button"
            onClick={() => onSelect(week.id)}
            className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
              selectedWeekId === week.id
                ? "border-[#fde68a] bg-[#fde68a]/20"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
            whileTap={{ scale: 0.95 }}
          >
            <div className="text-[13px] font-black text-white">
              Week {week.weekNumber}
              {week.isCurrent && (
                <span className="ml-1.5 text-[10px] font-bold text-emerald-400">
                  (Current)
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400">
              {new Date(week.weekStartDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
              -{" "}
              {new Date(week.weekEndDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </div>
            {week.isLocked ? (
              <div className="mt-1 text-[9px] font-bold text-rose-400">🔒 Locked</div>
            ) : (
              <div className="mt-1 text-[9px] font-bold text-emerald-400">✓ Open</div>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
```

### 4.4 Lock Countdown Timer

```typescript
// components/nfl-pickem/LockCountdown.tsx
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export function LockCountdown({ lockTime }: { lockTime: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  useEffect(() => {
    const lockDate = new Date(lockTime).getTime();
    
    const updateTimer = () => {
      const now = Date.now();
      const diff = lockDate - now;
      setTimeLeft(Math.max(0, diff));
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [lockTime]);
  
  if (timeLeft === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-lg border border-rose-500/45 bg-rose-950/30 px-3 py-2"
      >
        <span className="text-[11px] font-black text-rose-400">
          🔒 PICKS ARE LOCKED
        </span>
      </motion.div>
    );
  }
  
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-amber-400/45 bg-amber-950/30 px-3 py-2"
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-300">
        ⏰ Picks Lock In
      </div>
      <div className="mt-1 text-[18px] font-black tabular-nums text-amber-400">
        {days > 0 && `${days}d `}
        {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </div>
      <div className="text-[9px] text-amber-300/70">
        {new Date(lockTime).toLocaleString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </motion.div>
  );
}
```

### 4.5 Main Page Component

```typescript
// app/nfl-pickem/page.tsx
import { NFLPickEmGameList } from "@/components/nfl-pickem/NFLPickEmGameList";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "NFL Pick 'Em | Hightop Challenge",
  description: "Pick NFL winners each week. Picks lock at Thursday Night kickoff!",
};

export default function NFLPickEmPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  return (
    <main className="min-h-screen bg-slate-950 pb-8">
      <NFLPickEmGameList initialWeekId={searchParams.week} />
    </main>
  );
}
```

---

## Phase 5: NFL Week Logic & Lock Mechanism

### 5.1 Week Calculation Logic

```typescript
// lib/nflWeekUtils.ts

/**
 * NFL Season typically runs from early September to early January
 * Weeks are Thursday -> Monday (5 days)
 * Week 1 is the first week with regular season games
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get the Thursday that starts the week containing the given date
 */
export function getThursdayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 4 = Thursday
  const daysSinceThursday = (dayOfWeek - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceThursday);
  return d;
}

/**
 * Calculate NFL week number based on season start
 * This is approximate and should be validated against actual API data
 */
export function calculateNFLWeekNumber(thursdayDate: Date, season: number): number {
  // NFL season typically starts first Thursday after Labor Day
  // For simplicity, we'll calculate based on first Thursday in September
  const seasonStart = new Date(Date.UTC(season, 8, 1)); // September 1st
  const firstThursday = getThursdayOfWeek(seasonStart);
  
  // If first Thursday is before Sept 1, move to next Thursday
  if (firstThursday.getUTCMonth() < 8) {
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 7);
  }
  
  const diffTime = thursdayDate.getTime() - firstThursday.getTime();
  const diffWeeks = Math.floor(diffTime / (7 * MS_PER_DAY));
  
  return Math.max(1, diffWeeks + 1);
}

/**
 * Get all weeks for an NFL season
 */
export function getNFLWeeksForSeason(season: number): Array<{
  weekNumber: number;
  startDate: Date;
  endDate: Date;
}> {
  const weeks = [];
  const seasonStart = new Date(Date.UTC(season, 8, 1));
  let currentThursday = getThursdayOfWeek(seasonStart);
  
  // Ensure we start in September
  if (currentThursday.getUTCMonth() < 8) {
    currentThursday.setUTCDate(currentThursday.getUTCDate() + 7);
  }
  
  // Generate 18 weeks (regular season)
  for (let weekNum = 1; weekNum <= 18; weekNum++) {
    const startDate = new Date(currentThursday);
    const endDate = new Date(startDate.getTime() + 4 * MS_PER_DAY); // Monday
    
    weeks.push({
      weekNumber: weekNum,
      startDate,
      endDate,
    });
    
    currentThursday.setUTCDate(currentThursday.getUTCDate() + 7);
  }
  
  return weeks;
}
```

### 5.2 Lock Time Determination

```typescript
// lib/nflPickEm.ts (continued)

/**
 * Determine the lock time for a given NFL week
 * Picks lock at the earliest Thursday Night Football kickoff
 */
export async function determineWeekLockTime(
  weekStartDate: string
): Promise<string | null> {
  const start = new Date(weekStartDate);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000); // Friday
  
  // Fetch Thursday games
  const events = await fetchBallDontLieList<NFLEvent>("/nfl/v1/games",
    new URLSearchParams({
      dates: weekStartDate,
      per_page: "100",
    }),
    2
  );
  
  if (events.length === 0) {
    // No Thursday game - lock at first game of the week
    const weekGames = await fetchBallDontLieList<NFLEvent>("/nfl/v1/games",
      new URLSearchParams({
        "dates[]": weekStartDate,
        "dates[]": new Date(start.getTime() + MS_PER_DAY).toISOString().slice(0, 10),
        per_page: "100",
      }),
      2
    );
    
    if (weekGames.length === 0) return null;
    
    const earliestGame = weekGames.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )[0];
    
    return earliestGame.date;
  }
  
  // Find earliest Thursday kickoff
  const earliestThursday = events.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )[0];
  
  return earliestThursday.date;
}
```

### 5.3 Auto-Grading Logic

Leverage the existing grading system with NFL-specific additions:

```typescript
// lib/nflPickEm.ts (continued)

/**
 * Grade all NFL picks for completed games
 * Called by cron job after games complete
 */
export async function gradeNFLPicksForWeek(weekId: string): Promise<{
  graded: number;
  correct: number;
  pointsAwarded: number;
}> {
  const week = await getNFLWeekById(weekId);
  if (!week) throw new Error("Week not found");
  
  // Use existing settlePendingPickEmPicks but filter for NFL
  const result = await settlePendingPickEmPicks({
    sportKey: NFL_PICKEM_SPORT_KEY,
    fromIso: new Date(week.weekStartDate).toISOString(),
    toIso: new Date(new Date(week.weekEndDate).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });
  
  // Update all user week summaries
  await recalculateAllUserWeekSummaries(weekId);
  
  return result;
}
```

---

## Phase 6: Integration & Testing

### 6.1 Integration Checklist

#### API Integration Testing
| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Fetch NFL weeks | Returns array of weeks with correct dates | ⬜ |
| Fetch week games | Returns games for specified week | ⬜ |
| Submit pick before lock | Pick saved successfully | ⬜ |
| Submit pick after lock | Returns 400 with lock message | ⬜ |
| Change pick before lock | Pick updated successfully | ⬜ |
| Clear pick | Pick removed from database | ⬜ |
| Auto-grade completed games | Correct picks marked "won" | ⬜ |
| Points awarded | User points increased correctly | ⬜ |

#### Frontend Testing
| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Week selector loads | Shows all available weeks | ⬜ |
| Current week highlighted | Current week marked with badge | ⬜ |
| Game cards render | All games display with teams | ⬜ |
| Click team to pick | Checkmark appears on selection | ⬜ |
| Locked week UI | Games show as disabled | ⬜ |
| Countdown timer | Updates every second | ⬜ |
| Results display | Correct/incorrect picks highlighted | ⬜ |
| Score display | Final scores shown for completed games | ⬜ |

#### Edge Cases
| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| No Thursday game | Lock at first available game | ⬜ |
| Game postponed | Pick marked canceled | ⬜ |
| Tie game | Pick marked as push | ⬜ |
| API timeout | Graceful error message | ⬜ |
| User leaves venue | Picks preserved, points paused | ⬜ |

### 6.2 Test Script

```typescript
// tests/lib.nfl-pickem.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getThursdayOfWeek,
  calculateNFLWeekNumber,
  isNFLWeekLocked,
  syncNFLWeeks,
} from "@/lib/nflPickEm";

describe("NFL Pick 'Em Week Logic", () => {
  describe("getThursdayOfWeek", () => {
    it("should return Thursday for a Sunday date", () => {
      const sunday = new Date("2024-09-08"); // Sunday
      const thursday = getThursdayOfWeek(sunday);
      expect(thursday.getUTCDay()).toBe(4); // Thursday
      expect(thursday.toISOString().slice(0, 10)).toBe("2024-09-05");
    });
    
    it("should return same day for a Thursday date", () => {
      const thursday = new Date("2024-09-05");
      const result = getThursdayOfWeek(thursday);
      expect(result.toISOString().slice(0, 10)).toBe("2024-09-05");
    });
  });
  
  describe("calculateNFLWeekNumber", () => {
    it("should return week 1 for first Thursday in September", () => {
      const thursday = new Date("2024-09-05");
      const weekNum = calculateNFLWeekNumber(thursday, 2024);
      expect(weekNum).toBe(1);
    });
    
    it("should increment week number correctly", () => {
      const thursday = new Date("2024-09-12");
      const weekNum = calculateNFLWeekNumber(thursday, 2024);
      expect(weekNum).toBe(2);
    });
  });
  
  describe("isNFLWeekLocked", () => {
    it("should return false for future week", () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const week = {
        thursdayKickoff: futureDate.toISOString(),
      };
      expect(isNFLWeekLocked(week as NFLWeek)).toBe(false);
    });
    
    it("should return true for past week", () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const week = {
        thursdayKickoff: pastDate.toISOString(),
      };
      expect(isNFLWeekLocked(week as NFLWeek)).toBe(true);
    });
  });
});
```

### 6.3 Manual Testing Steps

1. **Pre-Season Setup**
   - Run week sync for upcoming season
   - Verify all 18 weeks created in database
   - Confirm week dates align with NFL schedule

2. **Pick Submission Flow**
   - Navigate to NFL Pick 'Em page
   - Select current week
   - Click team for 3-4 games
   - Verify picks saved in database
   - Refresh page - picks should persist

3. **Lock Mechanism**
   - Wait until Thursday (or manipulate system time)
   - Verify lock countdown shows 00:00:00
   - Attempt pick change - should show error
   - Verify locked UI state

4. **Results Grading**
   - After games complete, run grading job
   - Verify correct picks marked "won"
   - Verify incorrect picks marked "lost"
   - Check points awarded to users

---

## Phase 7: Deployment & Monitoring

### 7.1 Deployment Steps

#### Step 1: Database Migrations
```bash
# Run migrations in order
supabase migration up 20260715000000_add_nfl_pickem_weeks.sql
supabase migration up 20260715000100_add_nfl_pickem_user_weeks.sql
```

#### Step 2: Environment Variables
Add to `.env.local` and production:
```
# NFL Pick 'Em Configuration
NFL_PICKEM_ENABLED=true
NFL_PICKEM_SEASON=2024
NFL_SYNC_CRON_SECRET=your-secret-here
```

#### Step 3: Vercel Cron Jobs
Update `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/pickem-settle",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/nfl-week-sync",
      "schedule": "0 0 * * 1"
    }
  ]
}
```

#### Step 4: Feature Flag
Add NFL Pick 'Em to [`lib/venueGameCards.ts`](lib/venueGameCards.ts:1):

```typescript
// Add to VENUE_GAME_CARDS array
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
},
```

### 7.2 Monitoring & Alerts

#### Key Metrics to Track
| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| API Response Time | > 2000ms | Investigate balldontlie API |
| Failed Pick Submissions | > 5% error rate | Check lock logic |
| Week Sync Failures | Any failure | Manual sync required |
| Database Query Time | > 500ms | Optimize indexes |
| User Engagement | < 10% weekly participation | Review UX |

#### Log Events
```typescript
// In lib/nflPickEm.ts
console.log("[NFL Pick 'Em] Week synced", { 
  weekNumber, 
  gamesCount, 
  thursdayKickoff 
});

console.log("[NFL Pick 'Em] Pick submitted", { 
  userId, 
  weekNumber, 
  gameId, 
  team 
});

console.error("[NFL Pick 'Em] Lock violation attempted", { 
  userId, 
  weekNumber, 
  gameId 
});
```

### 7.3 Rollback Plan

If critical issues are discovered:

1. **Immediate**: Disable route via feature flag
2. **Short-term**: Revert frontend changes
3. **Long-term**: Revert database migrations

```bash
# Emergency rollback commands
# 1. Disable feature
# Update environment variable: NFL_PICKEM_ENABLED=false

# 2. Revert migrations (if necessary)
supabase migration revert 20260715000100_add_nfl_pickem_user_weeks.sql
supabase migration revert 20260715000000_add_nfl_pickem_weeks.sql
```

---

## Appendix A: API Endpoints Summary

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/api/nfl-pickem/weeks` | GET | List all NFL weeks | Optional |
| `/api/nfl-pickem/games` | GET | Get games for a week | Optional |
| `/api/nfl-pickem/picks` | POST | Submit or clear pick | Required |
| `/api/cron/nfl-week-sync` | GET | Sync weeks from API | Cron Secret |

## Appendix B: Database Schema

### nfl_pickem_weeks
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| season | integer | NFL season year |
| week_number | integer | Week number (1-18+) |
| week_start_date | date | Thursday start |
| week_end_date | date | Monday end |
| thursday_kickoff | timestamptz | Lock time |
| status | text | upcoming/open/locked/complete |
| games_count | integer | Expected games |

### nfl_pickem_user_weeks
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | User reference |
| venue_id | text | Venue reference |
| nfl_week_id | uuid | Week reference |
| picks_count | integer | Number of picks |
| correct_picks | integer | Correct count |
| total_points | integer | Points earned |
| is_complete | boolean | Week graded |

## Appendix C: Timeline Estimate

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 2 days | Requirements doc, architecture approval |
| Phase 2 | 1 day | Database migrations, schema review |
| Phase 3 | 3 days | Backend API, cron jobs |
| Phase 4 | 4 days | Frontend components, styling |
| Phase 5 | 2 days | Week logic, lock mechanism |
| Phase 6 | 3 days | Testing, bug fixes |
| Phase 7 | 1 day | Deployment, monitoring setup |
| **Total** | **16 days** | **Production-ready NFL Pick 'Em** |

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building NFL Pick 'Em as a dedicated game mode within Hightop Challenge. The approach leverages existing infrastructure while adding NFL-specific features like week-based organization and Thursday night lock deadlines.

Key success factors:
1. Reuse proven Pick 'Em infrastructure
2. Thorough testing of lock mechanism
3. Clear user communication about deadlines
4. Robust error handling for API failures

Next steps: Review and approve plan, then proceed with Phase 1 implementation.
