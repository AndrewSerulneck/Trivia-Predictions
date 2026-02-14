# Implementation Phases for "The Local Edge"

This document breaks down the project into manageable phases that can be completed incrementally using Codex in VS Code.

---

## 🔑 Key Design Decisions

### 1. **Probability Display: Percentages Only**
- Prediction probabilities are displayed as **percentages** (e.g., "67.5%", "33.2%")
- No American Odds conversion required
- Points calculation remains: **Points = 100 - P%**

### 2. **API Integration: Polymarket Only**
- Use **Polymarket API** exclusively for prediction markets
- **No TheOdds API integration** needed
- Simpler implementation, fewer dependencies

### 3. **Venue-Locked Accounts**
- Users can only have **one account per venue**
- Username uniqueness is enforced **per venue** (not globally)
- When visiting a new venue, users **must create a new account** with a new username
- This ensures fair competition within each venue's leaderboard
- Database schema: `UNIQUE(username, venue_id)` constraint

### 4. **Advertising Integration**
- **6 designated ad slots** strategically placed throughout the application
- Non-intrusive, mobile-responsive ad placements
- First-party tracking for impressions and clicks
- Admin interface for managing advertisements
- Support for venue-specific and global advertising
- See [ADVERTISING_GUIDE.md](./ADVERTISING_GUIDE.md) for complete implementation details

---

## Phase 0: Project Setup & Configuration (30-45 minutes)

### Goal
Set up Next.js with TypeScript, Tailwind CSS, and Supabase.

### Tasks
1. **Initialize Next.js Project**
   ```bash
   npm init -y
   npm install next@latest react@latest react-dom@latest
   npm install -D typescript @types/react @types/node @types/react-dom
   npm install -D tailwindcss postcss autoprefixer
   npm install -D eslint eslint-config-next
   npx tailwindcss init -p
   ```

2. **Install Core Dependencies**
   ```bash
   npm install @supabase/supabase-js
   npm install qrcode.react lucide-react date-fns
   ```

3. **Create Configuration Files**
   - `tsconfig.json` - TypeScript configuration
   - `next.config.ts` - Next.js configuration
   - `tailwind.config.ts` - Tailwind CSS configuration
   - `postcss.config.mjs` - PostCSS configuration
   - `.env.local` - Environment variables (Supabase keys)

4. **Update package.json Scripts**
   ```json
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
     "lint": "next lint"
   }
   ```

5. **Create Directory Structure**
   ```
   /app
     /api
       /trivia
       /predictions
       /venues
       /admin
     /join
     /trivia
     /predictions
     /activity
     /leaderboard
     /admin
   /components
     /ui
   /lib
   /types
   /public
   ```

### Validation
- Run `npm run dev` and verify Next.js starts on http://localhost:3000
- No TypeScript or build errors

---

## Phase 1: Type Definitions & Core Utilities (1-2 hours)

### Goal
Create TypeScript interfaces and utility functions for data management.

### Tasks
1. **Create `/types/index.ts`**
   - Define interfaces for: User, Venue, TriviaQuestion, TriviaAnswer, Prediction, PredictionOutcome, UserPrediction, LeaderboardEntry, Notification
   - **Add advertising types**: Advertisement, AdSlotConfig (see [ADVERTISING_GUIDE.md](./ADVERTISING_GUIDE.md) for complete type definitions)

2. **Create `/lib/supabase.ts`**
   - Initialize Supabase client
   - Export client for use across the app
   ```typescript
   import { createClient } from '@supabase/supabase-js'
   export const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
   )
   ```

3. **Create `/lib/storage.ts`**
   - LocalStorage helpers for: user data, trivia answers, predictions, notifications
   - Functions: `getUser()`, `saveUser()`, `getTriviaAnswers()`, `saveTriviaAnswer()`, `canAnswerTrivia()`, `getUserPredictions()`, etc.

4. **Create `/lib/geolocation.ts`**
   - Geolocation utilities: `getCurrentLocation()`, `calculateDistance()`, `isUserAtVenue()`, `watchVenueLocation()`
   - Use Haversine formula for distance calculation

5. **Create `/lib/predictions.ts`**
   - Utility functions for predictions and probability display
   ```typescript
   export function formatProbability(probability: number): string {
     return `${probability.toFixed(1)}%`
   }
   
   export function calculatePoints(probability: number): number {
     return 100 - probability
   }
   ```

### Validation
- All files compile without TypeScript errors
- Test utility functions in isolation

---

## Phase 2: Supabase Database Schema (1 hour)

### Goal
Set up Supabase tables and RLS policies.

### Tasks
1. **Create Supabase Tables** (via Supabase Dashboard SQL Editor)
   
   ```sql
   -- Users table
   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     auth_id UUID REFERENCES auth.users(id),
     username TEXT NOT NULL,
     venue_id TEXT NOT NULL,
     points INTEGER DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE(username, venue_id)
   );
   
   -- Venues table
   CREATE TABLE venues (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     latitude DECIMAL(10, 8) NOT NULL,
     longitude DECIMAL(11, 8) NOT NULL,
     radius INTEGER NOT NULL DEFAULT 100,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Trivia questions table
   CREATE TABLE trivia_questions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     question TEXT NOT NULL,
     options JSONB NOT NULL,
     correct_answer INTEGER NOT NULL,
     category TEXT,
     difficulty TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Trivia answers table
   CREATE TABLE trivia_answers (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id),
     question_id UUID REFERENCES trivia_questions(id),
     answer INTEGER NOT NULL,
     is_correct BOOLEAN NOT NULL,
     time_elapsed INTEGER NOT NULL,
     answered_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- User predictions table
   CREATE TABLE user_predictions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id),
     prediction_id TEXT NOT NULL,
     outcome_id TEXT NOT NULL,
     outcome_title TEXT NOT NULL,
     points INTEGER NOT NULL,
     status TEXT DEFAULT 'pending',
     created_at TIMESTAMPTZ DEFAULT NOW(),
     resolved_at TIMESTAMPTZ
   );
   
   -- Notifications table
   CREATE TABLE notifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id),
     message TEXT NOT NULL,
     type TEXT NOT NULL,
     read BOOLEAN DEFAULT FALSE,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Advertisements table
   CREATE TABLE advertisements (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slot TEXT NOT NULL CHECK (slot IN ('header', 'inline-content', 'sidebar', 'mid-content', 'leaderboard-sidebar', 'footer')),
     venue_id TEXT REFERENCES venues(id),
     advertiser_name TEXT NOT NULL,
     image_url TEXT NOT NULL,
     click_url TEXT NOT NULL,
     alt_text TEXT NOT NULL,
     width INTEGER NOT NULL,
     height INTEGER NOT NULL,
     active BOOLEAN DEFAULT TRUE,
     start_date TIMESTAMPTZ NOT NULL,
     end_date TIMESTAMPTZ,
     impressions INTEGER DEFAULT 0,
     clicks INTEGER DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Create indexes
   CREATE INDEX idx_users_venue ON users(venue_id);
   CREATE INDEX idx_trivia_answers_user ON trivia_answers(user_id);
   CREATE INDEX idx_trivia_answers_time ON trivia_answers(answered_at);
   CREATE INDEX idx_predictions_user ON user_predictions(user_id);
   CREATE INDEX idx_notifications_user ON notifications(user_id);
   CREATE INDEX idx_ads_slot ON advertisements(slot);
   CREATE INDEX idx_ads_venue ON advertisements(venue_id);
   CREATE INDEX idx_ads_active ON advertisements(active);
   ```

2. **Enable Row Level Security (RLS)**
   ```sql
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE trivia_answers ENABLE ROW LEVEL SECURITY;
   ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
   ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;
   
   -- Users can read their own data
   CREATE POLICY "Users can read own data" ON users FOR SELECT USING (auth_id = auth.uid());
   CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth_id = auth.uid());
   
   -- Users can read/write their own answers
   CREATE POLICY "Users can read own answers" ON trivia_answers FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
   CREATE POLICY "Users can insert own answers" ON trivia_answers FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
   
   -- Anyone can view active ads
   CREATE POLICY "Anyone can view active ads" ON advertisements 
     FOR SELECT USING (active = TRUE AND start_date <= NOW() AND (end_date IS NULL OR end_date >= NOW()));
   
   -- Only admins can manage ads
   CREATE POLICY "Admins can manage ads" ON advertisements 
     FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = TRUE));
   
   -- Similar policies for predictions and notifications
   ```

3. **Seed Initial Data**
   - Add 2-3 test venues
   - Add 50+ trivia questions across categories
   - **Optionally add sample advertisements** for testing (see [ADVERTISING_GUIDE.md](./ADVERTISING_GUIDE.md))

### Validation
- Run queries in Supabase to verify tables exist
- Test RLS policies work correctly

---

## Phase 3: Anonymous Authentication & User Management (2-3 hours)

### Goal
Implement anonymous authentication and username selection.

### Tasks
1. **Create `/app/join/page.tsx`**
   - QR code entry point (reads `?v=VENUE_ID` from URL)
   - Check if user already has a profile for THIS specific venue
   - If user has account at different venue, require new username for this venue
   - If not, trigger anonymous sign-in via Supabase
   - Prompt for username (must be unique per venue)
   - Verify geolocation at venue
   - Save user to database and LocalStorage
   - Redirect to `/trivia` or `/predictions`

2. **Create `/components/UsernameModal.tsx`**
   - Modal form for username input
   - Validation: 3-20 characters, alphanumeric + underscore
   - Check uniqueness against Supabase for THIS venue only
   - Submit and create user record

3. **Create `/lib/auth.ts`**
   - `signInAnonymously()` - Create anonymous Supabase session
   - `checkUsernameAtVenue(username: string, venueId: string)` - Check if username is available at specific venue
   - `createUser(username: string, venueId: string)` - Create user in DB
   - `getUserForVenue(venueId: string)` - Get current user's profile for specific venue
   - `getCurrentUser()` - Get current user from session + DB

4. **Create Auth Context `/lib/AuthContext.tsx`**
   - Wrap app to provide user state globally
   - Handle session persistence
   - Sync with LocalStorage

### Validation
- Test joining via `/join?v=TEST_VENUE`
- Verify anonymous session is created
- Confirm username is saved to Supabase for specific venue
- Test joining a second venue - should require new username
- Check LocalStorage contains user data per venue

---

## Phase 4: Geolocation & Geo-Fencing (1-2 hours)

### Goal
Lock gameplay to on-site users only.

### Tasks
1. **Create `/components/LocationGuard.tsx`**
   - Wrapper component that checks user location
   - Request geolocation permission
   - Verify user is within venue radius
   - Show "locked" UI if not at venue
   - Allow viewing history/leaderboard only

2. **Create `/lib/venue.ts`**
   - `getVenueById(venueId: string)` - Fetch venue from Supabase
   - `verifyUserAtVenue(venueId: string)` - Check if user is at venue
   - Cache venue data in LocalStorage

3. **Update Pages to Use LocationGuard**
   - Wrap `/trivia` and `/predictions` pages
   - Show lock icon and message when not at venue

### Validation
- Test with real device GPS
- Verify gameplay is blocked when coordinates don't match
- Confirm leaderboard is still accessible

---

## Phase 5: Trivia Module (3-4 hours)

### Goal
Build the trivia gameplay system with timer and scoring.

### Tasks
1. **Create `/app/trivia/page.tsx`**
   - Fetch random trivia question from Supabase
   - Exclude questions user has already answered
   - Display question with 4 options
   - Show 10-second countdown timer
   - Handle answer submission
   - Calculate and award points
   - Show remaining questions (out of 10/hr)

2. **Create `/components/TriviaCard.tsx`**
   - Question display component
   - Multiple choice buttons
   - Visual timer (progress bar or countdown)
   - Submit answer handler

3. **Create `/components/TriviaResult.tsx`**
   - Show correct/incorrect result
   - Display points earned
   - Button to next question

4. **Create `/app/api/trivia/question/route.ts`**
   - API endpoint to fetch random question
   - Filter out previously answered questions
   - Return question data

5. **Create `/app/api/trivia/answer/route.ts`**
   - API endpoint to submit answer
   - Validate answer is correct
   - Award 100 points if correct
   - Save to `trivia_answers` table
   - Update user points

6. **Implement Rate Limiting Logic**
   - Check user has answered < 10 questions in last hour
   - Show "comeback later" message if limit reached

### Validation
- Answer 10 questions successfully
- Verify 11th attempt is blocked
- Check points are awarded correctly
- Confirm timer works accurately

---

## Phase 6: Polymarket API Integration (2-3 hours)

### Goal
Fetch and display prediction markets with percentage probabilities.

### Tasks
1. **Create `/lib/polymarket.ts`**
   - `fetchMarkets()` - Get active markets from Polymarket API
   - `getMarketDetails(marketId: string)` - Get specific market
   - Parse outcomes and probabilities
   - Keep probabilities as percentages (no conversion needed)

2. **Create `/app/predictions/page.tsx`**
   - Display list of active prediction markets
   - Filter by category (Sports, Politics, Entertainment, etc.)
   - Show percentage probability for each outcome
   - Show potential points (100 - P%)

3. **Create `/components/PredictionCard.tsx`**
   - Market title and description
   - List of outcomes with percentage probabilities
   - "Make Prediction" button for each outcome
   - End time countdown

4. **Create `/app/api/predictions/route.ts`**
   - API endpoint to fetch markets
   - Cache results to reduce API calls
   - Return formatted data with percentage probabilities

5. **Create `/app/api/predictions/submit/route.ts`**
   - API endpoint to submit user prediction
   - Save to `user_predictions` table
   - Don't award points yet (pending resolution)

### Validation
- Verify markets load from Polymarket
- Check percentage probabilities displayed correctly
- Test submitting predictions
- Confirm predictions are saved with status "pending"

---

## Phase 7: My Activity Dashboard (2-3 hours)

### Goal
Show user's pending and historical activity.

### Tasks
1. **Create `/app/activity/page.tsx`**
   - Tabbed interface: Pending | History
   - Pending tab: Active predictions not yet resolved
   - History tab: Past trivia answers and resolved predictions

2. **Create `/components/PendingPredictions.tsx`**
   - List of user's pending predictions
   - Show market, outcome chosen, potential points
   - Show end time or "Waiting for resolution"

3. **Create `/components/ActivityHistory.tsx`**
   - Combined log of trivia and prediction results
   - Show date, type (trivia/prediction), result (correct/incorrect, won/lost), points earned
   - Sortable/filterable by date or type

4. **Create `/app/api/activity/route.ts`**
   - Fetch user's trivia answers and predictions
   - Combine and sort by date
   - Return formatted activity feed

### Validation
- Submit trivia answers and predictions
- Check both appear in respective tabs
- Verify data is accurate and up-to-date

---

## Phase 8: Notification System (2 hours)

### Goal
Alert users when predictions resolve while they were away.

### Tasks
1. **Create `/components/NotificationBell.tsx`**
   - Bell icon in header
   - Badge showing unread count
   - Dropdown showing recent notifications
   - Click to mark as read

2. **Create `/lib/notifications.ts`**
   - `createNotification(userId, message, type)` - Add notification
   - `getUnreadNotifications(userId)` - Fetch unread
   - `markAsRead(notificationId)` - Mark notification read
   - `markAllAsRead(userId)` - Mark all read

3. **Create `/app/api/notifications/route.ts`**
   - API to fetch user notifications
   - Return unread count

4. **Implement Prediction Resolution Logic**
   - Background job or manual admin action resolves predictions
   - When resolved, create notification for each user
   - Example: "Your prediction on 'Lakers vs. Celtics' resolved. +45 points!"

5. **Add Real-Time Updates (Optional)**
   - Use Supabase Realtime subscriptions
   - Listen for new notifications
   - Update bell badge in real-time

### Validation
- Manually resolve a prediction in Supabase
- Check notification appears in bell dropdown
- Verify unread count updates
- Test marking as read

---

## Phase 9: Venue Leaderboards (2 hours)

### Goal
Show top scorers at each venue.

### Tasks
1. **Create `/app/leaderboard/page.tsx`**
   - Display current venue's leaderboard
   - Show rank, username, total points
   - Highlight current user
   - Auto-refresh periodically

2. **Create `/components/LeaderboardTable.tsx`**
   - Responsive table/list component
   - Top 10 or top 20 users
   - Trophy icons for top 3

3. **Create `/app/api/leaderboard/route.ts`**
   - Query users by venue_id
   - Order by points DESC
   - Return top N users with rank

### Validation
- Check leaderboard shows correct users for venue
- Verify points are accurate
- Test with multiple users

---

## Phase 10: Admin Dashboard (3-4 hours)

### Goal
Global admin can manage users, points by venue, and advertisements.

### Tasks
1. **Create `/app/admin/page.tsx`**
   - Admin login/auth check (use Supabase RLS or custom logic)
   - List all venues
   - Click venue to see its users
   - **Link to advertisement management**

2. **Create `/app/admin/[venueId]/page.tsx`**
   - Show all users at specific venue
   - Display username, points, join date
   - Edit buttons for username and points

3. **Create `/components/UserEditModal.tsx`**
   - Modal to edit username or points
   - Input validation
   - Submit to API

4. **Create `/app/api/admin/users/[userId]/route.ts`**
   - PUT endpoint to update user
   - Validate admin permissions
   - Update username or points in Supabase

5. **Implement Admin Authentication**
   - Add `is_admin` boolean column to users table
   - Create RLS policy allowing admins to UPDATE any user
   - Check admin status in API routes

6. **Create `/app/admin/ads/page.tsx`** (New for advertising)
   - List all advertisements with metrics (impressions, clicks, CTR)
   - Add/Edit/Delete advertisement functionality
   - Filter by slot, venue, status
   - See [ADVERTISING_GUIDE.md](./ADVERTISING_GUIDE.md) for complete implementation

7. **Create advertising API routes**
   - `/app/api/ads/route.ts` - Get ads for slot
   - `/app/api/ads/impression/route.ts` - Track impression
   - `/app/api/ads/click/route.ts` - Track click
   - `/app/api/admin/ads/route.ts` - CRUD operations for ads

### Validation
- Log in as admin
- Navigate to venue page
- Edit a user's username and points
- Verify changes persist in database
- **Navigate to ad management page**
- **Add/edit advertisements and verify they appear in correct slots**
- **Test impression and click tracking**

---

## Phase 11: UI/UX Polish (2-3 hours)

### Goal
Mobile-first responsive design with Tailwind CSS.

### Tasks
1. **Create Global Layout `/app/layout.tsx`**
   - Header with logo, notification bell, user points
   - **Header banner ad (Ad Slot 1)**
   - Bottom navigation (Trivia, Predictions, Activity, Leaderboard)
   - **Footer banner ad (Ad Slot 6)**
   - Mobile-optimized spacing

2. **Create Shared Components**
   - `/components/ui/Button.tsx` - Reusable button styles
   - `/components/ui/Card.tsx` - Card container
   - `/components/ui/Modal.tsx` - Modal overlay
   - `/components/ui/Badge.tsx` - Badge for notifications
   - `/components/ui/Timer.tsx` - Countdown timer component
   - **`/components/AdBanner.tsx` - Advertisement component (see [ADVERTISING_GUIDE.md](./ADVERTISING_GUIDE.md))**

3. **Add Custom Styles `/app/globals.css`**
   - Import Tailwind directives
   - Custom CSS variables for brand colors
   - Mobile-first breakpoints
   - Dark mode support (optional)
   - **Ad container styles for consistent spacing**

4. **Create Loading & Error States**
   - `/app/loading.tsx` - Global loading spinner
   - `/app/error.tsx` - Error boundary
   - Skeleton loaders for data fetching

5. **Accessibility**
   - ARIA labels on interactive elements
   - Keyboard navigation support
   - Focus states on buttons/inputs

### Validation
- Test on mobile device (Chrome DevTools mobile view)
- Verify all pages are responsive
- Check accessibility with Lighthouse

---

## Phase 12: Testing & QA (2-3 hours)

### Goal
Ensure all features work correctly and handle edge cases.

### Test Cases
1. **Authentication**
   - [ ] Can join via QR code
   - [ ] Username validation works
   - [ ] Duplicate usernames are rejected per venue
   - [ ] Same username can be used at different venues
   - [ ] User persists on page refresh
   - [ ] User switching venues requires new account

2. **Geolocation**
   - [ ] Location permission is requested
   - [ ] Gameplay locked when not at venue
   - [ ] Can view leaderboard when locked
   - [ ] Unlocks when at venue

3. **Trivia**
   - [ ] Questions load correctly
   - [ ] Timer counts down accurately
   - [ ] Correct answers award 100 points
   - [ ] Cannot answer same question twice
   - [ ] Rate limit (10/hr) enforced

4. **Predictions**
   - [ ] Markets load from Polymarket
   - [ ] Percentage probabilities displayed correctly
   - [ ] Points calculation (100 - P%) is correct
   - [ ] Predictions saved as "pending"
   - [ ] Can view pending predictions in Activity

5. **Notifications**
   - [ ] Bell shows unread count
   - [ ] Notifications appear when predictions resolve
   - [ ] Can mark as read
   - [ ] Real-time updates work (if implemented)

6. **Leaderboard**
   - [ ] Shows users from same venue
   - [ ] Sorted by points correctly
   - [ ] Current user is highlighted

7. **Admin**
   - [ ] Admin can access dashboard
   - [ ] Can edit usernames
   - [ ] Can adjust points
   - [ ] Non-admins cannot access
   - [ ] **Can manage advertisements**
   - [ ] **Can view ad analytics (impressions, clicks, CTR)**

8. **Advertising** (New)
   - [ ] Ads display in correct slots
   - [ ] Header and footer ads appear on all pages
   - [ ] Inline ads appear between content
   - [ ] Sidebar ads visible on desktop only
   - [ ] Ads are responsive (resize for mobile)
   - [ ] Impression tracking works
   - [ ] Click tracking works
   - [ ] Only active ads within date range are shown
   - [ ] Venue-specific ads display correctly
   - [ ] "Ad" label is visible on all ads
   - [ ] Ad images load properly
   - [ ] Click opens in new tab

### Manual Testing
- Test on real mobile device
- Test with multiple users
- Test edge cases (no internet, denied location permission, etc.)

---

## Phase 13: Deployment Preparation (1-2 hours)

### Goal
Prepare app for production deployment.

### Tasks
1. **Environment Variables**
   - Document all required env vars in README
   - Create `.env.example` template
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   POLYMARKET_API_KEY=
   ```

2. **Create `.gitignore`**
   ```
   node_modules/
   .next/
   .env*.local
   .vercel/
   *.log
   ```

3. **Add README Documentation**
   - Project overview
   - Setup instructions
   - Environment variable guide
   - API integration notes
   - Deployment steps

4. **Build & Test Production**
   ```bash
   npm run build
   npm start
   ```
   - Fix any build errors
   - Test production build locally

5. **Deploy to Vercel**
   - Connect GitHub repository
   - Configure environment variables
   - Deploy and test live URL

### Validation
- Production build succeeds
- All features work in production
- Environment variables are secure

---

## Phase 14: Post-Launch Monitoring & Iteration (Ongoing)

### Goal
Monitor usage and iterate based on feedback.

### Tasks
1. **Add Analytics**
   - Track page views
   - Track user actions (trivia answers, predictions made)
   - Monitor errors

2. **Performance Optimization**
   - Optimize images
   - Implement caching strategies
   - Lazy load components

3. **Feature Enhancements**
   - Add more trivia categories
   - Expand prediction markets
   - Achievement badges
   - Social sharing

4. **Bug Fixes**
   - Monitor error logs
   - Fix issues reported by users
   - Improve edge case handling

---

## Estimated Timeline

- **Phase 0-2**: Project setup, types, database schema - **4-6 hours**
- **Phase 3-4**: Auth and geolocation - **3-5 hours**
- **Phase 5-6**: Trivia and Predictions - **5-7 hours**
- **Phase 7-8**: Activity and Notifications - **4-5 hours**
- **Phase 9-10**: Leaderboards and Admin - **5-6 hours**
- **Phase 11-12**: UI polish and testing - **4-6 hours**
- **Phase 13**: Deployment - **1-2 hours**

**Total estimated time: 25-36 hours** of focused development work, which can be spread over 1-2 weeks working part-time.

---

## Tips for Using Codex in VS Code

1. **Use Comments to Guide Codex**
   - Write detailed comments describing what you want before generating code
   - Example: `// Create a React component that displays a trivia question with 4 options and a 10-second timer`

2. **Generate Code in Small Chunks**
   - Don't try to generate entire files at once
   - Build components incrementally (structure → logic → styling)

3. **Use Copilot Chat for Planning**
   - Ask: "How should I structure this component?"
   - Ask: "What's the best way to implement rate limiting?"

4. **Iterate and Refine**
   - Generate initial code
   - Test it
   - Use Codex to refactor and improve

5. **Keep Context in Mind**
   - Open related files in tabs so Codex has context
   - Reference types/interfaces in your prompts

6. **Use Inline Completions**
   - Start typing a function name and let Codex complete it
   - Accept suggestions that make sense, reject those that don't

---

## Key Files to Create (Quick Reference)

**Configuration:**
- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local`

**Types & Utils:**
- `types/index.ts`, `lib/supabase.ts`, `lib/storage.ts`, `lib/geolocation.ts`, `lib/predictions.ts`, `lib/auth.ts`, **`lib/ads.ts`**

**Pages:**
- `app/page.tsx`, `app/join/page.tsx`, `app/trivia/page.tsx`, `app/predictions/page.tsx`, `app/activity/page.tsx`, `app/leaderboard/page.tsx`, `app/admin/page.tsx`, **`app/admin/ads/page.tsx`**

**API Routes:**
- `app/api/trivia/question/route.ts`, `app/api/trivia/answer/route.ts`
- `app/api/predictions/route.ts`, `app/api/predictions/submit/route.ts`
- `app/api/activity/route.ts`, `app/api/notifications/route.ts`
- `app/api/leaderboard/route.ts`, `app/api/admin/users/[userId]/route.ts`
- **`app/api/ads/route.ts`, `app/api/ads/impression/route.ts`, `app/api/ads/click/route.ts`**
- **`app/api/admin/ads/route.ts`**

**Components:**
- `components/UsernameModal.tsx`, `components/LocationGuard.tsx`, `components/TriviaCard.tsx`, `components/PredictionCard.tsx`, `components/NotificationBell.tsx`, `components/LeaderboardTable.tsx`
- `components/ui/Button.tsx`, `components/ui/Card.tsx`, `components/ui/Modal.tsx`, `components/ui/Badge.tsx`, `components/ui/Timer.tsx`
- **`components/AdBanner.tsx`**

**Styles:**
- `app/globals.css`

---

Good luck! Take it one phase at a time, test frequently, and don't hesitate to break phases into even smaller steps if needed.
