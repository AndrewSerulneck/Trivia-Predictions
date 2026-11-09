# Phase 0 handoff: audit + baselines (cancelled prizes, pick windows, away mode)

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Phase 0 done 2026-11-09 by Claude Opus 5.5 (medium effort),
as the plan's table names.

## For Andrew (plain English)

- **Nothing was changed.** No code, no data, no settings. This phase only looked.
- **No orphaned prizes to retire today.** Only two Live Trivia prizes are active: Garden State Bar's weekly 1st/2nd/3rd
  ($30/$20/$10) still has its Wed/Thu/Fri game, and Carrabba's East Brunswick's is tied to its Thursday game, which still
  exists. Pacific Street's $50 prize is already retired. So Phase A2 needs no clean-up script right now.
- **The plan's assumptions held**, with four corrections that the next phases now follow (listed under "Plan changes" below).
  The biggest one: a player whose phone is "signed in" at a different bar is sent to the join screen and told no bar is
  nearby. Phase C1 has to handle that case, not only the "same bar, but away" case.
- **One thing needs you:** `VENUE_PRESENCE_ENFORCEMENT` is set in Vercel Production (added ~120 days ago), but I can't see
  its value without pulling secrets, which this project blocks. Tell the next agent whether it is `true` (the server also
  blocks plays from away) or `false` (only the screen overlay blocks them). This matters for Phase C1.
- **Pick-ahead cost (Phase B2) couldn't be measured** from Vercel: counting outbound calls needs the paid "Observability
  Plus" plan, which I didn't buy. B2 will add a simple log counter and measure before release instead.

## For the next agent (Phase A1)

### 1. Next phase goal and scope
Phase A1: players stop seeing retired prizes on Venue Home (no migration). Scope and out-of-scope are as written in the
plan's "Phase A1" section. Out of scope: the partner list, wallet, promo/Share to social, TV (already filter correctly), and any
data change.

### 2. Starting state
- Branch `main`, last commit `4b4bbcdd` ("iOS: location purpose string…"). Phase 0 committed nothing. Uncommitted in the
  tree at start (not mine, leave alone): `assets/app-store/google-play-screenshots-2026-11-09/`,
  `assets/app-store/venue-home-screenshots-2026-11-09/`, `output/`, and the plan doc itself (untracked). This handoff is also
  untracked.
- No data changed, no backup needed, no undo log. Read-only scripts lived only in the session scratchpad.

### 3. Decisions already made
D1–D5 in the plan §2, defaults in §4. Nothing new was asked of Andrew in Phase 0. Pending from him: the
`VENUE_PRESENCE_ENFORCEMENT` value (§7 below).

### 4. Findings (files and facts)

**F1. Who sets `challenge_campaigns.is_active = false`** (every writer, 2026-11-09):

| Writer | `winner_user_id` | Meaning |
|---|---|---|
| `lib/challengeCampaigns.ts` `finalizeClosedLeaderboardCampaigns` (~l.1225) | set (the winner) | leaderboard closed, won out |
| `lib/challengeCampaigns.ts` points award (~l.2973), one-time prize hit its quota | set (resolved marker, not necessarily "the" winner under multi-winner) | won out |
| `lib/liveTriviaWinnerRewards.ts` `deactivateResolvedReward` (~l.388) | set (resolved marker) | one-off game-winner won out |
| `lib/nflPickEmWinnerRewards.ts` (~l.750), season/single-week reward | set (resolved marker) | won out |
| `lib/challengeCampaigns.ts` `deleteChallengeCampaign` mode `archive` (~l.1935; owner `app/api/owner/competitions/[id]/route.ts`, admin `app/api/admin/route.ts` ~l.1295) | unchanged, normally null | partner/admin archived = **retired** |
| `lib/rewardGameSlotCascade.ts` l.229, l.246 | unchanged (null) | last pinned slot gone = **retired** |
| `lib/challengeCampaigns.ts` `endPickEmPrize` (~l.2385) | null | Pick 'Em Prize period settled = **ended**, handled already by `pickemPrizeSnapshotState` / `dropCard` |
| `app/api/admin/route.ts` PATCH `challenge-campaigns` (~l.1687) | admin may pass `isActive` AND `winnerUserId` freely | can produce any combination |

Production combos (14 rows total): inactive+winner null 6, inactive+winner set 1, active+winner null 7. No active row has a
winner set.

**Conclusion for A1:** "retired = inactive + winner null" and "won out = inactive + winner set" holds, with three caveats:
(a) Pick 'Em ended prizes are also inactive + null; keep their existing `prizeEnded` path (generalize, don't double-handle);
(b) the winner column is only a "resolved" marker on multi-winner prizes, so "viewer won it" must come from the viewer's
own redemption/cycle-winner rows, not from `winner_user_id === viewer`; (c) an archived **recurring** prize has winner null
even if past cycles had winners. Those winners keep their coupons in the wallet, but the Venue Home card should drop.

**F2. Weekly-places wording reads the live schedule.** `describeRankedPlacesReward` (`lib/rewardDescription.ts` ~l.508)
gets `recurringSlots` from `loadVenueGameSlots` inside `attachRewardDescriptions` (`lib/rewards.ts` l.752), at read time.
A partial cancel rewords itself. If the venue has no slots left it reads "across all of the week's games" (A2 retires it
in that case). Stored `active_days` is NOT updated by a schedule change.

**F3. Orphaned Live Trivia prizes: none.** Active Live Trivia prizes:
- Garden State Bar `677a214c-b859-4c17-8e4d-9889574516e1`: `ranked_places`, unpinned, days wed/thu/fri, 16 coupons issued.
  Schedule `78a0e374-f3f1-4605-af35-89deb8040660` "Weekday Trivia" weekly wed/thu/fri still exists. Covered.
- Carrabba's East Brunswick `a7ef34a1-54bf-456e-9e0f-64126347859f`: pinned to schedule `ee97f951-f158-474e-9ede-be059517535d`
  (weekly thu), still exists.
- Pacific Street `16f3b066-b825-4794-b9c6-7bc36b66398d`: already inactive, winner null. Its remaining three schedules are past
  one-offs (`87cf7905…`, `72d67407…`, `31d0cfd5…`).
- Riverside has three active **legacy leaderboard** prizes (`18f7fb73…`, `bf243b4f…`, `4f15fe7f…`) whose `game_types` are
  `pickem, fantasy, speed-trivia, live-trivia, bingo`. They are NOT Live Trivia prizes (see Plan change P1).

**F4. `VENUE_PRESENCE_ENFORCEMENT`** exists in Vercel Production (`vercel env ls production`, created ~120 days ago). Value
unknown: it's encrypted, and `vercel env pull` / reading `.env.local` are denied by project rules. Read by
`isVenuePresenceMutationEnforcementEnabled` (`lib/venuePresence.ts` l.166, default false). Ten routes call
`maybeRequireActiveVenuePresence` (`grep -rln maybeRequireActiveVenuePresence app` → 10 files).
`NEXT_PUBLIC_DISABLE_GEOFENCE` also exists in Production but nothing in `lib/ app/ components/ proxy.ts` reads it (dead var).

**F5. The away path today** (code walk; not browser-tested):
- `proxy.ts` lets `/venue/X` through whenever `tp_venue_id` and `tp_user_id` cookies exist (any bar).
- **Same bar** (`tp_venue_id = X`): Venue Home renders, and then `VenuePresenceBoundary` runs a presence check immediately
  when this tab has no check stored in `sessionStorage` (always the case on a cold start from a push, app or web). It calls
  geolocation, then `POST /api/venue-presence/heartbeat` → `VENUE_OUT_OF_RANGE` (or `VENUE_LOCATION_UNAVAILABLE` if location is
  denied), and the access overlay covers Venue Home.
- **Different bar** (`tp_venue_id = Y`): `VenueHubClient` (~l.483) does `router.replace("/?v=X")` → `JoinFlow` with a stored
  identity goes to the venue list → geolocation → distance error / "No partner venue nearby" (commit `dad6416f`). This is a
  dead end, and it happens before the presence boundary ever runs.
- **Identity is per bar:** `users` is one row per (account, venue): columns include `account_id`, `venue_id`, `points`.
  `tp_user_id` is the row for the *current* bar. Production: 216 `users` rows with an account, 181 accounts, **8 accounts
  have profiles at more than one bar**. The heartbeat's `userBelongsToVenue(userId, X)` checks `users.id = tp_user_id AND
  venue_id = X`, so a bar-Y user id gets `VENUE_PROFILE_MISMATCH` at X even when the same account has an X profile.
- Pushes: venue news is claimed per phone by RPC `claim_venue_news_push` and opens `/venue/{id}` (`lib/push/venueNews.ts`
  l.138). The native tap handler is `onPushTapped` in `lib/nativePush.ts` (l.306), which just opens the path.

**F6. BallDontLie baseline (for B2): not measured.** Vercel `vercel.external_api_request.count` returns 402: it needs
Observability Plus (team `team_uGVCpxcJGBQ1VdCDO0lSMRZf`, project `prj_OpAN1WsW4vxk9rvc4I6oZANNLeLF`). There is no per-call
log in the code (`lib/balldontlie.ts` / `lib/ballDontLieClient.ts` only warn on failure). Upper bound from code
(`lib/pickemGameLines.ts` l.11–21): college odds are fetched at most once per 10 min per day's games per instance, ≈3 pages
each, and skipped while the shared DB stamp is fresh. So today ≤ ~18 odds calls/hour/instance while a college slate is
viewed. Pick-ahead over 7 days multiplies that by up to 7, plus one games-list fetch per future day viewed.

### 5. Plan changes (apply them; the plan doc is updated to point here)
- **P1 (A2):** retire only prizes whose game types are Live Trivia **only** (`game_types = ["live-trivia"]` or a
  `live_trivia_challenge` definition). Multi-game legacy leaderboards (Riverside) must never be retired by a Live Trivia cancel.
- **P2 (A2):** for an unpinned `ranked_places` prize, every Live Trivia game at the venue counts toward its week
  (`rankedNightsForVenue`, `lib/rankedPlaceRewards.ts` ~l.287), and for a one-off-only venue `active_days` is only the
  week's anchor. So the rule is "retire when the venue has **no** Live Trivia game left (recurring, or one-off in the future)",
  not "none on its `active_days`". For a points-target Live Trivia prize, confirm in A2 how `active_days` gates points before
  choosing the rule.
- **P3 (A1):** "viewer won it" = viewer's own redemption / cycle-winner rows, never `winner_user_id` (F1 caveat b).
- **P4 (C1):** away mode must cover the **different stored bar** case. Resolve the account's `users` row for bar X
  server-side (by `account_id`), without changing cookies or the stored venue, and don't trigger the `/?v=X` redirect when the
  account has an X profile. If the account has no X profile, keep today's behaviour. Heartbeat order is location →
  membership → distance, so a profile mismatch is only reported after a location fix.

### 6. Build / run / test
Nothing built. To re-run the production reads: a Node ESM script importing
`/Users/andrewserulneck/Documents/Trivia-Predictions/node_modules/@supabase/supabase-js/dist/index.mjs` by absolute path
(a scratchpad script can't resolve the bare package name), run with `node --env-file=.env.local <script>` from the repo root,
using `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Select only, never write. Unverified: F5 was
read from code, not driven in a browser or the app.

### 7. Open questions for Andrew
- Is `VENUE_PRESENCE_ENFORCEMENT` `true` or `false` in Production? (C1 relies on server checks if the overlay is removed.)
- Should B2 measure provider calls with a temporary log counter (default), or do you want Observability Plus?
- Plan Q1–Q4 are still open (only Q1 blocks anything: B3).

### 8. Recommended first steps for Phase A1 (Opus 5.5, high effort)
1. Read `docs/rewards-system-plan.md` and `docs/pickem-college-football-and-prize-plan.md` Standing rules.
2. Read `getChallengeCampaignSnapshotForUser` and `pickemPrizeSnapshotState` in `lib/challengeCampaigns.ts`, then
   `VenueChallengesPanel` and `countActivePrizeCards`.
3. Generalize the `dropCard` rule per F1 and P3, then write the contract test the plan lists.
