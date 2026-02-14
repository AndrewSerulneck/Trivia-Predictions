# Amendment Summary

## Changes Made to Implementation Phases

This document summarizes the three key amendments made to the original implementation plan based on updated requirements.

---

## 1. Display Probabilities as Percentages (Not American Odds)

### Original Approach
- Convert probabilities to American Odds format (e.g., -110, +250)
- Required `/lib/odds.ts` with `probabilityToAmericanOdds()` function
- More complex display logic

### New Approach ✅
- Display probabilities as **percentages** (e.g., "67.5%", "33.2%")
- Use `/lib/predictions.ts` with simple `formatProbability()` function
- Points calculation remains: **Points = 100 - P%**

### Implementation Changes
- **Phase 1**: Created `/lib/predictions.ts` instead of `/lib/odds.ts`
- **Phase 6**: Removed American Odds conversion from Polymarket integration
- **Phase 12**: Updated test cases to verify percentage display

### Code Example
```typescript
// lib/predictions.ts
export function formatProbability(probability: number): string {
  return `${probability.toFixed(1)}%`
}

export function calculatePoints(probability: number): number {
  return 100 - probability
}
```

---

## 2. Use Only Polymarket API (Remove TheOdds API)

### Original Approach
- Integrate both Polymarket API and TheOdds API
- Create JSON mapping files between APIs
- Sync sports events across platforms
- Required `/lib/theodds.ts`

### New Approach ✅
- Use **Polymarket API exclusively**
- No TheOdds API integration needed
- Simpler architecture, fewer dependencies
- Reduced implementation time

### Implementation Changes
- **Phase 6**: Removed `/lib/theodds.ts` creation
- **Phase 6**: Removed JSON mapping and sync logic
- **Phase 6**: Reduced from 3-4 hours to 2-3 hours
- **Phase 13**: Removed `THEODDS_API_KEY` from environment variables
- **Overall**: Reduced total time from 27-38 hours to 25-36 hours

### Environment Variables
```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
POLYMARKET_API_KEY=your-polymarket-key
# THEODDS_API_KEY=removed ❌
```

---

## 3. Venue-Locked Accounts (One Account Per Venue)

### Original Approach
- Global username uniqueness
- One user account across all venues
- User maintains same identity everywhere

### New Approach ✅
- **Venue-specific accounts**
- Username uniqueness **per venue** (not global)
- Users must create **new account at each venue**
- Fair competition within venue leaderboards

### Why This Matters
- Prevents cross-venue gaming/cheating
- Each venue has its own isolated leaderboard
- Users start fresh at each location
- Same username can be reused at different venues

### Implementation Changes

#### Database Schema (Phase 2)
```sql
-- Before
CREATE TABLE users (
  username TEXT UNIQUE NOT NULL,
  venue_id TEXT NOT NULL,
  ...
);

-- After ✅
CREATE TABLE users (
  username TEXT NOT NULL,
  venue_id TEXT NOT NULL,
  ...
  UNIQUE(username, venue_id)  -- Composite unique constraint
);
```

#### Authentication Flow (Phase 3)
```typescript
// lib/auth.ts - Before
checkUsername(username: string)

// After ✅
checkUsernameAtVenue(username: string, venueId: string)
getUserForVenue(venueId: string)
```

#### Join Flow (Phase 3)
1. User scans QR code for Venue A → `/join?v=VENUE_A`
2. Creates account with username "Player1"
3. Plays trivia, makes predictions, appears on Venue A leaderboard
4. Later, user scans QR code for Venue B → `/join?v=VENUE_B`
5. **Must create new account** (can reuse "Player1" or choose different name)
6. New separate profile for Venue B leaderboard

#### Test Cases (Phase 12)
- [ ] Can join via QR code
- [ ] Username validation works
- [ ] Duplicate usernames are rejected **per venue** ✅
- [ ] Same username can be used at **different venues** ✅
- [ ] User persists on page refresh
- [ ] User switching venues requires **new account** ✅

---

## Migration Guide

If you've already started implementing based on the original plan, here's how to migrate:

### Step 1: Update Database Schema
```sql
-- Remove global username constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

-- Add venue-specific constraint
ALTER TABLE users ADD CONSTRAINT users_username_venue_unique UNIQUE(username, venue_id);
```

### Step 2: Update Auth Functions
- Rename `checkUsername()` → `checkUsernameAtVenue(username, venueId)`
- Add `getUserForVenue(venueId)` to check existing venue profiles
- Update join flow to check venue-specific accounts

### Step 3: Update Predictions Display
- Remove American Odds conversion functions
- Replace with simple percentage formatting: `${probability.toFixed(1)}%`
- Update UI components to show percentages

### Step 4: Remove TheOdds Integration
- Delete `/lib/theodds.ts` if created
- Remove any TheOdds API calls
- Update environment variables
- Remove JSON mapping files

---

## Benefits of These Changes

### Simpler Implementation
- ❌ No American Odds math → ✅ Simple percentage display
- ❌ No TheOdds API → ✅ Single API dependency
- ⏱️ Saves 2-3 hours of development time

### Better User Experience
- ✅ Percentages are more intuitive than odds
- ✅ Cleaner, easier to understand UI
- ✅ Faster page loads (fewer API calls)

### Fair Competition
- ✅ Each venue has isolated leaderboard
- ✅ No cross-venue gaming
- ✅ Fresh start at each location encourages new visitors

---

## Questions & Considerations

### Can users link accounts across venues?
Not in this implementation. Each venue account is independent. Future enhancement could add optional account linking.

### What if user forgets which username they used at a venue?
They can create a new account with a different username. Admin can help resolve conflicts if needed.

### Do points carry over between venues?
No. Points are venue-specific and don't transfer.

### Can admin see a user's activity across all venues?
Admin can see all venues but each venue's users are separate records in the database.

---

## Summary

These three amendments simplify the implementation while improving user experience and competitive fairness:

1. ✅ **Percentages** - Simpler, more intuitive
2. ✅ **Polymarket Only** - Fewer dependencies, faster development
3. ✅ **Venue-Locked** - Fair competition, clean leaderboards

Total implementation time reduced from **27-38 hours** to **25-36 hours**.
