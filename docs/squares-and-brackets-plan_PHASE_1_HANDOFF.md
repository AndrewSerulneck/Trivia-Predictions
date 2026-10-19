# Squares + Brackets — Phase 1 handoff (shared foundation)

**Date:** 2026-10-19 (Mon, ~01:00 ET). **Plan:** `docs/squares-and-brackets-plan.md`. **Next:** Phase 2 (Squares
engine), Opus 5.5 · high.

## For Andrew (plain English)

- **What changed:** the groundwork both games share. The app now knows about two new games, "Super Bowl Squares" and
  "March Madness". It also has their Venue Home cards (which show only on their dates: Feb 1–15 and Mar 14–Apr 6,
  2027, plus a "Brackets open Selection Sunday" card from Mar 1), their on/off switches, and one safe way to add their
  venue points that can never pay twice. Weekly and monthly leaderboards will count those points too.
- **Is it live?** No. Both switches are off, so players see nothing new. Nothing is committed, pushed or deployed. The
  database change is written but **not applied**. Applying it is your call (`supabase db push`), and it can wait until
  Phase 2 is ready. It must happen before either switch is turned on.
- **Please read one thing:** I added rules text for both games to the Official Rules page. It stays hidden until a
  game's switch is on. Two sentences need your eye, because Squares is partly luck (the numbers are drawn at random)
  and the page used to say every prize is skill-based:
  1. "Prizes are skill-based, except Super Bowl Squares, whose winning squares depend on randomly drawn numbers. It
     is free to enter and nothing is ever paid to play, so it is not a lottery."
  2. "Hightop Challenge is not affiliated with, sponsored or endorsed by the NFL, the NCAA or any team. Event names
     are used only to describe the real games these contests follow, and belong to their owners."
  If you'd like a lawyer to look at these, do it before launch (late January). Nothing is needed from you now.
- **Left to do:** Phases 2–11 (the actual games). Nothing waits on you.

---

## For the next agent

### 1. Next phase goal and scope
Phase 2, Squares engine (plan §4 "Phase 2"): `squares_*` tables, the claim/release RPC (count-guarded, per-board
advisory lock, cap 2 = `SQUARES_PER_PLAYER_CAP`), the idempotent draw at lock (kickoff − 30 min), settlement
(one BDL request per run, only inside the game window, set-based grading per moment, credits through
`creditSeasonalPoints`), event auto-create from the NFL feed, admin panel with fix-ups, and fixture-replay tests.
**Out of scope:** player screens (Phase 3), Prizes/Results (Phase 4), TV (Phase 5). Don't turn on
`NEXT_PUBLIC_SQUARES_ENABLED` (Phase 6). Don't run `supabase db push` unless Andrew says so.

### 2. Starting state
- Branch `main`, last commit `b5c1778`. **Nothing from Phase 0 or Phase 1 is committed.** Andrew's own unrelated
  uncommitted edits are still in the tree (`CLAUDE.md` — I appended one section to it, see §4 — plus
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`). Don't
  commit, revert or `git checkout` those. Ask Andrew before committing, and stage only the Squares/Brackets paths
  (Phase 0 list in its handoff §4, plus §4 below).
- **Migration `supabase/migrations/20261019045030_seasonal_points_credits.sql` is NOT applied** to the linked project
  `pkmxupsayzshvpirkaav`. Apply it before any code path calls `creditSeasonalPoints`. Until then the leaderboard's new
  read fails quietly (no rows), and `creditSeasonalPoints` fails closed with `[SeasonalPoints] rpc-missing`.
- No database writes, no deploys, no env changes. Both flags are absent from Vercel (= off).
- **Phase 0 background capture still running** (checked 00:58 ET): PID 71943 (`1392308`, WSH @ SF tonight 8:15 PM ET)
  and PID 71944 (`1392309`, NE @ CHI Thu Oct 22). Output: `tests/fixtures/squares/nfl-live-capture-<id>.json`, logs
  `.scratch/nfl-live-capture-<id>.log`. **Phase 2 depends on it** for the quarter-confirmation rule. Do Phase 0
  handoff §8 step 1 first. If a file is missing or short (the Mac slept), re-run the script against a later game.

### 3. Decisions already made (don't re-ask)
Andrew's decisions are in plan §1 (1–15). Decided in Phase 1 (by me, within the plan's remit):
- **The credit RPC is batched:** `credit_seasonal_points(p_source text, p_credits jsonb)` takes up to 500
  `{user_id, source_key, points}` in one call, not the plan's one-credit signature. This follows the cost rule: a
  Squares moment pays ≤ 100 boards in one round trip, and bracket grading could pay thousands. `creditSeasonalPoints`
  splits bigger lists.
- **Ledger `user_id` is `ON DELETE CASCADE`**, so `delete_player_account` needs no change. That matches "REMOVE, don't
  anonymise", and `tests/account-deletion-contract.test.ts` only requires SET NULL consumers to be handled. A freed key
  pays no one afterwards: the retried credit gets `user_not_found`. Proven in the SQL test.
- **Seasonal points count in the timed venue leaderboards** (`lib/leaderboard.ts`, filter "all" only). Decision 7
  ("feed the venue points total") needs this, because today/week/month/year are summed from per-game tables, not from
  `users.points`. All-time already reads `users.points`. Seasonal points have no per-game filter yet.
- **`game_sessions_type_valid` now allows `squares` and `bracket`** (same migration). `GameAnalyticsType` includes
  both. Otherwise play-session analytics would be silently rejected, as happened to Category Blitz before.
- **Card windows use US Eastern calendar dates** (`SEASONAL_CALENDAR_TIME_ZONE`), so server render and phone agree.
- **Hub order:** the two seasonal games come first while they show (`VENUE_HUB_GAME_ORDER`). Andrew can reorder.
- **The bracket teaser tile shows "Brackets open Selection Sunday, March 14." and still links to `/bracket`.** Phase
  8's page must show a pre-open state when visited before Mar 14.
- **The rules sections render only while a game's flag is on** (build-time flags), and the "skill-based" line changes
  only when Squares is on. Copy is flagged for Andrew above. **Bump `LEGAL_LAST_UPDATED` (`lib/legalInfo.ts`) when a
  flag is turned on** (Phase 6 / Phase 10 launch step).
- **Not done on purpose:** `VALID_GAME_TYPES` in `lib/challengeCampaigns.ts` and the DB check
  `challenge_campaigns_game_types_valid` don't include the new games. Campaign progress accrual and rewards belong to
  Phases 4 and 9. Head-to-head challenge invites (`challenge_invites_game_type_valid`) don't offer them either.

### 4. Files created or changed
New:
- `lib/seasonalGames.ts`: `SeasonalGameKey`, `isSquaresEnabled()` / `isBracketsEnabled()` (the ONLY readers of
  `NEXT_PUBLIC_SQUARES_ENABLED` / `NEXT_PUBLIC_BRACKETS_ENABLED`), `SEASONAL_GAME_WINDOWS`,
  `seasonalCalendarDate`, `seasonalWindowState`, `seasonalCardState`, `venueHomeCardState`,
  `SQUARES_PER_PLAYER_CAP = 2`. Pure, client-safe.
- `lib/seasonalPoints.ts`: the scale, the one home for these numbers. `SQUARES_MOMENTS`, `SQUARES_MOMENT_POINTS`
  (25/25/25/50), `BRACKET_ROUND_POINTS` (10…320), `BRACKET_VENUE_POINTS_DIVISOR` (10), `bracketVenuePoints()`,
  limits that mirror the SQL, `SeasonalCredit`, `seasonalCreditProblem()`. Pure, client-safe (copy quotes it).
- `lib/seasonalPointsCredit.ts` (server-only): `creditSeasonalPoints(source, credits)`, the ONLY caller of the
  RPC. Validates before sending, batches by 500, fails closed (`invalid` / `unavailable` / `rpc_missing` /
  `rpc_failed`), returns per-credit `outcome` (`credited` / `already_credited` / `user_not_found`). It logs
  `[SeasonalPoints] key-paid-to-another-user` when a key was already paid to someone else.
- `supabase/migrations/20261019045030_seasonal_points_credits.sql`: table `seasonal_points_credits` (unique
  `(source, source_key)`, RLS on+forced, `service_role` grant only), function `credit_seasonal_points` (security
  definer, service_role execute only; locks users rows in id order; one statement inserts the ledger rows and bumps
  points only for rows it inserted), and the `game_sessions_type_valid` update.
- `scripts/test-seasonal-points-sql.cjs` + npm `test:seasonal-points-sql`: PGlite proof (once-only, other-user
  key, cross-source key, mixed batch order, sums, 500 cap, all-or-nothing validation, cascade on user delete, grants,
  RLS, analytics constraint).
- `tests/seasonal-games.test.ts`: windows incl. the Mar 14 DST edge, flags, wiring, one flag reader, **names
  only in `lib/venueGameCards.ts`** (comments ignored), scale, SQL mirror, single RPC caller, `/rules` render flag
  off/on, hub tile render with the teaser. `tests/lib.seasonal-points-credit.test.ts`: the wrapper.

Changed:
- `lib/venueGameCards.ts`: `VenueGameKey` + `"squares" | "bracket"`. Names `SQUARES_GAME_NAME`,
  `BRACKET_GAME_NAME`, `SQUARES_TITLE_LINES`, `BRACKET_TITLE_LINES`, `BRACKET_TEASER_SUBTITLE` (the one copy file for
  names, decision 9). Two `VENUE_GAME_CARDS` entries (rules + 3 statement-layout steps, numbers from the constants),
  `VENUE_HOME_GAME_KEYS`, `inferVenueGameKeyFromPath`. **Tutorial copy is a draft.** Phases 3 and 8 may refine it.
- `components/venue/VenueHubClient.tsx`: order + `venueHomeCardState` filter + `teaserGames`.
  `components/venue/VenueGamesPanel.tsx`: `teaserGames` prop, teaser subtitle.
- `components/venue/venueHubShared.tsx`: title lines, tile colours (`#15803d`, `#c2410c`), subtitles,
  `VENUE_HUB_TILE_TEASER_BY_KEY`, its own `ChallengeGameType` + icon styles + mappings.
- `components/venue/GameIdentityPanel.tsx`: bg/theme/subtitle/accent/dot maps, `STATEMENT_LAYOUT_GAMES`.
  `GameStepIllustration` returns null for both (no art yet, Phases 3/8).
- `components/venue/GameChrome.tsx` (`GameChromeKey`, `GameMark`: a 3×3 green grid / 🏀 tile),
  `components/venue/AppBar.tsx` (labels + accents), `lib/venueGameTransition.ts` (fallback bg — match it to the
  real page background in Phases 3/8), `components/venue/GameLandingExperience.tsx` + `lib/analytics.ts`.
- `types/index.ts` `ChallengeGameType` + `squares`/`bracket`; labels in `lib/competition.ts` and
  `components/challenges/PendingChallengesPanel.tsx`.
- `lib/leaderboard.ts`: new `seasonal_points_credits` source (filter "all", `created_at` range).
- `app/rules/page.tsx`: flag-gated sections (see §3).
- `package.json`: the npm script. `CLAUDE.md`: a short "Super Bowl Squares + March Madness" section at the end.
- `docs/squares-and-brackets-plan.md`: status line + Phase 1 notes (§9).

### 5. Facts and traps
- **Ledger keys are the once-only guarantee.** Build a key from what is being paid (Squares: board id + moment),
  never from a time or attempt number. A repeated key pays nothing, even if it names a different user.
- **There is no reversal yet.** Phase 2's "void and re-grade a moment (logged)" needs a new migration with a logged
  reversal (e.g. a `reversed_at` column + a service-only function that subtracts once). Don't `delete` a ledger row:
  that frees the key to pay again.
- **Bracket row-count trap (Phase 7):** one ledger row per entry per correct game would be about 600k rows at 100
  venues, which undoes the plan's array-picks saving. Prefer keys per entry per round (≤ 6 per entry), or a design
  with the same bound. Decide this in Phase 7 and write it down.
- `users.points` is the venue-scoped profile total. The RPC takes the venue profile's `users.id`, not an account id.
- The hub decides cards once per mount from `new Date()` on Eastern dates. A server/phone mismatch can only happen at
  the exact midnight boundary, and React patches it.
- `VENUE_HOME_GAME_KEYS` now lists keys that are usually hidden. `exitNavigation` uses it only to choose the return
  transition. A hidden card falls back after `waitForVenueCard` times out, which is harmless.
- Not fixed, pre-existing: `getGameTypeLabel` (`lib/competition.ts`) and `gameTypeLabel`
  (`PendingChallengesPanel.tsx`) label `nfl-pickem` as "Prop Bingo".
- `npm run test:account-deletion-sql` works as written (its PGlite path resolves). Running the script directly
  with no env var uses the repo's own `@electric-sql/pglite`.
- Andrew's `next dev` (PID 3066) was running. `npm run build` in place is fine (dev output is `.next/dev`). Don't kill
  it.

### 6. Build / run / test (all run 2026-10-19, all green)
- `npx tsc --noEmit`: clean. `npm run lint`: clean.
- `npm run test`: 407 files, **4,846 pass / 13 skipped (environment-gated `api.nfl-pickem`) / 0 fail**.
- `npm run test:seasonal-points-sql`: passes. `npm run test:account-deletion-sql`: passes.
- `npm run build`: passes, 204 pages (`/rules` still static).
- **Not verified:** a real browser or phone with the flags on (the tiles were checked by server-render test only),
  and the migration on the real database (it's not applied). Before Phase 6, run a phone pass with the flags on in a
  scratchpad clone or a preview build.

### 7. Open questions for Andrew
- The two rules sentences in the summary above (review, optionally with a lawyer, before late January). Not blocking
  Phase 2.

### 8. Recommended first steps for Phase 2
1. Read the live NFL capture (Phase 0 handoff §8 step 1) and write the quarter rule into plan §8.
2. Ask Andrew whether to commit Phases 0–1 (stage only these paths), and whether to apply migration
   `20261019045030` now or together with Phase 2's migration.
3. Design `squares_*` + the claim RPC with `award_cycle_winner`'s advisory-lock pattern
   (`supabase/migrations/*award_cycle_winner*`). Every new table needs a `service_role` grant, and any `users` FK must
   be CASCADE, or else added to `delete_player_account` with a new migration.
4. Pay moments with `creditSeasonalPoints("squares", …)` using keys like `${boardId}:${moment}` and
   `SQUARES_MOMENT_POINTS`.
Model: Opus 5.5, effort high (plan §4).
