# Hightop Challenge

Mobile-first website for venue-based trivia and prediction competitions.

## Mobile-First Product Rule
- This app is phone-first by default. Design and UX decisions should start at small viewport sizes first.
- Desktop/tablet behavior is progressive enhancement only; mobile flows and tap targets take priority.
- Preferred navigation on phones is the bottom nav (`components/ui/MobileBottomNav.tsx`); avoid adding mobile-only dependence on top nav bars.
- Any new page/component should be tested at typical phone widths before desktop refinement.

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase (auth + database)
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

## Current App Status
- Core pages: `/join`, `/trivia`, `/predictions`, `/activity`, `/leaderboard`, `/admin`
- API routes: `/api/trivia`, `/api/predictions`, `/api/predictions/quota`, `/api/venues`, `/api/activity`, `/api/leaderboard`, `/api/notifications`, `/api/admin`, `/api/admin/users`, `/api/admin/bootstrap`, `/api/ads/impression`, `/api/ads/click`, `/api/cron/predictions-settle`
- Join flow: anonymous auth + venue-locked usernames + geofence verification (100m default, optional local bypass)
- SQL migrations:
  - `supabase/migrations/20260214153000_initial_schema.sql`
  - `supabase/migrations/20260216193000_add_ad_events.sql`
  - `supabase/migrations/20260216204000_add_atomic_prediction_settlement.sql`
  - `supabase/migrations/20260224214000_remove_username_format_constraint.sql`
  - `supabase/migrations/20260224224500_add_prediction_rate_limit_index.sql`
- Seed data: `supabase/seed.sql`

## Supabase Keys (What they are)
- `NEXT_PUBLIC_SUPABASE_URL`: your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anonymous key for client-side auth/data access
- `SUPABASE_SERVICE_ROLE_KEY`: required for server/admin APIs
- `POLYMARKET_API_KEY`: optional bearer token if your Polymarket access requires it
- `CRON_SECRET`: required to authorize cron settlement calls
- `ADMIN_LOGIN_USERNAME`: admin login username used on `/admin`
- `ADMIN_LOGIN_PASSWORD`: admin login password used on `/admin`

You get both from your Supabase project dashboard:
`Project Settings -> API`.

## Database Setup (Supabase)
1. In Supabase SQL Editor, run:
   - `supabase/migrations/20260214153000_initial_schema.sql`
2. Then run:
   - `supabase/migrations/20260216193000_add_ad_events.sql`
   - `supabase/migrations/20260216204000_add_atomic_prediction_settlement.sql`
   - `supabase/migrations/20260224214000_remove_username_format_constraint.sql`
   - `supabase/migrations/20260224224500_add_prediction_rate_limit_index.sql`
   - `supabase/migrations/20260227132000_add_trivia_slug.sql`
   - `supabase/migrations/20260227134500_prevent_duplicate_trivia_answers.sql`
3. Then run:
   - `supabase/seed.sql`
4. In Supabase Auth settings, enable anonymous sign-ins.

## Trivia Content Workflow (JSON -> Supabase)
Use this when building and updating your trivia bank.

1. Edit questions in:
   - `data/trivia/categories/*.json` (one file per category)
2. Validate JSON format locally:
   - `npm run trivia:check`
3. Import questions into Supabase (upsert by `slug`):
   - `npm run trivia:import`
4. Re-run import whenever the JSON changes.

Suggested category files:
- `data/trivia/categories/sports.v1.json`
- `data/trivia/categories/general-knowledge.v1.json`
- `data/trivia/categories/history.v1.json`
- `data/trivia/categories/science.v1.json`

### JSON Format
Each question must include exactly 4 options (3 wrong + 1 correct):

```json
[
  {
    "slug": "science-red-planet",
    "question": "Which planet in our solar system is known as the Red Planet?",
    "options": ["Mars", "Jupiter", "Venus", "Mercury"],
    "correctAnswer": 0,
    "category": "Science",
    "difficulty": "easy"
  }
]
```

### What to Tell Gemini
Ask Gemini to return strict JSON only (no markdown), using this schema:

```text
Return a JSON array only. No markdown, no commentary.
Each item must have:
- slug: lowercase kebab-case unique identifier
- question: string
- options: array of exactly 4 strings
- correctAnswer: integer 0-3 (index into options)
- category: short string
- difficulty: one of "easy", "medium", "hard"

Rules:
- Exactly one correct option per question.
- Keep distractors plausible and non-repetitive.
- Keep wording concise for mobile users.
- Do not include explanations.
```

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
