# Partner Self-Serve Signup — Cutover & Ops Runbook

**Purpose:** the exact, ordered steps to turn on partner self-serve signup
(`/owner/signup`) in production, the ops prerequisites that must be true first,
the smoke tests, and the one-flag reversal. This is the execution detail behind
`docs/partner-self-serve-signup-plan.md` Phase 7 and `SYSTEM_CONTEXT.md` §0.

**Status when written (2026-09-07):** all of Phases 0–6 are shipped and inert.
`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is absent from every environment, so
`/owner/signup` and all four public routes 404, `/owner/register` still runs its
legacy venue-lookup flow, and the `/info` partner CTAs resolve to
`/owner/register`. Executing this runbook is a **config operation — no code
change is required** to go live.

---

## 0. Mental model (read first)

- **There is ONE switch:** `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`. Off (default)
  = today's `/owner/register` venue-lookup flow, fully inert. On = the six-step
  `/owner/signup` wizard; `/owner/register` 308-redirects to it; the `/info`
  partner CTAs and `/owner/login`'s "Create an account" link point to it.
- **Single reader:** `isSelfServeSignupEnabled()` in `lib/selfServeSignup.ts`.
  Nothing else reads the env var. Same reversible convention as
  `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`.
- **The flag is a `NEXT_PUBLIC_*` value inlined at build time.** The *page*
  `/owner/signup` and `/owner/register` are statically prerendered, so **setting
  the env var only takes effect on the next build/deploy.** The four API routes
  are dynamic and pick the env var up without a redeploy — which means a
  mid-rollout deploy skew shows as a *live wizard whose submit 404s*. The client
  special-cases 404 with "Signup isn't available yet", so the failure is legible,
  but the fix is: **set the env var, then redeploy**, in that order.
- **Admin Activate-a-Venue survives.** `components/admin/mobile/ActivateVenueFlow.tsx`
  is not deleted and not disabled — ops still needs it for offline-billed venues,
  for adding a second venue to an existing owner (self-serve is **one venue per
  email**), and for support fixes. Self-serve stops it being a *prerequisite*,
  nothing more.
- **The abandoned-signup sweep is a separate switch set later.** `/api/cron/signup-sweep`
  is deliberately NOT gated on this flag (debris outlives a flag). It ships
  log-only. Do not enable its deletion flags as part of this cutover — see §5.

**Reversal is instant:** remove or zero `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`
and redeploy. The four routes 404 again the moment the env var is gone (no
redeploy needed for them); the pages revert on the redeploy. No data migration,
no code revert. Venues already created hidden are collected by the sweep (§5).

---

## 1. Environment variables

| Var | State at cutover | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` | **set to `1`** | The master flag. `1\|true\|yes\|on` = on. Absent = off. |
| `GOOGLE_MAPS_API_KEY` | already set — **now server-only** (§2) | Server-side Places / Static Maps / Geocoding `fetch`. Must NOT be referrer-restricted. |
| `GOOGLE_MAPS_BROWSER_KEY` | **new — REQUIRED before the flag flip (§2)** | The key `/api/*/maps-key` hands to the browser. `/api/admin/maps-key` falls back to `GOOGLE_MAPS_API_KEY` if unset; the public `/api/signup/maps-key` does **not** — it 503s (review-fix Phase 2, Finding #5). |
| `SESSION_SECRET` | already set | Salt for the hashed-IP rate-limit key (`lib/rateLimit.ts`). No new value needed. |
| `CRON_SECRET` | already set | Bearer token for `/api/cron/signup-sweep` (§5 smoke test). |
| `SIGNUP_SWEEP_DELETE_ENABLED` | **stays absent** | Enables the abandoned-venue sweep's deletes. Enable later, separately (§5). |
| `SIGNUP_SWEEP_AUTH_DELETE_ENABLED` | **stays absent** | Enables orphaned-`auth.users` deletion. The dangerous one — §5. |

No `.env` changes were made by any signup phase; every value above except the
master flag and the two sweep flags already exists for other features.

---

## 2. Ops prerequisite — split the Google Maps key into browser + server (Risk #1)

**Why this is not a one-line "add a referrer restriction".** Today one key,
`GOOGLE_MAPS_API_KEY`, does two incompatible jobs:

1. **Browser** — `/api/admin/maps-key` and the PUBLIC `/api/signup/maps-key` hand
   it to the client, which loads the Maps JavaScript API in-page. Because the
   signup route serves it to unauthenticated strangers, it MUST be
   HTTP-referrer-restricted to our hosts or a scraper bills Google against us.
2. **Server** — `lib/geolocation.ts` (Places API v1), `/api/*/venue-map` (Static
   Maps), `/api/admin/places` all call Google with `fetch` from a Vercel
   function. **A server request carries no `Referer`, so a referrer-restricted
   key returns `REQUEST_DENIED` for every one of these.**

So restricting the single key breaks admin venue maps, the player join-flow
address lookup, and the new signup server routes. The fix is **two keys in the
same Google Cloud project**, wired in the code already (`lib/googleMapsKeys.ts`).

**Two accessors, and the difference is the whole of Finding #5.**
`browserGoogleMapsKey()` returns `GOOGLE_MAPS_BROWSER_KEY` and falls back to
`GOOGLE_MAPS_API_KEY` — correct for the authenticated `/api/admin/maps-key`, and
the reason admin behaviour is unchanged today. `publicBrowserGoogleMapsKey()`
has **no fallback**, and it is what the public `/api/signup/maps-key` serves: with
`GOOGLE_MAPS_BROWSER_KEY` unset that route returns **503** and logs
`[SignupMapsKey] browser-key-unset`. Setting the env var is therefore a hard
prerequisite of the flag, enforced in code rather than by this document.

### Done via `gcloud` on 2026-09-08 (project `hightop-challenge`, #794384744178)

- **Browser key created** — display name `hightop-maps-browser`, uid
  `ed2e8331-c7dd-4608-aed3-85383d0ae56f`. Restrictions:
  - Websites (HTTP referrers): `https://hightopchallenge.com/*`,
    `https://www.hightopchallenge.com/*`, `https://play.hightopchallenge.com/*`,
    `https://*.vercel.app/*`, `http://localhost:3000/*`.
  - API target: **Maps JavaScript API only** (`maps-backend.googleapis.com`).
  - Retrieve the key string with:
    `gcloud services api-keys get-key-string projects/794384744178/locations/global/keys/ed2e8331-c7dd-4608-aed3-85383d0ae56f`
- **Maps Static API enabled** (`static-maps-backend.googleapis.com`) — it was NOT
  enabled on the project, so the review-step thumbnail *and* the existing admin
  venue-map route would have returned an error image. The signup review step
  treats the thumbnail as non-fatal, so this was a silent gap.
- **The existing "Maps Platform API Key"** (uid
  `38c32360-45a7-42b3-823d-bef44ec96a18`) is the SERVER key and was left
  untouched: no application restriction (correct — server `fetch` has no
  `Referer`), and its API-target list already covers Places, Geocoding and Static
  Maps.

### The one remaining action (Andrew)

**Set `GOOGLE_MAPS_BROWSER_KEY`** to the `hightop-maps-browser` key string in the
Vercel project (Production + Preview) and in local `.env`, then redeploy.

Since review-fix Phase 2 the failure mode of skipping this is **visible, not
silent**: the public `/api/signup/maps-key` 503s and the wizard's address and
geofence steps show "Address maps are temporarily unavailable" instead of leaking
the unrestricted server key. The ops step is unchanged — **do not flip
`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` on until this is done** — but a
mid-rollout env skew now costs a broken map, not a scrapeable key.

### Verify after setting it

- Signup map: `/owner/signup` step 5 renders the map (needs the flag on).
- **Admin venue map:** `/admin` → Venues → Activate a Venue → the map still loads
  and the address autocomplete still returns predictions (browser key for the
  map, server key for Places).
- Player join flow: pick a venue, confirm address lookups still work
  (`lib/geolocation.ts`, server key).

### Optional later hardening (not required for the flag flip)

Tighten the server key: API restrictions → **Places API (New)**, **Maps Static
API**, **Geocoding API** only (it currently allows ~30 Maps services), and/or an
IP restriction to Vercel's egress range. Leave its application restriction as
None either way.

---

## 3. Database migration

Applied to the production Supabase project on 2026-09-07 (`supabase db push`):
`20260907130000_partner_self_serve_signup_foundations.sql`
(`venues.self_serve_created_at`, `signup_attempts` + its index) and
`20260907140000_venue_owner_venues_unique_venue.sql` (the claim-path unique
index).

`20260908120000_signup_attempt_atomic_rate_limit.sql` (review-fix Phase 2,
Finding #6) — **applied to production 2026-09-08** (`supabase db push`, by
Andrew). It adds the `claim_signup_attempt` RPC, which is now the *only* thing
that decides a rate-limit quota. **Verified against the production project the
same day**, not just pushed: the function exists and is callable by
`service_role`; an empty `p_ip_hash` fails closed; a sequential probe at
`p_max = 3` returned allow/allow/allow/deny with `retry_after_seconds` inside the
window; **20 parallel calls against `p_max = 5` allowed exactly 5** (the
concurrency guarantee the whole migration exists for); and `anon` is denied with
`42501 permission denied for function claim_signup_attempt`. The eight probe rows
were deleted afterwards.

`20260908130000_venues_rehidden_at.sql` (review-fix Phase 3) — **applied to
production 2026-09-08** (`supabase db push`, by Andrew). It adds `venues.rehidden_at`
plus a partial index; additive (`add column if not exists`, no backfill, no
default). Verified live: `select id, hidden, rehidden_at from venues limit 3`
returns the column (`null` on every row). Phase 9 (lapsed-venue re-hide) now
**writes** it — `maybeRehideVenue` and the cron re-hide job stamp it, and every
un-hide path clears it — but that half ships flag-gated (`VENUE_REHIDE_ENABLED`)
and log-only, so no row is stamped until the flag flips.

**For any future environment (staging, a fresh project): migrations BEFORE flag,
in that order.** Without `signup_attempts` OR without `claim_signup_attempt` the
rate limiter fails closed and every `/api/signup/*` call returns **503**, not 429,
with a log line naming the missing migration file (`[SignupRateLimit]
signup_attempts-missing` or `[SignupRateLimit] claim_signup_attempt-missing`).

`venue_owner_venues` claim-path precondition, recorded in the migration header
and reproducible with `npm run signup:check-claim-precondition`: **4 rows, 4
venues, 0 duplicates** as of 2026-09-07.

---

## 4. Cutover order

1. **Migrations applied** (§3) — all three signup migrations are done for
   production (two on 2026-09-07, `claim_signup_attempt` on 2026-09-08 and
   verified against the live project). Re-check all three for any new env.
   `20260908130000_venues_rehidden_at.sql` is outstanding but does **not** gate
   this cutover — no Phase 3 code touches that column.
2. **`GOOGLE_MAPS_BROWSER_KEY` set to a referrer-restricted key** (§2), and both
   the admin venue map and the player join-flow address lookup re-verified.
3. **Set `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1`** in the Vercel project
   (Production; also Preview if you want the wizard on preview URLs — note
   `signup_attempts` is shared, so preview traffic counts against the same
   windows). *Done 2026-09-07 per Andrew — verify it is present before deploying.*
4. **Redeploy** (Production). The static pages only switch on this build.
5. **Run the smoke tests** (§6).

`vercel.json` cron entry for the sweep — **added 2026-09-07**
(`{ "path": "/api/cron/signup-sweep", "schedule": "0 8 * * *" }`, daily 08:00
UTC). Vercel attaches `Authorization: Bearer $CRON_SECRET` automatically, same as
the other crons. Both sweeps are still log-only (§5), so this only starts the
daily `[SignupSweep] run …` log line and the `signup_attempts` prune.

---

## 5. The abandoned-signup sweep — enable LATER, separately

`/api/cron/signup-sweep` runs three jobs. Job 1 (prune expired `signup_attempts`)
is always on and deletes only rate-limit ledger rows nothing reads. Jobs 2 and 3
**ship log-only** and each needs its own env flag:

- `SIGNUP_SWEEP_DELETE_ENABLED` — job 2: delete venues that are `hidden = true`
  AND `self_serve_created_at < now() - 7 days` AND have no `billing_subscriptions`
  row, plus their owner rows.
- `SIGNUP_SWEEP_AUTH_DELETE_ENABLED` — job 3: delete the orphaned `auth.users`
  rows a failed signup unwind left behind. **This is the dangerous one.**

**Both stay absent at cutover.** Enable them only after a week of reading the
`[SignupSweep] run …` log lines, and only after:

1. **`npm run signup:check-orphan-auth-users` returns clean** (exit 0, nothing
   sweep-eligible). It runs the sweep's exact predicate against production,
   read-only. Understand **every** email it lists under `orphans.candidateEmails`
   before setting `SIGNUP_SWEEP_AUTH_DELETE_ENABLED` — each is a row the sweep
   will delete.
2. A `?dryRun=1` run (§6) shows `venues.candidates` and `orphans.candidates` at 0
   or a handful you can account for.

**The one sentence support must not get wrong:** *an `auth.users` row with no
email is an anonymous player session, never a partner, and must never be deleted
to "fix" a signup.* Production has ~765 such rows and every one is a player;
`lib/auth.ts`'s `signInAnonymously()` mints one per anonymous visit. The sweep's
email filter and reserved-domain filter are what keep it off them, plus a
`ORPHAN_MAX_DELETES_PER_RUN = 25` circuit breaker. `POST /api/owner/signup`
always sets an email; `signInAnonymously()` never does.

**The reveal has no observable outside the Stripe webhook.** Do not add a smoke
step that says "check the venue appears after signup" — the venue appears after
*payment*, when `checkout.session.completed` (or, on the 3-D Secure path,
`customer.subscription.updated`) lands and `maybeRevealVenue` flips `hidden`. The
end-to-end reveal checks live in `docs/self-serve-signup-device-checklist.md` §8
/ §8a and can only be signed off on a live Stripe test-mode run.

**If a reveal is ever missed, the daily billing cron repairs it — do not fix it
by hand and do not make the webhook throw.** Review-fix Phase 3 (Finding #3)
added `repairMissedVenueReveals` to `/api/cron/billing` (daily, already
`isCronAuthorized`; no new cron route, no new `vercel.json` entry). Each run
scans hidden, self-serve-stamped venues, joins them to `billing_subscriptions`,
and un-hides any that are live (`active` **or** `past_due`). It is **not** behind
a flag: it only ever does what the webhook was already supposed to do.

Ops reading:

- `POST /api/cron/billing` returns `{ ok, offlineExpired, venueReveal }`;
  `venueReveal` carries `scanned`, `candidates`, `revealed`, `venueIds`,
  `deferred`, `errors`.
- **`[VenueVisibility] reveal-repair revealed venue=<id>` is a warning, not a
  success line.** Every one of them is a reveal the Stripe webhook should have
  done and did not. A steady trickle means the webhook follower is failing —
  look at `[stripe-webhook] reveal-venue-failed` / `-threw` first.
- `?dryRun=1` reports candidates and writes nothing. It does **not** affect the
  offline-grant expiry sweep in the same handler.
- The job fails **closed**: a failed venue or billing read reveals nothing and
  reports the error. It reveals at most `REVEAL_MAX_PER_RUN` (25) per run and
  defers the rest to the next day rather than dropping them.

---

## 6. Smoke tests

**Flag OFF (before cutover, or after reversal):**

- `curl -i https://<host>/api/signup/maps-key` → **404**.
- `https://<host>/owner/signup` in a browser → **404**.
- `https://<host>/owner/register` → the legacy two-step venue-lookup form.
- `/info` "Get Started" / "Get Your Venue Started" → lands on `/owner/register`.

**Flag ON (after the redeploy), signed out:**

1. `curl -i https://<host>/api/signup/maps-key` → **200** once; after ~10 calls in
   a minute → **429** with a `Retry-After` header. Body shape is
   `rateLimitResponse`'s `{ ok: false, error }`.
2. `POST https://<host>/api/signup/places` with `{ "query": "cheers", "sessionToken": "smoke" }`
   → **200** with `predictions`. A query under 3 chars → `{ ok: true, predictions: [] }`
   without spending a slot.
3. `GET https://<host>/api/signup/venue-map?lat=39.7&lng=-104.9&radius=150` → **200**
   image bytes; a bad/blank coordinate → **400** before the limiter.
4. `POST https://<host>/api/owner/signup` with a deliberately incomplete body →
   **400** naming the first unmet step. An over-length field → **400** ("… is too
   long — use N characters or fewer", never a truncated write). A body over 16 KB
   → **413**. Five valid-shaped submits from one IP in an hour → the sixth is
   **429** (`signupSubmit` window is 5/hour/IP — a bar with staff behind one NAT
   can hit this during a demo; the 429 copy is `rateLimitResponse`'s).
5. `https://<host>/owner/signup` renders the full-bleed wizard (no OwnerShell
   card, no 720px clamp); `/owner/register` 308-redirects to it.
6. **The data-model smoke test:**
   `curl -i -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/signup-sweep?dryRun=1"`
   → **200**. Expect `venueCandidates=0` and `orphanCandidates=0`-to-a-handful on
   a healthy DB, and `attemptsPruned` = whatever the rate limiter has
   accumulated. `?dryRun=1` forces report-only regardless of the sweep flags, so
   this writes nothing but the ledger prune. It exercises the venue predicate,
   the seven-table `auth.users` guard and the prune in one call.

Then hand `docs/self-serve-signup-device-checklist.md` to Andrew for the real
phone. Nothing headless can sign that off.

---

## 7. Support notes (refusals that are not bugs)

- **`POST /api/owner/signup` 413** = request body over 16 KB. **400 "… is too
  long"** = an over-length field. Both are refusals; nothing is ever silently
  truncated. A clipped venue name would surface on the venue TV screen in front
  of customers — hence reject, not truncate.
- **`email_taken` 409** = that email already has a partner account. Self-serve is
  **one venue per email**; a partner with two bars gets this on the second, and
  the answer is "an admin adds the second venue via Activate-a-Venue", not "it's
  broken". The client shows the 409 `error` string as a footer hint pointing at
  `/owner/login`.
- **Orphaned-auth-user 409** (`[OwnerSignup] orphan-auth-user` in the log, with
  the email) = the email matches a pre-existing `auth.users` row with no
  `venue_owners` row. The route refuses to adopt it — that would be an
  account-takeover vector against players. The partner is pointed at
  `partnerships@hightopchallenge.com`. Support's fix is to delete the stale
  `auth.users` row **only after confirming it has no row in any of the seven FK
  tables** in `CLAUDE.md`'s "`auth.users` is SHARED WITH PLAYERS" section (or to
  wait for the sweep once its flag is on) — **and only if that row has an
  email.** An emailless row is a player; deleting it detaches their identity.
- **`venue_available` / `venue_claimed` 409** = the submitted pin is within
  `SIGNUP_DUPLICATE_RADIUS_METERS` (150 m) of an existing venue. Unowned → the
  client shows a claim path; owned → "sign in instead". Neither offers "create it
  anyway".
- **429 vs 503 on any `/api/signup/*` route:** 429 = rate limited, `Retry-After`
  set. 503 = `rateLimit` failed closed because Supabase was unreachable (a public
  Google-billed route must not degrade open). The client copy for 503 says "try
  again in a moment", not "you're going too fast".

---

## 8. What is deliberately still open (not defects)

- **Re-hiding a lapsed subscriber's venue** — the mechanism is BUILT
  (`docs/lapsed-venue-rehide-plan.md`, Phases 0–3 + tripwires): `maybeRehideVenue`
  in the Stripe webhook and `reconcileLapsedVenues` in `/api/cron/billing`
  re-hide a lapsed self-serve venue at period end and restore it on resubscribe,
  all keyed off `classifyBillingRow` (no `current_period_end` math). It is
  **flag-gated on `VENUE_REHIDE_ENABLED` (server-side, no redeploy) and ships
  LOG-ONLY** — flag absent = the jobs run and log `[VenueVisibility]` lines but
  write nothing; the cron's admin-lapse report job always runs.
  - **Cutover:** deploy with the flag absent → read ~a week of
    `[VenueVisibility] rehide/restore DRY RUN` lines from the daily cron → set
    `VENUE_REHIDE_ENABLED=1` (no redeploy). The admin "Hidden venues" panel
    (below) already exists, so ops can see and reverse a re-hide from day one. The
    webhook follower has no dry-run mode and goes live the instant the flag is
    set, so the dry-run week must come from the cron first.
  - **Reversal:** unset the flag. Already-hidden rows are restored by clearing
    the stamp: `update venues set hidden = false, rehidden_at = null where
    rehidden_at is not null;`
  - **Admin surface (re-hide plan Phase 4) — DONE.** The "Hidden venues" panel
    at the bottom of the admin Venues section lists every hidden venue, badged
    lapsed / admin-hidden / system room, with a **Restore (unhide)** button on
    lapsed rows (clears `rehidden_at`). The restore is billing-agnostic — if the
    subscription is still not live the reconciler re-hides the venue on its next
    run, so the durable fix is still a live subscription. `restoreLapsedVenue`
    refuses any row that is not a genuine lapsed venue.
- **One venue per email** — see §7.
