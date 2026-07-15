# Phase 5: NFL Week Logic & Lock Mechanism

## 5.1 Week Calculation Algorithm

### NFL Week Definition

An NFL week runs from **Thursday 00:00 UTC** through **Monday 23:59 UTC** (5 days).

```
Week Structure:
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│Thursday │ Friday  │Saturday │ Sunday  │ Monday  │
│  TNF    │         │         │  Games  │  MNF    │
└─────────┴─────────┴─────────┴─────────┴─────────┘
  00:00                                    23:59
```

### Implementation

```typescript
// lib/nflWeekUtils.ts

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get the Thursday that starts the week containing the given date
 * 
 * Examples:
 * - Sept 8, 2024 (Sunday) → Sept 5, 2024 (Thursday)
 * - Sept 5, 2024 (Thursday) → Sept 5, 2024 (Thursday)
 * - Sept 4, 2024 (Wednesday) → Aug 29, 2024 (Thursday of previous week)
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
 * Calculate NFL week number
 * 
 * NFL Week 1 = First Thursday in September
 * Preseason games are ignored (they occur in August)
 * 
 * @example
 * calculateNFLWeekNumber(new Date("2024-09-05"), 2024) // → 1
 * calculateNFLWeekNumber(new Date("2024-09-12"), 2024) // → 2
 */
export function calculateNFLWeekNumber(thursdayDate: Date, season: number): number {
  // NFL season starts first Thursday in September (or after)
  const seasonStart = new Date(Date.UTC(season, 8, 1)); // September 1st
  const firstThursday = getThursdayOfWeek(seasonStart);
  
  // If first Thursday is before Sept 1, move to next week
  // This handles years where Sept 1 is Friday-Sunday
  if (firstThursday.getUTCMonth() < 8) {
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 7);
  }
  
  const msPerWeek = 7 * MS_PER_DAY;
  const diffTime = thursdayDate.getTime() - firstThursday.getTime();
  const diffWeeks = Math.floor(diffTime / msPerWeek);
  
  // Week numbers start at 1, not 0
  return Math.max(1, diffWeeks + 1);
}

/**
 * Get the full date range for an NFL week
 */
export function getNFLWeekRange(weekStartThursday: Date): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
} {
  const start = new Date(weekStartThursday);
  start.setUTCHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4); // Monday
  end.setUTCHours(23, 59, 59, 999);
  
  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
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
  
  // Start from first Thursday in September
  const seasonStart = new Date(Date.UTC(season, 8, 1));
  let currentThursday = getThursdayOfWeek(seasonStart);
  
  if (currentThursday.getUTCMonth() < 8) {
    currentThursday.setUTCDate(currentThursday.getUTCDate() + 7);
  }
  
  // Generate 18 weeks (regular season)
  for (let weekNum = 1; weekNum <= 18; weekNum++) {
    const range = getNFLWeekRange(currentThursday);
    
    weeks.push({
      weekNumber: weekNum,
      startDate: range.start,
      endDate: range.end,
    });
    
    currentThursday.setUTCDate(currentThursday.getUTCDate() + 7);
  }
  
  return weeks;
}
```

### Test Cases

```typescript
// tests/lib.nfl-week-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  getThursdayOfWeek,
  calculateNFLWeekNumber,
  getNFLWeekRange,
  getNFLWeeksForSeason,
} from "@/lib/nflWeekUtils";

describe("NFL Week Utilities", () => {
  describe("getThursdayOfWeek", () => {
    it("returns same day for Thursday", () => {
      const thursday = new Date("2024-09-05");
      const result = getThursdayOfWeek(thursday);
      expect(result.toISOString().slice(0, 10)).toBe("2024-09-05");
    });
    
    it("returns previous Thursday for Sunday", () => {
      const sunday = new Date("2024-09-08");
      const result = getThursdayOfWeek(sunday);
      expect(result.toISOString().slice(0, 10)).toBe("2024-09-05");
    });
    
    it("returns previous Thursday for Wednesday", () => {
      const wednesday = new Date("2024-09-04");
      const result = getThursdayOfWeek(wednesday);
      expect(result.toISOString().slice(0, 10)).toBe("2024-08-29");
    });
    
    it("handles year boundaries correctly", () => {
      const jan1 = new Date("2024-01-01"); // Monday
      const result = getThursdayOfWeek(jan1);
      expect(result.getUTCDay()).toBe(4); // Thursday
    });
  });
  
  describe("calculateNFLWeekNumber", () => {
    it("returns 1 for first Thursday in September 2024", () => {
      const week1Thursday = new Date("2024-09-05");
      expect(calculateNFLWeekNumber(week1Thursday, 2024)).toBe(1);
    });
    
    it("returns 2 for second week", () => {
      const week2Thursday = new Date("2024-09-12");
      expect(calculateNFLWeekNumber(week2Thursday, 2024)).toBe(2);
    });
    
    it("returns 18 for final week of regular season", () => {
      // 2024 Week 18 starts January 2, 2025
      const week18Thursday = new Date("2025-01-02");
      expect(calculateNFLWeekNumber(week18Thursday, 2024)).toBe(18);
    });
    
    it("handles 2023 season correctly", () => {
      // 2023 season started Sept 7
      const week1 = new Date("2023-09-07");
      expect(calculateNFLWeekNumber(week1, 2023)).toBe(1);
      
      const week2 = new Date("2023-09-14");
      expect(calculateNFLWeekNumber(week2, 2023)).toBe(2);
    });
  });
  
  describe("getNFLWeekRange", () => {
    it("returns correct 5-day range", () => {
      const thursday = new Date("2024-09-05");
      const range = getNFLWeekRange(thursday);
      
      expect(range.start.toISOString().slice(0, 10)).toBe("2024-09-05");
      expect(range.end.toISOString().slice(0, 10)).toBe("2024-09-09"); // Monday
    });
    
    it("sets correct times", () => {
      const thursday = new Date("2024-09-05T12:00:00Z");
      const range = getNFLWeekRange(thursday);
      
      expect(range.start.getUTCHours()).toBe(0);
      expect(range.end.getUTCHours()).toBe(23);
    });
  });
  
  describe("getNFLWeeksForSeason", () => {
    it("returns 18 weeks for 2024 season", () => {
      const weeks = getNFLWeeksForSeason(2024);
      expect(weeks).toHaveLength(18);
    });
    
    it("weeks are sequential", () => {
      const weeks = getNFLWeeksForSeason(2024);
      
      for (let i = 1; i < weeks.length; i++) {
        const prevEnd = weeks[i - 1].endDate.getTime();
        const currStart = weeks[i].startDate.getTime();
        expect(currStart).toBe(prevEnd + 1); // 1ms after previous week ends
      }
    });
    
    it("first week starts in September", () => {
      const weeks = getNFLWeeksForSeason(2024);
      expect(weeks[0].startDate.getUTCMonth()).toBe(8); // September (0-indexed)
    });
  });
});
```

## 5.2 Lock Mechanism

### Lock Time Determination

```typescript
// lib/nflPickEm.ts

/**
 * Determine the lock time for an NFL week
 * 
 * Rules:
 * 1. If there's a Thursday Night Football game, lock at earliest kickoff
 * 2. If no Thursday game (bye week), lock at first game of the week
 * 3. If no games at all (shouldn't happen), return null
 */
export async function determineWeekLockTime(
  weekStartDate: string,
  weekEndDate: string
): Promise<string | null> {
  // Fetch Thursday games
  const thursdayGames = await fetchNFLGamesFromBDL(weekStartDate, weekStartDate);
  
  if (thursdayGames.length > 0) {
    // Find earliest kickoff on Thursday
    const earliest = thursdayGames
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
    
    return earliest.startsAt;
  }
  
  // No Thursday game - find first game of the week
  const allGames = await fetchNFLGamesFromBDL(weekStartDate, weekEndDate);
  
  if (allGames.length === 0) {
    return null;
  }
  
  const earliestGame = allGames
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  
  return earliestGame.startsAt;
}

/**
 * Check if a week is currently locked
 */
export function isNFLWeekLocked(week: {
  thursdayKickoff: string | null;
  status: string;
}): boolean {
  if (week.status === "locked" || week.status === "complete") {
    return true;
  }
  
  if (!week.thursdayKickoff) {
    return false;
  }
  
  return Date.now() >= new Date(week.thursdayKickoff).getTime();
}

/**
 * Get lock status with detailed information
 */
export function getLockStatus(week: {
  thursdayKickoff: string | null;
}): {
  isLocked: boolean;
  timeUntilLock: number | null; // milliseconds
  lockTimeFormatted: string | null;
} {
  if (!week.thursdayKickoff) {
    return {
      isLocked: false,
      timeUntilLock: null,
      lockTimeFormatted: null,
    };
  }
  
  const lockTime = new Date(week.thursdayKickoff).getTime();
  const now = Date.now();
  const isLocked = now >= lockTime;
  
  return {
    isLocked,
    timeUntilLock: isLocked ? 0 : lockTime - now,
    lockTimeFormatted: new Date(week.thursdayKickoff).toLocaleString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
  };
}
```

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Thanksgiving (2 Thursday games) | Lock at earliest kickoff |
| Bye week (no Thursday game) | Lock at first Sunday game |
| Game time change after sync | Lock time may be outdated (acceptable) |
| International game (London) | Use actual kickoff time in UTC |
| Weather delay | Lock time doesn't change (based on scheduled time) |
| Playoff weeks | Out of scope (regular season only) |

## 5.3 Auto-Grading

### Grading Trigger

```typescript
// lib/nflPickEm.ts

/**
 * Grade all picks for a completed week
 * Called by cron job after week ends
 */
export async function gradeNFLWeek(weekId: string): Promise<{
  graded: number;
  correct: number;
  incorrect: number;
  pushes: number;
}> {
  const week = await getNFLWeekById(weekId);
  if (!week) {
    throw new Error("Week not found");
  }
  
  // Use existing settlement logic
  const result = await settlePendingPickEmPicks({
    sportKey: NFL_PICKEM_SPORT_KEY,
    fromIso: new Date(week.weekStartDate).toISOString(),
    toIso: new Date(new Date(week.weekEndDate).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });
  
  // Recalculate all user summaries for this week
  await recalculateAllUserWeekSummaries(weekId);
  
  // Mark week as complete
  await supabaseAdmin
    ?.from("nfl_pickem_weeks")
    .update({ status: "complete" })
    .eq("id", weekId);
  
  return result;
}

/**
 * Recalculate all user week summaries
 */
async function recalculateAllUserWeekSummaries(weekId: string): Promise<void> {
  // Get all users who made picks this week
  const { data: userWeeks } = await supabaseAdmin
    ?.from("nfl_pickem_user_weeks")
    .select("user_id, venue_id")
    .eq("nfl_week_id", weekId);
  
  if (!userWeeks || userWeeks.length === 0) return;
  
  // Recalculate each user's summary
  for (const { user_id, venue_id } of userWeeks) {
    await supabaseAdmin?.rpc("recalculate_nfl_user_week", {
      p_user_id: user_id,
      p_venue_id: venue_id,
      p_nfl_week_id: weekId,
    });
  }
}
```

### Cron Job Schedule

```typescript
// app/api/cron/nfl-grade/route.ts
import { NextResponse } from "next/server";
import { gradeNFLWeek } from "@/lib/nflPickEm";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    // Find weeks that ended yesterday and need grading
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { data: weeksToGrade } = await supabaseAdmin
      ?.from("nfl_pickem_weeks")
      .select("id, week_number")
      .eq("week_end_date", yesterday.toISOString().slice(0, 10))
      .eq("status", "locked");
    
    const results = [];
    
    for (const week of weeksToGrade || []) {
      const result = await gradeNFLWeek(week.id);
      results.push({
        weekId: week.id,
        weekNumber: week.week_number,
        ...result,
      });
    }
    
    return NextResponse.json({
      ok: true,
      weeksGraded: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Grading failed" },
      { status: 500 }
    );
  }
}
```

## 5.4 Status Management

### Week Status State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────────┐    ┌────────┐    ┌────────┐    ┌──────────┐ │
│ upcoming │───►│  open  │───►│ locked │───►│ complete │─┘
└──────────┘    └────────┘    └────────┘    └──────────┘
     │               │             │
     │               │             │
     ▼               ▼             ▼
  Week is in    Current week   Thursday kickoff
  the future    (today is      has passed
                between start
                and end)
```

### Status Update Logic

```typescript
// lib/nflPickEm.ts

/**
 * Update status for all weeks based on current time
 * Should be called periodically (e.g., every hour)
 */
export async function updateAllWeekStatuses(): Promise<void> {
  if (!supabaseAdmin) return;
  
  const now = new Date();
  
  // Update upcoming → open
  await supabaseAdmin
    .from("nfl_pickem_weeks")
    .update({ status: "open" })
    .eq("status", "upcoming")
    .lte("week_start_date", now.toISOString().slice(0, 10))
    .gte("week_end_date", now.toISOString().slice(0, 10));
  
  // Update open → locked (based on thursday_kickoff)
  await supabaseAdmin
    .from("nfl_pickem_weeks")
    .update({ status: "locked" })
    .eq("status", "open")
    .not("thursday_kickoff", "is", null)
    .lte("thursday_kickoff", now.toISOString());
  
  // Update open → locked (based on week end, if no kickoff)
  await supabaseAdmin
    .from("nfl_pickem_weeks")
    .update({ status: "locked" })
    .eq("status", "open")
    .is("thursday_kickoff", null)
    .lt("week_end_date", now.toISOString().slice(0, 10));
}
```

## 5.5 Code Review Checklist

- [ ] Week calculations handle all edge cases
- [ ] Lock time correctly identifies TNF games
- [ ] Time zone handling uses UTC consistently
- [ ] Grading logic correctly uses existing settlement
- [ ] Status transitions are deterministic
- [ ] All date comparisons use proper operators
- [ ] Week 18 and bye weeks handled correctly

---

**Next**: Proceed to [Phase 6: Testing](docs/NFL_PICKEM_PHASE6_TESTING.md)
