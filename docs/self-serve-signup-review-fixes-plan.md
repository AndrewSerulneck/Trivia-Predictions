# Self-Serve Signup — Code Review Fixes & Venue Visibility

**Source:** `/code-review` of the uncommitted self-serve signup branch, 2026-09-08.
15 findings, all independently verified against source before this plan was written.

**Supersedes as the active work queue:** `docs/lapsed-venue-rehide-plan.md`
(drafted 2026-09-08). That plan is not discarded — Finding #3 forced its
reconciler earlier than expected, so its Phases 0–1 are absorbed here as **Phase
4**, and its remaining phases become **Phase 9**. Read both.

---

## 0. STOP — the flag must not be deployed

`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1` is already set in `.env` and Vercel but
has **not been deployed**, and `GOOGLE_MAPS_BROWSER_KEY` is still unset. That
accident is the only reason four of these findings are not live right now.

**Do not redeploy production until Phases 1–3 land.** Four findings are
exploitable by an anonymous stranger the moment the wizard is reachable:

| # | Finding | What an anonymous caller gets |
| --- | --- | --- |
| 1 | Claim path skips the `(0,0)` placeholder filter | Ownership link to the internal Category Blitz pooling room |
| 2 | Claim stamp guarded on `hidden` alone | That room revealed to every player on first payment, **or** deleted 7 days later |
| 5 | `browserGoogleMapsKey()` silent fallback | The unrestricted server Maps key, at 10 req/min/IP |
| 6 | Rate limiter is read-then-write | ~40 accounts/venues against a 5/hour cap |

Findings 1 and 2 are one attack chain, not two bugs — see Phase 1.

**Status 2026-09-08:** all four of the above are **fixed** (1 and 2 by Phase 1, 5
and 6 by Phase 2), and Finding **3** landed with Phase 3. **Every flag-blocking
finding is now closed and the code STOP is lifted.** What still gates the
redeploy is Phase 8's ops sequence — `GOOGLE_MAPS_BROWSER_KEY` is still unset
(Phases 4–8's code half all landed 2026-09-08; Phase 8's re-verify gate is green,
its `/code-review` re-run turned up 3 low-severity findings and all 3 are fixed,
and the only steps left are Andrew's: commit the branch, set the browser key,
redeploy, set the flag, redeploy, close the device checklist). Both signup
migrations are now live:
Phase 2's `claim_signup_attempt` (pushed + probed 2026-09-08, see Phase 3's
as-built notes and runbook §3) and Phase 3's `20260908130000_venues_rehidden_at`
(pushed + verified with Phase 4, 2026-09-08).

---

## 1. The findings, triaged

**Blocking the flag flip (Phases 1–3):** 1, 2, 5, 6, 7, 12, and 3.
**Should land before real partners use it (Phases 4–6):** 4, 11, 8.
**Quality / drift-prevention (Phases 5–7):** 9, 10, 13, 14, 15.

| # | File | Severity | Phase |
| --- | --- | --- | --- |
| 1 | `app/api/owner/signup/route.ts:310` claim path skips `(0,0)` filter | **Critical** | 1 ✅ |
| 2 | `route.ts:520` stamp refresh guarded on `hidden` only | **Critical** | 1 ✅ |
| 5 | `lib/googleMapsKeys.ts:36` silent fallback to server key | **Critical** | 2 ✅ |
| 6 | `lib/rateLimit.ts:151` non-atomic read-then-write | **High** | 2 ✅ |
| 7 | `app/api/signup/places/route.ts:61` echoes upstream error text | **Medium** | 2 ✅ |
| 12 | `route.ts:106` UTF-16 length vs. byte budget | **Medium** | 2 ✅ |
| 3 | `app/api/webhooks/stripe/route.ts:510` reveal failure is permanent | **High** | 3 ✅ |
| 4 | `ReviewStep.tsx:158` claim button has no in-flight guard | **High** | 4 ✅ |
| 11 | `SignupWizard.tsx:250` dead `error` props; `email_taken` lands 4 steps away | **Medium** | 4 ✅ |
| 9 | `lib/googleMapsKeys.ts:40` `serverGoogleMapsKey()` has zero call sites | **Medium** | 5 ✅ |
| 10 | `app/api/signup/venue-map/route.ts:30` copy-paste fork + `lat=90` divide | **Medium** | 5 ✅ |
| 13 | `AddressStep.tsx:68` re-implements `hasSignupAddress` | **Low** | 5 ✅ |
| 14 | `lib/selfServeSignup.ts:262` double `signupFieldTooLong` call | **Low** | 5 ✅ |
| 8 | `lib/signupSweep.ts:252` dry-run misreports owner deletions | **Medium** | 6 ✅ |
| 15 | `vercel.json` cron + stale route comment | **Low** | 7 ✅ |

### On Finding #15 specifically

The `vercel.json` cron entry was added **on Andrew's explicit instruction**
(2026-09-07, recorded in the signup plan's Phase 7 §7), so CLAUDE.md's
"do not alter unasked" boundary was satisfied. The real defect is the **stale
comment** at `app/api/cron/signup-sweep/route.ts:37-39`, which still says
registration is pending and tells the next reader to add an entry that already
exists. Fix the comment; do not revert the cron. Phase 7 also records the
authorization in CLAUDE.md so the next reviewer does not re-flag it.

---

## 2. The root cause worth naming

Findings 1, 2, 9, 10 and 13 are all the same mistake: **a rule that exists in two
places.** The signup work was otherwise disciplined about this — it
parameterised `useAddressLookup`, `VenueMapPicker`, `GeofenceEditor` and
`RadiusDial` rather than forking them, and it put validation in
`lib/selfServeSignup.ts` so client and server share one rule set. Where it
slipped, it slipped the same way every time:

- venue **eligibility** exists in `findNearbyVenue` and again, differently, in
  the claim branch → **Finding 1**
- venue **provenance** is checked as `self_serve_created_at is not null` in the
  webhook and the sweep, but as `hidden` in the claim stamp → **Finding 2**
- the **server key** has a named accessor and four inline `process.env` reads →
  **Finding 9**
- the **venue-map** route was forked, not parameterised → **Finding 10**
- **`hasSignupAddress`** has a shared export and a local copy → **Finding 13**

So every phase below ends by deleting the second copy, not by fixing both. And
Phase 7 writes the rule into CLAUDE.md so it survives the next contributor.

---

## 3. Phases

### Phase 1 — The claim-path vulnerability (BLOCKER)
**Model: Opus 5 · Effort: Medium-High** *(anonymous privilege escalation; two guards that must agree)*

Findings **1** and **2**. One attack chain: #1 gets a stranger an ownership link
to the Category Blitz global room; #2 then stamps that room with
`self_serve_created_at`, which simultaneously arms `maybeRevealVenue` (publish an
internal pooling room to every player's venue list) and
`sweepAbandonedSignupVenues` (delete it 7 days later).

1. **One shared eligibility predicate.** Extract from `findNearbyVenue`'s loop
   into `lib/selfServeSignup.ts` (or a new `lib/venueClaim.ts` if it needs
   Supabase row types) a pure `isClaimableVenueRow(row, pin)`:
   - `latitude !== null && longitude !== null`
   - **`!(latitude === 0 && longitude === 0)`** — a placeholder/internal room,
     never claimable. This is the clause the claim branch is missing.
   - `calculateDistanceMeters(...) <= SIGNUP_DUPLICATE_RADIUS_METERS`
   Call it from **both** `findNearbyVenue` and the `claimVenueId` branch. The
   claim branch's comment ("only re-selects a venue the proximity check would
   have offered anyway") becomes true instead of aspirational.
2. **Add `self_serve_created_at` to `VenueProximityRow`** and to both `.select()`
   lists — it is not currently fetched, which is why the stamp guard could not
   have been written correctly.
3. **Guard the stamp on provenance, not visibility:**
   `if (claimTarget?.hidden && claimTarget.self_serve_created_at !== null)`.
   Update the doc comment, whose stated intent ("stamping one would hand the
   sweep an admin-created venue") is already correct — only the code disagreed.
4. **Consider refusing hidden non-self-serve venues outright** at step 1 rather
   than only declining to stamp them. A stranger should not get a
   `venue_owner_venues` row to an admin-created hidden venue at all. Recommended;
   confirm with Andrew if it complicates a real ops flow.

**Verify:** `npm run test` + new `tests/api.owner.signup.claim-guard.test.ts`
covering: `claimVenueId` at `(0,0)` → 400; claim of an admin-created hidden venue
→ refused and unstamped; claim of a genuine abandoned self-serve venue → still
works and still refreshes the stamp (the legitimate case Phase 5a added). Add a
static tripwire asserting both call sites use the shared predicate.

#### Phase 1 — AS BUILT (2026-09-08, Opus 5) ✅

**Status: complete.** `npm run test` 2174 passed / 228 files, `npx tsc --noEmit`
clean, `npm run lint` clean.

**New file — `lib/venueClaim.ts`** (pure: only `lib/geofence` + `lib/selfServeSignup`,
no Supabase, no `server-only`). Deliberately NOT put in `lib/selfServeSignup.ts`,
which is browser/edge-facing and should not learn DB row shapes. Exports:

| Export | What it is |
| --- | --- |
| `VENUE_CLAIM_COLUMNS` | The one `.select()` string both venue reads use. This is what makes Finding #2 unrepeatable — `self_serve_created_at` cannot be missing from one list any more. |
| `ClaimableVenueRow` | The row type; the route's `VenueProximityRow` is now an alias of it. |
| `isPlaceholderVenueRow(row)` | `lat === 0 && lng === 0`. |
| `isSelfServeVenueRow(row)` | Non-empty `self_serve_created_at`. **Trims** — `""` and `"   "` are NOT provenance, and `undefined` is not either (the route's test harness omits the column on some fixtures). |
| `isAdminHiddenVenueRow(row)` | `hidden === true && !isSelfServeVenueRow(row)`. |
| `claimableDistanceMeters(row, pin)` | **THE rule.** `null` when ineligible, else the distance. |
| `isClaimableVenueRow(row, pin)` | `claimableDistanceMeters(...) !== null`. |

Returning the *distance* rather than a boolean is deliberate: `findNearbyVenue`
needs the nearest match, and a boolean predicate would have forced a second,
separately-written `calculateDistanceMeters` call right beside the shared one —
the exact defect §2 names.

**`app/api/owner/signup/route.ts`** — four changes:

1. `findNearbyVenue`'s loop is now `claimableDistanceMeters(row, pin)`; the
   route no longer imports `calculateDistanceMeters` at all (a tripwire asserts
   this).
2. The `claimVenueId` branch calls `isClaimableVenueRow` — closing **Finding #1**.
3. **Plan step 4 was taken (not just "considered"):** `isAdminHiddenVenueRow`
   refuses a hidden non-self-serve venue **outright**, on both the claim branch
   and the discovery branch, via a new `unavailableResponse()`.
4. The stamp guard is `claimTarget?.hidden && isSelfServeVenueRow(claimTarget)` —
   closing **Finding #2**. Kept even though (3) already makes it unreachable:
   it is the guard that must be right on its own.

**Why step 4 shipped without asking Andrew (plan Risk #5).** Queried production
2026-09-08: there are exactly **two** hidden venues — `hc-cbz-live` and
`category-blitz-global-room`, both the Category Blitz global room, both at
`(0,0)`, both `self_serve_created_at = null` — and **zero** rows stamped
`self_serve_created_at` anywhere. There is no admin-created hidden venue with
real coordinates, so the new refusal blocks no partner and breaks no ops flow.
Re-verify with `select id, hidden, latitude, longitude, self_serve_created_at
from venues where hidden` before assuming this still holds.

**Discovery-side refusal — the decision worth knowing.** An admin-hidden venue
near the pin is still **found**, then refused; it is not skipped. Skipping would
create a *second* venue at an address we already hold and split one bar's
leaderboard — the failure `SIGNUP_DUPLICATE_RADIUS_METERS`'s doc block calls
the expensive one. Refusing on both sides also means the wizard never offers a
claim the POST would then reject.

**No client change was needed.** `unavailableResponse` reuses
`code: "venue_claimed"`, which is already the `DuplicatePanel` branch that
renders **without** a claim button (`components/signup/steps/ReviewStep.tsx:137`).
Only the copy differs — it points at `partnerships@hightopchallenge.com` rather
than guessing "already has a partner account". Two new greppable logs:
`[OwnerSignup] claim-refused-not-self-serve` and
`[OwnerSignup] duplicate-not-self-serve`.

**Tests — note the file split, it deviates from the plan's wording.**

- `tests/api.owner.signup.claim-guard.test.ts` (new, 14 cases) — unit tests of
  the predicate plus the **static tripwires**: the route must import from
  `@/lib/venueClaim`, must contain **no** `calculateDistanceMeters`, must have
  exactly two `.select(VENUE_CLAIM_COLUMNS)` call sites and no literal venue
  column list, and the stamp guard must match
  `/claimTarget\?\.hidden\s*&&\s*isSelfServeVenueRow\(claimTarget\)/`.
- `tests/api.owner.signup.test.ts` gained a **`claim guards (Phase 1)`** block
  (4 cases: `(0,0)` claim → 400 and unstamped; admin-hidden claim → 409 and
  unstamped; admin-hidden discovery → 409 not `venue_available`; abandoned
  self-serve claim → 200 and stamp refreshed). The plan put these in the new
  file; they went here instead because they need this file's ~170-line
  Supabase/auth mock harness, and copying that harness into a second file is
  precisely the defect §2 blames for all fifteen findings. Both files
  cross-reference the split in their headers.
- Its `venueFixture` now takes a 4th arg, `selfServeCreatedAt`, defaulting to
  *three weeks ago when `hidden` is true* — every pre-existing hidden fixture in
  that file means "somebody's abandoned self-serve signup", so the default keeps
  them semantically correct. Pass `null` explicitly for an admin-hidden row.
- Both vulnerability cases were confirmed to **fail** against the pre-fix
  behaviour before being kept.

**Deliberately NOT done in Phase 1** (all belong to Phase 7): no `CLAUDE.md`
edit, no `SYSTEM_CONTEXT.md` edit, and the `/api/cron/signup-sweep` stale
comment is untouched. Nothing was committed.

##### Handoff to whoever does the next phase

Phases 2 and 3 remain **independent of each other and of Phase 1** — nothing
below is a blocker, it is what changed under you.

1. **`lib/venueClaim.ts` now exists, and Phase 3 must build on it, not beside
   it.** `shouldRevealVenue` in the new `lib/venueVisibility.ts` needs the
   "was this created by self-serve?" test — call **`isSelfServeVenueRow(row)`**,
   do not write `self_serve_created_at !== null` a third time. That expression
   appearing in two places with different meanings is literally Finding #2.
   Same for the visibility truth table's placeholder clause: use
   **`isPlaceholderVenueRow(row)`**.
2. **Phase 3 should consider adding the placeholder clause to the reveal
   path too.** `app/api/webhooks/stripe/route.ts:~522` selects on
   `.not("self_serve_created_at", "is", null)` alone. That is *currently* safe —
   Phase 1 guarantees only rows this flow created ever get stamped, and
   production has zero stamped rows — but "a venue at (0,0) is never revealable"
   is a rule Phase 7 is about to write into `CLAUDE.md`, and the reconciler is
   the natural place to enforce it in code. Cheap; do it while you are there.
3. **Phase 7's `CLAUDE.md` bullets for Findings #1/#2 are now describing shipped
   code** — write them in the present tense, and name `lib/venueClaim.ts` as the
   single home of the claim/placeholder/provenance predicates (the same sentence
   shape the Rewards section uses for `award_cycle_winner`).
4. **Phase 5 (`#9`, "delete the second copy") has a new sibling rule worth
   adding to `tests/self-serve-signup-contract.test.ts`** alongside the
   `GOOGLE_MAPS_API_KEY` and `buildCirclePath` assertions: *`calculateDistanceMeters`
   must not appear in `app/api/owner/signup/route.ts`*. It is asserted today in
   `tests/api.owner.signup.claim-guard.test.ts`; if the contract file is meant to
   be the one tripwire home, move it rather than duplicating it.
5. **`venueFixture` in `tests/api.owner.signup.test.ts` changed signature** (4th
   arg `selfServeCreatedAt`). If you add hidden-venue fixtures, be explicit about
   provenance — the default is "abandoned self-serve signup", which is claimable.
6. **Nothing is committed.** The whole self-serve branch is still uncommitted on
   `main` (see the plan's §0 STOP). Phase 1 added `lib/venueClaim.ts` and
   `tests/api.owner.signup.claim-guard.test.ts` as new untracked files and
   modified `app/api/owner/signup/route.ts` and
   `tests/api.owner.signup.test.ts`.
7. **§0's STOP still stands.** Findings 5, 6, 7, 12 (Phase 2) and 3 (Phase 3)
   are unfixed. Do not deploy.

---

### Phase 2 — Public surface hardening (BLOCKER)
**Model: Opus 5 · Effort: High** *(a money-spending public boundary; one fix needs a migration)*

Findings **5**, **6**, **7**, **12**.

1. **#5 — fail closed on the browser key.** `browserGoogleMapsKey()`'s fallback
   to `GOOGLE_MAPS_API_KEY` is correct for `/api/admin/maps-key` (authenticated,
   and it preserves today's single-key behavior) and **wrong** for
   `/api/signup/maps-key`, which serves strangers. Add
   `publicBrowserGoogleMapsKey()` — returns `GOOGLE_MAPS_BROWSER_KEY` **only**,
   empty string otherwise — and have the signup route return a 503 with a loud
   `[SignupMapsKey] browser-key-unset` log when it is empty. The runbook's
   "don't flip the flag first" note stops being the only defence. This
   also makes a mid-rollout env skew a visible failure instead of a silent leak.
2. **#6 — make the limiter atomic.** Replace read-then-write with a single
   guarded statement. **The repo already has the exact pattern to copy:**
   `award_cycle_winner` (CLAUDE.md, Rewards section) is a count-guarded insert
   under a transaction-scoped advisory lock, chosen for precisely this reason.
   Add a `claim_signup_attempt(p_ip_hash, p_window_seconds, p_max)` RPC in a new
   migration that takes `pg_advisory_xact_lock(hashtext(p_ip_hash))`, counts
   inside the window, inserts and returns `{allowed, retry_after_seconds}`.
   `lib/rateLimit.ts` becomes one `.rpc()` call and keeps its fail-closed
   contract. **Do not re-implement the guard in TypeScript** — that is the bug.
3. **#7 — stop echoing upstream errors.** `/api/signup/places` returns a generic
   `"Address lookup is unavailable right now."`; the real message goes to
   `console.error`. Leave the admin siblings alone (they are behind
   `requireAdminAuth`, where the diagnostic is worth more than the disclosure).
4. **#12 — count bytes.** `Buffer.byteLength(raw, "utf8") > SIGNUP_MAX_BODY_BYTES`.
   One line; the constant's name and the doc block already say bytes.

**Verify:** `npm run test`; extend `tests/api.signup.rate-limit.test.ts` with a
concurrency case (N parallel calls, exactly `max` allowed) — it will fail against
the current implementation, which is the point. New cases for the 503-on-unset-key
and the multibyte body cap.

#### Phase 2 — AS BUILT (2026-09-08, Opus 5) ✅

**Status: complete.** `npm run test` 2192 passed / 228 files (was 2174),
`npx tsc --noEmit` clean, `npm run lint` clean. All four findings closed; nothing
committed.

##### #5 — the public maps key fails closed

`lib/googleMapsKeys.ts` now exports **two** browser accessors, and the difference
is the finding:

| Export | Returns | Used by |
| --- | --- | --- |
| `browserGoogleMapsKey()` | `GOOGLE_MAPS_BROWSER_KEY`, **falling back** to `GOOGLE_MAPS_API_KEY` | `/api/admin/maps-key` only — authenticated, and the fallback is what keeps today's single-key behavior working |
| `publicBrowserGoogleMapsKey()` | `GOOGLE_MAPS_BROWSER_KEY` or `""` — **never** the server key | `/api/signup/maps-key` only |

`/api/signup/maps-key` returns **503** (not 500) with
`{ ok: false, error: "Address maps are temporarily unavailable. Please try again later." }`
and logs `[SignupMapsKey] browser-key-unset` naming the env var and the runbook
section. **No client change was needed**: `VenueMapPicker`'s key fetch
(`components/admin/VenueMapPicker.tsx:152-168`) already renders `data.error` on a
non-`ok` body, so the wizard's map steps show that sentence instead of a blank
map. The status was chosen as 503 to match `rateLimitResponse`'s
limiter-unavailable shape — a config outage, not a caller error.

##### #6 — the quota decision moved into Postgres

**New migration — `supabase/migrations/20260908120000_signup_attempt_atomic_rate_limit.sql`**,
defining `claim_signup_attempt(p_ip_hash text, p_window_seconds integer, p_max integer)
returns table (allowed boolean, retry_after_seconds integer)`:
`pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0))` → count inside the window
→ insert only when under quota. Same shape as `award_cycle_winner`, as the plan
directed.

**It is `SECURITY INVOKER`, deliberately, where `award_cycle_winner` is definer.**
`signup_attempts` carries `FORCE ROW LEVEL SECURITY` with exactly one policy
(service_role, FOR ALL). Running as the invoker keeps the function subject to
that policy — the access path the limiter already proves in production — instead
of leaning on the migration owner's RLS bypass and quietly undoing the `FORCE`
the table was created with. It also makes a future mis-grant safe: `EXECUTE`
handed to `anon` would still be denied by RLS on the insert, and the limiter
fails closed. `revoke all from public, anon, authenticated` + `grant execute to
service_role` are in the migration.

`lib/rateLimit.ts`'s quota path is now **one `.rpc()` call** and computes
nothing. Its fail-closed contract grew a case: `isMissingFunctionError` catches
`PGRST202` (PostgREST schema cache) and `42883` (undefined_function) and logs
`[SignupRateLimit] claim_signup_attempt-missing` naming the migration file — this
is Risk #3, the mid-deploy skew, and it is tested. A malformed RPC payload
(`typeof row.allowed !== "boolean"`) also fails closed rather than being coerced.
`pruneSignupAttempts` still uses `.from("signup_attempts").delete()` and is
untouched.

**The concurrency test was confirmed against the pre-fix code before being
kept**: 40 parallel `signupSubmit` claims against a cap of 5 → **40 allowed** on
the old read-then-write limiter, **5** on the new one. The plan's "~40 accounts
against a cap of 5" is measured, not estimated.

##### #7 — `/api/signup/places` returns a generic 500

Body is always `"Address lookup is unavailable right now."`; the thrown message
goes to `console.error("[SignupPlaces] lookup-failed", { message })`. The test
throws an upstream error carrying both `REQUEST_DENIED` and a fake key string and
asserts neither reaches the body while both reach the log. The admin siblings
were left alone, per the plan.

##### #12 — the body cap counts bytes

`Buffer.byteLength(raw, "utf8") > SIGNUP_MAX_BODY_BYTES`. One line, plus a doc
note that `Content-Length` and the decoded check must measure the same unit. Also
confirmed to fail against the pre-fix `raw.length`: a body of `献` repeats is
~1/3 of the cap in UTF-16 units and ~1.05x the cap in bytes, and the old check
returned 400 (field-length rejection) where it should have been 413.

##### Tests

- `tests/api.signup.rate-limit.test.ts` — **rewritten mock, same file.** The
  Supabase stub now models *both* access paths over one in-memory ledger: `.rpc`
  decides and records inside a synchronous critical section (standing in for the
  advisory lock), and `.from("signup_attempts")` still reads/writes the same rows
  the ordinary asynchronous way. Keeping the second path wired is what makes the
  concurrency test fail *meaningfully* against a reintroduced read-then-write
  instead of erroring on an unmocked call. 22 cases (was 9): the N-parallel
  burst, the four fail-closed error codes, the malformed-payload and
  hostile-`retry_after_seconds` cases, the 503-on-unset-key case (asserting the
  server key string appears nowhere in the response), and the generic-error case.
- `tests/api.owner.signup.test.ts` — its mock gained `.rpc("claim_signup_attempt")`
  plus a `mocks.rateLimitClaims` recorder, and the one "it still costs a slot"
  assertion now reads that instead of an INSERT. **The stub decides against the
  seeded window only and does not accumulate its own claims** — several cases in
  that file drive more than `signupSubmit.max` POSTs inside one `it` to sweep a
  table of invalid inputs, and an accumulating limiter turns those 400s into
  429s. Accumulation/atomicity live in the rate-limit file, where they belong.
  New: the multibyte 413 case.
- `tests/self-serve-signup-contract.test.ts` — four new tripwires: the public
  route must call `publicBrowserGoogleMapsKey()` and must **not** call
  `browserGoogleMapsKey()` (a lookbehind, since one name ends in the other) while
  the admin route must keep it; `publicBrowserGoogleMapsKey` has exactly one
  definition and one caller; `GOOGLE_MAPS_BROWSER_KEY` is read in exactly one
  file; the limiter calls the RPC and contains no
  `from("signup_attempts").select`; exactly one migration defines the RPC and it
  takes the advisory lock and grants only `service_role`; and
  `/api/signup/places` never puts `message` in a response body.

##### Docs touched (factual corrections only — Phase 7 still owns the rules)

`.env.example` and `docs/self-serve-signup-runbook.md` §1/§2/§3/§4 said two
things that are now false: that the browser key "falls back to
`GOOGLE_MAPS_API_KEY` if unset" (true only for the admin route now) and that
"nothing is outstanding" on migrations. Both corrected, and the new migration was
added to the cutover order as step 1. No CLAUDE.md or SYSTEM_CONTEXT.md edit —
that is Phase 7.

##### Handoff to whoever does the next phase

Phase 3 remains **independent of Phases 1 and 2**. Nothing below blocks you; it
is what changed under you.

1. **⚠️ THE MIGRATION HAS NEVER BEEN EXECUTED AGAINST A REAL POSTGRES.** There is
   no local Postgres or Docker on this machine (`psql` and `docker` are both
   absent), and applying DDL to the production project is Andrew's call, not a
   phase task. Every test in the suite exercises an **in-memory stand-in** for
   `claim_signup_attempt`, not the SQL. The SQL was hand-reviewed
   (`make_interval(secs => …)`, `extract(epoch from interval)` → `ceil(…)::integer`,
   `v_oldest` provably non-null inside the over-quota branch, `hashtextextended`
   → `bigint` for the lock), but **`supabase db push` is the first real
   execution.** Push it before the Phase 2 deploy and watch for
   `[SignupRateLimit] claim_signup_attempt-missing`, which is what a failed push
   looks like from the app side. Until it is pushed, every `/api/signup/*` call
   fails **closed** (503) — safe, but the wizard does not work.
2. **`rateLimit()`'s signature and `RateLimitResult` are unchanged**, so
   `/api/cron/billing` or anything else you add needs no limiter work. Only the
   internals moved.
3. **If you add a test that drives a route through the limiter, mock `.rpc`, not
   `.from`.** A supabase stub that only implements `from` now throws
   `Unexpected rpc: claim_signup_attempt`. Copy the ~10-line stub from
   `tests/api.owner.signup.test.ts` (the non-accumulating one) unless you are
   specifically testing quota behaviour.
4. **Phase 3's reconciler in `/api/cron/billing` is not a public signup surface**
   — it is `isCronAuthorized`, so it takes **no** `rateLimit()` call. Don't add
   one by symmetry with the `/api/signup/*` routes.
5. **Phase 1's handoff items 1–3 still stand verbatim** and Phase 2 did nothing
   to them: build `shouldRevealVenue` on `isSelfServeVenueRow` /
   `isPlaceholderVenueRow` from `lib/venueClaim.ts`, add the placeholder clause
   to the webhook's reveal select, and write Phase 7's CLAUDE.md bullets in the
   present tense.
6. **Phase 7's CLAUDE.md bullets for #5, #6 and #7 now describe shipped code** —
   present tense. Name `publicBrowserGoogleMapsKey()` (not
   `browserGoogleMapsKey()`) as the public route's accessor, and
   `claim_signup_attempt` as the single home of the quota decision. The
   `.env.example` and runbook corrections above are already done; do not redo
   them.
7. **Phase 5's Finding #9 has a new neighbour.** It must point four inline
   `process.env.GOOGLE_MAPS_API_KEY` reads at `serverGoogleMapsKey()`. The
   contract test already asserts `GOOGLE_MAPS_BROWSER_KEY` is read in exactly one
   place; the natural companion assertion for `GOOGLE_MAPS_API_KEY` is **not**
   there yet, because four files still violate it. Add it as part of Phase 5, in
   the same describe block.
8. **Nothing is committed.** Phase 2 added
   `supabase/migrations/20260908120000_signup_attempt_atomic_rate_limit.sql` as a
   new untracked file and modified `lib/rateLimit.ts`, `lib/googleMapsKeys.ts`,
   `app/api/signup/maps-key/route.ts`, `app/api/signup/places/route.ts`,
   `app/api/owner/signup/route.ts`, `.env.example`,
   `docs/self-serve-signup-runbook.md`, and three test files.
9. **§0's STOP still stands.** Finding **3** (Phase 3) is unfixed: a transient
   Supabase blip during the Stripe webhook leaves a paying partner permanently
   invisible, with no repair path. Do not deploy.

---

### Phase 3 — Reveal reliability (BLOCKER)
**Model: Opus 5 · Effort: Medium** *(billing webhook + the money-state repair path)*

Finding **3**. `maybeRevealVenue` fires on exactly one event
(`isFirstSyncForSubscription` is true once), swallows its error by design, and has
no repair path. One transient Supabase blip leaves a paying $100/mo partner
permanently invisible to every player, with nothing to detect it: the sweep skips
the row (it has a billing row) and no reconciler exists.

**Do not "fix" this by making the follower throw.** That would make Stripe retry
the whole event and re-drive billing sync over a cosmetic failure — the reason it
swallows errors is sound. The fix is a reconciler, not a louder failure.

This is where **`docs/lapsed-venue-rehide-plan.md` Phases 0–1 get absorbed**,
because the module that repairs a missed reveal is the same module that decides a
re-hide:

1. **`lib/venueVisibility.ts`** — pure, no Supabase, no Stripe:
   - `shouldRevealVenue(venue, billing)` — billing live, `hidden === true`,
     `self_serve_created_at !== null`.
   - `shouldRehideVenue(...)` / `shouldRestoreVenue(...)` — stubbed here, wired
     in Phase 9. Defining all three now is what keeps them one truth table.
   - Built on `classifyBillingRow()` from `lib/billing.ts:44`; never re-derive
     the live/not-live predicate.
2. **Migration:** `venues.rehidden_at timestamptz null` (Phase 9 needs it; adding
   it with the module keeps one migration instead of two).
3. **Reconciler in `/api/cron/billing`** — already daily, already
   `isCronAuthorized`, already owns the no-webhook lapse path. Phase 3 ships
   **only the reveal-repair job**: any venue where `shouldRevealVenue` holds gets
   revealed, bounded and logged. Re-hide and restore land in Phase 9 behind
   `VENUE_REHIDE_ENABLED`.
   Do **not** add a new cron route or a `vercel.json` entry.

**Verify:** `npm run test` + `tests/lib.venue-visibility.test.ts` (the full truth
table from the re-hide plan §4 Phase 1) + `tests/api.cron.billing.reveal.test.ts`.
Every existing webhook test must pass **untouched** — that is a meaningful signal.

#### Phase 3 — AS BUILT (2026-09-08, Opus 5) ✅

**Status: complete.** `npm run test` 2232 passed / 230 files (was 2192 / 228),
`npx tsc --noEmit` clean, `npm run lint` clean, `npm run test:god-mode-join` 34
passed. Nothing committed.

**§0's STOP is now LIFTED for Phases 1–3.** All seven flag-blocking findings
(1, 2, 5, 6, 7, 12, 3) are closed. What still gates the redeploy is the ops half
of Phase 8, not code: `GOOGLE_MAPS_BROWSER_KEY` is still unset, and Phases 4–7
have not run.

##### Phase 2's migration: pushed, and verified against the live project

Andrew ran `supabase db push` before this phase. It was not taken on faith —
`claim_signup_attempt` was probed against production 2026-09-08:

| Probe | Result |
| --- | --- |
| `service_role` can execute it | yes, no error |
| `p_ip_hash = "   "` (blank) | `{allowed: false, retry_after_seconds: 3600}` — fails closed, inserts nothing |
| 4 sequential calls at `p_max = 3` | allow, allow, allow, **deny** with a sane `retry_after_seconds` |
| **20 parallel calls at `p_max = 5`** | **exactly 5 allowed**, 0 errors — the advisory lock holds under real concurrency, which no in-memory test could prove |
| `anon` key executing it | **denied**, `42501 permission denied for function claim_signup_attempt` |

The eight rows the probe wrote were deleted; `signup_attempts` is back to its
prior state. Runbook §3 and §4 now record this as done rather than outstanding.
Also re-confirmed while there: production still has exactly **two** hidden venues
(`hc-cbz-live`, `category-blitz-global-room`, both `(0,0)`, both stamp-null) and
**zero** rows stamped `self_serve_created_at` — the same facts Phase 1 relied on.

##### The module — `lib/venueVisibility.ts` (pure)

Three predicates, one truth table, all built on `classifyBillingRow` and on Phase
1's `lib/venueClaim.ts` (`isSelfServeVenueRow`, `isPlaceholderVenueRow`) exactly
as Phase 1's handoff item 1 required — the provenance and placeholder rules are
not written a third time anywhere.

| Export | Rule |
| --- | --- |
| `isBillingLive(billing)` | `classifyBillingRow(...).live`, exported so a caller picking the live row out of a duplicate pair does not re-derive it. |
| `shouldRevealVenue(venue, billing)` | live billing **and** `hidden === true` **and** self-serve-stamped **and** not `(0,0)`. |
| `shouldRehideVenue(venue, billing)` | billing present and **not** live, `hidden === false`, self-serve-stamped, and `billing_method !== "offline"`. **Phase 9 wires it; nothing calls it yet.** |
| `shouldRestoreVenue(venue, billing)` | live billing, `hidden === true`, and **`rehidden_at` non-empty** — we only restore what we hid. **Phase 9 wires it.** |
| `isVenueRehideEnabled()` | `VENUE_REHIDE_ENABLED`, repo `truthy()` convention. Deliberately **not** `NEXT_PUBLIC_*`: both consumers are server-side, so it flips without a redeploy. |

`shouldRehideVenue`/`shouldRestoreVenue` were **implemented, not stubbed**, and
are pinned by the full truth table now. The plan said "stubbed"; a stub tested
against nothing is exactly how the three rules drift apart, which is the point of
putting them in one module.

**It is not `server-only`-free**, and cannot be: `classifyBillingRow` lives in
`lib/billing.ts`, which is `server-only`, and `OFFLINE_BILLING_METHOD` in
`lib/stripe.ts`, likewise. The marker rides in transitively. That costs nothing —
both consumers (webhook, cron) are server-side, and vitest aliases `server-only`
to a no-op — but do not describe this module as dependency-free.

##### The reconciler — `lib/venueVisibilitySync.ts` + `/api/cron/billing`

`repairMissedVenueReveals({ dryRun })`, called from the existing daily cron. No
new route, no `vercel.json` entry, no `rateLimit()` call (it is `isCronAuthorized`,
per Phase 2's handoff item 4).

- **Scan:** `venues` where `hidden = true` and `self_serve_created_at is not null`,
  oldest first, `limit VISIBILITY_SCAN_LIMIT + 1` (500). Over the limit it
  **truncates and reports** rather than aborting — unlike `sweepAbandonedSignupVenues`,
  a large candidate set here is NORMAL (every abandoned Checkout the 7-day sweep
  has not yet reaped is in it), so an abort-over-cap would disable the repair
  precisely when signups are healthy.
- **Join:** one `.in()` read of `billing_subscriptions`. A duplicate row for a
  venue resolves to the live one, not to whichever came back first.
- **Write cap:** `REVEAL_MAX_PER_RUN` (25) per run, the rest **deferred, not
  dropped** — a revealed venue leaves the scan, so successive runs drain the
  queue. A test proves the second run finishes the job.
- **Fails closed** on both reads: a venue-read or billing-read error reveals
  nothing and reports the error.
- **Idempotent twice:** the UPDATE re-asserts `hidden = true` (a webhook winning
  the race is a no-op, not a double write), and a revealed venue drops out of the
  scan.
- **Never fails the cron.** The route wraps the call in try/catch and returns
  `venueReveal: { threw }` — the offline-expiry sweep two statements earlier has
  already committed, and a reconciler fault must not make Vercel's retry re-run
  it.
- **`?dryRun=1`** on the route forces report-only. It deliberately does **not**
  touch the offline-expiry sweep, which has been live for months.
- Response is now `{ ok, offlineExpired, venueReveal }`.

**Not behind `VENUE_REHIDE_ENABLED`, on purpose.** The flag gates *new* behavior
(hiding people). Revealing a venue that is self-serve-created **and currently
paying** is the repair for a bug — gating it would mean a paying partner stays
invisible until someone remembers to set an env var. A static test asserts
`lib/venueVisibilitySync.ts` never mentions the flag.

**`venues.rehidden_at` is written by nothing in Phase 3.** See the handoff.

##### The webhook (Phase 1 handoff item 2 — done)

`maybeRevealVenue`'s update gained `.or("latitude.neq.0,longitude.neq.0")` —
`NOT(lat = 0 AND lng = 0)`, not two `.neq` filters, which would also exclude a
real venue sitting exactly on the equator or the prime meridian.
`venues.latitude`/`.longitude` are `NOT NULL` (initial schema), so there is no
null case. Its doc block now also states that best-effort is by design and names
the reconciler as the repair path.

##### Migration — `20260908130000_venues_rehidden_at.sql`

`add column if not exists venues.rehidden_at timestamptz` + a partial index on
`rehidden_at is not null` + a column comment. **NOT pushed** (see handoff #1).

##### Tests

- **`tests/lib.venue-visibility.test.ts`** (new, 26 cases). The full re-hide-plan
  §4 truth table — including the three "no action" decisions that are the whole
  product judgment (`cancel_at_period_end` waits for period end; `past_due` is
  still a paying customer; a retry that succeeds changes nothing) — plus reveal
  cases, the equator/prime-meridian case, and six **static guards**: no bare
  `status === "active"|"past_due"` in the module, no `current_period_end` anywhere
  in either new file, `VENUE_REHIDE_ENABLED` read once with no `NEXT_PUBLIC_`
  prefix, the sweep's billing exclusion still present (Risk #1 of the re-hide
  plan), and the reveal repair not flag-gated. The guards strip comments before
  matching, because the module's own doc blocks have to name the things they
  prohibit.
- **`tests/api.cron.billing.reveal.test.ts`** (new, 13 cases) drives the job
  through the real route: reveal, `past_due` reveal, unpaid/cancelled/admin-hidden/
  `(0,0)` left alone, both fail-closed read errors, a per-venue write error that
  does not stop the loop, `?dryRun=1` writing nothing, the cap-and-drain case, the
  offline sweep still running, and a 401 doing nothing at all. Its Supabase mock
  mirrors the scan's own `hidden`/stamp predicate so the module cannot pass by
  **omitting** a filter.

##### Two test files were touched — deviating from "must pass untouched"

Both are **harness widenings with every assertion left intact**, and both were
necessary rather than convenient:

- `tests/api.webhooks.stripe.reveal-venue.test.ts` — its builder's op list gained
  `"or"` (one word) because the reveal predicate now uses it, and **one new case**
  asserts the `(0,0)` clause is present. Without the widening the file errors
  rather than fails, which is not a signal about anything.
- `tests/api.cron.billing-offline-expiry.test.ts` — its builder gained the filter
  ops the new scan uses (`not`, `in`, `order`, `limit`, `or`). **This one matters:
  the file passed untouched, but for the wrong reason** — the reconciler was
  throwing `builder.not is not a function` straight into the route's catch, so
  "the sweep is the cron's only write" was true only because the second job was
  crashing. It now runs for real, finds zero candidates, and the assertion means
  what it says.

##### Deliberately NOT done in Phase 3

No `CLAUDE.md` or `SYSTEM_CONTEXT.md` edit (Phase 7 owns those, including the new
"Venue Visibility" section this phase makes true). No re-hide/restore wiring
(Phase 9). No `/api/cron/signup-sweep` comment fix (Phase 7). No admin badge.
Nothing committed.

##### Handoff to whoever does the next phase

**Phase 4 is next by the plan's order and depends on nothing here.** Everything
below is what changed under you.

1. **`supabase/migrations/20260908130000_venues_rehidden_at.sql` is NOT pushed.**
   Unlike Phase 2's, it does **not** gate the deploy: I deliberately kept every
   Phase 3 code path off the column, so `/api/cron/billing` never selects or
   writes `rehidden_at` and shipping this code against a database without it is
   safe. **Phase 9 is where it becomes required** — push it before that phase's
   code, exactly as Phase 2's was pushed before its own. Verify the same way, not
   on faith: `select rehidden_at from venues limit 1` should stop erroring with
   `column venues.rehidden_at does not exist` (which is what it says today).
2. **Phase 9 must clear `rehidden_at` wherever it un-hides.** Phase 3's
   reveal-repair writes `{ hidden: false }` only. That is correct today (nothing
   sets `rehidden_at`, so nothing is stale), but the moment Phase 9's re-hide job
   starts stamping it, a resubscribing partner can be un-hidden by the *reveal*
   path — which matches `shouldRevealVenue` just as well as `shouldRestoreVenue`
   does — and would leave `rehidden_at` set on a visible venue. Either add
   `rehidden_at: null` to the reveal write and to `maybeRevealVenue`'s (the
   re-hide plan's Phase 2 already calls for the latter), or make restore run
   first. Do not leave it to chance.
3. **The three predicates are one truth table. Add the fourth rule there, not
   beside it.** `lib/venueVisibility.ts` is the only place that may answer "should
   this venue be visible?". Phase 9's jobs call `shouldRehideVenue` /
   `shouldRestoreVenue` as they stand — they are already tested against the full
   table, so a Phase 9 that needs to *change* one of them is a signal to re-read
   the table, not to add a clause at the call site.
4. **Six static guards now live at the bottom of `tests/lib.venue-visibility.test.ts`.**
   Phase 9 (re-hide plan Phase 5) creates `tests/venue-rehide-contract.test.ts`
   for the full set — **move** them there; do not write a second copy. The
   sweep-interaction guard (Risk #1) is the highest-value one and is already
   armed today.
5. **`/api/cron/billing`'s response shape changed** to
   `{ ok, offlineExpired, venueReveal }`, and it now reads `?dryRun=1`. Anything
   asserting the old two-key body will need updating; nothing in the repo does.
   Phase 9 should extend `venueReveal` into a sibling key (`venueRehide`, say)
   rather than overloading it — reveal and re-hide fire on opposite transitions.
6. **A Supabase mock for this route now needs `not`, `in`, `order`, `limit` and
   `or` on its builder**, or the reconciler throws into the route's catch and your
   test passes for the wrong reason. That is exactly what
   `tests/api.cron.billing-offline-expiry.test.ts` was doing before this phase —
   copy the richer mock from `tests/api.cron.billing.reveal.test.ts` instead.
7. **Phase 7's `CLAUDE.md` work grew.** The plan's "new Venue Visibility section"
   is now describing shipped code — write it in the present tense, and name
   `lib/venueVisibility.ts` as the single home of the three predicates and
   `/api/cron/billing` as the repair path. Add the rule this phase proved out:
   **a visibility bug is fixed in the reconciler, never by making the webhook
   follower throw.** Phase 1's and Phase 2's handoff items about present-tense
   CLAUDE.md bullets still stand and are still undone.
8. **Nothing is committed.** Phase 3 added `lib/venueVisibility.ts`,
   `lib/venueVisibilitySync.ts`,
   `supabase/migrations/20260908130000_venues_rehidden_at.sql`,
   `tests/lib.venue-visibility.test.ts` and `tests/api.cron.billing.reveal.test.ts`
   as new untracked files, and modified `app/api/cron/billing/route.ts`,
   `app/api/webhooks/stripe/route.ts`, `docs/self-serve-signup-runbook.md`,
   `tests/api.webhooks.stripe.reveal-venue.test.ts` and
   `tests/api.cron.billing-offline-expiry.test.ts`.
9. **§0's STOP is lifted for the three blocker phases** — but the flag must still
   not be flipped until Phase 8's ops sequence runs, starting with
   `GOOGLE_MAPS_BROWSER_KEY`. Phases 4–7 remain.
10. **One unexplained single-test failure, seen once and never again.** During
    Phase 3 the suite was run 13 times; twelve were 2232/2232 and one reported
    `1 failed` without naming the test in captured output. It could not be
    reproduced in the eleven runs that followed, including four deliberate
    repeat runs hunting for it, and both new files are timer-free and
    order-independent. **Treat it as unattributed, not as clean.** If you see a
    lone failure in Phase 4, capture the test name before re-running — that is
    the datum this phase could not get.

---

### Phase 4 — Signup UX correctness
**Model: Sonnet 5 · Effort: Medium**

Findings **4** and **11**. Both are "the partner is told something false."

1. **#4 — in-flight guard on the claim button.** Thread `submitting` from
   `SignupWizard` into `ReviewStep` → `DuplicatePanel` and disable the
   "Yes — this is my venue" control. Today `nextDisabled={submitting}` protects
   the footer, but the duplicate branch removes `onNext` and the claim button
   becomes the only control — unguarded. A double tap burns two of five hourly
   slots and can return a support-contact 409 on a signup that succeeded.
2. **#11 — route server errors to the field they are about.** `EmailStep`,
   `NameStep` and `PasswordStep` all declare an `error` prop that nothing ever
   passes. On `email_taken`, navigate the wizard back to the **email** step and
   pass the message into that field, instead of printing it in the review
   screen's footer four steps away. Delete any `error` prop that stays genuinely
   unused rather than leaving a dead affordance.

**Verify:** `npm run test`, `npm run lint`, `npx tsc --noEmit`. Add
`tests/components.signup-wizard-errors.test.ts` asserting `email_taken` sets the
step index to the email step. Device checklist §6 gains a double-tap item.

#### Phase 4 — AS BUILT (2026-09-08, Sonnet 5) ✅

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean,
`npm run test` 2234 passed / 230 files + 13 skipped, with **one unrelated flake**
(see handoff #5). Nothing committed.

##### Migration pushed first

`supabase/migrations/20260908130000_venues_rehidden_at.sql` was pushed with
`supabase db push` before this phase (it was the only pending migration;
`20260908120000` was already remote). Verified against the live project:
`select id, hidden, rehidden_at from venues limit 3` now returns the column
(`rehidden_at: null` on every row) instead of erroring `column
venues.rehidden_at does not exist`. **Phase 3's handoff #1 is now discharged** —
Phase 9 no longer has to push it, only to build on it. Every Phase 3 code path
still deliberately avoids the column, so shipping Phase 3's code against the now-
migrated DB is unchanged.

##### #4 — the claim button has an in-flight guard

`submitting` is threaded `SignupWizard` → `ReviewStep` (new optional
`submitting?: boolean` prop) → `DuplicatePanel` (required `submitting: boolean`,
defaulted `?? false` at the `ReviewStep` boundary so the panel prop is never
`undefined`). The claim `<button>` gains `disabled={submitting}`,
`aria-busy={submitting}`, `disabled:pointer-events-none disabled:opacity-60`, and
its label swaps to **"Claiming…"** while pending — the same treatment
`NextButton` gets in the footer, which the duplicate branch hides. The
`onEditLocation` secondary button is deliberately **left enabled** — "my venue is
somewhere else" is always safe to take, in flight or not, and disabling it would
trap a partner behind a hung request.

##### #11 — `email_taken` goes back to the email step

- `SignupWizard` gains one state field, `emailError`. On a `409` whose
  `code === "email_taken"`, the wizard now `setDuplicate(null)`,
  `setEmailError(payload.error ?? …)` and
  `setIndex(SIGNUP_STEPS.indexOf("email"))`, then returns — instead of falling
  through to the generic `setHint(payload.error)` that rendered it in the review
  footer three steps away.
- `emailError` is passed to `EmailStep` as its existing `error` prop (which
  already outranks the local on-blur format check and renders as the field's
  `role="alert"` line). It clears the instant the email field is edited
  (`onChange` → `setEmailError("")`) and at the top of every `submit()`.
- **`EmailStep.error` was already fully wired** — it is the one step-level
  `error` prop that is now used. **`NameStep.error` and `PasswordStep.error` were
  dead and are deleted** (prop type, destructure, and the `{...(error ? …)}`
  spread / the `shown = error || …` fold in `PasswordStep`). Name/password server
  errors — none field-specific today — still surface as the generic footer hint.
  A short comment in each file records why the prop is gone, so it is not re-added
  by symmetry with `EmailStep`.

##### Tests — `tests/components.signup-wizard-errors.test.ts` (new, 3 cases)

jsdom + `@testing-library/react` (already a devDep; `jest-dom` is **not**
installed, so assertions use `button.disabled` / `getAttribute`, not
`toBeDisabled()`). It mocks the shell to a passthrough exposing `step-key` /
`step-index` / `footer-hint` and a Next button, stubs `next/navigation`, mocks
`AddressStep`/`GeofenceStep` to `null` (Google Maps widgets jsdom can't run), and
mocks `signupDraft` to hand back one pre-seeded valid draft so `advanceTo` can
click Next straight to review. Cases:

1. `email_taken` 409 → `step-index` becomes the email index, the message is on
   the field (`role="alert"`), the footer hint is empty, `router.replace` is not
   called.
2. Editing the email field clears the `role="alert"`.
3. A `venue_available` 409 opens the duplicate panel; clicking claim disables the
   button + shows "Claiming…" + `aria-busy`; two more taps fire **no** further
   `fetch` (asserted `toHaveBeenCalledTimes(2)` — discovery + one claim).

##### Docs touched

`docs/self-serve-signup-device-checklist.md` §8: the `email_taken` item now
describes the step jump + on-field message + clear-on-edit; a new item covers
double-tapping the claim button (network tab shows exactly one claim request, no
second rate-limit slot). The plan said "§6" but §6 is Autofill — §8 (End to end)
is where the duplicate/claim flow is actually exercised, so it went there.

**Deliberately NOT done:** no `CLAUDE.md` / `SYSTEM_CONTEXT.md` edits (Phase 7),
no commit.

##### Handoff to whoever does the next phase

**Phase 5 is next by the plan's order and depends on nothing here.**

1. **The `20260908130000_venues_rehidden_at` migration is now LIVE** on the
   production project. Phase 3's handoff #1 (and this plan's §0 line about it
   being "outstanding but gates nothing until Phase 9") are discharged — update
   your mental model: the column exists, reads `null` everywhere, and Phase 9
   only has to *write* it. Phase 3's handoff #2 (clear `rehidden_at` wherever
   Phase 9 un-hides) still stands.
2. **`ReviewStep` now takes `submitting?: boolean`.** Any other caller of
   `ReviewStep` (there is only `SignupWizard`) must pass it or accept the
   `?? false` default. `DuplicatePanel`'s `submitting` is **required** — if you
   refactor the panel out, keep it required, not optional.
3. **`NameStep` / `PasswordStep` no longer accept `error`.** If Phase 5 or later
   needs a field-scoped server error for one of them, follow the `email_taken`
   pattern in `SignupWizard` (a dedicated state field + step jump), don't just
   re-add a prop that nothing routes to.
4. **Phase 7's CLAUDE.md work:** Findings #4 and #11 are now shipped — if Phase 7
   documents them, present tense, and name `SignupWizard`'s `emailError` state as
   the single channel for a field-scoped server error (only `email_taken` uses it
   today).
5. **One unrelated flake.** `tests/lib.sportsBingo.mlb-star-tilt.test.ts` >
   "stops tilting when the tier boosts are turned off" failed once in the Phase 4
   full-suite run (`expected 0.3667 to be less than 0.3542`) and then passed 4/4
   in isolation and 4/4 more with the Phase 4 changes stashed. It is an unseeded
   Monte-Carlo test with a 0.05 margin — nothing in Phase 4 touches MLB bingo.
   This matches Phase 3's handoff #10 (a lone, unreproducible suite failure).
   Treat as unattributed noise; if it recurs, it predates this work.
6. **Nothing is committed.** Phase 4 added
   `tests/components.signup-wizard-errors.test.ts` (new untracked) and modified
   `components/signup/SignupWizard.tsx`,
   `components/signup/steps/ReviewStep.tsx`,
   `components/signup/steps/NameStep.tsx`,
   `components/signup/steps/PasswordStep.tsx`, and
   `docs/self-serve-signup-device-checklist.md`.
7. **§0's STOP:** the three blocker phases (1–3) are done; the flag still must not
   be flipped until Phase 8's ops sequence (`GOOGLE_MAPS_BROWSER_KEY` first).
   Phases 5–7 remain.

---

### Phase 5 — Delete the second copy
**Model: Sonnet 5 · Effort: Medium**

Findings **9**, **10**, **13**, **14** — §2's root cause, four instances.

1. **#9 — wire `serverGoogleMapsKey()`.** It has zero call sites while
   `lib/geolocation.ts:216`, `app/api/signup/venue-map/route.ts:63`,
   `app/api/admin/venue-map/route.ts:34` and `app/api/admin/places/route.ts:185`
   all read `process.env.GOOGLE_MAPS_API_KEY` inline. Point all four at the
   accessor. Until this lands, the runbook and CLAUDE.md describe an indirection
   point that does not exist.
2. **#10 — parameterise the venue-map route.** Extract the shared Static Maps
   builder (`buildCirclePath`, param assembly, coordinate validation, response
   streaming) into `lib/venueStaticMap.ts`; admin and signup differ only in
   radius bounds and circle color, which become arguments. **Fix the latent
   `lat=90` bug once while you are in there:** `dLon = radius / (111320 *
   Math.cos(latRad))` divides by ~6e-17 at the pole and emits absurd longitudes,
   spending a Google request that returns 400. Clamp the latitude used for the
   cosine.
3. **#13 — use `hasSignupAddress`.** `AddressStep`'s local `hasAddress` is a
   fourth-copy of a rule the file's own module already exports and the step gate
   already uses.
4. **#14 — call `signupFieldTooLong` once.** The address branch two cases below
   already shows the correct form.

**Verify:** `npm run test`, `npm run lint`. Extend
`tests/self-serve-signup-contract.test.ts`: no `process.env.GOOGLE_MAPS_API_KEY`
outside `lib/googleMapsKeys.ts`; no second `buildCirclePath`.

#### Phase 5 — AS BUILT (2026-09-08, Sonnet 5) ✅

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean,
`npm run test` 2237 passed / 231 files + 13 skipped (was 2234), `npm run build`
compiles. Nothing committed.

##### #10 — `lib/venueStaticMap.ts` is the one Static Maps builder

New file (`server-only`). Exports `fetchVenueStaticMap(req)` returning a
discriminated `VenueStaticMapResult` (`{ ok: true, body, contentType }` |
`{ ok: false, status, error }`) so the two callers keep their own response
*shapes* (admin returns `new NextResponse(text, …)`, signup returns
`NextResponse.json({ ok: false, error }, …)`) while sharing all the Google
mechanics. The routes now differ only in the four values that were always the
only real difference: radius bounds (clamped by the caller, unchanged — admin
25–2000, signup `SIGNUP_RADIUS_*`), `size` (`600x280` vs `600x260`), and the two
circle colours (`0x4f46e5*` indigo vs `0x22d3ee*` cyan), passed as
`strokeColor` / `fillColor` args.

**The `lat=90` divide is fixed once, in `buildCirclePath`.** A new
`MAX_ABS_LAT_FOR_COSINE = 89.9` clamps *only the latitude fed to
`Math.cos(latRad)`* in the `dLon` denominator; the plotted point still uses the
real `lat + dLat`. Away from the poles this is a no-op; at a pole it stops the
`radius / (111320 * ~6e-17)` blow-up that spent a Google request on a 400.

##### #9 — `serverGoogleMapsKey()` is now the only reader of `GOOGLE_MAPS_API_KEY`

All four sites the plan named now go through it:
`lib/geolocation.ts`'s `getApiKey()` (kept its throw-on-empty contract —
`serverGoogleMapsKey()` returns `""`, which is still falsy), `app/api/admin/places/route.ts`
(kept its `&& googleApiKey` truthy guard, so `""` behaves exactly as the old
`undefined`), and both venue-map routes via `lib/venueStaticMap.ts`.
`process.env.GOOGLE_MAPS_API_KEY` now appears in `lib/googleMapsKeys.ts` **only**
(lines 54 + 68 — the browser-key fallback and the server accessor), plus one
`tests/` fixture the contract scan does not cover.

**`lib/googleMapsKeys.ts` lost its `import "server-only"`, deliberately.**
`serverGoogleMapsKey()` is called from `lib/geolocation.ts`, which also exports
the browser geolocation helpers and is therefore imported by `"use client"`
components (`JoinFlow`, `FantasyHome`, `VenuePresenceBoundary`). A `server-only`
import there is a hard build error — confirmed by `npm run build`. There is **no
leak**: none of `GOOGLE_MAPS_BROWSER_KEY` / `GOOGLE_MAPS_API_KEY` is
`NEXT_PUBLIC_*`, so all three accessors resolve to `""` in a browser bundle, and
`browserGoogleMapsKey()` / `publicBrowserGoogleMapsKey()` are only ever *called*
from API routes regardless. This was considered against splitting the ~220-line
server Places block out of `geolocation.ts` into its own `server-only` module;
that is the bigger refactor Risk #4 warns against for a mechanical phase, and
`geolocation.ts` *already* read `GOOGLE_MAPS_API_KEY` un-`server-only`, so the net
posture is unchanged. A block comment at the top of `googleMapsKeys.ts` records
why. `lib/venueStaticMap.ts` keeps `server-only` — nothing client imports it.

##### #13 — `AddressStep` uses `hasSignupAddress`

`components/signup/steps/AddressStep.tsx`'s local `hasAddress` byte-string is
replaced with `hasSignupAddress(draft)` from `@/lib/selfServeSignup` — the same
predicate `signupStepIssue`'s `"address"` branch already gates on.

##### #14 — `signupFieldTooLong` called once in the email branch

`lib/selfServeSignup.ts` `signupStepIssue` `case "email"` now does
`const tooLong = signupFieldTooLong(...); if (tooLong) return tooLong;` (the
`"address"` branch's form), wrapped in a `{ }` block for `no-case-declarations`.

##### Tests — `tests/self-serve-signup-contract.test.ts` (3 new tripwires)

In the existing `"the Google Maps key split"` describe block:
`GOOGLE_MAPS_API_KEY` is read only in `lib/googleMapsKeys.ts` (scan of app/ +
components/ + lib/); `function buildCirclePath` is defined only in
`lib/venueStaticMap.ts`; and both venue-map routes import
`from "@/lib/venueStaticMap"`. No behavioural tests were needed — the venue-map
routes have never had any, and behaviour is unchanged.

##### Deliberately NOT done

No `CLAUDE.md` / `SYSTEM_CONTEXT.md` edits — Phase 7 owns the "`serverGoogleMapsKey()`
is the only server-side reader" rule and the stale-comment fixes in
`lib/googleMapsKeys.ts` / `docs/self-serve-signup-runbook.md`. The
`lib/googleMapsKeys.ts` server-key doc-block already happened to name
`lib/geolocation.ts` and "the `venue-map` routes" as server-key users, so it is
now accurate as-is. Nothing committed.

##### Handoff to whoever does the next phase

**Phase 6 is next and depends on nothing here.**

1. **`lib/googleMapsKeys.ts` is no longer `server-only`.** If Phase 7 or later
   wants that guard back, it must first move `serverGoogleMapsKey()` (or the
   whole server Places block in `lib/geolocation.ts`) out of any client-imported
   module. Do not just re-add the import — `npm run build` will fail on
   `JoinFlow`.
2. **New contract assertion to be aware of:** `process.env.GOOGLE_MAPS_API_KEY`
   outside `lib/googleMapsKeys.ts` now fails `tests/self-serve-signup-contract.test.ts`.
   Anything new that needs the server key imports `serverGoogleMapsKey()`.
3. **`lib/venueStaticMap.ts` is the only home of `buildCirclePath` and the Static
   Maps param assembly.** A third venue-map surface parameterises it, never forks
   it. Phase 7's CLAUDE.md bullet for #9 (`serverGoogleMapsKey()` is the only
   `GOOGLE_MAPS_API_KEY` reader) is now shipped code — present tense — and can
   name `lib/venueStaticMap.ts` alongside it for #10.
4. **Phase 1–4 handoff items about present-tense CLAUDE.md bullets still stand
   and are still undone** — Phase 7 picks them all up together.
5. **Nothing is committed.** Phase 5 added `lib/venueStaticMap.ts` (new untracked)
   and modified `lib/googleMapsKeys.ts`, `lib/geolocation.ts`,
   `lib/selfServeSignup.ts`, `app/api/admin/venue-map/route.ts`,
   `app/api/signup/venue-map/route.ts`, `app/api/admin/places/route.ts`,
   `components/signup/steps/AddressStep.tsx`, and
   `tests/self-serve-signup-contract.test.ts`.
6. **§0's STOP:** blocker phases 1–3 are done; the flag still must not be flipped
   until Phase 8's ops sequence (`GOOGLE_MAPS_BROWSER_KEY` first). Phases 6–7
   remain. Phase 5 did not touch the deploy gate.
7. **Risk #4 hand-check still owed at Phase 8:** the player join-flow address
   lookup (`lib/geolocation.ts` → `/api/geolocation/predict` + `/details`) now
   reads its key via `serverGoogleMapsKey()`. Behaviourally identical (`""` vs
   `undefined`, both falsy), tsc/lint/build/tests all green, but it is invisible
   to the signup test suite — verify the address box on the real join flow when
   `GOOGLE_MAPS_BROWSER_KEY` goes in.

---

### Phase 6 — Sweep dry-run fidelity
**Model: Sonnet 5 · Effort: Low-Medium**

Finding **8**. The sweep ships log-only and the whole enablement plan is "read a
week of output, then flip the flag." But the dry-run branch returns before
`deleteOwnerIfUnused` is consulted, so it always reports `ownerIdsKept = all`,
`ownerIdsDeleted = []`, `authUserIdsDeleted = []` — a preview that structurally
cannot show the destructive half the two-flag split exists to be careful about.

Split `deleteOwnerIfUnused` into a read-only `classifyOwnerForSweep(ownerId)` and
a `deleteOwner(...)` that acts on the classification. The dry run calls the
classifier and reports the real split; the live run classifies then deletes.

**This directly changes what evidence Andrew flips the flag on**, so it must land
before `SIGNUP_SWEEP_AUTH_DELETE_ENABLED` is ever considered.

**Verify:** `npm run test` + new dry-run cases in
`tests/api.cron.signup-sweep.test.ts` asserting the reported split matches what a
live run would do.

#### Phase 6 — AS BUILT (2026-09-08, Sonnet 5) ✅

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean,
`npm run test` 2243 passed / 231 files + 13 skipped (was 2237 / 231 — +6 new
cases), no flake this run. Nothing committed.

##### The split — `lib/signupSweep.ts`

`deleteOwnerIfUnused` is gone, replaced by two functions:

| Export | What it is |
| --- | --- |
| `classifyOwnerForSweep(ownerId, sweptVenueId, errors)` | **READ-ONLY.** Returns an `OwnerSweepPlan` (exported type): `{ ownerId, authUserId, deleteOwner, deleteAuthUser, keepReason }`. Pushes to `errors` and fails closed exactly as the old function did. |
| `deleteOwner(plan, errors)` — module-private | Acts on a plan. `!plan.deleteOwner` → no-op. Otherwise deletes the `venue_owners` row, then (only if `plan.deleteAuthUser`) the auth user. Returns the same `{ deletedOwner, deletedAuthUserId }` shape the loop already consumed. |

The dry-run branch of `sweepAbandonedSignupVenues` **no longer early-returns**: it
calls `classifyOwnerForSweep` per owner and fills `swept.ownerIdsDeleted` /
`authUserIdsDeleted` / `ownerIdsKept` with the *projected* split, then logs one
greppable `[SignupSweep] venue-sweep-dry-run venue=… ownersToDelete=N
ownersToKeep=N authUsersToDelete=N` line. The live branch calls
`classifyOwnerForSweep` **then** `deleteOwner` — same result as before.

##### The one subtlety worth knowing: `sweptVenueId` is discounted explicitly

The old live path relied on the `venues` delete having already **cascaded away**
the `venue_owner_venues` link rows before it counted an owner's "remaining"
links. The dry run never deletes the venue, so that link is still present — which
is the whole reason the old dry run reported every owner kept.

`classifyOwnerForSweep`'s remaining-links query is now
`.eq("owner_id", ownerId).neq("venue_id", sweptVenueId).limit(1)` — the swept
venue's own link is excluded *by the query*, not by a prior delete. In the live
path (link already cascaded) the `.neq` is a harmless no-op and the result is
byte-identical to the old code; in the dry run it is what makes the projection
true. A test (`dry then live, one seed`) pins that the two paths agree.

##### `authUserIsUnreferenced` grew one optional argument

`authUserIsUnreferenced(authUserId, { ignoreVenueOwnerId? })`. The old live path
deleted the `venue_owners` row *before* calling this function, specifically so the
seven-table scan would not find the owner's own row and always answer "still
referenced." The classifier runs **before** any delete, so it passes
`{ ignoreVenueOwnerId: ownerId }` and the scan adds `.neq("id", ownerId)` to the
`venue_owners` check only. Job 2 (`reconcileOrphanedAuthUsers`) does **not** pass
options — it has no owner-deletion context — and still gets the full check. The
exported signature is backward-compatible (second arg defaults to `{}`).

##### Tests — `tests/api.cron.signup-sweep.test.ts`

- **Harness widening** (necessary, not convenient): the mock builder's op list
  and `applyFilters` both gained `neq`. Without it `classifyOwnerForSweep`'s
  `.neq("venue_id", …)` and `authUserIsUnreferenced`'s `.neq("id", …)` are
  silently ignored by the stub and the new assertions pass for the wrong reason.
- **New `describe("dry-run fidelity (Finding #8)")`, 6 cases:** projects owner +
  auth-user deletion while deleting nothing; projects an owner KEPT (another
  venue); projects an owner KEPT (own subscription); projects owner-deleted /
  auth-user-KEPT when the auth row is shared with a `users` row; `dry then live,
  one seed` asserts the projected split `===` the actual split; and a fail-closed
  `auth-guard-failed` surfaces in the dry run's `errors` too.
- Every pre-existing case in the file passes **untouched** (41 total, was 35).

##### Deliberately NOT done

No `CLAUDE.md` / `SYSTEM_CONTEXT.md` edits (Phase 7). No `vercel.json` change. The
`/api/cron/signup-sweep` stale comment at lines 37-39 is **still there** — Phase 7
owns it. Nothing committed.

##### Handoff to whoever does Phase 7

**Phase 7 is next and is the last one before Phase 8's re-verify-and-flip.** It is
pure docs + stale comments; nothing in Phases 1–6 blocks it.

1. **Finding #8 is now shipped code — Phase 7 should NOT add a new CLAUDE.md rule
   for it** (the plan's Phase 7 §"CLAUDE.md — Partner Self-Serve Signup section"
   list does not include one, correctly — #8 is a dry-run-fidelity fix, not a
   standing invariant). If you mention it anywhere, present tense, and name
   `classifyOwnerForSweep` / `deleteOwner` as the split and
   `OwnerSweepPlan` as the shape the dry run reports.
2. **The `/api/cron/signup-sweep/route.ts:37-39` stale comment is UNTOUCHED and is
   Phase 7's Finding #15 fix.** It still says "CRON REGISTRATION IS ANDREW'S" and
   tells the reader to add a `vercel.json` entry that already exists (added
   2026-09-07 per the plan's §"On Finding #15 specifically"). Replace it with a
   note that the entry is live, and record the authorization in `CLAUDE.md` so the
   next review does not re-flag it.
3. **All the present-tense-CLAUDE.md handoff items from Phases 1–5 are still
   undone** and are Phase 7's whole job — they are listed in each prior phase's
   handoff and consolidated in the plan's Phase 7 body. Nothing new was added to
   that list by Phase 6.
4. **`tests/self-serve-signup-contract.test.ts` and `tests/lib.venue-visibility.test.ts`
   both still pass** — Phase 6 changed neither. The sweep contract block
   (`stripComments(src)` matching `if (!email) continue` and the seven FK-consumer
   table names) is unaffected by the `deleteOwnerIfUnused` → `classifyOwnerForSweep`
   rename because it never referenced that function name.
5. **Nothing is committed.** Phase 6 modified `lib/signupSweep.ts` and
   `tests/api.cron.signup-sweep.test.ts` only — no new files.
6. **§0's STOP:** blocker phases 1–3 are done; the flag still must not be flipped
   until Phase 8's ops sequence (`GOOGLE_MAPS_BROWSER_KEY` first). Phase 7 is the
   only phase left before Phase 8. Phase 6 did not touch the deploy gate. Phase 6
   also **unblocks `SIGNUP_SWEEP_AUTH_DELETE_ENABLED` from ever being considered** —
   the dry-run evidence Andrew would read before flipping it is now accurate.

---

### Phase 7 — Docs: CLAUDE.md, SYSTEM_CONTEXT.md, stale comments
**Model: Sonnet 5 · Effort: Medium**

Finding **15** plus every standing rule Phases 1–6 established. These are the
rules that stop the next contributor from reintroducing what we just fixed.

#### `CLAUDE.md` — Partner Self-Serve Signup section

Add, as hard rules:

- **An attacker-supplied venue id must pass the SAME eligibility predicate as
  proximity discovery.** One shared `isClaimableVenueRow`, two call sites, never
  two copies. (Phase 1)
- **A venue at `latitude = 0, longitude = 0` is a placeholder or internal room
  and is NEVER claimable, joinable, or revealable.** Both Category Blitz global
  rooms are seeded there.
- **`self_serve_created_at` is a capability grant, not a timestamp.** Writing it
  simultaneously arms `maybeRevealVenue` (publish to every player) and
  `sweepAbandonedSignupVenues` (delete in 7 days). Never stamp a row this flow
  did not create; guard on the stamp itself, never on `hidden`.
- **`/api/signup/maps-key` fails closed.** It serves `GOOGLE_MAPS_BROWSER_KEY`
  or 503s — it must never fall back to the unrestricted server key. Only
  `/api/admin/maps-key` keeps the fallback. (Phase 2)
- **`serverGoogleMapsKey()` is the only server-side reader of
  `GOOGLE_MAPS_API_KEY`.** (Phase 5)
- **The signup rate limiter is atomic in Postgres** (`claim_signup_attempt` RPC,
  advisory-lock guarded, same pattern as `award_cycle_winner`). Never
  re-implement the quota check as a TypeScript read-then-write. (Phase 2)
- **Public `/api/signup/*` routes return generic errors.** Upstream Google/config
  text goes to the log, never the response body. (Phase 2)
- **Record the `vercel.json` cron authorization**: the `/api/cron/signup-sweep`
  entry was added 2026-09-07 on Andrew's explicit instruction, so the hard
  boundary was satisfied. Note it so the next review does not re-flag it, and
  restate that the boundary otherwise stands.

#### `CLAUDE.md` — new "Venue Visibility" section (Phases 3 + 9)

- `venues.hidden` is read in exactly **one** place, `listVenues()` in
  `lib/venues.ts`. Hiding is **soft**: it removes a venue from the join list;
  already-joined players, direct URLs, the owner dashboard and the TV screen are
  unaffected. Do not harden this without a separate decision.
- **`lib/venueVisibility.ts` is the single home** of `shouldRevealVenue` /
  `shouldRehideVenue` / `shouldRestoreVenue`, all built on `classifyBillingRow()`.
  Never re-derive live/not-live.
- **Never compute `current_period_end < now` in a visibility path.** Stripe's
  status already encodes cancel-at-period-end and dunning.
- **Never delete a `billing_subscriptions` row on cancellation.** It is the only
  clause keeping the signup sweep from deleting a re-hidden real venue.
- The webhook follower is best-effort by design; **`/api/cron/billing` is the
  repair path.** A visibility bug is fixed in the reconciler, never by making the
  follower throw.

#### `SYSTEM_CONTEXT.md`

- §0: self-serve signup status — built, reviewed, fixed, and what gates the flag.
- New **venue visibility lifecycle** entry: `hidden = true` at signup →
  revealed by the webhook on first paid sync → repaired by the daily reconciler
  if that missed → (Phase 9) re-hidden at period end when billing goes not-live →
  restored on resubscribe.
- Partner/Owner surface: note `/api/cron/billing` now owns venue-visibility
  reconciliation in addition to offline-grant expiry.

#### Stale comments to correct

- `app/api/cron/signup-sweep/route.ts:37-39` — registration is done; say so.
- `app/api/owner/signup/route.ts` claim-branch comment — now true after Phase 1.
- `lib/googleMapsKeys.ts` — its doc block describes call sites that only exist
  after Phase 5.
- `docs/self-serve-signup-runbook.md` §2 — the "don't flip the flag first" note
  is now backed by code; say that, and keep the ops step.

**Verify:** `npm run test` (the contract tests assert several of these rules),
`npm run lint`.

#### Phase 7 — AS BUILT (2026-09-08, Sonnet 5) ✅

**Status: complete.** `npm run lint` clean, `npm run test` 2243 passed / 231
files + 13 skipped + 1 skipped file (unchanged from Phase 6's baseline — Phase 7
touched one code comment and three docs, no test-affecting code). `npx tsc
--noEmit` not re-run: the only non-doc change is a JSDoc block. Nothing committed.

##### `CLAUDE.md` — "Partner Self-Serve Signup" section

Seven new hard-rule bullets, all present-tense (they describe shipped code):

1. **Shared claim predicate.** `lib/venueClaim.ts` named as the one home of
   `isClaimableVenueRow` / `isPlaceholderVenueRow` / `isSelfServeVenueRow` /
   `isAdminHiddenVenueRow` / `claimableDistanceMeters` / `VENUE_CLAIM_COLUMNS`,
   called by both `findNearbyVenue` and the claim branch; `route.ts` must not
   import `calculateDistanceMeters` or hand-list columns. (Phase 1)
2. **`(0,0)` is never claimable / joinable / revealable.** Names
   `isPlaceholderVenueRow` and the webhook's `.or("latitude.neq.0,longitude.neq.0")`
   (with the equator/prime-meridian rationale for why it is not two `.neq`s).
   (Phases 1 + 3)
3. **`self_serve_created_at` is a capability grant, not a timestamp** — arms both
   `maybeRevealVenue` and `sweepAbandonedSignupVenues`; guard on the stamp
   (`isSelfServeVenueRow`), never `hidden`; `isAdminHiddenVenueRow` refuses an
   admin-hidden row outright on both branches. (Phase 1)
4. **`/api/signup/maps-key` fails closed** — `publicBrowserGoogleMapsKey()` or
   503 + `[SignupMapsKey] browser-key-unset`; only `/api/admin/maps-key` keeps
   the `browserGoogleMapsKey()` fallback. (Phase 2)
5. **The existing "Two Google Maps keys" bullet was rewritten** to name all three
   accessors, mark the fallback authenticated-only, name
   `serverGoogleMapsKey()` as the *only* server-side `GOOGLE_MAPS_API_KEY` reader
   and `lib/venueStaticMap.ts` as the shared Static Maps builder, and to say the
   contract test enforces both. (Phases 2 + 5)
6. **Atomic Postgres rate limiter** — `claim_signup_attempt` RPC, advisory-lock
   guarded, same pattern as `award_cycle_winner`; `lib/rateLimit.ts` is one
   `.rpc()` call, fails closed including on a missing function
   (`[SignupRateLimit] claim_signup_attempt-missing`); never re-implement as a TS
   read-then-write. (Phase 2)
7. **Public `/api/signup/*` routes return generic errors** — upstream text to the
   log, never the body. (Phase 2)

Plus an **8th bullet recording the `vercel.json` cron authorization**
(`{ "path": "/api/cron/signup-sweep", "schedule": "0 8 * * *" }`, added
2026-09-07 on Andrew's instruction), so the next reviewer does not re-flag
Finding #15, with the "boundary otherwise still stands" restatement. (Finding #15)

##### `CLAUDE.md` — new "Venue Visibility" section

Inserted between the `auth.users` section and "Architecture & Database Patterns".
Six bullets: `hidden` is soft (join-list exclusion, `listVenues()` only, do not
harden without a separate decision); `lib/venueVisibility.ts` is the one home of
the three predicates, all on `classifyBillingRow()`; never compute
`current_period_end < now` in a visibility path; never delete a
`billing_subscriptions` row on cancellation; the webhook follower is best-effort
and `/api/cron/billing` (`repairMissedVenueReveals`) is the repair path — **a
visibility bug is fixed in the reconciler, never by making the follower throw**;
and re-hide/restore (`VENUE_REHIDE_ENABLED`, `venues.rehidden_at`) are Phase 9,
not wired yet, and whatever un-hides must clear `rehidden_at`. (Phases 3 + 9)

##### `SYSTEM_CONTEXT.md`

- **§0** self-serve signup bullet: appended a "Status (2026-09-08)" sentence —
  built, `/code-review`'d, all 15 findings fixed across Phases 1–7, flag not yet
  flipped, Phase 8's ops sequence is what gates it.
- **§9 Partner/Owner surface, Billing bullet:** "whose only job that is" was
  false — `/api/cron/billing` now has two jobs. Rewrote to name the
  venue-visibility reconciliation job (`repairMissedVenueReveals`,
  `lib/venueVisibilitySync.ts`), `?dryRun=1`, and "a reconciler fault never fails
  the cron", cross-referencing §12 and CLAUDE.md.
- **§12 Known Constraints:** new "Venue visibility contract" block (before the
  Navigation contract) — the full `hidden = true` → webhook reveal → cron repair
  → (Phase 9) re-hide/restore lifecycle, plus the soft-hide, one-home,
  no-`current_period_end`, no-row-delete, fix-in-reconciler and `(0,0)` rules in
  brief.

##### Stale comments

- **`app/api/cron/signup-sweep/route.ts:37-41`** — the "CRON REGISTRATION IS
  ANDREW'S / the entry to add: …" block (which told the reader to add a
  `vercel.json` entry that has existed since 2026-09-07) is replaced with "CRON
  IS REGISTERED", the live entry quoted, the 2026-09-07 authorization noted, and
  "the boundary otherwise still stands". **This is the only code change in Phase 7.**
- **`app/api/owner/signup/route.ts` claim-branch comment** (lines ~334-346) —
  re-read; **Phase 1 already made it accurate** ("It now calls the same predicate
  the scan does and cannot drift again"). No change.
- **`lib/googleMapsKeys.ts` doc block** — re-read; **already accurate** after
  Phase 5 (it names `lib/geolocation.ts`, the `venue-map` routes and
  `/api/admin/places` as the server-key callers, and the
  `publicBrowserGoogleMapsKey()` / 503 split). No change.
- **`docs/self-serve-signup-runbook.md` §2** — re-read; **Phase 2 already
  rewrote it** ("Since review-fix Phase 2 the failure mode of skipping this is
  visible, not silent … enforced in code rather than by this document"). The ops
  step is intact. No change.

So three of the four "stale comments to correct" were already corrected by the
phases that made them stale — only the signup-sweep block was still wrong.

##### Deliberately NOT done

- No CLAUDE.md rule for Finding #8 (Phase 6's handoff item 1 — it is a dry-run
  fidelity fix, not a standing invariant; the plan's Phase 7 list correctly omits
  it). Not mentioned anywhere in the docs.
- No commit.

##### Handoff to whoever does Phase 8

**Phase 8 is next — re-verify the whole branch and run the ops sequence to flip
`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`.** It is the last phase before the flag
is live; Phase 9 (lapsed-venue re-hide) is deliberately after the flip.

1. **The entire self-serve branch is still uncommitted on `main`** (plan §0).
   Phases 1–7 collectively added these untracked files —
   `lib/venueClaim.ts`, `lib/venueVisibility.ts`, `lib/venueVisibilitySync.ts`,
   `lib/venueStaticMap.ts`,
   `supabase/migrations/20260908120000_signup_attempt_atomic_rate_limit.sql`,
   `supabase/migrations/20260908130000_venues_rehidden_at.sql`,
   `tests/api.owner.signup.claim-guard.test.ts`,
   `tests/api.cron.billing.reveal.test.ts`,
   `tests/lib.venue-visibility.test.ts`,
   `tests/components.signup-wizard-errors.test.ts` — plus the pre-existing
   untracked signup files from the original build. Phase 7 additionally modified
   `CLAUDE.md`, `SYSTEM_CONTEXT.md`,
   `app/api/cron/signup-sweep/route.ts`, and this plan file. `git status` before
   you do anything.
2. **Both migrations are LIVE on production** (`20260908120000` pushed + probed
   before Phase 3; `20260908130000` pushed + verified before Phase 4). Nothing
   left to `supabase db push` for Phases 1–7. Phase 9 builds on
   `venues.rehidden_at` but does not need to push it.
3. **`GOOGLE_MAPS_BROWSER_KEY` is still unset in Vercel + `.env`.** Per
   `docs/self-serve-signup-runbook.md` §2, the browser key is already **created**
   in Google Cloud (`hightop-maps-browser`, uid
   `ed2e8331-c7dd-4608-aed3-85383d0ae56f`, referrer-restricted, Maps JS only) and
   Maps Static API is enabled — the one remaining action is to set the env var
   (Production + Preview + local) and redeploy. Until then `/api/signup/maps-key`
   503s by design.
4. **Two hand-checks the signup test suite cannot cover** (Risk #4): after the
   browser key is set, verify (a) the **admin** venue map + address autocomplete
   at `/admin` → Venues → Activate a Venue, and (b) the **player join-flow**
   address lookup (`lib/geolocation.ts` now reads its key via
   `serverGoogleMapsKey()` — behaviourally identical, `""` vs `undefined`, but
   invisible to the tests).
5. **Re-run `/code-review`** on the branch (plan Phase 8) — 15 findings across
   this boundary means the review is worth repeating, not assumed clean.
6. **Full gate before the flip:** `npm run test`, `npm run test:god-mode-join`,
   `npm run test:venue-fk-guard`, `npm run test:pwa-contract`, `npx tsc
   --noEmit`, `npm run lint`, `npm run build`. Phase 7 left the suite at
   **2243 passed / 231 files + 13 skipped**, lint clean.
7. **The lone unreproducible suite failure** (Phase 3 handoff #10, Phase 4
   handoff #5 — `tests/lib.sportsBingo.mlb-star-tilt.test.ts`, an unseeded
   Monte-Carlo test, ~0.05 margin) did **not** recur in Phase 7's run. Still
   treat a lone failure in Phase 8 as pre-existing noise; capture the test name
   if you see one.
8. **After the flip, close `docs/self-serve-signup-device-checklist.md` on a real
   phone** (Andrew) — §3 (iOS autofocus) is the item most likely to find
   something. Then Phase 9.

---

### Phase 8 — Re-verify and flip
**Model: Sonnet 5 · Effort: Medium**

- Full suite: `npm run test`, `npm run test:god-mode-join`,
  `npm run test:venue-fk-guard`, `npm run test:pwa-contract`,
  `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **Re-run `/code-review`** on the fixed branch. Fifteen findings across a
  boundary this exposed means the review is worth repeating, not assumed clean.
- Then, and only then, the ops sequence from the runbook: set
  `GOOGLE_MAPS_BROWSER_KEY` → verify the admin venue map and player join-flow
  address lookup still work → confirm the flag → **redeploy** → smoke tests §6.
- Andrew closes `docs/self-serve-signup-device-checklist.md` on a real phone.
  §3 (iOS autofocus) remains the item most likely to find something.

#### Phase 8 — AS BUILT (2026-09-08, Sonnet 5) — CODE HALF DONE, OPS HALF IS ANDREW'S

**Status: the code gate is green and the re-review is done. The flag is NOT
flipped** — every remaining step (Vercel env var, redeploy, real-phone
checklist) is Andrew's, not a phase task. Nothing committed.

##### The full verification gate — all green (2026-09-08)

| Gate | Result |
| --- | --- |
| `npm run test` | **2244** passed / 231 files + 13 skipped (was 2243; +1 from the new contract test below) |
| `npm run test:god-mode-join` | 34 passed |
| `npm run test:venue-fk-guard` | 2 passed |
| `npm run test:pwa-contract` | 20 passed |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | compiles; `/owner/signup` route present in the manifest |

**No flake this run.** `tests/lib.sportsBingo.mlb-star-tilt.test.ts` (the lone
unreproducible Monte-Carlo failure from Phase 3 handoff #10 / Phase 4 handoff #5)
passed. Treat any lone failure you see as that same pre-existing noise; capture
the test name before re-running.

##### Re-run of `/code-review` (high effort) — 3 low-severity findings, all fixed

The reviewer verified the security-sensitive paths (claim eligibility in
`lib/venueClaim.ts`, the atomic rate limiter, `maybeRevealVenue`'s stamp/`(0,0)`
guards, the webhook first-sync gate, the sweep's seven-table FK guard,
admin-caller compatibility for the widened radius/address helpers) and found them
**sound**. Three lower-severity issues survived, and I fixed all three in this
phase — small, non-security, and each one an instance of the plan's §2
"rule in two places" root cause:

1. **Password trim mismatch → review-footer dead-end** (`lib/selfServeSignup.ts`).
   The client gated the password step on `draft.password.length` (raw) while the
   server persists `text(body.password)` (trimmed, matching
   `/api/owner/auth/login`). A password of `"1234567 "` (7 + trailing space)
   passed the client, failed the server with "Use at least 8 characters", and
   that 400 landed on the review-screen footer four steps from the field with no
   route-back (only `email_taken` is routed to its step, per Phase 4). **Fix:**
   `signupStepIssue`'s `case "password"` now validates `draft.password.trim()`
   for both the min-length and the `signupFieldTooLong` check. One place —
   `validateSignupDraft` loops the same `signupStepIssue`, so client step-gating
   and server validation both move together. Comment records why.
2. **`.env.example` omitted the four feature flags** — the rollout-safety story
   itself. Added a "Partner self-serve signup" block after `GOOGLE_MAPS_BROWSER_KEY`
   documenting `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` (build-time inline → set
   then redeploy; do not flip before the browser key is deployed),
   `VENUE_REHIDE_ENABLED` (server-side, Phase 9), and
   `SIGNUP_SWEEP_DELETE_ENABLED` / `SIGNUP_SWEEP_AUTH_DELETE_ENABLED` (both
   absent, sweep ships log-only). Exact reader names verified against
   `lib/selfServeSignup.ts`, `lib/venueVisibility.ts`, `lib/signupSweep.ts`.
3. **`maxLength={200}` hardcoded in `AddressStep`** vs `MAX_QUERY_LENGTH = 200`
   in `/api/signup/places` — drift risk on the one signup input that had no
   named cap. **Fix:** new `SIGNUP_PLACES_QUERY_MAX_LENGTH` exported from
   `lib/selfServeSignup.ts` (deliberately not in `SIGNUP_FIELD_LIMITS` — it is
   the autocomplete search box, not a persisted `SignupDraft` field), referenced
   by both the `<input maxLength>` and the route's `.slice()`.

##### Tests touched

- `tests/self-serve-signup-contract.test.ts` — the
  `"signup step components carry no bare-numeric maxLength except AddressStep's
  Places box"` case pinned AddressStep to **exactly one** literal `maxLength`.
  My fix removed that last literal, so the case is rewritten to
  `"...carry no bare-numeric maxLength"` (every step file must now be `[]`), and
  a **new** case `"AddressStep's Places box and the /api/signup/places route
  share one length cap"` asserts both reference `SIGNUP_PLACES_QUERY_MAX_LENGTH`
  and that it is defined only in `lib/selfServeSignup.ts`. Net +1 test.
- No new behavioural test for the password trim fix — `signupStepIssue` /
  `validateSignupDraft` are already exhaustively covered by
  `tests/lib.signup-draft.test.ts` and the trim change is exercised through
  them; all 11 pass untouched.

##### Files changed in Phase 8

Modified: `lib/selfServeSignup.ts`, `app/api/signup/places/route.ts`,
`components/signup/steps/AddressStep.tsx`, `.env.example`,
`tests/self-serve-signup-contract.test.ts`, and this plan file. **Nothing
committed.**

##### Deliberately NOT done

- **No `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` flip, no redeploy, no Vercel env
  change** — I cannot set Vercel env vars or redeploy, and per the runbook this
  is Andrew's ops sequence. See the handoff.
- No commit of the branch (plan §0 — the whole self-serve branch is still
  uncommitted on `main`).
- No `CLAUDE.md` / `SYSTEM_CONTEXT.md` edits — Phase 7 already did those and none
  of the three findings established a new standing rule (they are drift fixes;
  the contract test now enforces #3).

#### Phase 8a — Step-2 email pre-check (2026-09-08, Opus 5) ✅

Added after device testing on Andrew's phone. Two console errors were reported;
**neither was a wizard bug**, but the second exposed a real UX defect.

1. **`RefererNotAllowedMapError` + `IntersectionObserver.observe` at
   `VenueMapPicker.tsx:180`** — reproduced by driving the wizard headlessly
   against `http://192.168.1.41:3000` (the LAN dev server) and NOT against
   `localhost:3000`. The `hightop-maps-browser` key's referrer allowlist has
   `http://localhost:3000/*` but no LAN IP, so Maps JS auth fails; the
   `IntersectionObserver` error is thrown *inside* Google's own code after that
   failure, with `new gmaps.Map(...)` merely the call site. **No code change** —
   it is a Google Cloud key-restriction matter, and signup still gets working
   coordinates because address autocomplete and the static-map preview both go
   through server-side routes (`serverGoogleMapsKey()`, no referrer sent).
2. **"The wizard goes back to the beginning and never reaches Stripe."**
   Reproduced: `andrewserulneck@gmail.com` already has a `venue_owners` row
   (2026-07-14), so the review-step submit returned `409 email_taken` and Phase
   4's Finding #11 fix routed the wizard to the email step — **step 2 of 6**,
   which reads as a reset rather than as an answer. Production confirmed the
   diagnosis: **zero** self-serve venues existed, so every attempt died there.

**The fix — catch it at step 2 instead of step 6.**

| Added | What |
| --- | --- |
| `lib/ownerEmailAvailability.ts` | `ownerEmailExists()` + `OWNER_EMAIL_TAKEN_MESSAGE`. The ONE home of the question; both callers use it. Returns a discriminated result so a lookup failure can never collapse into "available". |
| `POST /api/signup/email-available` | Flag-gated → rate-limited → lookup, in that order. Generic errors only (Finding #7). |
| `emailCheck` rate-limit bucket | `{ windowSeconds: 3600, max: 15 }` — an hour-long window because this route is an enumeration oracle, sized against list-walking, not burst traffic. |

`SignupWizard.advance()` now awaits the pre-check on the email step and
**refuses to increment the index** on a definite `available: false`; `EmailStep`
renders the message on the field plus a real **"Sign in to your account"** link
(self-serve is one venue per email, so "try again" is not an answer). The
message dropped its raw `/owner/login` path in favour of that link.

**The pre-check fails open by design** (404/503/429/network → advance), because
`POST /api/owner/signup` re-runs the same lookup and stays the authority. Pinned
by five tests. The submit route was rewired onto the shared module, so the 409
branch and the pre-check can never phrase or answer it differently.

**Gate:** `npm run test` **2268** passed / 232 files + 13 skipped (was 2244),
`npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` compiles with
`/api/signup/email-available` in the route manifest. Browser-verified against
the dev server: taken email → stays on step 2 with a visible `role="alert"` and
the sign-in link; corrected email → advances to step 3; fresh email → full run
through to `/owner/billing/setup` showing "Subscribe — $100/mo".

**Tests:** `tests/api.signup.email-available.test.ts` (new, 12 cases — flag-off,
bucket identity, normalisation, the 400s, and the two "must not report
available" failure paths); `tests/components.signup-wizard-errors.test.ts` (3 →
10 cases, and its `fetch` stub is now URL-aware so the pre-check cannot consume
the signup mock's sequencing); four new tripwires in
`tests/self-serve-signup-contract.test.ts` (one lookup module, both callers
through it, one message definition, flag-before-limiter-before-lookup).
`app/api/owner/account/email/route.ts` is **allow-listed** in the one-home
tripwire: it asks a different question (`.neq("id", owner.id)`, behind
`requireOwnerAuth`) and folding it in would put an authenticated
account-settings path on the signup critical path.

**Also added:** `scripts/cleanup-signup-probe-rows.cjs` — deletes throwaway
end-to-end probe rows, scoped to `self_serve_created_at`-stamped venues named
`Probe Venue*` with `probe-<digits>@example.com` owners, with the CLAUDE.md
player-table guard (`accounts.auth_id` / `users.auth_id`) before any
`auth.users` delete, and a `--dry-run`. Used to return production to **zero**
self-serve venues after this phase's probes. `CLAUDE.md`'s self-serve section
gained four bullets covering the above.

##### Handoff — the OPS SEQUENCE that flips the flag (Andrew, then Phase 9)

The code is done and re-reviewed. What remains before the wizard is live, in
order, from `docs/self-serve-signup-runbook.md`:

1. **Commit the branch.** It is still entirely uncommitted on `main` (plan §0).
   `git status` first. Everything Phases 1–8 produced is listed in Phase 7's
   handoff #1 plus Phase 8's file list above. This should land as a reviewed
   commit/PR before the env change, so the deploy that carries the flag also
   carries the fixes.
2. **Set `GOOGLE_MAPS_BROWSER_KEY`** in Vercel (Production + Preview) and local
   `.env`. The key already exists in Google Cloud — `hightop-maps-browser`, uid
   `ed2e8331-c7dd-4608-aed3-85383d0ae56f`, HTTP-referrer-restricted, Maps JS API
   only; Maps Static API is enabled on the project (runbook §2). Until it is set,
   `/api/signup/maps-key` returns 503 by design and the wizard's map steps show
   "Address maps are temporarily unavailable".
3. **Deploy** (with the key set, flag still off) and hand-verify the two paths
   the signup test suite cannot see (Risk #4):
   - **Admin** venue map + address autocomplete: `/admin` → Venues → Activate a
     Venue. `browserGoogleMapsKey()` now falls back to `GOOGLE_MAPS_API_KEY` only
     on this route.
   - **Player join-flow** address lookup: the join flow's "search your address"
     box. `lib/geolocation.ts` now reads its key via `serverGoogleMapsKey()` —
     behaviourally identical (`""` vs `undefined`, both falsy) but invisible to
     the tests (Phase 5 handoff #7).
4. **Set `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1`** in Vercel and **redeploy**
   (it is `NEXT_PUBLIC_*`, inlined at build time — the env change alone does
   nothing until the redeploy). A mid-rollout skew shows as a live wizard whose
   submit 404s.
5. **Smoke test** the wizard end-to-end on the deployed site (runbook §6): name →
   email → password → address → geofence → review → Stripe Checkout; confirm the
   `venues` row is created `hidden = true` with `self_serve_created_at` stamped,
   and that the Stripe webhook unhides it on first paid activation.
6. **Andrew closes `docs/self-serve-signup-device-checklist.md` on a real phone.**
   §3 (iOS autofocus) is the item most likely to surface something. Headless
   browsers cannot verify this surface.
7. **Reversal is one flag:** unset `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` and
   redeploy → `/owner/register` returns to its venue-lookup flow, `/owner/signup`
   and `/api/signup/*` 404. The browser key and both migrations are inert when
   the flag is off.

Then **Phase 9** (lapsed-venue re-hide) — deliberately after the flip, since
nobody can lapse until someone subscribes and reaches a paid-period end.
`venues.rehidden_at` is live (pushed before Phase 4); `VENUE_REHIDE_ENABLED` is
now documented in `.env.example`; Phase 3's handoff items #2–#5 for Phase 9 still
stand verbatim.

---

### Phase 9 — Lapsed venue re-hide
**Model: Opus 5 (webhook) + Sonnet 5 (rest) · Effort: Medium**

`docs/lapsed-venue-rehide-plan.md`, Phases 2–5, minus what Phase 3 already built.
Deliberately **after** the flag flip: nobody can lapse until somebody subscribes
and reaches the end of a paid period, so there is a month of runway.

- Phase 2 of that plan — `maybeRehideVenue` webhook follower (**Opus 5**).
  **✅ DONE 2026-09-08.** Full as-built notes and the handoff for the remaining
  phases are in `docs/lapsed-venue-rehide-plan.md` §4 Phase 2. Read that handoff
  before starting: item #1 is a live bug this phase deliberately left in
  `lib/venueVisibilitySync.ts` (the cron reveal job still does not clear
  `rehidden_at`, which only became wrong once the webhook started stamping it).
- Phase 3 — the re-hide/restore/report jobs in the reconciler Phase 3 here
  already created (**Sonnet 5**). **✅ DONE 2026-09-08.** `reconcileLapsedVenues`
  in `lib/venueVisibilitySync.ts`, wired into `/api/cron/billing` as the sibling
  key `venueRehide`, flag-gated + log-only. As-built + handoff:
  `docs/lapsed-venue-rehide-plan.md` §4 Phase 3.
- Phase 5 — tripwires. **✅ DONE 2026-09-08** alongside Phase 3:
  `tests/venue-rehide-contract.test.ts` (the sweep-interaction guard that is Risk
  #1, plus nine others MOVED from two other files). Runbook §8 cutover edits
  done. The manual Stripe-test-mode end-to-end is Andrew's.
- Phase 4 — admin badge + manual override (**Sonnet 5**). **✅ DONE 2026-09-08.**
  Shipped as the "Hidden venues" panel at the bottom of the admin Venues section
  (`HiddenVenuesPanel`, `listHiddenVenues` / `restoreLapsedVenue` in `lib/admin.ts`,
  `GET ?resource=hidden-venues` + `POST resource=venue-visibility`). Lapsed rows
  get a billing-agnostic **Restore (unhide)** that clears `rehidden_at`; the guard
  refuses anything that is not a genuine lapsed row. As-built:
  `docs/lapsed-venue-rehide-plan.md` §4 Phase 4. Mobile panel is a follow-up.

Its Phases 0–1 are **done** by Phase 3 here; do not redo them. **All that remains
before flipping `VENUE_REHIDE_ENABLED` is Andrew's ops sequence** (dry-run week →
flag → manual Stripe-test-mode e2e).

---

## 4. Model / effort summary

| Phase | What | Model | Effort | Blocks flag flip |
| --- | --- | --- | --- | --- |
| 1 · Claim-path vulnerability | Findings 1, 2 | **Opus 5** | Medium-High | **Yes** — ✅ done 2026-09-08 |
| 2 · Public surface hardening | Findings 5, 6, 7, 12 | **Opus 5** | High | **Yes** — ✅ done 2026-09-08 |
| 3 · Reveal reliability | Finding 3 | **Opus 5** | Medium | **Yes** — ✅ done 2026-09-08 |
| 4 · Signup UX correctness | Findings 4, 11 | Sonnet 5 | Medium | Strongly advised — ✅ done 2026-09-08 |
| 5 · Delete the second copy | Findings 9, 10, 13, 14 | Sonnet 5 | Medium | No — ✅ done 2026-09-08 |
| 6 · Sweep dry-run fidelity | Finding 8 | Sonnet 5 | Low-Medium | No — ✅ done 2026-09-08 (was blocking sweep flags) |
| 7 · Docs + stale comments | Finding 15 + all rules | Sonnet 5 | Medium | No — ✅ done 2026-09-08 |
| 8 · Re-verify and flip | — | Sonnet 5 | Medium | — · code half ✅ done 2026-09-08 (gate green, `/code-review` re-run, 3 low findings fixed); ops half (env var + redeploy + real-phone) is Andrew's |
| 9 · Lapsed venue re-hide | Re-hide plan Ph. 2–5 | **Opus 5** + Sonnet 5 | Medium | After · Ph. 2–5 ✅ done 2026-09-08 (webhook, reconciler, admin panel, tripwires); only Andrew's ops sequence — dry-run week → flag → manual e2e — remains |

Opus for the three phases where a mistake is an anonymous privilege escalation, a
public money-spending boundary, or the billing webhook — the same rule the
original plan used. Sonnet for the mechanical ones.

**Phases 1, 2 and 3 are independent of each other** and can be done in any order
or in parallel. Phases 4–7 depend on nothing but should follow. Phase 8 gates on
1–7; Phase 9 gates on 8.

## 5. Risks

1. **Deploying before Phases 1–3.** The single largest risk in this document.
   Four findings become live the moment the wizard is reachable.
2. **Fixing #3 by making the follower throw.** It would make Stripe retry billing
   sync over a cosmetic failure. The repair belongs in the reconciler.
3. **Phase 2's RPC migration.** New Postgres function on the public signup path;
   it must fail closed exactly as the TypeScript limiter does, including when the
   function is missing (mid-deploy skew). Test the missing-function branch.
4. **Phase 5 touching four Google call sites at once**, including the player
   join-flow address lookup (`lib/geolocation.ts`). That path is not part of
   signup and must be re-verified by hand — a regression there is invisible to
   the signup tests.
5. **Phase 1 tightening the claim path too far.** Refusing hidden non-self-serve
   venues outright is recommended, but confirm it does not break a legitimate ops
   flow before shipping.
