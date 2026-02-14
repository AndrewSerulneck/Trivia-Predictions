# Trivia-Predictions

Mobile-first website for venue-based trivia and prediction competitions.

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase (planned backend/auth)
- Polymarket (currently mocked)

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

You get both from your Supabase project dashboard:
`Project Settings -> API`.

## Database Setup (Supabase)
1. In Supabase SQL Editor, run:
   - `supabase/migrations/20260214153000_initial_schema.sql`
2. Then run:
   - `supabase/seed.sql`
3. In Supabase Auth settings, enable anonymous sign-ins.
