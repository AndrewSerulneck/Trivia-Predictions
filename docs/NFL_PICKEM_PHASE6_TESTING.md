# Phase 6: Integration & Testing

## 6.1 Testing Strategy

### Test Pyramid

```
        ╱╲
       ╱  ╲
      ╱ E2E ╲      ← 5% (Critical user flows)
     ╱────────╲
    ╱ Integration ╲  ← 25% (API + DB)
   ╱──────────────╲
  ╱    Unit Tests    ╲ ← 70% (Functions, utilities)
 ╱────────────────────╲
```

### Testing Tools

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit | Vitest | Function logic, calculations |
| Integration | Vitest + Supabase Test DB | API routes, DB queries |
| E2E | Playwright | Full user flows |
| Manual | Browser | Visual, UX, edge cases |

## 6.2 Unit Tests

### Week Calculation Tests

```typescript
// tests/lib.nfl-week-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  getThursdayOfWeek,
  calculateNFLWeekNumber,
  getNFLWeekRange,
  isNFLWeekLocked,
} from "@/lib/nflWeekUtils";

describe("NFL Week Calculation", () => {
  describe("getThursdayOfWeek", () => {
    const testCases = [
      { input: "2024-09-05", expected: "2024-09-05", desc: "Thursday" },
      { input: "2024-09-08", expected: "2024-09-05", desc: "Sunday" },
      { input: "2024-09-04", expected: "2024-08-29", desc: "Wednesday (prev week)" },
      { input: "2024-09-09", expected: "2024-09-05", desc: "Monday" },
      { input: "2024-01-01", expected: "2023-12-28", desc: "New Year (prev year)" },
    ];
    
    testCases.forEach(({ input, expected, desc }) => {
      it(`returns ${expected} for ${desc}`, () => {
        const result = getThursdayOfWeek(new Date(input));
        expect(result.toISOString().slice(0, 10)).toBe(expected);
      });
    });
  });
  
  describe("calculateNFLWeekNumber", () => {
    it("calculates 2024 season correctly", () => {
      // 2024 Week 1: Sept 5
      expect(calculateNFLWeekNumber(new Date("2024-09-05"), 2024)).toBe(1);
      expect(calculateNFLWeekNumber(new Date("2024-09-12"), 2024)).toBe(2);
      expect(calculateNFLWeekNumber(new Date("2024-09-19"), 2024)).toBe(3);
      expect(calculateNFLWeekNumber(new Date("2024-12-26"), 2024)).toBe(17);
      expect(calculateNFLWeekNumber(new Date("2025-01-02"), 2024)).toBe(18);
    });
    
    it("handles years where Sept 1 is Friday-Sunday", () => {
      // 2025: Sept 1 is Monday
      expect(calculateNFLWeekNumber(new Date("2025-09-04"), 2025)).toBe(1);
    });
  });
  
  describe("isNFLWeekLocked", () => {
    it("returns true when lock time has passed", () => {
      const pastWeek = {
        thursdayKickoff: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        status: "open",
      };
      expect(isNFLWeekLocked(pastWeek)).toBe(true);
    });
    
    it("returns false when lock time is in future", () => {
      const futureWeek = {
        thursdayKickoff: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: "open",
      };
      expect(isNFLWeekLocked(futureWeek)).toBe(false);
    });
    
    it("returns false when no lock time set", () => {
      const week = { thursdayKickoff: null, status: "open" };
      expect(isNFLWeekLocked(week)).toBe(false);
    });
    
    it("returns true when status is locked", () => {
      const week = {
        thursdayKickoff: null,
        status: "locked",
      };
      expect(isNFLWeekLocked(week)).toBe(true);
    });
  });
});
```

### Lock Time Determination Tests

```typescript
// tests/lib.nfl-lock-time.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { determineWeekLockTime } from "@/lib/nflPickEm";

// Mock the BDL fetch
vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: vi.fn(),
}));

describe("Lock Time Determination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it("returns earliest Thursday game kickoff", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");
    
    fetchBallDontLieList.mockResolvedValue([
      { id: "1", date: "2024-09-05T20:20:00-04:00", home_team: {}, visitor_team: {} },
      { id: "2", date: "2024-09-05T20:15:00-04:00", home_team: {}, visitor_team: {} }, // Earlier
    ]);
    
    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBe("2024-09-05T20:15:00-04:00");
  });
  
  it("returns first game of week when no Thursday game", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");
    
    // First call (Thursday) returns empty
    // Second call (full week) returns Sunday games
    fetchBallDontLieList
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { id: "1", date: "2024-09-08T13:00:00-04:00", home_team: {}, visitor_team: {} },
        { id: "2", date: "2024-09-08T16:25:00-04:00", home_team: {}, visitor_team: {} },
      ]);
    
    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBe("2024-09-08T13:00:00-04:00");
  });
  
  it("returns null when no games found", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");
    
    fetchBallDontLieList.mockResolvedValue([]);
    
    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBeNull();
  });
});
```

## 6.3 API Integration Tests

```typescript
// tests/api.nfl-pickem.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("NFL Pick 'Em API", () => {
  const testWeek = {
    season: 2024,
    week_number: 99, // Test week
    week_start_date: "2099-09-05",
    week_end_date: "2099-09-09",
    thursday_kickoff: "2099-09-05T20:20:00Z",
    status: "open",
  };
  
  let weekId: string;
  
  beforeAll(async () => {
    // Insert test week
    const { data, error } = await supabase
      .from("nfl_pickem_weeks")
      .insert(testWeek)
      .select()
      .single();
    
    if (error) throw error;
    weekId = data.id;
  });
  
  afterAll(async () => {
    // Clean up
    await supabase.from("nfl_pickem_weeks").delete().eq("id", weekId);
  });
  
  describe("GET /api/nfl-pickem/weeks", () => {
    it("returns weeks for a season", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/weeks?season=2099`
      );
      const data = await response.json();
      
      expect(data.ok).toBe(true);
      expect(data.weeks).toBeInstanceOf(Array);
      expect(data.weeks.some((w: any) => w.id === weekId)).toBe(true);
    });
    
    it("identifies current week correctly", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/weeks?season=2099`
      );
      const data = await response.json();
      
      const testWeekData = data.weeks.find((w: any) => w.id === weekId);
      expect(testWeekData).toBeDefined();
      // Since it's in 2099, it shouldn't be "current"
      expect(testWeekData.isCurrent).toBe(false);
    });
  });
  
  describe("GET /api/nfl-pickem/games", () => {
    it("returns games for a week", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/games?weekId=${weekId}`
      );
      const data = await response.json();
      
      expect(data.ok).toBe(true);
      expect(data.week).toBeDefined();
      expect(data.week.id).toBe(weekId);
      expect(data.games).toBeInstanceOf(Array);
    });
    
    it("requires weekId parameter", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/games`
      );
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.error).toContain("weekId is required");
    });
  });
  
  describe("POST /api/nfl-pickem/picks", () => {
    it("requires authentication", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/picks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekId,
            gameId: "test-game",
            pickTeam: "Test Team",
            // Missing userId and venueId
          }),
        }
      );
      
      expect(response.status).toBe(400);
    });
    
    it("prevents picks when week is locked", async () => {
      // Create a locked week
      const { data: lockedWeek } = await supabase
        .from("nfl_pickem_weeks")
        .insert({
          ...testWeek,
          week_number: 98,
          thursday_kickoff: "2000-01-01T00:00:00Z", // Past
        })
        .select()
        .single();
      
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/picks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: "test-user",
            venueId: "test-venue",
            weekId: lockedWeek.id,
            gameId: "test-game",
            pickTeam: "Test Team",
          }),
        }
      );
      
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("locked");
      
      // Clean up
      await supabase.from("nfl_pickem_weeks").delete().eq("id", lockedWeek.id);
    });
  });
});
```

## 6.4 Manual Testing Checklist

### Pre-Deployment Testing

#### Week Navigation
- [ ] All 18 weeks display for current season
- [ ] Current week is highlighted
- [ ] Can navigate to previous weeks
- [ ] Can navigate to next weeks (if available)
- [ ] Week selector scrolls horizontally on mobile

#### Game Display
- [ ] Thursday Night games marked with 🏈
- [ ] Sunday games grouped under "Sunday Games"
- [ ] Monday Night games grouped under "Monday Night Football"
- [ ] Games sorted by kickoff time
- [ ] Correct teams displayed for each game

#### Pick Submission
- [ ] Can select a team (shows checkmark)
- [ ] Can deselect a team (checkmark disappears)
- [ ] Can change pick before lock
- [ ] Pick persists after page refresh
- [ ] Optimistic update shows immediately

#### Lock Mechanism
- [ ] Countdown timer displays correctly
- [ ] Timer counts down every second
- [ ] Shows "LOCKED" when time expires
- [ ] Cannot submit picks after lock
- [ ] Cannot change picks after lock
- [ ] Error message shown if attempting to pick after lock

#### Results Display
- [ ] Correct picks highlighted in green
- [ ] Incorrect picks highlighted in red
- [ ] Push games highlighted in yellow
- [ ] Final scores displayed
- [ ] Points earned shown

#### Weekly Summary
- [ ] Total picks count accurate
- [ ] Correct picks count accurate
- [ ] Points total accurate
- [ ] Accuracy percentage calculated correctly
- [ ] Progress bar animates

### Edge Cases

| Scenario | Test Steps | Expected Result |
|----------|------------|-----------------|
| No user ID | Visit page without logging in | Shows "Join a venue" message |
| No venue ID | Logged in but no venue | Shows "Join a venue" message |
| Empty week | Week with no games | Shows "No games scheduled" |
| Bye week | Week with no Thursday game | Lock time = first Sunday game |
| Thanksgiving | Week with 2 Thursday games | Lock time = earlier kickoff |
| Tie game | Game ends in tie | Pick marked as push |
| Postponed game | Game moved to different week | Handled gracefully |
| API failure | BDL API returns error | Shows error message, allows retry |

## 6.5 Performance Testing

### Load Testing Scenarios

```typescript
// tests/performance.nfl-pickem.test.ts
import { describe, it, expect } from "vitest";

describe("Performance Requirements", () => {
  it("weeks API responds in < 500ms", async () => {
    const start = performance.now();
    await fetch("http://localhost:3000/api/nfl-pickem/weeks?season=2024");
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });
  
  it("games API responds in < 1s", async () => {
    const weekId = "test-week-id";
    const start = performance.now();
    await fetch(`http://localhost:3000/api/nfl-pickem/games?weekId=${weekId}`);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1000);
  });
  
  it("pick submission responds in < 500ms", async () => {
    const start = performance.now();
    await fetch("http://localhost:3000/api/nfl-pickem/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "test",
        venueId: "test",
        weekId: "test",
        gameId: "test",
        pickTeam: "Test",
      }),
    });
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });
});
```

### Browser DevTools Testing

1. **Network Panel**
   - All API calls succeed (200/201)
   - Response times < 500ms
   - No duplicate requests

2. **Console Panel**
   - No JavaScript errors
   - No React warnings
   - No failed prop types

3. **Lighthouse**
   - Performance score > 90
   - Accessibility score > 95
   - Best Practices score > 90

## 6.6 Regression Testing

Ensure existing Pick 'Em still works:

- [ ] NBA picks still function
- [ ] MLB picks still function
- [ ] NHL picks still function
- [ ] Daily date picker still works
- [ ] Points bank shows correct totals
- [ ] Existing pick history displays

## 6.7 Test Data Setup

```sql
-- test-data.sql
-- Run this to set up test data for manual testing

-- Insert test weeks
INSERT INTO nfl_pickem_weeks (season, week_number, week_start_date, week_end_date, thursday_kickoff, status, games_count)
VALUES
  (2099, 1, '2099-09-05', '2099-09-09', '2099-09-05T20:20:00Z', 'upcoming', 16),
  (2099, 2, '2099-09-12', '2099-09-16', '2099-09-12T20:15:00Z', 'upcoming', 16),
  (2099, 3, '2099-09-19', '2099-09-23', '2099-09-19T20:15:00Z', 'open', 16);

-- Note: Games will be fetched from balldontlie API
-- If API doesn't have 2099 data, tests will need mock data
```

## 6.8 Bug Report Template

```markdown
## Bug Report: NFL Pick 'Em

**Phase**: [ ] 2-Database [ ] 3-Backend [ ] 4-Frontend [ ] 5-Logic

**Severity**: [ ] Critical [ ] High [ ] Medium [ ] Low

**Description**:
[Clear description of the bug]

**Steps to Reproduce**:
1. Go to...
2. Click...
3. Observe...

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happens]

**Screenshots**:
[If applicable]

**Environment**:
- Browser: [e.g., Chrome 120]
- OS: [e.g., macOS 14.2]
- Device: [e.g., iPhone 15 Pro]

**Console Errors**:
```
[Paste any console errors]
```
```

---

**Next**: Proceed to [Phase 7: Deployment](docs/NFL_PICKEM_PHASE7_DEPLOYMENT.md)
