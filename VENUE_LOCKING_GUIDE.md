# Visual Guide: Venue-Locked Accounts

This diagram illustrates how the venue-locked account system works.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Browser                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Supabase Anonymous Auth Session                    │   │
│  │  (Single auth_id stays same across all venues)      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Venue A     │ │  Venue B     │ │  Venue C     │
    │  Profile     │ │  Profile     │ │  Profile     │
    ├──────────────┤ ├──────────────┤ ├──────────────┤
    │ Username:    │ │ Username:    │ │ Username:    │
    │ "Player1"    │ │ "Player1"    │ │ "SuperStar"  │
    │              │ │              │ │              │
    │ Points: 500  │ │ Points: 0    │ │ Points: 0    │
    │              │ │              │ │              │
    │ Trivia: 10   │ │ Trivia: 0    │ │ Trivia: 0    │
    │ Predict: 5   │ │ Predict: 0   │ │ Predict: 0   │
    └──────────────┘ └──────────────┘ └──────────────┘
         │                │                │
         ▼                ▼                ▼
    Leaderboard A    Leaderboard B    Leaderboard C
```

## User Journey Example

### Step 1: First Visit - Sports Bar Downtown

```
1. User scans QR code
   📱 https://app.com/join?v=SPORTS_BAR_DT

2. Browser requests geolocation
   📍 Confirms user at venue coordinates

3. No profile for this venue found
   ❌ No existing account at SPORTS_BAR_DT

4. Username prompt appears
   💬 "Choose a username for Sports Bar Downtown"
   
5. User enters "Player1"
   ✅ Creates profile:
      - auth_id: abc123
      - username: "Player1"
      - venue_id: SPORTS_BAR_DT
      - points: 0

6. User plays trivia, makes predictions
   🎮 Earns 500 points

   Leaderboard at Sports Bar Downtown:
   🥇 SuperFan - 1000 pts
   🥈 QuizMaster - 750 pts
   🥉 Player1 - 500 pts  ← User appears here
```

### Step 2: Second Visit - Same Venue

```
1. User returns to Sports Bar Downtown
   📱 Scans same QR code

2. System checks for existing profile
   ✅ Found: auth_id abc123 + venue_id SPORTS_BAR_DT

3. Auto-login
   👤 Welcome back, Player1!
   💰 Your current points: 500

4. User continues playing
   🎮 Can answer more trivia, make predictions
```

### Step 3: New Venue - Coffee Shop Uptown

```
1. User visits different venue
   📱 https://app.com/join?v=COFFEE_UPTOWN

2. System checks for existing profile
   ❌ No profile found for auth_id abc123 + venue_id COFFEE_UPTOWN
   ✅ But auth session exists (same browser)

3. Username prompt appears
   💬 "Choose a username for Coffee Shop Uptown"
   ℹ️  "Note: This is a new venue. You'll start fresh!"

4. User can choose:
   Option A: Same username "Player1" ✅
   Option B: Different username "CoffeeLover" ✅
   
5. Let's say user picks "Player1" again
   ✅ Creates NEW profile:
      - auth_id: abc123 (same)
      - username: "Player1" (reused, but unique per venue)
      - venue_id: COFFEE_UPTOWN (different)
      - points: 0 (fresh start)

6. User now has TWO separate profiles:
   Profile 1: SPORTS_BAR_DT + Player1 (500 pts)
   Profile 2: COFFEE_UPTOWN + Player1 (0 pts)
```

## Database Structure

```sql
users table:
┌──────────┬──────────┬──────────────────┬──────────┬────────┐
│ auth_id  │ username │ venue_id         │ points   │   id   │
├──────────┼──────────┼──────────────────┼──────────┼────────┤
│ abc123   │ Player1  │ SPORTS_BAR_DT    │ 500      │ uuid-1 │
│ abc123   │ Player1  │ COFFEE_UPTOWN    │ 0        │ uuid-2 │
│ abc123   │ SuperStar│ VENUE_C          │ 0        │ uuid-3 │
│ xyz789   │ Player1  │ SPORTS_BAR_DT    │ 300      │ uuid-4 │
│ xyz789   │ Champion │ COFFEE_UPTOWN    │ 150      │ uuid-5 │
└──────────┴──────────┴──────────────────┴──────────┴────────┘

Constraint: UNIQUE(username, venue_id)
✅ Same auth_id can have multiple venues
✅ Same username can exist at different venues
❌ Duplicate (username + venue_id) not allowed
```

## Why This Design?

### ✅ Benefits

1. **Fair Competition**
   - Each venue has its own isolated leaderboard
   - No cross-venue advantage
   - Everyone starts equal at each location

2. **Privacy**
   - Users can use different identities at different venues
   - No global tracking across venues
   - Venue-specific reputation

3. **Venue Independence**
   - Venues can run their own competitions
   - No interference from other locations
   - Clean, focused leaderboards

4. **Simplicity**
   - No complex account linking
   - No cross-venue sync issues
   - Each venue is self-contained

### ❌ What's NOT Possible

1. ❌ Carry points between venues
2. ❌ Global leaderboard across all venues
3. ❌ Single username across all locations
4. ❌ View activity from other venues

## Common Scenarios

### Scenario 1: User forgets which username they used

```
Problem: User returns to venue but can't remember username
Solution: 
- They can create new account with different username
- Or admin can look up by recent activity
- System shows "Welcome back!" if profile exists
```

### Scenario 2: Username already taken at venue

```
User tries: "Champion" at SPORTS_BAR_DT
System checks: Is "Champion" + "SPORTS_BAR_DT" unique?
Result: ❌ Already exists
Message: "Username already taken at this venue. Try another."
```

### Scenario 3: Same username at different venues

```
User at Venue A: "Champion" ✅ Available
User at Venue B: "Champion" ✅ Available (different venue!)

Database:
- auth_id: abc123, username: "Champion", venue_id: VENUE_A
- auth_id: abc123, username: "Champion", venue_id: VENUE_B

Both valid! ✅
```

## Admin View

Admin dashboard groups by venue:

```
Admin Panel
├── Venue: Sports Bar Downtown
│   ├── Player1 (500 pts)
│   ├── QuizMaster (750 pts)
│   └── SuperFan (1000 pts)
│
├── Venue: Coffee Shop Uptown
│   ├── Player1 (0 pts)      ← Same username, different user profile
│   ├── CoffeeLover (200 pts)
│   └── Champion (150 pts)
│
└── Venue: Stadium Arena
    ├── SuperStar (50 pts)
    └── FanBoy (100 pts)
```

Admin can:
- ✅ Edit usernames within a venue
- ✅ Adjust points for specific venue profile
- ✅ View venue-specific leaderboards
- ✅ See all profiles (even if same auth_id)
- ❌ Cannot merge profiles across venues
- ❌ Cannot transfer points between venues

## Implementation Checklist

When coding this feature:

- [ ] Database: Add `UNIQUE(username, venue_id)` constraint
- [ ] Auth: Create `checkUsernameAtVenue(username, venueId)` function
- [ ] Auth: Create `getUserForVenue(venueId)` function
- [ ] UI: Show venue name in username prompt
- [ ] UI: Indicate "new venue, fresh start" message
- [ ] Testing: Test same username at different venues
- [ ] Testing: Test duplicate username at same venue (should fail)
- [ ] Testing: Test user switching between venues
- [ ] Admin: Group users by venue in admin panel
- [ ] Docs: Explain venue-locking to users in FAQ

## Troubleshooting

### Problem: User can't play at new venue
```
Cause: Trying to use same profile from different venue
Fix: Prompt user to create new account for this venue
```

### Problem: Leaderboard shows wrong users
```
Cause: Not filtering by venue_id
Fix: Always include WHERE venue_id = ? in leaderboard queries
```

### Problem: Username validation fails incorrectly
```
Cause: Checking global uniqueness instead of per-venue
Fix: Use checkUsernameAtVenue(username, venueId) not just checkUsername(username)
```

---

**Remember:** One auth session, multiple venue profiles! 🎯
