# Partner Self-Serve Signup — Real-Device Checklist

**Only Andrew can close this file.** Phase 3 built a full-screen takeover whose
entire premise — "it feels like an app, not a form" — is a judgement about
motion, keyboard behaviour and safe areas on a real phone. Per `CLAUDE.md`, a
headless browser has no browser chrome, no soft keyboard, no notch and no
`prefers-reduced-motion` setting, so **an automated pass reports success on
every bug listed below.** The tests that do exist
(`tests/components.signup-shell-motion.test.ts`) only prove the system stayed a
system; they prove nothing about how it feels.

Sign-off targets: **iPhone Safari** (notched, e.g. 14/15), **iPhone SE-class**
(smallest supported), **installed PWA** (Add to Home Screen), **Android Chrome**,
**desktop Chrome**.

> **Prerequisites before ANY of this can be run.** All three, in order (the
> ordered ops steps and the smoke tests are in `docs/self-serve-signup-runbook.md`):
> 1. ✅ **Done 2026-09-07.**
>    `supabase/migrations/20260907130000_partner_self_serve_signup_foundations.sql`
>    is applied (`supabase db push`), so `signup_attempts` exists and `rateLimit`
>    behaves normally. Re-check this only when standing up a *new* environment:
>    without the table every `/api/signup/*` call returns **503**, not 429
>    (`rateLimit` fails closed).
> 2. Confirm `GOOGLE_MAPS_API_KEY` carries an HTTP-referrer restriction for
>    `hightopchallenge.com` (Risk #1 in the plan's §6 — `/api/signup/maps-key`
>    hands the key to any unauthenticated caller by design).
> 3. Set `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1`. Andrew does this; the agent
>    never touches `.env.local`.
>
> **Phase 4 shipped 2026-09-07: `app/owner/signup/page.tsx` exists, so §1–§7 are
> all runnable now.** One extra prerequisite note: the route is *statically
> prerendered*, and the flag is a `NEXT_PUBLIC_*` value inlined at build time —
> **setting the env var only takes effect on the next build/deploy.** With the
> flag off the URL is a real 404, not a blank page. §8 stays blocked on Phase 6
> (there is no `POST /api/owner/signup` yet, so the review screen's button
> currently ends at "Signup isn't available yet").

---

## 1. The takeover — does it actually take over?

- [ ] iPhone Safari, `/owner/signup`: the wizard fills the whole screen. No
      720px content clamp, no gap either side, no `pb-24` dead band at the
      bottom, and none of the cyan/violet decorative blobs from the standard
      app shell. (That is `AppShell`'s `FULLSCREEN_PATHS` entry doing its job —
      if any of those appear, `/owner/signup` fell out of that list.)
- [ ] Notched iPhone, portrait: the exit circle and the "Step N of 6" label
      clear the notch/Dynamic Island; the progress rail sits flush against the
      very top edge with nothing above it.
- [ ] Notched iPhone, **landscape**: content clears the rounded corners on both
      sides (the shell pays `safe-area-inset-left/right`).
- [ ] Installed PWA launch (Add to Home Screen → open): the same, with the
      status bar overlaying nothing and the sticky footer clear of the home
      indicator.
- [ ] Android Chrome: scroll the content region down — when the address bar
      collapses, the footer stays put and nothing jumps or double-scrolls.
- [ ] Desktop Chrome at 1440px: the content column stays a readable
      phone-width column, centred, on the dark canvas. It must not stretch.

## 2. The keyboard (the failure mode most likely to be real)

The shell sizes itself from `--tp-vh` (`ViewportHeightSync`, tracking
`visualViewport.height`), specifically so the sticky footer rides above the soft
keyboard instead of hiding under it.

- [ ] iPhone Safari, any text step: the keyboard opens and the **Next button is
      still visible above it**, not covered.
- [ ] Dismiss the keyboard — the footer settles back to the bottom edge with no
      lingering gap and no visible resize "bounce".
- [ ] iPhone SE-class: with the keyboard open, the question heading and the
      input are both still on screen. If the heading is pushed off, note it —
      the fix is to shrink the content region's top padding, not to remove the
      heading.
- [ ] Android Chrome: same two checks (Android resizes the layout viewport
      instead of the visual one, so this can pass on iOS and fail here).

## 3. Autofocus and the return key ⚠️ *highest-risk item in Phase 3*

`SignupTextField` focuses its input on mount, but AnimatePresence `mode="wait"`
mounts the incoming step **~260 ms after the tap** that advanced it. iOS Safari
only raises the soft keyboard for a focus close enough to a user gesture, and no
headless tool can tell us whether 260 ms is close enough.

- [ ] iPhone Safari: tap Next on the name step → the email step's field is
      focused **and the keyboard is already up**, without a second tap.
- [ ] Tapping the on-screen return key advances to the next step (that is
      `onEnter`, not a form submit).
- [ ] The return key is labelled **Next** (or **Go** on the last text step), not
      "return" — that is `enterKeyHint`.
- [ ] Same three on Android Chrome.

**If the keyboard does not come up, try in this order — do not redesign:**
(a) focus the input in the same tick as the Next tap (hold a ref in the page and
focus the *incoming* field before the transition, iOS's documented workaround);
(b) shorten `SIGNUP_STEP_DURATION` in `components/signup/signupMotion.ts`;
(c) drop `mode="wait"` for `mode="popLayout"` so the incoming step mounts
immediately. (c) changes the feel and is the last resort.

## 4. Motion

- [ ] Advancing slides the new question in **from the right**; Back slides it in
      **from the left**. If Back slides the wrong way, the direction is not
      reaching the exiting element (`custom` on `AnimatePresence`).
- [ ] Content arrives staggered — eyebrow, heading, helper, field, in that order,
      not all at once. It should read as deliberate, not as a slow page.
- [ ] The progress rail visibly grows on every forward step and shrinks on Back.
- [ ] Nothing bounces, overshoots or springs anywhere in the flow.
- [ ] **Settings → Accessibility → Motion → Reduce Motion ON**: every transition
      becomes a plain cross-fade — no horizontal slide, no rise, no stagger — and
      the flow is still completely usable. (Toggle it mid-flow; the next step
      must obey immediately.)

## 5. Navigation controls

- [ ] Exactly **one** Back-shaped control in the top-left (the neutral slate
      circle), and the footer's step-Back is a separate, clearly different
      control. They must never be confusable.
- [ ] Top-left exit from step 1, arriving cold (a fresh tab, no history):
      lands on `/info` — **never** on `/`, which is the player sign-in.
- [ ] Top-left exit mid-flow, arrived from `/owner/login`: goes back to
      `/owner/login`.
- [ ] Installed PWA, cold launch straight into signup, then exit: still lands
      somewhere sensible (this is the `history.length <= 1` hardening in
      `exitNavigation.ts`).
- [ ] No sign-out control appears anywhere in the wizard.

## 6. Autofill

- [ ] iOS offers to fill the name field from Contacts.
- [ ] iOS offers the email address on the email step.
- [ ] iOS/1Password/Keychain offers to **generate and save a strong password** on
      the password step, and saving it associates with the right site.
- [ ] No field zooms the viewport on focus (every input is ≥16px type).
- [ ] The password reveal toggle (the eye, inside the field's right edge) is
      tappable without also focusing/dismissing the keyboard, and the strength
      rail under it stays *quiet* — it must never look like a failure state for a
      password that is actually allowed.

## 7. Address and map steps

- [ ] Places predictions appear while typing a bar name; picking one fills
      street/city/state/ZIP and the venue name.
- [ ] Hitting the rate limit shows a readable message in the field, not a blank
      list or a spinner that never ends.
- [ ] A failed map key load does **not** dead-end the flow — the geofence step
      still lets the partner continue (the map is not fatal).
- [ ] The radius dial only travels 50–200 m, drags smoothly, and the circle
      resizes live (the full dial checks are in
      `docs/venue-activation-device-checklist.md` — re-run §2 there against the
      signup bounds).
- [ ] "Can't find it? Enter it by hand" reveals the street/city/state/ZIP fields,
      the locked "Country: United States" line, **and** the "Use my current
      location" button. Setting the pin there means step 5 opens with a live map
      instead of the dashed "the map appears once there's a pin" placeholder —
      check that path specifically, it is the whole reason the GPS button is
      duplicated on step 4.
- [ ] Step 5's `GeofenceEditor` sits in a deliberate **light panel** on the dark
      canvas (it is the admin's white-card component, reused rather than
      re-themed). Confirm it reads as an intentional map card, not as a theme
      leak — this is a judgement call and the only one Phase 4 could not make
      headless.
- [ ] Review step: the static map thumbnail renders, and **killing it does not
      dead-end the flow** — block `/api/signup/venue-map` (or spam it past 10
      calls/min) and confirm the summary and the price card still render and the
      button still works.
- [ ] Review step's address block reads correctly for a venue with no clean
      street address (a fairground, a marina, a stadium concession).

## 8. End to end *(Phase 6)*

- [ ] A real Stripe **test-mode** run: signup → Checkout → return → venue
      appears → welcome email arrives.
- [ ] **The handoff cookie** *(Phase 5)*: after "Start subscription" the phone
      lands on `/owner/billing/setup` **already signed in** — not bounced to
      `/owner/login`. `POST /api/owner/signup` sets `tp_owner_sess` on its 200,
      and Safari dropping that cookie on a same-tab `router.replace` is exactly
      the kind of thing no headless run can rule out.
- [ ] **The venue is invisible until payment** *(Phase 5/6)*: after signup but
      BEFORE completing Checkout, open the player join flow on a second device
      at that address — the new venue must not be in the list. It appears only
      after the webhook reveals it.
- [ ] Signing up with an email that already has a partner account **jumps the
      wizard back to the email step** (Finding #11) with "sign in at
      /owner/login instead" shown on the email field — not left in the review
      footer three steps away. Editing the email clears the message.
- [ ] Backgrounding the phone mid-wizard and returning restores the answers —
      **except the password, which must be blank** (never persisted). Pinned by
      `tests/lib.signup-draft.test.ts`, but confirm it on the device too: the
      unit test proves what is written, not what iOS restores.
- [ ] Closing the tab and reopening `/owner/signup` starts CLEAN (sessionStorage,
      not localStorage — a shared phone behind a bar must not offer the next
      person someone else's half-typed signup).
- [ ] Both duplicate-venue branches, once Phase 5 can return them: an unowned
      match shows "Is this your venue?" with a working claim, and an owned match
      shows "Sign in instead". Neither offers "create it anyway".
- [ ] **Double-tap the "Yes — this is my venue" claim button** (Finding #4). The
      duplicate panel hides the sticky footer, so this button is the only control
      on screen. On the first tap it must go disabled and read "Claiming…"; a
      fast second/third tap must not fire another `POST /api/owner/signup` (watch
      the network tab — exactly one claim request) and must not burn a second of
      the five hourly rate-limit slots.
- [ ] **Over-length fields** *(Phase 5a)*: paste a 200-character venue name into
      the address screen. The input itself should stop accepting at 120 — but on
      iOS a **paste** can exceed `maxLength` in some Safari versions, and the
      point of Phase 5a is that the server rejects rather than truncates. Tap
      Next: you must see "That venue name is too long — use 120 characters or
      fewer" as the footer hint, and the venue must never be created with a
      clipped name. (The same holds for the name, street and city fields.)
- [ ] **The orphaned-account message** *(Phase 5a)*: only reachable with a
      hand-made `auth.users` row that has no `venue_owners` row, so this is a
      support-rehearsal item rather than a routine one. If it comes up, the
      footer hint must name `partnerships@hightopchallenge.com` — **not**
      "sign in at /owner/login", which would be a dead end (login 401s).

### 8a. Phase 6 — reveal, sweep, welcome email

The first three are the live Stripe test-mode run; nothing headless can sign them
off, and the reveal in particular has no other observable.

- [ ] **The reveal fires on the webhook, not on the redirect.** Complete
      Checkout, then watch the player join flow on a second device at that
      address: the venue must appear *after* the `checkout.session.completed`
      webhook lands, not the instant the browser returns to
      `/owner/billing?success=subscribed`. If it appears on the redirect,
      something other than `maybeRevealVenue` unhid it and that is a bug.
- [ ] **3-D Secure path.** Use Stripe test card `4000 0025 0000 3155` (requires
      authentication). The reveal hangs off the *first sync* rather than one
      event type, so it must also fire when the write arrives as
      `customer.subscription.updated` instead of `checkout.session.completed`.
- [ ] **A declined card reveals nothing.** Test card `4000 0000 0000 0002`. The
      venue must still be invisible to players afterwards, and no welcome email
      may arrive.
- [ ] **A venue named "… Bar & Grill"** (very common, and Places will hand you
      one). The welcome email's confirmation line must read `Bar & Grill`, not
      `Bar &amp; Grill` and not a truncated name. Check the **HTML** body in a
      real mail client, not just the text part.
- [ ] **The two Category Blitz global rooms stay hidden.** After any successful
      activation, confirm `category-blitz-global-room` and `hc-cbz-live` are
      still absent from every player's venue list. They are the only other hidden
      venues in production; the `self_serve_created_at` guard is all that
      separates them from a self-serve row.
- [ ] **The sweep, dry run, against production.** `GET /api/cron/signup-sweep?dryRun=1`
      with the `CRON_SECRET` bearer token. Expect `venues.candidates: 0` and
      `orphans.candidates: 0`-to-a-handful on a healthy database, and
      `attemptsPruned` to be whatever the rate limiter has accumulated. **Read
      `orphans.candidateEmails` before ever setting
      `SIGNUP_SWEEP_AUTH_DELETE_ENABLED`** — every address listed there is one
      the sweep will delete.
- [ ] **Abandon a signup on purpose** and confirm the venue is created hidden and
      stays invisible. It becomes sweep-eligible 7 days later; there is nothing
      to check on the phone that day, but note the venue id so the first enabled
      sweep can be verified against it.
