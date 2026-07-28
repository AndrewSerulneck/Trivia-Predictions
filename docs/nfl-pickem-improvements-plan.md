# NFL Pick 'Em Improvements — Master Plan

Seven-phase plan covering six requested changes to the NFL Pick 'Em surface,
plus a Phase 0 that expands the local test-data seed so the later phases are
actually verifiable in dev.

Run the whole thing with `bash docs/run_phases.sh`.

## Product decisions (locked — do not re-litigate)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Week dropdown contents | **Past + current only. Never future weeks.** | Deliberate retention mechanic: forcing users to return each week to make picks drives repeat visits to subscribing bars. Letting users pick a whole season in one sitting works against the core business goal. |
| Leaderboard scope | **Toggleable: "This Week" / "Season"** | Week view reflects the week chosen in the dropdown; Season view is cumulative across all weeks. |
| Opponent pick visibility | **Hidden until that game kicks off** | Since picks now stay editable per-game all week, showing others' picks early would let users copy the leader. Each pick reveals when its own game locks. |
| Lock granularity | **Per-game, at that game's kickoff** | Replaces the current week-wide "locks at Thursday kickoff" model. |

## Key findings from code review (act on these; they are verified)

1. **Per-game locking already exists server-side.** `submitNFLPickEmPick` and
   `clearNFLPick` in `lib/nflPickEm.ts` already check the individual game's
   kickoff. The week-wide lock is a *client-side-only* mistake: the game list
   ANDs `weekData.week.isLocked` into every card's `isLocked` prop. Phase 2 is
   therefore mostly deletion, not new logic.
2. **Optimistic state already exists but is masked.** `NFLPickEmGameList`
   already sets `optimisticPicks` before awaiting the network. The perceived
   lag comes from `NFLGameCard` rendering a spinner overlay
   (`bg-black/20` + spinner) on top of the checkmark and setting `disabled`
   while `isSubmitting` is true, plus a full games-list refetch after every
   successful pick.
3. **The back-button bug is a navigation race.** The `loadGames` effect in
   `NFLPickEmGameList` depends on `searchParams` *and* calls
   `router.replace("/nfl-pickem?week=...")` inside itself. A pending replace
   fires after the user navigates away, yanking them back to `/nfl-pickem`,
   which re-renders the landing experience in its non-playing (tutorial)
   state. `getOnboardingInitialStep` always returns 0, so if the user reports
   landing on the *last* tutorial slide, the component instance is being
   preserved rather than remounted — either way, removing the
   `searchParams`-dependent replace loop is the fix.

## Phases

| Phase | File | Scope | Model / effort |
| --- | --- | --- | --- |
| 0 | `docs/nfl-pickem-phase0.md` | Expand dev seed: multiple weeks, finished games, fake opponents with picks | sonnet / medium |
| 1 | `docs/nfl-pickem-phase1.md` | Instant optimistic pick feedback (req #1) | sonnet / high |
| 2 | `docs/nfl-pickem-phase2.md` | Per-game locking; delete countdown + week-lock banner (req #2, #3) | sonnet / medium |
| 3 | `docs/nfl-pickem-phase3.md` | Week dropdown, past+current only, no wrapper box (req #4) | sonnet / high |
| 4 | `docs/nfl-pickem-phase4.md` | Back button returns to venue home (req #5) | opus / xhigh |
| 5 | `docs/nfl-pickem-phase5.md` | Leaderboard API with pick-privacy rules (req #6 backend) | opus / xhigh |
| 6 | `docs/nfl-pickem-phase6.md` | Leaderboard UI with expandable pick detail (req #6 frontend) | sonnet / high |

Each phase ends with `npm run build` + `npm test` via the runner's
`verify_or_fix`. A final review pass runs after Phase 6.

## Global constraints (every phase)

- TypeScript strict, **no `any`** — note `lib/nflPickEm.ts` currently has
  `any` in `fetchNFLGamesFromBDL`; do not add more, and prefer typing what you
  touch.
- Absolute `@/` imports only. Tailwind utility classes only (no inline
  `style={{}}` outside `components/venue-screen/*`; the existing
  `fontFamily` inline style in the NFL header is pre-existing — leave it).
- Arrow functions for new components/utilities.
- Do not modify `proxy.ts`, `lib/supabaseAdmin.ts`, `vercel.json`, or any
  existing file in `supabase/migrations/`. Creating a *new* migration file is
  allowed if a phase genuinely needs one (Phase 5 should not).
- Points/leaderboards are venue-scoped. Every leaderboard query must filter by
  `venue_id`. Never show cross-venue standings.
