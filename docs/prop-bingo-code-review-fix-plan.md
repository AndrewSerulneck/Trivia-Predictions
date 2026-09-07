# Prop Bingo — Code Review Fix Plan (Phases 9–15)

Fixes the 7 findings from the Opus 5 / effort-high code review of the Phase 1–8 working tree
(2026-09-07). Companion to `docs/prop-bingo-page-simplification-plan.md`; phase numbering
continues from that document (which ended at Phase 8) so the two read as one sequence.

**Baseline at review time:** `npx tsc --noEmit` clean, `npm run lint` clean. `npm run test` has
one pre-existing failure, `tests/lib.billingDiscounts.test.ts` — a date-dependent billing
assertion, **unrelated to this diff**. Do not "fix" it inside these phases; if it still fails at
Phase 15, log it as out-of-scope rather than folding it in.

---

## Findings → phase map

| # | Finding | Site | Phase |
|---|---|---|---|
| 1 | History stack marks in-progress games as settled | `SportsBingoHome.tsx:1475`, `:1915` | 13 |
| 2 | Calendar-dots query failure 500s the whole boards response | `app/api/bingo/cards/route.ts:103` | 9 |
| 3 | Retired inline ads uneditable; `ads-bulk` skips the guard | `app/api/admin/route.ts:1419`, `:1571` | 10 |
| 4 | NFL boards show "Generating NBA board..." | `SportsBingoSelectBoard.tsx:201` | 11 |
| 5 | Reopening calendar within 270 ms auto-closes it | `DateCalendarPopover.tsx:173` | 12 |
| 6 | Invalid dates roll over silently instead of being refused | `app/api/bingo/cards/route.ts:51` | 9 |
| 7 | Stale history boards paint for one frame on day switch | `SportsBingoHome.tsx:2383` | 14 |

**Sequencing rationale.** Phases 9–12 are independent and touch four different files — they can
run in any order, or in parallel by separate agents. Phases 13, 14 and 14.5 all edit
`SportsBingoHome.tsx` and **must run in that order, sequentially, never in parallel**. Phase 15
closes out.

Phase 14.5 has no row in the table above because it is not a review finding — it is the follow-on
Phase 13 surfaced (see "Two known limitations" in the Phase 13 AS BUILT notes).

---

## Phase 9 — Boards API: isolate the calendar query, reject impossible dates

**Model: Sonnet 5 · Effort: medium.** Two contained, mechanical changes in one 120-line route
handler. No product judgment, no shared-state reasoning.

Fixes findings **2** and **6**.

9a. **Isolate the calendar-dots query (finding 2).** `listUserSportsBingoCardDates` at
`route.ts:103` currently sits inside the same `try` as the primary `listUserSportsBingoCards`
call, so a failure in the *decorative* query fails the *essential* one. Give it its own
`try/catch` that swallows the error and returns `undefined`. The response shape already treats
`activeDates` as optional (`...(activeDates ? { activeDates } : {})`), so the client needs no
change — the calendar simply renders without dots. Log the swallowed error to `console.error`
with a `[bingo][cards][dates]` tag so it stays visible in Vercel logs.

9b. **Note the per-broadcast cost (finding 2, second half).** The client sends
`includeDates=true` on every poll and every realtime refresh, so this 500-row query runs once
per broadcast. **Do not restructure the client in this phase** — that is a behavior change, not
a bug fix. Instead: confirm the query is indexed on `(user_id, starts_at)`, and record the
finding in the AS BUILT notes as a follow-up candidate. If the index is missing, say so; adding
it is a new timestamped migration and its own decision.

9c. **Validate calendar-real dates (finding 6).** `resolveLocalDayWindow` at `route.ts:51`
tests only `LOCAL_DAY_PATTERN` (shape), then hands the parts to `Date.UTC`, which silently rolls
`2026-02-30` over to March 2 and returns the wrong day's boards with a 200 — contradicting the
comment at `:82` that says a malformed date is "refused rather than silently ignored."
Round-trip the constructed date and reject on mismatch: rebuild `year`/`month`/`day` from the
resulting `Date`'s UTC getters and return `null` if any component differs. Reuse the existing
`null` → 400 path at `:87`; no new error shape.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run test`. Add or extend a route test
asserting (a) `?date=2026-02-30` → 400, (b) `?date=2026-02-28` → 200, (c) a forced
`listUserSportsBingoCardDates` rejection still returns 200 with cards and no `activeDates`.

### Phase 9 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete, uncommitted (working tree, alongside the Phase 1–8 simplification diff).**
`npx tsc --noEmit` clean, `npm run lint` clean. `npm run test`: 1977 pass / 1 fail — the fail is
`tests/lib.billingDiscounts.test.ts` ("pushes current_period_end forward for free months"), the
pre-existing date-dependent billing assertion the baseline note calls out. Untouched by this
phase.

#### 9a — `app/api/bingo/cards/route.ts`, calendar-dates query isolation

`listUserSportsBingoCardDates` moved out of the shared `try` in `GET` into its own
`try/catch`. On success `activeDates` is the `string[]` it returns; on throw the catch logs
`console.error("[bingo][cards][dates] failed to load calendar dates", datesError)` and leaves
`activeDates` as `undefined`. The response spread (`...(activeDates ? { activeDates } : {})`) was
already tolerant, so the client is unchanged — the calendar just renders without dots. Typed the
local as `let activeDates: string[] | undefined;` (no `Awaited<ReturnType<…>>` needed — the
function's signature is already `Promise<string[]>`).

#### 9b — per-broadcast `includeDates` cost: **NOT restructured** (deferred, as instructed)

- The client still sends `includeDates=true` on every poll/realtime refresh; that is a behavior
  change and out of scope here.
- **Index status:** there is **no composite `(user_id, starts_at)` index.** What exists on
  `sports_bingo_cards` (`supabase/migrations/20260420113000_add_sports_bingo_tables.sql:41–44`):
  a single-column `idx_sports_bingo_cards_user` on `(user_id)` and a single-column
  `idx_sports_bingo_cards_starts_at` on `(starts_at)`. The query
  (`lib/sportsBingo.ts:11649` — `.eq("user_id", …).order("starts_at", desc).limit(500)`) can use
  the `(user_id)` index for the filter and then sorts the (per-user, bounded) result set in
  memory. Adequate at current per-user row counts; a dedicated `(user_id, starts_at desc)` index
  would remove the sort. **Adding it is a new timestamped migration and its own decision — left
  for Andrew / a follow-up, per 9b.** Recorded again in the Phase 15 deferred-items list (15d).

#### 9c — `resolveLocalDayWindow` round-trip validation

After `const utcMidnight = Date.UTC(year, month - 1, day)` and the existing `Number.isFinite`
guard, added a round-trip: `const roundTrip = new Date(utcMidnight)` then `return null` if
`getUTCFullYear() / getUTCMonth() / getUTCDate()` don't match the parsed `year / month-1 / day`.
This catches `Date.UTC`'s silent rollover (`2026-02-30` → `2026-03-02`). Reuses the existing
`null` → 400 path at `route.ts:~99` — no new error shape, same
`"date must be a local calendar day formatted as YYYY-MM-DD."` message. Shape-valid-but-real
dates (incl. leap day `2026-02-28`, and `2026-02-29` correctly rejected since 2026 is not a leap
year) are unaffected.

#### Tests — `tests/api.bingo.cards.test.ts` (18 tests, all green)

Three added, placed just before "GET omits the starts_at window entirely when no date is given":
1. `?date=2026-02-30` → 400, error contains `YYYY-MM-DD`, `listUserSportsBingoCards` never
   called.
2. `?date=2026-02-28&tzOffsetMinutes=0` → 200 with the expected half-open window
   `2026-02-28T00:00:00.000Z` .. `2026-03-01T00:00:00.000Z`.
3. `listUserSportsBingoCardDates` mock `mockRejectedValue(...)` + `includeDates=true` → still
   200, `body.cards` length 1, `body.activeDates` undefined, `console.error` spy called (spy is
   `mockImplementation(() => {})` then `mockRestore()`d so the swallowed-error log doesn't dirty
   test output).

#### What the next phase (10) needs to know

- Phase 9 touched **only** `app/api/bingo/cards/route.ts` and `tests/api.bingo.cards.test.ts`.
  No overlap with Phase 10's `app/api/admin/route.ts`. Phases 9–12 remain independent.
- Phase 10 is **still blocked on Andrew's policy decision** (the DECISION REQUIRED note —
  "guard the resulting state, not the request"). Do not start coding it until that is confirmed.
- Baseline for Phase 10's verify step is unchanged: `tests/lib.billingDiscounts.test.ts` is the
  sole pre-existing failure; everything else is green.

---

## Phase 10 — Admin ads: fix the retirement guard in both directions

**Model: Opus 5 · Effort: medium.** Small diff, but it needs a policy decision about existing
partner data and it spans two request paths that currently disagree.

Fixes finding **3**.

**DECISION REQUIRED FROM ANDREW BEFORE CODING.** The Phase 1 guard at `app/api/admin/route.ts:1419`
rejects *any* PATCH whose payload is a `sports-bingo` + `inline` ad. Combined with the ad-type
select no longer offering `inline` and the auto-fix effect early-returning on empty
`slotOptions`, that makes every pre-retirement inline bingo ad **permanently uneditable** — the
admin cannot even deactivate or re-slot it. Meanwhile `resource: "ads-bulk"` (`:1571`) never
consults the guard at all, so bulk **Enable** can re-activate the very rows the Phase 1
migration deactivated.

Recommended rule (confirm before implementing): **guard the resulting state, not the request.**

10a. **Narrow the PATCH guard.** Reject only when the save would leave the row an *active*
`sports-bingo` inline ad. Explicitly allow: setting `active: false`, and moving `pageKey` or
`slot`/`adType` off the retired combination. That restores the admin's ability to wind these
rows down — which is what the migration's "deactivate, do NOT delete" intent actually wants —
while still refusing to bring the slot back.

10b. **Apply the guard to `ads-bulk` enable.** In the `body.action === "enable"` branch at
`:1579`, filter the incoming `ids` against the retired combination before calling
`bulkSetAdminAdvertisementsActive`. Two acceptable shapes — pick one and note which:
skip retired ids and report them back in the response, or refuse the whole batch with a 400
naming them. `disable` and `delete` must stay unguarded (winding down is always allowed).
This requires a lookup of the rows by id first, since the bulk payload carries only ids.

10c. **Keep the guard's single source of truth.** Both call sites should test the same
predicate — extract it as a small local helper rather than duplicating the
`pageKey === "sports-bingo" && (adType === "inline" || slot === "inline-content")` expression.
Mirror the `slot_key = 'sports-bingo-inline'` arm the migration also matches on.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run test`. Manual admin pass: open a legacy
inline bingo ad, confirm it can be saved as inactive and cannot be saved as active; bulk-select
it and confirm Enable does not reactivate it.

**Risk:** this is the one phase touching a live admin surface with existing partner rows. Do not
delete any advertisement row, and do not alter the Phase 1 migration — it is applied history.

### Phase 10 — AS BUILT (2026-09-07, Opus 5)

**Status: complete, uncommitted** (working tree, alongside the Phase 1–9 diff).
**Policy decision received from Andrew: "guard the resulting state, not the request."** Implemented
exactly that.

`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test`: 1989 pass / 1 fail — the fail is
still `tests/lib.billingDiscounts.test.ts` ("pushes current_period_end forward for free months"),
the pre-existing date-dependent billing assertion from the baseline note. Untouched here.

#### 10c (done first) — single source of truth: `lib/adPlacements.ts`

Appended at the bottom of `lib/adPlacements.ts`:
- `RETIRED_BINGO_INLINE_AD_MESSAGE` — `"The Bingo inline ad slot has been retired."` (the exact
  pre-existing string, so nothing that greps for it drifts).
- `isRetiredBingoInlinePlacement({ pageKey, adType, slot, slotKey })` — `pageKey === "sports-bingo"`
  AND (`adType === "inline"` OR `slot === "inline-content"` OR `slotKey === "sports-bingo-inline"`).
  Mirrors all three match arms of `supabase/migrations/20260907120000_retire_bingo_inline_ad_slot.sql`
  — including the `slot_key` arm the old inline expressions omitted.

It lives in `lib/adPlacements.ts` rather than local to the route because it ended up with **three**
call sites across two modules (route POST, route PATCH, route ads-bulk) plus `lib/admin.ts` — see
10a below. Params are widened to `| string | null` so callers can pass raw request bodies and DB
rows without casting.

#### 10a — PATCH guard narrowed (`app/api/admin/route.ts`, ads resource)

`if (body.active && isRetiredBingoInlinePlacement(body-ish))` → 400. So:
- `active: false` on the retired combination → **allowed** (wind-down).
- moving `pageKey` / `adType` / `slot` off the combination, active or not → **allowed**.
- anything that would leave the row an ACTIVE Bingo inline ad → refused.

Error text extends the old string rather than replacing it:
`"The Bingo inline ad slot has been retired. Save it as inactive, or move it to another page, ad type, or slot."`

**The POST (create) guard was deliberately left unconditional** — it now calls the same predicate
but with no `active` check. Creating a *new* row in a slot that no longer renders is never useful,
inactive or not; the resulting-state policy is about not stranding **existing** partner rows.
Flagging it here because it is the one place the two paths intentionally disagree.

#### 10a, second half — **`lib/admin.ts` also had to change, or 10a would have been cosmetic**

Not anticipated by the plan; worth reading before Phase 15 signs off. Narrowing the route guard
alone does **not** make a legacy row saveable: `updateAdminAdvertisement` re-validates the
placement and would have thrown anyway, because Phase 1 removed the `inline` entry from
`AD_PLACEMENTS["sports-bingo"].slots`:
- `isAdTypeSupportedForPage("sports-bingo", "inline")` → `false` → `Ad type "inline" is not
  supported on page "sports-bingo".`
- `getAllowedDisplayTriggers(...)` → `[]` → the trigger check throws too.

So the admin would have swapped one 400 for another and the row would still be uneditable — the
exact finding-3 symptom. Fix: in `updateAdminAdvertisement` only, compute

```ts
const isRetiredInlineWindDown = input.active === false && isRetiredBingoInlinePlacement({…placementMeta, slotKey: input.slotKey});
```

and skip **only** the page-support and trigger-support checks when it is true. Deliberately narrow:
- `createAdminAdvertisement` is untouched — new retired-combo rows stay impossible at both layers.
- It is gated on `active === false`, so an inactive row can never be laundered into an active one
  through this path.
- Slot/ad-type compatibility, URL/dimension/venue-leaderboard validation all still run.
- It keys off the retired-Bingo-inline predicate specifically, **not** "any inactive ad" — inactive
  ads with other invalid placements are still refused.

#### 10b — `ads-bulk` enable (chose: **skip and report**, not refuse-the-batch)

The `enable` / `disable` branch was split. `disable` and `delete` are byte-for-byte unguarded
(winding down is always allowed, and `disable` deliberately does not even do the id lookup).
`enable` now: `listAdminAdvertisementsByIds(body.ids)` → partition by the predicate → call
`bulkSetAdminAdvertisementsActive` with only the non-retired ids (skipped entirely when the list is
empty, since that helper throws on `[]`) → respond
`{ ok: true, updated, skippedRetired: <count>, skippedRetiredIds: [...] }` (the two `skipped*` keys
are omitted when nothing was skipped, so the existing response shape is unchanged for every normal
batch).

Rationale for skip-over-refuse: an admin bulk-selecting 30 ads shouldn't have the whole action fail
because one legacy row is in the set; partial success plus an explicit report is the behavior that
matches "wind these down" intent.

New lib function `listAdminAdvertisementsByIds(ids)` in `lib/admin.ts` (placed right after
`getAdminAdvertisementById`, same `AD_SELECT` / `mapAdRow` shape): one `.in("id", ids)` query, not
N round-trips. Unknown ids are simply absent from the result. **Note for future test authors:** four
test files mock `@/lib/admin` with a factory; adding a new import to the route did not break them
(vitest only throws on *access* of an undefined mock export, not on import), so no mock backfill was
needed.

#### Client — `components/admin/sections/AdsListSection.tsx`

`runBulkAction` reads the optional `skippedRetired` count and appends
`" N retired Bingo inline ad(s) skipped."` to the existing success toast. That is the whole client
change; no new state, no new UI.

#### Tests — `tests/api.admin.ads-retired-inline-guard.test.ts` (new, 8 tests, green)

POST create refused · PATCH active refused · PATCH `active:false` allowed (reaches
`updateAdminAdvertisement`) · PATCH moved-off-combination allowed · bulk enable skips + reports ·
bulk enable with an all-retired selection never calls the enable helper and returns `updated: 0` ·
bulk disable unguarded (no id lookup) · bulk delete unguarded.

#### Tests — `tests/admin.retired-bingo-inline-winddown.test.ts` (new, 4 tests, green)

Added in the same phase, closing what was first flagged as a coverage gap: the route tests mock
`updateAdminAdvertisement` out, so they prove the *policy* but not the *lib relaxation*. This file
drives `lib/admin.ts` directly against a `supabaseAdmin` chain mock (the
`tests/admin.update-venue.test.ts` pattern) and asserts:
1. a legacy Bingo inline ad saved `active: false` reaches the DB update, and the retired
   page/ad-type/slot are written back **as-is** (not silently rewritten to some other slot);
2. the same row saved `active: true` still throws, with no DB call;
3. the relaxation does **not** generalize — `speed-trivia` + `inline` (also unsupported, but not the
   retired Bingo combination) is still refused even when inactive;
4. `createAdminAdvertisement` still refuses the Bingo inline combination, active or not.

#### Admin form — the select was displaying a value the form would not submit

Found while tracing what the edit form actually sends for a legacy row (worth reading, because it
changes what the manual pass below will see). `draftFromAdvertisement` → `draftToPayload` passes
`pageKey` / `adType` / `slot` / `active` straight through, so the retired combination is submitted
verbatim and the new server guard is exercised exactly as tested — good. But the **Ad Type select
was lying**: `adTypeOptions` for `sports-bingo` is now `[popup, banner]`, and a `<select>` whose
`value` matches no option renders as its first option. The admin saw "Pop-Up" while the draft still
held `inline`, and nothing on screen explained the 400 they would get on an active save.

Fix in `components/admin/sections/adFormShared.tsx` (display only — no draft mutation, no coercion,
so the wind-down payload is unchanged): when `draft.adType` is not in the page's available types,
render it as a **disabled** option labelled `"Inline (retired)"` so the select shows the truth; and
when the draft is the retired combination, render one amber line under the select — "This Bingo
inline slot is retired and no longer renders. You can save this ad as inactive, or move it to
another page or ad type — it cannot be saved as active." Uses the same shared predicate.

#### Still open — the manual admin pass (Phase 10's own verify step)

**Not performed, and it cannot be automated from a coding session: it needs admin auth against a
real database that still holds a pre-retirement inline Bingo row.** Everything it would check is
now covered by the 12 automated tests above at the API and lib layers; what is left is genuinely
visual — that the real form renders and submits the way the tests say it does. What to check:
1. Open a legacy inline Bingo ad in Admin → Ads. Expect the Ad Type select to read
   **"Inline (retired)"**, the amber retired-slot line beneath it, and the Slot select to show
   "No slots available for this page & ad type" (expected — `getAvailableSlotsForPageAndType`
   returns `[]`). Then uncheck **Active** and Save. **Expected: 200, row saved inactive.** This is
   the path that was broken and is the single most important thing to eyeball.
2. Re-check Active and Save on the same row → **expected: 400** with the extended retired message.
3. Change Ad Type to Banner (or Page to another page) with Active on → **expected: 200**.
4. Bulk-select that row plus a normal one → **Enable** → expected success toast reading
   `"1 ad(s) enabled. 1 retired Bingo inline ad(s) skipped."`, and the legacy row still inactive
   after the list refetches.
5. Bulk **Disable** and (on a throwaway row only) **Delete** still work with no guard interference.

No advertisement row was deleted and the Phase 1 migration was not touched.

#### What the next phase (11) needs to know

- Phase 10 touched `app/api/admin/route.ts`, `lib/admin.ts`, `lib/adPlacements.ts`,
  `components/admin/sections/AdsListSection.tsx`, `components/admin/sections/adFormShared.tsx`, and
  added `tests/api.admin.ads-retired-inline-guard.test.ts` +
  `tests/admin.retired-bingo-inline-winddown.test.ts`. **Zero overlap with Phase 11's
  `components/bingo/SportsBingoSelectBoard.tsx`** — Phases 11 and 12 remain independent and can run
  in any order or in parallel.
- Phase 11 still carries an open question the plan asks you to **flag, not decide**: whether the
  fall-through default in `getGeneratingLoaderVariant` should become league-neutral with an explicit
  NBA branch. Recommend it in the AS BUILT notes; don't change today's NBA copy without Andrew.
- Verify baseline is unchanged: `tests/lib.billingDiscounts.test.ts` is still the sole pre-existing
  failure (1989 pass / 1 fail as of this phase). Everything else green.
- Carry forward to Phase 15's deferred list, in addition to 9b's missing
  `(user_id, starts_at)` index: **only** the un-run manual admin pass above. The `lib/admin.ts`
  unit-test gap that was flagged first is now closed by
  `tests/admin.retired-bingo-inline-winddown.test.ts`.
- Phase 10 needs no follow-up work before Phase 11 starts, and nothing in Phases 11–14 depends on
  the manual admin pass.

---

---

## Phase 11 — NFL generating-loader copy

**Model: Sonnet 5 · Effort: low.** A missing branch in a lookup function. Genuinely a one-block
change; anything more is scope creep.

Fixes finding **4**.

11a. `getGeneratingLoaderVariant` in `components/bingo/SportsBingoSelectBoard.tsx` has branches
for WNBA (`:179`) and MLB/baseball (`:190`), then falls through to an NBA-worded default
(`:201`). `americanfootball_nfl` hits that default, so every NFL board generates under
"Generating NBA board...". The shared `getLeagueDisplay(sportKey).emoji` lookup already fixed
the icon — only the copy is wrong.

11b. Add an NFL branch (`normalized.includes("americanfootball")` or `includes("nfl")`) with
its own `title` and `subtitle`; keep the existing sky/cyan class set unless Andrew asks for NFL
colors. While there, consider whether the fall-through default should stay NBA-worded or become
league-neutral ("Generating your board...") so the next league added doesn't reintroduce this
bug — recommend the neutral default plus an explicit NBA branch, but flag it rather than
deciding unilaterally, since it changes today's NBA copy.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run test`.

### Phase 11 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete, uncommitted** (working tree, alongside the Phase 9–10 diff).
`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test`: 1989 pass / 1 fail — still only
`tests/lib.billingDiscounts.test.ts` ("pushes current_period_end forward for free months"), the
pre-existing date-dependent billing assertion from the baseline note. Untouched here.

#### 11a/11b — `components/bingo/SportsBingoSelectBoard.tsx`, `getGeneratingLoaderVariant`

Added one branch immediately before the fall-through `return`, matching the shape of the existing
WNBA and MLB branches:

```ts
if (normalized.includes("americanfootball") || normalized.includes("nfl")) {
  return {
    emoji,
    title: "Generating NFL board...",
    subtitle: "Building balanced drive, scoring, and player-prop squares.",
    panelClassName: "border-sky-300/30 bg-slate-800/70",
    badgeClassName: "border border-sky-300/40 bg-sky-300/10 text-sky-200",
    barTrackClassName: "bg-slate-700/70",
    barClassName: "bg-gradient-to-r from-sky-500 to-cyan-400",
  };
}
```

- `sportKey` for NFL is `americanfootball_nfl`, so `normalized.includes("americanfootball")` is the
  real hit; the `|| includes("nfl")` arm is belt-and-suspenders and also covers a bare `"nfl"`.
- Kept the existing sky/cyan class set verbatim — Andrew was not asked for NFL colors, and the plan
  says keep them unless he asks. `emoji` still comes from the shared `getLeagueDisplay(sportKey)`
  lookup (already correct before this phase).
- One-block change only. No other edits to the file, no test file touched (the function has no
  existing unit test and the plan scoped this to the missing branch).

#### 11b, second half — league-neutral fall-through default: **DONE** (Andrew approved 2026-09-07)

Andrew asked for the neutral default explicitly, so it shipped in this phase:
- Added an explicit `normalized.includes("basketball") || normalized.includes("nba")` branch
  carrying today's exact NBA copy ("Generating NBA board..." / "Optimizing a fresh mix of team and
  player squares.") — NBA users see no change.
- The fall-through `return` is now league-neutral: title "Generating your board...", subtitle
  "Assembling a fresh mix of team and player squares." Same sky/cyan class set. So the next league
  added with no branch gets neutral copy, not NBA wording — the finding-4 failure mode is closed
  structurally.
- Branch order is now WNBA → MLB → NFL → NBA → neutral default. `getLeagueDisplay(sportKey).emoji`
  still supplies the emoji in every branch.
- No test added — the function still has no unit test and none of the four seeded leagues hits the
  neutral default. A future test author could assert an unknown `sportKey` yields "Generating your
  board...".

#### What the next phase (12) needs to know

- Phase 11 touched **only** `components/bingo/SportsBingoSelectBoard.tsx` (one function). Zero
  overlap with Phase 12's `components/ui/DateCalendarPopover.tsx` — Phases 11 and 12 were
  independent as planned.
- Verify baseline unchanged: `tests/lib.billingDiscounts.test.ts` is still the sole pre-existing
  failure (1989 pass / 1 fail). Everything else green.
- Nothing in Phase 11 blocks Phase 12, 13, or 14. Phase 12 can start immediately.
- The league-neutral loader default (11b) is **no longer deferred** — Andrew approved it and it
  shipped in this phase. Phase 15's 15d deferred list carries only 9b's missing
  `(user_id, starts_at)` index and Phase 10's un-run manual admin pass.

---

## Phase 12 — Calendar popover: clear the pending close timer

**Model: Sonnet 5 · Effort: medium.** A small, well-understood timer/effect-cleanup bug, but it
sits in focus-management code where a careless fix breaks the focus trap.

Fixes finding **5**.

12a. **Clear the timer on open.** `closeSheet` (`DateCalendarPopover.tsx:163`) schedules a
`setTimeout` into `closeTimerRef`, but `openSheet` (`:173`) only resets `isClosing`/`isOpen` — it
never cancels the in-flight timer. Because the backdrop is `pointer-events-none` while closing,
the trigger stays tappable, so reopening within `resolveExitMs()` (~270 ms) lets the stale timer
fire against the newly opened sheet: it closes itself and yanks focus back to the trigger. Add a
`clearTimeout(closeTimerRef.current)` + null-out at the top of `openSheet`.

12b. **Add the unmount cleanup too.** There is no effect clearing `closeTimerRef` on unmount; a
sheet closed as its host unmounts leaves a timer that calls `setIsOpen`/`focus()` on a dead
component. Add a `useEffect(() => () => clearTimeout(...), [])`.

12c. **Do not touch the focus trap** (`:184`–`:209`) or `resolveExitMs`. The bug is purely the
uncancelled timer.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run test`, plus
`tests/components.ui.DateCalendarPopover.test.ts` — extend it with a fake-timer case that opens,
closes, reopens inside the exit window, advances past it, and asserts the sheet is still open.

### Phase 12 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete, uncommitted** (working tree, alongside the Phase 9–11 diff).
`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test`: 1991 pass / 1 fail — still only
`tests/lib.billingDiscounts.test.ts` ("pushes current_period_end forward for free months"), the
pre-existing date-dependent billing assertion from the baseline note. Untouched here. (Pass count
is +2 over Phase 11's 1989: the two new fake-timer cases below.)

Both files (`components/ui/DateCalendarPopover.tsx`, `tests/components.ui.DateCalendarPopover.test.ts`)
are still untracked — they were born in the Phase 1–8 simplification diff (Phase 5b) and have not
been committed yet.

#### 12a — clear the pending close timer on open (`DateCalendarPopover.tsx`)

`openSheet` now cancels an in-flight close before it re-opens:

```ts
const openSheet = () => {
  if (closeTimerRef.current !== null) {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }
  setVisibleMonth(selectedDate.slice(0, 7));
  setIsClosing(false);
  setIsOpen(true);
};
```

Also nulled `closeTimerRef.current` **inside** the `closeSheet` timeout callback (first line, before
the `setIsOpen(false)` trio) so the ref is an accurate "a close is pending" flag — without it, a
normal close would leave a stale non-null id in the ref and `openSheet`'s new guard would
`clearTimeout` an already-fired handle (harmless, but the guard then means nothing). The focus trap
(`:184`–`:209`) and `resolveExitMs` were not touched, per 12c.

#### 12b — unmount cleanup: **already present, no change needed**

The plan's line numbers predate a small drift in this still-uncommitted file. The
`useEffect(() => () => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); }, [])`
unmount-cleanup effect the plan asks for in 12b was already in the file (just above the
`monthParts` computation). Left as-is. So Phase 12 is effectively just 12a plus its test.

#### Tests — `tests/components.ui.DateCalendarPopover.test.ts`

The file was a pure date-helper suite (node env). Added `// @vitest-environment jsdom` at the top
and a second `describe` block, "DateCalendarPopover — pending close timer", that renders the
component with `@testing-library/react` + `createElement` (repo vitest config only globs
`*.test.ts`, no JSX — same convention as the other `components.*` tests). Two `vi.useFakeTimers()`
cases:

1. **stays open when reopened inside the exit window** — open, click Close, `advanceTimersByTime(100)`
   (well inside the ~270 ms `SHEET_EXIT_MS`), reopen, then `advanceTimersByTime(500)` to run out the
   original timer's full delay; asserts the `[role="dialog"]` is still in the DOM at every step.
   Fails without the 12a guard (the stale timer fires `setIsOpen(false)`).
2. **still closes normally when not interrupted** — open, Close, advance past the window, assert the
   dialog is gone. Guards against 12a over-correcting into "never closes".

Selector notes for the next author: this `@testing-library/dom` version **ignores** the
`getByRole("button", { haspopup: … })` / `{ expanded: … }` filter options (returns all buttons), so
the trigger is grabbed with `container.querySelector('button[aria-haspopup="dialog"]')` and the
Close button by `textContent` match. `jsdom` has no `window.matchMedia`, so `resolveExitMs()` hits
its `catch` and returns the full 270 ms — the fake-timer math above assumes that.

#### What the next phase (13) needs to know

- Phase 12 touched **only** `components/ui/DateCalendarPopover.tsx` +
  `tests/components.ui.DateCalendarPopover.test.ts`. Zero overlap with Phase 13's
  `components/bingo/SportsBingoHome.tsx`.
- Verify baseline unchanged: `tests/lib.billingDiscounts.test.ts` is still the sole pre-existing
  failure (1991 pass / 1 fail). Everything else green.
- Phase 13 is the first phase that must run **strictly sequential** with Phase 14 (both edit
  `SportsBingoHome.tsx`) and is the one that needs `npm run test:pwa-contract` in its verify step.
  Nothing in Phase 12 blocks it.
- Phase 15's 15d deferred list is unchanged by Phase 12: still just 9b's missing
  `(user_id, starts_at)` index and Phase 10's un-run manual admin pass.

---

## Phase 13 — History stack: stop rendering a running game as final

**Model: Opus 5 · Effort: high.** The highest-judgment fix in this set. It reasons about the
same live/settled boundary the Phase 2/5 deviation notes are built on, and it touches
`boardActionsRef`, whose referential stability the memoized `BingoBoardCard` comparator depends
on. Getting this wrong either reintroduces the disappearing-board failure Decision 1 forbids, or
silently breaks board-card memoization.

Fixes finding **1**.

13a. **Understand the existing contract first.** Read the deviation note at
`SportsBingoHome.tsx:1452`–`:1457` before changing anything. `portraitStackCards` deliberately
does **not** day-filter active boards, precisely so a 10 PM game still live at 12:05 AM stays on
today's stack. `historyStackCards` (`:1475`) is the mirror case and is where the bug lives: it
normalizes `status === "active"` → `"lost"` only when `now - startsAt >= BINGO_GAME_BUFFER_MS`,
but then hard-codes `isLive: false` for **every** entry. So a board inside the buffer window —
genuinely still running — renders with a "Starts 10:00 PM" badge on its own calendar day.

13b. **Derive `isLive` instead of hard-coding it.** Compute it per card the same way
`portraitStackCards` does (`startsAtMs <= now`), gated on the card *not* having been normalized
to `lost`. The normalization at `:1481` already identifies the "stale row" case; reuse its
result rather than recomputing a second, subtly different notion of "over."

13c. **Fix the open handler (`:1915`).** `boardActionsRef.current.open` sets
`isSettledBoard = settledCards.some(...) || Boolean(historyEntry)` — i.e. *mere membership in
the history stack* means settled, so the still-live board opens the "Sports Bingo · Final Board"
modal (`:2532`) reading "No bingo this game" (`:2557`). Decide from the **normalized card's
status**, not from which stack it came out of. Keep the `if (!historyEntry)` guard at `:1921`
exactly as-is — a past-day board genuinely has no landscape carousel slot, and pointing the
carousel at index 0 is a separate bug this phase must not introduce.

13d. **Preserve referential stability.** `boardActionsRef` is re-pointed on every render on
purpose (see the comment at `:1907`–`:1910`) so `handleOpenBoard`/`handleClaimBoard` stay stable
for `BingoBoardCard`'s custom comparator. Any new state or callback added here must not become a
new prop on `BingoBoardCard`, or memoization across the whole stack degrades.

13e. **Confirm the empty-state and badge copy still read correctly** for a live board viewed on a
past day — this is a state the UI has never actually rendered before.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run test`, and `npm run test:pwa-contract`
(this file owns the landscape portal). This is a real-device / real-live-board check, not a
screenshot check — reproduce by viewing a late game's day after local midnight while it is
still inside `BINGO_GAME_BUFFER_MS`.

**Risk:** the failure mode is invisible in a headless pass — the wrong badge and the wrong modal
both render fine. Verify against an actually-running board.

### Phase 13 — AS BUILT (2026-09-07, Opus 5)

**Status: complete.** All of 13a–13e landed. Gate green: `npx tsc --noEmit` clean, `npm run lint`
clean, `npm run test` = **1998 pass / 1 fail** (the pre-existing `tests/lib.billingDiscounts.test.ts`
date assertion, untouched — baseline was 1991/1, and the 7 new tests below account for the delta),
`npm run test:pwa-contract` 20/20.

Files touched: `components/bingo/SportsBingoHome.tsx`, `components/bingo/bingoBoardShared.tsx`,
and a new `tests/components.bingo.historyStack.test.ts`.

#### 13a — the contract, confirmed before changing anything

The deviation note above `portraitStackCards` is exactly right and is now load-bearing in two
places rather than one. The bug was never the normalization — it was that `historyStackCards`
answered **two different questions with one answer**: "is this board on a past calendar day?"
and "is this board over?". A past day is not the same thing as a finished game. The 10 PM board
that `portraitStackCards` deliberately keeps on *today's* stack after midnight is simultaneously
reachable by paging the rail back one day, and on that path it was hard-coded `isLive: false`.

#### 13b — `isLive` derived, and the rule extracted so it can be tested

The per-card body moved out of the `useMemo` into a pure exported helper,
**`resolveHistoryStackEntry(card, now)` in `components/bingo/bingoBoardShared.tsx`**, and
`BINGO_GAME_BUFFER_MS` moved there with it (it was a module const in `SportsBingoHome`; the
today-stack partition at `SportsBingoHome.tsx:1398` now reads the imported one). Two questions,
answered separately from the card itself:

- **stale row?** `active` and `now - startsAt >= BINGO_GAME_BUFFER_MS` → normalize to `lost`
  (unchanged from before, verbatim).
- **live?** still `active` *after* that normalization **and** `startsAt <= now` — i.e. exactly
  `portraitStackCards`' test, gated on the normalization result as 13b required, not on a second
  notion of "over".

A malformed `startsAt` parses to `NaN` and fails both comparisons, so the card is left alone and
is not live. `historyStackCards` is now three lines: map the helper, sort latest-to-earliest.
Note the sort comparator call changed shape (`.sort((a, b) => compareCardsLatestToEarliest(a.card,
b.card))`) because the map now produces `{card, isLive}` *before* the sort rather than after —
same ordering, same comparator.

**Why extracted rather than inlined:** `SportsBingoHome` cannot be rendered cheaply in a test
(realtime subscription, two portals, PWA hooks, geolocation-adjacent storage reads), and the
plan's own risk note says the failure is invisible to a headless pass. The rule is the thing
worth pinning, so it now lives somewhere a unit test can reach it. No behavior moved with it.

#### 13c — the open handler decides from status, not from stack membership

`boardActionsRef.current.open` was `settledCards.some(...) || Boolean(historyEntry)` — mere
membership in the history stack meant settled. Now:

```ts
const isSettledBoard = historyEntry
  ? historyEntry.card.status !== "active"          // normalized status, per 13c
  : settledCards.some((card) => card.id === cardId);
```

The `if (!historyEntry)` landscape-carousel guard (now `:1934`) is **unchanged**, as instructed.

#### 13c, second half — `expandedActiveCard` had to widen, or 13c would have opened an empty modal

Not called out in the plan, and it is the one thing that would have made 13c look correct in
review and fail on a device. Routing a live past-day board to `setExpandedActiveCardId` is useless
unless something can resolve that id: `expandedActiveCard` resolved **only** against
`activeCards`, which derives from `cards` (the main, dateless fetch) — while a past-day board
arrives in `historyCards` from a separate query. In practice the main fetch's 100-row window also
carries a still-live board, so it would usually have worked; that overlap is a coincidence of the
row limit, not a contract. `expandedActiveCard` now falls back to the history stack, filtered to
`status === "active"`, mirroring the union `expandedFinalCard` has always used. Comment says so at
the site.

#### 13d — referential stability preserved

No new prop on `BingoBoardCard`, so `arePropsEqual` is untouched. `isLive` was already a compared
prop, so deriving it correctly costs nothing — a past-day board now flips it at most once per
history fetch. `boardActionsRef` is still re-pointed every render; `handleOpenBoard` /
`handleClaimBoard` are still `useCallback(..., [])`.

#### 13e — copy for a live board on a past day, a state the UI had never rendered

Read through `BingoBoardCard` for this state: badge is now the emerald `● Live` pill instead of
`Starts 10:00 PM`; the footer already read `Closest line / N to go` (it keys off `card.status`,
which was already `active`, so only the badge and the modal were ever wrong); the primary action
stays `Expand`. Tapping now opens **"Sports Bingo · Live Board"** — progress ring, legend, "How to
win" — rather than "Sports Bingo · Final Board" reading "No bingo this game". Empty states are
untouched (`No boards on this day.` + `Back to today`). A board that reaches bingo mid-game
settles to `won` server-side, normalizes to not-live here, and correctly gets the Final modal and
the `Collect` button — the live/settled split does the right thing at that boundary.

#### Tests — `tests/components.bingo.historyStack.test.ts` (new, 7 tests, green)

Pure node-env suite against `resolveHistoryStackEntry`: the regression itself (10 PM kickoff seen
at 12:05 AM → live, still `active`), stale row past the buffer → `lost` + not live + caller's row
not mutated, the `>=` boundary treated as over, unstarted board not live, each of `won`/`lost`/
`canceled` left alone by identity, no copy when nothing needs normalizing, malformed `startsAt`
neither live nor stale. The open handler branches on the same normalized status, so the
correct-modal behavior follows from these assertions rather than needing the component rendered.

#### Two known limitations, NOT bugs introduced here — now fixed by Phase 14.5

**Update (2026-09-07, Andrew): both of these are now Phase 14.5's job.** Read that phase before
touching either; the analysis below is why it exists. Do not attempt them inside Phase 14.

1. **`historyStackCards` freezes `now` at memo time** (deps are `[historyCards]` only). Sitting on
   a past day for hours will hold a `Live` badge past the 6-hour buffer. This is pre-existing —
   the normalization always had it — and is only *visible* now. A fix means a ticking dep, which
   would re-render the whole stack on a timer; the once-a-minute `syncToday` interval does **not**
   help (it `setTodayKey`s the same string, so React bails out). Requires ≥4 hours parked on one
   past day to observe.
2. **A live past-day board shows a frozen board snapshot.** The history fetch sends
   `refreshProgress=false`, and `app/api/bingo/cards/route.ts` hard-forces it off for any
   `includeSettled` query by design ("historical/settled queries are immutable snapshots"). So the
   squares under that new `Live` badge do not tick. The today stack is the live view; this is the
   archive view of the same board. Changing it means touching that route's deliberate cost guard.

#### What the next phase (14) needs to know

- **Phase 14 edits the same file.** Re-read `SportsBingoHome.tsx` fresh — every line number in
  the Phase 14 write-up above has moved. Verified positions after Phase 13:
  `DateCalendarPopover`'s `onSelect` (plan-cited `:2372`) is now **`:2385`**; the
  `!isViewingToday && loadingHistory` branch (plan-cited `:2383`) is now **`:2396`**; the
  history-fetch effect Phase 14 is racing is **`:1204`–`:1241`**.
- **Do not touch `historyStackCards`, `resolveHistoryStackEntry`, or the `open` handler's
  `isSettledBoard` line** (`:1924`). Phase 14 is a state-sequencing fix on `setSelectedDate`; it
  has no business in the live/settled boundary this phase just drew.
- **There are no prev/next day controls.** The plan's 14a says to cover "the `setSelectedDate`
  call path used by `DateCalendarPopover`'s `onSelect` (`:2372`) and by the prev/next day
  controls" — the latter do not exist in this tree. The only `ChevronLeft`/`ChevronRight` in the
  file (`:2067`, `:2280`) are the **landscape board carousel** arrows, which move
  `landscapeActiveBoardIndex`, not the date. Do not wire loading state into them.
- **All four `setSelectedDate` call sites, and which ones 14a covers:**
  - `:2385` `onSelect={setSelectedDate}` — **the one that matters.** It is passed the bare
    setter today, so the natural shape is a `useCallback` that sets the date and, when the target
    is not `todayKey`, sets `loadingHistory` in the same commit.
  - `:2416` "Back to today" — 14b's case; must **not** raise the flag.
  - `:1800` `handleBoardCreated` — snaps forward to today; must not raise the flag.
  - `:576` the deep-link effect — only fires for a genuinely finished board (see its comment,
    which is the same live/settled distinction Phase 13 just hardened). Decide deliberately
    whether it should flash a loader; it lands on a past day, so consistency argues yes.
- **`setLoadingHistory(true)` has to stay cleared on every path.** The loading branch short-
  circuits *before* `visibleStackCards.length === 0`, so an eagerly-set flag that never clears
  hangs the day view on a spinner. The history effect already clears it in `finally` (guarded by
  `cancelled`), and its `isViewingToday` early-return sets it `false` — that early-return is
  exactly 14b's "switching back to today must not flash" guarantee, so leave it alone.
- **Re-run `npm run test:pwa-contract` too**, even though Phase 14's verify step omits it — this
  file owns the landscape portal, and Phase 13 confirmed it green at 20/20 right before you.
- **Phase 15 still inherits two deferred items,** not three: 9b's missing `(user_id, starts_at)`
  index and Phase 10's un-run manual admin pass. Phase 13's two limitations are **not** deferred —
  they became **Phase 14.5**, which runs before 15.
- **15e's device-checklist entry is not yet written.** Phase 13 deliberately left that to Phase 15
  per the plan. The case to write is *"view a late game's day after local midnight while the game
  is still inside the 6-hour buffer: the board must badge Live, and tapping it must open the Live
  Board modal, not Final Board."* Phase 14.5 adds a second half to that same case (the squares
  must also tick there).

---

## Phase 14 — History day switch: no stale frame

**Model: Sonnet 5 · Effort: medium.** One-line-ish state-sequencing fix, but it lands in the
file Phase 13 just edited.

Fixes finding **7**. **Run strictly after Phase 13** — same file, adjacent concerns.

14a. `setLoadingHistory(true)` runs in a passive effect rather than in the commit that changes
the date, so switching directly between two past days paints the previous day's boards under the
new day's rail label for one frame (`SportsBingoHome.tsx:2383` is where it surfaces). Set the
loading flag in the same update as the date change — in the `setSelectedDate` call path used by
`DateCalendarPopover`'s `onSelect` (`:2372`) and by the prev/next day controls — rather than
reacting to the date afterward.

14b. Confirm the `isViewingToday` branch is unaffected: switching *back* to today must not flash
a loading state, since today's boards are already in hand.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run test`.

### Phase 14 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete, uncommitted** (working tree, alongside the Phase 9–13 diff).
`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test`: **1998 pass / 1 fail** — still only
`tests/lib.billingDiscounts.test.ts` ("pushes current_period_end forward for free months"), the
pre-existing date-dependent billing assertion from the baseline note. Untouched here. Pass count is
unchanged from Phase 13 (1998/1) — no test was added (see "no test" below).
`npm run test:pwa-contract` 20/20 (re-run because this file owns the landscape portal, per Phase
13's handoff — Phase 14's own verify step omits it).

#### 14a — the loading flag now rises in the same commit as the date change

New `selectDate` `useCallback` in `components/bingo/SportsBingoHome.tsx`, placed **immediately
before the deep-link effect** (right after the `deepLinkHandledRef`-adjacent comment block, ~`:558`)
rather than down near `handleBoardCreated`. It has to sit above that effect because the deep-link
effect's dependency array — evaluated inline during render — now lists `selectDate`, and a
`const selectDate = …` declared later would be in the TDZ at that point (`ReferenceError`, not a
lint nit). `todayKey` state is declared at `:489`, well above the new site, so no TDZ there.

```ts
const selectDate = useCallback(
  (nextDate: string) => {
    setSelectedDate(nextDate);
    if (nextDate !== todayKey) {
      setLoadingHistory(true);
    }
  },
  [todayKey]
);
```

The previous-day fetch effect (`:1206`–`:1241` before this phase) is **unchanged** — it still
sets `setLoadingHistory(true)` at its top and clears it in `finally` (guarded by `cancelled`) and
in its `isViewingToday` early-return. Setting the flag eagerly in `selectDate` just means it is
already `true` by the time that effect runs, so the `!isViewingToday && loadingHistory` branch at
(now) `:2409` wins on the very first commit after the date change instead of the second. The
effect setting it `true` again is a no-op re-render-free `setState` to the same value.

#### 14a — wired at two of the four `setSelectedDate` call sites

- **`onSelect` on `DateCalendarPopover`** (`:2398`): `onSelect={setSelectedDate}` →
  `onSelect={selectDate}`. This is the call site finding 7 is actually about.
- **The deep-link effect** (`:576`): `setSelectedDate(cardDay)` → `selectDate(cardDay)`, and
  `selectDate` added to the effect deps (`[cards, initialCardId]` → `[cards, initialCardId,
  selectDate]`). Per Phase 13's handoff ("it lands on a past day, so consistency argues yes") —
  a deep link to a *finished* board on a past day now flashes the loader in the same commit,
  same as picking that day from the calendar. `selectDate`'s identity only changes when
  `todayKey` actually changes string value (a real midnight rollover; the once-a-minute
  `syncToday` `setTodayKey`s the same string and React bails), and the effect's
  `deepLinkHandledRef` guard early-returns on the re-run, so the added dep is inert in practice.

Left as bare `setSelectedDate` **deliberately** (14b — must not raise the flag):
- **"Back to today"** button (`:2429`): `onClick={() => setSelectedDate(todayKey)}`. `selectDate`
  would guard it out anyway (`nextDate === todayKey`), but the bare setter is the clearest
  guarantee that switching back to today never flashes a spinner over boards already in hand.
- **`handleBoardCreated`** (`:1811`): `setSelectedDate(freshToday)` — snaps forward to today
  after a create; today's boards are in hand, no loader.

#### 14b — confirmed: switching back to today does not flash

Three independent guards, any one sufficient: `selectDate` doesn't raise the flag when
`nextDate === todayKey`; "Back to today" uses the bare setter; and the fetch effect's
`isViewingToday` early-return sets `setLoadingHistory(false)`. The render branch is
`!isViewingToday && loadingHistory`, so even a stray `true` can't paint once `isViewingToday`
flips.

#### No test added

Phase 14's verify step does not ask for one, and the fix is a render-commit-ordering property:
the stale frame is one paint of the *previous* day's boards under the *new* day's label, which a
jsdom render with no real paint/RAF loop cannot observe (the two `setState`s land in the same
batch there regardless). `SportsBingoHome` also can't be cheaply mounted (realtime sub, two
portals, PWA hooks) — the same reason Phase 13 extracted `resolveHistoryStackEntry` rather than
render the component. `selectDate` is a 6-line pure setter wrapper; there is no seam worth
pinning that `tsc` + lint don't already hold.

#### What the next phase (14.5) needs to know

- **Phase 14.5 edits the same file.** Re-read `SportsBingoHome.tsx` fresh — line numbers moved
  again (+~14 lines from the `selectDate` block inserted before the deep-link effect). The
  history-fetch effect Phase 14.5 keys its merge effect next to is now **`:1221`–`:1258`**
  (was `:1204`–`:1241` at Phase 13). `isViewingToday` is defined at **`:1205`**. `selectDate`
  is at **`:563`**, its deep-link call site at **`:593`**, `onSelect={selectDate}` at **`:2402`**.
- **Do not touch `selectDate`, the deep-link effect deps, or the two bare `setSelectedDate`
  sites.** Phase 14.5 is a `historyCards` merge-on-`cards`-update fix; it has no business in the
  date-selection path.
- **`selectDate` sets `loadingHistory` true on a past-day switch, and the fetch effect clears
  it in `finally`.** Phase 14.5's merge effect must **not** interact with `loadingHistory` at
  all — it patches `historyCards` in place after the fetch has already resolved. If 14.5's merge
  effect ever runs while `loadingHistory` is still true, that's fine: the loading branch
  short-circuits the stack render anyway and the merge just updates state that isn't shown yet.
- Verify baseline unchanged: `tests/lib.billingDiscounts.test.ts` is still the sole pre-existing
  failure (**1998 pass / 1 fail**). `npm run test:pwa-contract` 20/20.
- Phase 15's 15d deferred list is **unchanged** by Phase 14: still 9b's missing
  `(user_id, starts_at)` index and Phase 10's un-run manual admin pass. Phase 14 deferred
  nothing and added no new device-checklist item (finding 7's fix is verifiable in the test
  gate + a headless day-switch; the stale-frame flicker was never on the PWA checklist).

---

## Phase 14.5 — Write live board updates through to the past-day stack

**Model: Sonnet 5 · Effort: medium.** Not one of the seven review findings — this is the
follow-on Phase 13 surfaced and deliberately did not fold in (see its "Two known limitations").
Numbered 14.5 because it lands in `SportsBingoHome.tsx`, the file Phases 13 and 14 own, and must
not run concurrently with either.

**Run strictly after Phase 14.**

### The problem, in one paragraph

Phase 13 made a still-running board correctly badge **Live** on its own (now past) calendar day.
But `historyCards` is a one-shot day-scoped fetch that nothing ever updates again, so the squares
under that badge are a photograph taken the instant the player switched days. A prop hits at
12:20 AM: the board on today's stack lights up, the identical board on yesterday's view does not.
The badge promises something the data does not deliver. Separately, `historyStackCards` captures
`Date.now()` when it memoizes and only recomputes when `historyCards` changes — so a badge that
was right at open stays frozen, and past the 6-hour buffer it is wrong.

Both are downstream of the same root cause: **`historyCards` is write-once.** One fix closes both.

### Why this is free

The live board is already in the main fetch's 100-row window, so it is already in `cards`, and its
`gameId` is already in `subscribedGameIds` (`:1265`, derived from `cards`) — which means its
broadcast channel is already subscribed and already calling
`loadCards({ background: true })` on every `card_updated` (`:1299`–`:1306`). None of that is gated
on `isViewingToday`; it keeps running while the rail is showing a past day. The fresh data is
**already arriving**. It just has nowhere to land. No new fetch, no new subscription, no new timer.

### Steps

14.5a. **Add a merge effect keyed on `cards`.** Single new effect near the history-fetch effect
(`:1204`–`:1241`):

```ts
useEffect(() => {
  if (isViewingToday) return;          // historyCards is empty on today's view anyway
  setHistoryCards((prev) => mergeLiveCardUpdates(prev, cards));
}, [cards, isViewingToday]);
```

14.5b. **`mergeLiveCardUpdates` must be identity-stable when nothing overlaps.** Patch **by id,
only rows already present in `historyCards`** — never append. `historyCards` is the result of a
day-scoped SQL query; adding a row from the dateless main fetch would put a board on a calendar
day it does not belong to, which is a worse bug than the one being fixed. If no incoming id
matches, **return `prev` by identity** so the `historyStackCards` memo does not churn on every
broadcast for the overwhelmingly common case (a past day holding only finished boards).

14.5c. **Do not hand-roll an identity-preserving deep compare.** When a row does match, take the
incoming object wholesale. `BingoBoardCard`'s comparator compares the card by a **content
signature**, not by reference (see the note above `cardSignature` in `BingoBoardCard.tsx`), so a
new object identity for an unchanged board costs nothing — it still fails to re-render. Only the
cheap parent memos rebuild.

14.5d. **Confirm the `now`-freeze dissolves, and understand why it is self-consistent.** A merge
that changes something produces a new `historyCards` array, which recomputes `historyStackCards`
with a fresh `Date.now()`, which re-asks "is this still live?". When nothing changes, 14.5b
returns `prev` and nothing recomputes — but that is exactly the case where no board is live, so
there is no badge to go stale. Do not add a ticking dep or an interval to force this; the two
halves already line up.

14.5e. **Bonus behavior to verify, not to suppress:** a board that *settles* while the player is
sitting on the past-day view now flips from Live to Final in place, because the merge carries
status too. That is correct and desirable — confirm it, and confirm the `Collect` button appears
for a board that settles to `won` on that view (the claim path already writes through to
`historyCards` at `:1899`, so collecting from a past day already worked; this just makes the board
reach that state without a manual day-switch).

14.5f. **Do not touch the API route.** The other conceivable fix — letting the past-day request
refresh progress — means defeating the deliberate cost guard at `app/api/bingo/cards/route.ts:83`
("Historical/settled queries are immutable snapshots and must never trigger expensive refresh
evaluation"). That guard stays. This phase adds no server-side work at all.

### Residual, accepted

- A live board whose game broadcasts nothing for hours (no props resolving) produces no `cards`
  update and therefore no merge, so its badge can still freeze. Bounded by the same >4-hour
  parked-on-one-screen scenario Phase 13 already judged negligible.
- A live board outside the main fetch's 100-row window is not in `cards` and cannot be merged. It
  is also not on today's stack, so this is a pre-existing limit of that window, not a new one.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract` (this
file owns the landscape portal). Add a unit test for `mergeLiveCardUpdates` — extract it beside
`resolveHistoryStackEntry` in `components/bingo/bingoBoardShared.tsx` and extend
`tests/components.bingo.historyStack.test.ts`; the identity-stability contract in 14.5b is exactly
the kind of thing a later refactor breaks silently.

**Risk:** low, and lower than Phase 13's — but the identity-stability rule in 14.5b is load-bearing
for performance, not correctness, so a headless pass will not catch getting it wrong. The
device-visible half belongs on the Phase 15 checklist: *view a past day while one of its games is
still running, and confirm squares tick there the same as on today's stack.*

### Phase 14.5 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete, uncommitted** (working tree, alongside the Phase 9–14 diff).
`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test`: **2002 pass / 1 fail** — still
only `tests/lib.billingDiscounts.test.ts` ("pushes current_period_end forward for free months"),
the pre-existing date-dependent billing assertion from the baseline note. Untouched here. Pass
count is +4 over Phase 14's 1998/1 — the four new `mergeLiveCardUpdates` cases below.
`npm run test:pwa-contract` 20/20 (re-run because this file owns the landscape portal).

Files touched: `components/bingo/bingoBoardShared.tsx`, `components/bingo/SportsBingoHome.tsx`,
`tests/components.bingo.historyStack.test.ts`. **The API route was not touched** (14.5f).

#### 14.5b/14.5c — `mergeLiveCardUpdates(existing, incoming)` in `bingoBoardShared.tsx`

New pure exported helper, placed directly after `resolveHistoryStackEntry` (its Phase-13
sibling), with the same "the rule lives where a unit test can reach it" rationale — `SportsBingoHome`
can't be cheaply rendered. Body:

- either side empty → return `existing` by identity.
- build a `Map` of `incoming` by id; walk `existing`, and for each row whose id is in the map
  (and is not already the same object reference) swap in the incoming object **wholesale** — no
  field-by-field compare (14.5c: `BingoBoardCard` compares by content signature, so a fresh
  identity for an unchanged board still fails to re-render).
- track whether any row was swapped; if none was, **return `existing` by identity** (14.5b) so
  `historyStackCards` does not churn per broadcast on the common past-day-of-finished-boards case.
- **never append.** An incoming id with no matching `existing` row is ignored — a dateless
  `cards` row must not land on a calendar day it doesn't belong to (14.5b).

Because `incoming` (`cards`) and `existing` (`historyCards`) come from different fetches, a
matching row is always a distinct object identity, so `changed` flips whenever there is an id
overlap even if the content is byte-identical. That is acceptable per 14.5c — the array identity
churns, but the memoized board cards don't re-render, only the cheap parent memos rebuild. The
contract that actually matters (no overlap → `existing` returned by reference) holds.

#### 14.5a — the merge effect in `SportsBingoHome.tsx`

Single new `useEffect`, placed **immediately after the history-fetch effect** (now ends `:1258`),
before the won/near-win transition-detection effect:

```ts
useEffect(() => {
  if (isViewingToday) return;
  setHistoryCards((prev) => mergeLiveCardUpdates(prev, cards));
}, [cards, isViewingToday]);
```

`mergeLiveCardUpdates` imported from `bingoBoardShared` (added to the existing multi-name import,
alphabetically before `renderSquareStatusGlyph`). Notes:

- **No interaction with `loadingHistory`** (per Phase 14's handoff). This effect runs after the
  fetch has resolved and only patches state that the loading branch is short-circuiting anyway.
- `isViewingToday` guard: `historyCards` is `[]` on today's view (the fetch effect clears it),
  so the merge would be a no-op there regardless — the guard just skips the `setState` call
  entirely and keeps the dep-driven re-run cheap.
- The `setHistoryCards` functional updater returning `prev` by identity when nothing overlaps
  means React bails out of the re-render — no `historyStackCards` recompute, no stack churn.

#### 14.5d — the `now`-freeze dissolves, and it is self-consistent

`historyStackCards`' memo (`:1498`, deps `[historyCards]`) is **unchanged**. It didn't need to
change: when the merge swaps in a row, `historyCards` is a new array, the memo recomputes with a
fresh `Date.now()`, and `resolveHistoryStackEntry` re-asks "still live? / now stale past the
6h buffer?" against current time. When the merge returns `prev`, nothing recomputes — but that
is exactly the case where no board is live (a past day of only finished boards), so there is no
badge that could go stale. No ticking dep, no interval added. The two halves line up as the plan
predicted.

#### 14.5e — settle-in-place, confirmed by reading the code paths

A board that settles to `won`/`lost` while the player sits on its past day: the `card_updated`
broadcast → `loadCards({ background: true })` → new `cards` → merge swaps the row carrying the
new `status` → `resolveHistoryStackEntry` normalizes it, `isLive` goes false, `BingoBoardCard`
renders the Final state and the open handler (Phase 13's `historyEntry.card.status !== "active"`
branch) routes it to the Final Board modal. For `won`, the `Collect` button appears because
`unclaimedWonBingoCards`/the card's own `status` now say so, and the claim path already writes
through to `historyCards` at `:1916` (Phase 13), so collecting from a past day already worked —
this just lets the board reach `won` on that view without a manual day-switch. Not separately
unit-tested (needs the component); the `mergeLiveCardUpdates` "takes the incoming object
wholesale, status included" test covers the mechanism.

#### Tests — `tests/components.bingo.historyStack.test.ts` (+4, now 11 total, green)

New `describe("mergeLiveCardUpdates …")` block: (1) no id overlap → returns `existing` by
identity; (2) either side empty → identity / `[]`; (3) a matching row is replaced by the incoming
object wholesale and non-matching existing rows keep their identity; (4) an incoming id absent
from `existing` is never appended.

#### 14.5f — API route untouched

`app/api/bingo/cards/route.ts:83`'s "historical/settled queries are immutable snapshots and must
never trigger expensive refresh evaluation" guard is intact. This phase added zero server-side
work — the fresh data was already arriving via the existing `card_updated` subscription; it just
had nowhere to land until the merge effect.

#### Residual, accepted (unchanged from the plan)

- A live past-day board whose game broadcasts nothing for hours produces no `cards` update and
  therefore no merge, so its badge can still freeze — bounded by the same >4h parked-on-one-screen
  scenario Phase 13 judged negligible.
- A live board outside the main fetch's 100-row window is not in `cards` and can't be merged. It
  is also not on today's stack — a pre-existing limit of that window, not a new one.

#### What Phase 15 needs to know

- Phase 14.5 touched `components/bingo/bingoBoardShared.tsx`,
  `components/bingo/SportsBingoHome.tsx`, `tests/components.bingo.historyStack.test.ts`. No API,
  no migration, no manifest/PWA CSS.
- **Full gate is green at 2002 pass / 1 fail** (the pre-existing billing test) · lint clean ·
  tsc clean · `test:pwa-contract` 20/20. `test:god-mode-join` still not required (15a).
- **15d deferred list is unchanged** — still exactly two: 9b's missing `(user_id, starts_at)`
  index and Phase 10's un-run manual admin pass. Phase 14.5 deferred nothing; the two residuals
  above are accepted-and-bounded, not deferred work.
- **15e — the device-checklist entry now has both halves and still needs writing** (Phase 15's
  job, per the plan): *view a late game's day after local midnight while the game is still inside
  the 6-hour buffer — (a) the board must badge **Live** and tapping it must open the **Live
  Board** modal, not Final Board [Phase 13]; (b) its squares must tick there in step with today's
  stack, and a prop that settles the game must flip the board to Final in place [Phase 14.5].*
  Only Andrew can close it.
- Nothing in Phase 14.5 blocks Phase 15; it is pure aggregation/write-up from here.

---

## Phase 15 — Verification and docs

**Model: Sonnet 5 · Effort: medium.** Aggregation and write-up.

15a. Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`.
`npm run test:god-mode-join` is **not** required — nothing in Phases 9–14.5 touches the
join/geofence/auth flow.

15b. Confirm `tests/lib.billingDiscounts.test.ts` is still the only failure and still unrelated;
if it now passes, say so, and do not claim credit for it.

15c. Append an **AS BUILT** section to each phase above, matching the convention in
`docs/prop-bingo-page-simplification-plan.md` (what shipped, what deviated and why, what the next
phase needs to know).

15d. Record the two deferred items surfaced here rather than silently dropping them: the
per-broadcast `includeDates` query cost (9b) and the league-neutral loader default (11b).

15e. Add anything device-only to `docs/bingo-fullscreen-pwa-device-checklist.md` — the
live-board-on-a-past-day case in particular; only Andrew can close it. It has two halves now:
Phase 13's (the board badges **Live** and opens the Live Board modal, not Final Board) and Phase
14.5's (its squares tick there in step with today's stack).

### Phase 15 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete, uncommitted** (working tree, alongside the full Phase 9–14.5 + Phase 16 diff).

#### 15a — full gate

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run test` — **2004 pass / 0 fail / 13 skipped** (217 files; `tests/api.nfl-pickem.test.ts`
  is the skipped file, unrelated — it self-skips without live NFL env).
- `npm run test:pwa-contract` — **20/20**.
- `npm run test:god-mode-join` — **not run, not required.** Nothing in Phases 9–16 touches
  `JoinFlow`, geofencing, or the auth-first flow (confirmed: the six code files touched are the
  boards API route, the admin route, `lib/admin.ts`, `lib/adPlacements.ts`, two admin ad
  components, `SportsBingoSelectBoard.tsx`, `DateCalendarPopover.tsx`, `SportsBingoHome.tsx`,
  `bingoBoardShared.tsx`, plus test files).

#### 15b — the pre-existing `billingDiscounts` failure

At the start of Phase 15 it was still failing exactly as the baseline note described
(`tests/lib.billingDiscounts.test.ts` > "pushes current_period_end forward for free months",
a wall-clock-relative assertion). **It was not folded into any of Phases 9–14.5**, per the
baseline instruction. It is now **fixed by Phase 16** (added by Andrew after Phase 15 as an
explicit, separately-scoped follow-on) — the fix is entirely in the test file; `lib/billingDiscounts.ts`
was confirmed correct and left untouched. No credit claimed for it inside Phases 9–14.5. After
Phase 16 the suite is 0-fail.

#### 15c — AS BUILT sections

Every phase 9 → 14.5 carries its own AS BUILT section (written by each phase's own agent as it
landed). Phase 15 and Phase 16 sections are this and the one below. No phase is missing its
write-up.

#### 15d — deferred items (carried out of this plan, not dropped)

Exactly **two**, both first surfaced in Phase 9/10 and unchanged by every phase since:

1. **No composite `(user_id, starts_at)` index on `sports_bingo_cards`** (finding 2 / 9b). The
   calendar-dots query (`listUserSportsBingoCardDates`, `.eq("user_id", …).order("starts_at",
   desc).limit(500)`) runs once per poll and per realtime broadcast while the boards page is
   open, and today leans on the single-column `idx_sports_bingo_cards_user` plus an in-memory
   sort. Adequate at current per-user row counts. Adding the index is a **new timestamped
   migration and its own decision** — left for Andrew. The client-side fix (stop sending
   `includeDates=true` on every refresh) is a behavior change and was explicitly out of scope
   for a bug-fix pass.
2. **The un-run manual admin pass for Phase 10** (retired Bingo inline ad wind-down). Everything
   it would check is covered by the 12 automated tests added in Phase 10 at the API and lib
   layers; what remains is genuinely visual (the real edit form rendering "Inline (retired)",
   the amber retired-slot line, the inactive-save 200, the bulk-enable skip toast) and needs
   admin auth against a database that still holds a pre-retirement inline Bingo row. Steps are
   written out in the Phase 10 AS BUILT notes. Nothing downstream depends on it.

**Not deferred:** the league-neutral generating-loader default (11b) — Andrew approved it in
Phase 11 and it shipped there. Phase 13's two "known limitations" — they became Phase 14.5,
which is done.

#### 15e — device checklist

Added **section 9, "Prop Bingo code-review fixes (Phases 9–14.5)"**, to
`docs/bingo-fullscreen-pwa-device-checklist.md` (8 rows). The load-bearing ones are the
live-board-on-a-past-day case in both halves:

- **9.1 / 9.2 (Blocking):** page the rail back to a late game's own calendar day after local
  midnight while it is still inside the 6-hour buffer → it badges **● Live**, and tapping it
  opens **"Sports Bingo · Live Board"**, not Final Board. (Phase 13.)
- **9.3 / 9.4 (Blocking):** the squares tick on that past-day view in step with today's stack,
  and the board flips **Live → Final in place** when the game ends, with Collect paying out from
  that view. (Phase 14.5.)
- 9.5–9.8 (Nice-to-have): the >6h stale-badge boundary, the <300ms calendar-reopen (Phase 12),
  the two-past-day switch with no stale frame (Phase 14), and the NFL generating-loader copy
  (Phase 11).

Only Andrew can close these — they need a real late Bingo game and, for the standalone rows, an
installed PWA.

#### Working-tree state at Phase 15 close

All of Phases 9–16 are **uncommitted**, layered on top of the still-uncommitted Phase 1–8
simplification diff. Files new in this plan's phases: `lib/adPlacements.ts` additions,
`tests/api.admin.ads-retired-inline-guard.test.ts`,
`tests/admin.retired-bingo-inline-winddown.test.ts`, `tests/components.bingo.historyStack.test.ts`,
`mergeLiveCardUpdates` + `resolveHistoryStackEntry` + `BINGO_GAME_BUFFER_MS` in
`components/bingo/bingoBoardShared.tsx`. Nothing here was committed or pushed — that is Andrew's
call.

---

## Phase 16 — Fix the date-dependent `billingDiscounts` test

**Model: Sonnet 5 · Effort: low.** Added 2026-09-07 (Andrew). Not a review finding and not in the
findings→phase map — it is the one pre-existing failure the baseline note (top of this doc) told
every phase to leave alone. Now that Phases 9–15 are done, close it so the gate is clean.

**The bug is in the test, not the code.** `tests/lib.billingDiscounts.test.ts` >
"pushes current_period_end forward for free months" hard-codes
`expect(payload.current_period_end).toBe("2026-11-30T00:00:00.000Z")` — the result of extending
`OFFLINE_ROW.current_period_end` (`2026-08-31`) by 3 months. But `applyDiscountToSubscription`
(`lib/billingDiscounts.ts:590`) extends from `max(current_period_end, now)`: an already-lapsed
period is never extended from the past. Once the wall clock passed 2026-08-31 the base became
`now`, the result drifted with the date, and the assertion broke. `lib/billingDiscounts.ts` is
correct and must not change — this is real, desirable product behavior.

16a. **Pin the clock, don't chase the date.** In the failing test, `vi.useFakeTimers()` +
`vi.setSystemTime(...)` to an instant **before** the row's `2026-08-31` period end, wrapped in
`try { … } finally { vi.useRealTimers() }`. The `2026-11-30` assertion then holds forever
(2026-08-31 + 3 months, clamped to November's 30 days).

16b. **Cover the other branch too, deterministically.** Add a sibling test that pins the clock to
an instant **after** `2026-08-31` and asserts the base is `now`, not the lapsed stored date — so
line 590's ternary is pinned on both sides and can't silently regress.

16c. **Scope.** Touch only `tests/lib.billingDiscounts.test.ts`. No lib change, no new row
fixture (reuse `OFFLINE_ROW`), no fake-timer state leaking past the two tests.

**Verify:** `npx vitest run tests/lib.billingDiscounts.test.ts`, then the full Phase 15 gate again
— `npm run test` must now be **0 failures**.

### Phase 16 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete, uncommitted** (working tree, alongside the Phase 9–15 diff).

Touched **only** `tests/lib.billingDiscounts.test.ts`. `lib/billingDiscounts.ts` unchanged —
confirmed the drift was the assertion, not the behavior (`:590` deliberately bases free-months on
`max(current_period_end, now)`).

- The old single test `"pushes current_period_end forward for free months"` became
  `"pushes current_period_end forward from an unlapsed period end for free months"`: same
  assertions (`2026-11-30T00:00:00.000Z`), now under `vi.useFakeTimers()` +
  `vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"))` (before `OFFLINE_ROW`'s `2026-08-31`),
  `try/finally` with `vi.useRealTimers()`.
- New sibling `"extends free months from today when the stored period end has already lapsed"`:
  clock pinned to `2026-10-15T12:00:00.000Z` (after `2026-08-31`), asserts the base is `now` →
  `current_period_end` / `discount_ends_at` both `2027-01-15T12:00:00.000Z`, `discount_percent_off`
  null, no Stripe calls, and `amount_cents` absent from the payload (the same money-risk
  assertion the unlapsed test carries — added in Opus's review pass, along with replacing the
  drift-prone `billingDiscounts.ts:590` line reference in the comment with a named one).
- `vi.useFakeTimers()` here fakes only `Date`; the function under test uses no `setTimeout`, and
  the mocked `supabaseAdmin` write resolves on a microtask, so `await` is unaffected. `finally {
  vi.useRealTimers() }` on both keeps the fake clock from leaking into the rest of the file.
- File went 31 → 32 tests (one renamed, one added), all green.

**Full gate after Phase 16:** `npx tsc --noEmit` clean · `npm run lint` clean · `npm run test`
**2004 pass / 0 fail** / 13 skipped (217 files) · `npm run test:pwa-contract` 20/20. The baseline
note's "one pre-existing failure" no longer applies to anything downstream.

---

## Sequencing

```
Phase 9  (Sonnet 5, medium)  app/api/bingo/cards/route.ts        ┐
Phase 10 (Opus 5,   medium)  app/api/admin/route.ts              │ independent —
Phase 11 (Sonnet 5, low)     SportsBingoSelectBoard.tsx          │ any order or parallel
Phase 12 (Sonnet 5, medium)  components/ui/DateCalendarPopover   ┘
Phase 13   (Opus 5,   high)   SportsBingoHome.tsx   ┐
Phase 14   (Sonnet 5, medium) SportsBingoHome.tsx   │ strictly sequential, same file
Phase 14.5 (Sonnet 5, medium) SportsBingoHome.tsx   ┘ never in parallel
Phase 15   (Sonnet 5, medium) verification + docs
Phase 16   (Sonnet 5, low)    tests/lib.billingDiscounts.test.ts  (added post-15; clears the
                                                                   one baseline failure)
```

Phase 10 is blocked on Andrew's policy decision (see the DECISION REQUIRED note). Everything
else is unblocked.

**Phase 14.5 was added after Phase 13 shipped** (Andrew, 2026-09-07). It is not one of the seven
review findings — it closes the two limitations Phase 13 surfaced and deliberately did not fold
in. It is in the sequential block because it edits the same file, not because 14 depends on it.
