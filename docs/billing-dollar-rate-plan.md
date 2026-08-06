# Dollar-Amount Custom Rates

Let an admin set a partner's negotiated monthly rate by typing a **whole dollar
amount**, instead of pasting a Stripe Price ID they have no way of knowing.

**Slug:** `billing-dollar-rate` · **Builds on:** `docs/billing-discount-phase8.md`,
`lib/billingCustomPrice.ts`

---

## 0. Context & problem

Today the only way to put a partner on a negotiated rate is Admin → Partner
Billing → "Change rate", which takes a `price_…` id. That id has to be created
by hand in the Stripe Dashboard first. On a phone, mid-conversation with a bar
owner, that is not a workable flow — the salesperson doesn't have the Dashboard
open and doesn't know the id exists.

`lib/billingCustomPrice.ts:20-23` records the original scope call:

> The negotiated Price itself is created once in the Stripe Dashboard and its id
> pasted into the admin form — a full self-service "enter any dollar amount"
> price-minting UI is heavier than this feature needs, and Prices are permanent
> objects that would accumulate in the dashboard forever.

That reasoning was sound at the time. What changes it: reusing an existing Price
when the amount already exists means we mint at most **one Price per distinct
dollar amount ever**, not one per admin action. The accumulation concern shrinks
to a bounded, self-labeling set.

## 1. Decisions (locked)

### 1.1 Dollars only — no cents

The input takes whole dollars. `amount_cents` remains the storage unit
everywhere; the server multiplies by 100.

Negotiated bar rates are round numbers ($75, $80, $125). Nobody talks a partner
down to $77.50/month. So a cents field only ever holds a mistake — and the
specific mistake it enables is the dangerous one: `$7.50` typed for `$75` is off
by 10x and looks plausible. Removing the decimal point makes that input
unrepresentable rather than merely detectable.

Validation becomes `Number.isInteger(dollars)` plus a band, which is cleaner
than parsing `7.5` vs `7.50` vs `07.5`.

### 1.2 The `price_…` path stays

`stripePriceId` remains accepted server-side. It costs nothing to keep and it is
the escape hatch for the cases dollars-only can't express: a legacy
non-round rate, or a genuinely odd Price built at Stripe. Phase 1 includes a
check for whether any such rate exists today.

### 1.3 Resolve by `lookup_key`, not by scanning

To find an existing Price for an amount, query
`prices.list({ lookup_keys: ["custom_monthly_7500"] })` — one exact lookup.

Do **not** scan `prices.list({ product })` for a matching `unit_amount`: it
paginates at 10 by default, so a Product that accumulates prices silently misses
an existing match and mints a duplicate, defeating the whole reuse property.

`lookup_key` is unique per Stripe account, so it also acts as a race guard: a
concurrent create throws instead of duplicating.

### 1.4 Guardrails: a band, not a confirm modal

A loose sanity band ($10–$1,000) blocks the absurd — it exists to catch `$750`
typed for `$75`, not to police pricing policy. No confirmation step: dollars-only
already kills the decimal typo, and `proration_behavior: "none"`
(`lib/billingCustomPrice.ts:37-38`) means a wrong rate caught before the cycle
ends never reaches an invoice. That is one less tap on mobile.

The band is a named export so a future policy change is one constant, not a
grep.

### 1.5 Nothing about the swap changes

This adds a **resolver in front of** `setCustomPrice`'s existing logic. The
proration behavior, every price validation (`:138-168`), the offline-billing
refusal, the `amount_cents` mirror write and the `billing_discount_grants` audit
insert all stay exactly as they are.

## 2. Known trade-offs (accepted)

- **Prices still accumulate, just slower.** Reuse bounds it to one per distinct
  amount. `$73`/`$77`/`$81` still mint three. Acceptable — and `lookup_key`
  makes them legible in the Dashboard (`custom_monthly_7500`) rather than a wall
  of anonymous ids.
- **A typo writes two audit rows.** The mistake and its correction both insert
  into `billing_discount_grants`, so history reads "gave them $7.50, took it
  back." Cosmetic, but it would inflate any revenue-given-away report built on
  that table.
- **Orphan Prices on partial failure.** Create-then-swap is not atomic; a failed
  swap leaves an unused Price. Harmless, and the reuse path picks it up on
  retry.
- **Narrow partner-visible window.** `amount_cents` mirrors immediately, so a
  partner loading their billing page between a typo and its correction sees the
  wrong number.
- **Correctable ≠ correctable forever.** A typo a day before renewal that nobody
  notices gets invoiced, and then it's a refund. The band is the backstop.

---

## Phase 1 — Audit the existing data & confirm assumptions

**Model: Haiku 4.5 · Effort: low**

Mechanical verification, no design judgment.

1. Run against the live DB:
   ```sql
   select venue_id, amount_cents from billing_subscriptions where amount_cents % 100 <> 0;
   ```
   If empty, dollars-only costs nothing. If not, record the rows — they are the
   justification for keeping the `price_…` path (§1.2), and must not be
   re-enterable through the new UI.
2. Confirm `STRIPE_PRICE_ID` resolves and note its `product` id —
   `stripe.prices.retrieve(getStripePriceId())` → `.product`. Custom prices must
   hang off the same Product or Stripe reporting splits.
3. Record both findings at the top of the run log.

**Done when:** the non-round-rate query result and the Product id are written
down.

---

## Phase 2 — `resolveMonthlyPriceForAmount` in `lib/billingCustomPrice.ts`

**Model: Opus 5 · Effort: high**

The load-bearing phase. Money-touching Stripe code with idempotency and race
concerns, inside a file whose header comments are themselves a design record —
they need updating in the same voice, not bolted onto.

1. Add near the existing constants:
   ```ts
   export const MIN_CUSTOM_PRICE_DOLLARS = 10;
   export const MAX_CUSTOM_PRICE_DOLLARS = 1000;
   export const customPriceLookupKey = (cents: number) => `custom_monthly_${cents}`;
   ```
2. Add `resolveMonthlyPriceForAmount(amountDollars: number)`, returning the same
   discriminated-union shape as `SetCustomPriceResult`'s error arm so the caller
   handles one error type:
   - reject non-integer / out-of-band dollars with an actionable message;
   - `lookup_keys` query → reuse the hit if present;
   - otherwise resolve the Product from `getStripePriceId()` and
     `prices.create({ product, unit_amount, currency: "usd", recurring: { interval: "month" }, lookup_key })`;
   - catch the `lookup_key`-already-exists error and re-resolve rather than
     failing — that is the concurrent-create path.
3. Widen `setCustomPrice` to accept `{ priceId }` **or** `{ amountDollars }`,
   resolving the latter to a price id and then running the unchanged existing
   path. Do not duplicate the validation block — a minted price passes it
   trivially, and it must keep guarding the pasted-id path.
4. Update the file header (`:20-23`) to record the change of scope call and why
   — that comment is currently the reason a future reader would *not* do this.

**Done when:** `npx tsc --noEmit` clean; no behavior change for the pasted-id
path.

---

## Phase 3 — Unit tests

**Model: Sonnet 5 · Effort: medium**

Extend `tests/lib.billingCustomPrice.test.ts` (mock Stripe as that file already
does). Cover:

- reuse: an existing `lookup_key` hit does **not** call `prices.create`;
- mint: a miss creates with the exact `unit_amount`, `currency`, monthly
  `recurring`, and `lookup_key`;
- band: `$5` and `$5000` reject; `$10` and `$1000` pass (boundaries inclusive);
- non-integer dollars reject;
- the concurrent-create error is caught and re-resolved, not surfaced;
- the minted price is swapped with `CUSTOM_PRICE_PRORATION_BEHAVIOR` — reassert
  the existing invariant through the new entry point;
- the pasted-`price_…` path is unchanged.

**Done when:** `npm run test` passes.

---

## Phase 4 — API route

**Model: Sonnet 5 · Effort: low-medium**

In `app/api/admin/billing/route.ts`:

1. Add `amountDollars?: number` to `PostBody` alongside `stripePriceId`.
2. In `handleSetCustomPrice` (`:570-`), accept either. Require exactly one —
   both supplied is a 400, not a silent precedence rule.
3. Coerce defensively: JSON gives `number | string | null`. There is prior art
   for this exact bug in
   `tests/api.billing-discount-percent-off-numeric-coercion.test.ts` — read it
   before writing the coercion, and mirror its handling.
4. The `billing_discount_grants` insert already records
   `custom_price_cents: result.amountCents`, so the audit trail needs no change.

**Done when:** both request shapes work against a local dev server; add a route
test in the style of `tests/api.admin.billing-discounts.test.ts`.

---

## Phase 5 — Desktop admin UI (`BillingSection.tsx`)

**Model: Sonnet 5 · Effort: medium**

The "Change rate" modal (`ratePriceId` state, `submitCustomPrice` at `:363`)
becomes dollars-first:

1. Replace the price-id field with a dollar input — `inputMode="numeric"`,
   leading `$`, `/month` suffix, no decimals accepted.
2. Send `amountDollars`; keep `reason` as-is.
3. Show the band in helper text ("$10–$1,000") so the limit is discoverable
   before submit, not after a 400.
4. Put the `price_…` field behind a small "Use a Stripe price ID instead"
   disclosure — present for the §1.2 cases, out of the way for everyone else.
5. Tailwind only, `lib/themeTokens.ts` for tokens, no inline `style` (CLAUDE.md).

**Done when:** a rate can be set from desktop admin end to end; both input modes
work.

---

## Phase 6 — Mobile surface

**Model: Sonnet 5 · Effort: medium**

Note the current state: Partner Billing is **deliberately not** a mobile shell
section (`components/admin/mobile/MobileVenuesSection.tsx:234`) — the venue flow
links out to the desktop section instead. So Phase 5 already improves the mobile
experience, since that link lands on the improved modal.

Decide (needs Andrew's call — do not guess):

- **(a) Leave it.** The out-link is enough; Phase 5 did the work. Zero new code.
- **(b) Add a rate sheet to the mobile flow.** A `MobileBottomSheet`
  (`components/admin/mobile/MobileBottomSheet.tsx`, whose header at `:13`
  already anticipates "Phase 5's billing" use) with the dollar input, invoked
  from the activation flow. Reuses the Phase 4 API; no new server work.

If (b): follow the existing mobile phase docs' conventions, and add the sheet to
`docs/admin-mobile-device-checklist.md` — bottom sheets have a11y and
height-chain tests in this repo (`tests/admin-mobile.bottom-sheet-a11y.test.ts`,
`tests/admin-mobile.shell-height-chain.test.ts`) that a new sheet must satisfy.

**Done when:** the chosen option is implemented, or (a) is recorded as the
decision.

### Outcome (2026-08-06): neither (a) nor (b) as written — this phase's premise was wrong

Andrew chose (b), but investigating it found the phase's stated premise does not
match the code. Verified findings:

- **Partner Billing is not an out-link from the mobile shell.**
  `AdminMobileShell.tsx:68` renders `<BillingSection />` directly as the
  `"partner-billing"` tab. The out-link at `MobileVenuesSection.tsx:317` is an
  in-shell `onNavigate` tab switch, not a departure to desktop. (The `:234`
  comment the plan cites explains why *billing access* isn't part of venue
  activation — a new venue has no `venue_owner_venues` row yet — which is a
  different claim than "billing has no mobile surface.")
- **The Custom-rate modal already renders as a bottom sheet on phone widths.**
  `BillingSection.tsx:1039` is `items-end` + `rounded-t-2xl` + safe-area
  padding, going centered only at `md:`. Phase 5 built the dollars-first form
  inside it. So option (b)'s deliverable — "a rate sheet on the mobile flow" —
  substantively already exists.
- **`docs/admin-mobile-device-checklist.md` already lists it** under "Bottom
  sheets (Venues detail, Billing Grant/Discount/Custom-rate, promo codes)".

So there is no new sheet to build. What the investigation *did* surface is a
real, separate gap, promoted to Phases 6A/6B below rather than smuggled into a
dollar-rate phase.

**Recorded decision:** (a)-equivalent for this phase — no new mobile surface,
because the surface already exists. Zero code changed under Phase 6.

---

## Phase 6A — Shared admin modal primitive + Custom-rate migration

**Model: Sonnet 5 · Effort: medium**

**Status (2026-08-06): ✓ Done.** `AdminModalSheet` built, Custom-rate modal
migrated. Full handoff notes for Phase 6B, plus a pre-existing/unrelated test
failure flagged, are in the run log's Phase 6A section — read that before
starting 6B.

Not a dollar-rate feature — an a11y/behavior debt this track surfaced. Sequenced
before Phase 7 so the Stripe test-mode pass verifies the Rate flow through its
final UI rather than an interim one.

### The actual gap (verified, not assumed)

`BillingSection.tsx` has three hand-rolled modals sharing one class string —
Grant (`:758`), Discount (`:853`), Custom rate (`:1038`). All three lack:

| Missing | Consequence |
|---|---|
| `role="dialog"` + `aria-modal="true"` | Screen readers don't announce a dialog context |
| Escape-to-close | Keyboard users are trapped in the form |
| Backdrop-tap dismiss | Checklist item "backdrop-tap dismisses the sheet" cannot pass |
| Body-scroll lock | Checklist item "no body-scroll bleed" **cannot pass** — nothing in `components/admin/` touches `body.style.overflow` |

Two corrections to note, because an earlier reading of this got both wrong:

- **These are NOT the `aria-hidden`-over-mounted-children bug** that
  `tests/admin-mobile.bottom-sheet-a11y.test.ts` guards. All three are
  *conditionally mounted* (`{activeVenueId ? … : null}`), so they leave the DOM
  when closed. `inert` is not needed here — that attribute exists for
  `MobileBottomSheet`, which stays mounted by design.
- **Do not "just reuse `MobileBottomSheet`".** It is permanently bottom-anchored
  with no `md:` centered mode, so dropping it in would regress the desktop
  console — where Partner Billing is primarily used. It also does not trap focus,
  so it is not a complete a11y answer on its own.

### Work

1. Add a small `AdminModalSheet` (suggested:
   `components/admin/AdminModalSheet.tsx`, `"use client"`) that **preserves the
   existing responsive layout exactly** — bottom sheet under `md`, centered modal
   at `md:` — while adding: `role="dialog"`, `aria-modal="true"`,
   `aria-labelledby` wired to the title, Escape-to-close, backdrop click-to-close,
   and a body-scroll lock on open (restore the prior value on close; guard
   against two sheets open at once).
2. Migrate **only the Custom-rate modal** (`:1038-1149`) onto it. Leave Grant and
   Discount untouched this phase — they migrate in 6B, so a layout regression is
   caught on one modal rather than three.
3. Visual output must be unchanged at both breakpoints. This is a semantics and
   behavior change, not a redesign.
4. Tailwind only, no inline `style`, `@/` imports (CLAUDE.md).

**Do not** touch `components/prizes/PrizeWalletPanel.tsx` — it shares a similar
class string but is a player surface with its own conventions, out of scope.

**Done when:** `npx tsc --noEmit` clean; the Rate modal opens/closes via Escape,
backdrop, and Cancel; the page behind it does not scroll while open; desktop
still renders a centered modal.

---

## Phase 6B — Grant + Discount migration, tests, checklist

**Model: Sonnet 5 · Effort: medium**

**Status (2026-08-06): ✓ Done.** Grant and Discount modals migrated onto
`AdminModalSheet`; `tests/admin-modal-sheet.a11y.test.ts` added (7/7 passing);
device checklist updated. Full details, one indentation gotcha, and handoff
notes for Phase 7 are in the run log's Phase 6B section — read that before
starting Phase 7.

1. Migrate the Grant (`:758`) and Discount (`:853`) modals onto `AdminModalSheet`.
   After this, `BillingSection.tsx` should contain **zero** occurrences of
   `fixed inset-0 z-50 flex items-end justify-center`.
2. Add `tests/admin-modal-sheet.a11y.test.ts` covering: dialog role +
   `aria-modal`, Escape fires `onClose`, backdrop click fires `onClose`, a click
   *inside* the panel does **not**, and the body-scroll lock applies on open and
   restores on close. Note the repo constraint: `vitest.config.ts` globs only
   `tests/**/*.test.ts` — no `.tsx` — so use `createElement` rather than JSX,
   exactly as `tests/admin-mobile.bottom-sheet-a11y.test.ts` does, and add
   `// @vitest-environment jsdom` at the top (the global default is `node`).
3. Update `docs/admin-mobile-device-checklist.md`: the existing "Bottom sheets"
   section already names these three modals and already lists the backdrop-tap
   and body-scroll-bleed checks. Do not add a duplicate section — instead note
   that those items were previously unimplementable and are now expected to pass.
   (The promo-code panel named alongside them is **inline**, not a modal —
   `:1187` — so it is out of scope; correct the checklist wording if it misleads.)

**Done when:** `npm run build`, `npx tsc --noEmit`, `npm run lint`,
`npm run test` all clean; all three modals behave identically to each other.

---

## Phase 7 — Verify against real Stripe test mode

**Model: Opus 5 · Effort: medium**

**Status (2026-08-06): ✓ Done.** All five steps verified against real Stripe test
mode, plus four bonus checks. **Zero product code changed** — no defect found.
The standing "no scripted admin session" gap that Phases 4/5/6A/6B all deferred
is now **closed**: all three modals were driven in a real browser at 390×844 and
1280×900. Two findings worth knowing before touching `AdminModalSheet` (its
scroll lock is a no-op on the admin console; the inline `body.style.overflow`
value is flaky to assert in a live browser) are in the run log's Phase 7 section
— read that before Phase 8.

One correction to this section's own premise: it predicted the duplicate-create
**error code** would be verifiable. Stripe's duplicate-`lookup_key` error carries
**no `code` field at all** — only `type` and `message`. The resolver is
unaffected because it never inspects the code, but do not add a code check.

Mocked tests cannot prove `lookup_key` semantics, the duplicate-create error
code, or that a swapped subscription actually renews at the new rate.

> **`.env.local`'s `STRIPE_SECRET_KEY` is LIVE.** Use a test key for this phase.
> Never point this at the live key, and never read or modify `.env.local`
> (CLAUDE.md hard boundary).

### Preflight (one-time setup, already done 2026-08-06)

The test key lives at `~/.stripe-test-key` — outside the repo, mode `600`, one
`sk_test_…` line. To recreate it:

```bash
printf 'sk_test_YOUR_KEY\n' > ~/.stripe-test-key && chmod 600 ~/.stripe-test-key
```

Test mode has its own Products and Prices, so the live `STRIPE_PRICE_ID` does
not exist there. Create a $100/month recurring product once in Test mode
(Product catalog → add product) and note its `price_…` id.

### Running the phase

```bash
STRIPE_SECRET_KEY="$(cat ~/.stripe-test-key)" \
STRIPE_PRICE_ID="price_YOUR_TEST_PRICE_ID" \
npm run dev
```

Command-line env vars override `.env.local` for that process only — nothing on
disk changes. Do **not** edit `.env.local` to swap keys, and do **not** run
`vercel env pull` during this phase (it silently overwrites `.env.local`).

Verify you are in test mode before creating anything: watch the Stripe Dashboard
with **Test mode** on and confirm objects appear there. If a Price appears in
Live mode, stop immediately.

### Steps

1. Create a test subscription, set a rate of $75 → assert the Price is minted
   with `lookup_key: custom_monthly_7500` and the subscription item swapped.
2. Set the *same* $75 on a second test venue → assert **no** second Price is
   created.
3. Set $80 → assert a second Price is minted, first one untouched.
4. Confirm the upcoming invoice reflects the new rate and that **no** proration
   line item appears (the `"none"` invariant, verified for real).
5. Reject cases: $5, $5000, `$75.50`.

**Done when:** all five verified against test mode; results in the run log.

---

## Phase 8 — Close-out

**Model: Haiku 4.5 · Effort: low**

1. Update `lib/billingCustomPrice.ts`'s header if Phase 7 changed anything.
2. Note the new capability in `docs/billing-discounts-plan.md` so the Phase 8
   doc's "paste a price id" instruction doesn't mislead a future reader.
3. Final `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm run test`.
4. Record the as-built summary and any deviations in the run log.

---

## Model & effort summary

| Phase | What | Model | Effort |
|---|---|---|---|
| 1 | Data audit & assumptions | Haiku 4.5 | Low |
| 2 | `resolveMonthlyPriceForAmount` + `setCustomPrice` | **Opus 5** | **High** |
| 3 | Unit tests | Sonnet 5 | Medium |
| 4 | API route | Sonnet 5 | Low-medium |
| 5 | Desktop admin UI | Sonnet 5 | Medium |
| 6 | Mobile surface (decision required) | Sonnet 5 | Medium |
| 6A | ✓ Done — `AdminModalSheet` + Custom-rate migration | Sonnet 5 | Medium |
| 6B | ✓ Done — Grant + Discount migration, tests, checklist | Sonnet 5 | Medium |
| 7 | ✓ Done — Real Stripe test-mode verification | **Opus 5** | **Medium** |
| 8 | Close-out (docs only) | Haiku 4.5 | Low |

Phases 6A/6B were added 2026-08-06 after Phase 6's investigation found its
premise inverted (see Phase 6's Outcome section). They are a11y/behavior debt in
`BillingSection.tsx`, not dollar-rate work, and are sequenced before Phase 7 only
so the Stripe pass exercises the final Rate UI.

Phases 2 and 7 are the ones that warrant Opus: Phase 2 is money-touching code
with idempotency and race handling inside a file whose comments are a design
record, and Phase 7 is judgment about whether real Stripe behavior matches the
mocks. Everything else is well-specified work against existing patterns.
