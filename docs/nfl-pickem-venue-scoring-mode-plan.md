# NFL Pick 'Em Venue Scoring Mode Plan

## Goal

Add a per-venue NFL Pick 'Em scoring setting controlled by admins and by partner owners for their own venues only.

- `standard`: a pick wins when the selected team wins the game outright.
- `spread`: a pick wins when the selected team covers the locked spread.
- Default: `standard`.
- The active mode at settlement time controls all still-pending picks.
- Already-settled picks are never recalculated.
- Rewards are not changed. NFL Rewards continue to count settled `pickem_picks.status = 'won'` rows through the existing accrual path.

## Current System Notes

Read these first in a new chat:

- `CLAUDE.md`
- `SYSTEM_CONTEXT.md`
- `lib/nflPickEm.ts`
- `lib/pickem.ts`
- `lib/nflPickEmRewardAccrual.ts`
- `components/nfl-pickem/NFLPickEmGameList.tsx`
- `components/nfl-pickem/NFLGameCard.tsx`
- `app/api/nfl-pickem/games/route.ts`
- `app/api/nfl-pickem/picks/route.ts`
- `lib/requireOwnerAuth.ts`
- `app/owner/dashboard/page.tsx`
- `components/admin/adminSections.tsx`

NFL picks live in shared `pickem_picks`. NFL game listing is in `lib/nflPickEm.ts`. Settlement is shared in `lib/pickem.ts`, so any spread-specific settlement must be narrowly gated to NFL picks only.

## Product Decisions

- Try BallDontLie first for NFL spreads.
- If BallDontLie spread support is difficult or absent, use The Odds API.
- Lock the displayed spread at kickoff.
- Assume spreads are available for NFL games; do not overbuild unavailable-spread UX.
- Pending picks use the venue's mode at settlement time, even if submitted before the toggle changed.

## Recommended Agent

Use Codex 5.5 for the full end-to-end build. Codex 5.4 is fine for isolated UI/API work, but the settlement path and odds-line locking are high-risk enough that 5.5 is the better default.

## Phase 1: Data Model

Agent: Codex 5.4 acceptable. Intelligence: medium.

Add a migration with:

1. `venue_game_settings`
   - `venue_id text primary key references venues(id) on delete cascade`
   - `nfl_pickem_scoring_mode text not null default 'standard'`
   - timestamps
   - check constraint: `nfl_pickem_scoring_mode in ('standard', 'spread')`

2. `nfl_pickem_game_lines`
   - `game_id text primary key`
   - `starts_at timestamptz not null`
   - `home_team text not null`
   - `away_team text not null`
   - `home_spread numeric not null`
   - `away_spread numeric not null`
   - `provider text not null`
   - `fetched_at timestamptz not null default now()`
   - `locked_at timestamptz`

3. Add settlement audit columns to `pickem_picks`
   - `scoring_mode text`
   - `home_spread numeric`
   - `away_spread numeric`
   - check constraint for `scoring_mode in ('standard', 'spread')`

Reason: `venue_game_settings` is future-proof for more game settings. `nfl_pickem_game_lines` gives a stable line source. Pick-level audit fields preserve how a settled row was graded without recalculating history.

## Phase 2: Settings Helpers and APIs

Agent: Codex 5.4 acceptable. Intelligence: medium.

Add a server-only helper, likely `lib/venueGameSettings.ts`:

- `type NFLPickEmScoringMode = 'standard' | 'spread'`
- `getVenueNFLPickEmScoringMode(venueId)`
- `getVenueGameSettings(venueId)`
- `setVenueNFLPickEmScoringMode(venueId, mode)`
- default to `standard` when no row exists

Add owner-scoped API:

- `GET /api/owner/game-settings?venueId=...`
- `POST /api/owner/game-settings`
- Must use `requireOwnerAuth(request)`
- Must reject venue IDs not in `auth.venueIds`

Add admin API support:

- Either add `resource = "game-settings"` to `app/api/admin/route.ts`, or create a focused admin route.
- Must require `requireAdminAuth`.
- Admin can read/update any venue.

## Phase 3: Partner Dashboard UI

Agent: Codex 5.4 acceptable. Intelligence: medium.

Add a `Game Settings` tile to `app/owner/dashboard/page.tsx`.

Create `/owner/game-settings`:

- Use existing `OwnerShell`.
- Use the same venue switcher pattern as schedule/competitions pages.
- Show one customizable game: NFL Pick 'Em.
- Show a two-state control: `Standard` / `Spread Mode`.
- Save via `/api/owner/game-settings`.
- Keep copy concise and partner-facing.

## Phase 4: Admin UI

Agent: Codex 5.4 acceptable. Intelligence: medium.

Add an admin section, probably in `components/admin/adminSections.tsx` under Operations or Venues:

- Label: `Game Settings`
- Venue selector
- NFL Pick 'Em scoring mode segmented/toggle control
- Save state and error handling

Alternative: add it inside Venue Profiles if that fits the current admin IA better, but keep the backend helper shared.

## Phase 5: Spread Fetching and Locking

Agent: Codex 5.5 recommended. Intelligence: high.

First attempt BallDontLie:

- Check whether the NFL game endpoint already exposes spread/odds fields.
- If yes, map to `home_spread` and `away_spread` in `lib/nflPickEm.ts`.

Fallback to The Odds API:

- Reuse existing odds patterns if present for Sports Bingo.
- Fetch NFL spreads by game/team/start time.
- Match carefully by provider game id if possible; otherwise normalized team names plus kickoff time.

Line locking rule:

- Before kickoff, game listing can refresh the latest spread and upsert `nfl_pickem_game_lines`.
- At or after kickoff, set `locked_at` and stop changing the row.
- Settlement must use the locked row.

Do not block on elaborate no-spread states. The product decision is that NFL spreads will be available.

## Phase 6: Player NFL Pick 'Em UI

Agent: Codex 5.4 acceptable. Intelligence: medium.

Update `GET /api/nfl-pickem/games` response to include:

- `scoringMode`
- `homeSpread`
- `awaySpread`

Update client types in:

- `components/nfl-pickem/NFLPickEmGameList.tsx`
- `components/nfl-pickem/NFLGameCard.tsx`

Render spreads only when `scoringMode === 'spread'`:

- Away team shows its line under team name.
- Home team shows its line under team name.
- Example display: `+3.5`, `-3.5`, `PK` for zero if needed.

Standard mode should not show spread information.

## Phase 7: Settlement Logic

Agent: Codex 5.5 recommended. Intelligence: high.

In `lib/pickem.ts`, keep current settlement behavior for all non-NFL picks.

For NFL picks:

1. Load venue scoring modes for pending NFL pick venue IDs.
2. If mode is `standard`, use existing winner logic.
3. If mode is `spread`, load locked line for `game_id`.
4. Compute adjusted result. **Apply the line to one side only** — `away_spread`
   is by construction `-home_spread`, so adjusting both sides moves the margin by
   twice the line and mis-grades every pick (corrected 2026-08-02; see round 4
   Phase 1 in `docs/code-review-round4-plan.md`):
   - home adjusted = `home_score + home_spread`
   - away adjusted = `away_score` (raw, unadjusted)
   - selected side wins if its score is greater
   - equal scores = `push`, which is reachable only on an integer spread
5. Update `pickem_picks` with:
   - `status`
   - final scores
   - `winning_team_id` if there is an outright winner
   - `scoring_mode`
   - `home_spread`
   - `away_spread`
   - `resolved_at`

Important: do not change `lib/nflPickEmRewardAccrual.ts` except tests, because Rewards should remain downstream of settled pick status.

### Spread Line Locking Contract

This contract is mandatory for NFL Pick 'Em spread-mode settlement and is further
tracked in `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`.

- Spread settlement is valid only from a row that already exists in
  `nfl_pickem_game_lines`.
- Settlement may lock an existing unlocked row once `starts_at <= now`.
- Settlement must preserve the stored spread values when locking.
- Settlement must not fetch odds.
- Settlement must not create a missing line row.
- Listing may refresh or upsert unlocked line rows before kickoff.
- Listing after kickoff may lock an existing row, but must not create a new
  locked row.
- Post-kickoff line creation is forbidden. A line that did not exist before
  kickoff cannot become the settlement source later.
- Already-settled `pickem_picks` rows are never recalculated.

## Phase 8: Tests

Agent: Codex 5.5 recommended. Intelligence: high.

Add focused Vitest coverage:

- Settings helper defaults missing rows to `standard`.
- Settings helper persists `spread`.
- Owner API allows owned venue.
- Owner API rejects unowned venue.
- Admin API can update any venue.
- Games API omits spread display data in standard mode or returns `scoringMode: 'standard'`.
- Games API returns spreads in spread mode.
- Standard NFL settlement still awards winner-pick as `won`.
- Spread NFL settlement awards covering team as `won`.
- Spread NFL settlement produces `push` on adjusted tie.
- Toggling mode does not recalculate already-settled picks.
- NFL Rewards accrual still counts settled `won` rows only.

Also run:

- `npm run test`
- `npx tsc --noEmit`
- targeted NFL Pick 'Em tests if full test runtime is too high

## Non-Goals

- Do not change Rewards definition creation.
- Do not change `nflPickEmRewardAccrual` semantics.
- Do not recalculate historical `pickem_picks`.
- Do not add partner access beyond venues from `venue_owner_venues`.
- Do not alter daily non-NFL Pick 'Em scoring.

## Clarifying Assumptions to Preserve

- The visible line should be the same line used to grade spread picks.
- A mode change affects pending picks because settlement reads the current venue setting.
- A mode change does not affect rows already settled to `won`, `lost`, or `push`.
- Spread mode still uses the same point value as standard mode: `PICKEM_REWARD_POINTS`.

## Handoff Status As Of 2026-08-02

### Completed Through Phase 5

- Phase 1 is already landed:
  - `supabase/migrations/20260802120000_nfl_pickem_venue_scoring_mode.sql`
- Phase 2 is already landed:
  - `lib/venueGameSettings.ts`
  - `app/api/owner/game-settings/route.ts`
  - `app/api/admin/game-settings/route.ts`
  - `tests/lib.venue-game-settings.test.ts`
  - `tests/api.owner.game-settings.test.ts`
  - `tests/api.admin.game-settings.test.ts`
- Phase 3 is already landed:
  - `app/owner/dashboard/page.tsx`
  - `app/owner/game-settings/page.tsx`
- Phase 4 is now landed:
  - `components/admin/sections/GameSettingsSection.tsx`
  - `components/admin/adminSections.tsx`
- Phase 5 is now landed:
  - `lib/nflPickEm.ts`
    - Uses BallDontLie's dedicated NFL odds endpoint (`/nfl/v1/odds`) with `season` + `week`.
    - Normalizes `spread_home_value` / `spread_away_value` into `home_spread` / `away_spread`.
    - Stores rows in `nfl_pickem_game_lines` by the same decorated Pick 'Em `game_id` stored on `pickem_picks`, not by raw provider id.
    - Refreshes unlocked rows before kickoff, sets `locked_at` at kickoff, and never overwrites rows that already have `locked_at`.
    - Exports `getNFLPickEmGameLine(gameId)` for Phase 7 settlement.
  - `tests/lib.nfl-pickem-game-fetch.test.ts`
    - Covers BallDontLie odds fetching by season/week.
    - Covers line upsert by stored Pick 'Em game id.
    - Covers kickoff locking without changing the stored spread.
    - Covers preserving already locked rows.

### Handoff For Phase 6

- Start in `app/api/nfl-pickem/games/route.ts` and `lib/nflPickEm.ts`.
- The line table is already populated during `listNFLPickEmGames()`. Use the existing `refreshNFLPickEmGameLines()` result or `getNFLPickEmGameLine(gameId)` rather than refetching odds from the UI/API route.
- Add `scoringMode` from `getVenueNFLPickEmScoringMode(venueId)` only when a `venueId` is provided; default to `standard` when missing, matching the helper.
- Only expose `homeSpread` / `awaySpread` to the client when `scoringMode === "spread"`. Standard mode should not leak line display data.
- Update `components/nfl-pickem/NFLPickEmGameList.tsx` and `components/nfl-pickem/NFLGameCard.tsx` to render the stored lines under team names in spread mode (`+3.5`, `-3.5`, `PK`).
- Add the Phase 6 API/UI tests listed in Phase 8 before moving to settlement.

### Completed Through Phase 6

- Phase 6 is now landed:
  - `app/api/nfl-pickem/games/route.ts`
    - Returns top-level `scoringMode`.
    - Defaults to `standard` when `venueId` is absent.
    - Reads venue mode from `getVenueNFLPickEmScoringMode(venueId)` when a venue is present.
    - Only includes `homeSpread` / `awaySpread` in each game payload when the resolved mode is `spread`.
  - `lib/nflPickEm.ts`
    - Threads stored locked spread data from `refreshNFLPickEmGameLines()` onto each `NFLPickEmGame`.
  - `components/nfl-pickem/NFLPickEmGameList.tsx`
    - Stores API `scoringMode` in client state and passes it to each game card.
  - `components/nfl-pickem/NFLGameCard.tsx`
    - Renders team spread labels only in spread mode.
    - Formats zero as `PK`.
  - Tests added:
    - `tests/api.nfl-pickem-games-route.test.ts`
    - `tests/components.nfl-game-card.test.ts`

### Handoff For Phase 7

- Start in `lib/pickem.ts`. Keep non-NFL settlement behavior unchanged.
- Use venue settings at settlement time for pending NFL picks only:
  - `standard` keeps existing outright-winner grading.
  - `spread` must load the locked row from `nfl_pickem_game_lines` via the decorated Pick 'Em `game_id`.
- Persist the Phase 1 audit fields on settlement:
  - `scoring_mode`
  - `home_spread`
  - `away_spread`
- A spread tie must settle to `push`.
- Already-settled rows must never be recalculated if the venue mode changes later.
- After settlement changes, add the Phase 7 / Phase 8 tests for:
  - standard NFL settlement still winning normally
  - spread settlement winner
  - spread push
  - mode toggle not recalculating settled rows
  - rewards accrual still counting only settled `won` rows
- Verification completed for Phase 6:
  - `npx vitest run tests/api.nfl-pickem-games-route.test.ts tests/components.nfl-game-card.test.ts tests/lib.nfl-pickem-game-fetch.test.ts`
  - `npx tsc --noEmit`

### Completed Through Phase 7

- Phase 7 is now landed:
  - `lib/pickem.ts`
    - Keeps existing settlement behavior for non-NFL picks.
    - Loads venue NFL Pick 'Em scoring modes once per pending NFL venue.
    - Uses existing outright-winner grading when the venue mode is `standard`.
    - Uses locked `nfl_pickem_game_lines` rows, keyed by the decorated Pick 'Em `game_id`, when the venue mode is `spread`.
    - Applies the Phase 7 adjusted-score rule: `home_score + home_spread` versus `away_score + away_spread`.
    - Settles adjusted ties as `push`.
    - Persists `scoring_mode`, `home_spread`, and `away_spread` audit fields on settlement updates.
    - Leaves spread-mode NFL picks pending if the locked line cannot be loaded.
    - Still only scans `status = 'pending'`, so already-settled picks are not recalculated after a mode toggle.
  - `tests/lib.pickem-nfl-scoring-mode.test.ts`
    - Covers standard NFL settlement.
    - Covers spread winner settlement.
    - Covers spread push settlement.
    - Covers already-settled picks not recalculating after a venue mode toggle.

### Handoff For Next Chat

- Phase 8's listed test coverage is now effectively in place across the earlier phase tests plus `tests/lib.pickem-nfl-scoring-mode.test.ts`.
- Before committing, do one final review of `lib/pickem.ts` for readability around the settlement helper extraction and the spread-mode pending behavior.
- Apply the follow-up locking fix from `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`.
  Start at Phase 2 there: add a settlement-safe helper in `lib/nflPickEm.ts`,
  then wire `lib/pickem.ts` to it before tightening listing-time locking and
  re-running the focused NFL Pick 'Em tests.
- Recommended final verification:
  - `npm run test`
  - `npx tsc --noEmit`
- Verification completed for Phase 7:
  - `npx vitest run tests/lib.pickem-nfl-scoring-mode.test.ts tests/lib.nfl-pickem-reward-accrual.test.ts`
  - `npm run test`
  - `npx tsc --noEmit`
  - `npm run lint`

### Completed Through Phase 8

- Phase 8 is now complete:
  - Existing focused coverage confirms settings defaults/persistence, owner/admin access, spread-mode API payloads, card rendering, NFL standard/spread/push settlement, no recalculation of settled picks, and NFL Rewards accrual semantics.
  - Added an explicit API regression case that a venue resolving to `standard` keeps stored spread fields hidden.
- Final verification completed:
  - `npx vitest run tests/lib.venue-game-settings.test.ts tests/api.owner.game-settings.test.ts tests/api.admin.game-settings.test.ts tests/api.nfl-pickem-games-route.test.ts tests/components.nfl-game-card.test.ts tests/lib.pickem-nfl-scoring-mode.test.ts tests/lib.nfl-pickem-reward-accrual.test.ts`
  - `npm run test`
  - `npx tsc --noEmit`
