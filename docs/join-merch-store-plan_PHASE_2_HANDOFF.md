# Join Merch Store — Phase 2 Handoff

## For Andrew (plain English)

Phase 2 is finished, on your computer only: **nothing is committed, pushed or deployed.**

What changed:
- The Partner Dashboard menu has a new row, **Order Join Merch** ("QR coasters, tents & table
  cards"), directly below **Venue Display**.
- Tapping it closes the menu and slides up a **white** panel titled "Order Join Merch". For now it
  only says "Put a QR code on every table…" and has a "Store coming together" placeholder. The real
  shopping screens are Phase 3.
- The phone's Back button closes the panel, like Schedule and Rewards. The address
  `/owner/dashboard?sheet=store` opens the store directly, which is useful for a future
  "re-order your coasters" email.
- The dark panels (Partner Manual, Schedule, Rewards) look exactly as before. A test now
  enforces that.

Nothing costs money: no server calls, no database and no new requests.

Needs from you: nothing blocks Phase 3. Still open from the plan (§8): **Q1** (where the printed
QR code points; decide before anything is printed), **Q2** (a contact line for the "Ordering opens
soon" note), **Q3** (real product descriptions and sizes; the wording in `lib/merchCatalog.ts`
is placeholder) and **Q4** (one generic QR code or one per venue).

---

## For the next agent (Phase 3: the store UI, Shop + Review)

Read `docs/join-merch-store-plan.md` §3 (design), §4 (data model) and §5 Phase 3 first. Phase 1's
handoff (`docs/join-merch-store-plan_PHASE_1_HANDOFF.md`) covers the catalog and pricing library.
The plan specifies **Opus 5.5, effort high** for Phase 3.

### 1. Goal and scope

**Phase 3 goal:** replace the placeholder in `components/owner/store/MerchStoreSheet.tsx` with
the real Shop step (four product rows, coaster pack `<select>`, unit steppers, a sticky order
bar) and the Review step (line items, subtotal, "Shipping & tax — Calculated at checkout",
**Estimated total**, "Ships to: {venue name}", and `WizardFooter` with "Back to store" and a
**disabled** "Ordering opens soon"). The plan lists the files in §5 Phase 3: `MerchProductCard.tsx`,
`CoasterPackSelect.tsx`, `QuantityStepper.tsx`, `MerchOrderBar.tsx` and `MerchReviewStep.tsx`, all
in `components/owner/store/`.

**Out of scope:** any API route, database table, Stripe call, email, address field, a
`fetch(` call anywhere in `components/owner/store/` (a test enforces this), a feature flag, and the
`CLAUDE.md`/`SYSTEM_CONTEXT.md`/`AGENTS.md` as-built rewrite and commit (both Phase 4).

### 2. Starting state

- Branch `main`. Last commit is `75563ec10b743da4f739562cf837f30bc1d43938` ("Partner Dashboard
  Revamp"). **Nothing from this plan is committed.** Phases 1 and 2 are working-tree changes.
  The 4 PNGs and 4 WebPs under `public/store/` are **staged**; everything else is unstaged or
  untracked. No push, no deploy, no Vercel env change, no database change, no migration.
- Pre-existing uncommitted edits made by someone else before this plan started. Leave them alone
  and don't revert them: `AGENTS.md`, `CLAUDE.md`, `SYSTEM_CONTEXT.md` and
  `docs/nfl-pickem-reward-phase3.md`. `CLAUDE.md` already contains the "Join Merch Store (PLANNED)"
  section.
- Plan commits at the end of Phase 4. Never use `git checkout -- <file>` or `git stash` to undo
  something: there is a lot of uncommitted work from several phases and other people in this tree.

### 3. Decisions already made (don't re-ask)

Everything in plan §1 ("Decisions already made" and "Defaults chosen by the planner") still
applies. Phase 2 added these:

- **Cart state lives in `OwnerDashboardPage`** (`app/owner/dashboard/page.tsx`,
  `useState<MerchCart>({})`), **above** the `<DashboardBody key={selectedVenueId}>` remount. It is
  passed down as `merchCart` / `onMerchCartChange`. So the cart survives closing the store **and**
  switching venues; Review's "Ships to" follows the currently selected venue. A reload empties it,
  which is acceptable per plan §1. I chose page level over `DashboardBody` deliberately because
  putting it in `DashboardBody` would silently wipe the cart on a venue switch.
- **The store has no discard prompt.** `MerchStoreSheet` passes `onRequestClose={nav.closeSheet}`
  and no `closeGuard`. `tests/owner-dashboard-contract.test.ts` asserts it does **not** use
  `useDiscardGuard` or `closeGuard`. The existing DiscardGuard rule in that file names
  Schedule and Rewards explicitly; it was never an "every sheet" rule, so nothing needed an
  exemption beyond the new explicit assertion.
- **Light-tone palette** (in `OwnerSheet`'s `TONE.light`): panel `border-slate-200
  bg-ht-store-paper [color-scheme:light]`, grab handle `bg-slate-300`, hairlines
  `border-slate-200`, eyebrow `text-cyan-700` (≈5.3:1 on `#FEFEFE`, passes 4.5:1), title
  `ht-h2 !text-slate-900`, and a Close button `border-slate-300 bg-white shadow-sm
  hover:bg-slate-50` + `text-slate-700 hover:text-slate-900` (the `ExitBackButton tone="light"`
  look). The scrim stays dark `bg-slate-950/70`.
- **Store eyebrow/title/intro copy:** eyebrow "Hightop Challenge Store", title "Order Join Merch",
  intro "Put a QR code on every table. Guests scan it to join and start playing." (plan §3b).
- **Menu row data model:** the `OwnerMenuItem` union has three kinds: link rows (`href`), the
  Partner Manual (`id: "manual"`), and **dashboard-sheet rows** (`sheet: OwnerSheetId`;
  today only `{ id: "store", sheet: "store" }`). `OwnerAppBar` checks `item.sheet` first.

### 4. Files created or changed in Phase 2

| File | What |
|---|---|
| `components/owner/sheet/OwnerSheet.tsx` | New `tone?: "dark" \| "light"` prop (default `"dark"`) and exported type `OwnerSheetTone`. All tone-specific classes are in one `TONE` record; the dark strings are exactly the pre-Phase-2 literals, **in the same order** (the Close button's surface and text colour are split into `closeSurface`/`closeText` only so the dark class order stays identical). |
| `lib/ownerSheetParams.ts` | `OWNER_SHEET_IDS = ["schedule", "rewards", "store"]`. Nothing else changed. `OwnerSheetId` is used in `lib/useOwnerSheet.ts` only as a key type; nothing there needed an exhaustive update. |
| `components/owner/menu/ownerMenuItems.ts` | Union gains the dashboard-sheet kind. New row `{ id: "store", label: "Order Join Merch", hint: "QR coasters, tents & table cards", icon: ShoppingBag, sheet: "store" }`, second, after Venue Display. |
| `components/owner/OwnerAppBar.tsx` | `pendingSheet` ref (parallel to `pendingHref`). The row's `onClick` sets it and closes the drawer. The drawer's `onExited` then calls `openDashboardSheet(sheet, …)`: on `/owner/dashboard` it calls `pushSheet(window.history, window.location, sheet)` (native history, depth counter, **no** `router.push`). Defensive fallback: on any other path it `router.push("/owner/dashboard?sheet=store")` (no such page exists today, since only the dashboard renders the drawer). Reopening the menu mid-exit clears both pending refs. |
| `components/owner/menu/OwnerMenuDrawer.tsx` | Header comment only (row order, the sheet-row behaviour). |
| `components/owner/store/MerchStoreSheet.tsx` | **New.** Props `{ nav: UseOwnerSheetResult; venue: MerchVenueRef; cart: MerchCart; onCartChange: Dispatch<SetStateAction<MerchCart>> }`. Renders `<OwnerSheet tone="light" size="tall" eyebrow="Hightop Challenge Store" title="Order Join Merch" open={nav.sheet === "store"} onRequestClose={nav.closeSheet}>` with the intro and a dashed "Store coming together" placeholder. `venue`, `cart` and `onCartChange` are in the props type but **not yet destructured** (doing that would trip lint for unused vars). Phase 3 uses them. |
| `app/owner/dashboard/page.tsx` | Imports `MerchStoreSheet` and `MerchCart`. `DashboardBody` now takes `DashboardBodyProps` (adds `merchCart`, `onMerchCartChange`) and renders `<MerchStoreSheet nav={sheet} venue={{ id: venueId, name: venueName }} cart={merchCart} onCartChange={onMerchCartChange} />` after `<RewardsFlow>`, inside the existing `<Suspense>`. `OwnerDashboardPage` owns `merchCart`. |
| `docs/partner-dashboard-app-redesign-plan.md` | §4b row list now includes Order Join Merch (row 2) plus a line saying this plan supersedes the order and `ownerMenuItems.ts` is the source of truth. The historical Phase 2 line in that doc ("six items") was left as history. |
| `docs/join-merch-store-plan.md` | Status line only. |
| `tests/components.owner-sheet.test.ts` + **new** `tests/__snapshots__/components.owner-sheet.test.ts.snap` | New describe "OwnerSheet tones": 3 dark snapshots (tall+eyebrow+footer, tall no footer, card+eyebrow) **recorded before `tone` existed**, "`tone="dark"` equals no tone", and a light-tone assertion test. **Never update these snapshots with `-u`** unless a dark-tone change is intended and approved; they are the "dark is byte-for-byte unchanged" proof. |
| `tests/lib.owner-sheet-params.test.ts` | `store` accepted (`Store`/`merch` rejected); Shop → Review → Back → Back → closed; Close pops both; a `?sheet=store` deep link is normalised. |
| `tests/components.owner-app-bar.test.ts` | Store row: closes the drawer first, then the URL becomes `?venueId=v1&sheet=store` with `ownerSheetDepth: 1` and **no** `router.push`; reopening mid-exit abandons it; off-dashboard fallback pushes `/owner/dashboard?sheet=store`. |
| `tests/owner-menu-contract.test.ts` | Six rows, new order; hrefs (`null` for store and manual); the store is the only sheet row; `OwnerAppBar` uses `pushSheet(window.history, window.location, sheet)` and never `router.push(...sheet=...)`. |
| `tests/owner-dashboard-contract.test.ts` | `DashboardBody` regex loosened to `/<DashboardBody\s+key=\{selectedVenueId\}/` (the tag is now multi-line). Two new tests: the store is hosted inside the Suspense body with the cart above the venue key; the store is light, URL-driven, has **no** discard guard, and **no file under `components/owner/store/` contains `fetch(`**. |
| `tests/components.owner-merch-store.test.ts` | **New.** The plan's Phase 3 test file. It already holds 3 Phase-2 shell tests (closed unless `sheet === "store"`, light tall dialog named "Order Join Merch", Close calls `closeSheet` with no prompt) and a `fakeNav()` helper. Extend it in Phase 3; don't replace it. |

### 5. Facts and traps

- **`fetch(` tripwire includes comments.** The look-only test greps raw source text of every
  `.ts`/`.tsx` under `components/owner/store/`, comments included. I tripped it with a comment
  that said "no fetch()". Write "no network request" instead.
- **`.ht-h2` beats Tailwind colour utilities.** `.ht-h2` is unlayered CSS declared *after*
  `@tailwind utilities` in `app/globals.css` (Tailwind 3.4), so `text-slate-900` alone loses.
  The light title uses `!text-slate-900`. Any `ht-*` typography class used on the white panel in
  Phase 3 has the same issue. Prefer plain utilities (`text-slate-900 font-black`) there.
- **The root is `color-scheme: dark`.** The light panel sets `[color-scheme:light]` so the
  coaster `<select>`'s native popup/wheel and the number input render light. Phase 3 controls
  inside the panel inherit it. Don't remove it.
- **Tailwind default palette is available** (slate, cyan-700, etc. all compiled; verified in
  `.next/static/css/*.css` after build). `bg-ht-store-paper` compiles to
  `background-color: var(--ht-store-paper)` = `#fefefe`.
- **Step handling isn't wired yet.** `?sheet=store&step=review` currently opens the shell and
  ignores `step`. Phase 3 must: resolve the step (`resolveStep(nav.displayStepFor("store"),
  ["shop","review"])` or similar; note the Shop step is "no step", i.e. `null` in the URL), use
  `nav.displayStepFor("store")` (not `nav.step`) for rendered content so the sheet keeps its
  last screen while sliding down, and `replaceCurrentStep(null)` when Review is reached with an
  empty cart. See `components/owner/schedule/ScheduleGameFlow.tsx` lines ~115–160 for the
  existing pattern.
- **`NextButton` only supports native `disabled`** (`components/navigation/NextButton.tsx`).
  The plan asks for `aria-disabled` plus visible explanatory text on "Ordering opens soon". With
  native `disabled` the button drops out of the Tab order, and some screen readers skip it. The
  smallest option is `nextDisabled` plus a visible note (`WizardFooter`'s `hint` prop, or text
  above it). Changing `NextButton` touches a navigation primitive covered by
  `tests/navigation-controls-contract.test.ts`. If you do it, keep the change additive and run
  `npm run test`. Your call; record it.
- **`WizardFooter` already has `tone="light"` and `variant="inline"`.** Use both in the light
  sheet's `footer` slot. `StepBackButton`/`NextButton` may only be rendered by `WizardFooter`
  (tripwire).
- **`OwnerSheet` footer border in light tone is `border-slate-200`** (from `TONE.light.hairline`),
  so a `WizardFooter variant="inline"` sits on the paper with a slate rule above it.
- **`DashboardBody` remounts per venue.** `MerchStoreSheet` remounts with it, but the cart doesn't
  (it's page-level). Any store-local UI state such as a focused field is lost on a venue switch.
  That's fine because the sheet is modal, so a switch can't happen while it's open.
- **Pre-existing test failures (not ours):** 3 tests fail locally on a clean tree too:
  `tests/components.create-reward-wizard.test.ts` (1) and `tests/components.owner-rewards-flow.test.ts`
  (2). They expect "Which reward?" but get "Which game should the reward be tied to?", the
  `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` branch in the local env. Re-confirmed this phase. Don't
  chase them; report them.
- **`.env.local` is append-only and unreadable by policy.** A command that merely mentions it
  in a pipeline (e.g. `cut -d= -f1 .env.local`) can be denied by the permission layer when
  chained with other commands. Run it alone if you ever need key names. Phase 3 shouldn't need it.
- `sed -i ''` (macOS) is fine for small edits. Python heredoc replace-with-assert was used for
  multi-line edits.

### 6. Build, run and test

Exact commands (run typecheck and build **sequentially**, never concurrently, because
`.next/types` is regenerated):

```
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Targeted:
```
npx vitest run tests/components.owner-sheet.test.ts tests/lib.owner-sheet-params.test.ts \
  tests/components.owner-app-bar.test.ts tests/owner-menu-contract.test.ts \
  tests/owner-dashboard-contract.test.ts tests/components.owner-merch-store.test.ts
```

Verified at the end of Phase 2 (2026-10-01):
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel "deoptimised
  lib/sportsBingo.ts" note).
- `npm run test`: **2,866 passed, 13 skipped, 3 failed**. The 3 failures are the pre-existing
  reward-wizard ones above. 269 files.
- `npm run build`: passes.
- Dark `OwnerSheet` markup is byte-identical to before (snapshots recorded pre-change).

**Not verified:** the white panel was **not** looked at in a real browser or on a phone. The
`/owner/*` routes need an owner session cookie. Coverage is jsdom render tests plus a check that
the classes compiled. The visual "white matches the photos" check needs the Phase 3 photos and
belongs on the Phase 4 device checklist. If you want a browser look in Phase 3, `npm run dev`
and sign in as a partner, then open the menu → Order Join Merch.

### 7. Open questions for Andrew

Plan §8 Q1–Q4, unchanged; none block Phase 3. For the Review note, Q2 (contact line) is still
open. Use a neutral placeholder ("Online ordering is coming soon.") and leave the contact
line as a single obvious constant/copy entry, ideally in `lib/merchCatalog.ts`, for Andrew to fill.

### 8. Recommended first steps for Phase 3

1. Read `components/owner/store/MerchStoreSheet.tsx`, `lib/merchCatalog.ts`, `lib/merchPricing.ts`,
   `components/owner/sheet/SlideSteps.tsx`, `components/navigation/WizardFooter.tsx`, and
   `components/owner/schedule/ScheduleGameFlow.tsx` (the step/`displayStepFor` pattern).
2. Destructure `venue`, `cart` and `onCartChange` in `MerchStoreSheet`. Build the Shop step
   from `MERCH_CATALOG` (one `MerchProductCard` per product; `pricing.kind === "pack"` →
   `CoasterPackSelect`, `"unit"` → `QuantityStepper` clamped with `clampUnitQuantity`). Use plain
   `<img>` with `width`/`height`/`loading="lazy"`, `mix-blend-multiply`, no card fill or border
   behind photos, `src` = the WebP in the catalog.
3. Footer: on Shop, `MerchOrderBar` (count = `cartSummary().lineCount`, subtotal, "Review order"
   disabled when empty, "Choose a quantity to start an order" when empty). On Review,
   `WizardFooter tone="light" variant="inline"` with "Back to store" (`nav.goBack(...)`) and the
   disabled "Ordering opens soon".
4. Review renders from `buildMerchOrderDraft(cart, venue)`. Never use prices from UI state.
5. Extend `tests/components.owner-merch-store.test.ts` per plan §5 Phase 3 item 4, run the four
   checks, then write `docs/join-merch-store-plan_PHASE_3_HANDOFF.md` and update the plan status
   line.

Model/effort per the plan: **Opus 5.5, high.**
