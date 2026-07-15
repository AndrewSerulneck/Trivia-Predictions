# Phase 7: Deployment & Monitoring

## 7.1 Pre-Deployment Checklist

### Code Quality
- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] ESLint passes (`npm run lint`)
- [ ] No `console.log` statements in production code
- [ ] All TODO comments resolved

### Database
- [ ] Migrations tested locally
- [ ] Rollback scripts tested
- [ ] Indexes created and verified
- [ ] RLS policies tested
- [ ] Production database backed up

### Environment Variables
```bash
# Required environment variables for production:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
BALLDONTLIE_API_KEY=your-api-key
CRON_SECRET=your-cron-secret
NFL_PICKEM_ENABLED=true
```

## 7.2 Deployment Steps

### Step 1: Database Migration (Production)

```bash
# 1. Connect to production Supabase
supabase link --project-ref your-project-ref

# 2. Run migrations in order
supabase migration up 20260715000000_add_nfl_pickem_weeks.sql
supabase migration up 20260715000100_add_nfl_pickem_user_weeks.sql
supabase migration up 20260715000200_add_nfl_pickem_game_types.sql

# 3. Verify migrations applied
supabase migration list

# 4. Verify tables created
supabase db query "SELECT * FROM nfl_pickem_weeks LIMIT 1;"
```

### Step 2: Sync Initial NFL Data

```bash
# Run the sync job locally pointed at production
# (Or run via API call with proper auth)

curl "https://your-app.vercel.app/api/cron/nfl-week-sync" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Step 3: Deploy to Vercel

```bash
# 1. Deploy to preview first
vercel --prod=false

# 2. Test preview deployment thoroughly
# - Navigate to /nfl-pickem
# - Test week selection
# - Test pick submission
# - Verify lock countdown

# 3. Deploy to production
vercel --prod
```

### Step 4: Configure Cron Jobs

Add to `vercel.json`:

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
    },
    {
      "path": "/api/cron/nfl-grade",
      "schedule": "0 6 * * 2"
    }
  ]
}
```

Deploy to apply cron changes:
```bash
vercel --prod
```

## 7.3 Feature Flags

### Gradual Rollout

```typescript
// lib/featureFlags.ts
export const FEATURES = {
  NFL_PICKEM: {
    enabled: process.env.NFL_PICKEM_ENABLED === "true",
    rolloutPercentage: 100, // Start at 0, increase gradually
  },
};

export function isFeatureEnabled(feature: keyof typeof FEATURES, userId?: string): boolean {
  const config = FEATURES[feature];
  if (!config.enabled) return false;
  
  if (config.rolloutPercentage >= 100) return true;
  if (config.rolloutPercentage <= 0) return false;
  
  // Consistent rollout based on user ID
  if (!userId) return false;
  const hash = userId.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  return (hash % 100) < config.rolloutPercentage;
}
```

### Usage in Components

```typescript
// components/nfl-pickem/NFLPickEmGameList.tsx
import { isFeatureEnabled } from "@/lib/featureFlags";

export function NFLPickEmGameList({ userId }: { userId: string }) {
  if (!isFeatureEnabled("NFL_PICKEM", userId)) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-400">NFL Pick 'Em coming soon!</p>
      </div>
    );
  }
  
  // ... rest of component
}
```

## 7.4 Monitoring

### Key Metrics to Track

```typescript
// lib/analytics/nflPickEm.ts

type NFLPickEmEvent =
  | { type: "week_viewed"; weekNumber: number }
  | { type: "pick_submitted"; weekNumber: number; gameId: string }
  | { type: "pick_cleared"; weekNumber: number; gameId: string }
  | { type: "lock_reached"; weekNumber: number }
  | { type: "error"; error: string; context: string };

export function trackNFLPickEm(event: NFLPickEmEvent) {
  // Send to your analytics provider
  console.log("[NFL Pick 'Em]", event);
  
  // Example: Vercel Analytics
  // import { track } from '@vercel/analytics';
  // track('nfl_pickem_' + event.type, event);
}
```

### Dashboard Queries

```sql
-- Active users per week
SELECT 
  w.week_number,
  COUNT(DISTINCT uw.user_id) as active_users,
  SUM(uw.picks_count) as total_picks,
  AVG(uw.correct_picks::float / NULLIF(uw.picks_count, 0)) as avg_accuracy
FROM nfl_pickem_weeks w
LEFT JOIN nfl_pickem_user_weeks uw ON w.id = uw.nfl_week_id
WHERE w.season = 2024
GROUP BY w.week_number
ORDER BY w.week_number;

-- Pick distribution (which teams are picked more)
SELECT 
  selected_team,
  COUNT(*) as pick_count
FROM pickem_picks
WHERE sport_slug = 'nfl'
  AND created_at > '2024-09-01'
GROUP BY selected_team
ORDER BY pick_count DESC
LIMIT 20;

-- Error tracking (failed pick submissions)
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as error_count,
  error_message
FROM error_logs
WHERE path LIKE '%nfl-pickem%'
GROUP BY hour, error_message
ORDER BY hour DESC;
```

### Alerting Rules

| Metric | Threshold | Action |
|--------|-----------|--------|
| API error rate | > 5% | Page on-call engineer |
| Pick submission latency | > 2s | Investigate database |
| Week sync failure | Any | Manual sync required |
| Lock time incorrect | User reports | Immediate hotfix |

## 7.5 Rollback Plan

### Quick Rollback (Feature Flag)

```bash
# Disable feature immediately
vercel env add NFL_PICKEM_ENABLED production false
vercel --prod
```

### Database Rollback

```bash
# If migration caused issues, revert:
supabase migration revert 20260715000200_add_nfl_pickem_game_types.sql
supabase migration revert 20260715000100_add_nfl_pickem_user_weeks.sql
supabase migration revert 20260715000000_add_nfl_pickem_weeks.sql
```

### Code Rollback

```bash
# Revert to previous deployment
vercel rollback [previous-deployment-id]
```

## 7.6 Post-Deployment Verification

### Smoke Tests

```bash
#!/bin/bash
# smoke-tests.sh

BASE_URL="https://your-app.vercel.app"

echo "Testing NFL Pick 'Em endpoints..."

# Test weeks endpoint
response=$(curl -s "$BASE_URL/api/nfl-pickem/weeks?season=2024")
if echo "$response" | grep -q '"ok":true'; then
  echo "✓ Weeks endpoint OK"
else
  echo "✗ Weeks endpoint FAILED"
  exit 1
fi

# Test games endpoint (needs valid week ID)
week_id=$(echo "$response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
response=$(curl -s "$BASE_URL/api/nfl-pickem/games?weekId=$week_id")
if echo "$response" | grep -q '"ok":true'; then
  echo "✓ Games endpoint OK"
else
  echo "✗ Games endpoint FAILED"
  exit 1
fi

echo "All smoke tests passed!"
```

### Manual Verification Checklist

- [ ] Navigate to `/nfl-pickem` - page loads
- [ ] Week selector shows current week
- [ ] Can select a different week
- [ ] Games display correctly
- [ ] Can make a pick
- [ ] Pick persists after refresh
- [ ] Lock countdown displays
- [ ] Weekly summary shows stats

## 7.7 Documentation Updates

### User Documentation

Update `/app/info/page.tsx` or FAQs:

```markdown
## NFL Pick 'Em

### How to Play
1. Navigate to NFL Pick 'Em from the venue hub
2. Select the current week
3. Pick winners for all games
4. Submit before Thursday Night Football kickoff

### Scoring
- 10 points per correct pick
- All picks lock at Thursday Night kickoff
- View past weeks to see your results

### Important Dates
- Week starts: Thursday
- Picks lock: Thursday Night Football kickoff
- Week ends: Monday Night Football
```

### API Documentation

```markdown
## NFL Pick 'Em API

### GET /api/nfl-pickem/weeks
Returns all NFL weeks for a season.

Query Parameters:
- season (number): Season year (default: current year)
- includeComplete (boolean): Include completed weeks

Response:
{
  "ok": true,
  "weeks": [...],
  "currentWeekId": "..."
}

### GET /api/nfl-pickem/games
Returns games for a specific week.

Query Parameters:
- weekId (string, required): Week ID
- userId (string, optional): Filter by user
- venueId (string, optional): Filter by venue

### POST /api/nfl-pickem/picks
Submit or clear a pick.

Body:
{
  "userId": "...",
  "venueId": "...",
  "weekId": "...",
  "gameId": "...",
  "pickTeam": "..."  // Omit or use action="clear" to remove
}
```

## 7.8 Success Criteria

### Launch Day Checklist

- [ ] Feature flag enabled for 100% of users
- [ ] All monitoring dashboards active
- [ ] On-call engineer notified
- [ ] Rollback plan documented and accessible
- [ ] Support team briefed on common issues

### Week 1 Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Daily active users | > 50 | |
| Pick submission rate | > 80% | |
| Average picks per user | > 10 | |
| Error rate | < 1% | |
| Support tickets | < 5 | |

---

**NFL Pick 'Em Implementation Complete!**

All phases documented. Ready for implementation.
