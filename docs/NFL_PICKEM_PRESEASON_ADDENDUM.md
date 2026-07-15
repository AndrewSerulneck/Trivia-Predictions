# NFL Pick 'Em - Preseason Support Addendum

## Overview
This document outlines the changes required to support NFL preseason games in NFL Pick 'Em, allowing the game to launch during the preseason period (typically August).

## Preseason Structure

### NFL Preseason Schedule
- **Duration**: 3 weeks (most teams) or 4 weeks (some teams)
- **Timing**: Early August through late August
- **Weeks**:
  - Hall of Fame Game (optional, Week 0)
  - Preseason Week 1 (early August)
  - Preseason Week 2 (mid August)
  - Preseason Week 3 (late August)
- **Days**: Games played Thursday through Sunday (no Monday Night)

### Key Differences from Regular Season
1. No Thursday Night Football branding
2. Games are Friday-Sunday (not Thursday-Monday)
3. Different week structure (Thursday-Sunday, 4 days)
4. Some weeks may not have Thursday games
5. Typically 16-18 games per week vs 13-16 in regular season

## Required Changes

### 1. Database Schema Updates

Add `week_type` column to distinguish preseason:

```sql
-- Migration: 20260715000300_add_preseason_support.sql

-- Add week type to nfl_pickem_weeks
ALTER TABLE nfl_pickem_weeks 
ADD COLUMN week_type text NOT NULL DEFAULT 'regular'
CHECK (week_type IN ('preseason', 'regular', 'postseason'));

-- Add display label for weeks
ALTER TABLE nfl_pickem_weeks 
ADD COLUMN display_label text;

-- Update existing constraint to allow more flexible dates for preseason
-- Preseason weeks may span different day ranges
ALTER TABLE nfl_pickem_weeks 
DROP CONSTRAINT IF EXISTS nfl_pickem_weeks_valid_range;

-- Create index for week type queries
CREATE INDEX idx_nfl_pickem_weeks_type 
ON nfl_pickem_weeks(season, week_type, week_number);

-- Update function to handle preseason status
CREATE OR REPLACE FUNCTION update_nfl_week_status()
RETURNS void AS $$
BEGIN
  UPDATE nfl_pickem_weeks
  SET status = CASE
    WHEN thursday_kickoff IS NOT NULL AND now() >= thursday_kickoff THEN 'locked'
    WHEN week_start_date <= CURRENT_DATE AND week_end_date >= CURRENT_DATE THEN 'open'
    WHEN week_end_date < CURRENT_DATE THEN 'complete'
    ELSE 'upcoming'
  END,
  updated_at = now()
  WHERE status != CASE
    WHEN thursday_kickoff IS NOT NULL AND now() >= thursday_kickoff THEN 'locked'
    WHEN week_start_date <= CURRENT_DATE AND week_end_date >= CURRENT_DATE THEN 'open'
    WHEN week_end_date < CURRENT_DATE THEN 'complete'
    ELSE 'upcoming'
  END;
END;
$$ LANGUAGE plpgsql;
```

### 2. Updated Week Calculation Logic

```typescript
// lib/nflWeekUtils.ts - Additions

export type NFLWeekType = "preseason" | "regular" | "postseason";

/**
 * Calculate preseason week number
 * Preseason starts first week of August
 */
export function calculatePreseasonWeekNumber(date: Date, season: number): number {
  const preseasonStart = new Date(Date.UTC(season, 7, 1)); // August 1st
  const firstPreseasonWeek = getThursdayOfWeek(preseasonStart);
  
  // Move to first Thursday in August
  if (firstPreseasonWeek.getUTCMonth() < 7) {
    firstPreseasonWeek.setUTCDate(firstPreseasonWeek.getUTCDate() + 7);
  }
  
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diffTime = date.getTime() - firstPreseasonWeek.getTime();
  const diffWeeks = Math.floor(diffTime / msPerWeek);
  
  return Math.max(1, diffWeeks + 1);
}

/**
 * Determine if a date is in preseason
 * Preseason: August through early September (before regular season Week 1)
 */
export function isPreseasonDate(date: Date, season: number): boolean {
  const month = date.getUTCMonth(); // 0-11
  const regularSeasonStart = getRegularSeasonWeek1Thursday(season);
  
  // August (month 7) is preseason
  // Early September before Week 1 is also preseason
  if (month === 7) return true; // August
  if (month === 8 && date < regularSeasonStart) return true; // Early September
  
  return false;
}

/**
 * Get the Thursday of Week 1 regular season
 */
export function getRegularSeasonWeek1Thursday(season: number): Date {
  const seasonStart = new Date(Date.UTC(season, 8, 1)); // September 1st
  const firstThursday = getThursdayOfWeek(seasonStart);
  
  if (firstThursday.getUTCMonth() < 8) {
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 7);
  }
  
  return firstThursday;
}

/**
 * Generate display label for a week
 */
export function getWeekDisplayLabel(
  weekNumber: number, 
  weekType: NFLWeekType,
  season: number
): string {
  if (weekType === "preseason") {
    return `Preseason Week ${weekNumber}`;
  }
  if (weekType === "postseason") {
    // Handle postseason naming (Wild Card, Divisional, etc.)
    const postseasonRounds = [
      "Wild Card",
      "Divisional",
      "Conference Championship",
      "Super Bowl"
    ];
    return postseasonRounds[weekNumber - 1] || `Postseason Week ${weekNumber}`;
  }
  return `Week ${weekNumber}`;
}

/**
 * Get week range for preseason (Thursday-Sunday, 4 days)
 * vs regular season (Thursday-Monday, 5 days)
 */
export function getNFLWeekRangeByType(
  weekStartThursday: Date,
  weekType: NFLWeekType
): { start: Date; end: Date } {
  const start = new Date(weekStartThursday);
  start.setUTCHours(0, 0, 0, 0);
  
  const end = new Date(start);
  // Preseason: Thursday to Sunday (3 days after start)
  // Regular: Thursday to Monday (4 days after start)
  const daysToAdd = weekType === "preseason" ? 3 : 4;
  end.setUTCDate(end.getUTCDate() + daysToAdd);
  end.setUTCHours(23, 59, 59, 999);
  
  return { start, end };
}
```

### 3. Updated Sync Logic

```typescript
// lib/nflPickEm.ts - Updated sync function

export async function syncNFLWeeks(season: number): Promise<NFLWeek[]> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured");
  }
  
  // Fetch ALL games including preseason
  const games = await fetchBallDontLieList<any>(
    "/nfl/v1/games",
    new URLSearchParams({ 
      seasons: String(season), 
      per_page: "100"
      // Remove postseason: "false" to include all games
    }),
    3
  );
  
  // Group games by week and type
  const weekMap = new Map<string, { games: typeof games; type: NFLWeekType }>();
  
  for (const game of games) {
    const gameDate = new Date(game.date);
    const isPreseason = isPreseasonDate(gameDate, season);
    const weekType: NFLWeekType = isPreseason ? "preseason" : "regular";
    
    const weekStart = getThursdayOfWeek(gameDate);
    const weekNumber = isPreseason
      ? calculatePreseasonWeekNumber(weekStart, season)
      : calculateNFLWeekNumber(weekStart, season);
    
    const key = `${weekType}-${weekNumber}`;
    
    if (!weekMap.has(key)) {
      weekMap.set(key, { games: [], type: weekType });
    }
    weekMap.get(key)!.games.push(game);
  }
  
  // Upsert each week
  const weeks: NFLWeek[] = [];
  
  for (const [key, { games: weekGames, type }] of weekMap) {
    const weekStart = getThursdayOfWeek(new Date(weekGames[0].date));
    const weekNumber = type === "preseason"
      ? calculatePreseasonWeekNumber(weekStart, season)
      : calculateNFLWeekNumber(weekStart, season);
    
    const range = getNFLWeekRangeByType(weekStart, type);
    
    // Find first game of week for lock time
    const firstGame = weekGames
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    
    const displayLabel = getWeekDisplayLabel(weekNumber, type, season);
    
    // Upsert week
    const { data: week, error } = await supabaseAdmin
      .from("nfl_pickem_weeks")
      .upsert({
        season,
        week_number: weekNumber,
        week_type: type,
        week_start_date: range.start.toISOString().slice(0, 10),
        week_end_date: range.end.toISOString().slice(0, 10),
        display_label: displayLabel,
        thursday_kickoff: firstGame?.date || null,
        games_count: weekGames.length,
        synced_at: new Date().toISOString(),
      }, {
        onConflict: "season,week_number,week_type",
      })
      .select()
      .single();
    
    if (error) {
      console.error(`Failed to sync ${type} week ${weekNumber}:`, error);
      continue;
    }
    
    weeks.push(mapNFLWeekRow(week));
  }
  
  return weeks;
}
```

### 4. Updated Type Definitions

```typescript
// lib/nflPickEm.ts - Updated types

export type NFLWeek = {
  id: string;
  season: number;
  weekNumber: number;
  weekType: NFLWeekType;
  displayLabel: string;
  weekStartDate: string;
  weekEndDate: string;
  thursdayKickoff: string | null;
  status: "upcoming" | "open" | "locked" | "complete";
  gamesCount: number;
  syncedAt: string | null;
};

export type NFLWeekOption = {
  id: string;
  weekNumber: number;
  weekType: NFLWeekType;
  displayLabel: string;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
  gamesCount: number;
};

// Map database row to type
function mapNFLWeekRow(row: any): NFLWeek {
  return {
    id: row.id,
    season: row.season,
    weekNumber: row.week_number,
    weekType: row.week_type,
    displayLabel: row.display_label || getWeekDisplayLabel(row.week_number, row.week_type, row.season),
    weekStartDate: row.week_start_date,
    weekEndDate: row.week_end_date,
    thursdayKickoff: row.thursday_kickoff,
    status: row.status,
    gamesCount: row.games_count,
    syncedAt: row.synced_at,
  };
}
```

### 5. Updated Frontend Components

```typescript
// components/nfl-pickem/WeekSelector.tsx - Updated

export function WeekSelector({
  weeks,
  selectedWeekId,
  onSelect,
}: {
  weeks: NFLWeekOption[];
  selectedWeekId: string;
  onSelect: (weekId: string) => void;
}) {
  // Group weeks by type
  const groupedWeeks = useMemo(() => {
    const groups: Record<string, NFLWeekOption[]> = {
      preseason: [],
      regular: [],
      postseason: [],
    };
    
    for (const week of weeks) {
      groups[week.weekType].push(week);
    }
    
    return groups;
  }, [weeks]);
  
  return (
    <div className="rounded-xl border border-[#fde68a]/30 bg-slate-900 p-3">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
        Select Week
      </h3>
      
      {/* Preseason Section */}
      {groupedWeeks.preseason.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Preseason
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {groupedWeeks.preseason.map((week) => (
              <WeekCard
                key={week.id}
                week={week}
                isSelected={selectedWeekId === week.id}
                onSelect={() => onSelect(week.id)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Regular Season Section */}
      {groupedWeeks.regular.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Regular Season
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {groupedWeeks.regular.map((week) => (
              <WeekCard
                key={week.id}
                week={week}
                isSelected={selectedWeekId === week.id}
                onSelect={() => onSelect(week.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Individual week card component
function WeekCard({
  week,
  isSelected,
  onSelect,
}: {
  week: NFLWeekOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className={`shrink-0 rounded-lg border px-3 py-2.5 text-left transition-all ${
        isSelected
          ? "border-[#fde68a] bg-[#fde68a]/20 shadow-lg shadow-[#fde68a]/10"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
      whileTap={{ scale: 0.95 }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-black text-white">
          {week.displayLabel}
        </span>
        {week.isCurrent && (
          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
            NOW
          </span>
        )}
      </div>
      
      {/* ... rest of card */}
    </motion.button>
  );
}
```

```typescript
// components/nfl-pickem/NFLGameCard.tsx - Updated for preseason

export function NFLGameCard({
  game,
  onPick,
  isLocked,
  weekType,
}: {
  game: NFLGame;
  onPick: (game: NFLGame, team: string) => void;
  isLocked: boolean;
  weekType: NFLWeekType;
}) {
  // Preseason doesn't have Thursday Night Football branding
  const showThursdayBadge = game.isThursdayGame && weekType === "regular";
  
  return (
    <motion.div
      className="overflow-hidden rounded-xl border border-[#fde68a]/45 bg-[linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)]"
      whileTap={!isLocked ? { scale: 0.99 } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-dashed border-[#fde68a]/45 px-4 py-2">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
          {showThursdayBadge ? "🏈 Thursday Night" : 
           weekType === "preseason" ? "🏈 Preseason" : "NFL"}
        </span>
        {/* ... */}
      </div>
      {/* ... */}
    </motion.div>
  );
}
```

### 6. Marketing/Copy Updates

Update the game card and onboarding to mention preseason:

```typescript
// lib/venueGameCards.ts - Updated rules
{
  key: "nfl-pickem",
  title: "NFL Pick 'Em",
  path: "/nfl-pickem",
  cardClassName: "bg-emerald-700 text-white",
  visibleOnVenueHome: true,
  rules: [
    "-Pick winners for all NFL games each week",
    "-Includes Preseason AND Regular Season games",
    "-Picks lock at first game kickoff each week",
    "-10 points per correct pick",
    "-View past weeks to see your results",
  ],
  steps: [
    {
      stepLabel: "Weekly Picks",
      heading: "Pick every game, every week.",
      body: "From Preseason through the Regular Season, pick winners for all games. Start building your record early!",
    },
    {
      stepLabel: "Lock Time",
      heading: "First kickoff is the deadline.",
      body: "All picks lock when the first game of the week kicks off. Preseason weeks lock at the first Thursday or Friday game.",
    },
    {
      stepLabel: "Track Results",
      heading: "See how you did.",
      body: "View your picks and results for every week. Build your season-long record from Preseason through the playoffs!",
    },
  ],
}
```

## Launch Timeline

### Preseason Launch Benefits
1. **Early User Acquisition** - Users start playing in August
2. **Lower Stakes Learning** - Preseason is practice for regular season
3. **Hype Building** - Momentum going into Week 1
4. **Bug Discovery** - Find issues before regular season starts

### Recommended Launch Schedule

| Date | Action |
|------|--------|
| Early August | Soft launch with Preseason Week 1 |
| Mid August | Marketing push for Preseason Week 2 |
| Late August | Final preseason push |
| Early September | Full marketing for Regular Season Week 1 |

## Testing Considerations

### Preseason-Specific Tests
1. Verify preseason weeks sync correctly
2. Test lock times for preseason (Friday games)
3. Ensure scoring works the same (10 points per win)
4. Test user can see both preseason and regular season weeks
5. Verify statistics track across both types

### Edge Cases
- Week 4 preseason (not all teams play)
- Hall of Fame Game (extra preseason game)
- Transition from preseason to regular season
- Teams sitting starters (doesn't affect picks, just FYI)

## Migration Path for Existing Users

If launching during an active season:

```typescript
// Add to initial sync to backfill current season
export async function backfillCurrentSeason(season: number): Promise<void> {
  // Sync all weeks including past weeks for current season
  const weeks = await syncNFLWeeks(season);
  
  // Mark past weeks as complete
  const now = new Date();
  for (const week of weeks) {
    if (new Date(week.weekEndDate) < now) {
      await supabaseAdmin
        ?.from("nfl_pickem_weeks")
        .update({ status: "complete" })
        .eq("id", week.id);
    }
  }
}
```

---

**With these changes, NFL Pick 'Em can launch during the preseason, giving users a full month+ of engagement before the regular season even starts!**
