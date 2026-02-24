# Trivia-Predictions

Mobile-first website for venue-based trivia and prediction competitions.

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase (planned backend/auth)
- Polymarket (live market feed)

## Getting Started
1. Install dependencies:
```bash
npm install
```

2. Add environment variables:
```bash
cp .env.example .env.local
```

3. Start development server:
```bash
npm run dev
```

Open `http://localhost:3000`.

## Prediction Features
- Live Polymarket markets with pagination (100/page), search, category filter, and sort options.
- Multi-outcome picks with the same points model based on outcome probability.
- Hourly limit: non-admin users can place up to 25 picks per rolling hour (use-it-or-lose-it).
- Admin users bypass the hourly pick limit.
- Global header shows picks remaining and reset timer.

## Auto Settlement Cron
- Endpoint: `GET/POST /api/cron/predictions-settle`
- Auth: `Authorization: Bearer $CRON_SECRET` or `x-cron-secret: $CRON_SECRET`
- `vercel.json` schedules the cron endpoint every 5 minutes.

## Current Scaffold
- Core pages: `/join`, `/trivia`, `/predictions`, `/activity`, `/leaderboard`, `/admin`
- API stubs: `/api/trivia`, `/api/predictions`, `/api/venues`, `/api/admin`
- Utilities: Supabase client wiring, probability formatting, mocked Polymarket service
- Join flow: anonymous auth + venue-locked usernames + geofence verification (100m default)
- SQL migrations: `supabase/migrations/20260214153000_initial_schema.sql`
- Seed data: `supabase/seed.sql`

## Supabase Keys (What they are)
- `NEXT_PUBLIC_SUPABASE_URL`: your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anonymous key for client-side auth/data access
- `SUPABASE_SERVICE_ROLE_KEY`: required for server/admin APIs
- `POLYMARKET_API_KEY`: optional bearer token if your Polymarket access requires it
- `CRON_SECRET`: required to authorize cron settlement calls

You get both from your Supabase project dashboard:
`Project Settings -> API`.

## Database Setup (Supabase)
1. In Supabase SQL Editor, run:
   - `supabase/migrations/20260214153000_initial_schema.sql`
2. Then run:
   - `supabase/seed.sql`
3. In Supabase Auth settings, enable anonymous sign-ins.

## Branch Protection Checklist (GitHub)
Use this for the `main` branch after CI is enabled.

1. Open `Settings -> Branches -> Add branch protection rule`.
2. Branch name pattern: `main`.
3. Enable `Require a pull request before merging`.
4. Enable `Require approvals` (recommended: `1` or higher).
5. Enable `Dismiss stale pull request approvals when new commits are pushed`.
6. Enable `Require status checks to pass before merging`.
7. Mark `validate` as a required check (from `.github/workflows/ci.yml`).
8. Enable `Require branches to be up to date before merging`.
9. Enable `Require conversation resolution before merging`.
10. Enable `Do not allow bypassing the above settings` (recommended for stricter control).
