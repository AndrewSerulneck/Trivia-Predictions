# CLAUDE.md — Hightop Challenge Project Rules

> **Read `SYSTEM_CONTEXT.md` before starting any task.**

## Build and Test Commands
- Dev server: `npm run dev`
- Build: `npm run build`
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Tests: `npm run test` (Runs Vitest)

## Mental Model & Terminology
- **Core Concept:** Users join a specific physical venue and earn points playing mini-games (Trivia, Pick'em, Bingo, Predictions, Fantasy) scoped strictly to that venue. 
- **Data Scoping:** Authentication is global (passkeys/username), but points, leaderboards, and game states are entirely venue-specific. Users can belong to multiple venues with completely independent point totals.
- **Naming Rule:** Always use "credit allocation" instead of "credit limit" for recurring game balances.

## Do Not Touch (Hard Boundaries)
- `.env.local`: Never read, modify, or expose.
- `supabase/migrations/`: Read-only historical reference. Never write or alter SQL migration files directly.
- `lib/supabaseAdmin.ts`: Security boundary. Do not modify without explicit instruction.
- `vercel.json`: Cron configurations. Do not alter without instruction.

## Trivia Source of Truth
- **Speed Trivia is Admin/Supabase canonical:** For Speed Trivia (`question_pool='anytime_blitz'`, `answer_format='multiple_choice'`), the Admin UI and `trivia_questions` table are the source of truth. Local files under `data/trivia/categories/` are export artifacts only.
- **Live Trivia JSON is canonical:** Files under `data/live-trivia/categories/` remain the source of truth for Live Trivia question content.
- **Never cross Speed and Live Trivia pools:** Speed Trivia must stay `anytime_blitz` + `multiple_choice`; Live Trivia must stay `live_showdown` + write-in-compatible answer formats.
- **Never rebuild Live Trivia JSON from Supabase:** Database state must not overwrite, regenerate, or "restore" `data/live-trivia/categories/`.
- **Never rebuild local trivia JSON from stale git snapshots:** Do not use `git show`, `HEAD`, or other historical snapshots as the input source when editing or backfilling current trivia JSON unless the user explicitly asks for a restore from history.
- **Live Trivia question edits belong in local JSON first:** If the user asks to add, remove, rewrite, or audit Live Trivia questions/answers/acceptable answers, make those changes in the local JSON files.
- **Speed Trivia JSON export is intentional:** Only export approved Speed Trivia rows from Supabase to `data/trivia/categories/` through the Admin Review GitHub PR export flow.
- **Preserve current local file contents when scripting:** Any script that updates trivia JSON must read the current on-disk file first and only make the requested incremental changes.

## Architecture & Database Patterns
- **Client Queries:** Use `lib/supabase.ts` via `createClient(url, anonKey)`. Subject to RLS.
- **Server/API Queries:** Use `lib/supabaseAdmin.ts` via `createClient(url, serviceRoleKey)`. Guarded by `"server-only"`, bypasses RLS. Used for server-side mutations inside API routes.
- **State:** `AuthSessionProvider` (Context + useReducer) handles auth state. Otherwise, use component-level `useState`. Do not introduce Redux or Zustand.
- **Types:** Manually maintained in `types/index.ts`. Do not look for or assume auto-generated Supabase types.
- **Dev Mode:** React Strict Mode is disabled in `next.config.ts`. Do not assume double-mount behavior during debugging.

## Code Style & Constraints
- **TypeScript:** Strict mode enabled. Absolutely no `any`. Use explicit types imported from `@/types`.
- **Functions:** Prefer arrow functions for components and utilities.
- **Imports:** Always use absolute path alias `@/` (e.g., `@/lib/supabase`, `@/components/ui/PageShell`). No relative imports (`../`).
- **Styling:** Tailwind utility classes only. No custom CSS, no CSS modules, no inline `style={{}}`. Design tokens reside in `lib/themeTokens.ts`.
