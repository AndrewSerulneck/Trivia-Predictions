# Agent Handoff (2026-02-16)

## Current Status
- Branch: `main`
- Build status: `npm run lint` and `npm run build` passing at handoff
- Scope completed in this session:
  - Live predictions + placement flow
  - Trivia gameplay + answer submission + points
  - Venue leaderboard + polling + current-user highlight
  - Activity timeline + pending/resolved filters
  - Admin dashboard with:
    - Trivia CRUD
    - Ads CRUD
    - Ad analytics/debug
    - Pending prediction settlement (winner/canceled)
    - Venue user management (edit username/points)
  - Ads system:
    - Multi-slot rendering
    - Impression/click tracking
    - Event-based analytics windows (24h/7d/30d)
    - Admin test buttons for impression/click simulation
  - Notification bell + unread/read flows
  - Global loading + error boundaries (`app/loading.tsx`, `app/error.tsx`)
  - Mobile bottom navigation shell (`components/ui/MobileBottomNav.tsx`)
  - Atomic admin settlement path via RPC with legacy fallback in code
  - Targeted automated tests for settlement logic (`tests/admin.settlement.test.ts`)
  - API route tests for admin prediction settlement (`tests/api.admin.predictions-settle.test.ts`)
  - API route tests for notifications read/mark-read (`tests/api.notifications.test.ts`)
  - API + lib validation tests for admin user updates (`tests/api.admin.users-update.test.ts`, `tests/admin.update-user.test.ts`)
  - API route tests for admin users list (`tests/api.admin.users-list.test.ts`)
  - CI workflow (`.github/workflows/ci.yml`) running test/lint/build on push + PR
  - Branch protection setup checklist documented in `README.md`

## Key Migrations
- Existing baseline migration:
  - `supabase/migrations/20260214153000_initial_schema.sql`
- New migration added this session:
  - `supabase/migrations/20260216193000_add_ad_events.sql`
  - `supabase/migrations/20260216204000_add_atomic_prediction_settlement.sql`
- User confirmed running the `ad_events` migration in Supabase SQL Editor.

## New/Important API Routes
- `app/api/leaderboard/route.ts`
- `app/api/notifications/route.ts`
- `app/api/activity/route.ts`
- `app/api/ads/impression/route.ts`
- `app/api/ads/click/route.ts`
- `app/api/admin/route.ts` (expanded resources)
- `app/api/admin/users/route.ts`
- `app/api/admin/users/[userId]/route.ts`

## Auth + Env Notes
- Client/public vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server-only vars:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `POLYMARKET_API_KEY` (+ optional secret/passphrase for future CLOB work)
- Admin API routes require bearer token + `users.is_admin = true`.

## Event/Refresh Hooks
- Client event bus key: `tp:points-updated`
- Emitted from:
  - Trivia correct-answer saves
  - Notification ingest when new "earned points" notifications appear
- Consumed by:
  - Leaderboard table (immediate refresh)
  - Activity timeline (immediate refresh)

## Recommended Next Steps
1. Phase 12 QA pass:
   - Manual venue switching tests.
   - Prediction settlement scenarios (`won/lost/canceled`) + notification correctness.
   - Ad slot placement QA across mobile/desktop.
2. Hardening:
   - Run `20260216204000_add_atomic_prediction_settlement.sql` in Supabase SQL Editor.
   - Verify admin settlement now uses RPC transaction path (with legacy fallback if migration missing).
   - Add targeted tests for admin routes and notification flows.

## Quick Verify Checklist
1. `npm install`
2. `npm run lint`
3. `npm run build`
4. `npm test`
5. Open `/admin` as admin user and verify:
   - Ads debug snapshot updates
   - Pending prediction settlement works
   - Venue user edits persist
6. Open `/activity` and `/leaderboard` to confirm refresh after points-changing actions.
