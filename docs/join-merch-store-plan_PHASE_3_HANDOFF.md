# Join Merch Store — Phase 3 Handoff

## For Andrew (plain English)

Phase 3 is finished, on your computer only: **nothing is committed, pushed or deployed.**

What changed:
- The white **Order Join Merch** panel is now a working store. It lists all four products with
  their photos and descriptions:
  - **Round Coasters** and **Square Coasters**: a "Pack size" dropdown with None / 100 — $30 /
    250 — $60 / 500 — $100 / 1,000 — $175. Once a pack is chosen it shows the per-coaster price
    (e.g. "24¢ each · $60.00").
  - **Table Tents** ($4 each) and **Table Card with Holder** ($8 per set): − / number / +
    buttons, 0 to 100. A typed number outside that range is corrected when the box loses focus.
  - Anything in the order gets a small "In order" badge.
- A bar pinned to the bottom shows "2 items · Subtotal $84.00" and a **Review order** button.
  It reads "Choose a quantity to start an order" while the cart is empty.
- **Review order** slides to a summary: each item with its line price, the subtotal,
  "Shipping & tax — Calculated at checkout", **Estimated total**, "Ships to: (your venue name)",
  and a note saying "Online ordering is coming soon." The last button reads **"Ordering opens
  soon"** and is greyed out. Under it: "Nothing is ordered or charged yet."
- The phone's Back goes Review → Store → closed. The cart is kept when the panel is closed and
  reopened, and is emptied by a page reload (as planned).
- I checked it in a real browser on a phone-sized and a desktop-sized screen, using fake
  account data (no real partner data was read or changed). The photos blend into the white
  panel; measured, the photo background is 1 shade (out of 255) from the panel, which you
  can't see.

Cost: none. No server calls, no database, no new requests. The photos are the small WebP files
from Phase 1.

Needs from you (none of these block Phase 4):
- **Q2**: a contact line for the "Ordering opens soon" note, e.g. "Want merch now? Email
  orders@…". Put it in `lib/merchCatalog.ts` as `MERCH_ORDER_CONTACT` (currently empty), or tell
  the next agent.
- **Q3**: the real product descriptions and sizes. The current wording in `lib/merchCatalog.ts`
  is placeholder.
- **Q1** (where the printed QR code points) and **Q4** (one generic QR or one per venue) still
  need answers before anything is printed.

---

## For the next agent (Phase 4: review, device checklist, docs as-built, commit)

Read `docs/join-merch-store-plan.md` §5 Phase 4 first. The plan specifies **Opus 5.5, effort
medium**. Earlier handoffs: `docs/join-merch-store-plan_PHASE_1_HANDOFF.md` (catalog/pricing,
images) and `docs/join-merch-store-plan_PHASE_2_HANDOFF.md` (light sheet tone, `store` sheet id,
menu row, cart state in the dashboard page).

### 1. Goal and scope

**Phase 4 goal:** (1) run `/code-review high` on the Phase 1–3 diff and fix the findings;
(2) write `docs/join-merch-store-device-checklist.md` for Andrew's phone; (3) rewrite the
"Join Merch Store (PLANNED …)" section in `CLAUDE.md`, plus the matching notes in
`SYSTEM_CONTEXT.md` and `AGENTS.md`, as as-built (exact files + commit); (4) commit.
**Pushing and deploying are Andrew's call.** Don't do either unasked.

**Out of scope:** any API route, table, migration, Stripe call, email, address field, feature
flag, or any `fetch(` under `components/owner/store/` (Phases 5–6, not scheduled; don't start
them without Andrew).

### 2. Starting state

- Branch `main`. Last commit is still `75563ec10b743da4f739562cf837f30bc1d43938` ("Partner
  Dashboard Revamp"). **Nothing from Phases 1–3 is committed.** The 4 PNGs and 4 WebPs under
  `public/store/` are staged; everything else is unstaged or untracked. No push, deploy, Vercel
  env change, database change or migration has happened in any phase.
- Pre-existing uncommitted edits from before this plan started. Leave them alone and don't
  revert them: `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md` and
  `docs/nfl-pickem-reward-phase3.md`. `CLAUDE.md` already has the "Join Merch Store (Partner
  Dashboard — PLANNED 2026-09-30, not built)" section that Phase 4 rewrites. **When you commit,
  ask Andrew (or check with him) whether those unrelated pre-existing edits should be in the
  same commit.** Committing them with this plan's work without asking would mix histories.
- Never use `git checkout -- <file>` or `git stash` to undo anything. There is a lot of
  uncommitted work from several phases and people in this tree (see the user's memory note).
- No background server is left running. Port 3123 was used for a local `next start` and has been
  stopped.

### 3. Decisions already made (don't re-ask)

Everything in plan §1 and the Phase 2 handoff §3 still applies. Phase 3 added these:

- **Shop is "no step" in the URL; Review is `step=review`.** `resolveMerchStoreStep(raw,
  cartHasItems)` returns `"review"` only for `raw === "review"` with a non-empty cart, and
  `"shop"` for everything else. An effect rewrites any mismatch in place:
  `replaceCurrentStep(merchStoreUrlStep(current))`. That covers Review with an empty cart (reload
  or shared link), `step=shop`, and unknown steps. The pattern is the same one Schedule and
  Rewards use.
- **"Back to store" calls `nav.goBack("shop")`.** At depth ≥ 2 that pops history (same as the
  phone's Back). At depth < 2 it writes `step=shop`, which the effect immediately rewrites to no
  step. That's a harmless double `replaceState`; I didn't widen `UseOwnerSheetResult.goBack` to
  accept `null`.
- **The final button keeps native `disabled`** (`WizardFooter nextDisabled`, `NextButton`
  unchanged). The reason is shown in words twice: `WizardFooter`'s `hint` ("Nothing is ordered
  or charged yet.") right above the button, and the indigo note under the total. I left the
  navigation primitive alone rather than adding `aria-disabled` to `NextButton`. Revisit only if
  the device or screen-reader pass says it reads as broken.
- **`MerchOrderBar` is its own button, not `WizardFooter`.** It's a cart summary plus a button,
  and `WizardFooter`'s Next is full-width. Its indigo matches `NextButton tone="light"`. The
  navigation tripwire only restricts rendering `StepBackButton`/`NextButton`, which it doesn't do.
- **"N items" counts order lines, not pieces.** A 250-pack is 1 item (`cartSummary().lineCount`).
- **Each step scrolls to the top when it arrives** (`ScrollToTopOnArrival` in
  `MerchStoreSheet.tsx`, which sets the nearest scrollable ancestor's `scrollTop = 0`). Without
  it, Review opened wherever the long Shop list was scrolled. Returning to Shop also starts at
  the top. Scroll position is not restored; that's an accepted simplification.
- **Copy lives in the catalog:** `MERCH_ORDERING_NOTE = "Online ordering is coming soon."` and
  `MERCH_ORDER_CONTACT: string | null = null` (Q2) in `lib/merchCatalog.ts`. When the contact is
  non-null it's appended to the note.
- **Labels:** dropdown options use `formatCentsShort` ("$60"); line totals and the subtotal
  use `formatCents` ("$60.00"); unit prices use "$4 each" and "6 × $4 = $24.00".

### 4. Files created or changed in Phase 3

| File | What |
|---|---|
| `components/owner/store/MerchStoreSheet.tsx` | Rewritten from the Phase 2 shell. Exports `MERCH_STORE_STEPS`, `MerchStoreStep`, `resolveMerchStoreStep`, `merchStoreUrlStep`, `MerchStoreSheet`. `const open = nav.sheet === "store"`. It renders `<SlideSteps steps={MERCH_STORE_STEPS} current={…}>` inside `<OwnerSheet tone="light" size="tall" …>`. Footer: `MerchOrderBar` on Shop; on Review, `WizardFooter tone="light" variant="inline"` with `backLabel="Back to store"`, `nextLabel="Ordering opens soon"`, `nextDisabled`, `nextHideChevron` and a `hint`. `setQuantity` deletes the key at 0. Review renders from `buildMerchOrderDraft(cart, venue)`. Still no discard guard. |
| `components/owner/store/MerchProductCard.tsx` | **New.** One `<li data-product>` per product: a fixed-height photo box (`h-52`, `sm:h-44`, `bg-ht-store-paper`) holding a plain `<img loading="lazy">` with `mix-blend-multiply`, then name (`h4`), "In order" badge, description, and either the pack select (visible "Pack size" label) or the price + stepper (sr-only label "{name} quantity"). There's an `aria-live="polite"` price line under each control. Two columns from `sm:` (photo left). |
| `components/owner/store/CoasterPackSelect.tsx` | **New.** Native `<select>` (None + packs) with a chevron icon overlay. Exports `packOptionLabel` ("1,000 coasters — $175"). |
| `components/owner/store/QuantityStepper.tsx` | **New.** − / text field (`inputMode="numeric"`) / +. Every keystroke commits `clampUnitQuantity(typed)` to the cart; the field shows the typed text until blur, then snaps. Enter blurs. − is disabled at 0, + at max. Button labels: "Decrease {name}" / "Increase {name}". |
| `components/owner/store/MerchOrderBar.tsx` | **New.** Footer for Shop: count + subtotal (`aria-live`), "Review order" (disabled when empty). |
| `components/owner/store/MerchReviewStep.tsx` | **New.** `h3[data-step-heading]` "Review your order", `<li data-line={sku}>` rows with a 56px thumbnail (`alt=""`, decorative), `dl` with Subtotal / Shipping & tax / Estimated total, a "Ships to" card and the ordering note. |
| `lib/merchPricing.ts` | Added `formatCentsShort(cents)`: "$60" for whole dollars, else "$4.50". |
| `lib/merchCatalog.ts` | Added `MERCH_ORDERING_NOTE` and `MERCH_ORDER_CONTACT`. |
| `components/owner/sheet/OwnerSheet.tsx` | **Light tone only:** `closeSurface` `border-slate-300` → `!border-slate-300` (see trap 1). The dark snapshots still pass, untouched. |
| `tests/components.owner-merch-store.test.ts` | Extended with 22 tests: step resolution; one row per product with alt/src/width/lazy; photos multiply on a paper box with no border; both pack selects list exactly None + 4 packs; choosing/clearing a pack updates the price line, badge and bar; stepper ±, disabled ends, typed clamping (`150`, `-3`, `12abc`, `""`, `7`) with no error; Review disabled when empty then `goToStep("review")`; a cart passed in shows on reopen; `step=shop` is rewritten; Review lines, totals and ships-to; the final button is disabled and reads "Ordering opens soon"; Back calls `goBack("shop")`; an empty cart on Review → Shop + `replaceCurrentStep(null)`; static rules: no `$<digit>`, `<n>¢` or `priceCents: <n>` literals and no `next/image` in `components/owner/store/`. |
| `tests/lib.merch-pricing.test.ts` | Added a `formatCentsShort` test. |
| `tests/owner-dashboard-contract.test.ts` | The store test now pins `const open = nav.sheet === "store";` + `open={open}` instead of the inline `open={nav.sheet === "store"}` (same intent; the expression was hoisted). The look-only `fetch(` grep is unchanged and passes. |
| `docs/join-merch-store-plan.md` | Status line only. |

### 5. Facts and traps

1. **Global form CSS beats plain Tailwind on the white panel.** `app/globals.css` has unlayered
   rules: `button:not(:disabled) { border: 1px solid rgba(255,255,255,.12); border-radius: 12px;
   font-weight: 600 }` (specificity 0,1,1, which beats a single class) and
   `input, select, textarea { border: 1px solid #334155 !important; border-radius: 12px !important }`
   plus `input:focus, select:focus { border-color: #22d3ee !important }`. On the white store,
   that made the stepper/Close borders invisible, gave fields a heavy slate-700 border, and
   dropped "Review order" to weight 600 once enabled (so its width jumped). **Fix used:** `!`
   utilities (`!border-slate-300`, `focus:!border-indigo-500`, `!font-black`), each with a
   comment. Any new control on the light panel needs the same. The Phase 2 Close button had the
   invisible-border problem too, which is now fixed (light tone only).
2. **`mix-blend-multiply` makes the photo 1 level darker, not 0.** The WebPs' background is
   exactly 254 (`#FEFEFE`), the same as the paper, so multiply gives 253 vs 254 (measured in a
   real Chromium screenshot: inside the photo box 253, paper 254). That's invisible. It's kept
   per plan §3a because it also hides any lighter (255) or uneven pixels. If Andrew ever sees a
   box on a device, re-check the photo's edge values with sharp before changing anything. The
   photo box is painted `bg-ht-store-paper` so the blend has a backdrop even while
   `SlideSteps`' transform (an isolated group) is animating.
3. **Phase 1 data quirk worth a Phase 4 look:** for coaster packs, `cartLines()` sets
   `unitPriceCents = priceCents / quantity`, which is **17.5 for the 1,000-pack** (not an
   integer, despite the "integer cents everywhere" rule). Nothing in the UI uses it for money
   (Review uses `findPack` + `formatPerPieceCents`), and line/subtotals are integers. A future
   3PL/Stripe payload shouldn't send a fractional unit price. Options: per-pack unit = the pack
   (`quantity: 1` pack, `unitPriceCents: priceCents`), or drop `unitPriceCents` for packs.
   Decide in the code review; it changes the `MerchOrderLine` shape and its tests.
4. **Testing Library + `aria-label`:** a `role="group" aria-label="X quantity"` wrapper made
   `getByLabelText("X quantity")` match two elements, so I removed the group. The buttons and the
   field are each labelled.
5. **The `fetch(` tripwire reads comments too** (from Phase 2). Write "network request" in
   comments under `components/owner/store/`.
6. **`/owner/*` is not cookie-gated in `proxy.ts`** (auth is enforced by the APIs). That's what
   made a real-browser check possible without a partner session: `next start` plus Playwright
   `page.route("**/api/owner/**")` returning stub JSON (`/api/owner/venues` →
   `{ ok: true, venues: [{ id: "v1", name: "The Hightop Tavern" }] }`, everything else
   `{ ok: true }`). No production data was read. The script is not in the repo; recreate it from
   this description if needed. Run it with `NODE_PATH=$PWD/node_modules node script.cjs` when the
   script lives outside the repo (Playwright is a repo dependency).
7. **Pre-existing test failures (not ours, unchanged):** 3 tests fail on a clean tree too:
   `tests/components.create-reward-wizard.test.ts` (1) and `tests/components.owner-rewards-flow.test.ts`
   (2). They expect "Which reward?" but get "Which game should the reward be tied to?", from the
   `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` branch in the local env.
8. `npm run build` piped through `tail` reports an empty `PIPESTATUS` in zsh. Redirect to a file
   and check `$?` instead (`npm run build > build.log 2>&1; echo $?`).

### 6. Build, run and test

Run typecheck and build **sequentially** (`.next/types` is regenerated):

```
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Targeted:
```
npx vitest run tests/components.owner-merch-store.test.ts tests/lib.merch-pricing.test.ts \
  tests/owner-dashboard-contract.test.ts tests/components.owner-sheet.test.ts \
  tests/navigation-controls-contract.test.ts tests/owner-menu-contract.test.ts \
  tests/lib.owner-sheet-params.test.ts tests/components.owner-app-bar.test.ts
```

Verified at the end of Phase 3 (2026-10-01):
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel "deoptimised
  lib/sportsBingo.ts" note).
- `npm run test`: **2,889 passed, 13 skipped, 3 failed** (the 3 pre-existing failures above),
  269 files.
- `npm run build`: passes (exit 0), rerun after the `!` border fix. The compiled CSS contains
  `mix-blend-mode:multiply` and `.bg-ht-store-paper{background-color:var(--ht-store-paper)}`.
- Dark `OwnerSheet` snapshots are unchanged and pass.
- **Real browser (Chromium via Playwright, `next start`, stubbed owner APIs):** at 390×844 and
  1280×900, the store opens from `?sheet=store`. Picking a 250 pack plus 6 tents shows
  "2 items · Subtotal $84.00". Review order → URL `?sheet=store&step=review`. Browser Back →
  `?sheet=store` with the store still open. Back again → `/owner/dashboard` with no dialog.
  Loading `?sheet=store&step=review` with an empty cart lands on `?sheet=store`. No page errors.
  Screenshots looked right after the border fix.

**Not verified:** a real phone (iOS select wheel, the numeric keypad, safe areas, landscape,
dim/bright light), VoiceOver/TalkBack, reduced motion on a device, and a real signed-in partner
session. These belong on the Phase 4 device checklist.

### 7. Open questions for Andrew

Plan §8 Q1–Q4, unchanged; none block Phase 4. Q2 now has an obvious slot:
`MERCH_ORDER_CONTACT` in `lib/merchCatalog.ts`. Also consider asking him about trap 3 (the
fractional per-coaster unit price in the order draft) only if the code review can't settle it
on technical grounds. It's an internal data-shape question, not a business one.

### 8. Recommended first steps for Phase 4

1. Run the four checks to confirm the starting state matches §6.
2. `/code-review high` on the uncommitted Phase 1–3 files (the store-related paths listed in
   this handoff and the Phase 1/2 handoffs, **not** the unrelated pre-existing edits in
   `AGENTS.md`/`CLAUDE.md`/`SYSTEM_CONTEXT.md`/`docs/nfl-pickem-reward-phase3.md`). Look
   specifically at trap 3 and the `goBack("shop")` double-replace.
3. Write `docs/join-merch-store-device-checklist.md` (plan §5 Phase 4 item 2). Add: the iOS
   numeric keypad on the stepper field, typing 150 then tapping away → 100, the "In order"
   badge, Review starting at the top after scrolling the Shop, the Close button's visible border,
   and the disabled "Ordering opens soon" plus its hint read sensibly with VoiceOver.
4. Rewrite the CLAUDE.md "Join Merch Store" section (and SYSTEM_CONTEXT.md / AGENTS.md notes) as
   as-built, mentioning trap 1 (global form CSS needs `!` utilities on the light panel).
5. Commit (after asking about the unrelated pre-existing edits) with the attribution line from
   the session's instructions. Don't push or deploy.

Model/effort per the plan: **Opus 5.5, medium.**
