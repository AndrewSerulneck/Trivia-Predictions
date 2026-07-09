# Category Blitz: "No grading, no cascade, no leaderboard" — root cause analysis

## What Category Blitz is, and where it sits in Hightop Challenge

Hightop Challenge's core model (see `CLAUDE.md`) is: users join a specific
physical **venue** and earn points playing mini-games — Trivia, Pick'em,
Bingo, Predictions, Fantasy — scoped strictly to that venue. Authentication
is global (one account, one username/passkey), but points, leaderboards, and
game state are entirely venue-specific; a user can belong to many venues with
completely independent standings in each.

**Category Blitz is the newest of these mini-games**, and structurally the
odd one out: every other game in the lineup is either asynchronous (Pick'em,
Predictions, Fantasy — pick your answers whenever, find out later) or
single-player-paced (Speed Trivia, Bingo). Category Blitz is the one game
built to be **live and venue-synchronized** — everyone physically present at
the venue plays the *same round, at the same moment, against the same
clock*. Its origin migration literally names it "a live
venue-synchronized word game" (`supabase/migrations/20260628130000_scategories.sql:1`,
before the `scategories` → `category_blitz` rename in
`20260628170000_rename_scategories_to_category_blitz.sql`).

**The game itself** (family-feud-adjacent, letter-and-category word game):
a round draws **one letter** for the whole venue and **12 categories** at
random from that letter's vetted pool (see
`data/category-blitz/CATEGORY_TEST.md` for the full category-design
standard — every category must pass an "Is-A" gate and a
letter-coverage-breadth gate). Every player at the venue has **3 minutes**
to fill in an answer for each of the 12 categories that starts with the
drawn letter. Unique answers score 2 points; if two players submit the same
(normalized) answer, both cancel to zero — rewarding creative,
non-obvious answers over safe, common ones (`lib/venueGameCards.ts:149-153`
is the in-app rules blurb: *"A letter is drawn for the whole venue · Name
something in each category starting with that letter · 3 minutes to fill
all 12 categories · Unique answers score 2 points — duplicate answers
cancel."*).

**The underlying philosophy/goal:** Category Blitz exists to create a
genuine *shared, synchronous, competitive moment* at the venue — the kind of
energy a trivia host calling out a category live in a bar creates, but
self-running and scalable to any venue without a human host. That live,
communal aspect is the entire point of the game; a version of Category Blitz
where players don't actually see each other's results, don't see the
grading happen, and don't see where they land on the shared leaderboard
would fail at the one thing that distinguishes it from the rest of the
Hightop Challenge lineup. This is precisely why the bug this document
investigates — grading and the reveal/leaderboard sequence silently not
happening — is not a cosmetic animation glitch; it strikes at the game's
core value proposition. A player who submits answers and never finds out
whether they scored, never sees how they stack up, has had the entire
"live shared competition" experience replaced with a black box.

The scoring engine, round lifecycle, and reveal sequence analyzed below live
primarily in `lib/categoryBlitz.ts` (server-only, Supabase-backed round/session
state machine + Haiku-based answer grading), `lib/categoryBlitzRealtime.ts`
(the client-side React hook driving phase transitions from realtime broadcasts
+ polling fallback), and `components/category-blitz/CategoryBlitzGame.tsx`
plus its reveal sub-components (`RoundStartReveal.tsx`, `RevealSequence.tsx`,
`GradingCascade.tsx`, `LiveLeaderboard.tsx`).

---

**Status:** analysis only, no code changed. Written after two rounds of fixes
(reveal/intermission timing, `startRound` concurrency) were verified correct
by scripted/simulated tests, yet the user still reports zero grading in real
solo play. This document reconciles that gap: the scripted tests proved the
*scoring and reveal logic* is correct once triggered — they did not (and
structurally could not) prove that triggering *actually happens* for a real
human sitting in a real browser tab. That is where the problem lives.

---

## The central finding: solo grading depends entirely on one browser tab's own JS timer, with zero fallback

This is the fact that reframes everything below. Read `lib/categoryBlitzRealtime.ts:645-648`:

```ts
const poll = setInterval(async () => {
  if (phase === "answering") return;  // timer running — realtime handles it
  await loadSessionRef.current();
}, POLL_INTERVAL_MS);
```

While a round is active (`phase === "answering"`), the client's own 15-second
polling fallback is **disabled outright**. The comment says "realtime handles
it" — but realtime only delivers a `round_scored` broadcast if *someone*
actually calls `scoreRound()` and broadcasts it. In solo play there is no
other connected client to do that. The cron (`runCategoryBlitzEngine`) does
not run in `next dev` / local/preview environments (per
`lib/categoryBlitz.ts:1420-1425`'s own docstring: *"next dev and preview
deployments never run Vercel Cron"*).

So for a solo player, the **only** thing in the entire system that can ever
call `scoreRound()` is this exact tab's own client-side timer effect,
gated at `lib/categoryBlitzRealtime.ts:493-509`:

```ts
if (
  remaining === 0 &&
  Date.now() - endsAtRef.current >= SUBMISSION_GRACE_MS &&
  !scoringCalledRef.current &&
  currentRoundIdRef.current &&
  revealDoneRef.current === currentRoundIdRef.current   // <-- gate B
) {
  scoringCalledRef.current = true;
  void triggerScoringRef.current(currentRoundIdRef.current);
```

Every one of these conditions has to hold, in this one tab, continuously,
for the entire round, or nothing ever happens — permanently, not just
"later." There is no cron fallback, no other-client fallback, and (see
below) no way for a stalled tab to recover on its own once the stall clears.
This single-point-of-failure design is very likely the actual explanation,
and it explains why every *scripted* test passed: a Playwright script never
backgrounds its own tab, never gets OS-throttled, and drives the browser
continuously — so it can never hit the failure mode a real human idly
waiting through a 3-minute round will routinely hit.

---

## Ranked root causes

### 1. (Most likely) Background/inactive-tab timer throttling silently kills the entire pipeline

Chromium and Firefox aggressively throttle (or fully suspend)
`setInterval`/`requestAnimationFrame` callbacks in tabs that are backgrounded,
minimized, or on an inactive screen — commonly to 1 call/minute or less,
sometimes paused indefinitely. Two completely different mechanisms in this
codebase depend on exactly those APIs running on schedule, with **no
`visibilitychange` handling anywhere in the Category Blitz code** (confirmed:
no matches for `visibilitychange`/`document.hidden` anywhere under
`lib/categoryBlitz*` or `components/category-blitz/`):

- **The round-start reveal**, `components/category-blitz/RoundStartReveal.tsx`,
  fires `markRevealDone` via Framer Motion's `onAnimationComplete` callback
  (`RoundStartReveal.tsx:129`) on the last category row's enter animation.
  Framer Motion animations are driven by `requestAnimationFrame`, which is
  throttled/paused identically to `setInterval` in a backgrounded tab. If the
  user alt-tabs, checks their phone, or switches windows during the ~1-2s
  reveal at the very start of a round, this callback can stall indefinitely —
  which permanently blocks gate B above (`revealDoneRef.current` never
  reaches `currentRoundIdRef.current`), which permanently blocks scoring for
  that entire round, for this tab, with no other path to recover it.
- **The round-end scoring trigger itself** — the 250ms timer tick at
  `lib/categoryBlitzRealtime.ts:535` (`TIMER_TICK_MS = 250`,
  `lib/categoryBlitzRealtime.ts:102`) that watches `remaining === 0` to fire
  `triggerScoringRef` — is a plain `setInterval`, equally subject to
  throttling. If the user is waiting out a 3-minute round with the tab in
  the background (extremely normal human behavior — nobody stares at a
  3-minute countdown), the tick can stop firing near-exactly when it matters
  most (right as `remaining` hits 0), and by the time the tab regains focus
  the browser catches the timer back up, but by then `Date.now()` has already
  raced far past `ends_at + SUBMISSION_GRACE_MS` — this part actually still
  fires correctly once the timer resumes (the check is `remaining === 0`,
  which becomes true retroactively), so this specific half self-heals on
  refocus. **The reveal-callback stall (previous bullet) does not
  self-heal** — nothing re-checks or re-fires `onAnimationComplete` on
  visibility regain, so once missed, it's missed forever for that round.

**Why this fits the reported symptom exactly:** "I play alone to test the
game" (established context) strongly implies exactly the kind of usage
pattern — start a round, tab away to do something else while waiting,
come back — that triggers this. And it explains why the bug *reappeared
after* fixes that were correctly verified by uninterrupted scripted runs:
scripts don't tab away.

### 2. `testMode` is an ambient per-request flag, not a durable per-round property

Confirmed directly in a clean isolated repro during Phase 5 verification: a
round was created with `endsAt - startedAt ≈ 180s` (full production
duration) in a session where the UI's own "Test mode" toggle showed **ON**.

Root cause: `isCategoryBlitzTestModeEnabled()` (`lib/categoryBlitzTestMode.ts:20-25`)
is read fresh, client-side, on every individual request, and threaded through
as a transient `testMode` boolean argument
(`app/api/category-blitz/sessions/route.ts:24`, `lib/categoryBlitz.ts:589`,
`lib/categoryBlitz.ts:649` `startRound(sessionId, testMode)`). Nothing stamps
this value durably onto the session or round row. Whichever HTTP request
happens to be the one that satisfies `isLobbyStartDue`
(`lib/categoryBlitz.ts:508-511`) or the next-round gate
(`lib/categoryBlitz.ts:591-599`) at the moment it fires decides that round's
actual duration — independent of what the toggle currently displays in the
UI, and independent of what any *other* request (including a stale earlier
poll still in flight) carried.

**Why this matters for "I never see grading":** if a real 180-second round
gets created while the player believes (from the on-screen badge) that it's
a ~10-second test round, they will very reasonably conclude "nothing is
happening" and stop watching (or refresh, which is its own problem — see
#3) long before `ends_at` is ever reached. This is indistinguishable, from
the player's perspective, from "grading is broken."

### 3. `scoreRound()` has no server-side check that the round has actually expired

`app/api/category-blitz/rounds/[id]/score/route.ts`'s own docstring claims:

> "No auth required — scoreRound is idempotent and only fires if the timer
> has actually expired (enforced in the engine)."

This is not true of the code as it exists today. `scoreRound()`
(`lib/categoryBlitz.ts:~965` onward) never reads or compares `round.ends_at`
— it transitions `active → scoring` unconditionally the moment it's called,
gated only by *"is this round still `active`"*, not *"has this round's timer
actually elapsed."* In the current architecture the only thing preventing
early scoring is the client-side `scoringCalledRef`/`remaining === 0` gate
(item 1 above) — which is exactly the gate that can desync from reality if
the tab was throttled and the client's notion of "now" drifted, or if a
page reload re-mounts the hook with fresh state before the round is
genuinely over. This is a latent integrity gap rather than a proven direct
cause of the current symptom, but it means the system has no defense-in-depth
if the client-side gate above ever misbehaves.

### 4. No mid-round reload/resume path

If the player refreshes the page, or the tab is discarded and recreated
(mobile Safari/Chrome do this aggressively under memory pressure) partway
through a round, `useCategoryBlitzSession` remounts from scratch. The initial
load (`lib/categoryBlitzRealtime.ts:639-648`, `initialLoad()` calling
`loadSessionRef.current()`) re-fetches the round via `loadCurrentRound`
(`lib/categoryBlitzRealtime.ts:341-361` → `applyRoundRef`). Because `phase`
starts back at `"idle"` on remount (not `"answering"`), `showReveal`
(`components/category-blitz/CategoryBlitzGame.tsx:968`) will very likely be
`true` again for the same round (since `revealedRoundId` also resets to
`null` on remount, per the `useState<string | null>(null)` initializer at
`CategoryBlitzGame.tsx:967`) — meaning a returning player re-plays the
round-start reveal instead of resuming answering, burning more of the
already-ticking round clock, and re-arming gate B from scratch. If they
reload *again* near the end of the round (e.g., out of frustration that
nothing seems to be happening — very plausible given #1/#2 above), each
reload restarts the reveal-completion race, making it progressively less
likely `revealDoneRef` ever gets satisfied before `ends_at` passes.

---

## Recommended fixes, roughly in priority order

### Fix A — Give the poll a real fallback during "answering," not a full skip
`lib/categoryBlitzRealtime.ts:645-648`. Instead of `if (phase === "answering") return;`,
keep polling during `"answering"` too, at a coarser interval (or exactly
`POLL_INTERVAL_MS`, no need to match the 250ms local tick) — the poll
already routes through `driveVenueCategoryBlitz`, which internally calls
`scoreExpiredRoundForVenue` (`lib/categoryBlitz.ts:475-491`) as a
self-healing safety net for exactly this situation. This restores a
server-truth fallback independent of the fragile client-only timer/reveal
chain, and is genuinely a 1-line-condition change with no architectural
risk — it literally already exists and is only turned off during the one
phase where it's needed most.

### Fix B — Add a `visibilitychange` catch-up handler
When the tab regains focus (`document.visibilityState === "visible"`),
immediately force a fresh `loadSessionRef.current()` call (bypassing the
`phase === "answering"` skip for that one forced call) so a throttled tab
re-syncs to true server state the instant the user comes back, rather than
waiting for the next natural tick. This directly fixes the "reveal callback
stalled forever" half of Root Cause 1, since a fresh `loadCurrentRound` call
will fetch the current round with `status` already correctly reflecting
reality, sidestepping the stalled Framer Motion callback entirely (the
resync can simply mark the round's reveal as already-seen when the fetched
round is not new).

### Fix C — Make `testMode` a durable, session-level property instead of an ambient per-request flag
Add a `test_mode boolean not null default false` column to
`category_blitz_sessions`, stamped once at `createSession()`
(`lib/categoryBlitz.ts:622-646`) time from whichever caller created it, and
have every subsequent `startRound`/`driveVenueCategoryBlitz` call read it
from the session row instead of accepting it as a parameter from whichever
request happens to be driving. This removes the entire class of "which
caller's toggle state wins" nondeterminism (Root Cause 2), including the
now-redundant `IdleScreen`/main-hook parity fix from the prior session (that
fix becomes unnecessary once test mode is pinned per-session rather than
per-request).

### Fix D — Add the missing server-side expiry check to `scoreRound()`
In `lib/categoryBlitz.ts`, before the `active → scoring` claim update, verify
`Date.now() >= new Date(round.ends_at).getTime()` (with the existing
`SUBMISSION_GRACE_MS` tolerance) and reject/no-op otherwise. Cheap,
defense-in-depth, makes the route's own docstring true, and forecloses any
future path (buggy client, stray request, retry-storm) from force-completing
a round early.

### Fix E — Preserve reveal/answering state across reload within the same round
On initial mount, if the fetched round is already `"active"` and its
`started_at` is more than a trivial threshold in the past (e.g., more than
the reveal's own max duration), skip `showReveal` entirely and go straight to
`AnsweringScreen` — treat "this round has clearly already been running for a
while" as equivalent to "I've already seen the reveal," rather than always
replaying it on remount. This closes Root Cause 4's reload-resets-the-race
behavior.

---

## Phased implementation plan

The five fixes are ordered by how directly they attack the single-point-of-
failure design (the root cause), not by file proximity. Phases 1-2 are the
ones I'd consider load-bearing for the reported symptom; Phases 3-5 close
real but secondary gaps. Each phase is independently shippable and testable
— none blocks the others, so they can be reordered if priorities shift, but
shipping 1 and 2 first gets the highest signal-to-effort ratio.

### Phase 1 — Restore the polling fallback during "answering" (Fix A)

**What:** `lib/categoryBlitzRealtime.ts:645-648` currently skips the poll
entirely while `phase === "answering"`:
```ts
const poll = setInterval(async () => {
  if (phase === "answering") return;  // timer running — realtime handles it
  await loadSessionRef.current();
}, POLL_INTERVAL_MS);
```
Remove the skip (or narrow it to something that still polls, just less
aggressively than during other phases — e.g. every `POLL_INTERVAL_MS` exactly
as already configured, no need to invent a new constant). The poll already
calls `loadSession` → `GET /api/category-blitz/sessions` →
`driveVenueCategoryBlitz` (`lib/categoryBlitz.ts:517-591`), which already
runs `scoreExpiredRoundForVenue` (`lib/categoryBlitz.ts:475-491`) as a
self-healing safety net on every invocation. Re-enabling the poll during
"answering" means that even if this tab's own local reveal/timer chain
stalls completely (Root Cause 1), the very next poll — at most 15 seconds
later — will independently notice the round is expired server-side and
score it, then the client's own `loadCurrentRound`/`applyRoundRef` pathway
(already exercised and proven correct in the prior reveal-timing fix) picks
up the now-"complete" round and enters the reveal cascade normally.

**Why this is the highest-leverage single change:** it converts the entire
system from "one fragile client-only path with zero fallback" to "one fast
client-only path with a 15-second-worst-case server-truth fallback,"
independent of Framer Motion callbacks, tab visibility, or anything else
in this tab's own JS event loop. This is the fix that most directly answers
"why did scripted tests pass but real play fail" — the scripted tests never
depended on this fallback because they never stalled the fast path.

**Risk/complexity:** very low. This is a one-line revert of a
premature optimization; the code path it re-enables (`driveVenueCategoryBlitz`
→ `scoreExpiredRoundForVenue`) is already exercised continuously by every
other phase (`idle`, `lobby`, `reveal`, `results`) and by the multiplayer
simulation harness (`scripts/simulate-category-blitz.cjs`). The only thing
to verify is that resuming polling during "answering" doesn't cause
double-scoring or duplicate-round races — both of which are already guarded
(`scoreRound`'s atomic claim, `lib/categoryBlitz.ts:943-949`, and the
`startRound` unique-index guard added in the prior session).

**Model / effort:** **Sonnet, low-medium effort.** Small, mechanical,
low-risk change to a single conditional, verified against an already-proven
underlying code path — does not need architecture-level reasoning.

---

### Phase 2 — `visibilitychange` catch-up handler (Fix B)

**What:** Add a `document.visibilitychange` listener inside
`useCategoryBlitzSession` (`lib/categoryBlitzRealtime.ts`) that, when the tab
transitions to `visible`, immediately forces one `loadSessionRef.current()`
call — bypassing whatever the current phase-based skip logic is (Phase 1
above already removes the main offender, but this listener should force a
call unconditionally on refocus regardless of phase, as a second independent
resync trigger, since browser timer throttling can also distort *how often*
a normally-running poll actually fires, not just whether it's skipped by
phase).

This does two things Phase 1 alone doesn't:
1. Eliminates the up-to-15-second worst-case latency of Phase 1's fallback —
   the moment the user comes back to the tab, state resyncs immediately
   instead of waiting for the next scheduled poll tick.
2. Specifically unblocks the **round-start reveal stall** half of Root
   Cause 1 (`RoundStartReveal.tsx:129`'s `onAnimationComplete`, which Phase 1
   does not touch — Phase 1 rescues *scoring*, not the reveal-completion gate
   that scoring depends on). The resync fetch will return a round whose
   `status` may already be `"active"` (or later) with a round ID matching
   `currentRoundIdRef.current` — treat that case as "the reveal for this
   round has effectively already been superseded by reality" and forcibly
   mark it done (call the equivalent of `markRevealDone`/set
   `revealedRoundId`) rather than waiting on a stalled animation callback
   that may never resolve.

**Design note:** this needs a little care in `CategoryBlitzGame.tsx`'s
`showReveal` logic (`CategoryBlitzGame.tsx:968`) and
`categoryBlitzRealtime.ts`'s `revealDoneRef`/`resultsRevealDoneRef` bookkeeping
so that a forced resync doesn't fight with an animation that's actually
still playing normally in a *visible* tab (i.e., only short-circuit the
reveal-completion gate when visibility was regained after being hidden, not
on every resync).

**Model / effort:** **Sonnet, medium-high effort.** This isn't a
one-line fix — it touches the same reveal/exit-guard state machine that
already had two rounds of subtle timing bugs this session (the "graded
results vanish" fix and its exit-guard ordering gotcha). Recommend having
the same engineer/model who did the exit-guard work do this one too, since
the mental model of `revealDoneRef` / `resultsRevealDoneRef` /
`phaseRef` is now fresh context. Not deep enough to need Opus on its own,
but worth extra care in review given this state machine's track record.

---

### Phase 3 — Make `testMode` a durable, session-level property (Fix C)

**What:**
1. New migration: add `test_mode boolean not null default false` to
   `category_blitz_sessions`.
2. `createSession()` (`lib/categoryBlitz.ts:622-646`) stamps this column
   once at creation time, from whichever caller's `testMode` flag is in
   effect when the session is first created (lobby entry).
3. Every subsequent `startRound`/`driveVenueCategoryBlitz` call for that
   session reads `session.test_mode` from the DB row instead of accepting
   `testMode` as an ambient per-request parameter
   (`app/api/category-blitz/sessions/route.ts:24`,
   `lib/categoryBlitz.ts:517-520`'s `driveVenueCategoryBlitz(venueId, now, testMode)`
   signature, `lib/categoryBlitz.ts:649`'s `startRound(sessionId, testMode)`
   signature — all of these collapse to reading the session row instead of
   trusting the caller).
4. The client (`lib/categoryBlitzRealtime.ts`) can still use
   `isCategoryBlitzTestModeEnabled()` to *decide whether to request* a
   test-mode session at creation time, but once a session exists, its
   `test_mode` is authoritative and no longer subject to renegotiation by
   later requests.

**Why this matters beyond the immediate bug:** this was a real,
independently-confirmed defect (a 180-second round created while the UI
badge showed "test mode: on," verified during the prior Phase 5 browser
check) and it's a source of confusing, hard-to-reproduce nondeterminism any
time more than one request could plausibly race to create/advance a
session — which, per Phase 1/2 of the *previous* fix (the `startRound`
race), is more often than intuition suggests. It also **fully obsoletes**
the earlier stopgap fix (making `IdleScreen`'s poll pass `testMode=1` to
match the main hook) — that fix was patching a symptom of exactly this
architectural gap; pinning `test_mode` per-session removes the need for
every caller to agree on an ambient flag at all.

**Model / effort:** **Sonnet, medium effort.** Mechanical plumbing
(new column, stamp-once-at-creation, read-not-pass-through), but touches
several call sites across `lib/categoryBlitz.ts` and the API routes, so
budget time for a careful sweep rather than a single-file edit. Low
architectural risk — it's strictly narrowing an existing ambient parameter
into a pinned one, not introducing new concurrency.

---

### Phase 4 — Server-side round-expiry check in `scoreRound()` (Fix D)

**What:** In `lib/categoryBlitz.ts`, immediately after loading the round row
and before the atomic `active → scoring` claim (`lib/categoryBlitz.ts:943-949`),
add: reject (or silently no-op, matching the "idempotent, never hard-fails"
philosophy already used elsewhere in this file) if
`Date.now() < new Date(round.ends_at).getTime() - SUBMISSION_GRACE_MS`. This
makes `app/api/category-blitz/rounds/[id]/score/route.ts`'s own docstring
claim — *"only fires if the timer has actually expired (enforced in the
engine)"* — actually true, closing a latent integrity gap where any stray
caller (buggy client, retried request, future code path) could force-complete
a round early.

**Why this is lower priority than Phases 1-3:** it is not proven to be a
direct cause of the currently-reported symptom (no early-scoring `/score`
POST was observed in the clean repro attempts). It's defense-in-depth,
not a fix for an observed failure mode.

**Model / effort:** **Sonnet, low effort.** A single added guard
condition mirroring an existing pattern in the same function; no design
work required.

---

### Phase 5 — Preserve reveal/answering state across a mid-round reload (Fix E)

**What:** On initial mount, if `loadCurrentRound` returns a round that is
already `"active"` and its `started_at` is more than a small threshold in
the past (e.g., longer than the round-start reveal's own maximum possible
duration), skip `showReveal` (`components/category-blitz/CategoryBlitzGame.tsx:968`)
entirely on that first render and go straight to `AnsweringScreen` — treat
"this round has clearly been running for a while already" as equivalent to
"this client has already effectively seen the reveal," rather than the
current behavior of always replaying `RoundStartReveal` (and re-arming its
completion gate from scratch) on every fresh mount.

**Why this matters:** compounds with Root Cause 1/4 — a frustrated player
who reloads mid-round (very plausible if Phases 1/2 aren't yet in place and
nothing visibly happens) currently restarts the entire reveal-completion
race on each reload, making the eventual scoring gate progressively less
likely to ever get satisfied. Once Phases 1-2 land, this failure mode
becomes far less consequential (reload can no longer strand scoring
forever), so this phase is genuinely lowest-priority polish rather than a
core fix.

**Model / effort:** **Sonnet, low-medium effort.** Contained to one
component's mount-time logic; the main care needed is not to accidentally
suppress the reveal for a *genuinely* fresh round (i.e., the "more than a
small threshold in the past" check needs a sensible constant, not a design
decision requiring deep reasoning).

---

## Summary: model/effort at a glance

| Phase | Fix | Model | Effort | Priority |
|---|---|---|---|---|
| 1 | Re-enable poll fallback during "answering" | Sonnet | Low-medium | **Do first** — highest leverage, lowest risk |
| 2 | `visibilitychange` catch-up handler | Sonnet | Medium-high | **Do second** — closes the reveal-stall half Phase 1 can't reach |
| 3 | Pin `testMode` per-session, not per-request | Sonnet | Medium | Do third — removes a real, confirmed source of confusion |
| 4 | Server-side `ends_at` check in `scoreRound` | Sonnet | Low | Do anytime — cheap hardening, not urgent |
| 5 | Skip reveal replay on mid-round reload | Sonnet | Low-medium | Do last — polish, much less consequential once 1-2 ship |

None of these phases require Opus-level effort on their own — they're each
either a small mechanical change or a contained state-machine adjustment in
a part of the code that's already been carefully mapped in this document.
The one phase worth extra reviewer attention (not necessarily a stronger
model, just more careful review) is **Phase 2**, since it's the third time
this session that the `revealDoneRef`/`resultsRevealDoneRef`/`phaseRef`
state machine has needed a subtle timing fix — that's a signal the area
rewards a slower, more deliberate pass rather than a purely mechanical one.
