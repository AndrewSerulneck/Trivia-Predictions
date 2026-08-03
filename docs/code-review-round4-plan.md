# Code Review Round 4 — Fixes Plan

Addresses the seven findings from the fourth `/code-review` pass over
`git diff main...HEAD` on branch `billing-guard-and-discounts` (run 2026-08-02,
110 files; billing/Stripe rework, NFL Pick 'Em spread scoring, Category Blitz
mobile shell).

That review cleared everything round 3 fixed — the standard-path settlement
refactor (`resolveOutrightWinningTeamId`) is behaviour-preserving including the
nullable `home_team_id`/`away_team_id` edge; the won/lost/push counters now
increment only after a successful DB write; `fetchBallDontLieList`'s truncation
flag is off-by-one correct; the webhook's creation gate, stale-event guard and
`billing_method: "stripe"` reassert on offline→card takeover all hold; the
checkout route's `past_due`/`paused`/`incomplete` matrix is consistent with the
resume route. What follows is only what it newly found.

**Related docs:** `docs/code-review-round3-plan.md` (round 3, closed),
`docs/billing-review-round2-plan.md` (round 2, closed),
`docs/billing-open-issues-plan.md` (inventory — this doc adds items **Z** and
**AA**), `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md` (where the
NFL findings get recorded), `docs/nfl-pickem-venue-scoring-mode-plan.md` (which
Phase 1 must also correct), `docs/billing-run-log.md`.

## Phase table

| # | Phase | Model | Effort | Depends on | Status |
|---|-------|-------|--------|-----------|--------|
| 0 | Baseline | Haiku 4.5 | Low | — | ☐ |
| 1 | Spread grading applies the line **twice** | **Opus 5** | Medium-High | 0 | ☐ |
| 2 | A settings-read failure 500s the games list | **Opus 5** | Low-Medium | 0 | ☐ |
| 3 | Client drops `spreadsUnavailable` | Sonnet 5 | Low-Medium | 2 | ☐ |
| 4 | Settlement's silent scoring-mode skip | Sonnet 5 | Medium | 1 | ☐ |
| 5 | Line refresh clobbers a concurrent lock | Sonnet 5 | Low-Medium | 0 | ☐ |
| 6 | Discount create/update blanks the mirror | **Opus 5** | Medium | 0 | ☐ |
| 7 | `grant-manual` mutates Stripe before validating | Sonnet 5 | Low-Medium | 0 | ☐ |
| 8 | Verification + close-out | Sonnet 5 | Medium | 1–7 | ☐ |

**Two short chains, not one long one.** 1 → 4 both edit
`settlePendingPickEmPicks`/its helpers in `lib/pickem.ts`; do them in order in
one worktree. 2 → 3 are the server and client halves of the same degradation
surface, and 3 should reuse whatever UI 2's decision needs. **Phases 5, 6, 7 are
independent** of both chains and of each other and can run in parallel
worktrees.

**Severity order if you only do some of it:** 1 → 2 → 6 → 3 → 7 → 4 → 5.
Finding 1 mis-grades **every** spread pick that has a non-integer line and a
large class of integer ones — it is the only finding here that writes wrong
points to real players. Finding 2 is a hard 500 on a player-facing read. Finding
6 is a silent money-display defect on a live discount, the same class rounds 1–3
kept finding. Finding 5 is a narrow race and is marked PLAUSIBLE, not confirmed.

---

## Phase 0 — Baseline

**Model: Haiku 4.5 · Effort: Low**

- `npx tsc --noEmit`, `npm run lint`, `npm run test` — record the counts. Last
  known green (round 3, Phase 8): **155 files / 1290 passed / 13 skipped**.
- Confirm the working tree is clean apart from `.gitignore`, the two advertising
  PNGs, and `docs/category-blitz-claude-code-handoff.md`.
- Note the starting SHA in `docs/billing-run-log.md` so each phase below is a
  separate revertible commit. (That file is the shared run log for this branch
  despite the name — the NFL phases go in it too.)

---

## Phase 1 — Spread grading must apply the line once, not twice

**Model: Opus 5 · Effort: Medium-High** — the code change is three lines. The
work is that a test and a plan doc both encode the wrong formula, so "make the
tests pass" is actively misleading here, and there may be already-settled picks
carrying wrong points.

**Finding:** `lib/pickem.ts:1688`, in `resolveSpreadPickEmSettlement`:

```ts
const homeAdjusted = homeScore + line.homeSpread;
const awayAdjusted = awayScore + line.awaySpread;
```

`awaySpread` is by construction the negation of `homeSpread` —
`lib/nflPickEm.ts:946-947` derives each from the other (`homeSpread = rawHomeSpread ?? -rawAwaySpread`,
`awaySpread = rawAwaySpread ?? -homeSpread`). Adjusting **both** sides therefore
moves the margin by `2 × homeSpread`: every spread pick is graded against
**twice the real line**.

Two concrete consequences:

- **Covers become losses.** Home −3 wins 24–20 (a 3-point favourite winning by
  4 — a cover). Correct: `24 − 3 = 21 > 20` → home pick `won`. Current:
  `24 − 3 = 21` vs `20 + 3 = 23` → home pick `lost`.
- **Half-point lines produce pushes**, which is the exact thing a half-point
  line exists to make impossible. Doubling ±1.5 gives ±3, so a 3-point margin
  ties. `tests/lib.pickem-nfl-scoring-mode.test.ts:355`
  ("settles spread NFL adjusted ties as push") asserts precisely that: 24–21 on
  a −1.5 line → `push`. Under the correct formula that is `22.5 > 21` → home
  covers. **That test encodes the bug and must be rewritten, not preserved.**

The plan doc that specified this, `docs/nfl-pickem-venue-scoring-mode-plan.md:186-189`,
states the same wrong formula ("home adjusted = `home_score + home_spread`,
away adjusted = `away_score + away_spread`"). Fix it there too, or the next
implementer re-derives the bug from the spec.

**Work:**

1. **Adjust one side only.** Compare `homeScore + line.homeSpread` against the
   raw `awayScore` (or, equivalently and symmetrically,
   `awayScore + line.awaySpread` against the raw `homeScore` — pick one and say
   in a comment why adjusting both is wrong, naming the
   `awaySpread === -homeSpread` invariant that makes it a double-count).
   Do not "fix" it by halving the spreads.
2. **Leave `winningTeamId` alone.** It is the *outright* winner and is stored
   alongside the ATS status on purpose; this bug is in the status only. Confirm
   that when you touch the function.
3. **Push semantics change, correctly.** After the fix, a push is only reachable
   on an integer spread. Assert that rather than leaving it implicit.
4. **Audit already-settled spread picks.** Query `pickem_picks` for rows with
   `scoring_mode = 'spread'` and a non-null `resolved_at`. Today's date is
   2026-08-02 — preseason — so the expected answer is **zero**, which would make
   this a no-op. If it is not zero, do **not** silently re-grade: report the
   count and the affected venues and ask, because those rows may already have
   awarded points that were claimed (`claim_pickem_points`) and accrued to a
   reward cycle (`lib/nflPickEmRewardAccrual.ts`), and un-winning a claimed pick
   is a different, larger piece of work than this fix.

**Tests:** `tests/lib.pickem-nfl-scoring-mode.test.ts` —
- rewrite the `-1.5` case at :355 to assert `won`/`lost` (a half-point line can
  never push);
- add the cover-that-currently-reads-as-a-loss case above (home −3, 24–20 →
  `won`) — this is the regression sentinel;
- add a dog-covers case (away +7 losing by 3 → away pick `won`);
- add an integer-line exact-push case (home −3, wins by exactly 3 → `push`);
- keep the existing `-2.5`/21–20 case, which happens to grade the same either
  way — note that in a comment so nobody mistakes it for coverage of this bug.

**Risk:** this changes how real players' picks are graded. It is a correction,
not a policy change, but Phase 8's browser pass should sanity-check one real
graded game end to end rather than trusting unit tests alone.

---

## Phase 2 — A venue-settings read failure must not 500 the games list

**Model: Opus 5 · Effort: Low-Medium** — tiny diff, but the obvious fallback
("default to standard") is wrong in a way that looks right, and it decides what
a player sees when we don't know the rules of their game.

**Finding:** `app/api/nfl-pickem/games/route.ts:27`:

```ts
const scoringMode: NFLPickEmScoringMode = venueId
  ? await getVenueNFLPickEmScoringMode(venueId)
  : "standard";
```

Unguarded. `getVenueGameSettings` (`lib/venueGameSettings.ts:56`) throws on any
Supabase error, so a missing/erroring `venue_game_settings` table takes the
whole NFL Pick 'Em games API to a 500 — for **every** venue that passes a
`venueId`, including standard-mode venues that never opted into spread scoring.
A missing row is fine (it maps to `standard`); it is a genuine read error that
throws.

The sibling in this same PR already degrades on exactly this failure:
`resolveScoringModeForLineRefresh` (`lib/nflPickEm.ts:1098`) catches, warns, and
returns `undefined` — with a header explaining that the expensive-but-correct
branch is the safe default.

**Work:**

1. **Guard the call.** It must not be the reason the games list is unavailable.
2. **Decide what mode to report, and write down why.** The options, with the
   trap stated rather than hidden:
   - **Fall back to `"standard"`.** Tempting and wrong. A spread venue's players
     would pick without ever seeing a line, and once the read recovers the
     settlement sweep grades those same picks **against the spread** — they were
     shown one game and graded on another.
   - **Fall back to `"spread"`.** Equally wrong in the other direction: standard
     venues would see spreads they are not graded on.
   - **Report the mode as unresolved** and let the client say so. Honest, and it
     costs nothing extra because Phase 3 is already building a
     "spreads unavailable" surface this can share.
   - **503 for that venue.** Also honest, but it takes the whole games list down
     for a display-only unknown — strictly worse than the option above.

   **Recommendation: report it as unresolved and degrade the UI**, reusing
   Phase 3's surface. Whatever you choose, comment it at the call site, with the
   reason the two silent fallbacks were rejected.
3. **Consider letting the lib re-resolve.** `listNFLPickEmGames` already takes
   `scoringMode` as optional and re-resolves it (with the correct degradation)
   when it is absent. Passing `undefined` on failure and reading back what the
   lib resolved may be strictly better than the route guessing — check whether
   the return value exposes that before designing around it.
4. **Keep the response contract stable.** `spreadsUnavailable` is currently
   `undefined` for standard venues on purpose (a standard venue never asked for
   lines, so their absence is not a degradation). Do not collapse
   "not applicable" and "unknown" into the same value.

**Tests:** `tests/api.nfl-pickem-games-route.test.ts` — a throwing
`getVenueNFLPickEmScoringMode` still returns 200 with games; the response says
the mode is unresolved rather than claiming `standard`; the happy paths for both
modes are unchanged.

---

## Phase 3 — The client must surface `spreadsUnavailable`

**Model: Sonnet 5 · Effort: Low-Medium** — the server half already exists and is
tested; this is wiring plus copy. Effort is Low-Medium only because it inherits
whatever shape Phase 2 settles on.

**Finding:** `components/nfl-pickem/NFLPickEmGameList.tsx:195`. The load effect
reads `data.scoringMode` off the games response and drops `data.spreadsUnavailable`
on the floor:

```ts
setWeekData({
  week: data.week,
  scoringMode: data.scoringMode === "spread" ? "spread" : "standard",
  games: data.games,
  userSummary: data.userSummary,
});
```

The flag is computed in `lib/nflPickEm.ts` (`spreadLinesUnavailable`), returned
by the route (`app/api/nfl-pickem/games/route.ts:72`), and covered by tests at
both layers — it just never reaches a pixel. Round 3 Phase 2 added it precisely
so "a spread venue with a failed odds feed doesn't render as if the games had no
line," and that last step was left as a follow-up. Right now such a venue is
visually identical to a standard-mode venue: `NFLGameCard` shows the spread only
when `formatSpread` returns non-null, so a null line just silently hides it, and
players pick blind against a spread they will be graded on.

**Work:**
1. Thread `spreadsUnavailable` (and whatever Phase 2 adds for an unresolved
   mode) into `weekData` and render one banner for the degraded state — not a
   per-card treatment; the condition is week-wide.
2. **Copy matters more than the wiring.** The player needs to know their picks
   will still be graded against the spread even though the numbers aren't
   showing. "Spreads are temporarily unavailable — your picks will still be
   scored against the spread" is the shape; do not word it as "spreads are off
   this week", which is a different (false) claim.
3. Decide explicitly whether picking stays enabled. **Recommendation: yes** —
   blocking picks on a transient odds-feed blip costs the player their entry for
   the week, which is worse than an informed blind pick. Say so in a comment.
4. Keep the standard-mode path untouched: `spreadsUnavailable` is `undefined`
   there and must render nothing.

**Tests:** this project has **no DOM-rendering harness** (`vitest.config.ts` is
`environment: "node"`, globs `tests/**/*.test.ts` only, and there are no
`.test.tsx` files) — see round 3 Phase 7, which hit this and solved it by
extracting the condition to an exported pure function. Do the same: export the
predicate that decides whether the banner shows, and unit-test that. Do not
stand up `jsdom`/`@testing-library` for this.

---

## Phase 4 — Settlement's scoring-mode skip must not be silent

**Model: Sonnet 5 · Effort: Medium** — the policy decision this needs was
already made in round 3 Phase 4 for the sibling branch; this applies it. Do
**not** re-litigate it.

**Finding:** `lib/pickem.ts:2424-2427`:

```ts
const nflScoringMode = row.sport_slug === "nfl" ? nflScoringModes.get(row.venue_id) ?? null : null;
if (row.sport_slug === "nfl" && !nflScoringMode) {
  continue;
}
```

`nflScoringModes` is populated from a `Promise.allSettled` at :2357-2366 that
records **only fulfilled** results. So one failed `getVenueNFLPickEmScoringMode`
read silently drops every NFL pick at that venue from the sweep, with no log, no
counter, and no effect on the returned
`{ pendingScanned, settledCount, won, lost, push }` — the sweep reports success
while grading nothing. The picks stay `pending`, which (per round 3 Phase 4's
finding) also blocks those players' daily multiplier for as long as it lasts,
since `claim_pickem_points` clears `multiplier_eligible` while any pick is
pending.

**Work:**
1. **Make it observable.** Log a `warn` naming the venue when the mode read
   fails — once per venue, not once per pick (round 3's `spreadStallWarned` set
   is the pattern to copy, a few lines below in the same function). Surface a
   count in the return value so a cron reading the result can tell "nothing to
   do" from "couldn't grade 40 picks."
2. **Do not void on this failure, and comment why.** Round 3 Phase 4 voids a
   spread pick past `staleFinalizeMs` because a missing *line row* is
   permanently unfixable — no later sweep can create it. This failure is the
   opposite: the settings row almost certainly exists and the next sweep will
   read it. Writing terminal state onto a player's pick because *our* DB read
   blipped is not the same trade. Keep it pending, and say so at the `continue`
   so the two neighbouring branches don't look inconsistent to a future reader.
3. **Do not fall back to `"standard"`** — same reasoning as Phase 2's option 1,
   and here it would actually award points under the wrong rules.
4. Consider a single inline retry for the failed venue before giving up, since
   the sweep is a background job and the read is cheap. Optional; if you skip
   it, note why.

**Tests:** extend `tests/lib.pickem-nfl-scoring-mode.test.ts` — a venue whose
mode read rejects leaves its picks `pending`, logs once (not once per pick), and
is reflected in the returned counts; picks at *other* venues in the same sweep
still settle normally (the failure must not be contagious).

---

## Phase 5 — The line refresh must not clobber a concurrent lock

**Model: Sonnet 5 · Effort: Low-Medium** — well-bounded; the only judgement is
which of the two fixes to take (take both).

**Finding:** `lib/nflPickEm.ts:1135` / `:1209` (PLAUSIBLE, narrow race).
`refreshNFLPickEmGameLines` snapshots `const nowMs = Date.now()` **before** the
provider fetch:

```ts
const nowMs = Date.now();
…
const providerLines = await fetchNFLSpreadLinesFromBDL({ … });   // network, multi-page
…
const hasKickedOff = Number.isFinite(startsAtMs) && nowMs >= startsAtMs;   // stale clock
…
.upsert({ …, locked_at: null }, { onConflict: "game_id" })
```

A game that kicks off *during* that fetch still reads as not-kicked-off against
the stale `nowMs`, so it takes the upsert branch — and the upsert writes
`locked_at: null` unconditionally, so a lock a concurrent request set while we
were fetching is wiped, along with the frozen pre-kickoff spread it protected.
The window is exactly the duration of the odds fetch (round 3 measured ~1.4s for
a spread-venue request), and it only bites a game kicking off inside it — hence
PLAUSIBLE.

**Work:**
1. **Re-read the clock before the write.** Derive `hasKickedOff` from a fresh
   `Date.now()` at the point of use rather than a pre-fetch snapshot. Keep the
   snapshot for the `unlockableGames` pre-filter (deciding what to *fetch* is
   fine on a slightly stale clock) and be explicit in a comment that the two
   uses are deliberately different.
2. **Stop writing `locked_at: null` in the upsert.** `locked_at` is
   `timestamptz` with no NOT NULL and no default
   (`supabase/migrations/20260802120000_nfl_pickem_venue_scoring_mode.sql:33`),
   so omitting it from the payload gives `null` on insert and leaves an existing
   value **untouched** on conflict — which is the desired semantics: a lock,
   once set, is never un-set by a refresh. Verify that against how
   `postgrest`/`supabase-js` builds the `ON CONFLICT DO UPDATE SET` list (it
   sets exactly the supplied columns) before relying on it.
3. Both fixes are worth having: (1) narrows the window, (2) makes losing the
   race harmless. Do not ship only one.

**Tests:** `tests/lib.nfl-pickem-game-fetch.test.ts` — a game that kicks off
between the snapshot and the write takes the lock path, not the upsert path;
an upsert against a row that is already locked leaves `locked_at` intact.

---

## Phase 6 — A discount create/update must not blank the mirror on an unresolvable coupon

**Model: Opus 5 · Effort: Medium** — the same mirror-vs-Stripe class rounds 1–3
kept finding, the failure is silent and money-facing, and the fix needs a
distinction the current helper cannot express.

**Finding:** `app/api/webhooks/stripe/route.ts:426`, the non-`removed` branch of
`syncDiscountFromEvent`:

```ts
const mirror = removed
  ? { ...CLEARED_MIRROR }
  : discountMirrorFromStripe(discount, await resolveDiscountCoupon(discount));
```

`resolveDiscountCoupon` (`lib/billingDiscounts.ts:373`) returns `null` on a
failed `coupons.retrieve` — a transient Stripe outage, a rate limit. Fed a
`null` coupon, `discountMirrorFromStripe` still produces a **full mirror
object**, with `discount_percent_off` and `discount_amount_off_cents` both
`null` and the label falling back to the raw coupon id. That object is then
written. The partner's page shows list price with a meaningless label while
Stripe keeps applying the discount to the invoice.

The right precedent is directly above it: `resolveDiscountMirror`
(`app/api/webhooks/stripe/route.ts:307`) returns **`null`** — meaning "leave the
mirror alone" — for exactly this case, with the comment *"Stripe unreachable —
keep the existing mirror rather than guessing."* `syncDiscountFromEvent` never
adopted that contract.

**The complication:** `resolveDiscountCoupon` returns `null` for **two different
things** — "the payload carried no coupon reference at all" and "there was a
reference but the retrieve failed." Only the second should suppress the write;
the first is a genuinely coupon-less discount. The fix therefore needs the two
distinguished, not just a null check bolted on.

**Work:**
1. Give `resolveDiscountCoupon` (or a new sibling) a return shape that
   distinguishes *no reference* from *resolution failed*. Prefer a discriminated
   result over an out-param or a thrown sentinel. It has other callers —
   `resolveDiscountMirror` uses it twice — so either keep the existing signature
   and add the sibling, or update every call site deliberately.
2. On **resolution failed**, skip the write entirely and leave the mirror as-is,
   matching `resolveDiscountMirror`'s stated contract. Log a `warn` naming the
   subscription and the unresolved coupon ref.
3. **State the asymmetry in a comment**, as round 3 Phase 5 did for the delete
   direction: a stale mirror is self-repaired by the accompanying
   `customer.subscription.updated` (which re-syncs from the subscription's own
   discount state); a wrongly-blanked one is not, because nothing re-creates a
   discount we erased. That asymmetry is the whole reason "don't write" beats
   "write what we have."
4. **Check the ref-already-expanded path.** When the payload carries the full
   Coupon object there is no retrieve and no failure mode — make sure the new
   branch doesn't accidentally suppress those perfectly good writes.
5. While in this function: the `removed` branch was hardened in round 3 Phase 5
   and is **not** in scope. Do not disturb `deletedCouponOwnsMirror` or its
   row-read-before-write.

**Tests:** `tests/api.webhooks.stripe-discount-sync.test.ts` — a
`customer.discount.created` whose `coupons.retrieve` throws leaves the existing
mirror byte-for-byte unchanged and logs; the same event with the coupon expanded
in the payload writes normally; a discount with genuinely no coupon reference
behaves as it does today (do not change that path silently); the round-3
`deleted` cases still pass unchanged.

---

## Phase 7 — `grant-manual` must validate before it mutates Stripe

**Model: Sonnet 5 · Effort: Low-Medium** — moving code, not designing it. The
care needed is in not reordering something that depends on the reads in between.

**Finding:** `app/api/admin/billing/route.ts:333`. The grant-manual handler
mutates Stripe **twice** before it ever validates `paidThroughDate`:

```ts
// :302  force-cancel branch — cancelSubscription(existingSub)
// :333  removeDiscountFromSubscription(existingSub)   ← detaches the live coupon
// :345  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))  → 400
// :351  if (periodEnd.getTime() <= Date.now())      → 400
```

So an admin who submits a malformed or past date gets a 400 — after the
partner's discount has already been irreversibly detached at Stripe, and (on the
`force: true` path) after their subscription has been scheduled for
cancellation. Nothing is rolled back. Retrying with a good date does not restore
the coupon; re-applying it means re-creating it through the discount admin.

**Work:**
1. **Validate every input before the first side effect.** Hoist the
   `paidThroughDate` format and future-date checks above the force-cancel branch
   at :302. Sweep the rest of the handler for any other validation that fires
   after a mutation — the two Stripe calls are the ones the review named, but
   the principle is "no 400 after a write."
2. **Preserve the read order.** The owner-link lookup (:243) and the
   `existingSub` select (:268) must still run before the guards that depend on
   them; only the *mutations* move down / the *validations* move up. The
   409 guards that read `existingSub` are validations too and are already
   correctly placed before the mutations — leave them.
3. **Do not weaken the detach.** The `hasDiscountMirror` / `status !== 'cancelled'`
   skip conditions and the fail-closed `removalIsMootAtStripe` handling are
   round-2 Phase 1's work (inventory item **U**) and are correct; this phase
   changes *when* that block runs, not *what* it does.
4. Add a short comment at the top of the validation block stating the invariant
   ("everything below this line can mutate Stripe; nothing below it may return
   400 for bad input"), since the ordering is the whole fix and is otherwise
   invisible.

**Tests:** the admin billing suite — a grant-manual with a malformed
`paidThroughDate` and with a past date each returns 400 **and makes no Stripe
call at all** (assert on the mocked `cancelSubscription` /
`removeDiscountFromSubscription` not having been called); the happy path with a
discounted card row still detaches, then converts.

---

## Phase 8 — Verification + close-out

**Model: Sonnet 5 · Effort: Medium**

1. `npx tsc --noEmit`, `npm run lint`, `npm run test` green.
2. **Browser pass for Phases 1–4** via the `verify` skill — the failure modes
   are "a pick is graded wrong" and "the games list 500s," which unit tests
   can't fully speak to. Against a throwaway venue: load the games list for a
   standard-mode and a spread-mode venue; force a settings-read failure and
   confirm the list still renders with the degraded banner (Phases 2+3); and
   drive **one** spread pick through settlement with a known line and score, and
   check the grade by hand against the line (Phase 1). Round 3's Phase 8 log
   records how the throwaway `venue_game_settings` row was created and reverted
   — reuse that method.
3. **Phases 6 and 7 need no live Stripe** — mocked-SDK tests cover both, and
   round 2 Phase 4's finding still stands: the permission classifier blocks the
   agent from running `node --env-file=.env.local …`, so every seed/read/cleanup
   step of a live pass has to be run by hand. Skip deliberately or budget for it.
   (Reminder from memory: `.env.local`'s `STRIPE_SECRET_KEY` is **live** — any
   live billing work uses the Stripe CLI's test key.)
4. `npm run test:god-mode-join` only if any phase ends up touching the join
   shell — none of these seven should. Note it either way.
5. Append a per-phase run-log section with pass/fail lines to
   `docs/billing-run-log.md`.
6. **Inventory:** add and close items **Z** (discount create/update blanking the
   mirror on an unresolvable coupon, Phase 6) and **AA** (`grant-manual`
   mutating Stripe before validating its input, Phase 7) in
   `docs/billing-open-issues-plan.md`, following the U–Y convention. The NFL
   findings (Phases 1–5) go in
   `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`'s "Round 3 Code
   Review Findings" section — add a Round 4 sibling — not the billing table.
7. **Correct `docs/nfl-pickem-venue-scoring-mode-plan.md:186-189`** if Phase 1
   didn't already. A spec that still describes the double-count is how this
   comes back.
8. Ask the user to re-run `/code-review` — it is user-invoked and cannot be
   launched from a session.

---

## Model / effort summary

| Phase | Work | Model | Effort |
|---|---|---|---|
| 0 | Baseline | Haiku 4.5 | Low |
| 1 | Spread grading: apply the line once | **Opus 5** | Medium-High |
| 2 | Games route: guard the settings read, pick an honest fallback | **Opus 5** | Low-Medium |
| 3 | Client: render the spreads-unavailable state | Sonnet 5 | Low-Medium |
| 4 | Settlement: log + count the scoring-mode skip | Sonnet 5 | Medium |
| 5 | Line refresh: fresh clock + don't null `locked_at` | Sonnet 5 | Low-Medium |
| 6 | Webhook: don't write a mirror built from an unresolvable coupon | **Opus 5** | Medium |
| 7 | `grant-manual`: validate before mutating | Sonnet 5 | Low-Medium |
| 8 | Verification + close-out | Sonnet 5 | Medium |

**Opus 5 for Phases 1, 2 and 6.** Phase 1's diff is trivial but its context is
adversarial — a passing test and a written spec both assert the wrong answer, so
the model has to trust a derivation over the artifacts around it, and it has to
decide what to do about picks that may already carry wrong points. Phase 2 picks
what a player is shown when we don't know the rules of their game, and the
obvious fallback silently mis-grades a spread venue. Phase 6 is the same
mirror-vs-Stripe reasoning rounds 1–3 existed to get right, and it needs a
helper signature changed to express a distinction the current one can't.

**Sonnet 5 for Phases 3, 4, 5, 7** — each has either the correct implementation
already in the tree to mirror (round 3's `spreadStallWarned` for 4,
`resolveDiscountMirror`'s contract for 5's comment style, round 3 Phase 7's
extract-a-pure-function trick for 3) or a single well-bounded mechanical change
(7 is hoisting validation above the mutations). Phase 4's policy question was
already decided in round 3 and is restated inline here so it isn't re-opened.
