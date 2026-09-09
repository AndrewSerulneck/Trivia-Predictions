# Abandoned Self-Serve Signups — Cleanup & Retry Plan

**Written:** 2026-09-09. Revised same day after Andrew's correction (§0.1).
**Follows:** `docs/self-serve-signup-review-fixes-plan.md` (executed 2026-09-08),
`docs/partner-self-serve-signup-plan.md` (the original build).

**The ask (Andrew, 2026-09-09):**

1. A prospective partner who abandons signup at any point must be able to come
   back and start over from the beginning, with no obstacle.
2. Information submitted during an abandoned signup must not be saved. An
   account exists only once Stripe payment completes.

---

## 0. What is actually happening

Confirmed by querying production 2026-09-09, not inferred:

```
venue_owners   fake@emailaddress.com  "Andrew Serulneck"  created 2026-09-08 19:13:55
auth.users     fake@emailaddress.com                      created 2026-09-08 19:13:55
venues         venue-the-dead-rabbit  "The Dead Rabbit"   hidden=true
               self_serve_created_at  2026-09-08 19:13:55  lat 40.703 lon -74.011
billing_subscriptions  — no row
```

The wizard writes **nothing** through steps 1–5; the draft lives in
`sessionStorage` (`components/signup/signupDraft.ts`). The single write is
`POST /api/owner/signup`, which fires when the partner taps **"Start
subscription"** on the review step. It creates, in this order: an `auth.users`
row → a `venue_owners` row → a `venues` row (hidden, `self_serve_created_at`
stamped) → a `venue_owner_venues` link → an owner session cookie. Then the
client routes to `/owner/billing/setup`, where a **separate tap** opens Stripe
Checkout — and the card is entered on Stripe's page, off our domain entirely.

### 0.1 The correction that shapes this plan

**Tapping "Start subscription" is not creating an account.** It is the last tap
before being handed to a payment page. The partner has entered no card, seen no
confirmation, and been told nothing about a credential being stored. Treating
that tap as account creation is what produces every symptom below, and this plan
treats the moment of account creation as **Stripe payment completing** — nothing
earlier.

Two consequences, and they govern every phase:

- **"An account with this email already exists" must never appear for an unpaid
  signup.** Not after eight days, not after one hour, not after one second. A
  garbage collector cannot deliver this; it is a latency, and any latency at all
  puts that sentence in front of a partner who did nothing wrong. The retry has
  to work at t=0.
- **A pending signup gets no user-visible identity.** It is not something to
  sign into, resume, or recover. It is debris with an email on it.

A note on the record, because it changes what *not* to build: partner password
recovery already exists — `/owner/forgot-password` → `/owner/reset-password`,
linked from `/owner/login`. That does not rescue this flow and is not the fix.
A partner who never entered a card has no reason to believe they hold an account
worth recovering, so a better-surfaced recovery link would be an answer to a
question they will never think to ask. Nothing in this plan builds one.

### 0.2 The three symptoms, and their one cause

| Symptom | Cause |
| --- | --- |
| "An account with this email already exists" | The `venue_owners` row is real, and `ownerEmailExists()` reports it faithfully. The row should not have existed. |
| "Sign in to your account" button | `EmailStep.tsx` renders it whenever `taken` is true. It points at a real login the partner has no reason to trust and no reason to have a password for. |
| Cannot come back and finish | The wizard is a hard dead end. `/owner/login` would technically work, but nothing says so, and saying so would be the wrong fix (§0.1). |

**The existing sweep does not save us.** `sweepAbandonedSignupVenues()` would
collect this row eventually, but `SWEEP_ABANDON_AFTER_DAYS = 7`, the cron runs
daily at 08:00 UTC, and `SIGNUP_SWEEP_DELETE_ENABLED` is unset — so it is
log-only, and even once enabled the worst case is eight days. It was built as a
garbage collector for stale rows, and after this plan that is all it is: data
hygiene, never the mechanism a returning partner depends on.

### 0.3 Two architectures

**A — Payment-first materialization.** Write nothing at submit. Persist the
draft, send the partner to Stripe, let `checkout.session.completed` materialize
the auth user, owner and venue.

Not the primary track, for three reasons worth writing down:

- It requires persisting a **password** before any account exists — a second
  credential store, in a table with none of `auth.users`'s protections. A worse
  security posture than the row it removes.
- `POST /api/owner/billing/checkout` is built on `requireOwnerAuth` + a real
  `venueId`, and every subscription carries `metadata.venueId`, which
  `maybeRevealVenue` and `maybeSendWelcomeEmail` both read. Payment-first means
  neither id exists at Checkout time — a rework of the billing path, not a tweak.
- It moves the failure mode from *harmless* (unpaid debris) to *harmful* (the
  partner is charged, the webhook fails, there is no account and no
  self-service recovery).

**B — Pending-until-paid: no identity, superseded on return, reaped as
hygiene.** Keep the write where it is, but define a **pending signup** precisely,
give it no user-visible identity, and make a returning partner's second attempt
destroy the first **at submit time, synchronously**. Payment remains the only
thing that turns it into an account.

**This plan is B**, and under §0.1's rule the two are indistinguishable to the
partner: they come back, type the same email, and the wizard works. A remains
available as optional Phase 7, and Phases 1–5 are its prerequisites anyway.

### 0.4 The rule that constrains every deletion

`auth.users` is **shared with players** (CLAUDE.md standing prohibition;
`tests/lib.auth-users-fk-guard.test.ts`). "This email has no live subscription,
so delete its auth user" is an account-takeover vector if the predicate is even
slightly loose. Every deletion below runs through one guarded predicate that
includes the existing seven-table `authUserIsUnreferenced` check.

---

## Phase 0 — Unblock the retest today

**Goal:** `fake@emailaddress.com` is usable again within the hour, with no deploy.

- New script `scripts/purge-pending-signup.cjs`, wired as
  `npm run signup:purge-pending -- <email>`.
- **Read-only by default.** Prints the owner row, its linked venues, their
  `hidden` / `self_serve_created_at` / lat-lon, any `billing_subscriptions`
  rows, and the seven-table auth reference check. Deletes only with `--delete`.
- Refuses outright if *any* of these is true: a `billing_subscriptions` row
  exists for the owner or any linked venue (ever — a cancelled subscriber keeps
  its row, so this is a reliable "never paid" test); a linked venue is not
  hidden; a linked venue has no `self_serve_created_at`; a linked venue is at
  `(0, 0)`; the auth user is referenced by any of the six player tables.
- Deletion order matches `unwind()` in `app/api/owner/signup/route.ts`:
  venues → `venue_owners` → auth user.

**Deliverable:** the three production rows above are gone; Andrew can re-run the
wizard with the same email.

| | |
| --- | --- |
| **Model** | **Sonnet 5** |
| **Effort** | Low — ~45 min. Mechanical; the predicate is transcribed from `lib/signupSweep.ts`, which already passed security review. |
| **Risk** | Low, dry-run-first by construction. |

### Phase 0 — AS BUILT (2026-09-09, Sonnet 5)

**Status: code complete + dry-run verified against production. The destructive
`--delete` run against production is left to Andrew (Phase 6 steps 1–2 assign
steps 1–7 to him).**

Shipped:

- `scripts/purge-pending-signup.cjs` — new, ~230 lines. Modelled on
  `scripts/cleanup-signup-probe-rows.cjs` and `scripts/check-orphaned-auth-users.cjs`
  (same `.cjs` + `createClient(URL, SERVICE_ROLE_KEY)` pattern, no TS build).
- `package.json`: `"signup:purge-pending": "node --env-file=.env.local scripts/purge-pending-signup.cjs"`.
  Invoke as `npm run signup:purge-pending -- <email> [--delete]`.
- `npx eslint` clean. Not covered by `tsc` (plain `.cjs`).

Behaviour:

- Positional arg = email; normalised `.trim().toLowerCase()` to match
  `draftFromBody()` in `app/api/owner/signup/route.ts`.
- Read-only unless `--delete`. Always prints: the `venue_owners` row, every linked
  venue with `hidden` / `self_serve_created_at` / lat-lon, all
  `billing_subscriptions` rows for the owner **or** any linked venue (any status),
  and a per-table auth.users reference check against the **six player tables**
  (the seventh consumer, `venue_owners`, is this owner's own row and is
  discounted).
- Refuses (exit 2, no writes) if any of: no linked venue; a linked venue not
  `hidden`; a linked venue with no `self_serve_created_at`; a linked venue at
  `(0,0)`; **any** `billing_subscriptions` row exists; the auth user is
  referenced by any of the six player tables.
- Delete order: `venues` → `venue_owners` → `auth.users`
  (`supabase.auth.admin.deleteUser`), matching `unwind()`. Each failure throws.

Dry-run output against production, 2026-09-09 — matches §0 exactly and touches
nothing else:

```
venue_owners  c69a205f-6a11-4898-bd82-33929edcc30e  Andrew Serulneck
              auth_id f3e4b1c4-c7d5-4fc5-aab8-923f330eed1b  created 2026-09-08T19:13:55Z
venues        venue-the-dead-rabbit (The Dead Rabbit)  hidden=true
              self_serve_created_at 2026-09-08T19:13:55Z  lat 40.7032685 lon -74.0110218
billing_subscriptions  0 rows
six player tables      all clear
=> Predicate PASSED
```

### Handoff notes for Phase 1 (`lib/pendingSignup.ts`)

- **Column names confirmed against production this session:**
  `venue_owners(id, email, name, auth_id, created_at)`,
  `venue_owner_venues(owner_id, venue_id)`,
  `venues(id, name, hidden, self_serve_created_at, latitude, longitude)`,
  `billing_subscriptions(id, status, owner_id, venue_id, stripe_subscription_id)`.
  `billing_subscriptions` has **both** `owner_id` and `venue_id` — Phase 1 clause 3
  must check both, as the Phase 0 script does.
- **Do not port the Phase 0 script's predicate into `lib/pendingSignup.ts` by
  copy.** Phase 1 explicitly requires reusing `isSelfServeVenueRow` /
  `isPlaceholderVenueRow` / `isAdminHiddenVenueRow` from `lib/venueClaim.ts` and
  `authUserIsUnreferenced(authId, { ignoreVenueOwnerId })` from `lib/signupSweep.ts`.
  The `.cjs` script re-implements those inline **only** because it has no TS build —
  that is not licence for the library to do the same.
- The Phase 0 script is a keeper (Phase 6 step 1 runs it), so Phase 1 does **not**
  delete or supersede it. It is the manual escape hatch; `purgePendingSignup()` is
  the programmatic one. They may diverge slightly (the script has no Stripe-cancel
  step — Phase 0 predates needing one because `fake@emailaddress.com` never
  reached Checkout). If you want them unified later, that is a Phase 1+ cleanup,
  not required.
- `authUserIsUnreferenced` already exists and is exported from `lib/signupSweep.ts`
  with the `{ ignoreVenueOwnerId }` option — clause 4 is a direct call, no new code.
- **Stripe-cancel-first (Phase 1's hard part):** `sweepAbandonedIncompleteSubscriptions()`
  lives in `POST /api/owner/billing/checkout` (`app/api/owner/billing/checkout/route.ts`
  — not yet read this session). Extract to `lib/stripeIncomplete.ts`, call from
  both. Cancel before any row delete; a Stripe failure aborts the purge.

---

## Phase 1 — One definition of "pending signup"

**Goal:** the question "is this email an unpaid, never-finished signup?" gets
exactly one home, the way `ownerEmailExists()` and `lib/venueClaim.ts` did.
Every later phase calls it; nothing re-derives it.

New `lib/pendingSignup.ts`:

```ts
export type PendingSignup = {
  ownerId: string;
  authUserId: string | null;
  venueIds: string[];
  createdAt: string;
};

/** null = not pending (no owner row, or an owner we must never touch). */
export async function findPendingSignupByEmail(email: string):
  Promise<{ ok: true; pending: PendingSignup | null } | { ok: false; message: string }>;

/** Teardown. Cancels incomplete Stripe objects, then venues → venue_owners → auth user. */
export async function purgePendingSignup(ownerId: string):
  Promise<{ ok: boolean; deletedVenueIds: string[]; deletedAuthUserId: string | null; errors: string[] }>;
```

The predicate — **every clause load-bearing, none optional**:

1. A `venue_owners` row exists for the normalised email.
2. It has **at least one** linked venue, and **every** linked venue is
   `hidden = true` **and** `self_serve_created_at IS NOT NULL` **and** not at
   `(0, 0)`. Reuse `isSelfServeVenueRow` / `isPlaceholderVenueRow` /
   `isAdminHiddenVenueRow` from `lib/venueClaim.ts` — do not re-derive.
3. **No `billing_subscriptions` row** for the owner or for any linked venue,
   ever. Not "no live subscription" — *no row*. CLAUDE.md: a cancelled
   subscription keeps its row precisely so it can serve as this proof.
4. The auth user is unreferenced by the seven FK consumers, discounting this
   owner's own row — call `authUserIsUnreferenced(authId, { ignoreVenueOwnerId })`
   from `lib/signupSweep.ts`. Do not copy it.
5. Fails **closed**: any read error returns `{ ok: false }`, never "not pending"
   and never "pending".

Anything failing a clause is not pending and is never touched — a partner who
paid once and cancelled, an admin-activated venue, a Category Blitz global room,
an owner holding a second venue.

**`purgePendingSignup` must cancel Stripe first.** A partner can reach Stripe
Checkout, abandon it, and return to the wizard. Stripe holds that `incomplete`
subscription for ~23 h, and it carries `metadata.venueId` for a venue this purge
is about to delete — so if it later completes, the webhook writes a
`billing_subscriptions` row against a venue that no longer exists, and
`maybeRevealVenue` fires on nothing. `POST /api/owner/billing/checkout` already
solves this for its own case in `sweepAbandonedIncompleteSubscriptions()`.
**Extract that helper to `lib/stripeIncomplete.ts` and call it from both** — do
not write a second copy. Cancel before deleting rows; a Stripe failure here
must abort the purge rather than proceed blind.

| | |
| --- | --- |
| **Model** | **Opus 5** |
| **Effort** | Medium-high — ~2.5 h. Small surface, high blast radius: this predicate is the only thing between a public signup form and a player's `auth.users` row, and the Stripe-cancel ordering is easy to get subtly wrong. |
| **Risk** | Where a mistake becomes an account-takeover bug. Pair with Phase 5's tests in the same sitting. |


### Phase 1 — AS BUILT (2026-09-09, Opus 5)

**Status: code complete. Typecheck, lint, `npm run test` (2322 passing) and
`npm run build` all clean. NOTHING IS WIRED YET — `lib/pendingSignup.ts` has no
caller until Phase 2, so this deploy is inert by construction.**

**Tests were NOT written.** The risk box above says to pair Phase 1 with Phase 5's
tests; that was left undone because Phase 5 is separately scoped and modelled. See
"What Phase 2 must not ship without" below — the recommendation is to pull
`tests/lib.pendingSignup.test.ts` forward and land it *with* Phase 2a, not after.

#### Files

- **NEW `lib/stripeIncomplete.ts`** — `sweepAbandonedIncompleteSubscriptions`,
  extracted verbatim from `app/api/owner/billing/checkout/route.ts`. Same Stripe
  calls, same `console.warn` lines, same auto-paging and 1000-item cap.
  - **One deliberate change: the return type.** It was `Promise<void>`; it now
    returns `IncompleteSweepResult = { ok, cancelledSubscriptionIds[], errors[] }`
    because the two callers need OPPOSITE failure policies. Checkout ignores the
    result and proceeds (safety net on top of Stripe's ~23 h expiry — blocking a
    paying partner over a failed sweep call is the worse trade); `purgePendingSignup`
    aborts on `ok: false` and deletes nothing.
  - Hitting the 1000-item paging cap is **not** `ok: false` — it pushes
    `"paging-cap-hit"` and continues. Failing a purge on an account-wide,
    self-expiring population unrelated to this venue would wedge every retry.
- **`app/api/owner/billing/checkout/route.ts`** — the inline helper and the now-unused
  `import type Stripe from "stripe"` are gone; it imports the shared one. The call
  site gained a comment stating the ignore-the-result policy explicitly. No
  behaviour change; `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` and
  the rest stay green.
- **`lib/ownerEmailAvailability.ts`** — gained `findOwnerIdByEmail(email)`;
  `ownerEmailExists` is now a thin reading of it (`ownerId !== null`). Same single
  query, same fail-closed contract, `OWNER_EMAIL_TAKEN_MESSAGE` untouched.
  - **Why:** the contract test asserts `venue_owners` is queried by email in
    exactly ONE module (`tests/self-serve-signup-contract.test.ts`, "venue_owners
    is queried by email in exactly one module", allow-list =
    `app/api/owner/account/email/route.ts` + `lib/ownerEmailAvailability.ts`).
    `findPendingSignupByEmail` needs the owner's primary key, so it had to come
    through this module rather than write its own `.eq("email", …)`. **Do not add
    a third `venue_owners`-by-email query in Phase 2 — extend this one.**
- **NEW `lib/pendingSignup.ts`** — the predicate and the teardown.

#### The API that actually shipped (three exports, not two)

```ts
findPendingSignupByEmail(email: string): Promise<PendingSignupLookup>
findPendingSignupByOwnerId(ownerId: string): Promise<PendingSignupLookup>   // ← added
purgePendingSignup(ownerId: string): Promise<PendingSignupPurge>

type PendingSignupLookup =
  | { ok: true; pending: PendingSignup | null }
  | { ok: false; message: string };
type PendingSignup = { ownerId; authUserId: string | null; venueIds: string[]; createdAt: string };
type PendingSignupPurge = { ok: boolean; deletedVenueIds: string[]; deletedAuthUserId: string | null; errors: string[] };
```

Two deviations from the plan's signature block, both deliberate:

1. **`findPendingSignupByOwnerId` is exported.** The by-email entry point resolves
   the email to an id and delegates to it, so there is still exactly one predicate.
   Phase 3's abandon route reaches its owner through the session cookie, not an
   email, and the plan already requires it to "re-verify against Phase 1's
   predicate" — this is that function. Without it Phase 3 would have had to
   re-derive.
2. **`purgePendingSignup` re-runs the full predicate itself before deleting
   anything.** An owner id is not evidence: a caller can hold a stale one, resolve
   the wrong owner, or (Phase 3) be handed one by a cookie minted before the world
   changed. Four small reads on a cold path removes the whole "purge deleted a real
   account" class of bug. **Callers must NOT treat their own prior lookup as
   permission to skip it** — it is not skippable, and that is on purpose.

#### Predicate, as implemented (`findPendingSignupByOwnerId`)

Cheapest-first, every clause written as a refusal, all four load-bearing:

1. `venue_owners` row by id exists — else `pending: null`.
2. `venue_owner_venues` gives **≥1** linked venue (zero ⇒ not pending,
   `no-linked-venue`; this flow always links one), and **every** linked venue row —
   read once with `VENUE_CLAIM_COLUMNS` via `.in("id", venueIds)` — passes, in this
   order: `!isPlaceholderVenueRow` → `isSelfServeVenueRow` → `hidden === true` →
   `!isAdminHiddenVenueRow`. The last is redundant with the two before it **on
   purpose** (same "must be right on its own" convention the signup route's
   claim-stamp guard uses). A link whose venue row did not come back
   (`rows.length !== venueIds.length`) is `venue-row-missing` ⇒ not pending.
3. **Two** `billing_subscriptions` reads, not one `.or(...)`: `.eq("owner_id", …)`
   and `.in("venue_id", venueIds)`. The table carries both columns and a row can
   exist on either dimension alone (an admin offline grant is written against the
   venue). Any row at all, any status, ever ⇒ not pending.
4. `authUserIsUnreferenced(authUserId, { ignoreVenueOwnerId: ownerId })` from
   `lib/signupSweep.ts` — **called, not copied**. A null `auth_id` skips clause 4
   and yields `authUserId: null` (nothing to delete), matching
   `classifyOwnerForSweep`'s handling of the same case.

Every read error returns `{ ok: false, message }`. **`ok: false` and
`pending: null` are different answers and must never be collapsed by a caller.**

"Not pending, and here is why" is logged (`[PendingSignup] not-pending owner=… reason=…`)
and deliberately **not** returned: the reason must never reach a public route's
response body, or the enumeration oracle grows from "does this email exist" to
"…and what state is that account in".

#### Teardown order (`purgePendingSignup`)

`re-verify → cancel Stripe incompletes (per venue) → delete venues → delete
venue_owners → delete auth user`.

- A Stripe failure aborts with **nothing** deleted.
- `stripe === null` (payments unconfigured) is **not** a failure — nothing could
  have reached Checkout, so it warns and proceeds.
- Any row-delete failure stops immediately and returns `ok: false` with the
  partial `deletedVenueIds`. **A caller must not assume the email is free unless
  `ok === true`.**
- Deleting the venue cascades `venue_owner_venues` (proved by
  `tests/lib.venue-fk-cascade-guard.test.ts`); the owner row is still deleted
  explicitly, same reasoning as `unwind()`.
- Success logs `[PendingSignup] purged owner=… venues=N authUser=deleted|none`.

#### Verified this session

`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test` 236 files /
2322 tests passing (incl. `tests/lib.auth-users-fk-guard.test.ts` and
`tests/self-serve-signup-contract.test.ts`) · `npm run build` clean.
Column shapes re-confirmed against production before writing:
`venue_owners(id, auth_id, created_at)`, `venue_owner_venues(id, owner_id, venue_id)`,
`billing_subscriptions(id, owner_id, venue_id, status)`.

---

### Handoff notes for Phase 2

**Phase 2a — supersede at submit (`app/api/owner/signup/route.ts`).**

- The branch to change is the `existingOwner.exists` block (search
  `code: "email_taken"`, ~line 300). It currently returns
  `fail(OWNER_EMAIL_TAKEN_MESSAGE, 409, { code: "email_taken" })`.
- Shape it as: on `exists`, call `findPendingSignupByEmail(draft.email)`.
  - `ok: false` ⇒ 500 `"Something went wrong. Please try again."` (matches the
    existing `owner-lookup-failed` branch). **Never fall through to a write.**
  - `pending: null` ⇒ the current 409, unchanged. This is the ONLY surviving path
    to `OWNER_EMAIL_TAKEN_MESSAGE`.
  - `pending` ⇒ `purgePendingSignup(pending.ownerId)`; on `ok` log
    `[OwnerSignup] pending-signup-superseded` and **continue** to the duplicate-venue
    scan; on `!ok` return the same generic 500 (the email is still taken, so
    proceeding would hit Supabase's "already registered" and land in the
    `orphan-auth-user` branch, which is exactly the dead end this plan removes).
- **Ordering matters.** The purge deletes the pending venue, so it must run
  BEFORE `findNearbyVenue` — otherwise the partner's own abandoned venue is
  discovered as a duplicate at their own address and they get "We already have
  this venue. Is it yours?" instead of a clean run. The existing comment above the
  email check ("Checked BEFORE the duplicate-venue scan… deliberate") is already
  the right order; keep it and extend the reasoning.
- Two calls (`ownerEmailExists` then `findPendingSignupByEmail`) do the same
  `venue_owners`-by-email read twice. Acceptable on this cold path; if you prefer
  one, fold it into `lib/ownerEmailAvailability.ts` per 2b below rather than
  querying `venue_owners` from the route.

**Phase 2b — the `kind` discriminator.** The plan puts it on
`lib/ownerEmailAvailability.ts`, and `findOwnerIdByEmail` is now there to build it
on. Suggested shape, which also collapses the double read above:

```ts
{ ok: true, exists: false }
{ ok: true, exists: true, kind: "account", ownerId }
{ ok: true, exists: true, kind: "pending", ownerId }
```
implemented as `findOwnerIdByEmail` → `findPendingSignupByOwnerId`. Keep
`ownerEmailExists` as-is for any caller that only wants the boolean, and note the
import direction: `ownerEmailAvailability → pendingSignup` (pendingSignup already
imports `findOwnerIdByEmail` from ownerEmailAvailability, so **putting the
discriminator in ownerEmailAvailability creates an import cycle**). Two ways out,
pick one: put the discriminator function in `lib/pendingSignup.ts` instead (it is
the module that owns the distinction anyway), or have `findPendingSignupByEmail`
take an already-resolved `ownerId`. **Recommended: define it in
`lib/pendingSignup.ts`** and have `/api/signup/email-available` import from there;
`OWNER_EMAIL_TAKEN_MESSAGE` stays in `ownerEmailAvailability.ts`, untouched.

- The contract test asserts `/api/signup/email-available` and `/api/owner/signup`
  **both call `ownerEmailExists(` and import from `@/lib/ownerEmailAvailability`**
  ("both callers go through ownerEmailExists"). If Phase 2b replaces those calls
  with a `kind`-returning function, that assertion must be updated in the same
  commit — do it by tightening it (assert both go through the *same* new function),
  never by deleting it.
- It also pins the order flag → limiter → lookup in that route, by string index of
  `ownerEmailExists(`. Renaming the call there breaks that assertion too.

**Phase 2c — `EmailStep.tsx`.** After 2a+2b a pending signup never reaches the
client, so the "Sign in to your account" link only needs to survive for
`kind: "account"`. Keep `OWNER_EMAIL_TAKEN_MESSAGE` free of a raw `/owner/login`
path (CLAUDE.md).

**What Phase 2 must not ship without.** Phase 1 landed untested. Before 2a goes to
production, pull Phase 5's `tests/lib.pendingSignup.test.ts` forward — at minimum
the never-purge truth table (any `billing_subscriptions` row incl. `cancelled`; a
non-hidden venue; an unstamped/admin-activated venue; a `(0,0)` venue; an auth user
referenced by `accounts` / `users` / either Category Blitz table; an owner holding a
second venue; every read error ⇒ `ok: false`). 2a is a destructive branch in a
public unauthenticated route; it is the one place where a loosened predicate
becomes an account-takeover bug. `tests/api.cron.signup-sweep.test.ts` has a
ready-made chainable PostgREST mock (`makeBuilder` / `applyFilters`) that already
supports `.eq/.neq/.in/.limit/.returns/.maybeSingle` — copy it rather than inventing
a new one; it covers every call `lib/pendingSignup.ts` makes.

**Do not touch in Phase 2:** `scripts/purge-pending-signup.cjs` (Phase 0's manual
escape hatch, still Phase 6 step 1), `lib/signupSweep.ts` (Phase 4 owns it), and
`AUTH_USER_FK_CONSUMERS` / `tests/lib.auth-users-fk-guard.test.ts`.

---

## Phase 2 — Retry always works, at t=0

**Goal:** requirement #1, and §0.1's rule. This is the phase that fixes the
reported problem. Everything after it is hygiene.

**2a — Supersede at submit.** When `POST /api/owner/signup` finds a **pending**
collision on the submitted email, it calls `purgePendingSignup()` and continues
with the new signup. No 409, no branch shown to the partner, no latency —
whether they came back after ten seconds or ten days. Log
`[OwnerSignup] pending-signup-superseded`.

This is mandatory, not an option. The earlier draft of this plan offered an
explicit "Resume / Start over" variant; **it is withdrawn.** Both buttons
presuppose an account the partner does not believe in, which is the same
misconception in a friendlier font.

**2b — The pre-check reports a pending signup as available.**
`POST /api/signup/email-available` returns `{ available: true }` when the
collision is pending, because it is: the submit will supersede it. It returns
`available: false` **only** for a real account — one that has paid, ever paid, or
was admin-activated. `lib/ownerEmailAvailability.ts` gains the discriminator that
makes this decidable:

```ts
{ ok: true, exists: false }
{ ok: true, exists: true, kind: "account" }   // real — blocks
{ ok: true, exists: true, kind: "pending" }   // unpaid — does not block
```

Built on Phase 1's predicate, not on a second copy of it. `OWNER_EMAIL_TAKEN_MESSAGE`
stays the single sentence, and is now reachable **only** for `kind: "account"`.
The fail-open contract on the pre-check is unchanged (CLAUDE.md).

**2c — The nonsense button disappears with its cause.** `EmailStep.tsx`'s
"Sign in to your account" link renders only for `kind: "account"`. After 2a and
2b, a pending signup never reaches the client at all, so the dead-end pairing —
"you have an account" plus a login the partner has no password expectations for —
is structurally unreachable rather than merely rarer.

**2d — `/owner/billing/setup` gets a real dead end.** A partner arriving there
with no venue (a purged row, a superseded session) currently reads "contact
support." Replace with a link back into `/owner/signup` to start again.

| | |
| --- | --- |
| **Model** | **Opus 5** for 2a (a destructive branch in a public, unauthenticated route); **Sonnet 5** for 2b–2d. |
| **Effort** | Medium — ~2.5 h. |
| **Risk** | 2a is the second-highest-risk change after Phase 1. See the trade-off below. |

**The trade-off in 2a, stated plainly.** A stranger who knows a partner's email
can destroy that partner's in-flight pending signup by submitting the wizard with
it. Accepted, because: the destroyed record has no payment, no gameplay, no
player linkage and no user-visible identity — Phase 1's predicate is exactly what
guarantees that; the attacker learns nothing the pre-check oracle does not
already disclose (argued in `lib/ownerEmailAvailability.ts`); it is rate-limited
by the existing `signup_attempts` bucket; and the cost to the victim is retyping
a form they had not finished. The alternative — refusing to supersede — puts the
"account already exists" sentence back in front of every honest returning
partner to protect against a stranger who gains nothing. That is the wrong trade.

---

### Phase 2 — AS BUILT (2026-09-09, Sonnet 5)

**Status: code complete. `npx tsc --noEmit`, `npm run lint`, `npm run test`
(237 files / 2361 passing) and `npm run build` all clean. NOT DEPLOYED. The
whole surface is still behind `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`, off in
production — so this deploy is inert until Phase 6 flips it (Phase 6 step 3
deploys Phases 1–5 together).**

Tests WERE written this time — the Phase 1 handoff's "must not ship without"
list was pulled forward. See "Tests" below.

#### The discriminator (Phase 2b) — where it lives

`classifyEmailForSignup(email)` is a NEW export in **`lib/pendingSignup.ts`**, not
in `lib/ownerEmailAvailability.ts`. The Phase 1 handoff called this out: putting
it in `ownerEmailAvailability.ts` creates an import cycle
(`pendingSignup` already imports `findOwnerIdByEmail` from there). It is built on
the one-home lookup — `findOwnerIdByEmail` → `findPendingSignupByOwnerId` — so
there is still exactly one predicate.

```ts
type SignupEmailClassification =
  | { ok: true; exists: false }
  | { ok: true; exists: true; kind: "account"; ownerId: string }
  | { ok: true; exists: true; kind: "pending"; ownerId: string }
  | { ok: false; message: string };
```

`kind: "account"` is the ONLY value that blocks a signup and the only surviving
path to `OWNER_EMAIL_TAKEN_MESSAGE`. `kind: "pending"` does not block — the
submit supersedes it. Fails closed: any read error is `{ ok: false }`, never a
`kind`. `OWNER_EMAIL_TAKEN_MESSAGE` stays defined in
`lib/ownerEmailAvailability.ts`, untouched.

#### Files changed

- **`lib/pendingSignup.ts`** — added `classifyEmailForSignup` (+ its type). No
  change to `findPendingSignupByOwnerId` / `purgePendingSignup` / the Phase 1
  predicate.
- **`app/api/owner/signup/route.ts`** (2a) — the `existingOwner.exists` block is
  gone. Now: `classifyEmailForSignup(draft.email)` →
  - `!ok` ⇒ 500 `"Something went wrong. Please try again."` (same as the old
    `owner-lookup-failed` branch). Never falls through to a write.
  - `exists && kind === "account"` ⇒ the unchanged 409
    `fail(OWNER_EMAIL_TAKEN_MESSAGE, 409, { code: "email_taken" })`.
  - `exists && kind === "pending"` ⇒ `purgePendingSignup(ownerId)`; on `ok`,
    `console.log("[OwnerSignup] pending-signup-superseded")` and **continue** to
    the duplicate-venue scan; on `!ok`, the same generic 500 (log
    `[OwnerSignup] pending-signup-purge-failed`).
  - Still runs BEFORE `findNearbyVenue` — the purge deletes the pending venue, so
    it must, or the partner's own abandoned venue is rediscovered as a duplicate
    at their own address. The pre-existing "checked BEFORE the duplicate-venue
    scan" comment was extended with this second reason.
  - `ownerEmailExists` import dropped from this route; `OWNER_EMAIL_TAKEN_MESSAGE`
    import kept.
- **`app/api/signup/email-available/route.ts`** (2b) — `ownerEmailExists` →
  `classifyEmailForSignup`. `blocked = result.exists && result.kind === "account"`;
  `available: !blocked`; the `OWNER_EMAIL_TAKEN_MESSAGE` error is attached only
  when `blocked`. Fail-open contract on the pre-check unchanged: `!ok` ⇒ 503,
  never `available: true`. The flag→limiter→lookup order is unchanged.
- **`app/owner/billing/setup/page.tsx`** (2d) — the `!venueId` branch's "Please
  contact support." is replaced with copy that says the signup didn't finish plus
  a `next/link` **"Start over"** button to `/owner/signup` (a plain relative
  owner-app link — NOT `marketingHref`; `/owner/signup` is not a marketing
  route). Everything else on that page is untouched.
  - **⚠️ REVERTED BY PHASE 3.1 (2026-09-09).** That branch is unreachable:
    `GET /api/owner/billing` runs on `requireOwnerAuth`, which 401s an owner with
    no surviving venue rather than returning an empty list, so `venueId` is never
    null on a 200. 2d wrote correct copy for a state that cannot occur while the
    real dead end — `load()` pushing a purged partner to `/owner/login` — went
    unfixed. Phase 3.1 deletes the card and routes the 401 instead. **Do not
    restore this branch.**

#### 2c required NO component change — and that is the intended outcome

`EmailStep.tsx`'s "Sign in to your account" link renders on `error && taken`.
`SignupWizard` sets `emailTaken` / `emailError` only when the pre-check returns
`available: false` OR the submit returns `409 { code: "email_taken" }`. After 2a
+ 2b BOTH of those fire only for `kind: "account"`, so the link is already
structurally unreachable for a pending signup. No TSX edit was needed or made.
If a future change reintroduces a client-visible "pending" state, that is the
point to revisit `EmailStep`.

#### `ownerEmailExists` is now unused but KEPT

Nothing calls it after this phase (grep: only its own definition + a comment in
the contract test). It is left in `lib/ownerEmailAvailability.ts` as the Phase 1
handoff said to — a thin boolean reading of `findOwnerIdByEmail` for any future
caller that only wants the boolean. `findOwnerIdByEmail` stays the single
`venue_owners`-by-email query; the contract test still enforces that.

#### Contract test — the two assertions that had to move (same commit)

`tests/self-serve-signup-contract.test.ts`:

- `"both callers go through ownerEmailExists"` → renamed
  `"both callers go through the shared classifyEmailForSignup"`, now asserting
  both routes call `classifyEmailForSignup(` and import from `@/lib/pendingSignup`.
  **Tightened, not deleted** (Phase 1 handoff's instruction).
- The flag→limiter→lookup ordering assertion: `lookupAt` now indexes
  `classifyEmailForSignup(` instead of `ownerEmailExists(`.

Everything else in that file is untouched and green — including "venue_owners is
queried by email in exactly one module" (still just
`lib/ownerEmailAvailability.ts` + the allow-listed account-settings route) and
"the taken message is defined once".

#### Tests

- **NEW `tests/lib.pendingSignup.test.ts`** — pulled forward from Phase 5 per the
  Phase 1 handoff. The NEVER-PURGE truth table as first-class assertions:
  every `billing_subscriptions` row (incl. `cancelled`, on `owner_id` OR
  `venue_id`); a non-hidden venue; an unstamped (admin-activated) venue; a
  `(0,0)` venue; a second real venue on the owner; an auth user referenced by
  `accounts` / `users` / either Category Blitz table / a username-change ledger;
  every read-error path ⇒ `ok: false`. Plus `classifyEmailForSignup`'s
  exists:false / pending / account / fail-closed mapping, and `purgePendingSignup`
  (re-verify refuses a non-pending owner; **Stripe cancel logged BEFORE any row
  delete**; a Stripe-sweep failure aborts with nothing deleted). Uses a
  chainable/thenable PostgREST stand-in modelled on
  `tests/api.cron.signup-sweep.test.ts`; mocks `@/lib/stripeIncomplete` and
  `@/lib/stripe`.
- **`tests/api.owner.signup.test.ts`** — the mock's `Builder` gained
  `.neq/.in/.not/.returns` and `.limit` is now chainable-AND-thenable (the
  predicate does `.limit(1).returns()`). `resolveQuery` learned the
  `venue_owner_venues`-by-`owner_id`, `venues`-by-`.in`, `billing_subscriptions`
  and six auth-guard tables. New `mocks.pendingLinks` / `pendingVenues` /
  `pendingBilling`. `vi.mock("@/lib/stripeIncomplete")` added. Tests: the old
  "409s email_taken" renamed to "…for a REAL account"; new "SUPERSEDES a
  pending-signup collision" (purges venue + owner + auth user, then creates the
  new account) and "a pending owner that ALSO has a billing row is a real
  account — 409s, never purged".
- **`tests/api.signup.email-available.test.ts`** — the `supabaseAdmin` mock was
  rebuilt table-aware (it was `venue_owners`-only). New `mocks.pendingOwnerIds`.
  Tests: old "reports a taken email as unavailable" → "…a REAL account…"; new
  "reports a PENDING signup as AVAILABLE, with no error". The "normalises the
  address" test now asserts `mocks.queried[0]` (the by-email read) because the
  predicate adds trailing by-id reads.

---

### Handoff notes for Phase 3 (`POST /api/owner/signup/abandon` + the button)

**What Phase 3 builds** (unchanged from the plan below): one authenticated route,
one button on `/owner/billing/setup`, one confirm. All the hard logic already
exists in `lib/pendingSignup.ts` — Phase 3 is wiring.

**The route.**

- `POST /api/owner/signup/abandon`, authed by `requireOwnerAuth` (the owner
  session cookie), **never** an email in the body. Look at how
  `app/api/owner/billing/checkout/route.ts` resolves its owner — copy that.
- From the authenticated owner id, call **`findPendingSignupByOwnerId(ownerId)`**
  (exported from `lib/pendingSignup.ts` — this is exactly the entry point it was
  made a separate export for). NOT `findPendingSignupByEmail`.
  - `{ ok: false }` ⇒ 500 generic.
  - `{ ok: true, pending: null }` ⇒ **409**, body `{ code: "not_pending" }` or
    similar, and do nothing. This is a paid/real owner hitting the button by
    mistake, or a double-tap after the first purge already ran.
  - `{ ok: true, pending }` ⇒ `purgePendingSignup(pending.ownerId)`. On `ok`,
    clear the owner session cookie (see below) and return 200. On `!ok`, 500
    generic — the partner can retry; Phase 4's sweep is the backstop.
- **`purgePendingSignup` re-runs the full predicate itself** (Phase 1 as-built,
  deviation #2) — do not skip it, and do not treat your `findPendingSignupByOwnerId`
  call as permission to. Two reads on a cold path.
- **Clearing the owner cookie:** there is a `createOwnerSessionCookie(ownerId)` in
  `lib/ownerSession.ts` used to SET it; find its clearing counterpart (an
  expired `Set-Cookie`, the same shape `/api/owner/auth/logout` returns) and
  return that header. The owner row is deleted, so the cookie must not survive.
- Generic error bodies only (public-ish surface; same rule as the signup
  routes). Log with a `[OwnerSignupAbandon]` prefix.
- Gate on `isSelfServeSignupEnabled()` and `rateLimit()` like the other signup
  routes? — the plan does not say, but it is authenticated, so `requireOwnerAuth`
  is the real gate. Add the flag check for consistency (404 when off) and skip
  the rate limiter (an authenticated owner deleting their own debris is not a
  spam vector). Confirm with Andrew if unsure.

**The button** (`/owner/billing/setup`, `app/owner/billing/setup/page.tsx`).

- Show **"Cancel and start over"** ONLY in the `venueId` branch (the priced
  card), and only when there is no subscription row — the page already routes
  `active` / `past_due` / `cancelAtPeriodEnd` owners away in `load()` before
  render, so "reached the priced card" already means "no live sub". Belt and
  braces: you can also check `data.subscriptions` is empty.
- `window.confirm("This deletes what you entered. You'll start from the
  beginning.")` → `POST /api/owner/signup/abandon` → on 200,
  `window.location.href = marketingHref("/info")` (import from `@/lib/domainSplit`;
  **`/info`, never `/`** — CLAUDE.md). On non-200, show the existing `error`
  state.
- The 2d "Start over" link I just added (in the `!venueId` branch) is a
  DIFFERENT control — that branch is the already-purged/superseded dead end.
  Phase 3's button is in the `venueId` branch, for a partner who still has a
  pending venue and wants out. Keep both.

**Tests for Phase 3.**

- New `tests/api.owner.signup-abandon.test.ts`: authed owner with a pending
  signup ⇒ purged + cookie cleared + 200; authed owner with a REAL account ⇒
  409, nothing deleted; unauthenticated ⇒ 401; purge failure ⇒ 500.
  `tests/api.owner.signup.test.ts`'s mock builder (now with
  `.neq/.in/.not/.returns`, chainable `.limit`, and the pending fixtures) is the
  one to copy — it already models every table `purgePendingSignup` touches.
- The plan's Phase 5 also wants a contract assertion that `findPendingSignupByEmail`
  has one definition and the signup route does not hand-roll the predicate —
  Phase 2 did not add that (contract test already pins the `classifyEmailForSignup`
  wiring); add it in Phase 3 or Phase 5, same shape as the `lib/venueClaim.ts`
  guard.

**Do NOT touch in Phase 3:** `lib/pendingSignup.ts` (Phase 1 owns the predicate;
Phase 3 only calls it), `scripts/purge-pending-signup.cjs`, `lib/signupSweep.ts`
(Phase 4), the `checkout_started_at` migration (Phase 4), `vercel.json`
(Phase 4 + Andrew).

---

## Phase 3 — Explicit abandon purges immediately

**Goal:** requirement #2 for the visible case. A partner who backs out of payment
on purpose is erased at that moment.

- New `POST /api/owner/signup/abandon`. Authenticated by the **owner session
  cookie** (`requireOwnerAuth`), never by an email in the body — so it is not
  reachable by a stranger holding someone's address. Resolves the caller's own
  owner id, re-verifies it against Phase 1's predicate, purges, clears the owner
  cookie. A non-pending owner gets a 409 and nothing happens.
- `/owner/billing/setup` gains a visible **"Cancel and start over"** control,
  shown only when the venue has no subscription row. Confirms ("This deletes
  what you entered. You'll start from the beginning."), POSTs, then sends the
  partner to `marketingHref("/info")` — not `/`, per CLAUDE.md.
- `SignupShell`'s existing exit confirm on a dirty draft is unchanged; it already
  covers steps 1–5, which write nothing.

**Deliberately NOT doing: a `pagehide` / `sendBeacon` auto-abandon.** `pagehide`
fires on the redirect *into* Stripe Checkout, on iOS app-switch, and on bfcache
suspension. A beacon there would delete the record of a partner midway through
3-D Secure. Silent abandons are Phase 4's job, decided from durable state rather
than a lifecycle event.

| | |
| --- | --- |
| **Model** | **Sonnet 5** |
| **Effort** | Medium — ~1.5 h. One route, one button, one confirm; the hard thinking is Phase 1's. |
| **Risk** | Low. Worst case the control 409s and Phase 4 handles it. |

---

### Phase 3 — AS BUILT (2026-09-09, Opus 5)

**Status: code complete. `npx tsc --noEmit`, `npm run lint`, `npm run test`
(238 files / 2380 passing) and `npm run build` all clean; the build lists
`ƒ /api/owner/signup/abandon`. NOT DEPLOYED, and inert either way — the whole
surface is still behind `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`, off in
production, and the new route 404s with it. Phase 6 step 3 deploys 1–5 together.**

#### Files

- **NEW `app/api/owner/signup/abandon/route.ts`** — ~100 lines, of which ~55 are
  the reasoning. Gate order: **flag → `requireOwnerAuth` → predicate → purge**.
- **`app/owner/billing/setup/page.tsx`** — the "Cancel and start over" control in
  the `venueId` branch, plus the state it needs.
- **NEW `tests/api.owner.signup-abandon.test.ts`** — 15 tests.
- **`tests/self-serve-signup-contract.test.ts`** — one new describe block, four
  assertions (the Phase 5 tripwire the Phase 2 handoff deferred to "Phase 3 or 5").

#### The route

```
POST /api/owner/signup/abandon
  !isSelfServeSignupEnabled()            -> 404 {ok:false,error:"Not found."}
  requireOwnerAuth throws                -> its own 401/500 Response, returned as-is
  findPendingSignupByOwnerId(ownerId)
    { ok:false }                         -> 500 "Something went wrong. Please try again."
    { ok:true, pending:null }            -> 409 { code:"not_pending" }, NO Set-Cookie
    { ok:true, pending }
      purgePendingSignup(pending.ownerId)
        !ok                              -> 500 generic, NO Set-Cookie
        ok                               -> 200 { ok:true } + clearOwnerSessionCookie()
```

Decisions worth keeping, each of which the tests pin:

- **Authenticated by the owner session cookie, never an email in the body.** The
  teardown reaches an `auth.users` row. `POST /api/owner/signup` *does* accept an
  email collision and supersede it — that is Phase 2a's argued trade, and it is
  acceptable there only because a signup submit REPLACES what it destroys.
  Nothing replaces what this route destroys, so it gets no such latitude. Entry
  point is **`findPendingSignupByOwnerId`**, exactly what Phase 1 exported it for.
- **`purgePendingSignup` re-runs the whole predicate itself.** The route's own
  lookup is not permission to skip that; it only decides whether the partner sees
  a 409 or a 200.
- **Flag-gated (404 when off), NOT rate limited.** The handoff left this open and
  said to confirm if unsure — the reasoning, written into the file: the signup
  routes are limited because they are *public*; this one is behind
  `requireOwnerAuth`, and an authenticated owner deleting their own debris is not
  a spam vector. Consequence to know: with the flag off a partner cannot abandon,
  and Phase 4's sweep is the only collector. That is the same trade every other
  surface in this flow makes. **It is not in `PUBLIC_SIGNUP_ROUTES`** in the
  contract test, on purpose — that list is the unauthenticated boundary and its
  rate-limiter assertion would be wrong here.
- **The cookie is cleared on success ONLY.** On a `!ok` purge the owner row may
  still exist, and signing the partner out of a half-purged signup would strand
  them with no route back to the button they just tapped. A 409 leaves it alone
  too — that caller is a real owner.
- **Generic error bodies, `[OwnerSignupAbandon]` logs.** `findPendingSignupByOwnerId`
  already logs *which clause* refused (`[PendingSignup] not-pending … reason=…`);
  the route logs only that it refused. The reason must never reach a response body.

#### The button

`canAbandon = isSelfServeSignupEnabled() && Boolean(venueId) && !hasSubscription`.

- `hasSubscription` is new state, set in `load()` from `data.subscriptions.length`.
  `load()` already routes every live / scheduled-to-cancel owner away before
  render, so reaching the priced card nearly implies "never billed" — this is the
  belt to that braces, and specifically what keeps the control away from a
  **cancelled** subscriber, whose `billing_subscriptions` row is deliberately kept
  (CLAUDE.md) and is the proof they once paid.
- The client-side flag read is `isSelfServeSignupEnabled()` from
  `@/lib/selfServeSignup` — the single reader, safe in a `"use client"` file (it
  is a `NEXT_PUBLIC_*` read, inlined at build). The contract test's "flag env var
  is read in exactly one place" assertion stays green.
- `window.confirm("This deletes what you entered. You'll start from the
  beginning.")` → POST → **`window.location.href = marketingHref("/info")`**. A
  full navigation, not `router.push`: the response clears the session cookie, so
  leaving this page mounted would hold state for rows that no longer exist.
  `/info`, never `/` (CLAUDE.md).

**One deliberate deviation from the handoff.** It said "On non-200, show the
existing `error` state." I added a separate **`abandonError`** instead, rendered
inside the priced card. The page renders `error` as an *exclusive* branch that
REPLACES the card — so routing a failed cancel through it would take the
Subscribe button away from a partner whose only problem is that they could not
cancel. That is a new dead end, in the plan that exists to remove them. Five
lines; the pre-existing `handlePay` wart is untouched.

**Both controls now exist, as the handoff required.** The Phase 2d "Start over"
`<Link>` lives in the `!venueId` branch (the already-purged dead end); Phase 3's
button lives in the `venueId` branch (a partner who still has a pending venue and
wants out). They are different controls for different states.

#### Tests (`tests/api.owner.signup-abandon.test.ts`, 15)

Modelled on `tests/api.owner.signup.test.ts`'s builder as instructed, but
**deliberately does NOT mock `@/lib/pendingSignup`** — the predicate runs for real
against a table-aware PostgREST stand-in, because the thing worth pinning is not
"the route called purge" but "the route cannot delete a real account". Mocks are
`@/lib/supabaseAdmin`, `@/lib/stripe` (`{}`, so the cancel-first path is taken
rather than the unconfigured shortcut) and `@/lib/stripeIncomplete`.

- **gates** — 404 with the flag off (before any auth or Supabase work); 401 with
  no cookie; **401 on a forged cookie** (a correctly-shaped payload with a bad
  HMAC — without `readOwnerSession`'s check this endpoint is a delete button).
- **a pending signup** — purged (venue + owner + `deleteUser(authId)`), 200,
  `Set-Cookie` carries `Max-Age=0`; and **Stripe is cancelled before any row
  delete**, asserted as ordering (the sweep records `mocks.deletes.length` at call
  time and it must be `0`), not as "was called".
- **a real account is never purged** — a table-driven 409/`not_pending` sweep over
  the six never-purge clauses reached *through the route*: any
  `billing_subscriptions` row incl. `cancelled`; a non-hidden venue; an unstamped
  (admin-activated) venue; a `(0,0)` venue; an auth user `accounts` references; a
  second, real venue on the owner. Each asserts zero deletes AND **no `Set-Cookie`**
  — a refused cancel must not sign a real owner out.
- **failures** — a read error 500s generically with the upstream message absent
  from the body and nothing deleted; a Stripe-sweep failure 500s with nothing
  deleted; a row-delete failure 500s and leaves the cookie alone; a double-tap on
  a stale cookie is refused (**401** — `requireOwnerAuth` stops it before the 409
  the plan describes, because no linked venue remains; either is honest, and what
  matters is that it never reaches a delete).

#### Contract tripwire (`tests/self-serve-signup-contract.test.ts`)

New block, `"abandoned-signup cleanup — the pending-signup predicate has exactly
one home"`, same shape as the `lib/venueClaim.ts` guard in
`tests/api.owner.signup.claim-guard.test.ts`. This is the Phase 5 bullet the
Phase 2 handoff deferred; **Phase 5 should not re-add it.**

1. Each of `findPendingSignupByEmail`, `findPendingSignupByOwnerId`,
   `classifyEmailForSignup`, `purgePendingSignup` is defined in exactly one module
   (`lib/pendingSignup.ts`), scanning all of `app/` + `lib/`.
2. `lib/pendingSignup.ts` **imports** its clauses rather than copying them —
   `@/lib/venueClaim` (`VENUE_CLAIM_COLUMNS`, `isPlaceholderVenueRow`,
   `isSelfServeVenueRow`, `isAdminHiddenVenueRow`), `@/lib/signupSweep`
   (`authUserIsUnreferenced(`), `@/lib/stripeIncomplete`.
3. **No caller hand-rolls the predicate.** All three
   (`/api/owner/signup`, `/api/signup/email-available`, `/api/owner/signup/abandon`)
   import from `@/lib/pendingSignup` and none of them queries
   `billing_subscriptions`, calls `authUserIsUnreferenced`, or touches
   `AUTH_USER_FK_CONSUMERS`.
4. The abandon route uses `requireOwnerAuth` + `findPendingSignupByOwnerId`, never
   `findPendingSignupByEmail` / `classifyEmailForSignup`, and clears the cookie.

**Considered and rejected:** an allow-list of `auth.admin.deleteUser` call sites.
There are ten today across `app/api/owner/auth/*`, `lib/admin.ts` and
`lib/signupSweep.ts` — a tripwire over that much pre-existing surface is its own
project, not a Phase 3 line item. `tests/lib.auth-users-fk-guard.test.ts` remains
the guard that matters.

---

## Phase 3.1 — A 401 that says why (the dead end Phase 2d aimed at and missed)

**Added 2026-09-09, after Andrew asked why `/owner/billing/setup` had a "Start
over" link at all. The honest answer was that it should not have: the branch was
unreachable, and the dead end it claimed to fix was still there, one redirect
away.**

### What was actually wrong

`GET /api/owner/billing` is built on `requireOwnerAuth`, which **throws 401
rather than returning an empty list** when an owner holds no surviving venue
(`lib/requireOwnerAuth.ts`, two separate `length === 0` guards). So on any 200,
`venueIds` has at least one entry, `firstVenue` is never null, and the page's
`!venueId` branch — the Phase 2d "Start over" card — could not render. The
route's own `auth.venueIds.length === 0` guard is dead for the same reason.

What a partner with a purged signup actually got was `load()`'s
`router.push("/owner/login")`: **a sign-in page for an account that no longer
exists.** That is precisely the dead end §0.1 exists to eliminate — the plan's
own central claim is that an unpaid signup has no user-visible identity, and the
first thing the flow did on losing one was offer to sign in to it.

Phase 2d wrote correct copy for a state that cannot occur, and Phase 3 then
recorded the mismatch (its double-tap test asserts 401, not the 409 the plan
predicted) without chasing it back to the cause. Both are the same miss.

### The fix: 401s carry a reason

`requireOwnerAuth` throws 401 for two situations that were indistinguishable to
every caller:

| Reason | Situation | Right answer |
| --- | --- | --- |
| `no_session` | No cookie, a bad HMAC, or no `SESSION_SECRET`. Not signed in. | `/owner/login` |
| `no_venue` | A **valid, correctly signed** cookie whose owner holds no surviving venue. | the signup flow |

`no_venue` is what a purged pending signup looks like from the browser: the owner
row and its venue are gone; the cookie on the device is not.

- **NEW `lib/ownerAuthCodes.ts`** — the two codes, `OWNER_LOGIN_PATH`, and
  `ownerAuthRecoveryPath(code)`. **Pure, no `server-only`**: the server throws
  these strings and client pages route on them, so the literal has to be legal on
  both sides. Same "defined once, never re-typed at a call site" convention as
  `OWNER_EMAIL_TAKEN_MESSAGE`.
- `ownerAuthRecoveryPath` sends `no_venue` to **`signupEntryPath()`**, not a
  hardcoded `/owner/signup` — with the self-serve flag off that path 404s, and
  `signupEntryPath()` is the single home of "where does someone go to get a
  venue". **Everything else falls back to the login page**, deliberately not an
  exhaustive match: an absent, unknown or malformed code (an older deploy, a
  proxy that ate the body, a 401 from something that is not `requireOwnerAuth`)
  must keep today's behaviour. The cost of getting this backwards is bouncing a
  real paying owner into a signup wizard.
- **`lib/requireOwnerAuth.ts`** — the three hand-written 401 `Response`s collapse
  into one `unauthorized(code)` helper. **`error: "Unauthorized"` is unchanged and
  `code` is purely additive** — all 16 `/owner/*` pages read only
  `response.status`, so nothing had to change in step with this.
- **`app/owner/billing/setup/page.tsx`** — `load()` routes the 401 through
  `ownerAuthRecoveryPath(body.code)`, and a null `firstVenue` on a 200 takes the
  same redirect. The Phase 2d card and the `next/link` import are **deleted**;
  the `!venueId` render branch is now just the loading line that covers the frame
  before the router navigates.

**Why the null-`firstVenue` case is a redirect and not a restored card:** it
collapses "signed in, no venue" to ONE answer instead of two. A UI branch there
would be unreachable again the moment `requireOwnerAuth` keeps throwing — which
is exactly how the Phase 2d card became dead code.

**Deliberately NOT done: the other 15 `/owner/*` pages.** Every one of them still
does a bare `router.push("/owner/login")` on 401, so a purged partner with a
bookmark to `/owner/dashboard` hits the same wrong dead end. The mechanism to fix
them now exists and is one line each (`ownerAuthRecoveryPath(body.code)` plus
reading the body), but 15 pages is a different change from this plan's subject
and would bury it. **Whoever picks that up: the helper is the whole job, the
pages are copy-paste.**

**Not done, and probably correct: clearing the cookie on a `no_venue` 401.**
`requireOwnerAuth` is a read helper that throws; giving it a `Set-Cookie` side
effect is a bigger decision than this phase needs. The stale cookie is harmless
(it 401s everywhere) and the abandon route already clears it on the path that
matters.

### Tests

- **NEW `tests/lib.ownerAuthCodes.test.ts`** (4) — `no_venue` → `/owner/signup`
  with the flag on and **`/owner/register` with it off** (the assertion that stops
  someone pinning the literal); a table of eight non-matching values — including
  `undefined`, `""`, `"NO_VENUE"`, `"no_venue "` and `{}` — all falling back to
  login; the two codes are distinct.
- **`tests/lib.require-owner-auth.test.ts`** — new `"the 401 says WHY"` block (4):
  `no_session` for a missing/forged cookie, `no_venue` for both empty-venue
  paths, and that `error` is still `"Unauthorized"`.
- **`tests/api.owner.signup-abandon.test.ts`** — the two existing 401 cases now
  assert the code as well, and they are the two halves of the discriminator: the
  forged cookie is `no_session` (login is right for it), the double-tap after a
  successful purge is `no_venue` (the state that used to dead-end at login).
- **`tests/self-serve-signup-contract.test.ts`** — a fifth assertion in the
  Phase 3 block: the literals `"no_venue"` / `"no_session"` appear in
  `lib/ownerAuthCodes.ts` and nowhere else under `app/`, `lib/` or `components/`.
  A page comparing against its own literal would keep working right up until
  somebody renamed the constant.

### Verified

`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test` **240 files /
2389 passing** · `npm run build` clean, `ƒ /api/owner/signup/abandon` listed.

| | |
| --- | --- |
| **Model** | **Opus 5** |
| **Effort** | Low — ~45 min. Small, but it touches a shared auth helper on every `/owner/*` route, so the additive-`code` property is the load-bearing part. |
| **Risk** | Low. Additive to the 401 body; the only behaviour change is one page's redirect target, and the fallback is today's behaviour. |

### For Phase 6's device pass — LANDED 2026-09-09

The checklist item is written, at the **end of §8a** of
`docs/self-serve-signup-device-checklist.md`: with a pending signup open on
`/owner/billing/setup`, purge it from elsewhere (another device's "Start over",
or `npm run signup:purge-pending -- <email> --delete`), then reload the page
**without clearing cookies** — the stale-but-valid owner cookie is the whole
point of the test — and it must land on the **signup wizard**
(`/owner/signup`, or `/owner/register` while the flag is off), never
`/owner/login`. The item also records that the other 15 `/owner/*` pages still
push to `/owner/login`, so a tester who reproduces the old dead end from a
`/owner/dashboard` bookmark files it as the known follow-up, not a regression.

Re-verified when that item landed: `npx tsc --noEmit` clean · `npm run lint`
clean · `npm run test` **239 files passed / 1 skipped, 2389 passing**. Phase 3.1
is closed apart from Andrew's physical device pass, which is Phase 6's to run.

---

### Handoff notes for Phase 4 (the one-hour TTL tier)

**Phase 4 is the first phase that deletes on a schedule, and after Phase 2 nothing
user-facing depends on it running.** It is hygiene. If a decision is close, take
the conservative side — the cost of sweeping too slowly is bytes; the cost of
sweeping too fast is a partner's in-flight signup.

**What exists now that Phase 4 should build on, not duplicate:**

- `lib/pendingSignup.ts` is the predicate's home and `purgePendingSignup` is a
  working, Stripe-safe teardown with the same clauses `classifyOwnerForSweep`
  applies. The sweep predates it and has its own path (`lib/signupSweep.ts`).
  **They are not unified, and Phase 4 is not required to unify them** — but if the
  tier split tempts you to add a clause to one, check whether the other needs it.
  The one real difference: the sweep is owner-first and TTL-aware; the library is
  owner-id-first and TTL-blind.
- **`lib/ownerAuthCodes.ts` + the `no_venue` 401 (Phase 3.1, read it first).**
  This one is not background — **the sweep is what will produce that state at
  scale.** Deleting an abandoned venue out from under a partner who still holds a
  valid owner session cookie is exactly the "signed in, no venue" case, and until
  Phase 3.1 it dead-ended on a login page for an account that no longer existed.
  `requireOwnerAuth` now answers `401 { code: "no_venue" }` and
  `/owner/billing/setup` routes it to the signup flow. **Phase 4 needs no code for
  this — it needs to not undo it**, and to know that the other 15 `/owner/*` pages
  still push to `/owner/login` on 401 (the bounded follow-up 3.1 names). If you
  sweep before those are fixed, a swept partner with a `/owner/dashboard` bookmark
  still hits the old dead end.

- `sweepAbandonedIncompleteSubscriptions` is in `lib/stripeIncomplete.ts` with two
  callers on **opposite failure policies** (checkout ignores the result; the purge
  aborts on it). If the sweep grows a Stripe cancel, decide which policy it takes
  and write the reason down — do not assume.

**The migration.** `venues.checkout_started_at timestamptz null`, new timestamped
file under `supabase/migrations/`, never edit an existing one. Stamped by
`POST /api/owner/billing/checkout` immediately before it returns the Checkout URL
— i.e. after the session is created and `session.url` is confirmed, so a failed
Stripe call does not stamp. That route currently does no `venues` write at all;
adding one is the whole Sonnet-sized half of this phase.

**The tier split.** Tier A (`checkout_started_at IS NULL`) =
`PENDING_SIGNUP_TTL_MINUTES`, default 60. Tier B (stamped) = the existing 7 days;
**do not shorten it** — late-settling cards, 3-D Secure, overnight bank holds.
Both keep `SWEEP_MAX_VENUES_PER_RUN`, the billing-row exclusion,
`classifyOwnerForSweep`'s second-venue check and the auth-guard fail-closed.

**Three things that are Andrew's, not yours:**

1. **`vercel.json` is a hard boundary.** The cron cadence change (`0 8 * * *` →
   `0 * * * *`) needs his explicit written go-ahead, exactly as the existing
   `/api/cron/signup-sweep` entry got on 2026-09-07. Record the new go-ahead in
   CLAUDE.md beside that precedent so the next reviewer does not re-flag it.
2. **`SIGNUP_SWEEP_DELETE_ENABLED` stays unset** until 24 h of
   `[SignupSweep] venue-sweep-dry-run` lines have been read and the Tier A
   projection confirmed to be debris only. Server-side var, no redeploy.
3. Phase 6 steps 1–7 are his. Phase 4 ships the code in dry-run.

**Do NOT touch in Phase 4:** `lib/pendingSignup.ts` (Phase 1 owns the predicate),
`app/api/owner/signup/abandon/route.ts` and the `/owner/billing/setup` controls
(Phase 3 — both of them; they are different controls for different states),
`scripts/purge-pending-signup.cjs` (Phase 0's escape hatch, still Phase 6 step 1),
and `AUTH_USER_FK_CONSUMERS` / `tests/lib.auth-users-fk-guard.test.ts`.

**Loose ends Phase 3 found.**

- ~~The Phase 2d "Start over" link is not flag-gated~~ — **superseded by Phase 3.1
  below.** Andrew asked why that link existed at all; it turned out the branch
  containing it was unreachable, and the real dead end (`/owner/login` for a
  purged signup) was elsewhere. Phase 3.1 deletes the card and fixes the redirect.
  Read Phase 3.1 before touching `/owner/billing/setup`.
- `handlePay`'s errors still go to the page-level `error` state, which **replaces**
  the priced card and leaves the partner with a banner and no retry affordance.
  Pre-existing, not introduced here, and NOT Phase 4's job. Phase 3's
  `abandonError` shows the shape a fix would take.

**Phase 5 note:** the predicate tripwire it asks for is already in
`tests/self-serve-signup-contract.test.ts` (see above). What Phase 5 still owes is
whatever the tier split needs in `tests/api.cron.signup-sweep.test.ts`.

---

## Phase 4 — Retention hygiene: a one-hour tier

**Goal:** requirement #2 for the silent case — browser closed, phone put down.
**Not** a retry mechanism; after Phase 2 nothing user-facing depends on this
running. It exists so unpaid data does not sit in the database for a week.

Today there is one tier: hidden + stamped + no billing row + older than 7 days.
Split it on the honest question *did this partner ever reach Stripe?*

- **Migration:** `venues.checkout_started_at timestamptz null`, stamped by
  `POST /api/owner/billing/checkout` immediately before it returns a Checkout
  URL. New timestamped file under `supabase/migrations/`; never edit an existing
  one.
- **Tier A — never reached Stripe** (`checkout_started_at IS NULL`): abandoned
  after `PENDING_SIGNUP_TTL_MINUTES`, default **60**.
- **Tier B — reached Stripe** (`checkout_started_at` set): keeps the 7-day
  window. A card can settle late, 3-D Secure can take a while, a bank can hold a
  charge overnight. Do not shorten this tier.
- Both tiers keep every existing guard: `SWEEP_MAX_VENUES_PER_RUN`, the
  billing-row exclusion, `classifyOwnerForSweep`'s "does this owner hold another
  venue" check, the auth-guard fail-closed.
- **Cron cadence:** `/api/cron/signup-sweep` from `0 8 * * *` to `0 * * * *`.
  `vercel.json` is a hard boundary — **needs Andrew's explicit written
  go-ahead**, exactly as the existing entry got on 2026-09-07. Record it in
  CLAUDE.md beside that precedent so the next reviewer does not re-flag it.
- **Flag:** `SIGNUP_SWEEP_DELETE_ENABLED` must actually be set or nothing
  deletes. Read a day of `[SignupSweep] venue-sweep-dry-run` lines first, confirm
  the projected deletions are all Tier A debris, then set it. Server-side var —
  no redeploy.

| | |
| --- | --- |
| **Model** | **Opus 5** for the tier split; **Sonnet 5** for the migration and the checkout stamp. |
| **Effort** | Medium-high — ~2.5 h. The code is small; Tier B's boundary (late-settling cards) is the part that deserves thought. |
| **Risk** | Medium — the one phase that deletes on a schedule. The dry-run read before flipping the flag is not optional. |

---

### Phase 4 (tier split) — AS BUILT (2026-09-09, Opus 5)

**Scope executed: the TIER SPLIT ONLY.** The migration and the
`POST /api/owner/billing/checkout` stamp were deliberately left undone — Andrew
reserved that half for Sonnet 5. Everything below therefore ships in a state
where `venues.checkout_started_at` does not exist yet, and that is a supported,
tested state, not a half-landed one (see "the fallback" below).

**Files changed — three, plus this doc.**

| File | What changed |
| --- | --- |
| `lib/signupSweep.ts` | The tier split itself: the TTL constants + reader, `SweepTier`, the wider scan + in-memory partition, the missing-column fallback, per-tier counters, tier on every log line. |
| `app/api/cron/signup-sweep/route.ts` | The per-run summary line now carries `venueScanned` / `venueTierA` / `venueTierB` / `tierSplit` / `ttlMinutes`, and the job-2 doc block explains the tiers. No behavioural change. |
| `tests/api.cron.signup-sweep.test.ts` | 16 new assertions in one `describe`, plus a one-shot read-error hook in the Supabase mock (the fallback re-reads `venues`, so a sticky error could not reach it). 41 → 57 tests, all green. |

**Not touched, on purpose:** `lib/pendingSignup.ts` (Phase 1 owns the predicate;
4.1a is what changes it), `app/api/owner/signup/abandon/route.ts`,
`/owner/billing/setup`, `scripts/purge-pending-signup.cjs`, `vercel.json`,
`AUTH_USER_FK_CONSUMERS`, `.env.local`.

#### The tiers as built

```
TIER A  checkout_started_at IS NULL   -> pendingSignupTtlMinutes(), default 60
TIER B  checkout_started_at IS SET    -> SWEEP_ABANDON_AFTER_DAYS (7), and BOTH
                                         self_serve_created_at AND
                                         checkout_started_at must clear it
```

**Tier B measures the LATER of the two stamps, which is stricter than the plan's
literal "keeps the 7-day window."** This is the one place the implementation
went beyond the text, and the handoff's "if a decision is close, take the
conservative side" is why. The case: a venue created ten days ago whose partner
came back today, opened Checkout, and is paying right now. Under
`self_serve_created_at`-only it is swept on the next hourly run — deleting the
venue the webhook is about to write a `billing_subscriptions` row against, which
is the exact harm Tier B exists to prevent. It can only ever KEEP a venue the old
predicate would have deleted, so it cannot introduce a new deletion.
`tests/api.cron.signup-sweep.test.ts` → "KEEPS a long-abandoned venue whose
partner reached Stripe an hour ago" is that case, pinned.

#### One scan, partitioned in memory — and why not two queries

The scan filters on the LOOSER of the two windows (`Math.min` of the two cutoffs,
so a TTL misconfigured above seven days cannot hide Tier B rows) and each row's
own tier window is applied in TypeScript. Two DB-side tier queries were the
obvious alternative and were rejected: they double the round trips, they make the
`SWEEP_MAX_VENUES_PER_RUN` rail ambiguous across two result sets, and they give
the missing-column fallback two places to fail instead of one.

The consequence to know about: **the scan now fetches rows that are not yet
abandoned** (Tier B venues inside their window). Three things keep that safe:

- `.order("self_serve_created_at", { ascending: true })` — oldest first, so a
  not-yet-abandoned row can never crowd an older, genuinely abandoned one out of
  the page.
- The over-cap rail now counts **eligible** candidates, not fetched rows. Counting
  the drag-in would make the circuit breaker fire on a healthy pipeline of
  in-flight signups. Both directions are pinned by tests.
- `result.scanned` is reported so `scanned - candidates` is visible in the logs —
  that difference is the in-flight population, and it is the number to sanity-check
  during the dry-run read.

#### The fallback (this is the part that makes the split safe to ship early)

`isMissingCheckoutStampColumn` matches SQLSTATE `42703`, or a message naming
`checkout_started_at` alongside "does not exist" / "schema cache" / "could not
find". On a match the scan is re-run without the column, against the 7-day
window — i.e. **exactly the pre-Phase-4 behaviour** — `tierSplitActive` goes
false, and `[SignupSweep] checkout-stamp-column-missing` is logged. That is the
conservative direction: it sweeps LATER, never sooner.

The match is deliberately narrow and **every other read error still fails
closed** (pinned by "still fails CLOSED on any OTHER venues read error").
Degrading a timeout into "run the legacy scan" is how a broken sweep looks
healthy for a week.

#### `PENDING_SIGNUP_TTL_MINUTES`

Server-side env var, no `NEXT_PUBLIC_`, so it moves without a redeploy. Unset /
unparseable / non-positive → 60. **Below `PENDING_SIGNUP_TTL_MINUTES_FLOOR` (15)
→ clamped up, with a warning.** The floor is not in the plan; it is there because
a fat-fingered `1` would reap a venue while its partner is still reading the page
that pays for it, and nothing about this job is urgent enough to be worth that.
Both branches log; the resolved value is echoed in the cron summary as
`ttlMinutes=`.

#### Tier A's safety net is Phase 3.1, and it is load-bearing

A partner who is still sitting on `/owner/billing/setup` at minute 61 gets their
venue deleted underneath a valid owner session cookie. That is the designed
behaviour and it is only acceptable because Phase 3.1 landed first:
`requireOwnerAuth` answers `401 { code: "no_venue" }` and that page routes them
into a fresh signup instead of a login screen for an account that no longer
exists. **If 3.1 ever regresses, Tier A becomes a dead end and the TTL must go
back up until it is fixed** — this is written at the constant, not only here.

The bounded follow-up 3.1 named is still open: the other ~15 `/owner/*` pages
still push to `/owner/login` on a 401. A swept partner with an `/owner/dashboard`
bookmark still hits the old dead end. That is an argument about when to set
`SIGNUP_SWEEP_DELETE_ENABLED`, not about this code.

#### Verified

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run test` — 2405 passed, 13 skipped, 240 files. `api.cron.signup-sweep`
  went 41 → 57.
- `npm run build` — clean; `Proxy (Middleware)` still listed.
- Not verified against production, by design: nothing here has been run against
  the live database, and the delete flag remains unset everywhere.

---

### Handoff notes for the next phase (Sonnet 5 — the migration + the checkout stamp)

**You are finishing Phase 4. Two files, and an ordering rule that matters more
than either of them.**

**1. The migration.** `supabase migration new venues_checkout_started_at` (the CLI
is installed and the project is linked; `migration new` only writes a local
timestamped file). One column:

```sql
alter table public.venues
  add column if not exists checkout_started_at timestamptz null;
```

Nothing else — no backfill (a null IS the correct value for every existing row:
"we have no evidence this venue reached Stripe", and the tier logic reads that as
Tier A), no index yet (the scan filters on `hidden` + `self_serve_created_at` and
partitions on this column in memory; production's hidden-venue population is a
handful of rows). **Never edit an existing migration file.** `supabase db push`
applies to the LINKED PRODUCTION database — it always asks first, and it is
Andrew's call, not yours.

**2. The stamp.** `POST /api/owner/billing/checkout`
(`app/api/owner/billing/checkout/route.ts`). That route currently does no
`venues` write at all. Add one **after `session.url` is confirmed and before the
`NextResponse.json({ ok: true, url: session.url })`** — i.e. inside the `try`,
after the `if (!session.url)` guard:

```ts
await supabaseAdmin.from("venues").update({ checkout_started_at: new Date().toISOString() }).eq("id", venueId);
```

- **Placement is a correctness constraint, not a style choice.** `null` is read
  by the sweep as "never reached Stripe, one hour is enough" and (in 4.1a) as
  "there is nothing at Stripe to cancel". Both are safe ONLY because the stamp is
  written before the URL is handed back. Stamping earlier would mark a failed
  Stripe call as "reached checkout" (harmless, just slower); stamping later, or
  from the client, or on the success webhook, makes both readers WRONG. There is
  a comment at the sweep end saying this — **write the matching one here**, naming
  `lib/signupSweep.ts` and `docs/abandoned-signup-cleanup-plan.md` §4.1a.
- **Do not let the stamp fail the request.** A partner with a live Checkout URL
  must get it. Log the error (`[OwnerCheckout] checkout-stamp-failed venue=…`)
  and return the URL anyway — a missed stamp costs one venue an early sweep, and
  a refused Checkout costs a subscription. This is the same best-effort policy the
  route already takes with `sweepAbandonedIncompleteSubscriptions`.
- **Stamp on every Checkout start, including a re-checkout.** Refreshing the stamp
  restarts Tier B's clock for a partner who is trying again, which is the answer
  you want.
- Assert the placement in `tests/self-serve-signup-contract.test.ts` if you can do
  it honestly (the stamp appears after the `session.url` guard in the source) —
  a runtime test in `tests/api.owner.billing.checkout*.test.ts` is better if one
  already mocks Stripe far enough to reach the success path.

**3. THE ORDERING RULE — read this before you push anything.**

Between "the column exists" and "the stamp is deployed", **every venue looks like
Tier A and gets the one-hour window, including partners with a payment in
flight.** The sweep cannot detect this: a null column and a null value are the
same value.

- Deploy the STAMP CODE first, or in the same deploy as the migration. Never push
  the migration to production ahead of the code.
- The only thing that makes this a non-event today is that
  `SIGNUP_SWEEP_DELETE_ENABLED` is unset, so the sweep is log-only. **Do not set
  that flag as part of this work** — it is Andrew's, after the dry-run read
  (Phase 4 bullet 2 of the handoff above / Phase 6).
- After the migration lands, confirm `tierSplit=true` in the
  `[SignupSweep] run …` line. If it stays `false`, the column did not arrive and
  the sweep is quietly running a week behind what the plan intends.

**What you do NOT need to touch:** `lib/signupSweep.ts` (the tier logic is done
and tested; it reads the column the moment it exists), the cron route, or
`vercel.json`. The cadence change `0 8 * * *` → `0 * * * *` is a hard boundary
needing Andrew's explicit written go-ahead, and the tiers are correct at daily
cadence too — a 60-minute TTL swept once a day just means Tier A debris lives up
to a day. **Not urgent, and not yours to decide.**

**Then Phase 4.1a becomes unblocked** (Sonnet, `lib/pendingSignup.ts`): if every
venue in a pending signup has `checkout_started_at IS NULL`, skip
`sweepAbandonedIncompleteSubscriptions` entirely rather than letting a Stripe
round-trip fail and block a retry that has nothing at Stripe. `tierOf` in
`lib/signupSweep.ts` is the same question, expressed for one row — reuse the
reasoning, but note the modules are separate on purpose (`lib/pendingSignup.ts`
is owner-id-first and TTL-blind; the sweep is owner-first and TTL-aware) and
Phase 4 did not unify them.

**Still open, unchanged by this phase:** 4.1b's rate-limit keying decision (Opus,
and the number is Andrew's), the 15 `/owner/*` pages that still 401 to
`/owner/login`, and Phase 6 steps 1–7 (all Andrew's).

---

### Phase 4 (migration + checkout stamp) — AS BUILT (2026-09-09, Sonnet 5)

**Status: code complete. `npx tsc --noEmit`, `npm run lint`, `npm run test`
(239 files passed / 1 skipped, 2408 passing) and `npm run build` all clean;
`ƒ /api/owner/billing/checkout` still listed. NOT DEPLOYED. The migration is a
local file only — `supabase db push` is Andrew's call. The whole surface is
still behind `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` (off) and
`SIGNUP_SWEEP_DELETE_ENABLED` (unset, sweep is log-only), so this is inert in
both directions.**

This finishes Phase 4. Opus 5 shipped the tier split in `lib/signupSweep.ts`
earlier the same day (see the AS BUILT block above); this half is the column it
reads and the write that fills it.

#### Files

| File | What changed |
| --- | --- |
| **NEW `supabase/migrations/20260909120000_venues_checkout_started_at.sql`** | `alter table public.venues add column if not exists checkout_started_at timestamptz null;` + a `comment on column`. No backfill (NULL = "no evidence this venue reached Stripe" = Tier A, which is correct for every existing row), no index (the sweep filters on `hidden` + `self_serve_created_at` and partitions on this column in memory; production's hidden-venue population is a handful of rows). Header comment carries the full tier rationale and the ordering rule. |
| **`app/api/owner/billing/checkout/route.ts`** | One `supabaseAdmin.from("venues").update({ checkout_started_at: ... }).eq("id", venueId)`, placed inside the `try`, **after the `if (!session.url)` guard**, **before `return NextResponse.json({ ok: true, url: session.url })`**. Wrapped in try/catch AND checks the returned `{ error }` — both failure modes log `[OwnerCheckout] checkout-stamp-failed venue=…` and fall through to return the URL. A ~15-line comment above it states why placement is a correctness constraint (naming `lib/signupSweep.ts` and §4.1a as the two readers of a null value). |
| **`tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`** | New `describe("checkout_started_at stamp (abandoned-signup Tier B)")` — 3 tests: stamps an ISO timestamp on a successful checkout (asserts the payload's only key is `checkout_started_at` and the value parses); a failed `stripe.checkout.sessions.create` (502) never stamps; a refused checkout (409, existing live sub) never stamps. Plus one pre-existing test tightened — `"unblocks checkout on resource_missing but does NOT write it back to the mirror"` asserted `mocks.dbUpdate` was *never* called; the stamp is now a legitimate `dbUpdate` on that 200 path, so it now filters to **mirror** writes (`!("checkout_started_at" in payload)`) and asserts those are zero. The test's intent (no `billing_subscriptions` status writeback on `resource_missing`) is unchanged. |

The route's existing supabaseAdmin mock in that test file already routes every
`.update()` through `mocks.dbUpdate(payload)` and returns `{ eq: async () => ({ error: null }) }`,
so the stamp needed no new mock wiring — it is exercised by every 200-path test
in the file now.

**The contract-test placement assertion the handoff floated was not added** — a
runtime test that drives Stripe to the success path and checks the stamp fires
(and the two negative cases) is the stronger guard and it exists. A source-order
string assertion on top would be redundant and brittle.

#### `types/index.ts` — not touched, and correct

`.from("venues")` is untyped in this codebase (CLAUDE.md: no generated Supabase
types), so the `.update()` compiles without a type change. No app code *reads*
`checkout_started_at` — the only reader is `lib/signupSweep.ts`, which declares
its own local `checkout_started_at?: string | null` on its candidate-row type.
Nothing else needs to know the column exists.

#### THE ORDERING RULE — for whoever deploys this

Between "the column exists in production" and "the stamp code is live", **every
venue reads as Tier A** (null column, null value — indistinguishable), so a
partner mid-payment would be on the 60-minute window. Mitigations, in order of
what actually protects you:

1. **`SIGNUP_SWEEP_DELETE_ENABLED` is unset**, so the sweep is log-only. This is
   the real safety. Do not set it as part of shipping this — it is Andrew's,
   after the 24 h dry-run read (Phase 6).
2. Deploy the **stamp code first, or in the same deploy** as the migration.
   Never `supabase db push` ahead of the code.
3. `lib/signupSweep.ts` already degrades to the legacy single 7-day window when
   the column is absent (`isMissingCheckoutStampColumn`, SQLSTATE `42703`), so a
   migration that lands *after* the code is the safe ordering too — it just
   means the tier split is dormant until the column arrives.
4. After the migration lands, confirm `tierSplit=true` in the
   `[SignupSweep] run …` summary line. If it stays `false` the column did not
   arrive and the sweep is a week behind what the plan intends.

#### Verified

`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test` 239 files
passed / 1 skipped, **2408 passing** (`api.owner.billing-resume-vs-checkout-matrix`
went 34 → 37) · `npm run build` clean, `ƒ /api/owner/billing/checkout` listed.
Not run against production — the migration is a local file and the delete flag is
unset everywhere.

---

### Handoff notes for Phase 4.1a (Sonnet 5 — `lib/pendingSignup.ts`)

**Now unblocked: `checkout_started_at` exists in the schema type surface** (the
column is declared on `lib/signupSweep.ts`'s row type; the migration is written
but push is Andrew's — 4.1a's code must not assume the column is populated in
production yet, same as the sweep's fallback).

**The change (from §4.1a below):** `purgePendingSignup` calls
`sweepAbandonedIncompleteSubscriptions`, which hits `stripe.subscriptions.list(...)`
and **aborts the whole purge if that call fails** — putting "Something went
wrong. Please try again." in front of a returning partner whose abandoned signup
*never reached Stripe* and therefore has nothing at Stripe to cancel. If every
venue in the pending signup has `checkout_started_at IS NULL`, skip the Stripe
round-trip entirely.

- **Read the column in the predicate you already load.** `findPendingSignupByOwnerId`
  reads every linked venue row with `VENUE_CLAIM_COLUMNS` — check whether that
  select needs `checkout_started_at` added (it is not in `VENUE_CLAIM_COLUMNS`
  today; either widen the select locally in `lib/pendingSignup.ts` or add a small
  dedicated read). Put `reachedCheckout: boolean` (any linked venue stamped) on
  the `PendingSignup` type so `purgePendingSignup`'s re-verify has it without a
  second read.
- **`tierOf` in `lib/signupSweep.ts` is the same question for one row** — reuse
  the *reasoning* (null stamp ⇒ never reached Stripe ⇒ nothing to cancel), but do
  **not** import across the modules. They are deliberately separate:
  `lib/pendingSignup.ts` is owner-id-first and TTL-blind; the sweep is
  owner-first and TTL-aware. Phase 4 did not unify them and 4.1a should not
  either. The contract test (`tests/self-serve-signup-contract.test.ts`, the
  "pending-signup predicate has exactly one home" block) pins `lib/pendingSignup.ts`'s
  import list — adding a `@/lib/signupSweep` tier import there would need that
  assertion updated, and the reason it exists is to stop exactly this kind of
  cross-wiring, so prefer re-deriving the one-line check.
- **Keep the abort for the stamped case.** A partner who *did* reach Checkout can
  have a live `incomplete` subscription carrying `metadata.venueId` for a venue
  the purge is about to delete; if the list call fails there, aborting is still
  right (completing later would write a billing row against a deleted venue).
  Only the `checkout_started_at IS NULL` path gets the skip.
- **`stripe === null` already short-circuits** (`purgePendingSignup` warns and
  proceeds when payments are unconfigured). The new skip is a second, narrower
  short-circuit on the same principle: no possible Stripe object ⇒ no Stripe call.
- Tests: extend `tests/lib.pendingSignup.test.ts` — a pending signup with all
  venues unstamped purges even when `sweepAbandonedIncompleteSubscriptions` is
  mocked to throw; a pending signup with a stamped venue still aborts on that
  throw. The file already mocks `@/lib/stripeIncomplete`.

**Still open after 4.1a:** 4.1b's rate-limit keying decision (Opus; the number is
Andrew's), the ~15 other `/owner/*` pages that still 401 to `/owner/login`
(Phase 3.1's bounded follow-up — the helper exists, it is one line per page), the
`vercel.json` cadence change `0 8 * * *` → `0 * * * *` (Andrew's explicit written
go-ahead, then record it in CLAUDE.md beside the 2026-09-07 precedent), and
Phase 6 steps 1–7 (all Andrew's, including `supabase db push` of this migration
and setting `SIGNUP_SWEEP_DELETE_ENABLED` after the dry-run read).

**Do NOT touch in 4.1a:** `lib/signupSweep.ts` (tier logic done and tested),
`app/api/owner/billing/checkout/route.ts` (the stamp is placed and pinned),
the migration file (never edit an existing migration), `vercel.json`,
`scripts/purge-pending-signup.cjs`, `AUTH_USER_FK_CONSUMERS` /
`tests/lib.auth-users-fk-guard.test.ts`.

---

## Phase 4.1 — Make the retry survive a bad day

**Added 2026-09-09, from Andrew's acceptance test:** *"A partner abandons at the
Stripe page, closes the browser, and three seconds later starts over with the
same email at the same bar. Does that work with no error message?"*

**Today, after Phases 1–3: yes.** Traced end to end — the step-2 pre-check
classifies the abandoned signup `kind: "pending"` and answers `available: true`;
the submit purges it and continues; and because the purge runs BEFORE
`findNearbyVenue`, the partner's own abandoned venue is not rediscovered as a
duplicate at their own address. Three seconds is irrelevant; there is no TTL on
that path.

**This phase is about the days when it does not work.** Andrew's stated design
target is *bad internet, wrong buttons, and people getting sidetracked* — and
under exactly those conditions two things can still put an error in front of an
honest returning partner. Neither is a bug in Phases 1–3; both are correct
decisions whose blast radius is wider than the case they were made for.

### 4.1a — Do not let Stripe block a purge that has nothing at Stripe

`purgePendingSignup` calls `sweepAbandonedIncompleteSubscriptions`, which calls
`stripe.subscriptions.list(...)`, and **aborts the entire purge if that call
fails** (`lib/pendingSignup.ts` → `cancelIncompleteSubscriptions`). The partner
then gets `"Something went wrong. Please try again."`

That abort is RIGHT for the case it was written for: the partner reached Stripe
Checkout and bailed *mid-payment*, so an `incomplete` subscription really can
exist, it really does carry `metadata.venueId` for a venue we are about to
delete, and completing later would write a billing row against a venue that no
longer exists.

It is pure downside for Andrew's case. **A partner who never entered a card has
no Subscription object at Stripe at all** — Checkout does not create one until
payment is submitted. So the round-trip can only ever find nothing, and its only
possible contribution is to fail and block the retry.

**The fix is Phase 4's `checkout_started_at`, reused as a decision rather than a
TTL input.** If every venue in the pending signup has `checkout_started_at IS
NULL`, the partner never reached Stripe, there is nothing to cancel, and the
sweep is skipped entirely — no API call, no failure mode. If any venue is
stamped, today's behaviour is unchanged: sweep, and abort on failure.

- **Depends on Phase 4** for the column and the stamp. Do not hand-roll a second
  signal for "did this reach Stripe" — if 4.1 lands first, do 4's migration and
  checkout stamp first.
- Fail CLOSED on the stamp: `null` means "never reached Stripe" ONLY because the
  stamp is written before the Checkout URL is returned. If that write is ever
  moved later, this optimisation becomes unsafe and must be reverted with it.
  Say so in a comment at both ends.
- Keep the log line. `[PendingSignup] stripe-sweep-skipped venue=… reason=never-started-checkout`
  is what makes a wrong answer visible in production.

---

### Phase 4.1a — AS BUILT (2026-09-09, Sonnet 5)

**Status: code complete. `npx tsc --noEmit`, `npm run lint`, `npm run test`
(239 files passed / 1 skipped, 2414 passing) and `npm run build` all clean.
NOT DEPLOYED. Inert in production two ways: the whole surface is behind
`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` (off), and until the Phase 4 migration is
pushed (`supabase db push` is Andrew's call, Phase 6) the new column read fails
its tolerant fallback and every purge behaves exactly as before this phase.**

#### Files — one source file, two test files, plus this doc

| File | What changed |
| --- | --- |
| **`lib/pendingSignup.ts`** | `PendingSignup` gains `reachedCheckout: boolean`. New private `anyVenueReachedCheckout(venueIds)` — a **separate, tolerant** `venues` read (`select("id, checkout_started_at").in("id", …)`), run in `findPendingSignupByOwnerId` AFTER the four refusal clauses. `cancelIncompleteSubscriptions` takes `reachedCheckout` and short-circuits `return true` (with the `[PendingSignup] stripe-sweep-skipped … reason=never-started-checkout` log) when it is false — a second, narrower short-circuit on the same principle as the existing `stripe === null` one. |
| **`tests/lib.pendingSignup.test.ts`** | `seedPending`'s venue now carries `checkout_started_at` (the "textbook" abandoner reached the Stripe page); two new `reachedCheckout` value assertions on the predicate; a `§4.1a` describe under `purgePendingSignup` — an unstamped signup purges even when the Stripe sweep would **throw** or return `ok:false` (sweep never called), and a stamped one **still** runs the sweep and aborts on its failure. |
| **`tests/api.owner.signup-abandon.test.ts`** | `pendingVenue()` default now stamped (keeps the two existing Stripe-ordering / Stripe-failure route tests valid); one new test — `POST /api/owner/signup/abandon` on an unstamped pending signup 200s and tears down even though `sweepAbandonedIncompleteSubscriptions` is mocked to fail, and never calls it. |

`tests/api.owner.signup.test.ts` and `tests/api.signup.email-available.test.ts`
needed **no change** — their `venues` `.in` fixtures carry no
`checkout_started_at`, so those suites now exercise the `reachedCheckout: false`
path, and neither asserts on the Stripe sweep.

#### Why a separate tolerant read, not a wider `VENUE_CLAIM_COLUMNS` select

`checkout_started_at` is **not** added to `VENUE_CLAIM_COLUMNS` (that string is
shared with proximity discovery and the claim lookup — widening it there is a
different blast radius) and **not** folded into clause 2's load-bearing venues
read. If it were, a missing column (migration not yet pushed) would fail the
whole predicate CLOSED — wedging every retry until the migration lands, which is
the opposite of this phase's goal. The dedicated read is **not load-bearing**:
`anyVenueReachedCheckout` returns `true` on ANY read failure (missing column via
SQLSTATE 42703, a timeout, anything), logging
`[PendingSignup] checkout-stamp-read-failed — assuming reached-checkout`. That is
today's behaviour — run the sweep, abort on its failure. The skip fires **only**
on a clean read that finds every linked venue unstamped. Same conservative
direction as `lib/signupSweep.ts`'s `isMissingCheckoutStampColumn` fallback,
reached differently.

#### No cross-module import

The truthiness test (`Boolean(row.checkout_started_at)`) mirrors `tierOf` in
`lib/signupSweep.ts` but is **re-derived, not imported** — the two modules stay
separate on purpose (owner-id-first / TTL-blind here; owner-first / TTL-aware
there) and `tests/self-serve-signup-contract.test.ts`'s "pending-signup predicate
has exactly one home" block pins this module's import list. It stays
`@/lib/venueClaim` + `@/lib/signupSweep` (`authUserIsUnreferenced`) +
`@/lib/stripeIncomplete`; that assertion is green, untouched.

#### The "comment at both ends" is satisfied

`app/api/owner/billing/checkout/route.ts` already carries the stamp-placement
comment naming `§4.1a` (added in Phase 4's checkout-stamp half). This phase adds
the matching note in `lib/pendingSignup.ts` — on `PendingSignup.reachedCheckout`
and in `cancelIncompleteSubscriptions` — stating the skip is safe **only**
because the stamp is written before the Checkout URL is handed back, and must be
reverted if that write ever moves. `app/api/owner/billing/checkout/route.ts` was
**not edited** (Phase 4 owns it; the do-not-touch list for 4.1a names it).

#### Verified

`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test` **239 files
passed / 1 skipped, 2414 passing** (`lib.pendingSignup` 36 → 41,
`api.owner.signup-abandon` 15 → 16) · `npm run build` clean. Not run against
production — the migration is a local file and the flag is off.

---

### Handoff notes for Phase 4.1b (Opus 5 — the rate-limit keying decision)

**4.1a is done; 4.1b is the last open piece of Phase 4.1.** It is mostly an
argument, and the number in it is Andrew's, not the model's.

**The change (from §4.1b below):** `signupSubmit: { windowSeconds: 3600, max: 5 }`
in `lib/rateLimit.ts` fails **closed** — a 429 with a wait in front of an honest
returning partner is exactly the error this plan exists to remove. Two
independent problems:

1. **`max: 5` is low for the target user.** Every fumble spends a slot — a
   mistyped ZIP that fails server validation, a dropped connection retried, a
   duplicate-venue 409 answered and resubmitted, a supersede. The plan proposes
   **15**; still far below anything useful for scripted account creation, and the
   account table is separately protected by the email-uniqueness check and the
   purge predicate.
2. **The key is the IP, which is not the person.** Shared bar WiFi and
   carrier-grade NAT collapse many people into one bucket, and the partner
   signing up is very often on the venue's own WiFi. The plan floats keying the
   submit bucket on `IP + normalised email`, with an **IP-only outer bucket at a
   higher ceiling** kept alongside. **Decide deliberately** — it weakens the
   anti-spam property (an attacker varies the email), which is exactly why the
   bucket is IP-only today.

**What 4.1a leaves you that matters:**

- `lib/rateLimit.ts`'s quota decision is the `claim_signup_attempt` Postgres RPC
  (count-guarded insert under `pg_advisory_xact_lock`), and `lib/rateLimit.ts`
  fails **closed** on any error including a missing function. If 4.1b adds a
  second bucket key, it is a second `.rpc()` call with the same fail-closed
  contract — do not turn the TS side into a read-then-write. CLAUDE.md's
  self-serve section pins this.
- **Do not touch the `emailCheck` bucket** — CLAUDE.md pins its hour-long window
  as a deliberate anti-enumeration choice, and the step-2 pre-check's fail-**open**
  behaviour is already correct (a 429 there lets the partner through).
- `SIGNUP_RATE_LIMITS` is asserted by `tests/api.signup.email-available.test.ts`
  and the signup contract test — check both when you change the shape.

**Still open after 4.1b:** the ~15 other `/owner/*` pages that still 401 to
`/owner/login` (Phase 3.1's bounded follow-up — `ownerAuthRecoveryPath` exists,
it is one line per page), the `vercel.json` cadence change `0 8 * * *` →
`0 * * * *` (Andrew's explicit written go-ahead, then record it in CLAUDE.md
beside the 2026-09-07 precedent), Phase 5's remaining tier-split coverage in
`tests/api.cron.signup-sweep.test.ts`, and Phase 6 steps 1–7 (all Andrew's,
including `supabase db push` of the Phase 4 migration and setting
`SIGNUP_SWEEP_DELETE_ENABLED` after the 24 h dry-run read).

**Do NOT touch in 4.1b:** `lib/pendingSignup.ts` (4.1a owns `reachedCheckout`),
`lib/signupSweep.ts`, `app/api/owner/billing/checkout/route.ts`, the migration
file, `vercel.json`, `scripts/purge-pending-signup.cjs`, `AUTH_USER_FK_CONSUMERS`
/ `tests/lib.auth-users-fk-guard.test.ts`.

### 4.1b — Five submits an hour is not enough for a fumbling human

`signupSubmit: { windowSeconds: 3600, max: 5 }` (`lib/rateLimit.ts`), and unlike
the step-2 pre-check it fails **closed** — a 429 with a wait is exactly the error
message this plan exists to remove.

Two independent problems:

1. **The count is low for the target user.** Every fumble costs a slot: a
   mistyped ZIP that fails server validation, a dropped connection retried, a
   duplicate-venue 409 answered and resubmitted, a supersede. Six of those in an
   hour and an honest partner is locked out. Raise `max` to **15** — still far
   below anything useful for scripted account creation, and the account table is
   additionally protected by the email uniqueness check and the purge predicate.
2. **The key is the IP, which is not the person.** A bar's shared WiFi and
   mobile carrier-grade NAT both collapse many people into one bucket, and the
   partner signing up is *very often on the venue's own WiFi* — the single most
   likely place for two staff to try this on the same afternoon. Consider keying
   the submit bucket on `IP + normalised email` so one person's fumbling cannot
   lock out the next. **Decide deliberately:** it weakens the anti-spam property
   (an attacker varies the email), which is precisely why the bucket is IP-only
   today. If it goes in, keep an IP-only outer bucket at a higher ceiling.

**Not to be changed:** the `emailCheck` hour-long window (CLAUDE.md pins it as a
deliberate anti-enumeration choice) and the pre-check's fail-OPEN behaviour,
which is already correct — a 429 there lets the partner through.

### What this phase does NOT fix, and should not pretend to

**The partner still retypes everything.** The draft lives in `sessionStorage` and
the password is memory-only, so closing the browser wipes both. "No error
message" is met; "no friction" is not. Resuming a signup by identity is
explicitly rejected in §0.1 — an unpaid signup has no user-visible identity, so
there is nothing to log back into. If the retyping is the real complaint, that is
a *draft-recovery* feature (a signed, short-lived, password-free draft cookie),
and it belongs in its own plan, not here.

**A `billing_subscriptions` row correctly stops the retry.** If the partner got
far enough that a row exists, they have paid or once paid, the classifier returns
`kind: "account"`, and the 409 is right. Andrew's scenario never writes one.

| | |
| --- | --- |
| **Model** | **Sonnet 5** for 4.1a; **Opus 5** for 4.1b's keying decision (it trades an anti-abuse property for a UX one). |
| **Effort** | Low — ~1 h, most of it in 4.1b's argument rather than its diff. |
| **Risk** | 4.1a is risk-reducing. 4.1b widens a public write's rate limit — the number is a judgement call and should be Andrew's. |
| **Status** | **Both done, 2026-09-09.** See the two AS BUILT sections above. 4.1b's number and keying were put to Andrew and chosen by him: 15 inner / 40 outer, identity-first. |

### Phase 4.1b — AS BUILT (2026-09-09, Opus 5)

**Status: code complete. `npx tsc --noEmit`, `npm run lint`, `npm run test`
(239 files passed / 1 skipped, **2424 passing**, up from 2414) and `npm run build`
all clean. NOT DEPLOYED. Inert in production — the whole surface is behind
`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` (off). Unlike 4.1a this phase needs **no
migration**: `claim_signup_attempt` already takes an opaque `p_ip_hash text`, so a
second bucket is a second `.rpc()` call and nothing more.**

#### The decision Andrew made

Asked directly, with the trade spelled out. **Chosen: two-tier, 15 inner / 40
outer, inner checked first.** The rejected options were a tighter 25 outer, an
IP-only raise to 15 (which does not fix the shared-WiFi problem at all), and
leaving it at 5.

| Bucket | Key | Rule | What it is for |
| --- | --- | --- | --- |
| `signupSubmit` | `IP + normalised email` | 15 / 3600s | The fumbling human. Was 5/hour/IP. |
| `signupSubmitIp` | IP alone | 40 / 3600s | The anti-abuse ceiling. New. |

#### Why the order is the design, not a detail

`claim_signup_attempt` **records only ALLOWED calls** — a denial consumes
nothing. That single fact is what makes inner-first correct:

- **Inner first (shipped).** A partner who fumbles to 15 is stopped by their OWN
  bucket, having burned at most 15 of the shared 40. The colleague on the next
  stool still has 25. This is the exact failure §4.1b exists to remove.
- **Outer first (rejected).** The same person keeps claiming outer slots on every
  retry until the venue's whole ceiling is gone, and *then* gets refused —
  reintroducing the bug in a more expensive form.

The outer bucket can never be dropped: the inner one is keyed on
attacker-controlled input, so varying the email mints a fresh inner bucket every
time. The outer bucket does not move, and is therefore the only thing actually
capping account creation from one address. Worst-case scripted abuse goes
5/hour/IP → 40/hour/IP; that is the accepted price, bounded by the
email-uniqueness check and the one-hour purge tier from Phase 4.

#### Files

| File | What changed |
| --- | --- |
| **`lib/rateLimit.ts`** | `signupSubmit` 5 → **15** and re-documented as identity-keyed; new **`signupSubmitIp` 40/3600s**; `hashRequesterIp(bucket, ip, identity = "")` folds the identity in **only when non-empty** (so every existing bucket hashes byte-identically and no live window resets on deploy); `rateLimit`'s third parameter became `{ identity?, rule? }` (no caller passed `rule` positionally); new **`rateLimitSignupSubmit(request, email)`** — the single home of both buckets and their order. |
| **`app/api/owner/signup/route.ts`** | Imports `rateLimitSignupSubmit` instead of `rateLimit`. Gate order is now flag → **body read** → limiter → validation → duplicate → writes. The body moved in front of the limiter because the inner bucket needs the email; the **413 moved behind it** so an oversized body still costs a slot. Module header updated. |
| **`tests/api.signup.rate-limit.test.ts`** | New `§4.1b` describe (7 tests): claim order + each rule's own numbers + two distinct ledger keys; *one person's fumbling does not lock out the next on the same WiFi*; a denied inner bucket spends no outer slot; varying the email is still capped by the outer bucket; case/whitespace normalise to one bucket; an empty identity is one shared per-IP bucket; the outer tier fails closed too. Hash-stability test extended for the identity parameter and for `identity === ""` hashing exactly as before. 22 → 29 tests. |
| **`tests/api.owner.signup.test.ts`** | The 429 test now also pins that only ONE claim happened (denied inner ⇒ outer never consulted). New route-level test: two claims in order with each rule's max, and same IP + different email ⇒ different inner key, **same** outer key. The oversized-body test's slot assertion 1 → 2, with its comment corrected (the limiter no longer precedes the body read). 42 → 44 tests. |
| **`tests/self-serve-signup-contract.test.ts`** | Two static tripwires: the inner claim must appear **before** the outer one in `lib/rateLimit.ts`, and the route must go through `rateLimitSignupSubmit(request, draft.email)` and must not claim a signup bucket itself; plus a guard that `emailCheck` still has its 3600s window. 38 → 40 tests. |
| **`CLAUDE.md`** | New bullet in the self-serve section pinning the two tiers, the order, the reason (allowed-only recording), the body-before-limiter/413-after-limiter ordering. |
| **`docs/self-serve-signup-runbook.md`** | Smoke-test step 4 rewritten — two separate curl recipes (16 same-email submits → 429; 41 different-email submits → 429), and an explicit "do not raise the numbers to get past a demo". |

#### An empty identity is not an escape hatch

An unparseable or oversized body yields `email === ""`. That hashes to the
**plain per-IP key** for the `signupSubmit` bucket, so every such caller from one
IP shares ONE bucket rather than getting a fresh one each time — the same
conservative direction `deriveRequesterIp` already takes when it cannot identify
the caller. Pinned by a test.

#### What was NOT touched

`emailCheck` (CLAUDE.md pins its window; now also pinned by a contract test) and
the pre-check's fail-OPEN behaviour. Everything on 4.1a's do-not-touch list:
`lib/pendingSignup.ts`, `lib/signupSweep.ts`,
`app/api/owner/billing/checkout/route.ts`, the migration file, `vercel.json`,
`scripts/purge-pending-signup.cjs`, `AUTH_USER_FK_CONSUMERS` /
`tests/lib.auth-users-fk-guard.test.ts`.

---

### Handoff notes for the next phase

**Phase 4.1 is closed. 4.1a and 4.1b are both code-complete and unshipped.**
Nothing in Phases 0–4.1 has been deployed or pushed to the database; the whole
feature is still dark behind `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`.

**What is left, in the order it should be taken:**

1. **Phase 5's remaining tier-split coverage in
   `tests/api.cron.signup-sweep.test.ts`** — the one purely-mechanical item left,
   and the only one a model can finish alone. Everything else below needs Andrew.
   Sonnet 5 is enough; read Phase 4's as-built (§"Phase 4 (migration + checkout
   stamp) — AS BUILT") for the tier definitions before writing assertions, and do
   not touch `lib/signupSweep.ts` itself — the behaviour is built, this is
   coverage only.
2. **The ~15 other `/owner/*` pages that still 401 to `/owner/login`** —
   Phase 3.1's bounded follow-up. `ownerAuthRecoveryPath` already exists; it is
   one line per page. Mechanical, low risk, no decisions.
3. **The `vercel.json` cron cadence `0 8 * * *` → `0 * * * *`** — needs Andrew's
   explicit written go-ahead first (`vercel.json` is a hard boundary in
   CLAUDE.md), and when it lands, record it in CLAUDE.md beside the 2026-09-07
   precedent, exactly as the signup-sweep entry was.
4. **Phase 6 steps 1–7 — all Andrew's**, including `supabase db push` of
   `20260909120000_venues_checkout_started_at.sql`, setting
   `SIGNUP_SWEEP_DELETE_ENABLED` after reading 24 h of dry-run lines, and the
   acceptance test below. **Never run `supabase db push` unprompted.**

**Two things the next model will get wrong if it does not read this:**

- **`hashRequesterIp` now takes a third parameter and `rateLimit`'s third
  parameter is an options object.** If you add a new bucket, you almost certainly
  want the plain two-argument form; only pass an `identity` if you have thought
  about what happens when it is empty and when it is attacker-controlled (see the
  §4.1b as-built above — the answer is a shared bucket and an outer IP bucket
  respectively).
- **Do not "simplify" `rateLimitSignupSubmit` back into a single `rateLimit`
  call at the route.** Three tests fail if you do, but the reason is in this
  document and not in the assertion messages: the ordering is the design.

**Still unfixed and deliberately so (§"What this phase does NOT fix"):** the
partner still retypes the whole wizard, because the draft is `sessionStorage` and
the password is memory-only. Draft recovery is a separate plan, not a Phase 4.1
follow-up.

### Acceptance test for Phase 6

Run Andrew's scenario verbatim, twice: once normally, and once with Stripe
unreachable (pull the key, or point `STRIPE_SECRET_KEY` at a dead value in a
preview deploy). Both must complete the second signup with **no error message**.
Before 4.1a, the second run fails.

---

## Phase 5 — Tests

**Goal:** the predicate cannot loosen silently, and the "already exists" sentence
cannot come back.

- New `tests/lib.pendingSignup.test.ts` — a truth table with the **never-purge**
  cases as first-class assertions: has a `billing_subscriptions` row (any status,
  including `cancelled`); a linked venue that is not hidden; a linked venue with
  no `self_serve_created_at` (admin-activated); a venue at `(0, 0)`; an auth user
  referenced by `accounts`, by `users`, or by either Category Blitz table; an
  owner holding a second venue; every read-error path returning `ok: false`.
- Extend `tests/api.owner.signup.test.ts`: supersede succeeds on a pending
  collision, **and a real account still 409s and is never purged**. Also that a
  purge cancels the incomplete Stripe subscription before deleting rows.
- Extend the email-available coverage for the `kind` discriminator — specifically
  that a pending collision answers `available: true`.
- A contract assertion that `findPendingSignupByEmail` has exactly one definition
  and that `app/api/owner/signup/route.ts` does not hand-roll the predicate —
  same shape as the existing `lib/venueClaim.ts` guard.
- Run `npm run test`, `npx tsc --noEmit`, `npm run lint`.
  `tests/lib.auth-users-fk-guard.test.ts` must stay green.

| | |
| --- | --- |
| **Model** | **Sonnet 5** |
| **Effort** | Medium — ~2 h. Volume, not difficulty; the cases are enumerated above. |
| **Risk** | None to production. |

---

### Phase 5 — AS BUILT (2026-09-09, Sonnet 5)

**Status: closed. `npx tsc --noEmit`, `npm run lint`, `npm run test` (240 files
/ 1 skipped, **2427 passing**, up from 2424) and `npm run build` all clean. No
runtime code touched — this phase is coverage only, exactly as scoped.**

**Everything in the plan's checklist except one bullet was already done**,
landed early by the phases that needed the guarantee immediately rather than
waiting for this one:

| Checklist item | Where it actually landed |
| --- | --- |
| `tests/lib.pendingSignup.test.ts` never-purge truth table | Phase 2 as-built (pulled forward per the Phase 1 handoff), extended by 4.1a |
| `tests/api.owner.signup.test.ts` — supersede succeeds, real account still 409s and is never purged | Phase 2 as-built |
| Purge cancels Stripe before deleting rows (ordering) | `tests/lib.pendingSignup.test.ts` (`purgePendingSignup` owns the teardown) and `tests/api.owner.signup-abandon.test.ts` ("Stripe is cancelled before any row delete", asserted as ordering) — Phases 2 and 3. The plan's phrasing pointed at `api.owner.signup.test.ts`, but that suite mocks `@/lib/stripeIncomplete` wholesale (see its file header) rather than asserting ordering, on purpose — the ordering guarantee belongs to `purgePendingSignup` itself, and re-asserting it against a second mock at the route level would just be a second copy of the same test |
| `email-available` — pending collision answers `available: true` | Phase 2 as-built |
| Contract assertion: the predicate has exactly one home, no caller hand-rolls it | Phase 3 as-built (`tests/self-serve-signup-contract.test.ts`, "the pending-signup predicate has exactly one home" — Phase 2's handoff had deferred this to "Phase 3 or 5"; Phase 3 took it, and this phase does not re-add it) |

**The one bullet actually left — "Phase 5's remaining tier-split coverage in
`tests/api.cron.signup-sweep.test.ts`"** (named in the Phase 4.1b handoff, the
last item on the "what's left" list). Phase 4's own as-built work had already
landed 16 assertions there (41 → 57 tests) covering the tier split's main
shape; what those left out, and what this phase added — **4 new tests, 57 →
60**, all inside the existing `"the tier split (Phase 4)"` describe block:

1. **`reports tierSplitActive: true on a normal tiered run`** — every existing
   assertion of `tierSplitActive` was on the *negative* path (the fallback
   test sets it false; the read-error test leaves it true incidentally,
   unchecked). Nothing previously pinned the affirmative case directly.
2. **`sweeps a Tier A and a Tier B venue in the SAME run without
   cross-contaminating tallies`** — every prior test seeded exactly one
   candidate venue. This is the case the plan's own doc comment in
   `lib/signupSweep.ts` calls out as the reason the scan is one query
   partitioned in memory rather than two tier-scoped queries: two different
   partners, two different clocks, one pass. Asserts `tierA: 1`, `tierB: 1`,
   both deleted, and that each venue's `tier` field and deleted auth user are
   attributed to the RIGHT venue, not swapped or merged.
3. **`does NOT sweep a Tier A candidate alongside a Tier B venue that has not
   cleared ITS window`** — the companion negative case: a venue old enough
   for Tier A's one-hour TTL is not a free pass for a DIFFERENT venue that is
   old enough for Tier A's TTL but not its own (Tier B's) 7-day window. Proves
   one venue's tier is computed from its own row, never borrowed from another
   candidate fetched in the same page.
4. **`tierA`/`tierB` both 0 in the missing-column fallback test** — the
   existing fallback test asserted `tierSplitActive: false` and the row's
   `tier: "stamp-column-missing"` but not that neither counter attributes to
   it. Added as an extra assertion on the existing test rather than a new one.

**Why nothing else was added.** Before writing these, I checked for the other
plausible gaps and decided each was already covered or not worth a dedicated
test: the exact-boundary (`>=`) cases at both TTLs are exercised by the
existing "younger than the TTL" / "just cleared it" pairs; the safety-rail
interaction with a mixed tier set was judged low-value on top of the new
mixed-run test above, since the rail counts *eligible* candidates regardless
of which tier they fall in and that logic doesn't branch on tier at all.

**Do NOT touch in whatever picks up Phase 6:** none of this phase's files are
runtime code, so there is nothing to protect here beyond the usual — but note
`tests/api.cron.signup-sweep.test.ts`'s `seedVenue` helper and `venueScans()`
accessor are now used by 4 more tests than before; keep their shapes if you
touch that describe block again.

---

### Handoff notes for Phase 6 (all steps are Andrew's; nothing here for a model to execute unprompted)

**Everything that could be shipped by a model without Andrew is now shipped.**
Phases 0–5 are all code-complete, tested (2427 passing, up from the 2322 that
started this plan), and **NOT DEPLOYED** — the entire surface stays inert
behind `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` (off) and
`SIGNUP_SWEEP_DELETE_ENABLED` (unset). Nothing about that changes with this
phase; it added tests only.

**What is left, in the order Phase 6 lists it, is entirely Andrew's:**

1. Run `scripts/purge-pending-signup.cjs` against production (dry run, then
   `--delete`), confirm the three `fake@emailaddress.com` rows are gone, and
   re-run the wizard with that email through Stripe test mode end to end.
2. Deploy Phases 1–5 together. Push the
   `20260909120000_venues_checkout_started_at.sql` migration
   (`supabase db push` — **never run this unprompted**, it applies to the
   LINKED PRODUCTION database) and probe that `tierSplit=true` shows up in the
   `[SignupSweep] run …` cron log line afterward. If it stays `false`, the
   migration did not land and the sweep is quietly running the pre-Phase-4
   single 7-day window.
3. Read 24 h of `[SignupSweep] venue-sweep-dry-run` lines and confirm the Tier
   A projection is debris only, THEN set `SIGNUP_SWEEP_DELETE_ENABLED`
   (server-side env var, no redeploy).
4. Change the cron cadence `0 8 * * *` → `0 * * * *` in `vercel.json` — **a
   hard boundary in CLAUDE.md, needs Andrew's own explicit written go-ahead**,
   exactly like the existing `/api/cron/signup-sweep` entry got on
   2026-09-07. Record the new go-ahead in CLAUDE.md beside that precedent so
   the next reviewer does not re-flag it.
5. The manual phone pass (headless cannot verify the Stripe hop) — the four
   scenarios already written into the plan's Phase 6 §7, plus the
   Phase 3.1 addendum at the end of `docs/self-serve-signup-device-checklist.md`
   §8a (the stale-owner-cookie / `no_venue` redirect case).
6. Update CLAUDE.md's self-serve section per Phase 6 §8 — most of this is
   already there from earlier phases (the pending-signup definition, the
   supersede rule, the two TTL tiers are all documented under "Partner
   Self-Serve Signup"); what is NOT yet there is the cron-cadence change
   itself, which only exists once step 3 above happens, and should be recorded
   in the same edit as that go-ahead.

**Nothing is blocked on a model for any of the above.** If you are a model
reading this file to continue the work: there is no more code to write until
Andrew has done steps 1–4. The one exception, if he asks for it separately, is
the bounded follow-up Phase 3.1 named and left open on purpose — the other
~15 `/owner/*` pages that still `router.push("/owner/login")` on any 401
instead of reading `body.code` through `ownerAuthRecoveryPath()`. That is
mechanical, low-risk, one line per page, and not part of this plan's scope —
raise it as a separate ask rather than doing it silently inside a "Phase 6"
commit.

---

## Phase 6 — Ops and verification

1. Phase 0 script, dry run, against production. Confirm it reports the three
   `fake@emailaddress.com` rows and nothing else.
2. Same script with `--delete`. Re-run the wizard with that email end to end
   through Stripe test mode — it must complete.
3. Deploy Phases 1–5. Push the `checkout_started_at` migration and probe it.
4. Read 24 h of `[SignupSweep]` dry-run lines. Confirm the Tier A projection is
   only debris.
5. Set `SIGNUP_SWEEP_DELETE_ENABLED` (server-side, no redeploy).
6. Change the cron to hourly **only after** Andrew's explicit go-ahead on
   `vercel.json`; redeploy.
7. Manual pass on a phone — headless cannot verify the Stripe hop. Add to
   `docs/self-serve-signup-device-checklist.md`:
   - abandon at the review step → nothing written;
   - abandon on `/owner/billing/setup` via "Cancel and start over" → rows gone
     immediately;
   - abandon by closing the browser, **immediately** retry the same email → the
     wizard proceeds with no message (this is the Phase 2 assertion, and it must
     pass with no waiting);
   - abandon on the Stripe page itself, return, retry the same email → proceeds,
     and the incomplete Stripe subscription is cancelled.
8. Update CLAUDE.md's self-serve section: that an unpaid signup is not an
   account, the pending-signup definition and its single home, the supersede
   rule, the two TTL tiers, and the cron-cadence precedent note.

| | |
| --- | --- |
| **Model** | **Sonnet 5** for the doc and checklist edits. Steps 1–7 are Andrew's. |
| **Effort** | Low for the code side; the calendar time is the 24 h dry-run read. |

### Phase 6 — AS BUILT (2026-09-09, Sonnet 5)

**Status: the model-executable half (step 8 + the step 7 checklist copy) is
done. Steps 1–7 are production ops and remain Andrew's — see "What Andrew must
do" below. No code changed; `npm run test` etc. not re-run (docs only).**

Shipped:

- **`docs/self-serve-signup-device-checklist.md`** — new sub-section
  **"Retry & supersede (Phase 6 §7)"** at the end of §8a, four checkbox items:
  abandon at review → nothing written; abandon via "Cancel and start over" →
  rows gone that second + `/info` + cookie cleared; abandon by closing the
  browser then immediately retry the same email → wizard proceeds with no
  message; abandon on the Stripe page then retry → proceeds and the `incomplete`
  subscription shows `canceled` in the test-mode dashboard. (The Phase 3.1
  stale-cookie / `no_venue` item was already there from that phase.)
- **CLAUDE.md**, "Partner Self-Serve Signup" section — the stale
  "`ownerEmailExists()` is the single home" bullet was replaced with the current
  model: an unpaid signup is not an account (§0.1); `classifyEmailForSignup()` /
  `findPendingSignupByOwnerId` / `purgePendingSignup` in `lib/pendingSignup.ts`
  and their four-clause fail-closed predicate; the supersede rule and its
  accepted trade; `POST /api/owner/signup/abandon`; the `no_venue` vs
  `no_session` 401 split (`lib/ownerAuthCodes.ts`); `OWNER_EMAIL_TAKEN_MESSAGE`
  reachable only for `kind: "account"`. Two more bullets added near the sweep
  bullets: the **two TTL tiers** (Tier A `checkout_started_at IS NULL` →
  `PENDING_SIGNUP_TTL_MINUTES` default 60 / floor 15; Tier B stamped → 7 days
  from the later stamp; the missing-column fallback), and a **cron-cadence**
  bullet stating `0 8 * * *` stands until Andrew's explicit written go-ahead for
  `0 * * * *`, to be recorded there beside the 2026-09-07 precedent.

**What Andrew must do to bring this plan into production** — nothing here is
blocked on a model; do them in this order:

1. **Purge the test row.** Dry run first:
   `npm run signup:purge-pending -- fake@emailaddress.com`
   — confirm it prints only the three `fake@emailaddress.com` rows from §0 and
   `=> Predicate PASSED`. Then:
   `npm run signup:purge-pending -- fake@emailaddress.com --delete`.
2. **Re-run the wizard end to end** with `fake@emailaddress.com` through Stripe
   **test mode** — it must complete: signup → Checkout → return → venue appears
   in the player join list → welcome email.
3. **Deploy Phases 1–5** (one deploy — the branch is code-complete and inert
   behind the flags). In the **same deploy or after it, never before**, push the
   migration:
   `supabase db push` → applies `20260909120000_venues_checkout_started_at.sql`
   to the linked production DB (it prompts; this is your call). The stamp code
   ships in the same deploy, so there is no window where a paying partner looks
   like Tier A.
4. **Probe the migration landed.** After the next `/api/cron/signup-sweep` run,
   check the `[SignupSweep] run …` log line shows `tierSplit=true`. If it says
   `false`, the column did not arrive and the sweep is silently on the old
   single 7-day window — fix before step 6.
5. **Flip the self-serve flag when ready for the wizard to be live:** set
   `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1` (Vercel env, `NEXT_PUBLIC_*` →
   **redeploy** for it to take effect). This is the existing self-serve rollout
   switch, gated by `docs/self-serve-signup-runbook.md` / the domain-split
   sequencing — not new to this plan. Everything in Phases 1–5 is inert until
   this is on.
6. **Read ~24 h of `[SignupSweep] venue-sweep-dry-run` lines.** Confirm every
   projected Tier A deletion is debris (no `billing_subscriptions` row, hidden,
   self-serve-stamped). `scanned - candidates` is the in-flight population —
   sanity-check it is small. Then set `SIGNUP_SWEEP_DELETE_ENABLED=1` (Vercel
   env, server-side, **no redeploy**). The sweep now deletes.
7. **(Optional, later) Hourly cron.** Only if Tier A debris living up to a day
   is unacceptable: give yourself explicit written go-ahead to change
   `vercel.json` `0 8 * * *` → `0 * * * *`, make the edit, record the go-ahead
   in CLAUDE.md beside the 2026-09-07 precedent, redeploy.
8. **Manual phone pass** — `docs/self-serve-signup-device-checklist.md` §8 / §8a,
   including the new "Retry & supersede" four and the Phase 3.1 stale-cookie
   item. Headless cannot verify the Stripe hop; only you can close that file.

**Follow-up — DONE (Andrew's ask, 2026-09-09).** The other `/owner/*` pages that
`router.push("/owner/login")` on any 401 now read `body.code` through
`ownerAuthRecoveryPath()` (`lib/ownerAuthCodes.ts`), so a purged partner with a
`/owner/dashboard` (or `/schedule`, `/billing`, `/account`, `/competitions`,
`/game-settings`, `/category-blitz`, `/display`) bookmark lands on the signup
flow, not a login page for an account that no longer exists. 15 call sites across
8 files, each: import `ownerAuthRecoveryPath`, and in the 401 branch
`const body = (await res.json().catch(() => ({}))) as { code?: string };
router.push(ownerAuthRecoveryPath(body.code));`. `ownerAuthRecoveryPath` falls
back to `/owner/login` for a missing/unknown code, so mutation-handler 401s (an
expired cookie → `no_session`) are unchanged. The Phase 3.1 contract assertion
("`no_venue`/`no_session` literals appear only in `lib/ownerAuthCodes.ts`") stays
green — no call site names the literal.

---

## Phase 7 — Optional: true payment-first materialization — **DECLINED (Andrew, 2026-09-09)**

**Not being built.** Andrew's call: Phases 1–5 deliver the partner-visible
behaviour, and payment-first trades a harmless failure mode (unpaid debris,
reaped as hygiene) for a harmful one (a charged partner with no account and no
self-serve recovery — §0.3). This section is kept for the record only; do not
pick it up without a fresh, explicit ask that supersedes this line.

Only if you want the literal guarantee that *nothing whatsoever* is written
before Stripe settles. Phases 1–5 already deliver the partner-visible behaviour,
and this trades a harmless failure mode for a harmful one (§0.3).

If pursued, the shape that avoids storing a password: keep the venue and owner
writes where they are, but move **password collection to after payment** —
Checkout first, then a set-your-password screen on return. That removes the
credential-before-account problem entirely and leaves only the auth user to
defer. It is a redesign of the wizard's step order and belongs in its own plan.

| | |
| --- | --- |
| **Model** | **Opus 5** |
| **Effort** | High — multi-day. Touches the wizard, the checkout route, the webhook, and both visibility followers. |

---

## Summary

| Phase | What it delivers | Model | Effort |
| --- | --- | --- | --- |
| 0 | `fake@emailaddress.com` usable again today | Sonnet 5 | Low (~45 m) |
| 1 | One guarded definition of "pending signup" + Stripe-safe purge | **Opus 5** | Med-high (~2.5 h) |
| **2** | **Retry works at t=0; the "already exists" message becomes unreachable** | **Opus 5** / Sonnet 5 | Med (~2.5 h) |
| 3 | Explicit "Cancel and start over" purges immediately | Sonnet 5 | Med (~1.5 h) |
| 3.1 | 401s say WHY, so a purged partner reaches signup instead of a login page for an account that no longer exists | **Opus 5** | Low (~45 m) |
| 4 | 1-hour retention tier; hourly sweep (hygiene only) | **Opus 5** (+Sonnet) | Med-high (~2.5 h) |
| 4 — tier split | **DONE 2026-09-09 (Opus 5).** Two tiers in `lib/signupSweep.ts`, safe before the column exists | — | — |
| 4 — migration + stamp | **NEXT (Sonnet 5).** `venues.checkout_started_at` + the write in `POST /api/owner/billing/checkout`. Deploy the stamp code no later than the migration | — | — |
| 4.1 | The retry survives a Stripe outage and a fumbling human (Andrew's acceptance test) | Sonnet 5 / **Opus 5** | Low (~1 h) |
| 5 | Tests pinning the predicate and the message's unreachability | Sonnet 5 | Med (~2 h) |
| 6 | Ops sequence, device checklist, CLAUDE.md | Sonnet 5 + Andrew | **Docs DONE 2026-09-09.** Ops steps 1–8 are Andrew's (see Phase 6 AS BUILT). |
| 7 | ~~Optional payment-first rewrite~~ **DECLINED (Andrew, 2026-09-09)** | — | — |

**Requirement #1** (start over freely, immediately) is delivered by **Phase 2**.
**Requirement #2** (nothing saved) is delivered by Phase 3 for an explicit
abandon and Phase 4 for a silent one — both as data hygiene, with nothing
user-facing depending on their timing.

**No open decisions.** The Resume / Start over variant offered in the previous
draft is withdrawn per §0.1; supersede is the behaviour.
