# Cancelled-game prizes, Pick 'Em pick windows, and "browse anywhere, play at the bar"

**Status (2026-11-09):** Phases 0 (audit) and A1 (players stop seeing retired prizes; code + tests, uncommitted, not
deployed) done. Latest handoff: `docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_A1_HANDOFF.md` (Phase 0's
findings and plan changes P1–P4: `…_PHASE_0_HANDOFF.md`). Next: Phase A2. Each finished phase writes
`docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_<N>_HANDOFF.md` and updates this line.

Three of Andrew's problems (2026-11-09):

1. Cancelling a game does not cancel the prize attached to it (Pacific Street's $50 Live Trivia gift card).
2. Partners can't set when players may make Pick 'Em picks (e.g. College Football picks open Monday to Wednesday).
3. "New game at your bar" pushes reach players who are not at the bar, but a bar can only be opened while
   standing in it, so tapping the push leads nowhere.

---

## 1. What we're building (plain English)

**A. Cancelled games end their prizes, and players stop seeing ended prizes.**
- What really happened at Pacific Street: cancelling the Friday game *did* retire the $50 prize in the
  database (`is_active = false`, checked 2026-11-09). However, **players' Venue Home still shows retired prizes as if they
  were live.** Only Pick 'Em prizes are hidden once they end. That is the bug you saw.
- A second gap: prizes that aren't tied to one specific game ("weekly 1st/2nd/3rd place", "get 500
  points", older "any game" prizes) are never retired when the bar's Live Trivia is cancelled.
- Partners will also see which prizes a cancel will end **before** they confirm, not just afterwards.

**B. Pick windows per sport, in Game Settings.** A partner can say "College Football picks open Monday 12:00 AM and
close Wednesday 11:59 PM". During the window, players can pick that week's games ahead of time. Outside it,
picks are closed ("Picks open Mon"). Each game still locks at kickoff. NFL Pick 'Em gets the same option. With
spreads on, each game's line is **frozen per bar** so every player is graded against the number they saw.
Picks still have to be made **at the bar** (Andrew, 2026-11-09).

**C. Browse anywhere, play at the bar.** A player who has already joined a bar can open it from anywhere in a
**view-only** mode: upcoming games, prizes, leaderboard, directions and a **Remind me** button. Playing,
picking and redeeming still require being there. Pushes become invitations that open this view
instead of a locked screen, and the opt-in reminder comes early enough to travel.

---

## 2. Andrew's decisions (2026-11-09): don't re-ask

| # | Decision |
|---|----------|
| D1 | A Live Trivia prize not tied to one game (weekly places, points target, legacy "any game") is **retired automatically** when no Live Trivia game remains on any of its days. Coupons already won are kept. The partner sees a warning before confirming the cancel. |
| D2 | Pick windows are set **per sport in Game Settings** and cover all Pick 'Em play at the bar, prize or not. NFL Pick 'Em gets the same option. Games still lock at kickoff. |
| D3 | With a window and spreads on, lines are **frozen** (the same number for everyone at the bar), not taken at kickoff. *When* a line freezes is open question Q1. |
| D4 | Pick 'Em and NFL Pick 'Em picks stay **at the bar only**. Away mode is view-only for every game. |
| D5 | Recommendation accepted: away from the bar, a player can view their bars but not play in them. |

## 3. What other apps do (answer to problem 3)

The common pattern is **browse anywhere, act on-site**, plus notifications that invite people in, never ones that
assume they are already there.

- **Sportsbooks (DraftKings, FanDuel):** you can browse odds, your account and promotions from anywhere. Only
  placing a bet is geofenced. Their pushes ("Boost on tonight's game") open a page that works everywhere,
  and the location check happens only at the action. This is closest to our situation.
- **Venue check-in apps (Swarm, Untappd, Yelp):** venue pages, events and specials are public. Checking in and
  earning a badge require being at the venue.
- **Pokémon GO / Niantic events:** event pushes go to everyone ("Community Day Saturday 2–5 PM"). The app shows
  where and when, and taking part requires going there. They also add it to your calendar.
- **Event apps (Eventbrite, Meetup, Facebook Events):** "Interested / Remind me" lets the user choose to
  hear about one event, and the reminder comes hours before, early enough to travel.
- **Order-ahead apps (Starbucks, Domino's):** you do everything remotely, and only pickup is on-site. This is
  the "remote picks" option, which Andrew declined for now (D4).
- **Geofenced "you're nearby" alerts:** this needs "Always" location permission. Apple and Google review it
  closely, it costs battery, and opt-in rates are low. **Not recommended now** (§8, Q4).

What this plan adopts: the view-only bar page (C1), invitation-style push wording that opens it (C2), and
Remind me plus Add to calendar (C3).

## 4. Defaults chosen without asking (Andrew can override)

- **Ended = hidden.** A retired prize the viewer didn't win leaves the Venue Home Prizes panel. A prize the viewer
  won stays in their wallet as today. "Retired" means `is_active = false` with `winner_user_id` null. "Won
  out" means `is_active = false` with `winner_user_id` set, which keeps today's "congrats to …" card. Phase 0 confirms these are the only
  two states.
- **Partial cancels:** a weekly-places or points prize spanning several nights survives while at least one of its
  nights still has a game. Its wording already comes from the schedule when it's read (Phase 0 confirms).
- **No window = today's behaviour.** A sport with no window is always open, and regular Pick 'Em stays
  today-only (no pick-ahead) for that sport, so venues that don't use windows see no change and no extra cost.
- **Window shape:** one weekly window per sport (open day + time, close day + time, in the bar's time zone). The
  window covers every game that starts after it opens and before the next window opens. Daily windows are left out
  of v1.
- **Tiebreaker guesses** for a Pick 'Em Prize lock when that sport's window closes, if earlier than the game's
  start.
- **Away mode is available to players with a profile at that bar** (the same audience the pushes go to). A
  player who never joined the bar sees nothing new. It works on the website as well as in the app.
- **Remind me** sends one push **1 hour** before the game (the existing 30-minute "starts soon" push stays for
  people at or near the bar).

## 5. Facts from the code (2026-11-09)

- Pacific Street (`venue-pacific-street`) has one prize row, `16f3b066-…`: $50 gift card, `game_winner`, pinned to
  schedule `4b449b74-…` (deleted), `is_active = false`. No updated-at column, so it's unknown whether the cascade or an
  archive retired it. Its three remaining `trivia_schedules` rows are past one-offs.
- Retirement on cancel exists only for **slot-pinned** game-winner prizes: `lib/rewardGameSlotCascade.ts`
  (`applyScheduleChangeToGameWinnerRewards`), called from `lib/liveShowdownAdmin.ts` on delete and edit and reported to the
  partner afterwards via `describeCascadeReport` → `rewardNotice` (`components/owner/schedule/ScheduleGameFlow.tsx`).
  It skips `ranked_places`, points targets and `game_winner_slots = null`.
- Production, 2026-11-09: two active Live Trivia prizes. Garden State Bar `677a214c-…` is `ranked_places` and unpinned,
  which is exactly the gap. Carrabba's East Brunswick `a7ef34a1-…` is pinned and covered.
- Venue Home asks for every prize, retired ones included (`VenueHubClient.tsx` → `/api/challenge-campaigns?includeInactive=true`;
  `getChallengeCampaignSnapshotForUser` always passes `includeInactive: true`). Only Pick 'Em prizes get `prizeEnded`/`dropCard`
  (`pickemPrizeSnapshotState`). `VenueChallengesPanel` renders the rest as live, and `countActivePrizeCards` counts them.
- Already filtered correctly: the partner "Active Prizes" list (`splitCompetitions`), promo/Share to social (`lib/promo/promoPrizes.ts`), the TV
  screen (`lib/venueScreen.ts`).
- Regular Pick 'Em is **today only**. The date arrows in `components/pickem/PickEmGameList.tsx` stop at today, and
  `isValidPastOrTodayDateKey` rejects future dates. NFL Pick 'Em already has Thursday-start week navigation (`lib/nflPickEm.ts`).
- Pick submission: `submitPickEmPick` (`lib/pickem.ts`) via `/api/pickem/picks`, which reads `venue_game_settings` fresh. Game
  Settings: `lib/venueGameSettings.ts` + `/api/owner/game-settings` (NFL and college scoring mode only).
- Spread lines are global per game, not per bar: `pickem_game_lines`, written by `upsert_pickem_game_lines` before kickoff,
  locked at kickoff by `lock_pickem_game_lines` in settlement (`lib/pickemGameLines.ts`). A per-bar frozen line therefore needs
  its own storage.
- Away from the bar, `components/venue/VenuePresenceBoundary.tsx` puts an access overlay over Venue Home and every
  game. Server-side presence checks on mutations (`maybeRequireActiveVenuePresence`, 10 routes) are behind
  `VENUE_PRESENCE_ENFORCEMENT` (default off). Phase 0 checks whether it is set in production.
- The news push (`lib/push/venueNews.ts`) opens `/venue/{id}` and is sent to phones of players with a profile at the bar. The 30-minute
  reminder (`lib/push/gameReminders.ts`, "Tap to play") goes to phones whose last-used venue is that bar. Both can reach players who
  are not there.

## 6. Cost (estimate; Phase 0 measures the baseline)

| Change | Extra work per run | Monthly at today's volume |
|---|---|---|
| A1 hide retired prizes | Filter inside the existing read. | None |
| A2 retire unpinned prizes | Only on a partner's Live Trivia delete or edit: one schedule read for that venue (the prize read already happens). | Negligible (a few partner edits a day) |
| A3 cancel warning | One dry-run read when the partner opens Cancel game. | Negligible |
| B1 pick windows | Window columns ride the `venue_game_settings` read that picks and the games list already make. | None |
| B2 pick ahead | Only for sports with a window: one games-list fetch per future day viewed. College Football lines refresh at most once per 10 min **per day's games** per instance, so up to ~7× today's line fetches when players browse a whole week. | **Unknown; measure first.** Phase 0 records today's BallDontLie line calls per day |
| B3 frozen lines | One RPC write per (bar, game) the first time it's frozen: ~45 CFB games × bars with windows. 20 bars ≈ 900 small rows a week. | Negligible |
| C1 away mode | No new requests; the same Venue Home reads (including the existing 30 s prize poll while visible). | None |
| C2 push wording | None. | None |
| C3 Remind me | One insert per tap. The existing 5-minute reminder sweep adds one bounded opt-in read only when a game is inside the 1-hour window. Add to calendar is generated on the phone. | Negligible |

No new cron in any phase. If B2's measured provider calls are material, tell Andrew before releasing it (cheaper
option: cache the week's slate per sport for 10 minutes, shared by all days).

## 7. Phases

Recommended order: **0 → A1 → A2 → A3 → C1 → C2 → C3 → B1 → B2 → B3 → B4 → R**. A1 fixes what players see today, and C
fixes a dead end in a shipped feature. Note: the College Football regular season ends in early December 2026 (bowls run into January), so
pick windows matter more for the NFL this season.

| Phase | Model | Effort | Why |
|---|---|---|---|
| 0 Audit + baselines | Opus 5.5 | medium | Read-only checks across prizes, presence and provider calls |
| A1 Players stop seeing retired prizes | Opus 5.5 | high | Shared prize snapshot used by every prize type |
| A2 Cancel retires unpinned prizes | Opus 5.5 | high | Prize data change; shared cascade engine |
| A3 Warn before cancel | Opus 5.5 | medium | Well-specified UI on an existing dry-run |
| C1 Away mode (view-only bar) | Opus 5.5 | high | Touches the presence boundary and auth/venue context across several files |
| C2 Push wording + where taps land | Opus 5.5 | medium | Copy + deep links under an existing contract test |
| C3 Remind me + Add to calendar | Opus 5.5 | high | Migration + push audience |
| B1 Pick-window data + rules | Opus 5.5 | high | Migration + pick enforcement (points path) |
| B2 Pick ahead | Opus 5.5 | high | Games list + provider cost + screen |
| B3 Frozen spread lines per bar | Opus 5.5 | high | Migration + grading (money-like points path) |
| B4 Game Settings UI | Opus 5.5 | medium | Well-specified partner/admin form |
| R Review + release | Opus 5.5 | high | `/code-review`, migrations, deploy |

(The project CLAUDE.md asks for one model family per plan, matching the planning session: Opus 5.5, with effort varying by phase.)

### Phase 0: Audit + baselines (read-only, no code changes)
- List every writer of `challenge_campaigns.is_active = false` and confirm retired means `winner_user_id` null and won-out means
  set. Flag any writer that breaks this.
- Confirm a weekly-places prize's "across Wed, Thu and Fri nights" wording is read from the live schedule (so a partial cancel
  rewords itself).
- Production read: active Live Trivia prizes with no Live Trivia game left on any of their days (today: check Garden State Bar).
  List them for Andrew. **Retire nothing without his go-ahead.**
- `vercel env ls` (names only): is `VENUE_PRESENCE_ENFORCEMENT` set in production?
- Walk the away path: what a signed-in player with a profile at bar X sees opening `/venue/X` away, including when
  `tp_venue_id` is a different bar, in the app (cold start from a push) and on the website.
- Baseline: BallDontLie college odds/games calls per day from logs, for B2.
- Output: handoff with findings; adjust later phases if anything differs.

### Phase A1: Players stop seeing retired prizes (no migration)
- In `getChallengeCampaignSnapshotForUser` and the public listing, drop a card that is `!isActive && !winnerUserId` unless the
  viewer won it in the current cycle. Generalize the Pick 'Em `dropCard` rule rather than adding a second one.
- `countActivePrizeCards` and the "Active · N Prizes" header follow.
- Leave the partner list, wallet, promo and TV untouched (already correct).
- Tests: a contract test that a retired, unwon prize never reaches `VenueChallengesPanel`, and that won-out, won-by-viewer and
  Pick 'Em ended cards keep today's behaviour.

### Phase A2: Cancelling Live Trivia retires the prizes that relied on it
- Extend `lib/rewardGameSlotCascade.ts` with a fourth rule. After any Live Trivia schedule delete, edit or transfer at a venue,
  every active Live Trivia prize there that is **not** slot-pinned (`ranked_places`, points target, `game_winner` with null
  slots) is retired (`is_active = false`, never deleted, per rule 2) when the venue has no remaining Live Trivia game on
  any of the prize's `active_days`. One schedule read per cascade.
- `describeCascadeReport` names this case in one short sentence. Admin and owner share it.
- Data: after Andrew approves Phase 0's list, retire the orphaned prizes with a one-off script that logs the ids it changed
  (that log is the undo record).
- Tests: delete the last game, delete one of two nights, edit nights so none remain, transfer to another venue, and
  a won coupon surviving retirement.

### Phase A3: Warn before cancel
- A dry-run mode of the cascade (same function, no writes) behind `GET /api/owner/schedule/[id]/cancel-impact` (owner auth +
  venue check first). The admin route mirrors it.
- The in-sheet Cancel game confirmation (`ScheduleStepScreens.tsx`) shows one line, e.g. "Also ends: $50 gift card for the winner."
  Shown only when something would end. The same applies to an edit that would end or shrink a prize.
- Copy minimal; check at 350 px.

### Phase C1: Away mode (view-only bar)
- Replace the blocking overlay on **Venue Home only** with view-only mode for a signed-in player who has a profile at the bar
  and isn't there: upcoming games with day and time, prizes, leaderboard, and a Directions link (maps URL from the venue's
  address). Game buttons read "Play at the bar" and open nothing. Game screens keep today's overlay.
- Nothing that writes changes: every mutation route keeps its presence check, picks stay at the bar (D4), and
  redeeming stays at the bar. One geolocation check on open, as today, and none repeated while away.
- When the player arrives, the existing presence re-check turns play on without a reload.
- God Mode is unchanged. The native app front door is unchanged. Read `docs/join-flow-location-error-plan.md` and
  `docs/native-app-store-plan.md` standing rules first.
- Open question Q3 (a "Your bars" list to reach away mode without a push) is out of scope unless Andrew says yes.
- Tests: contract test that the 10 presence-checked routes still check, and that away mode renders no enabled play control.

### Phase C2: Push wording + where taps land
- News push reads as an invitation, e.g. title "New at Pacific Street", body "Live Trivia, Thursdays 8:00 PM." It lands on
  Venue Home (away mode when not there) with that game in view.
- The 30-minute reminder drops "Tap to play" (it can't know the player is there), e.g. "8:00 PM at Pacific Street."
- Update `PUSH_COPY` and `tests/push-notifications-contract.test.ts`. Apple 4.5.4 consent wording is unchanged.

### Phase C3: Remind me + Add to calendar
- Migration: `push_game_reminder_optins` (user id, schedule id, occurrence start, created at). `service_role` grants only, since
  the browser never writes it. Unique on (user, schedule, occurrence).
- `POST/DELETE /api/push/game-reminders` (session-bound, like `/api/push/devices`). A "Remind me" toggle on each upcoming
  Live Trivia game in Venue Home (away or present).
- The existing sweep in `/api/cron/resolve-live-trivia-winners` also sends one push 1 hour before to opted-in phones, claimed
  once through the existing `push_game_reminders` ledger pattern. The existing 30-minute audience is unchanged.
- "Add to calendar": an `.ics` built on the phone, or the native share sheet in the app (via `lib/nativeApp.ts` rules).
- `npm run test:push-sql` covers the claim. Cost is per §6.

### Phase B1: Pick-window data + rules (server only)
- Migration: `venue_pickem_pick_windows` (venue_id, sport_slug, open_day, open_time, close_day, close_time, updated_at), primary key
  (venue_id, sport_slug), with `service_role` grants (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`). `sport_slug` includes `nfl` for NFL Pick 'Em.
  An alternative is columns on `venue_game_settings`; choose whichever keeps the existing settings read to one query.
- Pure, client-safe rules in `lib/pickemPickWindow.ts`: which window instance covers a game (the latest opening before kickoff),
  whether it is open now, and the next open/close time in the venue's time zone (DST-safe, using the existing
  `zonedDateTimeToUtcMs`).
- Enforce in `submitPickEmPick`, the NFL Pick 'Em picks route and `/api/pickem/prize-tiebreaker`: a closed window → 409
  "Picks open Mon 12:00 AM." Changing or clearing a pick follows the same window. Kickoff lock is unchanged.
- Fail **open** on a settings read error (same as the pick limit), log it, and never block picks over our own outage.
- Read the Pick 'Em plan's standing rules first. Points move only via `pay_pickem_points`, and this phase must not touch scoring.

### Phase B2: Pick ahead
- For a sport with a window, the regular Pick 'Em date arrows go forward up to the last game the current or next window
  covers (at most 7 days). Sports without a window stay today-only.
- The games response carries `pickWindow` (`opensAt`, `closesAt`, `isOpen`), and the screen shows one muted line: "Picks close
  Wed 11:59 PM" or "Picks open Mon". NFL Pick 'Em's week view shows the same.
- Measure provider calls against the Phase 0 baseline. If material, ship the shared 10-minute week-slate cache and tell Andrew.

### Phase B3: Frozen spread lines per bar
- Migration: `pickem_venue_frozen_lines` (venue_id, sport_key, game_id, home_spread, away_spread, source_vendor, frozen_at),
  written only by a service-role SECURITY DEFINER RPC (revoke from public/anon/authenticated, grant to service_role) that
  inserts once and never updates.
- Timing per Q1. Default (recommended): freeze a game's line for that bar **the first time it is shown inside the window**, so
  players see a number that never changes; a line posted late freezes when first posted. This needs no cron. The other option,
  freezing at window close, needs a step in the existing settle cron and means players pick against a moving line until
  Wednesday.
- A pick at a windowed bar records the frozen line it was made against. Grading uses the recorded line, and the global kickoff lock
  is used only for bars without a window. Covers regular Pick 'Em (college) and NFL Pick 'Em spread mode.
- SQL proof script like `npm run test:pickem-lines-sql`. Never re-grade won or lost picks.

### Phase B4: Game Settings UI
- Per sport in Game Settings (owner + admin): "Picks: Always open / Set days", with open day + time and close day + time.
  Show "Saved." on success. Partner Manual gets one short entry.
- If a Pick 'Em Prize's days fall outside the sport's window, say so in one line in the wizard (no block).

### Phase R: Review + release
- `/code-review` at high; fix findings; `npm run test`, typecheck, lint, build, and the SQL proofs above.
- Migrations: `supabase db push` only with Andrew's go-ahead. Then deploy.
- Add a row to CLAUDE.md's Feature rules table and fill this doc's Standing rules section. Update `SYSTEM_CONTEXT.md` §7/§8.

## 8. Open questions (defaults in §4 apply unless Andrew changes them)

1. **Q1, line freeze timing (blocks B3 only).** You chose "freeze at window close". But a player picking Monday would then
   see a line that can still move until Wednesday. Freezing each game's line the first time it's shown in the window keeps
   one number for everyone **and** guarantees players are graded against what they saw. Recommended: first shown.
2. **Q2, remind-me lead time.** Default 1 hour before. Change?
3. **Q3, "Your bars" list.** Should the app's front door (and the website sign-in) list bars a player has joined, so they can open
   away mode without waiting for a push? Small addition to C1. Default: no, not in this plan.
4. **Q4, "You're near Pacific Street" alerts.** Not recommended now (needs "Always" location). Revisit after C3's opt-in numbers.

## Standing rules

Each phase adds the rules it creates here, and Phase R adds the CLAUDE.md pointer.

- **A1 (2026-11-09): one rule decides when a Venue Home prize card ends or leaves the panel:**
  `prizeCardEndState` in `lib/prizeCardEndState.ts`. Retired = `is_active = false` and `winner_user_id` null; such a card
  leaves unless the viewer won it **this cycle** (their own `challenge_cycle_winners` row, never `winner_user_id`). Won out
  (`winner_user_id` set) keeps its congrats card. A Pick 'Em Prize passes its own state (`pickemPrizeSnapshotState`), which
  wins. Both `getChallengeCampaignSnapshotForUser` and the public branch of `GET /api/challenge-campaigns` call it; never add a
  second drop/ended rule (`tests/retired-prize-card-contract.test.ts`).
