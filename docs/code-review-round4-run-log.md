# Code Review Round 4 Run Log

Shared memory between the independently-run phases in
docs/code-review-round4-run-phases.sh. Each phase reads this file first; a
note here about an earlier phase supersedes anything that contradicts it in
that phase's own section of docs/code-review-round4-plan.md.

## Phase 0 — Baseline

Starting SHA: `52b927f3a138dc3bc838a24fe7c81a27f53146a9` (commit
"Close out billing code review bookkeeping across rounds 1-3").

Baseline checks clean: `npx tsc --noEmit` (no output), `npm run lint` (no
errors), `npm run test` → **154 passed / 1 skipped (155 files)**, **1290
passed / 13 skipped (1303 tests)**. Matches expected counts exactly. Working
tree clean apart from `.gitignore` (M), two advertising PNGs (??), and
expected untracked docs from the prior review run. No deviation from plan.
Each phase below is a separate revertible commit on this SHA.

## Phase 1

Fixed as specified: `resolveSpreadPickEmSettlement` now adjusts the home side
only (`homeScore + line.homeSpread` vs raw `awayScore`), with the
`awaySpread === -homeSpread` invariant named in a comment. `winningTeamId`
untouched — still outright. Rewrote the `-1.5` push test to `lost`; added the
`-3` cover sentinel, a dog-cover case, and an integer exact-push case; annotated
both `-2.5` cases as blind to this bug. Corrected the formula in
`docs/nfl-pickem-venue-scoring-mode-plan.md:186-189`, so **Phase 8 item 7 is
already done**. tsc/lint clean; suite 1293 passed / 13 skipped (155 files, +3).

**Deviation — the settled-picks audit did not run.** The permission classifier
refused `node --env-file=.env.local /tmp/round4-phase1-spread-audit.cjs`
(read-only counts). Nothing was re-graded. Phase 8 must get user approval and run
it before the branch ships.

## Phase 2

Implemented as recommended: the settings read is wrapped in try/catch and, on
failure, the mode is reported as **unresolved** rather than guessed.

Contract for Phase 3: `scoringMode` is now `"standard" | "spread" | null` (null =
unresolved) plus a new `scoringModeUnresolved: true` marker (undefined
otherwise). `spreadsUnavailable` is deliberately **left undefined** when the mode
is unresolved — with no mode we can't say lines were applicable, and the plan
forbids collapsing "not applicable" and "unknown". So Phase 3's banner predicate
must be `spreadsUnavailable === true || scoringModeUnresolved === true`, with
different copy per branch ("spreads temporarily unavailable, picks still graded
against the spread" vs "we couldn't confirm this venue's scoring rules"). Spreads
stay hidden while unresolved.

Plan item 3 checked so Phase 3 needn't: `listNFLPickEmGames` does **not** return
its resolved mode, so the route can't read it back; it now passes
`scoringMode: undefined` on failure so the lib applies its own degradation
(refresh lines anyway).

`NFLPickEmGameList.tsx:195` still coerces null → "standard" — Phase 3 must change
that line. tsc/lint clean; suite 1296 passed / 13 skipped (155 files, +3).

## Phase 3

Implemented as specified, no deviation. Left the `scoringMode` coercion (null →
`"standard"`) alone rather than changing it: `NFLGameCard`'s `showSpread` only
keys off `scoringMode === "spread"`, and the route already sends
`homeSpread`/`awaySpread` as `undefined` whenever mode isn't confirmed `"spread"`
(both unresolved and standard), so the card behaves correctly either way — the
banner is the thing that actually needed to change, not that coercion.

Added `getSpreadsBannerState({ scoringModeUnresolved, spreadsUnavailable })` in
`NFLPickEmGameList.tsx`, exported per round 3 Phase 7's precedent, with a
`SPREADS_BANNER_COPY` map (`"unresolved" | "unavailable"`, `unresolved` takes
priority per Phase 2's contract). Threaded both flags into `weekData`, rendered
one week-wide banner section above the games list, unit-tested in the new
`tests/components.nfl-pickem-spreads-banner.test.ts` (5 cases incl. the
both-flags-set precedence case). Picking stays enabled in both states.

tsc/lint clean; suite 1301 passed / 13 skipped (156 files, +5). Nothing left for
Phase 4 to skip; no new discoveries.

## Phase 4

Implemented as specified, no deviation. `settlePendingPickEmPicks`'s `continue`
on an unresolved NFL scoring mode now: warns once per venue (`scoringModeUnresolvedWarned`
set, same pattern as `spreadStallWarned`), increments a new
`scoringModeUnresolvedSkipped` counter, and leaves the pick `pending` —
no void, no fallback to `"standard"`, per round 3 Phase 4's policy (a settings
read is transient and self-heals next sweep; a missing line row is not). Added
the counter to `settlePendingPickEmPicks`'s return type and both early-return
shapes. `app/api/cron/pickem-settle/route.ts` already spreads the whole result
into its JSON response, so the new field surfaces with no route change needed.

Added `store.modeErrors` (a per-venue reject switch) to the existing mock of
`getVenueNFLPickEmScoringMode` in `tests/lib.pickem-nfl-scoring-mode.test.ts`
and three new tests: pending+counted+single-warn on a failed read, one-warn-not-
per-pick across two picks at the same venue, and a failed venue not blocking a
healthy venue's settlement in the same sweep. tsc/lint clean; suite 1304 passed
/ 13 skipped (156 files, +3). Nothing left for later phases to skip; no new
discoveries.

## Phase 5

Implemented both fixes as specified, no deviation. `refreshNFLPickEmGameLines`
(`lib/nflPickEm.ts`) now re-reads `Date.now()` at the point of use inside the
write loop for `hasKickedOff`, keeping the pre-fetch `nowMs` snapshot only for
the `unlockableGames` pre-filter (commented as deliberately different uses).
The upsert payload no longer sets `locked_at: null`; the field is omitted
entirely so a genuine insert gets `NULL` from the column's own lack of a
default, and an `ON CONFLICT` update leaves an existing value untouched
(verified this is how `supabase-js`/PostgREST builds the `SET` list — only
supplied columns are touched).

Test mock needed a small update to stay honest: `tests/lib.nfl-pickem-game-fetch.test.ts`'s
in-memory `upsert` previously spread the payload verbatim on insert, so an
omitted `locked_at` key would leave the row without that property at all
(masking the real-world NULL-default behavior) — fixed by defaulting
`locked_at: null` only on the insert branch, never touching it on the
conflict/update branch, matching real Postgres semantics. Added two new tests:
a game kicking off during the (mocked, clock-flipping) odds fetch takes the
lock path not the upsert path, and an upsert landing against a row a
concurrent writer just locked leaves `locked_at` intact. tsc/lint clean; suite
1306 passed / 13 skipped (156 files, +2). Nothing left for later phases; no new
discoveries — Phase 5 has no dependents in the table.

## Phase 6

Implemented as specified, no deviation. Added `DiscountCouponResolution`
(`absent` | `resolved` | `unresolved`) + `resolveDiscountCouponResult` in
`lib/billingDiscounts.ts`; the old `resolveDiscountCoupon` stays, now a thin
wrapper, so its two `resolveDiscountMirror` call sites are untouched.
`syncDiscountFromEvent`'s non-`removed` branch returns without writing (and
warns with the subscription + coupon ref) only on `unresolved`; `absent` and
expanded-coupon payloads write exactly as before. The `removed` branch and
`deletedCouponOwnsMirror` were not touched.

Discovery for Phase 8: `resolveDiscountMirror` has the same latent defect on
its two inner coupon resolutions (a retrieve failure there still yields a
valueless mirror rather than null). Left alone as out of scope — worth an
inventory note under item **Z**, not a code change in this round.

tsc/lint clean; suite 1310 passed / 13 skipped (156 files, +4).

## Phase 7

Implemented as specified, no deviation. Hoisted the `paidThroughDate`
format/future-date validation (previously after both mutations, at old
:344-353) to immediately after the `existingSub` select and before the
force-cancel guard block, so both Stripe mutations (force-cancel,
discount detach) now sit below all validation. Added the invariant comment
at the top of the validation block per item 4. The 409 guards, the detach's
skip conditions (`hasDiscountMirror`, `status !== 'cancelled'`), and
`removalIsMootAtStripe` were not touched — only the validation moved.

Added `tests/api.admin.billing-grant-manual-validates-first.test.ts`
(3 tests): malformed date and past date each 400 with `cancelSubscription`,
`removeDiscountFromSubscription`, and the upsert all unasserted-as-called on
a row with both a live Stripe sub and a discount (worst case for exposure);
happy path still detaches then converts. Existing
`api.admin.billing-grant-manual-guard.test.ts` suite unaffected — it already
passes a valid future date in every case, so it doesn't exercise the new
ordering.

tsc/lint clean; suite 1313 passed / 13 skipped (157 files, +3). No
discoveries for later phases; Phase 8's browser pass needs no live Stripe
for this phase per the plan (mocked tests cover it).

## Phase 8

Verification only, no code changes. tsc/lint/test all green, unchanged from
Phase 7's checkpoint (157 files / 1313 / 13 skipped).

**Deviation:** the Phases 1–4 browser pass and Phase 1's settled-picks audit
could not run — this session auto-denies any command touching `.env.local`
or the network (dev server, curl, even `npm run test:god-mode-join`, a
command not pre-approved this session) since it's running unattended with no
one to approve. Round 3's Phase 8 ran the identical browser pass successfully
in an attended session, so this is a session-permission gap, not a code gap.
Both are flagged to the user rather than silently skipped or assumed passing.

Also done: items Z/AA added to `billing-open-issues-plan.md`; a "Round 4 Code
Review Findings" section added to
`nfl-pickem-spread-line-settlement-locking-fix-plan.md`; confirmed Phase 1
already fixed `nfl-pickem-venue-scoring-mode-plan.md:186-189`. Full detail in
`docs/billing-run-log.md`'s new Round 4 Phase 8 section.
