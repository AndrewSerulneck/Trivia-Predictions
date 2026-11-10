# Cancelled-game prizes, Pick 'Em pick windows, and "browse anywhere, play at the bar"

**Status (2026-11-09):** Phases 0 (audit), A1 (players stop seeing retired prizes; committed `f14c2449`, **deployed**),
A2 (cancelling Live Trivia retires the prizes that relied on it), A3 (warning before cancel/edit), C1 (away mode + "Your
bars", D6), C2 (push wording + where taps land), C3 (Remind me + Add to calendar), B1 (pick-window data + server rules), B2 (pick
ahead), B3 (frozen spread lines per bar; Q1 = "first shown", the recommended default), B4 (Game Settings UI), R1 (settle before a schedule
change), R2 (the line on a pick is the line it's graded by), R3 (away open keeps its screen and its once-a-minute limit), R4 (three small fixes) and R5 (one Category Blitz look-only payload) and R6 (arrow functions) done; A2–B4 + R1–R6 are code + tests, **uncommitted, not deployed**; migrations `20261109214742_push_game_reminder_optins.sql` (C3), `20261109223743_pickem_pick_windows.sql` (B1) and
`20261110014242_pickem_venue_frozen_lines.sql` (B3) are **not applied**.
**Andrew (2026-11-09): A2, A3 and C1 (and C2, C3, B1, B2, B3, B4 with them) are held for Phase R's review and release** — don't commit or deploy them
earlier. Latest handoff: `docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_R10_HANDOFF.md` (earlier: `…_PHASE_R9_HANDOFF.md`, `…_PHASE_R8_HANDOFF.md`, `…_PHASE_R7_HANDOFF.md`, `…_PHASE_R_HANDOFF.md`, `…_PHASE_R6_HANDOFF.md`, `…_PHASE_R5_HANDOFF.md`, `…_PHASE_R4_HANDOFF.md`, `…_PHASE_R3_HANDOFF.md`, `…_PHASE_R2_HANDOFF.md`, `…_PHASE_R1_HANDOFF.md`, `…_PHASE_B4_HANDOFF.md`, `…_PHASE_B3_HANDOFF.md`, `…_PHASE_B2_HANDOFF.md`, `…_PHASE_B1_HANDOFF.md`,
`…_PHASE_C3_HANDOFF.md`, `…_PHASE_C2_HANDOFF.md`, `…_PHASE_C1_HANDOFF.md`, `…_PHASE_A3_HANDOFF.md`, `…_PHASE_A2_HANDOFF.md`, `…_PHASE_A1_HANDOFF.md`,
`…_PHASE_0_HANDOFF.md` with plan changes P1–P4). **Phase R's `/code-review` (high, 2026-11-09) found 10 problems in A2–B4;
remedial phases R1–R6 (§7) fix them before anything is released.** R1 done (Q5 and Q6 built as their defaults). R2 done. R3 done. R4 done. R5 done. R6 done. **Phase R in progress (2026-11-10):** the second `/code-review` (high) is done and its fixes are in
(`docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_R_HANDOFF.md`); test, typecheck, lint, build and SQL proofs pass.
**A third `/code-review` (high, 2026-11-10) found 8 more problems; remedial phases R7–R10 (§7) fix them before release.**
R7 done (2026-11-10; uncommitted like the rest). R8 done (2026-11-10; uncommitted). R9 done (2026-11-10; uncommitted; handoff `…_PHASE_R9_HANDOFF.md`). R10 done (2026-11-10; uncommitted; handoff `…_PHASE_R10_HANDOFF.md`). **Andrew (2026-11-10): every open question in §8 takes its default** (Q2, Q4, Q5, Q6,
Q7, Q8, Q9). R9 built Q9's default; R10 built Q8's. Next: Phase R resumes: `/code-review` high on the whole held diff, Andrew's go-ahead for
`supabase db push`, then commit, deploy and the CLAUDE.md / SYSTEM_CONTEXT.md updates.
`VENUE_PRESENCE_ENFORCEMENT` is `1` (on) in Production, Preview and Development (Andrew, 2026-11-09). Each finished phase writes
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
| D6 | **"Your bars" list (Q3: yes, 2026-11-09).** After signing in, a player sees the bars they have **checked in at in the last 90 days**. Bars in range join as full players, as today. The others open view-only (C1). A bar leaves the list once 90 days pass without a check-in, so the list stays short. A check-in is a location check that passed at the bar, either joining or the 15-minute presence check. |
| D7 | **Restore wiped check-in dates: yes (2026-11-09).** Done: 37 rows restored from the location-check log (`scripts/backfill-presence-checkins.mjs --apply`); undo list in `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`. |
| D8 | **Server location checks on the four games that had only the on-screen block: yes (2026-11-09).** NFL Pick 'Em picks, Squares claims and Bracket saves now refuse when the player isn't at the bar. A Category Blitz game-page poll from a player who isn't at the bar only looks: it shows a round already running but never starts one. |

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
| B1 pick windows | Built as one jsonb column on `venue_game_settings`, so a pick makes ONE settings read (college picks already made it; other sports' picks, every clear and every tiebreaker save add one small primary-key read; NFL's moved, net zero). The time zone read (cached 10 min) happens only for a sport with a window. | None measurable |
| B2 pick ahead | Only for sports with a window, so **nothing until a partner sets one (B4)**. Per future day viewed: one games-list request (provider reply in Next's 60 s data cache), and for College Football spreads at most one odds walk (≈3 pages) per 10 min per day per instance, skipped while the shared line stamp is fresh. The empty-day debug probe (uncached, never shown) no longer runs for future days. Settings read cached 30 s (shared with the college rule), time zone 10 min. Worst case, a whole week browsed nonstop: ≤ ~7 games calls/min + ≤ ~2 odds calls/min per instance. | **Not material** (BallDontLie is a flat subscription; far under its rate limit), so no week-slate cache. Measured after R's deploy by the `[provider-calls]` log line (`lib/providerCallCounter.ts`). |
| B3 frozen lines | Only at a bar with a window and spreads on: one indexed range read per games-list view, one RPC write per (bar, game) the first time it's frozen (~45 CFB + ~16 NFL games a week per bar; 20 bars ≈ 1,200 small rows a week), and one RPC per pick there. Settlement reads nothing new (the line rides the pick row). | Negligible |
| D8 Category Blitz look-only | One read-only presence row per game-page poll (every 15 s, only while the game is open; no telemetry, no writes). About 240 small reads per open player per hour. Supabase bills compute and egress, not reads, so no measurable cost change. | None measurable |
| C1 away mode + Your bars | Venue Home: no new requests. Sign-in list: one session-bound read (3 small queries) each time the list opens. Opening a bar view-only: one request per tap. Check-in time: a failed presence check stops erasing it (no extra write). | Negligible |
| C2 push wording | None. | None |
| C3 Remind me | One insert per tap. The existing 5-minute reminder sweep adds one bounded opt-in read only when a game is inside the 1-hour window. Add to calendar: one small request per tap (two reads), CDN-cached 5 minutes per game (changed in C3 from "generated on the phone": the iPhone app's share sheet can't add to Calendar). | Negligible |
| R1 settle before the change | **Cheaper than A2 as built.** A2 runs the cron's platform-wide sweeps (every schedule row, every venue's prizes, standings for every recently ended game) inside one partner's request. R1 runs the same sweeps for **one venue** and only when the change ends or shrinks a game-winner or weekly-places prize: 1 schedules read + 1 prizes read for that venue, 1 standings read per game of theirs that ended in the last 6 hours, 1 settlements read, 1 week-totals read per week closed early. A change that ends nothing runs only the dry run (the 2 reads A3 already makes). **As built:** a payable change makes about 3–4 venue-filtered schedule reads (one for the step, one per sweep), 1–2 prize reads, the time zone read, and per week closed early 1 settlements read + 1 week-totals read + 1 award RPC; all bounded by one venue. | Negligible (a few partner edits a day), and lower than today's unreleased A2 |
| R4 reminder claims in chunks | Same rows, split into calls of at most 200 games. One call at today's volume. | None |

No new cron in any phase. If B2's measured provider calls are material, tell Andrew before releasing it (cheaper
option: cache the week's slate per sport for 10 minutes, shared by all days).

## 7. Phases

Recommended order: **0 → A1 → A2 → A3 → C1 → C2 → C3 → B1 → B2 → B3 → B4 → R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9 → R10 → R**.
R1–R6 are the remedial phases from Phase R's first review (2026-11-09); R1 goes first because it is the only one that can lose a
player's prize. R7–R10 come from the third review (2026-11-10); R7 goes first for the same reason. A1 fixes what players see today, and C
fixes a dead end in a shipped feature. Note: the College Football regular season ends in early December 2026 (bowls run into January), so
pick windows matter more for the NFL this season.

| Phase | Model | Effort | Why |
|---|---|---|---|
| 0 Audit + baselines | Opus 5.5 | medium | Read-only checks across prizes, presence and provider calls |
| A1 Players stop seeing retired prizes | Opus 5.5 | high | Shared prize snapshot used by every prize type |
| A2 Cancel retires unpinned prizes | Opus 5.5 | high | Prize data change; shared cascade engine |
| A3 Warn before cancel | Opus 5.5 | medium | Well-specified UI on an existing dry-run |
| C1 Away mode (view-only bar) + Your bars | Opus 5.5 | high | Touches the presence boundary, session switching and the join list across several files |
| C2 Push wording + where taps land | Opus 5.5 | medium | Copy + deep links under an existing contract test |
| C3 Remind me + Add to calendar | Opus 5.5 | high | Migration + push audience |
| B1 Pick-window data + rules | Opus 5.5 | high | Migration + pick enforcement (points path) |
| B2 Pick ahead | Opus 5.5 | high | Games list + provider cost + screen |
| B3 Frozen spread lines per bar | Opus 5.5 | high | Migration + grading (money-like points path) |
| B4 Game Settings UI | Opus 5.5 | medium | Well-specified partner/admin form |
| R1 Settle before a schedule change (review 1, 6) | Opus 5.5 | high | Prize payouts (money), shared payout sweeps and cascade engine, several files |
| R2 The line on a pick is the line it's graded by (review 2) | Opus 5.5 | high | Points path: both Pick 'Em engines must match settlement exactly |
| R3 Away open keeps its screen and its once-a-minute limit (review 3, 4) | Opus 5.5 | high | Join flow and session switching (auth path) |
| R4 Three small fixes (review 5, 7, 8) | Sonnet 5.5 | medium | Each is fully specified below, local and test-pinned |
| R5 One Category Blitz look-only payload (review 9) | Sonnet 5.5 | medium | Behaviour-neutral refactor of one route, pinned by its route test |
| R6 Arrow functions (review 10) | Haiku 5.5 | low | Mechanical conversion from a generated list; typecheck + tests are the check |
| R7 Schedule changes pay after the write, from one read (3rd review 2, 4, 5) | Opus 5.5 | high | Prize payouts (money), the shared cascade engine and both payout sweeps |
| R8 A pick's line is set when it's made (3rd review 1, 3) | Opus 5.5 | high | Points path: both Pick 'Em engines, grading must match the screen |
| R9 Auto-open waits for a location; pick ahead snaps back on the server (3rd review 6, 7) | Sonnet 5.5 | medium | Two local, fully specified client/route fixes pinned by tests; no auth or points change |
| R10 One "at the bar" rule (3rd review 8) | Opus 5.5 | medium | Small diff, but it is the presence boundary every write route depends on |
| R Review + release | Opus 5.5 | high | `/code-review`, migrations, deploy |

(The project CLAUDE.md asks for one model family per plan, matching the planning session: Claude, with effort varying by phase.
Andrew allowed Sonnet and Haiku for token efficiency on 2026-11-09. They are used only for R4–R6 and R9, where the work is fully
specified. Anything touching money, points or auth stays on Opus.)

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

### Phase C1: Away mode (view-only bar) + "Your bars" (D6)
- Replace the blocking overlay on **Venue Home only** with view-only mode for a signed-in player who has a profile at the bar
  and isn't there: upcoming games with day and time, prizes, leaderboard, and a Directions link (maps URL from the venue's
  address). Game buttons read "Play at the bar". A tap re-checks location once, and opens the game only if the player is now
  there. Game screens keep today's overlay.
- Nothing that writes changes: every mutation route keeps its presence check, picks stay at the bar (D4), and
  redeeming stays at the bar. One geolocation check on open, as today, and none repeated while away.
- When the player arrives, the existing presence re-check turns play on without a reload.
- **"Your bars" (D6):** on the signed-in venue list (app front door and website sign-in), the bars checked in at in the last
  90 days that are **not** in range are listed under "Your bars" and open view-only. Bars in range stay in the normal list and join
  as today. The check-in time is `venue_presence_sessions.last_verified_at`; a failed presence check must no longer erase it.
  The list is served by a session-bound read (`GET /api/player/venues`); no account id from the browser is trusted.
- **Opening a bar you aren't at** (`POST /api/player/venues/open`): resolves the signed-in account's **existing** profile at that bar,
  never creates one, records no presence, and signs the session in as that profile (as joining does, minus the location check).
  **Departure from Phase 0's P4** ("don't change cookies"): showing bar X under bar Y's identity would need a second, public-only
  read path through about ten places in Venue Home (prizes, badges, points, passkey, warm-up, arrival guard, watchdog, heartbeat).
  Switching to the account's own X profile reuses the per-bar identity exactly as joining does. Side effect: the phone's
  "starts soon" reminder follows the bar last opened (`push_devices.venue_id`). A push or link to bar X while signed in at
  bar Y goes to the sign-in list (`/?v=X`, as today), which opens X view-only by itself when X is out of range and the account
  has a profile there, even one older than 90 days.
- God Mode is unchanged (its list holds every bar, so "Your bars" is empty). The native app front door is unchanged.
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
  **Built differently (C3):** the `.ics` is served by `GET /api/trivia/live/calendar` and opened in the phone's browser from the
  app (the share sheet has no "Add to Calendar" on iPhone); see the C3 handoff.
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
- **Built (B1):** a jsonb column `venue_game_settings.pickem_pick_windows` (migration `20261109223743`), not a table, so the
  windows ride the one settings read. The owner/admin Game Settings save already accepts `pickWindows` (B4 only adds the form).
  See the B1 handoff and standing rule.

### Phase B2: Pick ahead
- For a sport with a window, the regular Pick 'Em date arrows go forward up to the last game the current or next window
  covers (at most 7 days). Sports without a window stay today-only.
- The games response carries `pickWindow` (`opensAt`, `closesAt`, `isOpen`), and the screen shows one muted line: "Picks close
  Wed 11:59 PM" or "Picks open Mon". NFL Pick 'Em's week view shows the same.
- Measure provider calls against the Phase 0 baseline. If material, ship the shared 10-minute week-slate cache and tell Andrew.
- **Built (B2):** the reach is 7 days, or while a window is open, up to its next opening (`pickAheadHorizonMs`). Lines read "Picks
  close Wed 11:59 PM", "Picks open Mon 12:00 AM" (with the time, like the 409) or "Picks closed" (that game's window has passed).
  The Pick 'Em Prize tiebreaker card locks with the window too. Cost estimated, not measured (no window exists yet); a per-instance
  `[provider-calls]` log line gives the baseline after R's deploy. See the B2 handoff.

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
- **Built (B3):** Q1 taken as the recommended "first shown" (Andrew, 2026-11-09: "go with all of your default recommendations").
  Migration `20261110014242_pickem_venue_frozen_lines.sql`: table + insert-once SECURITY DEFINER RPC `freeze_pickem_venue_lines`
  (service_role only; service_role can only read the table; an update trigger refuses any change). The pick records its line in
  its own `pickem_picks.home_spread` / `away_spread` (until now written only at grading; 0 pending picks had them in production on
  2026-11-09), so **no `pickem_picks` change**, and settlement reads nothing new. Grading goes by the pick's recorded line, not "the
  bar has a window", so a pick made after a partner turns the window off stays on the line it was shown. See the B3 handoff.

### Phase B4: Game Settings UI
- Per sport in Game Settings (owner + admin): "Picks: Always open / Set days", with open day + time and close day + time.
  Show "Saved." on success. Partner Manual gets one short entry.
- If a Pick 'Em Prize's days fall outside the sport's window, say so in one line in the wizard (no block).
- **Built (B4):** one shared card, `components/gameSettings/PickWindowsPanel.tsx` (`tone` owner/admin), under the scoring cards on
  `/owner/game-settings` and in the admin Game Settings section; eight sports (College Football and NFL Pick 'Em first). One save
  sends only the sports that changed. The wizard's line (When step) comes from `pickemPrizePickWindowNotice`; it also says when the
  prize's first day's picks have already closed. See the B4 handoff.

### Remedial phases R1–R6 (from Phase R's `/code-review`, 2026-11-09)

Phase R's review at high effort found 10 problems in the uncommitted A2–B4 work. Every one was checked against the code on
2026-11-09 and is real. Nothing is committed or deployed, and no bar has a pick window yet (the B1 migration is not applied), so
**no production data needs repair**. Each phase below writes its own handoff and adds its standing rule. New code is written as
arrow functions from the start (review 10). All phases stay inside the held A2–B4 change set: still no commit or deploy before
Phase R.

### Phase R1: Pay what's owed before a schedule changes (review findings 1 and 6)
**The problem, plainly.** When a partner cancels a Live Trivia game, the database deletes that game's answers along with the
schedule (`live_showdown_answers.schedule_id` is `on delete cascade`, and `deleteAdminLiveShowdownSchedule` also deletes them
itself), and only then does the prize cascade run. A2's "settle, then retire" therefore runs too late. The payout sweeps read
the schedules as they are now, so they can't see the deleted game, and they can't score it because its answers are gone. Example: a
weekly-places prize on a schedule that runs Tue + Thu. Tuesday is played. On Wednesday the partner cancels the schedule. The
prize is retired, and Tuesday's leaders are never paid. (A schedule with only Tuesday is normally paid by the 5-minute cron
before anyone could cancel. The gap is a week that isn't finished yet, or a game cancelled within 5 minutes of ending.)
Second, `settleBeforeRetiring` runs the cron's **platform-wide** sweeps (`resolveGameWinnerRewards` →
`findEndedOccurrences` → `loadScheduleRows()` reads every schedule; `resolveRankedPlaceRewards` reads every active places prize)
inside one partner's request. That is wasted reads and slower requests as venues grow (finding 6).

**Fix: settle first, for one venue, while the schedule and its answers still exist. Then change the schedule.**
1. **Venue-scoped sweeps.** `resolveGameWinnerRewards(nowMs, { venueIds })` and `resolveRankedPlaceRewards(nowMs, { venueIds })`
   take an optional scope. `findEndedOccurrences` gains an optional `venueIds` (read with `loadLiveTriviaSchedulesForVenues`,
   not `loadScheduleRows`), and `listActiveRankedPlaceCampaigns` gains an optional venue filter. With no scope the cron's
   behaviour is unchanged, byte for byte (`/api/cron/resolve-live-trivia-winners` passes nothing).
2. **One pre-change step**, `settleVenueBeforeScheduleChange({ venueId, scheduleId, change, nowMs })` in
   `lib/rewardGameSlotCascade.ts`, is called at the top of `deleteAdminLiveShowdownSchedule` and `updateAdminLiveShowdownSchedule`
   (`lib/liveShowdownAdmin.ts`, edit and transfer; for a transfer, both the old and the new venue). It is called **before**
   `trivia_session_questions`, `live_showdown_answers` or `trivia_schedules` is touched. It does three things:
   - (a) It runs the A3 dry run (`runCascade` with the change simulated, the same code `previewScheduleChangeToRewards` uses, never a
     second rule set) to find the prizes the change would end, retire or shrink.
   - (b) If any of them is a game-winner or weekly-places prize, it runs the venue-scoped sweeps while the schedule still exists.
     That pays any game at the venue that ended in the last 6 hours, and any finished week.
   - (c) For a weekly-places prize the change would **retire** while its current week has already-played nights, it **closes that
     week now** (Q5, default yes). It takes the week's games that have ended (`planCurrentRankedWeek`, `endMs ≤ now`), uses the
     same week key (`computeCycleStart`) and pays through the same `awardRankedCyclePlaces` RPC. That settlement row stops the
     cron paying the week a second time.
   Error scopes are matched against the **pre-change** schedule ids, so they include the schedule being deleted. That fixes the
   `venueScheduleIds` half of finding 1.
3. **If a prize the change would end can't be confirmed as paid, the change is refused** (Q6, default). It throws
   `ScheduleChangeSettlementError`. The owner routes (`DELETE`/`PATCH /api/owner/schedule/[id]` via `lib/ownerSchedule.ts`) and
   the admin routes answer 409 with "Couldn't pay this game's prizes first. Try again." Nothing is deleted, so retrying is safe.
   A change that ends nothing payable never refuses.
4. **The cascade after the write no longer pays anything.** Delete `settleBeforeRetiring`. `retireLiveTriviaPrizesWithNoGamesLeft`
   gets `settledCampaignIds` from step 2. It retires a prize only if it is in that set, or has nothing to pay (a points target).
   Any other orphaned prize stays active with a report error. That guards the rare case of a second edit landing between the
   two steps. Rule 2 is unchanged (retire, never delete).
5. **Traps.** `lib/liveShowdownAdmin.ts` ↔ `lib/rewardGameSlotCascade.ts` import each other lazily: keep the dynamic `import()`,
   and use no top-level `const` that the other module reads while loading. If the delete fails after a week was closed early,
   the week stays closed with the nights played so far. That is acceptable, and the code logs `[rewards] week-closed-early`.
   Read the Live Trivia weekly places plan's settlement notes in `lib/liveTriviaRankedRewards.ts` (header) before step 2c.
6. **Tests** (extend `tests/lib.reward-cascade-no-games-left.test.ts`, `tests/lib.reward-cascade-dry-run.test.ts`):
   - The finding's scenario: Tue + Thu schedule, Tue played, cancel Wed. Tuesday's leaders are paid before the delete, the prize
     is retired after it, and the delete runs after the payout. Assert the order of the mocked calls.
   - A game-winner game that ended 2 minutes before the cancel is paid first.
   - A failed sweep refuses the delete, and nothing is deleted.
   - A change that ends nothing runs no sweep.
   - The sweeps are called with `{ venueIds: [venueId] }`, never unscoped, from the request path.
   - The cron's unscoped call is unchanged.
   - An edit and a transfer follow the same order.
- **Built (R1, 2026-11-09):** as specified, Q5 and Q6 as their defaults. Departures: (1) a refusal also covers a payable prize the
  change only **shrinks** (a pinned game-winner prize losing one of its games loses that game's payout the same way); (2) a
  weekly places prize the sweep would never pay (not `live_trivia_challenge`, or failing `rankedRewardConfigError`) owes nothing,
  so it neither blocks nor gets a week closed; (3) log tags are `[RankedReward] week-closed-early` and `[RewardCascade]
  schedule-change-refused` (the wording contract refuses a new `[rewards]` string); (4) a failed `venue_id` read on delete now
  throws instead of deleting unsettled. See the R1 handoff.
- Out of scope (Q7): cancelling **one of two** schedules mid-week still drops the cancelled schedule's played night from
  that week's standings (its answers are deleted). That happened before A2 too, and needs schedules that keep their played history.
  Admin "reset answers" (`resetLiveShowdownAnswersForSchedule`) is an admin repair tool and stays as it is.

### Phase R2: The line on a player's pick is the line it's graded by (review finding 2)
**The problem, plainly.** A spread pick made **before** a partner turned on a pick window has no recorded line. Settlement
correctly grades it by the global line locked at kickoff, which is how it was promised when it was made. But the list shows it
the bar's frozen line: `lib/pickem.ts` uses `recordedPickLine(pick) ?? frozen ?? global`, and `lib/nflPickEm.ts` uses `frozen ?? global`
plus a recorded-line overlay. So the player sees −3.5 and is graded at −6.5, which breaks B3's promise.

**Fix: on screen, the line follows the same choice settlement makes. Grading is not touched.**
1. One pure helper in `lib/pickemFrozenLines.ts`, `lineShownForGame({ pick, frozen, global })`:
   - a pick with a line on its row (recorded while pending, or the line it was graded by) → that line;
   - a **pending pick with no recorded line → the global line** (what settlement will use, never the frozen line);
   - no pick → the frozen line if there is one, else the global line.
2. `applyCollegeSpreadLines` (`lib/pickem.ts`, the loop around line 2142) and the NFL overlay in `listNFLPickEmGames`
   (`lib/nflPickEm.ts`, around lines 1369 and 1448) both call it. Neither keeps its own `??` chain.
3. A side switch inside the window still records the frozen line (B3, unchanged). Only then does the pick move to the frozen line.
4. Tests: the finding's scenario for college and NFL; a windowed pick shows its recorded line; no pick shows the frozen line; a
   graded pick shows the line it was graded by. A contract line in `tests/pickem-frozen-lines-contract.test.ts` says both lists choose
   only through `lineShownForGame`. Re-run `npm run test:pickem-frozen-lines-sql` (unchanged SQL, regression only).
- Read the Pick 'Em plan's standing rules first. Do not touch `settlePendingPickEmPicks` or `pay_pickem_points`.
- **Built (R2):** `lineShownForGame` in `lib/pickemFrozenLines.ts` (as specced; a pick that is not pending and has no line, e.g.
  canceled, also shows the global line, never the frozen one). `applyCollegeFootballLines` calls it once per game; `listNFLPickEmGames`
  calls it for every game (no pick yet) and again in the pick loop for a game the player picked. `recordedPickLine` is unchanged
  (settlement still uses it). Settlement, the pick paths and the SQL are untouched. See the R2 handoff.

### Phase R3: Opening a bar away keeps its screen and its once-a-minute limit (review findings 3 and 4)
**The problem, plainly.** Opening a bar view-only goes through `navigateToResolvedVenue` → `hardClearAuthAndCachePreserveVenue`
→ `clearClientState`, and that clears **all** of sessionStorage. It erases two things C1/C2 stored there:
- **(3)** The Venue Home screen the push saved (`savePlayerPanel`). The hop `/venue/B?panel=prizes` → `/?v=B` (VenueHubClient's
  venue-mismatch redirect) also drops `?panel=`. So a "New at Bar B" prize push opens on Games, not Prizes.
- **(4)** The auto-open stamp `ht:away-auto-open-at`. Two website tabs on different bars then switch the session back and
  forth with no pause.

**Fix: carry the screen in the URL, and write the stamp after the clear.** Never exempt keys from `clearClientState`, which is
the sign-out clear.
1. **Screen.** A helper in `lib/pushLanding.ts`, `signInListPath(venueId, search)`, returns `/?v={id}` plus the current `panel`
   when there is one. Every `/?v=` redirect in `components/venue/VenueHubClient.tsx` (the venue-mismatch, late-mismatch and
   missing-cookie redirects, lines ~490–530, ~1156, ~1233) uses it. `app/page.tsx` passes `panel` to `JoinFlow` as `initialPanel`
   (parsed by `venuePanelFromSearch`). `navigateToResolvedVenue` takes `panel` and appends `&panel=` to its hard target when the
   venue opened is the one the URL asked for (`venueParam`), whether opened away or by an in-range tap. `VenuePanelFromUrl`
   already applies it on Venue Home and drops it. The `savePlayerPanel` call in `NativePushRuntime` stays as a fallback.
2. **Throttle.** The once-a-minute rule moves to `lib/venueAwayMode.ts`: `awayAutoOpenAllowed(nowMs)` reads the stamp, and
   `markAwayAutoOpen(nowMs)` writes it. `navigateToResolvedVenue` calls `markAwayAutoOpen` **after**
   `hardClearAuthAndCachePreserveVenue`, for an automatic away open only. The `useEffect` in `JoinFlow` (around line 1712) only
   reads the stamp. The stamp stays per tab in sessionStorage. That is enough to stop the ping-pong: each tab keeps the time of
   its own last automatic open, so a bounced tab waits.
3. Tests:
   - The finding 3 scenario: a prize push to bar B while signed in at A lands on Prizes (`tests/lib.push-landing.test.ts` +
     `tests/components.venue-away-mode.test.ts`).
   - After `clearClientState`, an automatic open leaves the stamp in place (unit).
   - A second automatic open within 60 s is skipped.
   - A contract line in `tests/away-mode-contract.test.ts` checks that `markAwayAutoOpen` comes after the clear in
     `navigateToResolvedVenue`.
   Run `npm run test:god-mode-join` (join flow standing rule).
- Read `docs/join-flow-location-error-plan.md` "Standing rules" first. Geolocation stays after auth, and God Mode is unchanged.
- **Built (R3, 2026-11-09):** as specced, plus: (1) `navigateToResolvedVenue` also re-saves the screen with `savePlayerPanel`
  after the clear (the same "write after the clear" fix, so the C2 fallback still works); (2) VenueHubClient reads the panel from
  `mountSearchRef`, the URL captured during its first client render, because `VenuePanelFromUrl` is a child and its effect drops
  `?panel=` before the redirect effects run; (3) small helpers `withVenuePanel`, `venuePushPanelFromValue`,
  `venuePushPanelFromSearch` and `playerPanelForPushPanel` in `lib/pushLanding.ts`. Unit/contract tests only; no browser run.

### Phase R4: Three small fixes (review findings 5, 7 and 8)
- **(5) "Remind me" claims in chunks.** `sendOptInReminderPushes` (`lib/push/gameReminders.ts:193`) sends every game starting
  within the hour in one `claim_game_reminder_optins` call. The RPC raises above 200 games
  (`20261109214742_push_game_reminder_optins.sql`), so on a busy night no reminder goes out at all. Fix:
  - Add `OPT_IN_CLAIM_MAX_GAMES = 200`, with a comment naming the migration's limit.
  - Claim with `chunkIds(games, OPT_IN_CLAIM_MAX_GAMES)` (the default `POSTGREST_ID_CHUNK` is 150, which also works; pass the
    constant so the tie to the RPC is explicit), one chunk after another.
  - A failed chunk records `report.optIn.error` and the loop goes on. Rows already claimed are still sent.
  - `claimed` counts across all chunks.
  - No migration change.
  - Tests: 450 games → 3 calls, each of at most 200; the 2nd chunk fails → the 1st and 3rd are still sent; one phone gets one
    push per game across chunks.
- **(7) A pick window that wraps on the same day.** `pickWindowOpenWeekdays` (`lib/pickemPrizeWizard.ts:258`) counts days by
  weekday difference. "Mon 12:00 PM → Mon 8:00 AM" (about 6.8 days) is therefore counted as Monday only, and the wizard wrongly
  says picks are open "Mon … only". Fix:
  - Move the function to `lib/pickemPickWindow.ts` (window meaning lives there, B4 rule).
  - Derive the days from `pickWindowLengthMinutes`. A weekday counts when any minute of it falls in [opening, opening + length)
    on the week's clock. A close at exactly 12:00 AM still leaves its day out.
  - Delete the wizard's copy.
  - Tests in `tests/lib.pickem-pick-window.test.ts`: Mon 12 PM → Mon 8 AM = all 7 days; Mon 8 AM → Mon 12 PM = Mon;
    Mon 12 AM → Wed 11:59 PM = Mon–Wed; Mon 12 AM → Thu 12 AM = Mon–Wed; Fri 6 PM → Mon 12 AM = Fri–Sun.
  - Plus the finding's wizard case in `tests/lib.pickem-prize-wizard.test.ts` (no notice).
- **(8) The Save on an edit waits for the warning.** In `components/owner/schedule/ScheduleGameFlow.tsx`, the edit's dry run
  (`editImpactKey`, line ~194) isn't awaited, so a fast Save can retire prizes before "Also ends: …" appears. Fix, mirroring
  `cancelChecking`:
  - `editChecking = editImpactKey !== null && editImpact?.key !== editImpactKey`.
  - Review's `WizardFooter` gets `nextDisabled={editChecking}`, and `save()` returns early while checking.
  - It still fails open: a failed check sets the key with no notice, so Save turns back on.
  - The admin flow already waits (`SchedulesSection.tsx` `scheduleImpactNotice` before `confirm`).
  - Test in `tests/components.owner-schedule-flow.test.ts`: Save is disabled until the check returns, then enabled with the
    line shown. Check at 350 px (no new copy).
- **Built (R4, 2026-11-09):** as specced. (5) `OPT_IN_CLAIM_MAX_GAMES = 200` in `lib/push/gameReminders.ts`; a failed chunk sets
  `report.optIn.error` (last failure wins) and is logged, the loop goes on. (7) `pickWindowOpenWeekdays` now lives in
  `lib/pickemPickWindow.ts` (exported, returns `Set<PickWindowDay>`); the wizard imports it. (8) `editChecking` in
  `ScheduleGameFlow.tsx` disables Save and `save()` returns early. The wizard's no-notice case is in
  `tests/lib.pickem-pick-window-form.test.ts` (where the notice tests already live), not `tests/lib.pickem-prize-wizard.test.ts`.

### Phase R5: One look-only payload for Category Blitz (review finding 9)
- **(9)** `app/api/category-blitz/sessions/route.ts` builds the peek response twice:
  once in the not-at-the-bar branch (D8) and once in `peek=1`. Fix:
  - One helper, `buildPeekPayload({ roomId, venueId, now })`, in the route file or `lib/categoryBlitz.ts`. It returns `session`
    (merged with the continuous timing, `venueId` concealed), `nextWindowAt`, `realtimeChannel` and `live`.
  - The D8 branch adds `scheduleWindowEndAt: null` and the two server clocks. `peek=1` returns the helper's result as it is.
  - The response shapes don't change: today's two shapes are pinned by `tests/api.category-blitz-sessions.test.ts`; add a
    case where both branches conceal the room id.
  - Read `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md` "Standing rules" first: a round starts only from the game page's
    sessions GET.

- **Built (R5, 2026-11-09):** as specced; the helper is in the route file. D8 drops the helper's `live` so both shapes are unchanged.

### Phase R6: Arrow functions (review finding 10)
- Do this last: R1–R5 change the same files. CLAUDE.md asks for arrow functions. The A2–B4 change set added function declarations:
  - in new files: `lib/pickemFrozenLines.ts` (5), `lib/pickemPickWindowGate.ts` (4), `lib/liveTriviaScheduleSlots.ts` (4);
  - in changed files: `SchedulesSection.tsx` `scheduleImpactNotice`, `PickEmGameList.tsx` `isValidStartDateKey`,
    `VenuePresenceBoundary.tsx` `isVenueAwayFailure`, `liveShowdownAdmin.ts` `editCascadeInputs` and
    `previewLiveShowdownScheduleChange`, `liveShowdownEngine.ts` `findUpcomingScheduleOccurrence`, `nflPickEm.ts`
    `nflFrozenLineColumnsForPick`, `ownerSchedule.ts` `previewOwnerScheduleChangeNotice`, `pickem.ts` `applyPickWindowToGames` and
    `readVenueGameSettingsForDisplay`, `rewardGameSlotCascade.ts` (`previewScheduleChangeToRewards`,
    `mergeScheduleChangePreviews`, `describeScheduleChangePreview`, `runCascade`, `isRule4Candidate`, `prizeHasGameLeft`,
    `simulateScheduleChange`, `retireLiveTriviaPrizesWithNoGamesLeft`), `venueGameSettings.ts` `withColumnFallback`,
    `venuePresence.ts` `isVenuePresenceLive`.
  Convert these to `const` arrow functions, and nothing else. Declarations that were already in a file before this work stay as
  they are, to avoid churn. R1 deletes `settleBeforeRetiring`.

  Regenerate the list first, because R1–R5 change it:
  `for f in $(git diff --name-only -- lib app components); do git diff -U0 -- "$f" | grep -E '^\+\s*(export )?(async )?function ' | sed -E 's/.*function ([A-Za-z0-9_]+).*/\1/' | while read fn; do git show HEAD:"$f" 2>/dev/null | grep -qE "function $fn\b" || echo "$f $fn"; done; done`
  Then add the untracked `.ts`/`.tsx` files.

  Trap: a declaration is hoisted and a `const` isn't. Move any helper that is used above its definition at module load, and
  re-check the lazy import cycle between `liveShowdownAdmin.ts` and `rewardGameSlotCascade.ts`. Typecheck and `npm run test`
  must pass with no other change.

### Remedial phases R7–R10 (from Phase R's third `/code-review`, 2026-11-10)

The third review (high, 2026-11-10, run after the second review's fixes) found 8 problems in the held A2–B4 + R1–R6 work. Each
was checked against the code on 2026-11-10 and is real. Nothing is committed, deployed or migrated, and no bar has a pick
window yet, so **no production data needs repair**. The R1–R6 rules apply: arrow functions only, each phase writes
`docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_R<N>_HANDOFF.md` and updates its standing rule below, and nothing is
committed or deployed before Phase R. Line numbers are as of 2026-11-10.

### Phase R7: Schedule changes pay after the write, from one read (third review, findings 2, 4 and 5)
**The problem, plainly.**
- **(2)** R1's early week close (`closeRankedWeekEarly`, called from `settleVenueBeforeScheduleChange`,
  `lib/rewardGameSlotCascade.ts` ~729) pays a weekly places prize's current week **before** the schedule is written. If the
  write then fails, or the real cascade doesn't retire the prize, the prize stays active with its week already settled.
  Example: Monday is played, and a partner edits the bar's only weekly game and changes its rounds. The week is paid on
  Monday alone. Then `buildLiveShowdownQuestionMatrix` (`lib/liveShowdownAdmin.ts` ~883) throws, the edit fails with a 500,
  and the prize stays active. Thursday's game runs, but the cron sees the week as settled (`isWeekSettled`), so Thursday's
  winners get nothing.
- **(4)** The edit's legacy branch, for a database without `recurring_type` / `recurring_days` (~946–985), tells the cascade
  `survivingRecurrence: "none"` and only the start weekday. The settle's dry run used the edit's real recurrence. Rule 3 can
  then retire a pinned game-winner prize the settle never paid, because rules 1–3 don't check `settledCampaignIds` (only rule
  4 does).
- **(5)** Every Live Trivia edit or delete at a bar with a places or winner prize repeats its reads, even a rename. Campaigns
  are read twice. `trivia_schedules` is read at least four times: by the dry run's rule 4 (`listVenueLiveShowdownSchedules`),
  by the settle (`loadLiveTriviaSchedulesForVenues`), inside each sweep, and by the real rule 4. Each sweep also reads
  campaigns again. The cost rule asks for one bounded read per run.

**Fix.**
1. **Rank the early-closed week before the write, and pay it only when the prize is really retired.**
   - Split `closeRankedWeekEarly` (`lib/liveTriviaRankedRewards.ts`) into two parts:
     - `planRankedWeekEarlyClose({ campaign, schedules, nowMs })` reads the settlements and the week's totals while the answers
       still exist, ranks with `rankWeekPlaces`, and writes nothing. It returns a plan (`campaignId`, `venueId`, `cycleStart`,
       `places`, `participantCount`, game count), or `nothing_played` / `already_settled`.
     - `payPlannedWeekClose(plan, now)` pays through `awardRankedCyclePlaces`. This is the same RPC, still the only writer, and
       it refuses a week that is already settled.
   - The sweep's `settleRankedWeek` uses the same ranking and award helpers, so there is still one settle path.
   - `settleVenueBeforeScheduleChange` returns `{ settledCampaignIds, weekCloses }`, where `weekCloses` is a
     `Map<campaignId, plan>`. It writes no early-close settlement. A plan that can't be built (a read fails) still refuses the
     change (Q6).
   - `updateAdminLiveShowdownSchedule` and `deleteAdminLiveShowdownSchedule` pass `weekCloses` to
     `cascadeScheduleChangeToRewards`. In the real run, when rule 4 finds an orphaned places prize that has a plan, it pays the
     plan first, then retires the prize. `awarded`, `no_winner` and `already_settled` all count as paid.
   - If that payment fails, the prize stays active and the report gets `NOT_RETIRED_UNSETTLED_MESSAGE`. Log
     `[RankedReward] early-close-award-failed` with the whole plan (user ids, places, cycle start) so it can be paid by hand.
   - A plan for a prize the real run does **not** retire is dropped unpaid. The week carries on, and the cron pays it as usual.
   - When the rounds change, the edit builds its question matrix (`buildLiveShowdownQuestionMatrix`, a read with no writes)
     **before** the settle. A matrix failure then refuses the edit with nothing paid or written.
   - Accepted trade-off: if the payment fails after a **delete**, that week's played nights can only be paid by hand, because the
     answers are gone. The log line has everything needed. Today's failure is worse: a week paid early silently blocks the
     rest of that week.
2. **One set of inputs for the settle and the cascade, and no legacy branch.**
   - Delete the fallback for a database without recurrence columns from `updateAdminLiveShowdownSchedule`. Production has the
     columns: `listVenueLiveShowdownSchedules` filters on them, with no fallback, on every Venue Home load (checked 2026-10-04).
     Confirm first with one read-only query: `select recurring_type, recurring_days from trivia_schedules limit 1`, run via
     `node --env-file=.env.local`. A missing column now throws like any other failed update.
   - Leave the fallbacks in `createAdminLiveShowdownSchedule` and `listAdminLiveShowdownSchedules`. They are out of scope.
   - Compute `editCascadeInputs(...)` once, into one const. The settle (`venueChangesForEdit`) and the cascade after the write
     both use that const.
   - Defence in depth: in a real (non-dry) run, rules 1–3 prune, deactivate or retire a game-winner prize only when it is in
     `settledCampaignIds`. Otherwise they report `NOT_RETIRED_UNSETTLED_MESSAGE` and leave the prize alone. Every cascade call
     is in `lib/liveShowdownAdmin.ts` and runs after the settle (checked 2026-11-10). So this guard changes nothing when the dry
     run and the real run agree.
3. **Fewer reads.**
   - **Skip edits that move no game.** Two reads get more columns:
     - The existing-row read in `updateAdminLiveShowdownSchedule` (today `num_rounds, venue_id`).
     - The one in `previewLiveShowdownScheduleChange` (today `venue_id`).
     Both read `start_time, timezone, recurring_type, recurring_days, num_rounds, venue_id`. When none of these changes (a
     title or ad edit), skip the settle, the cascade and the preview's dry run, and return an empty report or preview. It is
     still the same single read.
   - **Read once in the settle.** `settleVenueBeforeScheduleChange` reads the venue's campaigns once, and its schedules once
     with `loadLiveTriviaSchedulesForVenues([venueId])`.
     - `runCascade` takes an optional `preloaded: { campaigns, schedules }`. The dry run's rule 4 maps those rows with
       `mapScheduleRow` instead of reading again. It applies the 24-hour one-off filter, which `listVenueLiveShowdownSchedules`
       does in SQL, in JS.
     - `PayoutSweepScope` gets optional `campaigns` and `schedules`. Given them, `resolveGameWinnerRewards` and
       `resolveRankedPlaceRewards` read no campaigns or schedules. They filter in JS exactly as their queries do; mirror
       `listActiveRankedPlaceCampaigns` and `findEndedOccurrences`.
     - Settlement, answer and totals reads are unchanged. The cron passes neither, and its behaviour is unchanged.
   - The cascade after the write keeps **one** fresh campaigns read and **one** fresh schedules read. They must be fresh: the
     sweeps have just written winners, and the schedule has changed. The real rule 4 must not read schedules a second time.
   - Estimate (2026-11-10):
     - An edit that moves games at a bar with a places or winner prize: about 3 campaign reads + 5 schedule reads today, 2 + 2
       after (settlement and totals reads unchanged).
     - A rename: the one existing-row read and nothing else.
     - Partner edits run to tens a day, so the money saved is small; the main gain is speed. No new cost.
4. **Tests** (`tests/lib.live-showdown-schedule-change-order.test.ts`, `tests/lib.reward-cascade-no-games-left.test.ts`,
   `tests/lib.reward-cascade-dry-run.test.ts`, `tests/lib.live-trivia-ranked-rewards.test.ts`, the winner-rewards test):
   - Finding 2:
     - The rounds change and the matrix throws: no award RPC, nothing written, prize active.
     - A delete's schedule write fails after the settle: no award.
     - A delete succeeds: the award runs after the schedule delete and before the retire (assert the mocked call order).
     - The award fails: the prize stays active and `early-close-award-failed` is logged.
     - The real rule 4 keeps a prize that has a plan: no award.
   - Finding 4:
     - A contract line that the update has no legacy branch.
     - A real run where a pinned game-winner prize is not in `settledCampaignIds`: it is not pruned or retired, and an error is
       reported.
   - Finding 5:
     - A rename makes one `trivia_schedules` read, no campaign read and no sweep.
     - An edit that moves games makes exactly one campaigns read and one schedules read in the settle, and one of each after
       the write (count the mocked calls).
     - The sweeps given `campaigns` / `schedules` make no read of their own.
     - The cron's unscoped call is unchanged.
   - Re-run `tests/api.owner.schedule.test.ts` and the A3 preview tests.
- Read first: R1's standing rule, the header of `lib/liveTriviaRankedRewards.ts`, and R1's import-cycle trap (step 5: keep the
  lazy `import()` between `liveShowdownAdmin.ts` and `rewardGameSlotCascade.ts`). Update standing rule R1.
- **Built (R7, 2026-11-10):** as specified. The recurrence columns were confirmed in production first (read-only query). Details:
  (1) the settle reads the venue's prizes first and returns at once, with no schedule read, when there is no game-winner or places
  prize (the old dry run's result was unused in that case); (2) `planRankedWeekEarlyClose` returns `planned` / `nothing_played` /
  `already_settled`, and the RPC's statuses (`awarded`, `no_scorers`, `below_minimum`, `already_resolved`) all count as paid;
  (3) the "nothing moved" test is `scheduleEditMovesGames` (start instant, zone, recurrence, days, rounds, venue; a missing row
  counts as moved); (4) the dry run's preloaded rows are filtered by `venueSchedulesFromRows`, the JS mirror of
  `listVenueLiveShowdownSchedules`; (5) the winner sweep reads preloaded rows through a new pure `endedOccurrencesFromRows`
  (`lib/liveShowdownEngine.ts`). See the R7 handoff.

### Phase R8: A pick's line is set when it's made (third review, findings 1 and 3)
**The problem, plainly.**
- **(1)** Switching sides on a spread pick made before the bar had a pick window saves the bar's frozen line
  (`...lineColumns`: `lib/pickem.ts` ~2280, NFL `lib/nflPickEm.ts` ~1681). Until that tap, R2's `lineShownForGame` showed
  the pick at the global line. Example: a College Football pick is made at a bar with no window, so no line is recorded. The
  partner then adds a window. The bar's line freezes at −3, and the global line moves to −6.5. The list shows −6.5 on the
  pick, and the player switches sides. The pick is saved and graded at −3, and the number on screen jumps after the tap.
- **(3)** NFL: when the pick's fresh settings read fails, `nflFrozenLineColumnsForPick` returns `{}`. A new pick at a bar with
  a window and spreads on is then saved with no line. It is graded by the line locked at kickoff, not the −3 the list showed.
  College has the same gap for an **existing** spread pick (`!params.settings?.pickWindows` skips the freeze), and (1)'s fix
  closes it. A new college pick with no settings is already refused.

**Fix: a pick's line is fixed when the pick is made, and switching sides never changes it.**
1. **Side switch, both engines.** The update writes no `home_spread` / `away_spread`.
   - A pick with a recorded line keeps it. That line is the bar's insert-once frozen line anyway.
   - A pick without one stays on the global line, which is what R2 shows and what settlement uses.
   - College: `resolvePickScoringMode` runs the frozen-line step only for a new pick (`!existing`). The spread-mode "line must
     exist" check stays for both.
   - NFL: move `nflFrozenLineColumnsForPick` after the existing-pick read, and call it only for an insert. This also saves one
     RPC per switch.
   - Clearing a pick and making it again counts as a new pick, so it takes the frozen line. That matches the screen: with the
     pick cleared, R2 shows the frozen line.
2. **NFL with a failed settings read (new pick only).** Look up the bar's stored frozen line for that game, read-only
   (`frozenLineForPick` with `globalLine: null` does exactly this read).
   - Found: record it.
   - None: save with no line. A list shows a frozen line only after storing it, so this player saw the global line.
   - The lookup fails: refuse with `PICKEM_FROZEN_LINE_FAILED_MESSAGE`.
   - B1's fail-open rule for the window is unchanged. Only the line lookup can refuse, and only when both reads fail.
3. **Optional** (Phase R's deferred finding): if the game from `listNFLPickEmGames` already carries its global line, pass that
   to `frozenLineForPick` instead of re-reading it with `getNFLPickEmGameLine`. Do this only if it is a small change.
4. **Tests:**
   - Finding 1, college and NFL: switching a pick with no line → the update has no spread columns, and the list still shows the
     global line.
   - Switching a pick that has a recorded line keeps that line.
   - Clear and re-pick → the frozen line.
   - Finding 3, NFL with no settings: a stored frozen line → the pick records it; no frozen line → no line; the lookup fails →
     refused.
   - A contract line in `tests/pickem-frozen-lines-contract.test.ts`: no pick update spreads line columns.
   - Re-run `npm run test:pickem-frozen-lines-sql` and `npm run test:pickem-lines-sql` (the SQL is unchanged).
- Read the Pick 'Em plan's standing rules first. Don't touch `settlePendingPickEmPicks` or `pay_pickem_points`. Update
  standing rules B3 ("insert and side switch" becomes "insert only") and R2.
- **Built (R8, 2026-11-10):** as specified. College: `resolvePickScoringMode` freezes only when `!params.existing`, and the
  side-switch update in `submitPickEmPick` has no `...lineColumns`. NFL: `nflFrozenLineColumnsForPick` runs after the
  existing-pick branch (insert only); with `settings` null it skips the global-line read and calls `frozenLineForPick` with
  `globalLine: null` (read-only). The optional item 3 (reuse the list's global line) was **not** done: `NFLPickEmGame` carries
  no `sourceVendor`, and the list in `submitNFLPickEmPick` is called without `pickWindow`, so its `homeSpread` can be the
  player's own pick's line. It would need a new field on a shared type, which is more than a small change. No SQL changed.

### Phase R9: Auto-open waits for a real location; pick ahead snaps back on the server (third review, findings 6 and 7)
**(6) The problem.** The `/?v=X` auto-open (`components/join/JoinFlow.tsx` ~1728) treats any recent bar missing from
`venueList` as away. When the location check fails or times out, `buildVenueListAfterAuth` commits no list, so the list is
empty. The bar the player is standing in then opens view-only by itself. It isn't recorded as joined, and the auto-open stamp
blocks another try for a minute.
**Fix.**
- Auto-open only when this sign-in's list was built from a real location:
  `venueListState.builtForGeneration === venueListState.generation`. This is the same test `decideScannedVenue` uses for
  "not-ready".
- Put the decision in one pure helper, `awayAutoOpenTarget({ venueParam, awayVenues, listBuilt })`, in `lib/venueAwayMode.ts`.
- Set `autoOpenedAwayVenueRef` only when the helper returns a bar. Then, if the player taps Retry and the check succeeds with X
  out of range, the auto-open still happens.
- The manual "Your bars" rows stay visible when the location check fails (Q9 default). Tapping one is the player's choice.
- Tests:
  - A failed location check → no auto-open and no stamp.
  - Retry succeeds with X out of range → auto-open.
  - X is in range → no auto-open.
  - God Mode is unchanged.
- Run `npm run test:god-mode-join`. Read `docs/join-flow-location-error-plan.md` "Standing rules" first.

**(7) The problem.** `PickEmGameList` (~457) snaps a future day back to today only after it has fully loaded that day.
- A deep link to a future `initialDate` (now allowed up to 7 days) for a sport with no window asks BallDontLie for that day,
  then loads today as well.
- On a sport switch, the previous sport's `pickAheadThrough` keeps the next-day arrow on until the reply arrives.
- A failed settings read during a background refresh also sends the player back to today.

**Fix.**
- **The server picks the day before the provider call.**
  - `/api/pickem/games` passes `clampToPickAhead: true`. It is display only: the `skipLines` call from `submitPickEmPick` must
    still find future games, so it never clamps.
  - `listPickEmGames` then works out the reach first. Split the `pickAheadThrough` part out of `applyPickWindowToGames` into
    `pickAheadReach(...)`, with the same 30 s display cache and the same `pickAheadHorizonMs`.
  - A future date that the reach doesn't cover is served as today. The response's existing `date` field says which day was
    served.
  - That is one provider-backed load instead of two.
- **The client follows `date`.**
  - Normal load: when `payload.date` differs from the day asked for, set `selectedDate` to it. Mark that sport and day as
    already loaded (a ref), so the effect doesn't load it again.
  - Background refresh: ignore a reply for a different day (no state changes). A brief settings failure then never moves the
    player.
- **Sport switch.** In the sport button's handler, clear `pickAheadThrough`. If `selectedDate` is after today, set it to today
  before the load. The sport buttons show only on today, but a deep link can pair a sport with a future day.
- Tests:
  - Route: a sport with no window and a future date → the provider is asked for today only, and `date` is today.
  - Route: a sport with a window, within reach → the future day is served.
  - Component: a deep link to a future day for MLB → one fetch.
  - Component: a background reply for another day → ignored.
  - Component: switching sport turns the next-day arrow off at once.
- Update standing rule B2.
- **Built (R9, 2026-11-10):** as specified. `awayAutoOpenTarget` is in `lib/venueAwayMode.ts`; the `/?v=X` effect in
  `JoinFlow.tsx` passes `listBuilt: venueListState.builtForGeneration === venueListState.generation` and sets the ref only when a
  bar comes back (God Mode builds a list too, so it is unchanged). Server: `pickAheadReach` split out of `applyPickWindowToGames`;
  `clampToPickAhead` only from `app/api/pickem/games/route.ts`. Client: `servedDayKeyRef` skips the one reload after the list
  follows `payload.date`. Weeks (NFL) are never clamped. No SQL, no new request, no new provider call (one fewer on the deep link).

### Phase R10: One "at the bar" rule for Category Blitz and every write (third review, finding 8)
**The problem, plainly.**
- `isVenuePresenceLive` (`lib/venuePresence.ts` ~716) counts a row as present while `now − last_verified_at ≤ 2 × TTL`
  (30 minutes), even when its status is `expired`.
- Every write refuses once `expires_at` passes (15 minutes; `getActiveVenuePresence`).
- So a player who has left can start or wake Category Blitz rounds from home for another 15 minutes, while picks, squares and
  brackets already answer "Play at the bar."
- The slack exists because the heartbeat runs a few seconds after the lease ends. It waits 15 minutes after the last check
  finished (`PRESENCE_CHECK_INTERVAL_MS`, `components/venue/VenuePresenceBoundary.tsx`), then takes a location fix. Without the
  slack, a strict check would flicker for a player who is there.
- Writes already have that same few-second gap today.

**Fix (Q8 default).**
1. Add one pure predicate, `presenceRowAllowsPlay(row, nowMs)`: status `active` and `expires_at > now`. Both
   `getActiveVenuePresence` and `isVenuePresenceLive` use it, with no grace of their own. In `getActiveVenuePresence` it
   replaces only the decision; its `expired` write and telemetry stay.
2. Close the heartbeat gap at the lease, not the check.
   - Set `VENUE_PRESENCE_TTL_MS` to 16 minutes (from 15).
   - In `getVenuePresenceTuningConfig`, raise the env clamp's `max` to 16 minutes. `VENUE_PRESENCE_TTL_MS` isn't set in Vercel
     (checked 2026-11-10).
   - The heartbeat stays at 15 minutes. A player who stays at the bar then never sees the lease lapse, for writes or for
     Category Blitz.
   - Reword both comments that say the two values "must stay in sync": the lease now outlives the heartbeat by 1 minute.
   - Cost: none, since the number of heartbeats is the same.
   - Effect: someone who has left keeps write access for up to 16 minutes instead of 15. Category Blitz access drops from up to
     30 minutes to 16.
3. **Tests:**
   - An `expired` row is not live, and nor is an `active` row past `expires_at`.
   - An `active` row inside its lease is live.
   - Both functions agree on a table of rows (contract test, in a new `tests/lib.venue-presence-live.test.ts`).
   - The TTL is exactly 1 minute longer than `PRESENCE_CHECK_INTERVAL_MS` (contract).
   - Re-run `tests/api.category-blitz-sessions.test.ts` and `tests/away-mode-contract.test.ts`.
- Read `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md` "Standing rules" first. Update standing rule D8.
- **Built (R10, 2026-11-10):** as specified. `presenceRowAllowsPlay(row, nowMs)` (exported, `lib/venuePresence.ts`) decides
  for both functions; `getActiveVenuePresence` returns success through it first, then keeps its old failure branches (status
  telemetry; `expired` write + telemetry for a lapsed active row). `isVenuePresenceLive` now selects `status, expires_at`.
  `VENUE_PRESENCE_TTL_MS` = 16 min, env clamp max 16 min; heartbeat unchanged at 15. New `tests/lib.venue-presence-live.test.ts`;
  fixture times moved 15 → 16 min in `tests/lib.venue-presence-phase5.test.ts` and `tests/lib.venue-presence-god-mode.test.ts`.
  No SQL, no env change, no new request.

### Phase R: Review + release
- **The first review ran on 2026-11-09 and produced R1–R6.** The second (2026-11-10) was fixed in place (Phase R handoff). The
  third (2026-11-10) produced R7–R10. After R10, run `/code-review` at high again on the whole held diff (A2–B4 + R1–R10).
  - A finding caused by R7–R10 gets fixed.
  - Anything else goes to Andrew to decide, rather than automatically starting another remedial round.
  - Then run `npm run test`, typecheck, lint, build, and the SQL proofs above.
- Migrations: `supabase db push` only with Andrew's go-ahead. Then deploy.
- Add a row to CLAUDE.md's Feature rules table and fill this doc's Standing rules section. Update `SYSTEM_CONTEXT.md` §7/§8.

## 8. Open questions (defaults in §4 apply unless Andrew changes them)

**Andrew (2026-11-10): "our default decisions all work for me."** Every question below without an earlier answer takes its
default: Q2 = 1 hour before; Q4 = not now; Q5 = yes; Q6 = refuse the change; Q7 = out of scope (a separate plan only if wanted);
Q8 = one rule, 16-minute lease (R10); Q9 = keep listing "Your bars" (R9). Don't re-ask.

1. ~~**Q1, line freeze timing.**~~ Answered 2026-11-09: the recommended default, "first shown" (built in B3). You chose "freeze at window close". But a player picking Monday would then
   see a line that can still move until Wednesday. Freezing each game's line the first time it's shown in the window keeps
   one number for everyone **and** guarantees players are graded against what they saw. Recommended: first shown.
2. **Q2, remind-me lead time.** Default 1 hour before. Change?
3. ~~**Q3, "Your bars" list.**~~ Answered 2026-11-09: yes, with a 90-day expiry (D6). Built in C1.
4. **Q4, "You're near Pacific Street" alerts.** Not recommended now (needs "Always" location). Revisit after C3's opt-in numbers.
5. **Q5 (R1), a weekly-places prize ended mid-week by a cancel.** Should the week be paid early, on the nights already played?
   **Default: yes.** Players already played for it, and D1 keeps coupons already won. The other choice is to pay nothing for
   that week. R1 builds the default unless you say otherwise.
6. **Q6 (R1), the payout before a cancel fails (our outage).** **Default: refuse the cancel** ("Couldn't pay this game's prizes
   first. Try again."). Nothing is deleted, and the partner can retry. The other choice is to cancel anyway, which loses that
   payout for good, because the cancel deletes the game's answers.
7. **Q7 (not in R1–R6), cancelling one of two schedules mid-week.** The cancelled schedule's played night drops out of that
   week's standings, because its answers are deleted. This happened before this plan too. A fix means schedules that keep
   their played history (an "ended" schedule instead of a deleted one), which is a migration plus every schedule reader.
   Recommended: a separate plan, if you want it.
8. **Q8 (R10), how long "at the bar" lasts.** **Default:** writes and Category Blitz use one rule (the lease hasn't ended).
   The lease becomes 16 minutes, so the 15-minute location check renews it before it ends. The cost doesn't change. Someone
   who has left keeps access for up to 16 minutes, not 15 (Category Blitz today: up to 30). Other choices:
   - (a) Check every 14 minutes and keep the 15-minute lease. That is about 7% more location checks and heartbeat requests.
   - (b) Leave writes alone and give Category Blitz a short grace of its own (e.g. 1 minute).
9. **Q9 (R9), "Your bars" when the location check fails.** **Default:** keep listing them, so the player can still open one
   view-only; only the automatic open waits for a real location. The other choice is to hide them until the location check
   succeeds, as the QR scan does.

## Standing rules

Each phase adds the rules it creates here, and Phase R adds the CLAUDE.md pointer.

- **A1 (2026-11-09): one rule decides when a Venue Home prize card ends or leaves the panel:**
  `prizeCardEndState` in `lib/prizeCardEndState.ts`. Retired = `is_active = false` and `winner_user_id` null; such a card
  leaves unless the viewer won it **this cycle** (their own `challenge_cycle_winners` row, never `winner_user_id`). Won out
  (`winner_user_id` set) keeps its congrats card. A Pick 'Em Prize passes its own state (`pickemPrizeSnapshotState`), which
  wins. Both `getChallengeCampaignSnapshotForUser` and the public branch of `GET /api/challenge-campaigns` call it; never add a
  second drop/ended rule (`tests/retired-prize-card-contract.test.ts`).
- **A2 (2026-11-09): a Live Trivia prize not tied to one game ends when its venue has no Live Trivia game left for it**
  (rule 4, `lib/rewardGameSlotCascade.ts`). Candidates: active, one venue, Live Trivia **only**, not a slot-pinned
  game-winner prize (`isRule4Candidate`). "Game left" is `prizeHasGameLeft` over `liveOrUpcomingGameSlots`
  (`lib/liveTriviaScheduleSlots.ts`, the one "is this game still on" reading, shared with `lib/rewards.ts`). A failed
  schedule read retires nothing. Paying first is R1's rule (below); the cascade after the write pays nothing. Retire =
  `is_active = false`, never delete. The partner sentence comes only from `describeCascadeReport`
  (`tests/lib.reward-cascade-no-games-left.test.ts`).
- **A3 (2026-11-09): the warning before a cancel or edit is a dry run of the same cascade, never a second rule set.**
  `previewScheduleChangeToRewards` and `applyScheduleChangeToGameWinnerRewards` both go through `runCascade`
  (`lib/rewardGameSlotCascade.ts`); a dry run writes nothing and runs no payout sweep, and simulates the change with
  `simulateScheduleChange`. Owner: `GET` (cancel) / `POST` (edit) `/api/owner/schedule/[id]/cancel-impact` (owner auth, then
  venue check). Admin: `GET /api/admin?resource=live-showdown-schedule-impact`. The line comes only from
  `describeScheduleChangePreview`; the client fails open (no line) and "Yes, cancel game" waits for the check
  (`tests/lib.reward-cascade-dry-run.test.ts`, `tests/api.owner-schedule-cancel-impact.test.ts`).
- **R9 (2026-11-10): the `/?v=X` auto-open waits for a real location.** `awayAutoOpenTarget` (`lib/venueAwayMode.ts`) is the one
  decision: X must be an away bar AND this sign-in's list must be built (`builtForGeneration === generation`). A failed or
  timed-out check commits no list, so nothing opens and the once-a-minute ref is not set (a later Retry can still open it). "Your
  bars" rows stay listed on a failed check (Q9); only the automatic open waits (`tests/lib.venue-away-auto-open-target.test.ts`,
  `tests/away-mode-contract.test.ts`).
- **C1 (2026-11-09): away mode is view-only Venue Home, never a weaker presence check.** Only `app/venue/[venueId]/page.tsx`
  passes `awayMode` to `VenuePresenceBoundary`; there, `VENUE_OUT_OF_RANGE` sets `isAway` instead of the overlay (every other
  failure, and every game screen, keeps the overlay). Every Venue Home play control reads `AWAY_PLAY_LABEL` and opens a game
  only through `playWhenPresent` (`lib/venueAwayMode.ts`): one location re-check per tap, never a timer. The 10
  presence-checked write routes keep `maybeRequireActiveVenuePresence*`. **"Your bars" (D6):** the 90-day rule lives only in
  `lib/recentVenues.ts`; the check-in is `venue_presence_sessions.last_verified_at`, which only a passed check may write
  (`upsertPresence` leaves it out on failure). `GET /api/player/venues` and `POST /api/player/venues/open`
  (`lib/playerVenues.ts`) trust only the signed `tp_sess`, narrowed by the browser's player id `tp:user-id` (a session for another player
  gets nothing; not the account id, which opening a bar clears — Phase R second review); "open" switches the session to the account's EXISTING profile at that bar, never creates one and records no
  presence (`tests/away-mode-contract.test.ts`, `tests/api.player-venues.test.ts`, `tests/components.venue-away-mode.test.ts`).
- **D8 (2026-11-09): every write a player makes at the bar is presence-checked on the server**, now including NFL Pick 'Em
  picks, Squares claims and Bracket saves (13 routes, pinned in `tests/away-mode-contract.test.ts`; Squares/Bracket answer
  `outcome: "not_at_venue"` → "Play at the bar."). A new write route for players must add `maybeRequireActiveVenuePresence`
  and join that list. Category Blitz's game-page `GET /api/category-blitz/sessions` starts or wakes rounds only for a player
  `isVenuePresenceLive` (read-only, no telemetry); anyone else gets a look-only answer (peek) and isn't counted as present.
  **R10 (2026-11-10): one "at the bar" rule.** Writes (`getActiveVenuePresence`) and Category Blitz (`isVenuePresenceLive`)
  decide only with `presenceRowAllowsPlay` (status `active` and `expires_at > now`); never add a grace to either. The lease
  (`VENUE_PRESENCE_TTL_MS`, 16 min) stays exactly 1 minute longer than the heartbeat (`PRESENCE_CHECK_INTERVAL_MS`, 15 min), so
  the heartbeat renews it before it ends; change both together (`tests/lib.venue-presence-live.test.ts`).
- **C2 (2026-11-09): automatic venue pushes are invitations and land on their own Venue Home screen.** The news push and the
  30-minute reminder never say "Tap to play/see" (the phone may be anywhere; the tap opens Venue Home, view-only when away). Their
  link comes only from `venuePushPath(venueId, "games" | "prizes")` (`lib/pushLanding.ts`): game news and reminders → Games,
  prize news → Prizes. The app's tap handler (`NativePushRuntime`) saves that screen (`savePlayerPanel`) **before** navigating
  as a fallback; the `/?v=X` sign-in-list hop carries it in the URL (R3 below); `VenuePanelFromUrl` (in `VenueHubClient`, own `<Suspense>`) handles `?panel=`
  while Venue Home is open and on the website, then drops the param. Partner messages keep `?message=`
  (`tests/push-notifications-contract.test.ts` "invitations" block, `tests/lib.push-landing.test.ts`).
- **C3 (2026-11-09): "Remind me" is an opt-in row, claimed once, sent by the existing sweep; never a presence check.**
  `push_game_reminder_optins` (migration `20261109214742`) is written only by `lib/gameReminderOptIns.ts` from
  `POST/DELETE /api/push/game-reminders` (signed `tp_sess`, 503 without `SESSION_SECRET`; only the session profile's own bar,
  only a game `findUpcomingScheduleOccurrence` finds in the live schedule). The route must NOT presence-check: it is for players
  away. The push comes only from `sendLiveGameStartPushes` (`lib/push/gameReminders.ts`): ONE `findStartingOccurrences` read per
  run looks `OPT_IN_REMINDER_LEAD_MS` (1 hour) ahead; the 30-minute push keeps its own audience; opt-ins are claimed only by
  the RPC `claim_game_reminder_optins` (service_role only), which reaches the profile's and account's live phones whatever the
  "Group games starting" switch says (the player asked). App-only button; if push is off, the tap first shows `PUSH_COPY.askBody`
  (Apple 4.5.4) and fires `PUSH_ASK_INLINE_EVENT` so `PushPermissionCard` steps aside. **Add to calendar** = `GET
  /api/trivia/live/calendar` (public; reads only `venueId`/`scheduleId`/`start` from the URL, every word from the database);
  the app opens it with `openInSystemBrowser`, never inside the web view (`tests/push-notifications-contract.test.ts` "Remind
  me" block, `tests/api.push.game-reminders.test.ts`, `tests/lib.live-trivia-calendar.test.ts`, `npm run test:push-sql`).
- **B1 (2026-11-09): a pick window is one rule set, asked by every pick write, failing open.** Windows live in
  `venue_game_settings.pickem_pick_windows` (jsonb keyed by sport slug, `nfl` = NFL Pick 'Em; migration `20261109223743`), read
  only through `getVenueGameSettings` (`pickWindows`; malformed entries read as "always open"). ALL window rules are pure in
  `lib/pickemPickWindow.ts` (the game's instance = latest opening at or before kickoff; open = opening ≤ now < close, close
  exclusive; local calendar days through `zonedDateTimeToUtcMs`, so DST keeps wall-clock hours; the refusal is the games list's own line + ".": "Picks open Mon 12:00 AM." while that game's window is ahead,
  "Picks closed." once it has passed — Phase R second review). The server gate `lib/pickemPickWindowGate.ts` is the only enforcer: `submitPickEmPick`, `clearPickEmPick`,
  `submitNFLPickEmPick`, `clearNFLPick` and the tiebreaker POST call it before writing; a closed window throws
  `PickEmPickWindowClosedError` → 409 in `/api/pickem/picks`, `/api/nfl-pickem/picks` and `/api/pickem/prize-tiebreaker`. A failed
  settings read never blocks a pick (logged `pick-window-read-failed`), but a new college pick still refuses without its rule.
  A pick makes ONE fresh settings read for the window and the college rule (NFL passes its mode on to `listNFLPickEmGames`). The
  kickoff lock and scoring are untouched. A new pick-write path must call the gate and join
  `tests/api.pickem-pick-window-gate.test.ts`'s contract (`tests/lib.pickem-pick-window.test.ts`, `tests/lib.venue-game-settings.test.ts`).
- **B2 (2026-11-09): pick ahead comes only from a pick window, and the server sets the reach.** Regular Pick 'Em moves past today
  only for a sport with a window: `listPickEmGames` returns `pickAheadThrough` (`pickAheadHorizonMs`: 7 days, or while open up to
  the next opening) and the day arrows (`PickEmGameList`, `lastReachableDate`) never go further; a future day past it snaps back to
  today **on the server, before the provider call (R9)**: `/api/pickem/games` alone passes `clampToPickAhead: true`, and
  `listPickEmGames` asks `pickAheadReach` (the same 30 s display cache) and serves today when the reach doesn't cover the day; the
  response's `date` says which day was served and the client follows it (never loads it twice; a background reply for another day
  is ignored; a sport switch clears `pickAheadThrough` and a future day). The `skipLines` pick check never clamps
  (`tests/lib.pickem-college-spreads.test.ts` "R9", `tests/components.pickem-pick-ahead.test.ts`). A sport without a window, or a failed settings read, stays today-only on screen AND in `submitPickEmPick` (its today-only
  check is skipped only when the fresh read finds a window; then the B1 gate decides). Every games list marks a not-started game
  whose window is shut with `pickWindowMessage` and carries one `pickWindow.line`, both only from `pickWindowViewForGames`
  (`lib/pickemPickWindow.ts`; NFL in `/api/nfl-pickem/games`, the Prize tiebreaker GET via `pickWindowViewAtVenue`). The list's
  window read is the 30 s display cache (`readVenueGameSettingsForDisplay`, shared with the college rule), never a fresh read.
  Future days run no empty-day provider probe. Every BallDontLie `fetch` calls `countProviderCall`
  (`tests/lib.provider-call-counter.test.ts`, `tests/lib.pickem-college-spreads.test.ts` "pick ahead", `tests/lib.pickem-pick-window.test.ts`
  "pick ahead", `tests/api.nfl-pickem-games-route.test.ts`, `tests/pickem-prize-tiebreaker.test.ts`).
- **B3 (2026-11-09): a windowed spread pick is graded by the line it recorded, and that line is its bar's frozen line.** At a bar with
  a pick window and spreads on (College Football stamped `spread`; NFL Pick 'Em in spread mode), each game's line freezes for that bar
  the first time it is shown inside its OPEN window (Q1), in `pickem_venue_frozen_lines` (migration `20261110014242`), written ONLY by
  the insert-once RPC `freeze_pickem_venue_lines` via `lib/pickemFrozenLines.ts` (`applyVenueFrozenLines` from the college list and
  `listNFLPickEmGames` when the NFL route passes `pickWindow`; `frozenLineForPick` from both pick paths). No other file names the RPC or
  the table. A NEW pick there saves the frozen line in `home_spread` / `away_spread` (insert only, R8: a side switch writes no line
  columns, so a pick keeps the line it was made with; clear + re-pick is a new pick), freezing it first if the list didn't; at an NFL
  bar whose pick-time settings read failed, a new pick records the bar's STORED frozen line read-only (none = no line, lookup
  failed = refused); a failed freeze refuses the pick (`PICKEM_FROZEN_LINE_FAILED_MESSAGE`). Only such a pick writes those columns while
  pending. Settlement (`settlePendingPickEmPicks`) grades a pending spread pick by `recordedPickLine(row)` first, else the global line
  locked at kickoff (unchanged); NFL's mode is still the venue's at settlement. Screens show, in order: the player's own pending pick's
  recorded line, the bar's frozen line, the global line (**superseded by R2 below**). A list freeze failure keeps the global lines and reports lines unavailable.
  Bars without a window are untouched (`tests/pickem-frozen-lines-contract.test.ts`, `tests/lib.pickem-college-spreads.test.ts`
  "frozen lines", `tests/lib.nfl-pickem-game-fetch.test.ts` "frozen lines", `tests/lib.pickem-nfl-scoring-mode.test.ts`,
  `npm run test:pickem-frozen-lines-sql`).
- **B4 (2026-11-09): Game Settings sets pick windows only through the B1 save, from one shared card.** `PickWindowsPanel`
  (`components/gameSettings/PickWindowsPanel.tsx`) is the only pick-window form, used by `/owner/game-settings` and the admin
  `GameSettingsSection`; it POSTs `{ venueId, pickWindows }` with only changed sports (null = "Always open"), built by
  `pickWindowChangesFromDrafts` (`lib/pickemPickWindowForm.ts`, which also holds the form's sport list). Window meaning stays in
  `lib/pickemPickWindow.ts`. The Pick 'Em Prize wizard's line is `pickemPrizePickWindowNotice` (`lib/pickemPrizeWizard.ts`, words in
  `PICKEM_PRIZE_PARTNER_COPY`), fed by `RewardPickEmContext.pickWindows` (a failed read = no line); it never blocks
  (`tests/lib.pickem-pick-window-form.test.ts`, `tests/components.pick-windows-panel.test.ts`).
- **R1 (2026-11-09): a Live Trivia schedule change pays what its venue owes BEFORE anything is written.**
  `deleteAdminLiveShowdownSchedule` and `updateAdminLiveShowdownSchedule` (`lib/liveShowdownAdmin.ts`) call
  `settleVenueBeforeScheduleChange` (`lib/rewardGameSlotCascade.ts`) for every venue the change touches (`venueChangesForEdit`, the
  same list the A3 preview uses; a move = both venues) before `trivia_session_questions`, `live_showdown_answers` or
  `trivia_schedules` is touched. It runs the A3 dry run (`runCascade`), then, when the venue has ANY active game-winner or weekly-places prize (ended by the
  change or not, since a delete takes the schedule's answers; Phase R second review): the payout sweeps scoped to that venue (`resolveGameWinnerRewards(nowMs, { venueIds })`,
  `resolveRankedPlaceRewards(nowMs, { venueIds })`; never unscoped from a request), then `planRankedWeekEarlyClose`
  (`lib/liveTriviaRankedRewards.ts`, same week key and ranking as the sweep) for a places prize it would retire (Q5). A prize the
  change leaves running is blocked only by a sweep error on the changed
  schedule; one it ends, by an error on any of the venue's games. An unconfirmed payout or plan throws `ScheduleChangeSettlementError` → 409 "Couldn't pay this game's
  prizes first. Try again." in the owner and admin routes, with nothing written (Q6). **R7 (2026-11-10): nothing is written
  before the change.** The early close is only RANKED before it (`weekCloses`, returned with `settledCampaignIds`); rule 4 pays
  it with `payPlannedWeekClose` (`award_ranked_cycle_places`, still the only writer) after the write and just before retiring that
  prize. A failed award keeps the prize active and logs `[RankedReward] early-close-award-failed` with the whole plan; a plan for
  a prize the real run keeps is dropped and the cron pays that week. In a real run rules 1–4 change a places/winner prize only
  if it is in `settledCampaignIds`. The settle reads the venue's prizes once and (only with a places/winner prize) its schedules
  once (`loadLiveTriviaSchedulesForVenues`), and hands both to the dry run (`runCascade`'s `preloaded`, filtered by
  `venueSchedulesFromRows`) and to both sweeps (`PayoutSweepScope.campaigns` / `.schedules`); never add a second read. The
  cascade after the write keeps one fresh read of each. An edit whose timing doesn't change (`scheduleEditMovesGames`: a title
  or ad edit) runs no settle, cascade or preview dry run. A rounds change builds its question matrix before the settle. The edit
  has no fallback for a database without the recurrence columns, and computes `editCascadeInputs` once. The cron's sweeps stay unscoped
  (`tests/lib.reward-cascade-no-games-left.test.ts` "settleVenueBeforeScheduleChange", `tests/lib.live-showdown-schedule-change-order.test.ts`,
  `tests/lib.live-trivia-ranked-rewards.test.ts` "planRankedWeekEarlyClose + payPlannedWeekClose", `tests/lib.reward-slot-cascade.test.ts`
  "R7", `tests/lib.live-trivia-winner-rewards.test.ts`, `tests/api.owner.schedule.test.ts`).
- **R2 (2026-11-09): a games list shows the line the player's pick is graded by, chosen only by `lineShownForGame`**
  (`lib/pickemFrozenLines.ts`). A pick with a line on its row (recorded while pending, or graded by) shows that line; a pick with no
  line (made before the bar had a window) shows the global line settlement grades it by, never the bar's frozen line; no pick shows
  the frozen line, else the global line. `applyCollegeFootballLines` (`lib/pickem.ts`) and `listNFLPickEmGames` (`lib/nflPickEm.ts`)
  keep no `??` chain of their own. Grading is unchanged (`tests/pickem-frozen-lines-contract.test.ts` "the line a list shows" and
  "both games lists choose…", `tests/lib.pickem-college-spreads.test.ts` and `tests/lib.nfl-pickem-game-fetch.test.ts` "R2").
  **R8 (2026-11-10): what the list shows on a pick never changes when the player switches sides,** because no pick update writes
  `home_spread` / `away_spread` (both engines; only the insert does). A pick with no line stays on the global line through every
  switch; clearing it and picking again is a new pick and takes the frozen line the list then shows
  (`tests/pickem-frozen-lines-contract.test.ts` "no pick update writes line columns", `tests/lib.pickem-college-spreads.test.ts`
  "R8", `tests/lib.nfl-pickem-game-fetch.test.ts` "submitNFLPickEmPick: a pick's line is set when it's made").
- **R3 (2026-11-09): opening a bar keeps the push's screen in the URL, and the auto-open stamp is written after the clear.**
  Never exempt keys from `clearClientState` (the sign-out clear). Every `/?v=` redirect in `VenueHubClient` is
  `signInListPath(venue.id, mountSearchRef.current)` (`lib/pushLanding.ts`), which keeps `panel=games|prizes`; `app/page.tsx`
  passes it to `JoinFlow` as `initialPanel`; `navigateToResolvedVenue` adds it to its hard target (`withVenuePanel`) only for
  the bar `?v=` named, and re-saves it after `hardClearAuthAndCachePreserveVenue`. The once-a-minute auto-open rule lives only in
  `lib/venueAwayMode.ts` (`awayAutoOpenAllowed` reads, `markAwayAutoOpen` writes, per tab in sessionStorage);
  `navigateToResolvedVenue` calls `markAwayAutoOpen` after the clear, for an automatic away open only, and the JoinFlow effect
  only reads (`tests/away-mode-contract.test.ts` "R3", `tests/lib.venue-away-auto-open.test.ts`, `tests/lib.push-landing.test.ts`,
  `tests/components.venue-away-mode.test.ts` "finding 3").
